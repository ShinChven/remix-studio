import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  fetchAssistantConversations,
  searchAssistantConversations,
  updateAssistantConversation,
  type AssistantConversation,
} from '../../../api';
import { Button, Dialog, Icon, IconButton, LoadingIndicator, Text } from '../../../m3';
import { SearchField } from '../../ui/SearchField';
import { useToast } from '../../ui/useToast';

function formatRelativeTime(ts: number, locale: string): string {
  const diffMs = ts - Date.now();
  const absSec = Math.round(Math.abs(diffMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), 'second');
  const absMin = Math.round(absSec / 60);
  if (absMin < 60) return rtf.format(Math.round(diffMs / 60_000), 'minute');
  const absHr = Math.round(absMin / 60);
  if (absHr < 24) return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  const absDay = Math.round(absHr / 24);
  if (absDay < 30) return rtf.format(Math.round(diffMs / 86_400_000), 'day');
  return new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export interface ChatHistoryDialogProps {
  open: boolean;
  activeConversationId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onRequestDelete: (conversationId: string) => void;
  onConversationRenamed?: (conversationId: string, title: string) => void;
}

/**
 * Lightweight Quick History Search Dialog opened from the chat header.
 * Empty query lists the 20 most recent conversations; typing runs debounced
 * title + message content search. Keyboard navigable with ↑/↓/Enter/Esc.
 */
export function ChatHistoryDialog({
  open,
  activeConversationId,
  onClose,
  onNewChat,
  onRequestDelete,
  onConversationRenamed,
}: ChatHistoryDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AssistantConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const requestSeqRef = useRef(0);

  const loadItems = useCallback(async (q: string) => {
    const reqId = ++requestSeqRef.current;
    setLoading(true);
    try {
      const trimmed = q.trim();
      if (!trimmed) {
        const res = await fetchAssistantConversations(undefined, 20);
        if (reqId !== requestSeqRef.current) return;
        setItems(res.conversations);
      } else {
        const res = await searchAssistantConversations(trimmed, 1, 15);
        if (reqId !== requestSeqRef.current) return;
        setItems(res.items);
      }
      setSelectedIndex(0);
    } catch {
      if (reqId === requestSeqRef.current) setItems([]);
    } finally {
      if (reqId === requestSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setEditingId(null);
      return;
    }
    const trimmed = query.trim();
    const delay = trimmed ? 220 : 0;
    const timer = window.setTimeout(() => {
      void loadItems(query);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open, query, loadItems]);

  const openConversation = useCallback((id: string) => {
    onClose();
    if (id !== activeConversationId) {
      navigate(`/assistant/${id}`);
    }
  }, [activeConversationId, navigate, onClose]);

  const handleRenameSubmit = async (id: string) => {
    const title = editingValue.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await updateAssistantConversation(id, { title });
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      onConversationRenamed?.(id, title);
    } catch {
      toast.error(t('v2.assistant.renameFailed', 'Failed to rename conversation'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (editingId) return;
    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault();
      openConversation(items[selectedIndex].id);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="history"
      headline={t('v2.assistant.searchHistory', 'Search chat history')}
      maxWidth={560}
      actions={
        <div className="v2-history-dialog__footer">
          <Button
            variant="tonal"
            size="sm"
            icon="add"
            onClick={() => {
              onClose();
              onNewChat();
            }}
          >
            {t('assistant.newChat', 'New chat')}
          </Button>
          <Button
            variant="text"
            size="sm"
            trailingIcon="arrow_forward"
            onClick={() => {
              onClose();
              navigate('/assistant/history');
            }}
          >
            {t('v2.assistant.openFullHistory', 'Open full history')}
          </Button>
        </div>
      }
    >
      <div className="v2-history-dialog" onKeyDown={handleKeyDown}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t('v2.assistant.searchHistoryPlaceholder', 'Search titles and messages…')}
          autoFocus
        />

        <div className="v2-history-dialog__list" role="listbox" aria-label={t('assistant.conversations', 'Conversations')}>
          {loading && items.length === 0 ? (
            <div className="v2-center-pad">
              <LoadingIndicator size={32} aria-label={t('projectViewer.common.loading', 'Loading')} />
            </div>
          ) : items.length === 0 ? (
            <Text variant="body-small" className="v2-history-dialog__empty text-on-surface-variant">
              {query.trim()
                ? t('v2.assistant.noSearchResults', 'No matching conversations.')
                : t('assistant.noConversations', 'No conversations yet.')}
            </Text>
          ) : (
            items.map((conv, index) => {
              const active = conv.id === activeConversationId;
              const selected = index === selectedIndex;
              return (
                <div
                  key={conv.id}
                  role="option"
                  aria-selected={selected}
                  className="v2-chat-conv v2-history-dialog__row"
                  data-active={active ? '' : undefined}
                  data-selected={selected ? '' : undefined}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => openConversation(conv.id)}
                >
                  <Icon name={active ? 'chat_bubble' : 'chat_bubble_outline'} size={18} />
                  {editingId === conv.id ? (
                    <input
                      autoFocus
                      className="v2-chat-conv__input"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => void handleRenameSubmit(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameSubmit(conv.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="v2-history-dialog__main">
                      <span className="v2-chat-conv__title" title={conv.title}>{conv.title}</span>
                      <span className="v2-history-dialog__time">{formatRelativeTime(conv.updatedAt, i18n.language)}</span>
                    </div>
                  )}
                  <span className="v2-chat-conv__actions" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      size="xs"
                      icon="edit"
                      label={t('assistant.renameConversation', 'Rename')}
                      onClick={() => {
                        setEditingId(conv.id);
                        setEditingValue(conv.title);
                      }}
                    />
                    <IconButton
                      size="xs"
                      icon="delete"
                      label={t('assistant.deleteConversation', 'Delete conversation')}
                      onClick={() => {
                        onClose();
                        onRequestDelete(conv.id);
                      }}
                    />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}

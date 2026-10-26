import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { searchAssistantConversations, type AssistantConversation } from '../../api';
import { Icon, Text } from '../../m3';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { Row, RowList } from '../ui/Rows';
import { SearchField } from '../ui/SearchField';

const PAGE_SIZE = 20;

/** Searches past assistant conversations by title and message content. */
export function ChatHistory() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const [items, setItems] = useState<AssistantConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState(q);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchAssistantConversations(q, page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setPages(result.pages);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setItems([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  const submit = (value: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const trimmed = value.trim();
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      next.set('page', '1');
      return next;
    });

  return (
    <Page width="default">
      <PageHeader
        title={t('chatHistory.title', { defaultValue: 'Chat History' })}
        description={t('chatHistory.description', { defaultValue: 'Search across conversation titles and message content.' })}
        backLink={{ to: '/assistant', label: t('chatHistory.backToAssistant', { defaultValue: 'Back to Assistant' }) }}
      />
      <div className="flex flex-col gap-3">
        <SearchField value={input} onChange={setInput} onSubmit={submit} placeholder={t('chatHistory.searchPlaceholder', { defaultValue: 'Search by title or message content...' })} className="v2-search-field--block" />
        <Text variant="label-medium" className="text-on-surface-variant">
          {q ? t('chatHistory.resultsCount', { defaultValue: '{{total}} result(s) for "{{q}}"', total, q }) : t('chatHistory.totalCount', { defaultValue: '{{total}} conversation(s)', total })}
        </Text>
        {loading ? (
          <LoadingState minHeight={240} />
        ) : items.length === 0 ? (
          <EmptyState icon="forum" shape="clover-4" title={q ? t('chatHistory.noResults', { defaultValue: 'No conversations match your search.' }) : t('chatHistory.empty', { defaultValue: 'No conversations yet.' })} />
        ) : (
          <RowList>
            {items.map((conv) => (
              <Row key={conv.id} to={`/assistant/${conv.id}`} lead={<Icon name="chat" className="text-primary" />} title={conv.title || t('chatHistory.untitled', { defaultValue: 'Untitled chat' })} meta={<span className="tabular-nums">{new Date(conv.updatedAt).toLocaleString()}</span>} />
            ))}
          </RowList>
        )}
        {pages > 1 && (
          <div className="v2-paged-footer">
            <Text variant="label-medium" className="text-on-surface-variant">
              {t('chatHistory.pagination', { defaultValue: 'Page {{current}} of {{total}}', current: page, total: pages })}
            </Text>
            <Pagination
              page={page}
              pages={pages}
              onPageChange={(next) =>
                setSearchParams((prev) => {
                  const p = new URLSearchParams(prev);
                  p.set('page', String(next));
                  return p;
                })
              }
            />
          </div>
        )}
      </div>
    </Page>
  );
}

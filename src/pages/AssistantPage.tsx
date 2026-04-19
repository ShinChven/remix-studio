import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Send, Square, Trash2, MessageCircle, Check, X, ChevronRight, Loader2, PanelRightClose, PanelRightOpen, Wrench, AlertTriangle, Bot, User as UserIcon, FolderOpen, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  fetchAssistantConversations,
  createAssistantConversation,
  fetchAssistantConversation,
  updateAssistantConversation,
  deleteAssistantConversation,
  sendAssistantMessage,
  confirmAssistantTool,
  fetchAssistantProviders,
  AssistantConversation,
  AssistantMessage,
  AssistantPendingConfirmation,
} from '../api';
import type { Provider, ProviderType, ModelConfig } from '../types';
import { PROVIDER_MODELS_MAP, getTextModelsForProvider } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { JsonView } from '../components/JsonView';

const MaterialSpinner = ({ className }: { className?: string }) => (
  <svg className={`animate-material-spinner ${className}`} viewBox="0 0 50 50">
    <circle
      className="animate-material-dash"
      cx="25"
      cy="25"
      r="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
    />
  </svg>
);

function formatToolTitle(toolName: string | null | undefined) {
  const raw = String(toolName || 'tool');
  return raw
    .split(/[_-]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function unwrapToolResult(content: string | null | undefined) {
  if (!content) return '';
  const match = content.match(/<tool_result\b[^>]*>([\s\S]*?)<\/tool_result>/i);
  return (match?.[1] ?? content).trim();
}

function parseAssistantContent(content: string | null | undefined) {
  if (!content) {
    return {
      thoughtContent: null,
      responseContent: null,
    };
  }

  let thoughtParts: string[] = [];
  let cleanResponse = content;

  // 1. Extract closed <think>...</think> blocks
  const thinkClosedRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  while ((match = thinkClosedRegex.exec(content)) !== null) {
    thoughtParts.push(match[1].trim());
  }
  cleanResponse = cleanResponse.replace(thinkClosedRegex, '');

  // 2. Extract unclosed <think> block (happens during streaming or incomplete response)
  const unclosedThinkRegex = /<think>([\s\S]*)$/i;
  const unclosedMatch = cleanResponse.match(unclosedThinkRegex);
  if (unclosedMatch) {
    thoughtParts.push(unclosedMatch[1].trim());
    cleanResponse = cleanResponse.replace(unclosedThinkRegex, '');
  }

  // 3. Clean up stray tags and normalize whitespace
  let thoughtContent = thoughtParts.length > 0 
    ? thoughtParts.join('\n\n').replace(/<\/?think>/gi, '').replace(/\n{3,}/g, '\n\n').trim() 
    : null;

  cleanResponse = cleanResponse.replace(/<\/?think>/gi, '').trim() || null;

  return {
    thoughtContent: thoughtContent || null,
    responseContent: cleanResponse,
  };
}

function prettyToolData(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type AssistantMutationTarget = {
  entityType: 'library' | 'project';
  id: string;
  name: string | null;
  href: string;
  summary: string;
};

function getToolResultPayload(message: AssistantMessage) {
  if (message.toolResultJson && typeof message.toolResultJson === 'object') {
    return message.toolResultJson as Record<string, unknown>;
  }

  const raw = unwrapToolResult(message.content);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function getStringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function extractMutationTarget(
  toolName: string | null | undefined,
  toolArgsJson: unknown,
  toolResultJson: unknown,
): AssistantMutationTarget | null {
  const args = toolArgsJson && typeof toolArgsJson === 'object'
    ? toolArgsJson as Record<string, unknown>
    : null;
  const result = toolResultJson && typeof toolResultJson === 'object'
    ? toolResultJson as Record<string, unknown>
    : null;
  const normalizedToolName = String(toolName || '');

  const projectId = getStringField(result, 'projectId') ?? getStringField(args, 'projectId');
  if (projectId) {
    const name = getStringField(result, 'name') ?? getStringField(args, 'name');
    return {
      entityType: 'project',
      id: projectId,
      name,
      href: `/project/${projectId}`,
      summary: name ? `Project "${name}" is ready.` : 'Project is ready.',
    };
  }

  const libraryId = getStringField(result, 'library_id')
    ?? getStringField(result, 'libraryId')
    ?? getStringField(args, 'library_id')
    ?? getStringField(args, 'libraryId');
  const libraryName = getStringField(result, 'name') ?? getStringField(args, 'name');

  if (normalizedToolName === 'create_library' && getStringField(result, 'id')) {
    const id = getStringField(result, 'id')!;
    return {
      entityType: 'library',
      id,
      name: libraryName,
      href: `/library/${id}`,
      summary: libraryName ? `Library "${libraryName}" is ready.` : 'Library is ready.',
    };
  }

  if (libraryId && ['create_prompt', 'batch_create_prompts'].includes(normalizedToolName)) {
    return {
      entityType: 'library',
      id: libraryId,
      name: libraryName,
      href: `/library/${libraryId}`,
      summary: libraryName ? `Library "${libraryName}" was updated.` : 'Library was updated.',
    };
  }

  if (libraryId && normalizedToolName.includes('library')) {
    return {
      entityType: 'library',
      id: libraryId,
      name: libraryName,
      href: `/library/${libraryId}`,
      summary: libraryName ? `Library "${libraryName}" is ready.` : 'Library is ready.',
    };
  }

  return null;
}

function summarizePendingConfirmation(
  pendingConfirmation: AssistantPendingConfirmation | null,
) {
  if (!pendingConfirmation) return '';
  const args = pendingConfirmation.toolArgsJson && typeof pendingConfirmation.toolArgsJson === 'object'
    ? pendingConfirmation.toolArgsJson as Record<string, unknown>
    : {};

  switch (pendingConfirmation.toolName) {
    case 'create_library':
      return `Create a text library named "${String(args.name ?? '')}".`;
    case 'create_prompt':
      return `Create one prompt in library "${String(args.library_id ?? '')}".`;
    case 'batch_create_prompts': {
      const count = Array.isArray(args.items) ? args.items.length : 0;
      return `Create ${count} prompt${count === 1 ? '' : 's'} in library "${String(args.library_id ?? '')}".`;
    }
    case 'create_project_with_workflow': {
      const workflowCount = Array.isArray(args.workflowItems) ? args.workflowItems.length : 0;
      return `Create a ${String(args.type ?? 'new')} project named "${String(args.name ?? '')}" with ${workflowCount} workflow item${workflowCount === 1 ? '' : 's'}.`;
    }
    default:
      return `Apply ${pendingConfirmation.toolName}.`;
  }
}



export function AssistantPage() {
  const { t } = useTranslation();
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // ─── State ───
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const activeConversationId = routeId || null;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<AssistantPendingConfirmation | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => localStorage.getItem('assistant_last_provider') || '');
  const [selectedModelId, setSelectedModelId] = useState<string>(() => localStorage.getItem('assistant_last_model') || '');

  useEffect(() => {
    if (selectedProviderId) localStorage.setItem('assistant_last_provider', selectedProviderId);
  }, [selectedProviderId]);

  useEffect(() => {
    if (selectedModelId) localStorage.setItem('assistant_last_model', selectedModelId);
  }, [selectedModelId]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentThinkingTitle, setCurrentThinkingTitle] = useState('');
  const [currentToolTitle, setCurrentToolTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(() => {
    const saved = localStorage.getItem('assistant-right-panel-open');
    if (window.innerWidth < 1024) return false;
    return saved !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('assistant-right-panel-open', String(rightPanelOpen));
  }, [rightPanelOpen]);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const justCreatedIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load providers ───
  useEffect(() => {
    fetchAssistantProviders()
      .then((data) => setProviders(data.providers))
      .catch(() => {});
  }, []);

  // ─── Load conversations ───
  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchAssistantConversations();
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      // silent
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const initializedRef = useRef(false);

  // ─── Load conversation messages ───
  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await fetchAssistantConversation(id);
      setMessages(data.messages);
      // Restore provider/model selection
      if (data.conversation.providerId) setSelectedProviderId(data.conversation.providerId);
      if (data.conversation.modelConfigId) setSelectedModelId(data.conversation.modelConfigId);
      // Check for pending confirmation in last assistant message
      const lastAssistant = [...data.messages].reverse().find(
        (m) => m.role === 'assistant' && m.status === 'awaiting_confirmation',
      );
      if (lastAssistant) {
        setPendingConfirmation(null);
      } else {
        setPendingConfirmation(null);
      }
    } catch {
      toast.error('Failed to load conversation');
    }
  }, []);

  // Handle initial message from dashboard
  const handledInitialRef = useRef(false);
  useEffect(() => {
    if (handledInitialRef.current) return;
    const state = location.state as { initialMessage?: string; providerId?: string; modelId?: string } | null;
    if (state?.initialMessage) {
      handledInitialRef.current = true;
      initializedRef.current = true; // Mark as initialized to prevent auto-select from running
      const { initialMessage, providerId, modelId } = state;
      if (providerId) setSelectedProviderId(providerId);
      if (modelId) setSelectedModelId(modelId);
      handleSend(initialMessage, providerId, modelId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  useEffect(() => {
    // If we're coming from dashboard with an initial message, definitely don't auto-jump
    const state = location.state as { initialMessage?: string } | null;
    if (state?.initialMessage) {
      initializedRef.current = true;
      return;
    }

    if (!initializedRef.current && conversations.length > 0) {
      initializedRef.current = true;
      const lastId = localStorage.getItem('assistant_last_conversation');
      const targetId = conversations.find((c) => c.id === lastId)?.id;
      if (targetId && !activeConversationId) {
        navigate(`/assistant/${targetId}`, { replace: true });
      }
    }
  }, [conversations, activeConversationId, navigate, location.state]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('assistant_last_conversation', activeConversationId);
      if (justCreatedIdRef.current === activeConversationId) {
        // Skip initial load for brand new conversation to avoid race with optimistic message
        justCreatedIdRef.current = null;
        return;
      }
      loadConversation(activeConversationId);
    } else {
      setMessages([]);
      setPendingConfirmation(null);
    }
  }, [activeConversationId, loadConversation]);

  // ─── Auto-scroll ───
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // ─── Auto-resize textarea ───
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  // ─── Available text models for the selected provider ───
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const availableModels = selectedProvider
    ? getTextModelsForProvider(selectedProvider.type)
    : [];

  // ─── New conversation (handled implicitly in send) ───
  const handleNewConversationClick = () => {
    navigate('/assistant');
  };

  // ─── Send message ───
  const handleSend = async (manualText?: string, manualProviderId?: string, manualModelId?: string) => {
    const text = (manualText ?? inputText).trim();
    if (!text || isSending) return;

    const pId = manualProviderId ?? selectedProviderId;
    const mId = manualModelId ?? selectedModelId;

    if (!activeConversationId) {
      if (!pId || !mId) {
        toast.error(t('assistant.noProvider'));
        return;
      }
    }

    if (!manualText) {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }

    setIsSending(true);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');

    let currentConversationId = activeConversationId;

    if (!currentConversationId) {
      try {
        const newConv = await createAssistantConversation({
          providerId: pId!,
          modelConfigId: mId!,
        });
        setConversations((prev) => [newConv.conversation, ...prev]);
        currentConversationId = newConv.conversation.id;
        justCreatedIdRef.current = currentConversationId;
        navigate(`/assistant/${currentConversationId}`, { replace: true });
        setPendingConfirmation(null);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to create conversation');
        setIsSending(false);
        return;
      }
    }

    // Optimistically add user message
    const optimisticUserMsg: AssistantMessage = {
      id: `temp-${Date.now()}`,
      conversationId: currentConversationId,
      role: 'user',
      content: text,
      toolCalls: null,
      toolCallId: null,
      toolName: null,
      toolArgsJson: null,
      toolResultJson: null,
      status: null,
      stopReason: null,
      inputTokens: null,
      outputTokens: null,
      errorText: null,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const result = await sendAssistantMessage(currentConversationId, text, (event) => {
        if (event.type === 'provider_thinking' && typeof event.title === 'string') {
          setCurrentThinkingTitle(event.title);
          setCurrentToolTitle('');
        }
        if (
          event.type === 'tool_call_started' ||
          event.type === 'tool_call_finished' ||
          event.type === 'confirmation_required'
        ) {
          setCurrentToolTitle(formatToolTitle((event as any).call?.name));
        }
      });
      // Reload full message list for consistency
      const data = await fetchAssistantConversation(currentConversationId);
      setMessages(data.messages);

      if (result.kind === 'awaiting_confirmation' && 'confirmation' in result) {
        setPendingConfirmation(result.confirmation);
      }

      // Auto-title: if this was the first user message, update title
      if (!activeConversationId || conversations.find((c) => c.id === currentConversationId)?.title === 'New chat') {
        const title = text.length > 50 ? text.slice(0, 47) + '...' : text;
        try {
          await updateAssistantConversation(currentConversationId, { title });
          setConversations((prev) =>
            prev.map((c) => (c.id === currentConversationId ? { ...c, title } : c)),
          );
        } catch {
          // non-critical
        }
      }

      // Bump conversation to top
      loadConversations();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send message');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
    } finally {
      setIsSending(false);
      setCurrentThinkingTitle('');
      setCurrentToolTitle('');
    }
  };

  // ─── Confirmation handling ───
  const handleConfirmation = async (decision: 'confirm' | 'confirm_tool' | 'cancel') => {
    if (!activeConversationId || !pendingConfirmation) return;
    setIsSending(true);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');
    try {
      const result = await confirmAssistantTool(
        activeConversationId,
        pendingConfirmation.id,
        decision,
        (event) => {
          if (event.type === 'provider_thinking' && typeof event.title === 'string') {
            setCurrentThinkingTitle(event.title);
            setCurrentToolTitle('');
          }
          if (
            event.type === 'tool_call_started' ||
            event.type === 'tool_call_finished' ||
            event.type === 'confirmation_required'
          ) {
            setCurrentToolTitle(formatToolTitle((event as any).call?.name));
          }
        },
      );
      setPendingConfirmation(null);
      const data = await fetchAssistantConversation(activeConversationId);
      setMessages(data.messages);

      if (result.kind === 'awaiting_confirmation' && 'confirmation' in result) {
        setPendingConfirmation(result.confirmation);
      }
      if (decision === 'confirm_tool') {
        toast.success(
          t('assistant.toolApprovalEnabled', {
            defaultValue: 'Future {{tool}} actions in this conversation will auto-approve for this session.',
            tool: formatToolTitle(pendingConfirmation?.toolName),
          }),
        );
      }
      loadConversations();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to process confirmation');
    } finally {
      setIsSending(false);
      setCurrentThinkingTitle('');
      setCurrentToolTitle('');
    }
  };

  // ─── Delete conversation ───
  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteAssistantConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        navigate('/assistant');
        setMessages([]);
        setPendingConfirmation(null);
      }
      toast.success('Conversation deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete conversation');
    }
    setDeleteTarget(null);
  };

  // ─── Rename conversation ───
  const handleRenameSubmit = async (id: string) => {
    const title = editingTitleValue.trim();
    if (!title) return;
    try {
      await updateAssistantConversation(id, { title });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
    } catch {
      toast.error('Failed to rename');
    }
    setEditingTitle(null);
  };

  // ─── Key handler ───
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderComposer = () => (
    <div className="w-full relative group">
      {/* Glassmorphic Container with depth */}
      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-1000 group-focus-within:duration-200"></div>

      <div className="relative bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl border border-neutral-200/50 dark:border-white/10 rounded-2xl shadow-2xl p-4 transition-all duration-300 group-focus-within:shadow-indigo-500/10">
        <div className="space-y-4">
          {/* Model Selector */}
          <div className="flex items-center gap-2 px-1">
            <Bot className="w-4 h-4 text-indigo-500" />
            <select
              value={selectedProviderId && selectedModelId ? `${selectedProviderId}::${selectedModelId}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedProviderId('');
                  setSelectedModelId('');
                  return;
                }
                const [pId, mId] = val.split('::');
                setSelectedProviderId(pId);
                setSelectedModelId(mId);
              }}
              className="text-xs bg-transparent border-none text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 outline-none cursor-pointer p-0 appearance-none font-medium transition-colors"
            >
              <option value="">{t('assistant.selectModel', 'Select a model')}</option>
              {providers.map((p) => {
                const models = getTextModelsForProvider(p.type);
                if (models.length === 0) return null;
                return (
                  <optgroup key={p.id} label={p.name}>
                    {models.map((m) => (
                      <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Input Area */}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('assistant.typePlaceholder')}
              rows={1}
              disabled={isSending}
              className="flex-1 resize-none bg-transparent border-none outline-none text-base text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 max-h-[200px] py-1 custom-scrollbar"
            />
            {isSending ? (
              <button
                className="flex-shrink-0 p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-600/20 transition-all active:scale-95 group/btn"
                title={t('assistant.stop')}
              >
                <Square className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!inputText.trim()}
                className="flex-shrink-0 p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed group/btn"
                title={t('assistant.send')}
              >
                <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Render helpers ───
  const renderAssistantToolCalls = (msg: AssistantMessage) => {
    if (!msg.toolCalls || msg.toolCalls.length === 0) return null;

    const hasAssistantContent = hasRenderableAssistantContent(msg);

    return (
      <div className={`${hasAssistantContent ? 'mt-3' : ''} space-y-2`}>
        {msg.toolCalls.map((tc) => {
          const toolMessage = messages.find((entry) => entry.role === 'tool' && entry.toolCallId === tc.id);
          if (!toolMessage) return null;

          const isError = toolMessage.status === 'error';
          const toolTitle = formatToolTitle(tc.name);
          const argsText = prettyToolData(toolMessage.toolArgsJson);
          const toolResultPayload = getToolResultPayload(toolMessage);
          const resultText = toolMessage.toolResultJson != null
            ? prettyToolData(toolMessage.toolResultJson)
            : prettyToolData(unwrapToolResult(toolMessage.content));
          const target = !isError && toolMessage.status !== 'cancelled'
            ? extractMutationTarget(tc.name, toolMessage.toolArgsJson, toolResultPayload)
            : null;

          return (
            <div key={tc.id} className="space-y-2">
              <details
                className={`group border rounded-xl overflow-hidden transition-all duration-300 ${
                  isError
                    ? 'border-red-200/70 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/10'
                    : 'border-neutral-200/50 dark:border-white/10 bg-neutral-50/50 dark:bg-black/20'
                }`}
              >
                <summary className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none text-xs font-bold transition-colors ${
                  isError
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-900/20'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-white/5'
                }`}>
                  <span className="group-open:rotate-90 transition-transform duration-200">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                  <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="group-open:bg-clip-text group-open:text-transparent group-open:bg-gradient-to-r group-open:from-indigo-500 group-open:via-purple-500 group-open:to-indigo-500 group-open:animate-text-gradient group-open:bg-[size:200%_auto]">
                      {toolTitle}
                    </span>
                  </div>
                </summary>
                <div className="border-t border-neutral-200/50 dark:border-white/5 bg-white/30 dark:bg-black/30 backdrop-blur-sm">
                  {argsText && (
                    <div className="px-4 pt-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        {t('assistant.toolArguments', 'Arguments')}
                      </p>
                      <JsonView data={toolMessage.toolArgsJson} />
                    </div>
                  )}
                  {resultText && (
                    <div className="px-4 py-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        {t('assistant.toolResult', 'Result')}
                      </p>
                      <JsonView data={toolMessage.toolResultJson != null ? toolMessage.toolResultJson : unwrapToolResult(toolMessage.content)} />
                    </div>
                  )}
                </div>
              </details>
              {target && (
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                      {target.entityType === 'project' ? (
                        <Sparkles className="w-4 h-4" />
                      ) : (
                        <FolderOpen className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700/80 dark:text-emerald-300/80">
                        {target.entityType === 'project'
                          ? t('assistant.targetProject', 'Project target')
                          : t('assistant.targetLibrary', 'Library target')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
                        {target.name || target.id}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                        {target.summary}
                      </p>
                      <Link
                        to={target.href}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                      >
                        {t(
                          target.entityType === 'project' ? 'assistant.openProject' : 'assistant.openLibrary',
                          target.entityType === 'project' ? 'Open project' : 'Open library',
                        )}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderConfirmationCard = () => {
    if (!pendingConfirmation) return null;
    const proposalSummary = summarizePendingConfirmation(pendingConfirmation);
    return (
      <div className="mx-auto max-w-2xl mb-4">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
              {t('assistant.confirmAction')}
            </span>
          </div>
          {proposalSummary && (
            <div className="bg-white/70 dark:bg-black/20 rounded-lg border border-amber-200/80 dark:border-amber-800/40 px-3 py-2.5 mb-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {t('assistant.proposedChange', 'Proposed change')}
              </p>
              <p className="text-sm text-neutral-800 dark:text-neutral-200">{proposalSummary}</p>
            </div>
          )}
          {pendingConfirmation.toolArgsJson && (
            <div className="bg-amber-100 dark:bg-amber-900/30 rounded p-2 mb-3 max-h-48 overflow-y-auto">
              <JsonView data={pendingConfirmation.toolArgsJson} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleConfirmation('confirm')}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {t('assistant.confirm')}
            </button>
            <button
              onClick={() => handleConfirmation('confirm_tool')}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {t('assistant.confirmTool', 'Approve this tool in this session')}
            </button>
            <button
              onClick={() => handleConfirmation('cancel')}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              {t('assistant.cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMessageContent = (content: string | null | undefined) => {
    const { thoughtContent, responseContent } = parseAssistantContent(content);

    if (thoughtContent) {
      return (
        <div className="space-y-3">
          <details className="group border border-neutral-200/50 dark:border-white/10 rounded-xl overflow-hidden bg-neutral-50/50 dark:bg-black/20 transition-all duration-300">
            <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors">
              <span className="group-open:rotate-90 transition-transform duration-200"><ChevronRight className="w-3.5 h-3.5" /></span>
              <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                <span className="group-open:bg-clip-text group-open:text-transparent group-open:bg-gradient-to-r group-open:from-indigo-500 group-open:via-purple-500 group-open:to-indigo-500 group-open:animate-text-gradient group-open:bg-[size:200%_auto]">
                  {t('assistant.thoughtProcess', 'Thought process')}
                </span>
              </div>
            </summary>
            <div className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400 border-t border-neutral-200/50 dark:border-white/5 whitespace-pre-wrap font-mono leading-relaxed bg-white/30 dark:bg-black/30 backdrop-blur-sm">
              {thoughtContent}
            </div>
          </details>
          {responseContent && (
            <div className="markdown-content text-neutral-800 dark:text-neutral-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{responseContent}</ReactMarkdown>
            </div>
          )}
        </div>
      );
    }

    if (!responseContent) return null;

    return (
      <div className="markdown-content text-neutral-800 dark:text-neutral-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{responseContent}</ReactMarkdown>
      </div>
    );
  };

  const hasRenderableAssistantBubble = (msg: AssistantMessage) => {
    if (msg.role !== 'assistant') return false;
    const { thoughtContent, responseContent } = parseAssistantContent(msg.content);
    if (responseContent) return true;
    if (!thoughtContent && msg.content && msg.content.trim().length > 0) return true;
    return false;
  };

  const hasRenderableAssistantContent = (msg: AssistantMessage) => {
    if (msg.role !== 'assistant') return false;
    const { thoughtContent, responseContent } = parseAssistantContent(msg.content);
    if (thoughtContent || responseContent) return true;
    if (msg.content && msg.content.trim().length > 0) return true;
    return false;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Center: Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Desktop */}
        <div className="hidden lg:block flex-shrink-0 px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/30 dark:bg-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white truncate">
                {activeConversationId
                  ? conversations.find((c) => c.id === activeConversationId)?.title || t('assistant.title')
                  : t('assistant.title')}
              </h1>
            </div>
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors flex-shrink-0"
              title={t('assistant.conversations')}
            >
              {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Header Portals */}
        {document.getElementById('mobile-header-assistant-title') && createPortal(
          <>
            <Bot className="w-5 h-5 text-indigo-500 flex-shrink-0" />
            <h1 className="text-base font-semibold text-neutral-900 dark:text-white truncate">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title || t('assistant.title')
                : t('assistant.title')}
            </h1>
          </>,
          document.getElementById('mobile-header-assistant-title')!
        )}

        {document.getElementById('mobile-header-actions') && createPortal(
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors lg:hidden"
            title={t('assistant.conversations')}
          >
            {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>,
          document.getElementById('mobile-header-actions')!
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeConversationId ? (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {messages.filter((m) => m.role !== 'system' && m.role !== 'tool').map((msg) => (
                <div key={msg.id}>
                  {msg.role === 'user' && (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
                        <div className="markdown-content-user">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="max-w-[80%]">
                        {(() => {
                          const { thoughtContent, responseContent } = parseAssistantContent(msg.content);
                          const shouldRenderThoughtOutsideBubble = Boolean(thoughtContent && !responseContent);

                          return (
                            <>
                              {shouldRenderThoughtOutsideBubble && renderMessageContent(msg.content)}
                              {hasRenderableAssistantBubble(msg) && (
                                <div className={`bg-white/60 dark:bg-neutral-800/60 backdrop-blur-sm rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-neutral-200/30 dark:border-white/5 ${
                                  msg.status === 'error' ? 'border-red-300 dark:border-red-800/40' : ''
                                }`}>
                                  {renderMessageContent(msg.content)}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {renderAssistantToolCalls(msg)}
                        {msg.inputTokens != null && msg.outputTokens != null && (
                          <p className="text-[10px] text-neutral-400 mt-1 ml-1">
                            {msg.inputTokens}↑ {msg.outputTokens}↓ tokens
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isSending && (
                <div className="ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-2 py-1.5 text-sm">
                    <MaterialSpinner className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <span className="font-medium bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-text-gradient bg-[size:200%_auto]">
                      {currentToolTitle || currentThinkingTitle || t('assistant.thinking', 'Thinking...')}
                    </span>
                  </div>
                </div>
              )}

              {renderConfirmationCard()}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="w-full max-w-2xl mx-auto -mt-20">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center shadow-sm border border-indigo-500/20">
                    <MessageCircle className="w-8 h-8 text-indigo-500" />
                  </div>
                </div>
                <h2 className="text-2xl font-semibold text-center text-neutral-800 dark:text-neutral-200 mb-8">
                  {t('assistant.howCanIHelp', 'How can I help you today?')}
                </h2>
                {renderComposer()}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        {activeConversationId && (
          <div className="flex-shrink-0 p-4 pt-2">
            <div className="max-w-3xl mx-auto">
              {renderComposer()}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Overlay */}
      {rightPanelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-300"
          onClick={() => setRightPanelOpen(false)}
        />
      )}

      {/* ─── Right Panel: Conversations & Config ─── */}
      <div className={`
        fixed inset-y-0 right-0 z-40 lg:static
        ${rightPanelOpen ? 'translate-x-0 w-[85vw] sm:w-80 lg:w-64' : 'translate-x-full lg:translate-x-0 w-[85vw] sm:w-80 lg:w-0 lg:overflow-hidden'}
        flex-shrink-0 border-l border-neutral-200/50 dark:border-white/5
        bg-white dark:bg-neutral-950 lg:bg-white/10 lg:dark:bg-black/10 backdrop-blur-xl
        transition-all duration-300 flex flex-col shadow-2xl lg:shadow-none
      `}>
        <div className="flex flex-col h-full w-[85vw] sm:w-80 lg:w-64">
          {/* Conversation List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              <div className="flex items-center justify-between px-2 py-2 mb-2">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('assistant.conversations')}
                </h3>
                <button
                  onClick={handleNewConversationClick}
                  className="flex items-center justify-center p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
                  title={t('assistant.newChat')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {conversations.length === 0 ? (
                <p className="px-2 py-4 text-xs text-neutral-400 dark:text-neutral-500 text-center">
                  {t('assistant.noConversations')}
                </p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm ${
                      conv.id === activeConversationId
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                    onClick={() => {
                      if (conv.id !== activeConversationId) navigate(`/assistant/${conv.id}`);
                    }}
                  >
                    <MessageCircle className="w-4 h-4 flex-shrink-0 opacity-60" />
                    {editingTitle === conv.id ? (
                      <input
                        autoFocus
                        value={editingTitleValue}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onBlur={() => handleRenameSubmit(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit(conv.id);
                          if (e.key === 'Escape') setEditingTitle(null);
                        }}
                        className="flex-1 min-w-0 text-sm bg-transparent border-b border-current outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="flex-1 truncate"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingTitle(conv.id);
                          setEditingTitleValue(conv.title);
                        }}
                      >
                        {conv.title}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conv.id);
                      }}
                      className={`flex-shrink-0 p-1 rounded transition-opacity ${
                        conv.id === activeConversationId
                          ? 'opacity-60 hover:opacity-100 text-white'
                          : 'opacity-0 group-hover:opacity-60 hover:!opacity-100 text-neutral-500 hover:text-red-500'
                      }`}
                      title={t('assistant.deleteConversation')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={t('assistant.deleteConversation')}
        message={t('assistant.deleteConfirm')}
        confirmText={t('confirmModal.confirm')}
        type="danger"
        onConfirm={() => deleteTarget && handleDeleteConversation(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

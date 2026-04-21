import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, MessageCircle, Check, X, ChevronRight, Loader2, PanelRightClose, PanelRightOpen, AlertTriangle, Bot, FolderOpen, Sparkles, ExternalLink, Settings2, Copy, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  fetchAssistantConversations,
  createAssistantConversation,
  fetchAssistantConversation,
  updateAssistantConversation,
  deleteAssistantConversation,
  summarizeAssistantConversationTitle,
  sendAssistantMessage,
  editAssistantMessage,
  confirmAssistantTool,
  fetchAssistantProviders,
  fetchProjects,
  fetchLibraries,
  fetchProject,
  fetchLibrary,
  AssistantConversation,
  AssistantMessage,
  AssistantPendingConfirmation,
} from '../api';
import type { Provider, ProviderType, ModelConfig, Project, Library } from '../types';
import { PROVIDER_MODELS_MAP, getTextModelsForProvider } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { JsonView } from '../components/JsonView';
import { ProjectPreviewModal } from '../components/ProjectViewer/ProjectPreviewModal';
import { LibraryPreviewModal } from '../components/ProjectViewer/LibraryPreviewModal';
import { AssistantComposer, BoundContext, AttachedImage } from '../components/Assistant/AssistantComposer';
import {
  filterEnabledAssistantProviders,
  normalizeAssistantProviderSelection,
} from '../lib/assistant-provider-settings';
import { AssistantHero } from '../components/Assistant/AssistantHero';

// BoundContext moved to AssistantComposer.tsx

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

/**
 * Extract embedded [IMAGE_ATTACHMENTS] base64 data URIs from user message content.
 * Returns clean text (block removed) and an array of data URIs for rendering.
 */
function parseUserMessageImages(content: string): { textContent: string; images: string[] } {
  const blockMatch = content.match(/\[IMAGE_ATTACHMENTS\]([\s\S]*?)\[\/IMAGE_ATTACHMENTS\]\n?/);
  if (!blockMatch) return { textContent: content, images: [] };
  const imageLines = blockMatch[1].trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:image/'));
  const textContent = content.replace(blockMatch[0], '').trim();
  return { textContent, images: imageLines };
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
  if (pendingConfirmation.summary) return pendingConfirmation.summary;
  
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
  
  const [isSending, setIsSending] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [currentThinkingTitle, setCurrentThinkingTitle] = useState('');
  const [currentToolTitle, setCurrentToolTitle] = useState('');
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [previewLibrary, setPreviewLibrary] = useState<Library | null>(null);
  const [previewSelectedTags, setPreviewSelectedTags] = useState<string[]>([]);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

  const justCreatedIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ─── Load providers ───
  useEffect(() => {
    fetchAssistantProviders()
      .then((data) => setProviders(filterEnabledAssistantProviders(data.providers)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const normalizedSelection = normalizeAssistantProviderSelection(
      providers,
      selectedProviderId,
      selectedModelId,
    );

    if (normalizedSelection.providerId !== selectedProviderId) {
      setSelectedProviderId(normalizedSelection.providerId);
    }
    if (normalizedSelection.modelId !== selectedModelId) {
      setSelectedModelId(normalizedSelection.modelId);
    }
  }, [providers, selectedModelId, selectedProviderId]);

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

  const handleOpenPreview = async (type: 'project' | 'library', id: string) => {
    if (isFetchingPreview) return;
    setIsFetchingPreview(true);
    try {
      if (type === 'project') {
        const proj = await fetchProject(id);
        setPreviewProject(proj);
      } else {
        const lib = await fetchLibrary(id);
        setPreviewLibrary(lib);
      }
    } catch (e: any) {
      toast.error(e?.message || `Failed to fetch ${type} details`);
    } finally {
      setIsFetchingPreview(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const initializedRef = useRef(false);

  // ─── Load conversation messages ───
  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await fetchAssistantConversation(id);
      let conversation = data.conversation;

      if (providers.length > 0) {
        const normalizedSelection = normalizeAssistantProviderSelection(
          providers,
          conversation.providerId || '',
          conversation.modelConfigId || '',
        );

        const shouldUpdateConversation = normalizedSelection.providerId
          && (
            conversation.providerId !== normalizedSelection.providerId
            || conversation.modelConfigId !== normalizedSelection.modelId
          );

        if (shouldUpdateConversation) {
          const updated = await updateAssistantConversation(id, {
            providerId: normalizedSelection.providerId,
            modelConfigId: normalizedSelection.modelId,
          });
          conversation = updated.conversation;
        }
      }

      setMessages(data.messages);
      if (conversation.providerId) setSelectedProviderId(conversation.providerId);
      if (conversation.modelConfigId) setSelectedModelId(conversation.modelConfigId);
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
  }, [providers]);

  // ─── Image Lightbox ESC handler ───
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  // Handle initial message from dashboard
  const handledInitialRef = useRef(false);
  useEffect(() => {
    if (handledInitialRef.current) return;
    const state = location.state as { initialMessage?: string; providerId?: string; modelId?: string; boundContexts?: BoundContext[]; attachedImages?: AttachedImage[] } | null;
    if (state && (state.initialMessage !== undefined || (state.attachedImages && state.attachedImages.length > 0))) {
      handledInitialRef.current = true;
      initializedRef.current = true; // Mark as initialized to prevent auto-select from running
      const { initialMessage, providerId, modelId, boundContexts: initialContexts, attachedImages: initialImages } = state;
      if (providerId) setSelectedProviderId(providerId);
      if (modelId) setSelectedModelId(modelId);
      // Removed initial contexts/images setters as they are now managed by Composer
      handleSend(initialMessage || '', initialContexts || [], initialImages || [], providerId, modelId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  useEffect(() => {
    // If we're coming from dashboard with an initial message, definitely don't auto-jump
    const state = location.state as { initialMessage?: string; attachedImages?: AttachedImage[] } | null;
    if (state && (state.initialMessage !== undefined || (state.attachedImages && state.attachedImages.length > 0))) {
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
  const handleSend = async (text: string, contexts: BoundContext[], images: AttachedImage[], overrideProviderId?: string, overrideModelId?: string) => {
    const trimmedText = text.trim();
    if (!trimmedText && contexts.length === 0 && images.length === 0 || isSending) return;

    let finalContent = trimmedText;
    // Embed images as [IMAGE_ATTACHMENTS] block at the start
    if (images.length > 0) {
      const imageBlock = `[IMAGE_ATTACHMENTS]\n${images.map((img) => img.base64).join('\n')}\n[/IMAGE_ATTACHMENTS]`;
      finalContent = imageBlock + (finalContent ? `\n${finalContent}` : '');
    }
    if (contexts.length > 0) {
      const contextStr = contexts.map(b => `- ${b.type === 'project' ? 'Project' : 'Library'}: "${b.name}" (ID: ${b.id}${b.subType ? `, Type: ${b.subType}` : ''})`).join('\n');
      finalContent = finalContent ? `${finalContent}\n\n<bound_context>\n${contextStr}\n</bound_context>` : `<bound_context>\n${contextStr}\n</bound_context>`;
    }

    const pId = overrideProviderId ?? selectedProviderId;
    const mId = overrideModelId ?? selectedModelId;

    if (!activeConversationId) {
      if (!pId || !mId) {
        toast.error(t('assistant.noProvider'));
        return;
      }
    }

    setIsSending(true);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');
    setPendingConfirmation(null);

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
      content: finalContent,
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
      const result = await sendAssistantMessage(currentConversationId, finalContent, (event) => {
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

      // AI-Title: if this was the first user message, summarize title using LLM
      // Do this asynchronously to avoid blocking the isSending state (which would keep the Thinking indicator visible)
      if (!activeConversationId || conversations.find((c) => c.id === currentConversationId)?.title === 'New chat') {
        summarizeAssistantConversationTitle(currentConversationId)
          .then(({ title }) => {
            setConversations((prev) => prev.map((c) => (c.id === currentConversationId ? { ...c, title } : c)));
          })
          .catch(() => {
            // fallback to simple truncation if AI summarization fails
            const title = text.length > 50 ? text.slice(0, 47) + '...' : text;
            updateAssistantConversation(currentConversationId, { title }).catch(() => {});
            setConversations((prev) => prev.map((c) => (c.id === currentConversationId ? { ...c, title } : c)));
          });
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
    const activeConfirmation = pendingConfirmation;
    setPendingConfirmation(null);
    setIsSending(true);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');
    try {
      const result = await confirmAssistantTool(
        activeConversationId,
        activeConfirmation.id,
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
      const data = await fetchAssistantConversation(activeConversationId);
      setMessages(data.messages);

      if (result.kind === 'awaiting_confirmation' && 'confirmation' in result) {
        setPendingConfirmation(result.confirmation);
      }
      if (decision === 'confirm_tool') {
        toast.success(
          t('assistant.toolApprovalEnabled', {
            defaultValue: 'Future {{tool}} actions in this conversation will auto-approve for this session.',
            tool: formatToolTitle(activeConfirmation.toolName),
          }),
        );
      }
      loadConversations();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to process confirmation');
      setPendingConfirmation(activeConfirmation);
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

  // ─── Edit message ───
  const handleEditSubmit = async (messageId: string) => {
    const text = editingMessageContent.trim();
    if (!text || !activeConversationId || isSending) return;

    setIsSending(true);
    setEditingMessageId(null);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');
    setPendingConfirmation(null);

    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex !== -1) {
       const priorMessages = messages.slice(0, msgIndex);
       const optimisticMsg: AssistantMessage = {
          ...messages[msgIndex],
          content: text
       };
       setMessages([...priorMessages, optimisticMsg]);
    }

    try {
      const result = await editAssistantMessage(activeConversationId, messageId, text, (event) => {
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
      const data = await fetchAssistantConversation(activeConversationId);
      setMessages(data.messages);

      if (result.kind === 'awaiting_confirmation' && 'confirmation' in result) {
        setPendingConfirmation(result.confirmation);
      }
      
      loadConversations();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to edit message');
    } finally {
      setIsSending(false);
      setCurrentThinkingTitle('');
      setCurrentToolTitle('');
    }
  };

  // ─── Key handler ───
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handled in Composer now
  };

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

  const assistantTitle = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)?.title || t('assistant.title')
    : t('assistant.title');
  const settingsPath = activeConversationId
    ? `/assistant/${activeConversationId}/settings`
    : '/assistant/settings';

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Center: Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Desktop */}
        <div className="hidden lg:block h-16 flex-shrink-0 px-6 border-b border-neutral-200/50 dark:border-white/5 bg-white/30 dark:bg-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between h-full">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white truncate">{assistantTitle}</h1>
            </div>
            <button
              onClick={() => navigate(settingsPath)}
              className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors flex-shrink-0"
              title={t('assistant.chatSettings', { defaultValue: 'Chat settings' })}
            >
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Header Portals */}
        {document.getElementById('mobile-header-assistant-title') && createPortal(
          <>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-white truncate">{assistantTitle}</h1>
          </>,
          document.getElementById('mobile-header-assistant-title')!
        )}

        {document.getElementById('mobile-header-actions') && createPortal(
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(settingsPath)}
              className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
              title={t('assistant.chatSettings', { defaultValue: 'Chat settings' })}
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors lg:hidden"
              title={t('assistant.conversations')}
            >
              {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>,
          document.getElementById('mobile-header-actions')!
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeConversationId ? (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {messages.filter((m) => m.role !== 'system' && m.role !== 'tool').map((msg, idx, arr) => (
                <div key={msg.id}>
                  {msg.role === 'user' && (
                    <div className="flex justify-end group/message">
                      {editingMessageId === msg.id ? (
                        <div className="max-w-[80%] w-full flex flex-col gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-br-md px-4 py-3 shadow-sm relative">
                           <textarea
                             autoFocus
                             className="w-full bg-transparent text-neutral-900 dark:text-white placeholder-neutral-500 outline-none resize-y text-sm min-h-[100px]"
                             value={editingMessageContent}
                             onChange={(e) => setEditingMessageContent(e.target.value)}
                           />
                           <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                             <button
                               onClick={() => { setEditingMessageId(null); setEditingMessageContent(''); }}
                               className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                             >
                               {t('assistant.cancel', 'Cancel')}
                             </button>
                             <button
                               onClick={() => handleEditSubmit(msg.id)}
                               disabled={isSending || !editingMessageContent.trim()}
                               className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                             >
                               {t('assistant.saveAndSubmit', 'Save & Submit')}
                             </button>
                           </div>
                        </div>
                      ) : (
                        <div className="max-w-[80%] flex flex-col items-end gap-1">
                          <div className="bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm w-full">
                            {(() => {
                               const { textContent: rawText, images: msgImages } = parseUserMessageImages(msg.content);
                               const boundContextMatch = rawText.match(/<bound_context>([\s\S]*?)<\/bound_context>/);
                               const cleanContent = rawText.replace(/<bound_context>[\s\S]*?<\/bound_context>/g, '').trim();
                               const contextLines = boundContextMatch ? boundContextMatch[1].trim().split('\n').filter(l => l.trim().startsWith('-')) : [];
                                
                               return (
                                 <div className="space-y-2">
                                   {/* Attached images */}
                                   {msgImages.length > 0 && (
                                     <div className="flex flex-wrap gap-2 pb-1">
                                       {msgImages.map((src, i) => (
                                         <button
                                           key={i}
                                           onClick={() => setLightboxImage(src)}
                                           className="block flex-shrink-0 transition-transform hover:scale-[1.02] active:scale-95"
                                         >
                                           <img
                                             src={src}
                                             alt={`Attached ${i + 1}`}
                                             className="h-24 w-24 rounded-xl object-cover border-2 border-white/30 shadow-sm hover:brightness-110"
                                           />
                                         </button>
                                       ))}
                                     </div>
                                   )}
                                   {cleanContent && (
                                     <div className="markdown-content-user">
                                       <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                         {cleanContent}
                                       </ReactMarkdown>
                                     </div>
                                   )}
                                   {!cleanContent && contextLines.length === 0 && msgImages.length === 0 && (
                                     <div className="markdown-content-user text-indigo-100">
                                       {t('assistant.boundResourcesSent', 'Bound resources referenced.')}
                                     </div>
                                   )}
                                   {contextLines.length > 0 && (
                                     <div className="flex flex-wrap gap-1.5 pt-1">
                                       {contextLines.map((line, i) => {
                                          const lineMatch = line.match(/- (Project|Library): "([^"]+)"/);
                                          if (lineMatch) {
                                            const type = lineMatch[1];
                                            const name = lineMatch[2];
                                            const id = line.match(/ID: ([a-f0-9\-]+)/)?.[1] || '';
                                            return (
                                              <div key={i} className="flex items-center gap-1">
                                                <button 
                                                  onClick={() => handleOpenPreview(type.toLowerCase() as any, id)}
                                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-l-full bg-white/20 border border-white/30 border-r-0 text-[11px] font-medium text-white shadow-sm hover:bg-white/30 active:bg-white/40 transition-all"
                                                >
                                                  {type === 'Project' ? <Sparkles className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
                                                  {name}
                                                </button>
                                                <Link
                                                  to={type === 'Project' ? `/project/${id}` : `/library/${id}`}
                                                  className="inline-flex items-center justify-center w-8 h-[26px] rounded-r-full bg-white/10 border border-white/30 text-white/60 hover:text-white hover:bg-white/30 transition-all"
                                                  title={`Open ${type}`}
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                </Link>
                                              </div>
                                            );
                                          }
                                          return null;
                                       })}
                                     </div>
                                   )}
                                 </div>
                               );
                            })()}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity mt-0.5 mr-1">
                            <button
                              onClick={() => {
                                const { textContent: rawText } = parseUserMessageImages(msg.content);
                                const cleanContent = rawText.replace(/<bound_context>[\s\S]*?<\/bound_context>/g, '').trim();
                                if (cleanContent) {
                                  navigator.clipboard.writeText(cleanContent);
                                  toast.success(t('assistant.copied', { defaultValue: 'Copied to clipboard' }));
                                }
                              }}
                              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
                              title={t('assistant.copy', { defaultValue: 'Copy text' })}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                const { textContent: rawText } = parseUserMessageImages(msg.content);
                                const cleanContent = rawText.replace(/<bound_context>[\s\S]*?<\/bound_context>/g, '').trim();
                                setEditingMessageId(msg.id);
                                setEditingMessageContent(cleanContent);
                              }}
                              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
                              title={t('assistant.edit', { defaultValue: 'Edit message' })}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <div className="flex gap-3 group/message">
                      <div className="relative flex-shrink-0">
                        <div className="flex w-9 h-9 items-center justify-center rounded-full bg-slate-900/80 backdrop-blur-sm shadow-sm relative z-10 border border-white/10 dark:border-white/5">
                          <img src="/assistant-avatar.svg" alt="Assistant" className="w-8 h-8 object-contain" />
                        </div>
                      </div>
                      <div className="max-w-[80%]">
                        {(() => {
                          const { thoughtContent, responseContent } = parseAssistantContent(msg.content);
                          const shouldRenderThoughtOutsideBubble = Boolean(thoughtContent && !responseContent);

                          return (
                            <>
                              {shouldRenderThoughtOutsideBubble && renderMessageContent(msg.content)}
                                {hasRenderableAssistantBubble(msg) && (
                                  <div className={`bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-white/40 dark:border-white/10 ${
                                    msg.status === 'error' ? 'border-red-300 dark:border-red-800/40' : ''
                                  }`}>
                                    {renderMessageContent(msg.content)}
                                  </div>
                                )}
                            </>
                          );
                        })()}
                        {renderAssistantToolCalls(msg)}
                        <div className="flex items-center justify-between mt-1 mx-1 gap-2">
                          <div className="flex items-center gap-2">
                            {msg.inputTokens != null && msg.outputTokens != null && (
                              <p className="text-[10px] text-neutral-400">
                                {msg.inputTokens}↑ {msg.outputTokens}↓ tokens
                              </p>
                            )}
                          </div>
                          
                          {hasRenderableAssistantBubble(msg) && (
                            <button
                              onClick={() => {
                                const { responseContent } = parseAssistantContent(msg.content);
                                if (responseContent) {
                                  navigator.clipboard.writeText(responseContent);
                                  toast.success(t('assistant.copied', { defaultValue: 'Copied to clipboard' }));
                                }
                              }}
                              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all opacity-0 group-hover/message:opacity-100"
                              title={t('assistant.copy', { defaultValue: 'Copy text' })}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isSending && (
                <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="relative flex-shrink-0">
                    <div className="flex w-9 h-9 items-center justify-center rounded-full bg-slate-900/80 backdrop-blur-sm shadow-sm relative z-10 border border-white/10 dark:border-white/5">
                      <img src="/assistant-avatar.svg" alt="Assistant" className="w-8 h-8 object-contain relative z-10" />
                      <svg className="absolute -inset-[1px] w-[36px] h-[36px] animate-material-spinner pointer-events-none z-20" viewBox="0 0 50 50">
                        <circle
                          className="animate-material-dash"
                          cx="25"
                          cy="25"
                          r="23"
                          fill="none"
                          stroke="url(#avatarSpinnerGradientThinking)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <defs>
                          <linearGradient id="avatarSpinnerGradientThinking" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#a855f7" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 text-sm">
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
                <AssistantHero
                  selectedProviderId={selectedProviderId}
                  setSelectedProviderId={setSelectedProviderId}
                  selectedModelId={selectedModelId}
                  setSelectedModelId={setSelectedModelId}
                  providers={providers}
                  isSending={isSending}
                  onSend={handleSend}
                  placeholder={t('assistant.typePlaceholder', 'Type a message...')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        {activeConversationId && (
          <div className="flex-shrink-0 p-4 pt-2">
            <div className="max-w-3xl mx-auto">
              <AssistantComposer
                selectedProviderId={selectedProviderId}
                setSelectedProviderId={setSelectedProviderId}
                selectedModelId={selectedModelId}
                setSelectedModelId={setSelectedModelId}
                providers={providers}
                isSending={isSending}
                onSend={handleSend}
              />
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
        ${rightPanelOpen ? 'translate-x-0 w-[85vw] sm:w-80 lg:w-64' : 'translate-x-full lg:translate-x-0 w-[85vw] sm:w-80 lg:w-16'}
        flex-shrink-0 border-l border-neutral-200/50 dark:border-white/5
        bg-white dark:bg-neutral-950 lg:bg-white/10 lg:dark:bg-black/10 backdrop-blur-xl
        transition-all duration-300 flex flex-col shadow-2xl lg:shadow-none
      `}>
        <div className={`flex h-full min-h-0 flex-col ${rightPanelOpen ? 'w-[85vw] sm:w-80 lg:w-64' : 'w-[85vw] sm:w-80 lg:w-16'}`}>
          <div className="sticky top-0 z-10 h-16 flex-shrink-0 border-b border-neutral-200/50 bg-white/80 px-2 backdrop-blur-xl dark:border-white/5 dark:bg-neutral-950/80 lg:bg-white/20 lg:dark:bg-black/20">
            <div className={`flex items-center h-full ${rightPanelOpen ? 'justify-between gap-2' : 'justify-center'}`}>
              {rightPanelOpen && (
                <div className="min-w-0 px-3">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white truncate">
                    {t('assistant.conversations')}
                  </h3>
                </div>
              )}
              <div className="flex items-center gap-1">
                {rightPanelOpen && (
                  <button
                    onClick={handleNewConversationClick}
                    className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                    title={t('assistant.newChat')}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setRightPanelOpen(!rightPanelOpen)}
                  className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                  title={rightPanelOpen
                    ? t('assistant.collapseConversations', { defaultValue: 'Collapse conversations' })
                    : t('assistant.expandConversations', { defaultValue: 'Expand conversations' })}
                >
                  {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {rightPanelOpen && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
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
          )}
        </div>
      </div>

      {/* Modals */}
      {previewProject && (
        <ProjectPreviewModal 
          project={previewProject} 
          libraries={[]} // Libraries will be matched by ID in the modal
          onClose={() => setPreviewProject(null)} 
        />
      )}

      {previewLibrary && (
        <LibraryPreviewModal 
          library={previewLibrary}
          selectedTags={previewSelectedTags}
          onUpdateTags={setPreviewSelectedTags}
          onClose={() => {
            setPreviewLibrary(null);
            setPreviewSelectedTags([]);
          }}
        />
      )}

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

      {/* Image Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            className="absolute top-6 right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <div 
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center p-4 animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={lightboxImage} 
              alt="Lightbox" 
              className="max-w-full max-h-full rounded-lg shadow-2xl object-contain border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}

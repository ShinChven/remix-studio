import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, MessageCircle, Check, X, ChevronRight, Loader2, PanelRightClose, PanelRightOpen, AlertTriangle, Bot, FolderOpen, Sparkles, ExternalLink, Settings2, ShieldCheck, Copy, Pencil, Search, Megaphone, FileText } from 'lucide-react';
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
  streamAssistantTurn,
  AssistantTurnBusyError,
  AssistantTurnDisconnectedError,
  fetchAssistantProviders,
  fetchProjects,
  fetchLibraries,
  fetchProject,
  fetchProjectWorkflow,
  fetchLibrary,
  fetchAssistantConversationResources,
  deleteAssistantConversationResource,
  AssistantActiveTurn,
  AssistantConversation,
  AssistantConversationResource,
  AssistantMessage,
  AssistantPendingConfirmation,
  AssistantStatusEvent,
  AssistantTurnResult,
} from '../api';
import type { Provider, ProviderType, ModelConfig, Project, Library } from '../types';
import { PROVIDER_MODELS_MAP, getTextModelsForProvider } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { JsonView } from '../components/JsonView';
import { ProjectPreviewModal } from '../components/ProjectViewer/ProjectPreviewModal';
import { LibraryPreviewModal } from '../components/ProjectViewer/LibraryPreviewModal';
import { AssistantComposer, AssistantComposerHandle, BoundContext, AttachedImage } from '../components/Assistant/AssistantComposer';
import { AssistantResourcePanel } from '../components/Assistant/AssistantResourcePanel';
import {
  filterEnabledAssistantProviders,
  normalizeAssistantProviderSelection,
} from '../lib/assistant-provider-settings';
import { AssistantHero } from '../components/Assistant/AssistantHero';
import { ApprovedToolsModal } from '../components/Assistant/ApprovedToolsModal';
import { consumePwaShareHandoff } from '../lib/pwa-share';

// BoundContext moved to AssistantComposer.tsx
type AssistantNavigationState = {
  initialMessage?: string;
  providerId?: string;
  modelId?: string;
  boundContexts?: BoundContext[];
  attachedImages?: AttachedImage[];
  draftMessage?: string;
  draftBoundContexts?: BoundContext[];
  draftAttachedImages?: AttachedImage[];
};

const BOUND_CONTEXT_LABELS: Record<BoundContext['type'], string> = {
  project: 'Project',
  library: 'Library',
  campaign: 'Campaign',
  post: 'Post',
};

type BoundContextLabel = (typeof BOUND_CONTEXT_LABELS)[BoundContext['type']];

const BOUND_CONTEXT_CHIP_ICONS: Record<BoundContextLabel, React.ComponentType<{ className?: string }>> = {
  Project: Sparkles,
  Library: FolderOpen,
  Campaign: Megaphone,
  Post: FileText,
};

/** A post's route needs its campaign, which the bound-context line does not carry. */
function boundContextHref(type: BoundContextLabel, id: string): string | null {
  if (type === 'Project') return `/project/${id}`;
  if (type === 'Library') return `/library/${id}`;
  if (type === 'Campaign') return `/campaigns/${id}`;
  return null;
}

/**
 * A turn outlives the request that started it, so a dropped connection is only
 * ever a reason to reattach. Six tries with a growing gap covers a tab waking
 * up or a network handing over; past that the transcript on disk is the answer.
 */
const TURN_REATTACH_ATTEMPTS = 6;
const TURN_REATTACH_BASE_DELAY_MS = 500;
const TURN_REATTACH_MAX_DELAY_MS = 8_000;

/**
 * A finished tool call means new rows in the transcript. Pulling them in while
 * the loop is still running is what makes a reattached page show the work as it
 * happens rather than a spinner; the delay keeps a burst of parallel calls to
 * one fetch.
 */
const TRANSCRIPT_REFRESH_DEBOUNCE_MS = 800;

/** Sleep that gives up as soon as the turn stream is abandoned. */
function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish);
  });
}

type TurnOutcome =
  | { status: 'done'; result: AssistantTurnResult | null }
  | { status: 'abandoned' };

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
async function compressDataUrlImage(dataUrl: string): Promise<string> {
  const MAX_DIM = 1024;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      let targetW = width;
      let targetH = height;
      if (Math.max(width, height) > MAX_DIM) {
        if (width >= height) {
          targetW = MAX_DIM;
          targetH = Math.round((height / width) * MAX_DIM);
        } else {
          targetH = MAX_DIM;
          targetW = Math.round((width / height) * MAX_DIM);
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not available')); return; }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

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
    case 'update_library':
      return `Rename library "${String(args.library_id ?? '')}" to "${String(args.name ?? '')}".`;
    case 'create_prompt':
      return `Create one prompt in library "${String(args.library_id ?? '')}".`;
    case 'batch_create_prompts': {
      const count = Array.isArray(args.items) ? args.items.length : 0;
      return `Create ${count} prompt${count === 1 ? '' : 's'} in library "${String(args.library_id ?? '')}".`;
    }
    case 'update_prompt': {
      const fields = ['content', 'title', 'tags'].filter((key) => Object.prototype.hasOwnProperty.call(args, key));
      return `Update prompt "${String(args.item_id ?? '')}" in library "${String(args.library_id ?? '')}"${fields.length ? ` (${fields.join(', ')})` : ''}.`;
    }
    case 'delete_prompt':
      return `Delete prompt "${String(args.item_id ?? '')}" from library "${String(args.library_id ?? '')}".`;
    case 'create_project_with_workflow': {
      const workflowCount = Array.isArray(args.workflowItems) ? args.workflowItems.length : 0;
      return `Create a ${String(args.type ?? 'new')} project named "${String(args.name ?? '')}" with ${workflowCount} workflow item${workflowCount === 1 ? '' : 's'}.`;
    }
    case 'update_project': {
      const workflowCount = Array.isArray(args.workflowItems) ? args.workflowItems.length : null;
      return workflowCount == null
        ? `Update project "${String(args.projectId ?? '')}".`
        : `Update project "${String(args.projectId ?? '')}" and replace its workflow with ${workflowCount} item${workflowCount === 1 ? '' : 's'}. Existing workflow items not included will be removed.`;
    }
    case 'draft_jobs': {
      const count = typeof args.count === 'number' ? args.count : 0;
      return `Stage ${count} draft job${count === 1 ? '' : 's'} on project "${String(args.projectId ?? '')}". Drafts do not run until they are started.`;
    }
    case 'start_jobs': {
      const count = typeof args.count === 'number' ? args.count : null;
      return count == null
        ? `Start every draft job on project "${String(args.projectId ?? '')}". This runs generation and spends provider credits.`
        : `Start ${count} draft job${count === 1 ? '' : 's'} on project "${String(args.projectId ?? '')}". This runs generation and spends provider credits.`;
    }
    case 'create_campaign':
      return `Create campaign "${String(args.name ?? '')}".`;
    case 'update_campaign': {
      const fields = ['name', 'description', 'status', 'socialAccountIds'].filter((key) => Object.prototype.hasOwnProperty.call(args, key));
      return `Update campaign "${String(args.campaignId ?? '')}"${fields.length ? ` (${fields.join(', ')})` : ''}.`;
    }
    case 'create_post':
      return `Create a post in campaign "${String(args.campaignId ?? '')}".`;
    case 'update_post': {
      const fields = ['textContent', 'scheduledAt', 'status'].filter((key) => Object.prototype.hasOwnProperty.call(args, key));
      return `Update post "${String(args.postId ?? '')}"${fields.length ? ` (${fields.join(', ')})` : ''}.`;
    }
    case 'update_post_text':
      return `Update text for post "${String(args.postId ?? '')}".`;
    case 'add_media_to_post':
      return `Add media to post "${String(args.postId ?? '')}".`;
    case 'schedule_post':
      return `Schedule post "${String(args.postId ?? '')}".`;
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
  const [resources, setResources] = useState<AssistantConversationResource[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<AssistantPendingConfirmation | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => localStorage.getItem('assistant_last_provider') || '');
  const [selectedModelId, setSelectedModelId] = useState<string>(() => localStorage.getItem('assistant_last_model') || '');
  const initialNavigationState = location.state as AssistantNavigationState | null;
  const [composerDraft, setComposerDraft] = useState(() => ({
    inputText: initialNavigationState?.draftMessage || '',
    boundContexts: initialNavigationState?.draftBoundContexts || [],
    attachedImages: initialNavigationState?.draftAttachedImages || [],
    key: 0,
  }));

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
  const [previewTagMatchMode, setPreviewTagMatchMode] = useState<'and' | 'or'>('or');
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
  const [approvedToolsModalOpen, setApprovedToolsModalOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

  const [isReconnecting, setIsReconnecting] = useState(false);

  const justCreatedIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerHandleRef = useRef<AssistantComposerHandle | null>(null);

  // ─── Live turn plumbing ───
  // The turn runs on the server, not in this tab. These three refs are all it
  // takes to leave one and come back to it: where we got to in its event
  // stream, which conversation we are following, and the handle that lets us
  // let go of the stream (never the turn) when the user moves on.
  const turnSeqRef = useRef(0);
  const streamingConversationRef = useRef<string | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const isSendingRef = useRef(false);
  isSendingRef.current = isSending;

  const transcriptRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Pull the transcript rows a running turn has already written — the assistant
   * messages and tool results behind the progress line — so the conversation
   * fills in as the loop works instead of all at once when it ends.
   */
  const scheduleTranscriptRefresh = useCallback(() => {
    const conversationId = streamingConversationRef.current;
    if (!conversationId || transcriptRefreshRef.current) return;
    transcriptRefreshRef.current = setTimeout(async () => {
      transcriptRefreshRef.current = null;
      if (streamingConversationRef.current !== conversationId) return;
      try {
        const data = await fetchAssistantConversation(conversationId);
        // The turn may have ended (and been settled) while this was in flight.
        if (streamingConversationRef.current !== conversationId) return;
        if (activeConversationIdRef.current !== conversationId) return;
        setMessages(data.messages);
        setResources(data.resources);
      } catch {
        // Mid-turn nicety — the settle at the end of the turn is the real one.
      }
    }, TRANSCRIPT_REFRESH_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (transcriptRefreshRef.current) clearTimeout(transcriptRefreshRef.current);
  }, []);

  /** Progress line updates, shared by every path that reads a turn stream. */
  const handleTurnStatusEvent = useCallback((event: AssistantStatusEvent, seq: number) => {
    turnSeqRef.current = seq;
    setIsReconnecting(false);
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
    if (event.type === 'tool_call_finished') scheduleTranscriptRefresh();
  }, [scheduleTranscriptRefresh]);

  /**
   * Read one turn to its verdict, reconnecting to the server-side loop whenever
   * the pipe breaks. `start` receives the abort signal so leaving the page (or
   * switching chats) drops the stream without touching the turn behind it.
   */
  const consumeTurn = useCallback(async (
    conversationId: string,
    start: (signal: AbortSignal) => Promise<AssistantTurnResult | null>,
  ): Promise<TurnOutcome> => {
    turnAbortRef.current?.abort();
    const controller = new AbortController();
    turnAbortRef.current = controller;
    streamingConversationRef.current = conversationId;

    let attempt = 0;
    let next = () => start(controller.signal);
    try {
      while (true) {
        try {
          const result = await next();
          setIsReconnecting(false);
          return { status: 'done', result };
        } catch (e: any) {
          if (controller.signal.aborted) return { status: 'abandoned' };
          const recoverable = e instanceof AssistantTurnDisconnectedError;
          if (!recoverable || attempt >= TURN_REATTACH_ATTEMPTS) throw e;
          attempt += 1;
          setIsReconnecting(true);
          await waitFor(
            Math.min(TURN_REATTACH_BASE_DELAY_MS * 2 ** (attempt - 1), TURN_REATTACH_MAX_DELAY_MS),
            controller.signal,
          );
          if (controller.signal.aborted) return { status: 'abandoned' };
          next = () => streamAssistantTurn(
            conversationId,
            turnSeqRef.current,
            handleTurnStatusEvent,
            controller.signal,
          );
        }
      }
    } finally {
      setIsReconnecting(false);
      if (turnAbortRef.current === controller) turnAbortRef.current = null;
      if (streamingConversationRef.current === conversationId) streamingConversationRef.current = null;
    }
  }, [handleTurnStatusEvent]);

  /** Settle the view on the persisted transcript once a turn ends. */
  const settleAfterTurn = useCallback(async (
    conversationId: string,
    result: AssistantTurnResult | null,
  ) => {
    const data = await fetchAssistantConversation(conversationId);
    if (activeConversationIdRef.current !== conversationId) return data;
    setMessages(data.messages);
    setResources(data.resources);
    if (result && result.kind === 'awaiting_confirmation' && 'confirmation' in result) {
      setPendingConfirmation(result.confirmation);
    } else {
      setPendingConfirmation(data.pendingConfirmation);
    }
    return data;
  }, []);

  /** Clear the sending state, unless another turn stream has already taken over. */
  const releaseTurnIndicator = useCallback(() => {
    if (streamingConversationRef.current) return;
    setIsSending(false);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');
  }, []);

  /**
   * A turn we gave up following is not a turn that failed — the work carries on
   * server-side. Say so, and show the transcript as the server has it rather
   * than rolling anything back.
   */
  const handleLostTurn = useCallback(async (conversationId: string) => {
    toast.error(t('assistant.reconnectFailed', 'Lost track of the assistant — reloading the chat.'));
    await settleAfterTurn(conversationId, null).catch(() => {});
  }, [settleAfterTurn, t]);

  // ─── Load providers ───
  useEffect(() => {
    fetchAssistantProviders()
      .then((data) => setProviders(filterEnabledAssistantProviders(data.providers)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (providers.length === 0) return;
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

  // ─── Load conversations (sidebar caps at the 50 most recent) ───
  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchAssistantConversations(undefined, 50);
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      // silent
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Follow a turn that is already running server-side — after a reload, after
   * a sleeping tab wakes, or when a send lands on a conversation that is still
   * busy. Replaying from sequence 0 catches the progress line up to whatever
   * the turn is doing right now.
   */
  const attachToActiveTurn = useCallback(async (
    conversationId: string,
    activeTurn?: AssistantActiveTurn | null,
  ) => {
    if (streamingConversationRef.current === conversationId) return;
    turnSeqRef.current = 0;
    setIsSending(true);
    setPendingConfirmation(null);
    setCurrentThinkingTitle('');
    setCurrentToolTitle('');
    // The snapshot that came with the conversation gives the progress line
    // something to say before the first live frame arrives.
    if (activeTurn?.lastEvent) handleTurnStatusEvent(activeTurn.lastEvent, 0);

    try {
      const outcome = await consumeTurn(conversationId, (signal) =>
        streamAssistantTurn(conversationId, 0, handleTurnStatusEvent, signal));
      if (outcome.status === 'abandoned') return;
      await settleAfterTurn(conversationId, outcome.result);
      loadConversations();
    } catch (e: any) {
      if (activeConversationIdRef.current !== conversationId) return;
      if (e instanceof AssistantTurnDisconnectedError) {
        await handleLostTurn(conversationId);
      } else {
        toast.error(e?.message || 'Failed to follow the assistant');
        await settleAfterTurn(conversationId, null).catch(() => {});
      }
    } finally {
      releaseTurnIndicator();
    }
  }, [consumeTurn, handleTurnStatusEvent, settleAfterTurn, releaseTurnIndicator, handleLostTurn, loadConversations]);

  const handleOpenPreview = async (type: 'project' | 'library', id: string) => {
    if (isFetchingPreview) return;
    setIsFetchingPreview(true);
    try {
      if (type === 'project') {
        const [proj, workflow] = await Promise.all([
          fetchProject(id),
          fetchProjectWorkflow(id),
        ]);
        setPreviewProject({ ...proj, workflow });
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

  const initializedRef = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === 'extension'
  );

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
      setResources(data.resources);
      if (conversation.providerId) setSelectedProviderId(conversation.providerId);
      if (conversation.modelConfigId) setSelectedModelId(conversation.modelConfigId);
      // A confirmation the conversation is still waiting on lives in the
      // database, so the card comes back with the transcript rather than being
      // lost with the request that raised it.
      setPendingConfirmation(data.pendingConfirmation);
      // A turn still running is picked back up here: the loop kept going while
      // the page was away, and its event stream resumes where this tab can see
      // it — thinking, tool calls and all.
      if (data.activeTurn) {
        void attachToActiveTurn(id, data.activeTurn);
      }
    } catch {
      toast.error('Failed to load conversation');
    }
  }, [providers, attachToActiveTurn]);

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
  const handledDraftRef = useRef(false);
  useEffect(() => {
    if (handledDraftRef.current) return;
    const state = location.state as AssistantNavigationState | null;
    if (!state) return;

    const draftContexts = state.draftBoundContexts || [];
    const draftImages = state.draftAttachedImages || [];
    const hasDraft = state.draftMessage !== undefined || draftContexts.length > 0 || draftImages.length > 0;
    if (!hasDraft) return;

    handledDraftRef.current = true;
    initializedRef.current = true;
    localStorage.removeItem('assistant_last_conversation');
    setComposerDraft((current) => ({
      inputText: state.draftMessage || '',
      boundContexts: draftContexts,
      attachedImages: draftImages,
      key: current.key + 1,
    }));
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate]);

  const handledInitialRef = useRef(false);
  useEffect(() => {
    if (handledInitialRef.current) return;
    const state = location.state as AssistantNavigationState | null;
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

  // Handle data from Chrome extension via window.postMessage or from PWA share via sessionStorage
  const handledExtensionRef = useRef(false);
  const applyToComposer = useCallback(async (payload: { type: string; data: string; name?: string }) => {
    if (handledExtensionRef.current) return;
    if (payload.type !== 'text' && payload.type !== 'image') return;

    if (payload.type === 'text') {
      handledExtensionRef.current = true;
      initializedRef.current = true;
      const text = String(payload.data || '');
      setComposerDraft((current) => ({
        inputText: current.inputText ? `${current.inputText}\n\n${text}` : text,
        boundContexts: current.boundContexts,
        attachedImages: current.attachedImages,
        key: current.key + 1,
      }));
      return;
    }

    // payload.type === 'image' — compress first so a failure doesn't trap the ref
    try {
      const compressed = await compressDataUrlImage(payload.data);
      if (handledExtensionRef.current) return;
      handledExtensionRef.current = true;
      initializedRef.current = true;
      const image: AttachedImage = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        preview: compressed,
        base64: compressed,
      };
      setComposerDraft((current) => ({
        inputText: current.inputText || (payload.name ? String(payload.name) : ''),
        boundContexts: current.boundContexts,
        attachedImages: [...current.attachedImages, image],
        key: current.key + 1,
      }));
    } catch {
      toast.error('Failed to load shared image');
    }
  }, []);

  useEffect(() => {
    const handleExtensionMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'REMIX_STUDIO_EXTENSION_IMPORT') return;
      const payload = event.data.payload;
      if (!payload || payload.target !== 'chat') return;
      window.postMessage({ type: 'REMIX_STUDIO_EXTENSION_ACK' }, '*');
      await applyToComposer(payload);

      const currentParams = new URLSearchParams(window.location.search);
      if (currentParams.has('from')) {
        currentParams.delete('from');
        const search = currentParams.toString();
        navigate(`${window.location.pathname}${search ? `?${search}` : ''}`, { replace: true });
      }
    };

    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [navigate, applyToComposer]);

  useEffect(() => {
    const shared = consumePwaShareHandoff();
    if (shared) {
      applyToComposer(shared);
    }
  }, [applyToComposer]);

  useEffect(() => {
    // If we're coming from dashboard with an initial message, definitely don't auto-jump
    const state = location.state as AssistantNavigationState | null;
    const hasInitialSend = state && (state.initialMessage !== undefined || (state.attachedImages && state.attachedImages.length > 0));
    const hasDraft = state && (
      state.draftMessage !== undefined
      || (state.draftBoundContexts && state.draftBoundContexts.length > 0)
      || (state.draftAttachedImages && state.draftAttachedImages.length > 0)
    );
    if (hasInitialSend || hasDraft) {
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

  // Letting go of a conversation lets go of its stream, never of its turn: the
  // loop carries on server-side and is picked back up on the next visit.
  // A stream started for the conversation we just moved *to* is kept — sending
  // the first message of a new chat navigates to it while the turn is opening.
  useEffect(() => () => {
    const streaming = streamingConversationRef.current;
    if (streaming && streaming !== activeConversationIdRef.current) {
      turnAbortRef.current?.abort();
    }
  }, [activeConversationId]);

  /**
   * Ask the server what this conversation is doing and fall back in step with
   * it. Used when the tab comes back from the background or the network
   * returns — a streaming fetch dies there without an error we ever see.
   */
  const resyncConversation = useCallback(async (conversationId: string) => {
    if (streamingConversationRef.current || isSendingRef.current) return;
    try {
      const data = await fetchAssistantConversation(conversationId);
      if (activeConversationIdRef.current !== conversationId) return;
      if (streamingConversationRef.current || isSendingRef.current) return;
      setMessages(data.messages);
      setResources(data.resources);
      setPendingConfirmation(data.pendingConfirmation);
      if (data.activeTurn) void attachToActiveTurn(conversationId, data.activeTurn);
    } catch {
      // Offline or a hiccup — keep what is on screen and try again on the next wake.
    }
  }, [attachToActiveTurn]);

  useEffect(() => {
    if (!activeConversationId) return;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      void resyncConversation(activeConversationId);
    };
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', resync);
    return () => {
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
      document.removeEventListener('visibilitychange', resync);
    };
  }, [activeConversationId, resyncConversation]);

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
      setResources([]);
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
  const contextUsageTokens = messages.reduce((latest, message) => {
    if (message.role === 'assistant' && typeof message.inputTokens === 'number') {
      return message.inputTokens;
    }
    return latest;
  }, 0);

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
      const contextStr = contexts.map(b => `- ${BOUND_CONTEXT_LABELS[b.type] ?? 'Library'}: "${b.name}" (ID: ${b.id}${b.subType ? `, Type: ${b.subType}` : ''})`).join('\n');
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

    turnSeqRef.current = 0;

    try {
      const outcome = await consumeTurn(currentConversationId, (signal) =>
        sendAssistantMessage(currentConversationId!, finalContent, handleTurnStatusEvent, signal));
      if (outcome.status === 'abandoned') return;
      // Reload full message list for consistency
      await settleAfterTurn(currentConversationId, outcome.result);

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
      if (e instanceof AssistantTurnDisconnectedError) {
        // The message was accepted and the turn is still running — the only
        // thing lost is our view of it, so show what the server has.
        await handleLostTurn(currentConversationId!);
        return;
      }
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      if (e instanceof AssistantTurnBusyError) {
        // Another tab (or this one before a reload) is still driving a turn in
        // this conversation. Nothing was sent — follow that turn instead of
        // stacking a second one on top of it.
        toast.error(t('assistant.turnBusy', 'The assistant is still working in this chat — nothing was sent.'));
        void attachToActiveTurn(currentConversationId!, e.activeTurn);
        return;
      }
      toast.error(e?.message || 'Failed to send message');
      // A tool may have landed before the turn failed — keep the sidebar honest.
      if (currentConversationId) refreshResources(currentConversationId);
    } finally {
      releaseTurnIndicator();
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
    turnSeqRef.current = 0;

    try {
      const outcome = await consumeTurn(activeConversationId, (signal) =>
        confirmAssistantTool(
          activeConversationId,
          activeConfirmation.id,
          decision,
          handleTurnStatusEvent,
          signal,
        ));
      if (outcome.status === 'abandoned') return;
      await settleAfterTurn(activeConversationId, outcome.result);

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
      if (e instanceof AssistantTurnDisconnectedError) {
        await handleLostTurn(activeConversationId);
        return;
      }
      if (e instanceof AssistantTurnBusyError) {
        toast.error(t('assistant.turnBusy', 'The assistant is still working in this chat — nothing was sent.'));
        void attachToActiveTurn(activeConversationId, e.activeTurn);
        return;
      }
      toast.error(e?.message || 'Failed to process confirmation');
      setPendingConfirmation(activeConfirmation);
      if (activeConversationId) refreshResources(activeConversationId);
    } finally {
      releaseTurnIndicator();
    }
  };

  // ─── Conversation resources ───
  const refreshResources = useCallback(async (conversationId: string) => {
    try {
      const data = await fetchAssistantConversationResources(conversationId);
      setResources(data.resources);
    } catch {
      // Non-critical: the sidebar keeps whatever it already has.
    }
  }, []);

  /** Drop a resource into the composer as a bound context, same as typing `@`. */
  const handleMentionResource = (resource: AssistantConversationResource) => {
    const contextType = resource.entityType as BoundContext['type'];
    composerHandleRef.current?.addBoundContext({
      id: resource.entityId,
      name: resource.name || resource.entityId,
      type: contextType,
      subType: resource.subType || undefined,
    });
    if (window.innerWidth < 1024) setRightPanelOpen(false);
  };

  const handleRemoveResource = async (resource: AssistantConversationResource) => {
    if (!activeConversationId) return;
    const previous = resources;
    setResources((current) => current.filter((entry) => entry.id !== resource.id));
    try {
      await deleteAssistantConversationResource(activeConversationId, resource.id);
    } catch (e: any) {
      setResources(previous);
      toast.error(e?.message || 'Failed to remove resource');
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
        setResources([]);
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

    turnSeqRef.current = 0;

    try {
      const outcome = await consumeTurn(activeConversationId, (signal) =>
        editAssistantMessage(activeConversationId, messageId, text, handleTurnStatusEvent, signal));
      if (outcome.status === 'abandoned') return;
      await settleAfterTurn(activeConversationId, outcome.result);

      loadConversations();
    } catch (e: any) {
      if (e instanceof AssistantTurnDisconnectedError) {
        await handleLostTurn(activeConversationId);
        return;
      }
      if (e instanceof AssistantTurnBusyError) {
        toast.error(t('assistant.turnBusy', 'The assistant is still working in this chat — nothing was sent.'));
        void attachToActiveTurn(activeConversationId, e.activeTurn);
        return;
      }
      toast.error(e?.message || 'Failed to edit message');
      if (activeConversationId) refreshResources(activeConversationId);
    } finally {
      releaseTurnIndicator();
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
          const resultText = toolMessage.toolResultJson != null
            ? prettyToolData(toolMessage.toolResultJson)
            : prettyToolData(unwrapToolResult(toolMessage.content));

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
    ? `/assistant/settings?returnTo=/assistant/${activeConversationId}`
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
            <div className="flex items-center gap-1 flex-shrink-0">
              {activeConversationId && (
                <button
                  onClick={() => setApprovedToolsModalOpen(true)}
                  className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                  title={t('assistant.approvedTools.title', 'Tool approvals')}
                >
                  <ShieldCheck className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => navigate(settingsPath)}
                className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                title={t('assistant.chatSettings', { defaultValue: 'Chat settings' })}
              >
                <Settings2 className="w-5 h-5" />
              </button>
            </div>
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
            {activeConversationId && (
              <button
                onClick={() => setApprovedToolsModalOpen(true)}
                className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                title={t('assistant.approvedTools.title', 'Tool approvals')}
              >
                <ShieldCheck className="w-5 h-5" />
              </button>
            )}
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
              {messages.filter((m) => {
                if (m.role === 'system' || m.role === 'tool') return false;
                if (m.role === 'assistant') {
                  const hasContent = hasRenderableAssistantContent(m);
                  const hasTools = m.toolCalls && m.toolCalls.length > 0;
                  if (!hasContent && !hasTools) return false;
                }
                return true;
              }).map((msg, idx, arr) => (
                <div key={msg.id}>
                  {msg.role === 'user' && (
                    <div className="flex justify-end group/message">
                      {editingMessageId === msg.id ? (
                        <div className="max-w-[80%] w-full flex flex-col gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-card rounded-br-md px-4 py-3 shadow-sm relative">
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
                          <div className="bg-indigo-600 text-white rounded-card rounded-br-md px-4 py-3 shadow-sm w-full">
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
                                          const lineMatch = line.match(/- (Project|Library|Campaign|Post): "([^"]+)"/);
                                          if (!lineMatch) return null;

                                          const type = lineMatch[1] as BoundContextLabel;
                                          const name = lineMatch[2];
                                          const id = line.match(/ID: ([a-f0-9\-]+)/)?.[1] || '';
                                          const Icon = BOUND_CONTEXT_CHIP_ICONS[type];
                                          const href = boundContextHref(type, id);
                                          const previewable = type === 'Project' || type === 'Library';

                                          return (
                                            <div key={i} className="flex items-center gap-1">
                                              <button
                                                onClick={() => previewable && handleOpenPreview(type.toLowerCase() as 'project' | 'library', id)}
                                                disabled={!previewable}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 border border-white/30 text-[11px] font-medium text-white shadow-sm transition-all ${
                                                  href ? 'rounded-l-full border-r-0' : 'rounded-full'
                                                } ${previewable ? 'hover:bg-white/30 active:bg-white/40' : 'cursor-default'}`}
                                              >
                                                <Icon className="w-3.5 h-3.5" />
                                                {name}
                                              </button>
                                              {href && (
                                                <Link
                                                  to={href}
                                                  className="inline-flex items-center justify-center w-8 h-[26px] rounded-r-full bg-white/10 border border-white/30 text-white/60 hover:text-white hover:bg-white/30 transition-all"
                                                  title={`Open ${type}`}
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                </Link>
                                              )}
                                            </div>
                                          );
                                       })}
                                     </div>
                                   )}
                                 </div>
                               );
                            })()}
                          </div>
                          <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover/message:opacity-100 transition-opacity mt-0.5 mr-1">
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
                                  <div className={`bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl rounded-card rounded-tl-md px-4 py-3 shadow-sm border border-white/40 dark:border-white/10 ${
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
                              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all opacity-100 lg:opacity-0 lg:group-hover/message:opacity-100"
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
                      {isReconnecting
                        ? t('assistant.reconnecting', 'Reconnecting to the assistant...')
                        : currentToolTitle || currentThinkingTitle || t('assistant.thinking', 'Thinking...')}
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
                  key={`assistant-hero-${composerDraft.key}`}
                  initialInputText={composerDraft.inputText}
                  initialBoundContexts={composerDraft.boundContexts}
                  initialAttachedImages={composerDraft.attachedImages}
                  selectedProviderId={selectedProviderId}
                  setSelectedProviderId={setSelectedProviderId}
                  selectedModelId={selectedModelId}
                  setSelectedModelId={setSelectedModelId}
                  contextUsageTokens={contextUsageTokens}
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
                composerRef={composerHandleRef}
                selectedProviderId={selectedProviderId}
                setSelectedProviderId={setSelectedProviderId}
                selectedModelId={selectedModelId}
                setSelectedModelId={setSelectedModelId}
                contextUsageTokens={contextUsageTokens}
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
        fixed top-16 bottom-0 right-0 z-40 lg:static
        ${rightPanelOpen ? 'translate-x-0 w-[85vw] sm:w-80 lg:w-64' : 'translate-x-full lg:translate-x-0 w-[85vw] sm:w-80 lg:w-16'}
        flex-shrink-0 border-l border-neutral-200/50 dark:border-white/5
        bg-white dark:bg-neutral-950 lg:bg-white/10 lg:dark:bg-black/10 backdrop-blur-xl
        transition-ui duration-300 flex flex-col shadow-2xl lg:shadow-none
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
                  <>
                    <button
                      onClick={() => navigate('/assistant/history')}
                      className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                      title={t('assistant.searchHistory', { defaultValue: 'Search chat history' })}
                    >
                      <Search className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleNewConversationClick}
                      className="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                      title={t('assistant.newChat')}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </>
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
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
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

              {activeConversationId && resources.length > 0 && (
                <AssistantResourcePanel
                  resources={resources}
                  onMention={handleMentionResource}
                  onRemove={handleRemoveResource}
                  onNavigate={() => {
                    if (window.innerWidth < 1024) setRightPanelOpen(false);
                  }}
                />
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
          tagMatchMode={previewTagMatchMode}
          onUpdateTagMatchMode={setPreviewTagMatchMode}
          onClose={() => {
            setPreviewLibrary(null);
            setPreviewSelectedTags([]);
            setPreviewTagMatchMode('or');
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

      <ApprovedToolsModal
        isOpen={approvedToolsModalOpen}
        conversationId={activeConversationId}
        onClose={() => setApprovedToolsModalOpen(false)}
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

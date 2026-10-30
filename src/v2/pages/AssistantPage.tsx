import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AssistantTurnBusyError,
  AssistantTurnDisconnectedError,
  cancelAssistantTurn,
  confirmAssistantTool,
  createAssistantConversation,
  deleteAssistantConversation,
  deleteAssistantConversationResource,
  editAssistantMessage,
  fetchAssistantConversation,
  fetchAssistantConversationResources,
  fetchAssistantConversations,
  fetchAssistantProviders,
  fetchLibrary,
  fetchProject,
  fetchProjectWorkflow,
  sendAssistantMessage,
  streamAssistantTurn,
  summarizeAssistantConversationTitle,
  updateAssistantConversation,
  type AssistantActiveTurn,
  type AssistantConversation,
  type AssistantConversationResource,
  type AssistantMessage,
  type AssistantPendingConfirmation,
  type AssistantStatusEvent,
  type AssistantTurnResult,
} from '../../api';
import { filterEnabledAssistantProviders, normalizeAssistantProviderSelection } from '../../lib/assistant-provider-settings';
import { consumePwaShareHandoff } from '../../lib/pwa-share';
import {
  Avatar,
  Button,
  ChatMessage,
  ChatThoughtAccordion,
  Icon,
  IconButton,
  LoadingIndicator,
  SideSheet,
  Text,
  TextField,
  cx,
  useMediaQuery,
} from '../../m3';
import type { Library, Project, Provider } from '../../types';
import { getTextModelsForProvider } from '../../types';
import { ApprovedToolsDialog } from '../components/assistant/ApprovedToolsDialog';
import { Composer, type AttachedImage, type BoundContext, type ComposerHandle } from '../components/assistant/Composer';
import { AssistantHero } from '../components/assistant/Hero';
import { ResourcePanel } from '../components/assistant/ResourcePanel';
import { Lightbox } from '../components/Lightbox';
import { LibraryPreviewDialog } from '../components/project/LibraryPreviewDialog';
import { ProjectPreviewDialog } from '../components/project/ProjectPreviewDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { JsonView } from '../ui/JsonView';
import { Markdown } from '../ui/Markdown';
import { LoadingState } from '../ui/Page';
import { useToast } from '../ui/useToast';

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

const BOUND_CONTEXT_CHIP_ICONS: Record<BoundContextLabel, string> = {
  Project: 'auto_awesome',
  Library: 'folder_open',
  Campaign: 'campaign',
  Post: 'description',
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
  const toast = useToast();
  // Wide enough to keep the conversation list docked beside the chat.
  const docked = useMediaQuery('(min-width: 1200px)', true);
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
    if (window.innerWidth < 1200) return false;
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
  // Stop was pressed; the turn's stream is still open until the loop winds down.
  const [isStopping, setIsStopping] = useState(false);

  const justCreatedIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerHandleRef = useRef<ComposerHandle | null>(null);

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
    // Another tab (or this one, before a reload) may have pressed Stop.
    if (event.type === 'stop_requested') setIsStopping(true);
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
        } catch (e) {
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
    setIsStopping(false);
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
    setIsStopping(activeTurn?.stopping === true);
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
    } catch (e) {
      if (activeConversationIdRef.current !== conversationId) return;
      if (e instanceof AssistantTurnDisconnectedError) {
        await handleLostTurn(conversationId);
      } else {
        toast.error((e as Error)?.message || 'Failed to follow the assistant');
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
    } catch (e) {
      toast.error((e as Error)?.message || `Failed to fetch ${type} details`);
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
    void consumePwaShareHandoff().then((shared) => {
      if (shared) applyToComposer(shared);
    });
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
      } catch (e) {
        toast.error((e as Error)?.message || 'Failed to create conversation');
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
    } catch (e) {
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
      toast.error((e as Error)?.message || 'Failed to send message');
      // A tool may have landed before the turn failed — keep the sidebar honest.
      if (currentConversationId) refreshResources(currentConversationId);
    } finally {
      releaseTurnIndicator();
    }
  };

  // ─── Stop the running turn ───
  // Only asks the server to stop. The stream that is following the turn stays
  // open and settles the transcript when the turn reports `stopped`.
  const handleStop = async () => {
    const conversationId = streamingConversationRef.current ?? activeConversationId;
    if (!conversationId || isStopping) return;
    setIsStopping(true);
    try {
      const { stopping } = await cancelAssistantTurn(conversationId);
      // Nothing was running: the turn ended (or has yet to start) on its own.
      if (!stopping) setIsStopping(false);
    } catch (e) {
      setIsStopping(false);
      toast.error((e as Error)?.message || t('assistant.stopFailed', 'Could not stop the assistant.'));
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
    } catch (e) {
      if (e instanceof AssistantTurnDisconnectedError) {
        await handleLostTurn(activeConversationId);
        return;
      }
      if (e instanceof AssistantTurnBusyError) {
        toast.error(t('assistant.turnBusy', 'The assistant is still working in this chat — nothing was sent.'));
        void attachToActiveTurn(activeConversationId, e.activeTurn);
        return;
      }
      toast.error((e as Error)?.message || 'Failed to process confirmation');
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
    } catch (e) {
      setResources(previous);
      toast.error((e as Error)?.message || 'Failed to remove resource');
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
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to delete conversation');
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
    } catch (e) {
      if (e instanceof AssistantTurnDisconnectedError) {
        await handleLostTurn(activeConversationId);
        return;
      }
      if (e instanceof AssistantTurnBusyError) {
        toast.error(t('assistant.turnBusy', 'The assistant is still working in this chat — nothing was sent.'));
        void attachToActiveTurn(activeConversationId, e.activeTurn);
        return;
      }
      toast.error((e as Error)?.message || 'Failed to edit message');
      if (activeConversationId) refreshResources(activeConversationId);
    } finally {
      releaseTurnIndicator();
    }
  };


  // ─── Render helpers ───
  const renderAssistantToolCalls = (msg: AssistantMessage) => {
    if (!msg.toolCalls || msg.toolCalls.length === 0) return null;
    return (
      <div className="v2-chat-tools">
        {msg.toolCalls.map((tc) => {
          const toolMessage = messages.find((entry) => entry.role === 'tool' && entry.toolCallId === tc.id);
          if (!toolMessage) return null;
          const isError = toolMessage.status === 'error';
          const argsText = prettyToolData(toolMessage.toolArgsJson);
          const resultData = toolMessage.toolResultJson != null ? toolMessage.toolResultJson : unwrapToolResult(toolMessage.content);
          const resultText = prettyToolData(resultData);
          return (
            <details key={tc.id} className="v2-chat-tool" data-error={isError ? '' : undefined}>
              <summary>
                <Icon name={isError ? 'error' : 'build'} size={16} />
                <span className="v2-ellipsis">{formatToolTitle(tc.name)}</span>
              </summary>
              <div className="v2-chat-tool__body">
                {argsText && (
                  <div>
                    <Text variant="label-small" className="v2-chat-tool__label">{t('assistant.toolArguments', 'Arguments')}</Text>
                    <JsonView data={toolMessage.toolArgsJson} />
                  </div>
                )}
                {resultText && (
                  <div>
                    <Text variant="label-small" className="v2-chat-tool__label">{t('assistant.toolResult', 'Result')}</Text>
                    <JsonView data={resultData} />
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    );
  };

  const renderConfirmationCard = () => {
    if (!pendingConfirmation) return null;
    const proposalSummary = summarizePendingConfirmation(pendingConfirmation);
    return (
      <section className="v2-chat-confirm" role="alert">
        <div className="v2-chat-confirm__head">
          <Icon name="warning" size={20} />
          <Text variant="title-small">{t('assistant.confirmAction')}</Text>
        </div>
        {proposalSummary && (
          <div className="v2-chat-confirm__summary">
            <Text variant="label-small" className="text-on-surface-variant">{t('assistant.proposedChange', 'Proposed change')}</Text>
            <Text variant="body-medium">{proposalSummary}</Text>
          </div>
        )}
        {pendingConfirmation.toolArgsJson && <JsonView className="v2-chat-confirm__args" data={pendingConfirmation.toolArgsJson} />}
        <div className="v2-chat-confirm__actions">
          <Button variant="filled" size="sm" icon="check" disabled={isSending} onClick={() => handleConfirmation('confirm')}>
            {t('assistant.confirm')}
          </Button>
          <Button variant="tonal" size="sm" icon="done_all" disabled={isSending} onClick={() => handleConfirmation('confirm_tool')}>
            {t('assistant.confirmTool', 'Approve this tool in this session')}
          </Button>
          <Button variant="text" size="sm" icon="close" disabled={isSending} onClick={() => handleConfirmation('cancel')}>
            {t('assistant.cancel')}
          </Button>
        </div>
      </section>
    );
  };

  const thoughtAccordion = (thoughtContent: string) => (
    <ChatThoughtAccordion className="v2-chat-thought" thought={thoughtContent} title={t('assistant.thoughtProcess', 'Thought process')} />
  );

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

  const userMessageText = (content: string | null | undefined) => {
    const { textContent } = parseUserMessageImages(content);
    return textContent.replace(/<bound_context>[\s\S]*?<\/bound_context>/g, '').trim();
  };

  const copyText = (text: string | null | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(t('assistant.copied', { defaultValue: 'Copied to clipboard' }));
  };

  const renderUserMessage = (msg: AssistantMessage) => {
    if (editingMessageId === msg.id) {
      return (
        <div className="v2-chat-edit">
          <TextField
            multiline
            rows={3}
            autoFocus
            label={t('assistant.edit', { defaultValue: 'Edit message' })}
            value={editingMessageContent}
            onChange={(e) => setEditingMessageContent(e.target.value)}
          />
          <div className="v2-chat-edit__actions">
            <Button variant="text" size="sm" onClick={() => { setEditingMessageId(null); setEditingMessageContent(''); }}>
              {t('assistant.cancel', 'Cancel')}
            </Button>
            <Button variant="filled" size="sm" icon="send" disabled={isSending || !editingMessageContent.trim()} onClick={() => handleEditSubmit(msg.id)}>
              {t('assistant.saveAndSubmit', 'Save & Submit')}
            </Button>
          </div>
        </div>
      );
    }

    const { textContent: rawText, images: msgImages } = parseUserMessageImages(msg.content);
    const boundContextMatch = rawText.match(/<bound_context>([\s\S]*?)<\/bound_context>/);
    const cleanContent = rawText.replace(/<bound_context>[\s\S]*?<\/bound_context>/g, '').trim();
    const contextLines = boundContextMatch ? boundContextMatch[1].trim().split('\n').filter((l) => l.trim().startsWith('-')) : [];

    return (
      <ChatMessage
        message={{ id: msg.id, role: 'user', content: cleanContent }}
        showAvatar={false}
        actions={
          <>
            <IconButton size="xs" icon="content_copy" label={t('assistant.copy', { defaultValue: 'Copy text' })} tooltip onClick={() => copyText(userMessageText(msg.content))} />
            <IconButton
              size="xs"
              icon="edit"
              label={t('assistant.edit', { defaultValue: 'Edit message' })}
              tooltip
              onClick={() => {
                setEditingMessageId(msg.id);
                setEditingMessageContent(userMessageText(msg.content));
              }}
            />
          </>
        }
      >
        <div className="v2-chat-user">
          {msgImages.length > 0 && (
            <div className="v2-chat-user__images">
              {msgImages.map((src, i) => (
                <button key={i} type="button" className="v2-chat-user__image m3-focus-ring" onClick={() => setLightboxImage(src)}>
                  <img src={src} alt={`Attached ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
          {cleanContent && <Markdown className="v2-chat-markdown">{cleanContent}</Markdown>}
          {!cleanContent && contextLines.length === 0 && msgImages.length === 0 && (
            <Text variant="body-medium" className="v2-chat-user__muted">{t('assistant.boundResourcesSent', 'Bound resources referenced.')}</Text>
          )}
          {contextLines.length > 0 && (
            <div className="v2-chat-ctx-list">
              {contextLines.map((line, i) => {
                const lineMatch = line.match(/- (Project|Library|Campaign|Post): "([^"]+)"/);
                if (!lineMatch) return null;
                const type = lineMatch[1] as BoundContextLabel;
                const name = lineMatch[2];
                const id = line.match(/ID: ([a-f0-9\-]+)/)?.[1] || '';
                const href = boundContextHref(type, id);
                const previewable = type === 'Project' || type === 'Library';
                return (
                  <span key={i} className="v2-chat-ctx">
                    <button
                      type="button"
                      className="v2-chat-ctx__main m3-focus-ring"
                      disabled={!previewable}
                      onClick={() => previewable && handleOpenPreview(type.toLowerCase() as 'project' | 'library', id)}
                    >
                      <Icon name={BOUND_CONTEXT_CHIP_ICONS[type]} size={14} />
                      <span className="v2-ellipsis">{name}</span>
                    </button>
                    {href && (
                      <Link to={href} className="v2-chat-ctx__open m3-focus-ring" title={`Open ${type}`} aria-label={`Open ${type}`}>
                        <Icon name="open_in_new" size={14} />
                      </Link>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </ChatMessage>
    );
  };

  const renderAssistantMessage = (msg: AssistantMessage) => {
    const { thoughtContent, responseContent } = parseAssistantContent(msg.content);
    const showBubble = hasRenderableAssistantBubble(msg);
    const tokens = msg.inputTokens != null && msg.outputTokens != null ? `${msg.inputTokens}↑ ${msg.outputTokens}↓ tokens` : undefined;
    return (
      <ChatMessage
        message={{
          id: msg.id,
          role: 'assistant',
          content: responseContent || '',
          timestamp: tokens,
          status: msg.status === 'error' ? 'error' : 'sent',
          avatar: <Avatar src="/assistant-avatar.svg" name="Assistant" size={32} />,
        }}
        bubble={showBubble}
        before={thoughtContent && !responseContent ? thoughtAccordion(thoughtContent) : undefined}
        after={renderAssistantToolCalls(msg)}
        copyable={showBubble}
        onCopy={() => copyText(responseContent)}
      >
        {thoughtContent && responseContent && thoughtAccordion(thoughtContent)}
        {(responseContent || (!thoughtContent && msg.content)) && <Markdown className="v2-chat-markdown">{responseContent || msg.content || ''}</Markdown>}
      </ChatMessage>
    );
  };

  if (isLoading) {
    return <LoadingState minHeight={480} />;
  }

  const assistantTitle = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)?.title || t('assistant.title')
    : t('assistant.title');

  const settingsPath = activeConversationId
    ? `/assistant/settings?returnTo=/assistant/${activeConversationId}`
    : '/assistant/settings';

  const visibleMessages = messages.filter((m) => {
    if (m.role === 'system' || m.role === 'tool') return false;
    if (m.role === 'assistant') {
      const hasContent = hasRenderableAssistantContent(m);
      const hasTools = m.toolCalls && m.toolCalls.length > 0;
      if (!hasContent && !hasTools) return false;
    }
    return true;
  });

  const conversationsPanel = (
    <div className="v2-chat-side">
      <div className="v2-chat-side__list" role="list">
        {conversations.length === 0 ? (
          <Text variant="body-small" className="v2-chat-side__empty">{t('assistant.noConversations')}</Text>
        ) : (
          conversations.map((conv) => {
            const active = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                role="listitem"
                className="v2-chat-conv"
                data-active={active ? '' : undefined}
                onClick={() => {
                  if (!active) navigate(`/assistant/${conv.id}`);
                  if (!docked) setRightPanelOpen(false);
                }}
              >
                <Icon name="chat_bubble" size={18} />
                {editingTitle === conv.id ? (
                  <input
                    autoFocus
                    className="v2-chat-conv__input"
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(conv.id);
                      if (e.key === 'Escape') setEditingTitle(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="v2-chat-conv__title"
                    title={conv.title}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTitle(conv.id);
                      setEditingTitleValue(conv.title);
                    }}
                  >
                    {conv.title}
                  </span>
                )}
                <span className="v2-chat-conv__actions" onClick={(e) => e.stopPropagation()}>
                  <IconButton
                    size="xs"
                    icon="edit"
                    label={t('assistant.rename', { defaultValue: 'Rename' })}
                    onClick={() => {
                      setEditingTitle(conv.id);
                      setEditingTitleValue(conv.title);
                    }}
                  />
                  <IconButton size="xs" icon="delete" label={t('assistant.deleteConversation')} onClick={() => setDeleteTarget(conv.id)} />
                </span>
              </div>
            );
          })
        )}
      </div>
      {activeConversationId && resources.length > 0 && (
        <ResourcePanel
          resources={resources}
          onMention={handleMentionResource}
          onRemove={handleRemoveResource}
          onNavigate={() => {
            if (!docked) setRightPanelOpen(false);
          }}
        />
      )}
    </div>
  );

  return (
    <div className="v2-chat" data-docked={docked && rightPanelOpen ? '' : undefined}>
      <div className="v2-chat__main">
        <header className="v2-chat__header">
          <Text variant="title-large" className="v2-chat__title v2-ellipsis">{assistantTitle}</Text>
          <div className="v2-chat__header-actions">
            {activeConversationId && (
              <IconButton icon="verified_user" label={t('assistant.approvedTools.title', 'Tool approvals')} tooltip onClick={() => setApprovedToolsModalOpen(true)} />
            )}
            <IconButton icon="tune" label={t('assistant.chatSettings', { defaultValue: 'Chat settings' })} tooltip href={settingsPath} />
            <IconButton
              icon={rightPanelOpen ? 'right_panel_close' : 'right_panel_open'}
              label={rightPanelOpen
                ? t('assistant.collapseConversations', { defaultValue: 'Collapse conversations' })
                : t('assistant.expandConversations', { defaultValue: 'Expand conversations' })}
              tooltip
              selected={rightPanelOpen}
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
            />
          </div>
        </header>

        {activeConversationId ? (
          <>
            <div className="v2-chat__scroll">
              <div className="v2-chat__thread">
                {visibleMessages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === 'user' && renderUserMessage(msg)}
                    {msg.role === 'assistant' && renderAssistantMessage(msg)}
                  </div>
                ))}
                {isSending && (
                  <div className="m3-chat-message-row v2-chat-working" data-role="assistant" aria-live="polite">
                    <div className="m3-chat-avatar-slot v2-chat-working__avatar">
                      <Avatar src="/assistant-avatar.svg" name="Assistant" size={32} />
                      <LoadingIndicator size={44} className="v2-chat-working__ring" aria-label={t('assistant.thinking', 'Thinking...')} />
                    </div>
                    <Text variant="body-medium" className="v2-chat-working__label">
                      {isReconnecting
                        ? t('assistant.reconnecting', 'Reconnecting to the assistant...')
                        : isStopping
                          ? t('assistant.stopping', 'Stopping...')
                          : currentToolTitle || currentThinkingTitle || t('assistant.thinking', 'Thinking...')}
                    </Text>
                  </div>
                )}
                {renderConfirmationCard()}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="v2-chat__composer">
              <Composer
                composerRef={composerHandleRef}
                selectedProviderId={selectedProviderId}
                setSelectedProviderId={setSelectedProviderId}
                selectedModelId={selectedModelId}
                setSelectedModelId={setSelectedModelId}
                contextUsageTokens={contextUsageTokens}
                providers={providers}
                isSending={isSending}
                isStopping={isStopping}
                onSend={handleSend}
                onStop={handleStop}
              />
            </div>
          </>
        ) : (
          <div className="v2-chat__scroll v2-chat__hero">
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
        )}
      </div>

      <SideSheet
        open={rightPanelOpen}
        onClose={() => setRightPanelOpen(false)}
        modal={!docked}
        hideClose={docked}
        width={docked ? 300 : undefined}
        headline={t('assistant.conversations')}
        headerActions={
          <>
            <Button variant="tonal" size="sm" icon="add" className="v2-chat__new" onClick={handleNewConversationClick}>
              {t('assistant.newChat')}
            </Button>
            <IconButton
              icon="manage_search"
              size="sm"
              className="v2-chat__history"
              label={t('assistant.searchHistory', { defaultValue: 'Search chat history' })}
              tooltip
              onClick={() => navigate('/assistant/history')}
            />
          </>
        }
        className="v2-chat__sheet"
      >
        {conversationsPanel}
      </SideSheet>

      <ProjectPreviewDialog project={previewProject} libraries={[]} onClose={() => setPreviewProject(null)} />

      <LibraryPreviewDialog
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

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('assistant.deleteConversation')}
        message={t('assistant.deleteConfirm')}
        confirmLabel={t('confirmModal.confirm')}
        tone="danger"
        icon="delete"
        onConfirm={() => deleteTarget && handleDeleteConversation(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />

      <ApprovedToolsDialog open={approvedToolsModalOpen} conversationId={activeConversationId} onClose={() => setApprovedToolsModalOpen(false)} />

      {lightboxImage && <Lightbox images={[lightboxImage]} startIndex={0} onClose={() => setLightboxImage(null)} />}
    </div>
  );
}

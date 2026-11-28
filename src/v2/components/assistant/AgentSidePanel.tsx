import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  deleteAssistantBlackboardEntry,
  fetchAssistantConversationApprovedTools,
  fetchAssistantSwarmAgentTranscript,
  fetchAssistantSkills,
  stopAssistantSwarmAgent,
  updateAssistantConversationApprovedTools,
  type AssistantConversationResource,
  type AssistantMessage,
  type AssistantPendingConfirmation,
  type AssistantSwarmAgent,
  type AssistantSwarmBlackboardEntry,
  type AssistantSwarmPreset,
  type AssistantSwarmRun,
} from '../../../api';
import { DEFAULT_SWARM_PRESETS, formatSwarmPresetPrompt } from '../../../lib/assistant-swarm-presets';
import {
  Button,
  ChatThoughtAccordion,
  Dialog,
  Icon,
  IconButton,
  LoadingIndicator,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  Text,
} from '../../../m3';
import { getTextModelsForProvider, type Provider } from '../../../types';
import { useCopy } from '../../lib/useCopy';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { JsonView } from '../../ui/JsonView';
import { Markdown } from '../../ui/Markdown';
import { useToast } from '../../ui/useToast';
import { ProviderLogo } from '../ProviderLogo';
import { BOUND_CONTEXT_ICONS } from './Composer';
import { AgentGraph } from './AgentGraph';
import { McpAppFrame } from './McpAppFrame';

export interface LiveAgentActivity {
  thinking?: string;
  tool?: string;
  status?: string;
}

export interface LiveStepEntry {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  timestamp: number;
}

export interface AgentSidePanelProps {
  conversationId: string | null;
  providers: Provider[];
  selectedProviderId: string;
  selectedModelId: string;
  contextUsageTokens: number;
  swarmMode: boolean;
  onToggleSwarmMode: (enabled: boolean) => void;
  workerProviderId: string | null;
  workerModelId: string | null;
  onChangeWorkerModel: (providerId: string | null, modelId: string | null) => void;
  swarmPresets: AssistantSwarmPreset[];
  isSending: boolean;
  currentThinkingTitle: string;
  currentToolTitle: string;
  liveSteps: LiveStepEntry[];
  liveAgentActivity: Record<string, LiveAgentActivity>;
  swarmRuns: AssistantSwarmRun[];
  blackboardEntries: AssistantSwarmBlackboardEntry[];
  resources: AssistantConversationResource[];
  pendingConfirmations: AssistantPendingConfirmation[];
  appViews: Record<string, string>;
  inspectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  inspectedCoordinatorRunId?: string | null;
  onSelectCoordinatorRun?: (runId: string | null) => void;
  inspectedBlackboardRunId?: string | null;
  onSelectBlackboardRun?: (runId: string | null) => void;
  onConfirmSingle: (confirmation: AssistantPendingConfirmation, decision: 'confirm' | 'confirm_tool' | 'cancel') => Promise<void>;
  onConfirmAll: (decision: 'confirm' | 'cancel') => Promise<void>;
  onMentionResource: (resource: AssistantConversationResource) => void;
  onRemoveResource: (resource: AssistantConversationResource) => void;
  onBlackboardDeleted: (entryId: string) => void;
  onInsertComposerText: (text: string, enableSwarm?: boolean) => void;
  onOpenApprovedToolsDialog: () => void;
  onNavigate?: () => void;
  settingsPath: string;
}

function formatToolTitle(toolName: string | null | undefined) {
  return String(toolName || 'tool')
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

function parseThoughtAndBody(content: string | null | undefined) {
  if (!content) return { thought: null, body: '' };
  const thoughts: string[] = [];
  let clean = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner) => {
    thoughts.push(String(inner).trim());
    return '';
  });
  clean = clean.replace(/<think>([\s\S]*)$/i, (_m, inner) => {
    thoughts.push(String(inner).trim());
    return '';
  });
  return {
    thought: thoughts.filter(Boolean).join('\n\n') || null,
    body: clean.replace(/<\/?think>/gi, '').trim(),
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return 'check_circle';
    case 'failed':
      return 'error';
    case 'stopped':
      return 'cancel';
    case 'awaiting_confirmation':
      return 'warning';
    default:
      return 'schedule';
  }
}

type PanelSectionKey = 'roster' | 'resources' | 'blackboard' | 'approvals' | 'presets' | 'skills';

const PANEL_SECTIONS_STORAGE_KEY = 'assistant-agent-panel-sections';
const DEFAULT_OPEN_SECTIONS: Record<PanelSectionKey, boolean> = {
  roster: true,
  resources: true,
  blackboard: true,
  approvals: false,
  presets: false,
  skills: false,
};

function readSectionOpenState(): Record<PanelSectionKey, boolean> {
  try {
    const raw = localStorage.getItem(PANEL_SECTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_OPEN_SECTIONS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_OPEN_SECTIONS;
    return { ...DEFAULT_OPEN_SECTIONS, ...parsed };
  } catch {
    return DEFAULT_OPEN_SECTIONS;
  }
}

function CollapsibleSection({
  title,
  count,
  trailing,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number | string;
  trailing?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="v2-ap__section" data-collapsed={!open ? '' : undefined}>
      <div className="v2-ap__section-head">
        <button
          type="button"
          className="v2-ap__section-toggle m3-focus-ring"
          aria-expanded={open}
          onClick={onToggle}
        >
          <Icon name="expand_more" size={16} className="v2-ap__chevron" />
          <span className="v2-ap__section-title v2-ellipsis">{title}</span>
          {count !== undefined && <span className="v2-ap__count tabular-nums">{count}</span>}
        </button>
        {trailing}
      </div>
      {open && children}
    </section>
  );
}

/**
 * Restrained, flat, vertically stacked Material 3 Expressive Agent Side Panel.
 * Uses compact single-line rows separated by subtle hairlines instead of tabs
 * or nested cards, keeping density calm and scannable.
 */
export function AgentSidePanel({
  conversationId,
  providers,
  selectedProviderId,
  selectedModelId,
  contextUsageTokens,
  workerProviderId,
  workerModelId,
  onChangeWorkerModel,
  swarmPresets,
  isSending,
  currentThinkingTitle,
  currentToolTitle,
  liveSteps,
  liveAgentActivity,
  swarmRuns,
  blackboardEntries,
  resources,
  pendingConfirmations,
  appViews,
  inspectedAgentId,
  onSelectAgent,
  inspectedCoordinatorRunId = null,
  onSelectCoordinatorRun,
  inspectedBlackboardRunId = null,
  onSelectBlackboardRun,
  onConfirmSingle,
  onConfirmAll,
  onMentionResource,
  onRemoveResource,
  onBlackboardDeleted,
  onInsertComposerText,
  onOpenApprovedToolsDialog,
  onNavigate,
  settingsPath,
}: AgentSidePanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const copyToClipboard = useCopy();

  const [busyConfirmId, setBusyConfirmId] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);

  // Worker Inspector state
  const [inspectedAgent, setInspectedAgent] = useState<AssistantSwarmAgent | null>(null);
  const [inspectedMessages, setInspectedMessages] = useState<AssistantMessage[]>([]);
  const [inspectedPending, setInspectedPending] = useState<AssistantPendingConfirmation[]>([]);
  const [loadingInspector, setLoadingInspector] = useState(false);

  // Collapsible section open state (persisted in localStorage)
  const [openSections, setOpenSections] = useState<Record<PanelSectionKey, boolean>>(readSectionOpenState);
  const toggleSection = (key: PanelSectionKey) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(PANEL_SECTIONS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Progressive disclosure ("Show more") toggles
  const [showAllResources, setShowAllResources] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showEarlierRuns, setShowEarlierRuns] = useState(false);

  // Session approved tools & quick skills
  const [approvedTools, setApprovedTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [previewBoardEntry, setPreviewBoardEntry] = useState<AssistantSwarmBlackboardEntry | null>(null);
  const [selectedBoardEntryId, setSelectedBoardEntryId] = useState<string | null>(null);
  const [previewPreset, setPreviewPreset] = useState<AssistantSwarmPreset | null>(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<AssistantSwarmBlackboardEntry | null>(null);
  const [graphDialogOpen, setGraphDialogOpen] = useState(false);

  // Return targets so nested swarm dialogs (Graph → Coordinator / Blackboard / Worker) can navigate back.
  type ReturnTarget =
    | { kind: 'graph' }
    | { kind: 'coordinator'; runId: string };
  const [boardReturnTarget, setBoardReturnTarget] = useState<ReturnTarget | null>(null);
  const [coordinatorReturnTarget, setCoordinatorReturnTarget] = useState<ReturnTarget | null>(null);
  const [agentReturnTarget, setAgentReturnTarget] = useState<ReturnTarget | null>(null);

  const navigateBackTo = useCallback((target: ReturnTarget) => {
    setPreviewBoardEntry(null);
    setSelectedBoardEntryId(null);
    setBoardReturnTarget(null);
    setCoordinatorReturnTarget(null);
    setAgentReturnTarget(null);
    onSelectAgent(null);
    onSelectCoordinatorRun?.(null);
    onSelectBlackboardRun?.(null);
    setGraphDialogOpen(false);
    if (target.kind === 'graph') {
      setGraphDialogOpen(true);
    } else if (target.kind === 'coordinator') {
      onSelectCoordinatorRun?.(target.runId);
    }
  }, [onSelectAgent, onSelectBlackboardRun, onSelectCoordinatorRun]);

  const returnTargetLabel = (target: ReturnTarget) => {
    if (target.kind === 'graph') return t('v2.assistant.swarm.viewGraph', 'Architecture graph');
    return t('v2.assistant.swarm.coordinator', 'Coordinator');
  };

  const workerProvider = providers.find((p) => p.id === workerProviderId);
  const workerModel = workerProvider
    ? getTextModelsForProvider(workerProvider.type).find((m) => m.id === workerModelId)
    : null;

  const allPresets = useMemo(
    () => (swarmPresets.length > 0 ? [...swarmPresets, ...DEFAULT_SWARM_PRESETS] : DEFAULT_SWARM_PRESETS),
    [swarmPresets],
  );

  const loadWorkerTranscript = useCallback(async (agentId: string) => {
    if (!conversationId) return;
    setLoadingInspector(true);
    try {
      const data = await fetchAssistantSwarmAgentTranscript(conversationId, agentId);
      setInspectedAgent(data.agent);
      setInspectedMessages(data.messages);
      setInspectedPending(data.pendingConfirmations);
    } catch (e) {
      toast.error((e as Error)?.message || t('v2.assistant.swarm.loadWorkerFailed', 'Failed to load worker details'));
    } finally {
      setLoadingInspector(false);
    }
  }, [conversationId, t, toast]);

  useEffect(() => {
    if (!inspectedAgentId) {
      setInspectedAgent(null);
      setInspectedMessages([]);
      setInspectedPending([]);
      return;
    }
    void loadWorkerTranscript(inspectedAgentId);
  }, [inspectedAgentId, loadWorkerTranscript, swarmRuns]);

  useEffect(() => {
    let cancelled = false;
    if (conversationId) {
      fetchAssistantConversationApprovedTools(conversationId)
        .then((res) => { if (!cancelled) setApprovedTools(res.tools); })
        .catch(() => {});
    } else {
      setApprovedTools([]);
    }
    return () => { cancelled = true; };
  }, [conversationId, pendingConfirmations.length]);

  useEffect(() => {
    let cancelled = false;
    fetchAssistantSkills(1, 12)
      .then((res) => {
        if (cancelled) return;
        setSkills(res.items.map((item) => ({
          id: item.id,
          title: item.title.trim() || item.content.slice(0, 40),
          content: item.content,
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleRevokeApprovedTool = async (toolName: string) => {
    if (!conversationId) return;
    const next = approvedTools.filter((name) => name !== toolName);
    setApprovedTools(next);
    try {
      await updateAssistantConversationApprovedTools(conversationId, next);
    } catch {
      toast.error(t('assistant.approvedTools.saveFailed', 'Failed to update tool approval'));
    }
  };

  const handleStopWorker = async (agentId: string) => {
    if (!conversationId) return;
    try {
      await stopAssistantSwarmAgent(conversationId, agentId);
    } catch (e) {
      toast.error((e as Error)?.message || t('v2.assistant.swarm.stopWorkerFailed', 'Failed to stop worker'));
    }
  };

  const handleDeleteBoardEntry = async (entry: AssistantSwarmBlackboardEntry) => {
    if (!conversationId) return;
    try {
      await deleteAssistantBlackboardEntry(conversationId, entry.id);
      onBlackboardDeleted(entry.id);
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to delete draft');
    } finally {
      setDeleteBoardTarget(null);
    }
  };

  const latestSwarmRun = swarmRuns[0] ?? null;
  const earlierSwarmRuns = swarmRuns.slice(1);
  const visibleResources = showAllResources ? resources : resources.slice(0, 5);
  const visiblePresets = showAllPresets ? allPresets : allPresets.slice(0, 3);
  const visibleSkills = showAllSkills ? skills : skills.slice(0, 3);

  const coordinatorModelLabel = useMemo(() => {
    if (!selectedProviderId || !selectedModelId) return undefined;
    const providerType = providers.find((p) => p.id === selectedProviderId)?.type ?? 'GoogleAI';
    return getTextModelsForProvider(providerType).find((m) => m.id === selectedModelId)?.name;
  }, [providers, selectedProviderId, selectedModelId]);

  const inspectedCoordinatorRun = useMemo(
    () => (inspectedCoordinatorRunId ? swarmRuns.find((r) => r.id === inspectedCoordinatorRunId) ?? null : null),
    [inspectedCoordinatorRunId, swarmRuns],
  );

  const inspectedBlackboardRun = useMemo(
    () => (inspectedBlackboardRunId ? swarmRuns.find((r) => r.id === inspectedBlackboardRunId) ?? null : null),
    [inspectedBlackboardRunId, swarmRuns],
  );

  const inspectedBlackboardEntries = useMemo(() => {
    if (!inspectedBlackboardRun) return [];
    const agentNames = new Set(inspectedBlackboardRun.agents.map((a) => a.name));
    return blackboardEntries.filter(
      (entry) =>
        (entry.swarmRunId && entry.swarmRunId === inspectedBlackboardRun.id) ||
        agentNames.has(entry.authorName),
    );
  }, [blackboardEntries, inspectedBlackboardRun]);

  const activeBoardEntries = useMemo(() => {
    if (inspectedBlackboardRun) return inspectedBlackboardEntries;
    if (previewBoardEntry) return [previewBoardEntry];
    return [];
  }, [inspectedBlackboardEntries, inspectedBlackboardRun, previewBoardEntry]);

  const activeBoardEntry = useMemo(() => {
    if (activeBoardEntries.length === 0) return null;
    return activeBoardEntries.find((e) => e.id === selectedBoardEntryId) ?? activeBoardEntries[0];
  }, [activeBoardEntries, selectedBoardEntryId]);

  const closeSwarmModal = useCallback(() => {
    setGraphDialogOpen(false);
    setPreviewBoardEntry(null);
    setSelectedBoardEntryId(null);
    setBoardReturnTarget(null);
    setCoordinatorReturnTarget(null);
    setAgentReturnTarget(null);
    onSelectAgent(null);
    onSelectCoordinatorRun?.(null);
    onSelectBlackboardRun?.(null);
  }, [onSelectAgent, onSelectBlackboardRun, onSelectCoordinatorRun]);

  // ─── Worker Inspector Dialog data ───
  const inspectedLive = inspectedAgentId ? liveAgentActivity[inspectedAgentId] : undefined;
  const activeInspectedAgent = inspectedAgentId
    ? (inspectedAgent ?? swarmRuns.flatMap((r) => r.agents).find((a) => a.id === inspectedAgentId) ?? null)
    : null;
  const inspectedIsRunning = activeInspectedAgent?.status === 'running' || activeInspectedAgent?.status === 'queued';
  const inspectedToolByCallId = useMemo(() => {
    const map = new Map<string, AssistantMessage>();
    for (const m of inspectedMessages) {
      if (m.role === 'tool' && m.toolCallId) map.set(m.toolCallId, m);
    }
    return map;
  }, [inspectedMessages]);

  return (
    <div className="v2-ap">
      <div className="v2-ap__scroll">
        {/* ─── Swarm Worker Model ─── */}
        <section className="v2-ap__section">
          <div className="v2-ap__section-title">{t('v2.assistant.swarm.workerModel', 'Swarm worker model')}</div>

          <MenuButton
            placement="bottom-start"
            aria-label={t('v2.assistant.swarm.workerModel', 'Swarm worker model')}
            trigger={(props) => (
              <button {...props} type="button" className="v2-ap__row v2-ap__row--interactive m3-focus-ring">
                <span className="v2-ap__lead">
                  {workerProvider ? <ProviderLogo type={workerProvider.type} size={16} /> : <Icon name="hub" size={16} />}
                </span>
                <span className="v2-ap__row-label v2-ellipsis">
                  {workerModel?.name || t('v2.assistant.swarm.sameAsCoordinator', 'Same as Coordinator')}
                </span>
                <Icon name="unfold_more" size={15} className="v2-ap__trail-icon" />
              </button>
            )}
          >
            <MenuItem
              icon="sync"
              selected={!workerProviderId}
              onSelect={() => onChangeWorkerModel(null, null)}
            >
              {t('v2.assistant.swarm.sameAsCoordinator', 'Same as Coordinator')}
            </MenuItem>
            {providers.map((provider) => {
              const models = getTextModelsForProvider(provider.type);
              if (models.length === 0) return null;
              return [
                <MenuDivider key={`${provider.id}-div`} />,
                <MenuGroup key={provider.id} label={provider.name}>
                  {models.map((model) => (
                    <MenuItem
                      key={`${provider.id}::${model.id}`}
                      icon={<ProviderLogo type={provider.type} size={16} />}
                      type="radio"
                      checked={provider.id === workerProviderId && model.id === workerModelId}
                      onSelect={() => onChangeWorkerModel(provider.id, model.id)}
                    >
                      {model.name}
                    </MenuItem>
                  ))}
                </MenuGroup>,
              ];
            })}
          </MenuButton>
        </section>

        {/* ─── Swarm Roster or Live Activity ─── */}
        {(latestSwarmRun || isSending || liveSteps.length > 0) && (
          <CollapsibleSection
            title={latestSwarmRun
              ? t('v2.assistant.swarm.roster', 'Active agents')
              : t('v2.assistant.agentPanel.activity', 'Activity')}
            count={latestSwarmRun ? latestSwarmRun.agents.length : (liveSteps.length || undefined)}
            trailing={latestSwarmRun ? (
              <span className="flex items-center gap-1">
                <span className="v2-ap__row-sub">{latestSwarmRun.status}</span>
                <IconButton
                  size="xs"
                  icon="account_tree"
                  label={t('v2.assistant.swarm.viewGraph', 'Architecture graph')}
                  tooltip
                  onClick={() => setGraphDialogOpen(true)}
                />
              </span>
            ) : undefined}
            open={openSections.roster}
            onToggle={() => toggleSection('roster')}
          >
            {latestSwarmRun ? (
              <>
                {latestSwarmRun.agents.map((agent) => {
                  const live = liveAgentActivity[agent.id];
                  const isRunning = agent.status === 'running' || agent.status === 'queued';
                  return (
                    <div
                      key={agent.id}
                      role="button"
                      tabIndex={0}
                      className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
                      onClick={() => onSelectAgent(agent.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectAgent(agent.id);
                        }
                      }}
                    >
                      <span className="v2-ap__lead" data-status={agent.status}>
                        {isRunning ? <LoadingIndicator size={15} aria-hidden /> : <Icon name={statusIcon(agent.status)} size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="v2-ap__row-label v2-ellipsis">{agent.name}</div>
                        <div className="v2-ap__row-sub v2-ellipsis">
                          {isRunning ? (live?.tool || live?.thinking || agent.role) : agent.role}
                        </div>
                      </div>
                      {isRunning ? (
                        <span onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            size="xs"
                            icon="stop_circle"
                            label={t('v2.assistant.swarm.stopWorker', 'Stop worker')}
                            onClick={() => void handleStopWorker(agent.id)}
                          />
                        </span>
                      ) : (
                        <Icon name="chevron_right" size={15} className="v2-ap__trail-icon" />
                      )}
                    </div>
                  );
                })}

                {earlierSwarmRuns.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="v2-ap__more m3-focus-ring"
                      onClick={() => setShowEarlierRuns((v) => !v)}
                    >
                      {showEarlierRuns
                        ? t('v2.assistant.agentPanel.showLess', 'Show less')
                        : t('v2.assistant.swarm.earlierRuns', {
                            defaultValue: 'Earlier swarm runs ({{count}})',
                            count: earlierSwarmRuns.length,
                          })}
                    </button>
                    {showEarlierRuns && earlierSwarmRuns.flatMap((run) =>
                      run.agents.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
                          onClick={() => onSelectAgent(a.id)}
                        >
                          <span className="v2-ap__lead" data-status={a.status}>
                            <Icon name={statusIcon(a.status)} size={15} />
                          </span>
                          <span className="v2-ap__row-label v2-ellipsis">{a.name}</span>
                          <span className="v2-ap__row-sub">{a.role}</span>
                        </button>
                      )),
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {isSending && (
                  <div className="v2-ap__row">
                    <span className="v2-ap__lead">
                      <LoadingIndicator size={15} aria-hidden />
                    </span>
                    <span className="v2-ap__row-sub v2-ellipsis">
                      {currentToolTitle || currentThinkingTitle || t('assistant.loading', 'Thinking...')}
                    </span>
                  </div>
                )}
                {liveSteps.slice(-6).reverse().map((step) => (
                  <div key={step.id} className="v2-ap__row">
                    <span className="v2-ap__lead" data-status={step.status === 'error' ? 'failed' : step.status === 'done' ? 'completed' : 'running'}>
                      <Icon
                        name={step.status === 'error' ? 'error' : step.status === 'done' ? 'check_circle' : 'pending'}
                        size={15}
                      />
                    </span>
                    <span className="v2-ap__row-label v2-ellipsis">{step.label}</span>
                  </div>
                ))}
              </>
            )}
          </CollapsibleSection>
        )}

        {/* ─── Resources (Outputs touched in this conversation) ─── */}
        {resources.length > 0 && (
          <CollapsibleSection
            title={t('v2.assistant.agentPanel.resources', 'Resources')}
            count={resources.length}
            open={openSections.resources}
            onToggle={() => toggleSection('resources')}
          >
            {visibleResources.map((resource) => {
              const label = resource.name || resource.entityId;
              return (
                <div key={resource.id} className="v2-ap__row v2-ap__row--hover-actions">
                  <span className="v2-ap__lead">
                    <Icon name={BOUND_CONTEXT_ICONS[resource.entityType] ?? 'folder_open'} size={16} />
                  </span>
                  <Link
                    to={resource.href}
                    onClick={onNavigate}
                    className="v2-ap__row-link v2-ellipsis"
                    title={resource.summary || label}
                  >
                    {label}
                  </Link>
                  <span className="v2-ap__hover-actions">
                    <IconButton
                      size="xs"
                      icon="alternate_email"
                      label={t('assistant.mentionResource', 'Mention in chat')}
                      tooltip
                      onClick={() => onMentionResource(resource)}
                    />
                    <IconButton
                      size="xs"
                      icon="close"
                      label={t('assistant.removeResource', 'Remove from list')}
                      tooltip
                      onClick={() => onRemoveResource(resource)}
                    />
                  </span>
                </div>
              );
            })}
            {resources.length > 5 && (
              <button
                type="button"
                className="v2-ap__more m3-focus-ring"
                onClick={() => setShowAllResources((v) => !v)}
              >
                {showAllResources
                  ? t('v2.assistant.agentPanel.showLess', 'Show less')
                  : t('v2.assistant.agentPanel.showMore', 'Show more')}
              </button>
            )}
          </CollapsibleSection>
        )}

        {/* ─── Shared Blackboard (only when entries exist) ─── */}
        {blackboardEntries.length > 0 && (
          <CollapsibleSection
            title={t('v2.assistant.swarm.blackboardTitle', 'Shared blackboard & drafts')}
            count={blackboardEntries.length}
            open={openSections.blackboard}
            onToggle={() => toggleSection('blackboard')}
          >
            {blackboardEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
                onClick={() => setPreviewBoardEntry(entry)}
              >
                <span className="v2-ap__lead"><Icon name="description" size={16} /></span>
                <span className="v2-ap__row-label v2-ellipsis">{entry.title || entry.key}</span>
                <span className="v2-ap__row-sub">{entry.authorName}</span>
              </button>
            ))}
          </CollapsibleSection>
        )}

        {/* ─── Tool Approvals ─── */}
        {conversationId && (
          <CollapsibleSection
            title={t('assistant.approvedTools.title', 'Tool approvals')}
            count={approvedTools.length}
            trailing={
              <button type="button" className="v2-ap__text-action m3-focus-ring" onClick={onOpenApprovedToolsDialog}>
                {t('v2.assistant.swarm.manage', 'Manage')}
              </button>
            }
            open={openSections.approvals}
            onToggle={() => toggleSection('approvals')}
          >
            {approvedTools.length === 0 ? (
              <Text variant="body-small" className="v2-ap__muted-line text-on-surface-variant">
                {t('v2.assistant.agentPanel.noAutoApproved', 'All write actions ask for confirmation first.')}
              </Text>
            ) : (
              approvedTools.map((toolName) => (
                <div key={toolName} className="v2-ap__row v2-ap__row--hover-actions">
                  <span className="v2-ap__lead"><Icon name="verified_user" size={15} /></span>
                  <span className="v2-ap__row-label v2-ellipsis">{formatToolTitle(toolName)}</span>
                  <span className="v2-ap__hover-actions">
                    <IconButton
                      size="xs"
                      icon="close"
                      label={`Revoke ${toolName}`}
                      onClick={() => void handleRevokeApprovedTool(toolName)}
                    />
                  </span>
                </div>
              ))
            )}
          </CollapsibleSection>
        )}

        {/* ─── Swarm Presets ─── */}
        <CollapsibleSection
          title={t('v2.assistant.swarm.presetsTitle', 'Swarm presets')}
          count={allPresets.length}
          open={openSections.presets}
          onToggle={() => toggleSection('presets')}
        >
          {visiblePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
              title={preset.description}
              onClick={() => setPreviewPreset(preset)}
            >
              <span className="v2-ap__lead"><Icon name="groups" size={16} /></span>
              <span className="v2-ap__row-label v2-ellipsis">{preset.name}</span>
              <span className="v2-ap__row-sub tabular-nums">{preset.workers.length}</span>
            </button>
          ))}
          {allPresets.length > 3 && (
            <button
              type="button"
              className="v2-ap__more m3-focus-ring"
              onClick={() => setShowAllPresets((v) => !v)}
            >
              {showAllPresets
                ? t('v2.assistant.agentPanel.showLess', 'Show less')
                : t('v2.assistant.agentPanel.showMore', 'Show more')}
            </button>
          )}
        </CollapsibleSection>

        {/* ─── Quick Skills (only when available) ─── */}
        {skills.length > 0 && (
          <CollapsibleSection
            title={t('v2.assistant.agentPanel.quickSkills', 'Quick skills')}
            count={skills.length}
            open={openSections.skills}
            onToggle={() => toggleSection('skills')}
          >
            {visibleSkills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
                onClick={() => {
                  onInsertComposerText(skill.content);
                  onNavigate?.();
                }}
              >
                <span className="v2-ap__lead"><Icon name="bolt" size={15} /></span>
                <span className="v2-ap__row-label v2-ellipsis">{skill.title}</span>
              </button>
            ))}
            {skills.length > 3 && (
              <button
                type="button"
                className="v2-ap__more m3-focus-ring"
                onClick={() => setShowAllSkills((v) => !v)}
              >
                {showAllSkills
                  ? t('v2.assistant.agentPanel.showLess', 'Show less')
                  : t('v2.assistant.agentPanel.showMore', 'Show more')}
              </button>
            )}
          </CollapsibleSection>
        )}
      </div>

      <Dialog
        open={Boolean(inspectedAgentId || inspectedCoordinatorRun || activeBoardEntry || (graphDialogOpen && latestSwarmRun))}
        onClose={closeSwarmModal}
        fullScreen="compact"
        showCloseButton
        describeContent={false}
        maxWidth={860}
        headline={
          inspectedAgentId
            ? (activeInspectedAgent?.name || 'Agent')
            : inspectedCoordinatorRun
              ? t('v2.assistant.swarm.coordinator', 'Coordinator')
              : activeBoardEntry
                ? (
                    activeBoardEntries.length > 1
                      ? t('v2.assistant.swarm.blackboardShort', 'Shared blackboard')
                      : (activeBoardEntry.title || activeBoardEntry.key)
                  )
                : t('v2.assistant.swarm.graphTitle', 'Agent architecture')
        }
        confirmAction={
          inspectedAgentId && inspectedIsRunning ? (
            <Button variant="text" size="sm" onClick={() => void handleStopWorker(inspectedAgentId)}>
              {t('v2.assistant.swarm.stopWorker', 'Stop worker')}
            </Button>
          ) : !inspectedAgentId && !inspectedCoordinatorRun && activeBoardEntry ? (
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                onInsertComposerText(activeBoardEntry.content);
                closeSwarmModal();
                onNavigate?.();
              }}
            >
              {t('v2.assistant.swarm.insertIntoComposer', 'Insert into composer')}
            </Button>
          ) : undefined
        }
        actions={
          inspectedAgentId ? (
            <>
              {agentReturnTarget ? (
                <Button
                  variant="text"
                  size="sm"
                  icon="arrow_back"
                  onClick={() => navigateBackTo(agentReturnTarget)}
                >
                  {returnTargetLabel(agentReturnTarget)}
                </Button>
              ) : latestSwarmRun ? (
                <Button
                  variant="text"
                  size="sm"
                  icon="arrow_back"
                  onClick={() => {
                    setGraphDialogOpen(true);
                    onSelectAgent(null);
                  }}
                >
                  {t('v2.assistant.swarm.viewGraph', 'Architecture graph')}
                </Button>
              ) : null}
              {inspectedIsRunning && (
                <Button variant="tonal" size="sm" icon="stop_circle" onClick={() => void handleStopWorker(inspectedAgentId)}>
                  {t('v2.assistant.swarm.stopWorker', 'Stop worker')}
                </Button>
              )}
              <Button variant="text" size="sm" icon="refresh" onClick={() => void loadWorkerTranscript(inspectedAgentId)}>
                {t('v2.assistant.swarm.refresh', 'Refresh')}
              </Button>
            </>
          ) : inspectedCoordinatorRun ? (
            coordinatorReturnTarget ? (
              <Button
                variant="text"
                size="sm"
                icon="arrow_back"
                onClick={() => navigateBackTo(coordinatorReturnTarget)}
              >
                {returnTargetLabel(coordinatorReturnTarget)}
              </Button>
            ) : undefined
          ) : activeBoardEntry ? (
            <>
              {boardReturnTarget && (
                <Button
                  variant="text"
                  size="sm"
                  icon="arrow_back"
                  onClick={() => navigateBackTo(boardReturnTarget)}
                >
                  {returnTargetLabel(boardReturnTarget)}
                </Button>
              )}
              <Button
                variant="text"
                size="sm"
                icon="delete"
                onClick={() => {
                  const target = activeBoardEntry;
                  closeSwarmModal();
                  setDeleteBoardTarget(target);
                }}
              >
                {t('v2.assistant.swarm.delete', 'Delete')}
              </Button>
              <Button
                variant="tonal"
                size="sm"
                icon="content_copy"
                onClick={() => void copyToClipboard(activeBoardEntry.content, t('v2.common.copied', 'Copied to clipboard'))}
              >
                {t('v2.assistant.copy', 'Copy text')}
              </Button>
              <Button
                variant="filled"
                size="sm"
                icon="input"
                onClick={() => {
                  onInsertComposerText(activeBoardEntry.content);
                  closeSwarmModal();
                  onNavigate?.();
                }}
              >
                {t('v2.assistant.swarm.insertIntoComposer', 'Insert into composer')}
              </Button>
            </>
          ) : undefined
        }
      >
        {inspectedAgentId ? (
        <div key={`agent-${inspectedAgentId}`} className="v2-swarm-dialog-view flex flex-col gap-3">
          {activeInspectedAgent && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="v2-swarm-status-pill" data-status={activeInspectedAgent.status}>
                  {activeInspectedAgent.status}
                </span>
                <Text variant="label-small" className="text-on-surface-variant">
                  {activeInspectedAgent.role} · {activeInspectedAgent.toolScope}
                  {activeInspectedAgent.modelConfigId ? ` · ${activeInspectedAgent.modelConfigId}` : ''}
                  {' · '}
                  {formatTokens(activeInspectedAgent.inputTokens)}↑ {formatTokens(activeInspectedAgent.outputTokens)}↓
                </Text>
              </div>
              <details className="v2-ap__disclosure">
                <summary className="v2-ap__section-title m3-focus-ring">
                  {t('v2.assistant.swarm.assignmentBrief', 'Assignment brief')}
                </summary>
                <p className="v2-ap__brief">{activeInspectedAgent.brief}</p>
              </details>
            </>
          )}

          {inspectedPending.length > 0 && inspectedAgentId && (
            <div className="v2-ap__approvals">
              {inspectedPending.map((conf) => (
                <div key={conf.id} className="v2-ap__approval-item">
                  <div className="v2-ap__row-label">{conf.summary || formatToolTitle(conf.toolName)}</div>
                  <div className="v2-ap__approval-actions">
                    <Button
                      size="xs"
                      variant="filled"
                      disabled={busyConfirmId === conf.id}
                      onClick={async () => {
                        setBusyConfirmId(conf.id);
                        try {
                          await onConfirmSingle(conf, 'confirm');
                          await loadWorkerTranscript(inspectedAgentId);
                        } finally {
                          setBusyConfirmId(null);
                        }
                      }}
                    >
                      {t('assistant.confirm', 'Confirm')}
                    </Button>
                    <Button
                      size="xs"
                      variant="text"
                      disabled={busyConfirmId === conf.id}
                      onClick={async () => {
                        setBusyConfirmId(conf.id);
                        try {
                          await onConfirmSingle(conf, 'cancel');
                          await loadWorkerTranscript(inspectedAgentId);
                        } finally {
                          setBusyConfirmId(null);
                        }
                      }}
                    >
                      {t('assistant.cancel', 'Cancel')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadingInspector && inspectedMessages.length === 0 ? (
            <div className="v2-center-pad">
              <LoadingIndicator size={28} aria-label={t('projectViewer.common.loading', 'Loading')} />
            </div>
          ) : (
            <div className="v2-ap__transcript">
              {inspectedMessages.map((msg) => {
                if (msg.role === 'user' || msg.role === 'tool' || msg.role === 'system') return null;
                const { thought, body } = parseThoughtAndBody(msg.content);
                return (
                  <div key={msg.id} className="v2-ap__msg">
                    {thought && (
                      <ChatThoughtAccordion
                        className="v2-chat-thought"
                        thought={thought}
                        title={t('v2.assistant.thoughtProcess', 'Thought process')}
                      />
                    )}
                    {body && <Markdown className="v2-chat-markdown">{body}</Markdown>}
                    {(msg.toolCalls ?? []).map((call) => {
                      const toolMsg = inspectedToolByCallId.get(call.id);
                      const isErr = toolMsg?.status === 'error';
                      const resData = toolMsg?.toolResultJson ?? unwrapToolResult(toolMsg?.content);
                      return (
                        <div key={call.id} className="v2-worker-tool-wrap">
                          <details className="v2-chat-tool" data-error={isErr ? '' : undefined}>
                            <summary className="m3-focus-ring">
                              <Icon name={isErr ? 'error' : 'check_circle'} size={14} />
                              <span className="v2-ellipsis">{formatToolTitle(call.name)}</span>
                            </summary>
                            <div className="v2-chat-tool__body">
                              {toolMsg?.toolArgsJson != null && <JsonView data={toolMsg.toolArgsJson} />}
                              {resData != null && resData !== '' && <JsonView data={resData} />}
                            </div>
                          </details>
                          {conversationId && appViews[call.name] && toolMsg && !isErr && (
                            <McpAppFrame
                              conversationId={conversationId}
                              toolCallId={call.id}
                              resourceUri={appViews[call.name]}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {inspectedIsRunning && (
                <div className="v2-ap__row">
                  <LoadingIndicator size={16} aria-hidden />
                  <span className="v2-ap__row-sub v2-ellipsis">
                    {inspectedLive?.tool || inspectedLive?.thinking || t('assistant.loading', 'Thinking...')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        ) : inspectedCoordinatorRun ? (() => {
          const totalIn = inspectedCoordinatorRun.agents.reduce((sum, a) => sum + a.inputTokens, 0);
          const totalOut = inspectedCoordinatorRun.agents.reduce((sum, a) => sum + a.outputTokens, 0);
          const agentNames = new Set(inspectedCoordinatorRun.agents.map((a) => a.name));
          const runDrafts = blackboardEntries.filter(
            (entry) =>
              (entry.swarmRunId && entry.swarmRunId === inspectedCoordinatorRun.id) ||
              agentNames.has(entry.authorName),
          );
          return (
            <div key={`coord-${inspectedCoordinatorRun.id}`} className="v2-swarm-dialog-view flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="v2-swarm-status-pill" data-status={inspectedCoordinatorRun.status}>
                  {inspectedCoordinatorRun.status}
                </span>
                <Text variant="label-small" className="text-on-surface-variant">
                  {coordinatorModelLabel ? `${coordinatorModelLabel} · ` : ''}
                  {inspectedCoordinatorRun.agents.length}{' '}
                  {t('v2.assistant.swarm.shortLabel', 'Multi-agents')}
                  {(totalIn > 0 || totalOut > 0) ? ` · ${formatTokens(totalIn)}↑ ${formatTokens(totalOut)}↓` : ''}
                </Text>
              </div>
              {inspectedCoordinatorRun.goal && (
                <div>
                  <Text variant="label-small" className="text-on-surface-variant">
                    {t('v2.assistant.swarm.coordinatorGoal', 'Goal')}
                  </Text>
                  <p className="v2-ap__brief">{inspectedCoordinatorRun.goal}</p>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Text variant="label-small" className="text-on-surface-variant">
                  {t('v2.assistant.swarm.coordinatorAgents', 'Delegated agents')}
                </Text>
                {inspectedCoordinatorRun.agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
                    onClick={() => {
                      const runId = inspectedCoordinatorRun.id;
                      onSelectCoordinatorRun?.(null);
                      setAgentReturnTarget({ kind: 'coordinator', runId });
                      onSelectAgent(agent.id);
                    }}
                  >
                    <span className="v2-ap__lead" data-status={agent.status}>
                      {agent.status === 'running' || agent.status === 'queued'
                        ? <LoadingIndicator size={15} aria-hidden />
                        : <Icon name={statusIcon(agent.status)} size={16} />}
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="v2-ap__row-label v2-ellipsis">{agent.name}</div>
                      <div className="v2-ap__row-sub v2-ellipsis">{agent.role}</div>
                    </div>
                    <Icon name="chevron_right" size={15} className="v2-ap__trail-icon" />
                  </button>
                ))}
              </div>
              {runDrafts.length > 0 && (
                <div className="flex flex-col gap-1">
                  <Text variant="label-small" className="text-on-surface-variant">
                    {t('v2.assistant.swarm.blackboardShort', 'Shared blackboard')}
                  </Text>
                  {runDrafts.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="v2-ap__row v2-ap__row--interactive m3-focus-ring"
                      onClick={() => {
                        const runId = inspectedCoordinatorRun.id;
                        onSelectCoordinatorRun?.(null);
                        setBoardReturnTarget({ kind: 'coordinator', runId });
                        setPreviewBoardEntry(entry);
                      }}
                    >
                      <span className="v2-ap__lead"><Icon name="description" size={16} /></span>
                      <span className="v2-ap__row-label v2-ellipsis">{entry.title || entry.key}</span>
                      <span className="v2-ap__row-sub">{entry.authorName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })() : activeBoardEntry ? (
          <div key={`board-${inspectedBlackboardRun?.id ?? activeBoardEntry.id}`} className="v2-swarm-dialog-view flex flex-col gap-3">
            {activeBoardEntries.length > 1 && (
              <div className="v2-board-tabs" role="tablist">
                {activeBoardEntries.map((entry) => {
                  const selected = entry.id === activeBoardEntry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className="v2-board-tab m3-focus-ring"
                      onClick={() => setSelectedBoardEntryId(entry.id)}
                    >
                      <Icon name="description" size={14} />
                      <span className="v2-ellipsis">{entry.title || entry.key}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <Text variant="label-small" className="text-on-surface-variant">
              {activeBoardEntry.authorName} · {activeBoardEntry.key}
            </Text>
            <Markdown className="v2-chat-markdown">{activeBoardEntry.content}</Markdown>
            {activeBoardEntry.dataJson != null && (
              <details className="v2-ap__disclosure v2-ap__json-disclosure">
                <summary className="v2-ap__json-summary m3-focus-ring">
                  <Icon name="data_object" size={16} />
                  <span>{t('v2.assistant.swarm.structuredData', 'Structured data (JSON)')}</span>
                  <Icon name="chevron_right" size={18} className="v2-ap__json-chevron" />
                </summary>
                <JsonView data={activeBoardEntry.dataJson} className="v2-json--unbounded" />
              </details>
            )}
          </div>
        ) : latestSwarmRun ? (
          <div key={`graph-${latestSwarmRun.id}`} className="v2-swarm-dialog-view flex flex-col gap-3">
            {latestSwarmRun.goal && (
              <Text variant="body-small" className="text-on-surface-variant">
                {latestSwarmRun.goal}
              </Text>
            )}
            <AgentGraph
              run={latestSwarmRun}
              coordinatorModelLabel={coordinatorModelLabel}
              liveAgentActivity={liveAgentActivity}
              blackboardEntries={blackboardEntries}
              onSelectAgent={(agentId) => {
                setAgentReturnTarget({ kind: 'graph' });
                onSelectAgent(agentId);
              }}
              onSelectCoordinator={(run) => {
                setGraphDialogOpen(false);
                setCoordinatorReturnTarget({ kind: 'graph' });
                onSelectCoordinatorRun?.(run.id);
              }}
              onSelectBlackboard={(run) => {
                setGraphDialogOpen(false);
                setSelectedBoardEntryId(null);
                setBoardReturnTarget({ kind: 'graph' });
                onSelectBlackboardRun?.(run.id);
              }}
            />
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!previewPreset}
        onClose={() => setPreviewPreset(null)}
        fullScreen="compact"
        showCloseButton
        describeContent={false}
        maxWidth={600}
        headline={previewPreset?.name || ''}
        confirmAction={
          previewPreset ? (
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                onInsertComposerText(formatSwarmPresetPrompt(previewPreset), true);
                setPreviewPreset(null);
                onNavigate?.();
              }}
            >
              {t('v2.assistant.swarm.insertIntoComposer', 'Insert into composer')}
            </Button>
          ) : undefined
        }
        actions={
          previewPreset ? (
            <>
              <Button variant="text" size="sm" onClick={() => setPreviewPreset(null)}>
                {t('assistant.cancel', 'Cancel')}
              </Button>
              <Button
                variant="filled"
                size="sm"
                icon="input"
                onClick={() => {
                  onInsertComposerText(formatSwarmPresetPrompt(previewPreset), true);
                  setPreviewPreset(null);
                  onNavigate?.();
                }}
              >
                {t('v2.assistant.swarm.insertIntoComposer', 'Insert into composer')}
              </Button>
            </>
          ) : undefined
        }
      >
        {previewPreset && (
          <div className="flex flex-col gap-3">
            {previewPreset.description && (
              <Text variant="body-medium" className="text-on-surface-variant">
                {previewPreset.description}
              </Text>
            )}
            {previewPreset.goalTemplate && (
              <div>
                <Text variant="label-small" className="text-on-surface-variant">
                  {t('v2.assistant.swarm.goalTemplate', 'Goal template')}
                </Text>
                <Text variant="body-small">{previewPreset.goalTemplate}</Text>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {previewPreset.workers.map((w) => (
                <div key={w.name} className="v2-ap__preset-worker">
                  <div className="flex items-center justify-between gap-2">
                    <Text variant="label-large">{w.name}</Text>
                    <Text variant="label-small" className="text-on-surface-variant">
                      {w.role} · {w.toolScope}
                    </Text>
                  </div>
                  <Text variant="body-small" className="text-on-surface-variant">{w.brief}</Text>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!deleteBoardTarget}
        title={t('v2.assistant.swarm.deleteDraftTitle', 'Delete blackboard draft')}
        message={t('v2.assistant.swarm.deleteDraftMessage', 'Remove this draft from the conversation blackboard?')}
        confirmLabel={t('confirmModal.confirm', 'Confirm')}
        tone="danger"
        icon="delete"
        onConfirm={() => deleteBoardTarget && void handleDeleteBoardEntry(deleteBoardTarget)}
        onClose={() => setDeleteBoardTarget(null)}
      />
    </div>
  );
}

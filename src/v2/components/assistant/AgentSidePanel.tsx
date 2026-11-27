import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  deleteAssistantBlackboardEntry,
  fetchAssistantConversationApprovedTools,
  fetchAssistantSwarmAgentTranscript,
  fetchLibraryItems,
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
import { resolveAssistantSkillsLibraryId } from '../../../lib/assistant-skills';
import { DEFAULT_SWARM_PRESETS, formatSwarmPresetPrompt } from '../../../lib/assistant-swarm-presets';
import {
  Button,
  ChatThoughtAccordion,
  Icon,
  IconButton,
  LoadingIndicator,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  Switch,
  Tab,
  TabGroup,
  TabPanel,
  Tabs,
  Text,
} from '../../../m3';
import { getTextModelsForProvider, type Provider } from '../../../types';
import { useCopy } from '../../lib/useCopy';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { JsonView } from '../../ui/JsonView';
import { Markdown } from '../../ui/Markdown';
import { useToast } from '../../ui/useToast';
import { ProviderLogo } from '../ProviderLogo';
import { McpAppFrame } from './McpAppFrame';
import { ResourcePanel } from './ResourcePanel';

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

/**
 * Generalized 3-tab Agent Side Panel (`Activity` | `Resources` | `Tools`) with
 * in-panel Worker Inspector drill-down, Phase 2 grouped approvals, and Phase 3
 * Shared Blackboard + Swarm Presets.
 */
export function AgentSidePanel({
  conversationId,
  providers,
  selectedProviderId,
  selectedModelId,
  contextUsageTokens,
  swarmMode,
  onToggleSwarmMode,
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

  const [activeTab, setActiveTab] = useState<'activity' | 'resources' | 'tools'>('activity');
  const [busyConfirmId, setBusyConfirmId] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);

  // Worker Inspector state
  const [inspectedAgent, setInspectedAgent] = useState<AssistantSwarmAgent | null>(null);
  const [inspectedMessages, setInspectedMessages] = useState<AssistantMessage[]>([]);
  const [inspectedPending, setInspectedPending] = useState<AssistantPendingConfirmation[]>([]);
  const [loadingInspector, setLoadingInspector] = useState(false);

  // Tools tab state
  const [approvedTools, setApprovedTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<AssistantSwarmBlackboardEntry | null>(null);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const selectedModel = selectedProvider
    ? getTextModelsForProvider(selectedProvider.type).find((m) => m.id === selectedModelId)
    : null;
  const contextLimit = selectedModel?.promptLimit?.value ?? null;
  const contextPct = contextLimit ? Math.min(100, Math.round((contextUsageTokens / contextLimit) * 100)) : null;

  const workerProvider = providers.find((p) => p.id === workerProviderId);
  const workerModel = workerProvider
    ? getTextModelsForProvider(workerProvider.type).find((m) => m.id === workerModelId)
    : null;

  const allPresets = useMemo(
    () => (swarmPresets.length > 0 ? [...swarmPresets, ...DEFAULT_SWARM_PRESETS] : DEFAULT_SWARM_PRESETS),
    [swarmPresets],
  );

  // Load worker transcript when drilling into a worker.
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
    setActiveTab('activity');
    void loadWorkerTranscript(inspectedAgentId);
  }, [inspectedAgentId, loadWorkerTranscript, swarmRuns]);

  // Load approved tools + quick skills when viewing Tools tab.
  useEffect(() => {
    if (activeTab !== 'tools') return;
    let cancelled = false;
    if (conversationId) {
      fetchAssistantConversationApprovedTools(conversationId)
        .then((res) => { if (!cancelled) setApprovedTools(res.tools); })
        .catch(() => {});
    } else {
      setApprovedTools([]);
    }
    resolveAssistantSkillsLibraryId()
      .then((libId) => (libId ? fetchLibraryItems(libId, 1, 12) : null))
      .then((res) => {
        if (cancelled || !res) return;
        setSkills(res.items.map((item) => ({
          id: item.id,
          title: item.title?.trim() || item.content.slice(0, 40),
          content: item.content,
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTab, conversationId]);

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
  const resourceTotal = resources.length + blackboardEntries.length;

  // ─── In-Panel Worker Inspector (Drill-down view) ───
  if (inspectedAgentId) {
    const live = liveAgentActivity[inspectedAgentId];
    const agent = inspectedAgent
      ?? swarmRuns.flatMap((r) => r.agents).find((a) => a.id === inspectedAgentId)
      ?? null;
    const isRunning = agent?.status === 'running' || agent?.status === 'queued';

    const toolByCallId = new Map<string, AssistantMessage>();
    for (const m of inspectedMessages) {
      if (m.role === 'tool' && m.toolCallId) toolByCallId.set(m.toolCallId, m);
    }

    return (
      <div className="v2-agent-panel v2-worker-inspector">
        <div className="v2-worker-inspector__bar">
          <IconButton
            size="xs"
            icon="arrow_back"
            label={t('v2.assistant.swarm.backToActivity', 'Back to activity')}
            onClick={() => onSelectAgent(null)}
          />
          <div className="v2-worker-inspector__heading">
            <Text variant="title-small" className="v2-ellipsis">{agent?.name || 'Worker'}</Text>
            {agent && (
              <Text variant="label-small" className="text-on-surface-variant v2-ellipsis">
                {agent.role} · {agent.toolScope}
              </Text>
            )}
          </div>
          {isRunning && (
            <IconButton
              size="xs"
              icon="stop_circle"
              label={t('v2.assistant.swarm.stopWorker', 'Stop worker')}
              tooltip
              onClick={() => void handleStopWorker(inspectedAgentId)}
            />
          )}
          <IconButton
            size="xs"
            icon="refresh"
            label={t('v2.assistant.swarm.refresh', 'Refresh')}
            onClick={() => void loadWorkerTranscript(inspectedAgentId)}
          />
        </div>

        <div className="v2-agent-panel__scroll">
          {agent && (
            <div className="v2-agent-card v2-agent-card--compact">
              <div className="v2-agent-card__row">
                <span className="v2-swarm-status-pill" data-status={agent.status}>{agent.status}</span>
                <Text variant="label-small" className="text-on-surface-variant tabular-nums">
                  {formatTokens(agent.inputTokens)}↑ {formatTokens(agent.outputTokens)}↓
                </Text>
              </div>
              {agent.modelConfigId && (
                <Text variant="label-small" className="text-on-surface-variant">{agent.modelConfigId}</Text>
              )}
              <details className="v2-worker-brief">
                <summary className="m3-focus-ring">{t('v2.assistant.swarm.assignmentBrief', 'Assignment brief')}</summary>
                <Text variant="body-small" className="v2-worker-brief__text">{agent.brief}</Text>
              </details>
            </div>
          )}

          {inspectedPending.length > 0 && (
            <div className="v2-agent-approvals">
              {inspectedPending.map((conf) => (
                <div key={conf.id} className="v2-agent-approval-card">
                  <Text variant="label-medium">{conf.summary || formatToolTitle(conf.toolName)}</Text>
                  <div className="v2-agent-approval-card__actions">
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
              <LoadingIndicator size={32} aria-label={t('projectViewer.common.loading', 'Loading')} />
            </div>
          ) : (
            <div className="v2-worker-transcript">
              {inspectedMessages.map((msg) => {
                if (msg.role === 'user' || msg.role === 'tool' || msg.role === 'system') return null;
                const { thought, body } = parseThoughtAndBody(msg.content);
                return (
                  <div key={msg.id} className="v2-worker-msg">
                    {thought && (
                      <ChatThoughtAccordion
                        className="v2-chat-thought"
                        thought={thought}
                        title={t('v2.assistant.thoughtProcess', 'Thought process')}
                      />
                    )}
                    {body && <Markdown className="v2-chat-markdown">{body}</Markdown>}
                    {(msg.toolCalls ?? []).map((call) => {
                      const toolMsg = toolByCallId.get(call.id);
                      const isErr = toolMsg?.status === 'error';
                      const resData = toolMsg?.toolResultJson ?? unwrapToolResult(toolMsg?.content);
                      return (
                        <div key={call.id} className="v2-worker-tool-wrap">
                          <details className="v2-chat-tool" data-error={isErr ? '' : undefined}>
                            <summary className="m3-focus-ring">
                              <Icon name={isErr ? 'error' : 'check_circle'} size={15} />
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

              {isRunning && (
                <div className="v2-worker-live">
                  <LoadingIndicator size={20} aria-hidden />
                  <Text variant="body-small" className="text-on-surface-variant v2-ellipsis">
                    {live?.tool || live?.thinking || t('assistant.loading', 'Thinking...')}
                  </Text>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="v2-agent-panel">
      <TabGroup value={activeTab} onChange={(val) => setActiveTab(val as 'activity' | 'resources' | 'tools')}>
        <Tabs variant="secondary" className="v2-agent-panel__tabs">
          <Tab
            value="activity"
            label={t('v2.assistant.agentPanel.activity', 'Activity')}
            badge={pendingConfirmations.length > 0 ? pendingConfirmations.length : undefined}
          />
          <Tab
            value="resources"
            label={t('v2.assistant.agentPanel.resources', 'Resources')}
            badge={resourceTotal > 0 ? resourceTotal : undefined}
          />
          <Tab
            value="tools"
            label={t('v2.assistant.agentPanel.tools', 'Tools')}
          />
        </Tabs>

        {/* ─── TAB 1: ACTIVITY ─── */}
        <TabPanel value="activity" className="v2-agent-panel__scroll">
          {/* Session & Agent Summary Card */}
          <section className="v2-agent-card">
            <div className="v2-agent-card__row">
              <div className="v2-agent-card__model">
                {selectedProvider ? <ProviderLogo type={selectedProvider.type} size={18} /> : <Icon name="smart_toy" size={18} />}
                <div className="min-w-0">
                  <Text variant="label-large" className="v2-ellipsis">
                    {selectedModel?.name || t('assistant.selectModel', 'Select a model')}
                  </Text>
                  <Text variant="label-small" className="text-on-surface-variant">
                    {swarmMode
                      ? t('v2.assistant.swarm.coordinatorRole', 'Coordinator · Swarm enabled')
                      : t('v2.assistant.swarm.soloRole', 'Single-agent mode')}
                  </Text>
                </div>
              </div>
              <Switch
                checked={swarmMode}
                onChange={(e) => onToggleSwarmMode(e.target.checked)}
                aria-label={t('v2.assistant.swarm.toggle', 'Swarm Mode')}
              />
            </div>

            {contextUsageTokens > 0 && (
              <div className="v2-agent-context-meter">
                <div className="v2-agent-card__row">
                  <Text variant="label-small" className="text-on-surface-variant">
                    {t('v2.assistant.agentPanel.context', 'Context')}
                  </Text>
                  <Text variant="label-small" className="tabular-nums text-on-surface-variant">
                    {formatTokens(contextUsageTokens)}
                    {contextLimit ? ` / ${formatTokens(contextLimit)} (${contextPct}%)` : ''}
                  </Text>
                </div>
                {contextPct !== null && (
                  <div className="v2-agent-context-meter__track">
                    <div className="v2-agent-context-meter__fill" style={{ width: `${contextPct}%` }} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Pinned Pending Approvals (Phase 2 batched + single-agent) */}
          {pendingConfirmations.length > 0 && (
            <section className="v2-agent-section v2-agent-approvals">
              <div className="v2-agent-section__head">
                <Text variant="label-medium" className="v2-chat-side__heading">
                  {t('v2.assistant.swarm.pendingApprovals', {
                    defaultValue: 'Pending approvals ({{count}})',
                    count: pendingConfirmations.length,
                  })}
                </Text>
                {pendingConfirmations.length > 1 && (
                  <Button
                    size="xs"
                    variant="filled"
                    icon="done_all"
                    disabled={busyBatch}
                    onClick={async () => {
                      setBusyBatch(true);
                      try {
                        await onConfirmAll('confirm');
                      } finally {
                        setBusyBatch(false);
                      }
                    }}
                  >
                    {t('v2.assistant.swarm.approveAll', 'Approve All')}
                  </Button>
                )}
              </div>

              {pendingConfirmations.map((conf) => (
                <div key={conf.id} className="v2-agent-approval-card">
                  <div className="v2-agent-card__row">
                    <span className="v2-agent-chip">
                      <Icon name={conf.swarmAgentId ? 'smart_toy' : 'hub'} size={13} />
                      <span>{conf.swarmAgentName || t('v2.assistant.swarm.coordinator', 'Coordinator')}</span>
                    </span>
                    <code className="v2-code-chip">{conf.toolName}</code>
                  </div>
                  <Text variant="body-small">{conf.summary || formatToolTitle(conf.toolName)}</Text>
                  <div className="v2-agent-approval-card__actions">
                    <Button
                      size="xs"
                      variant="filled"
                      disabled={busyConfirmId === conf.id || busyBatch}
                      onClick={async () => {
                        setBusyConfirmId(conf.id);
                        try { await onConfirmSingle(conf, 'confirm'); } finally { setBusyConfirmId(null); }
                      }}
                    >
                      {t('assistant.confirm', 'Confirm')}
                    </Button>
                    <Button
                      size="xs"
                      variant="tonal"
                      disabled={busyConfirmId === conf.id || busyBatch}
                      onClick={async () => {
                        setBusyConfirmId(conf.id);
                        try { await onConfirmSingle(conf, 'confirm_tool'); } finally { setBusyConfirmId(null); }
                      }}
                    >
                      {t('v2.assistant.swarm.approveTool', 'Approve Tool')}
                    </Button>
                    <Button
                      size="xs"
                      variant="text"
                      disabled={busyConfirmId === conf.id || busyBatch}
                      onClick={async () => {
                        setBusyConfirmId(conf.id);
                        try { await onConfirmSingle(conf, 'cancel'); } finally { setBusyConfirmId(null); }
                      }}
                    >
                      {t('assistant.cancel', 'Cancel')}
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Swarm Roster (active run + collapsible earlier runs) */}
          {latestSwarmRun ? (
            <section className="v2-agent-section">
              <div className="v2-agent-section__head">
                <Text variant="label-medium" className="v2-chat-side__heading">
                  {t('v2.assistant.swarm.roster', 'Swarm roster')}
                </Text>
                <span className="v2-swarm-status-pill" data-status={latestSwarmRun.status}>
                  {latestSwarmRun.status}
                </span>
              </div>
              <Text variant="body-small" className="text-on-surface-variant">{latestSwarmRun.goal}</Text>

              <div className="v2-worker-list">
                {latestSwarmRun.agents.map((agent) => {
                  const live = liveAgentActivity[agent.id];
                  const isRunning = agent.status === 'running' || agent.status === 'queued';
                  return (
                    <div
                      key={agent.id}
                      role="button"
                      tabIndex={0}
                      className="v2-worker-card m3-focus-ring"
                      data-status={agent.status}
                      onClick={() => onSelectAgent(agent.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectAgent(agent.id);
                        }
                      }}
                    >
                      <div className="v2-agent-card__row">
                        <div className="v2-worker-card__name">
                          {isRunning ? <LoadingIndicator size={16} aria-hidden /> : <Icon name="smart_toy" size={16} />}
                          <Text variant="label-large" className="v2-ellipsis">{agent.name}</Text>
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <span className="v2-swarm-status-pill" data-status={agent.status}>{agent.status}</span>
                          {isRunning && (
                            <IconButton
                              size="xs"
                              icon="stop_circle"
                              label={t('v2.assistant.swarm.stopWorker', 'Stop worker')}
                              onClick={() => void handleStopWorker(agent.id)}
                            />
                          )}
                        </div>
                      </div>
                      <div className="v2-worker-card__meta">
                        <span>{agent.role}</span>
                        <span>·</span>
                        <span>{agent.toolScope}</span>
                        {(agent.inputTokens > 0 || agent.outputTokens > 0) && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">{formatTokens(agent.inputTokens + agent.outputTokens)} tok</span>
                          </>
                        )}
                      </div>
                      {(live?.tool || live?.thinking || agent.summary) && (
                        <Text variant="body-small" className="v2-worker-card__preview v2-clamp-2 text-on-surface-variant">
                          {isRunning ? (live?.tool || live?.thinking || t('assistant.loading', 'Thinking...')) : agent.summary}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>

              {earlierSwarmRuns.length > 0 && (
                <details className="v2-earlier-swarms">
                  <summary className="m3-focus-ring">
                    {t('v2.assistant.swarm.earlierRuns', {
                      defaultValue: 'Earlier swarm runs ({{count}})',
                      count: earlierSwarmRuns.length,
                    })}
                  </summary>
                  <div className="v2-worker-list">
                    {earlierSwarmRuns.map((run) => (
                      <div key={run.id} className="v2-earlier-swarm-run">
                        <Text variant="label-small" className="v2-ellipsis">{run.goal}</Text>
                        <div className="v2-swarm-inline-card__pills">
                          {run.agents.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className="v2-swarm-pill m3-focus-ring"
                              data-status={a.status}
                              onClick={() => onSelectAgent(a.id)}
                            >
                              <span className="v2-ellipsis">{a.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          ) : (
            /* Single-agent live execution timeline */
            <section className="v2-agent-section">
              <Text variant="label-medium" className="v2-chat-side__heading">
                {t('v2.assistant.agentPanel.liveTimeline', 'Execution timeline')}
              </Text>
              {isSending && (
                <div className="v2-worker-live">
                  <LoadingIndicator size={18} aria-hidden />
                  <Text variant="body-small" className="v2-ellipsis">
                    {currentToolTitle || currentThinkingTitle || t('assistant.loading', 'Thinking...')}
                  </Text>
                </div>
              )}
              {liveSteps.length > 0 ? (
                <ul className="v2-live-steps">
                  {liveSteps.slice(-12).reverse().map((step) => (
                    <li key={step.id} className="v2-live-steps__item" data-status={step.status}>
                      <Icon
                        name={step.status === 'error' ? 'error' : step.status === 'done' ? 'check_circle' : 'pending'}
                        size={15}
                      />
                      <span className="v2-ellipsis">{step.label}</span>
                    </li>
                  ))}
                </ul>
              ) : !isSending ? (
                <Text variant="body-small" className="text-on-surface-variant">
                  {swarmMode
                    ? t('v2.assistant.swarm.readyHint', 'Swarm Mode is on. Send a complex request and the Coordinator will fan out parallel workers here.')
                    : t('v2.assistant.agentPanel.idleHint', 'Tool calls and active reasoning steps will appear here during a turn.')}
                </Text>
              ) : null}
            </section>
          )}
        </TabPanel>

        {/* ─── TAB 2: RESOURCES & SHARED BLACKBOARD ─── */}
        <TabPanel value="resources" className="v2-agent-panel__scroll">
          {resources.length > 0 ? (
            <ResourcePanel
              resources={resources}
              onMention={onMentionResource}
              onRemove={onRemoveResource}
              onNavigate={onNavigate}
            />
          ) : (
            <Text variant="body-small" className="text-on-surface-variant">
              {t('v2.assistant.agentPanel.noResources', 'Projects, libraries, campaigns, and posts touched by this chat appear here.')}
            </Text>
          )}

          {/* Phase 3: Shared Blackboard / Drafts */}
          <section className="v2-agent-section">
            <Text variant="label-medium" className="v2-chat-side__heading">
              {t('v2.assistant.swarm.blackboardTitle', 'Shared blackboard & drafts')}
            </Text>
            {blackboardEntries.length === 0 ? (
              <Text variant="body-small" className="text-on-surface-variant">
                {t('v2.assistant.swarm.blackboardEmpty', 'Intermediate drafts shared by swarm workers will appear here.')}
              </Text>
            ) : (
              <div className="v2-blackboard-list">
                {blackboardEntries.map((entry) => (
                  <details key={entry.id} className="v2-blackboard-entry">
                    <summary className="m3-focus-ring">
                      <Icon name="description" size={16} />
                      <div className="min-w-0 flex-1">
                        <span className="v2-ellipsis block">{entry.title || entry.key}</span>
                        <span className="v2-blackboard-entry__meta">{entry.authorName} · {entry.key}</span>
                      </div>
                    </summary>
                    <div className="v2-blackboard-entry__body">
                      <Markdown className="v2-chat-markdown">{entry.content}</Markdown>
                      {entry.dataJson != null && <JsonView data={entry.dataJson} />}
                      <div className="v2-blackboard-entry__actions">
                        <IconButton
                          size="xs"
                          icon="content_copy"
                          label={t('v2.assistant.copy', 'Copy text')}
                          tooltip
                          onClick={() => void copyToClipboard(entry.content, t('v2.common.copied', 'Copied to clipboard'))}
                        />
                        <IconButton
                          size="xs"
                          icon="input"
                          label={t('v2.assistant.swarm.insertIntoComposer', 'Insert into composer')}
                          tooltip
                          onClick={() => onInsertComposerText(entry.content)}
                        />
                        <IconButton
                          size="xs"
                          icon="delete"
                          label={t('v2.assistant.swarm.delete', 'Delete')}
                          tooltip
                          onClick={() => setDeleteBoardTarget(entry)}
                        />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </TabPanel>

        {/* ─── TAB 3: TOOLS, WORKER MODEL, PRESETS & QUICK SKILLS ─── */}
        <TabPanel value="tools" className="v2-agent-panel__scroll">
          {/* Swarm Worker Model Selector */}
          <section className="v2-agent-section">
            <Text variant="label-medium" className="v2-chat-side__heading">
              {t('v2.assistant.swarm.workerModel', 'Swarm worker model')}
            </Text>
            <MenuButton
              placement="bottom-start"
              aria-label={t('v2.assistant.swarm.workerModel', 'Swarm worker model')}
              trigger={(props) => (
                <button {...props} type="button" className="v2-model-chip v2-agent-model-btn m3-focus-ring">
                  {workerProvider ? <ProviderLogo type={workerProvider.type} size={16} /> : <Icon name="bolt" size={16} />}
                  <span className="truncate">
                    {workerModel?.name || t('v2.assistant.swarm.sameAsCoordinator', 'Same as Coordinator')}
                  </span>
                  <Icon name="arrow_drop_down" size={18} />
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

          {/* Session Auto-Approved Tools */}
          <section className="v2-agent-section">
            <div className="v2-agent-section__head">
              <Text variant="label-medium" className="v2-chat-side__heading">
                {t('assistant.approvedTools.title', 'Tool approvals')}
              </Text>
              {conversationId && (
                <Button size="xs" variant="text" onClick={onOpenApprovedToolsDialog}>
                  {t('v2.assistant.swarm.manage', 'Manage')}
                </Button>
              )}
            </div>
            {approvedTools.length === 0 ? (
              <Text variant="body-small" className="text-on-surface-variant">
                {t('v2.assistant.agentPanel.noAutoApproved', 'All write actions ask for confirmation first.')}
              </Text>
            ) : (
              <div className="v2-agent-approved-list">
                {approvedTools.map((toolName) => (
                  <span key={toolName} className="v2-agent-approved-pill">
                    <span>{formatToolTitle(toolName)}</span>
                    <button
                      type="button"
                      className="m3-focus-ring"
                      aria-label={`Revoke ${toolName}`}
                      onClick={() => void handleRevokeApprovedTool(toolName)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Phase 3: Swarm Presets */}
          <section className="v2-agent-section">
            <Text variant="label-medium" className="v2-chat-side__heading">
              {t('v2.assistant.swarm.presetsTitle', 'Swarm presets')}
            </Text>
            <div className="v2-agent-presets">
              {allPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="v2-agent-preset-btn m3-focus-ring"
                  onClick={() => {
                    onInsertComposerText(formatSwarmPresetPrompt(preset), true);
                    onNavigate?.();
                  }}
                >
                  <div className="v2-agent-card__row">
                    <Text variant="label-medium" className="v2-ellipsis">{preset.name}</Text>
                    <Text variant="label-small" className="text-on-surface-variant">{preset.workers.length}</Text>
                  </div>
                  <Text variant="body-small" className="text-on-surface-variant v2-clamp-2">
                    {preset.description}
                  </Text>
                </button>
              ))}
            </div>
          </section>

          {/* Quick Skills */}
          {skills.length > 0 && (
            <section className="v2-agent-section">
              <Text variant="label-medium" className="v2-chat-side__heading">
                {t('v2.assistant.agentPanel.quickSkills', 'Quick skills')}
              </Text>
              <div className="v2-agent-skills">
                {skills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className="v2-agent-skill-btn m3-focus-ring"
                    onClick={() => {
                      onInsertComposerText(skill.content);
                      onNavigate?.();
                    }}
                  >
                    <Icon name="bolt" size={15} />
                    <span className="v2-ellipsis">{skill.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Full Settings Link */}
          <div className="v2-agent-panel__settings-link">
            <Link to={settingsPath} onClick={onNavigate} className="v2-agent-settings-anchor m3-focus-ring">
              <span>{t('v2.assistant.agentPanel.openFullSettings', 'Open full settings')}</span>
              <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
        </TabPanel>
      </TabGroup>

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

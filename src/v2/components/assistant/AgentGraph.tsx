import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssistantSwarmAgentStatus,
  AssistantSwarmBlackboardEntry,
  AssistantSwarmRun,
} from '../../../api';
import { Icon, LoadingIndicator } from '../../../m3';
import type { LiveAgentActivity } from './AgentSidePanel';

export interface AgentGraphProps {
  run: AssistantSwarmRun;
  coordinatorModelLabel?: string;
  liveAgentActivity?: Record<string, LiveAgentActivity>;
  blackboardEntries?: AssistantSwarmBlackboardEntry[];
  onSelectAgent: (agentId: string) => void;
  onSelectCoordinator?: (run: AssistantSwarmRun) => void;
  onSelectBlackboard?: (run: AssistantSwarmRun, entries: AssistantSwarmBlackboardEntry[]) => void;
  /** Compact layout for inline chat cards; full layout for the dialog. */
  compact?: boolean;
}

function statusIcon(status: AssistantSwarmAgentStatus): string {
  switch (status) {
    case 'completed':
      return 'check_circle';
    case 'failed':
      return 'error';
    case 'stopped':
      return 'cancel';
    case 'awaiting_confirmation':
      return 'warning';
    case 'queued':
    case 'waiting':
      return 'schedule';
    default:
      return 'sync';
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * M3 Expressive multi-agent architecture graph.
 * Renders a deterministic left-to-right topology:
 *   Coordinator ──(Bézier edges)──▶ Parallel Agents ──▶ Shared Blackboard (when drafts exist)
 */
export function AgentGraph({
  run,
  coordinatorModelLabel,
  liveAgentActivity = {},
  blackboardEntries = [],
  onSelectAgent,
  onSelectCoordinator,
  onSelectBlackboard,
  compact = false,
}: AgentGraphProps) {
  const { t } = useTranslation();

  const runBlackboard = useMemo(() => {
    const agentNames = new Set(run.agents.map((a) => a.name));
    return blackboardEntries.filter(
      (entry) =>
        (entry.swarmRunId && entry.swarmRunId === run.id) ||
        agentNames.has(entry.authorName),
    );
  }, [blackboardEntries, run.agents, run.id]);

  const hasBlackboard = runBlackboard.length > 0;
  const agentCount = Math.max(run.agents.length, 1);

  // Deterministic coordinates so SVG Bézier edges align pixel-perfectly with node ports.
  const padY = compact ? 14 : 20;
  const padX = compact ? 14 : 20;
  const coordW = compact ? 156 : 188;
  const coordH = compact ? 58 : 66;
  const agentW = compact ? 210 : 256;
  const agentH = compact ? 54 : 62;
  const boardW = compact ? 196 : 220;
  const boardH = compact ? 58 : 66;
  const gapX = compact ? 52 : 68;
  const gapY = compact ? 10 : 12;

  const stackH = agentCount * agentH + Math.max(0, agentCount - 1) * gapY;
  const totalH = Math.max(stackH, coordH) + padY * 2;
  const centerY = totalH / 2;

  const coordX = padX;
  const coordY = centerY - coordH / 2;
  const agentX = coordX + coordW + gapX;
  const agentStartY = (totalH - stackH) / 2;
  const boardX = agentX + agentW + gapX;
  const boardY = centerY - boardH / 2;
  const totalW = hasBlackboard ? boardX + boardW + padX : agentX + agentW + padX;

  const agentPositions = run.agents.map((agent, idx) => {
    const y = agentStartY + idx * (agentH + gapY);
    const cy = y + agentH / 2;
    const authored = runBlackboard.some((e) => e.authorName === agent.name);
    return { agent, x: agentX, y, cy, authored };
  });

  const makeCurve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = (x2 - x1) * 0.52;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="v2-agent-graph" data-compact={compact ? '' : undefined}>
      <div className="v2-agent-graph__scroll">
        <div
          className="v2-agent-graph__canvas"
          style={{ width: totalW, height: totalH }}
        >
          <svg
            className="v2-agent-graph__edges"
            width={totalW}
            height={totalH}
            viewBox={`0 0 ${totalW} ${totalH}`}
            aria-hidden
          >
            {/* Coordinator → Agents */}
            {agentPositions.map(({ agent, x, cy }) => {
              const x1 = coordX + coordW;
              const y1 = centerY;
              const path = makeCurve(x1, y1, x, cy);
              return (
                <g key={`edge-${agent.id}`} className="v2-agent-graph__edge" data-status={agent.status}>
                  <path d={path} className="v2-agent-graph__edge-base" />
                  {agent.status === 'running' && (
                    <path d={path} className="v2-agent-graph__edge-flow" />
                  )}
                  <circle cx={x1} cy={y1} r={3} className="v2-agent-graph__port" />
                  <circle cx={x} cy={cy} r={3} className="v2-agent-graph__port" />
                </g>
              );
            })}

            {/* Agents → Shared Blackboard */}
            {hasBlackboard &&
              agentPositions
                .filter((p) => p.authored)
                .map(({ agent, x, cy }) => {
                  const x1 = x + agentW;
                  const y1 = cy;
                  const x2 = boardX;
                  const y2 = centerY;
                  const path = makeCurve(x1, y1, x2, y2);
                  return (
                    <g key={`board-${agent.id}`} className="v2-agent-graph__edge" data-status="board">
                      <path d={path} className="v2-agent-graph__edge-base" />
                      <circle cx={x1} cy={y1} r={2.5} className="v2-agent-graph__port" />
                      <circle cx={x2} cy={y2} r={2.5} className="v2-agent-graph__port" />
                    </g>
                  );
                })}
          </svg>

          {/* Coordinator Node */}
          {onSelectCoordinator ? (
            <button
              type="button"
              className="v2-agent-node v2-agent-node--coordinator v2-agent-node--interactive m3-focus-ring"
              data-status={run.status}
              style={{ left: coordX, top: coordY, width: coordW, height: coordH }}
              onClick={() => onSelectCoordinator(run)}
              title={run.goal}
            >
              <div className="v2-agent-node__head">
                <span className="v2-agent-node__icon" data-status={run.status}>
                  {run.status === 'running' ? (
                    <LoadingIndicator size={15} aria-hidden />
                  ) : (
                    <Icon name="hub" size={16} />
                  )}
                </span>
                <span className="v2-agent-node__name v2-ellipsis">
                  {t('v2.assistant.swarm.coordinator', 'Coordinator')}
                </span>
              </div>
              <div className="v2-agent-node__sub v2-ellipsis">
                {coordinatorModelLabel || run.goal}
              </div>
            </button>
          ) : (
            <div
              className="v2-agent-node v2-agent-node--coordinator"
              data-status={run.status}
              style={{ left: coordX, top: coordY, width: coordW, height: coordH }}
              title={run.goal}
            >
              <div className="v2-agent-node__head">
                <span className="v2-agent-node__icon" data-status={run.status}>
                  {run.status === 'running' ? (
                    <LoadingIndicator size={15} aria-hidden />
                  ) : (
                    <Icon name="hub" size={16} />
                  )}
                </span>
                <span className="v2-agent-node__name v2-ellipsis">
                  {t('v2.assistant.swarm.coordinator', 'Coordinator')}
                </span>
              </div>
              <div className="v2-agent-node__sub v2-ellipsis">
                {coordinatorModelLabel || run.goal}
              </div>
            </div>
          )}

          {/* Agent Nodes */}
          {agentPositions.map(({ agent, x, y }) => {
            const live = liveAgentActivity[agent.id];
            const subtitle =
              agent.status === 'running' && (live?.tool || live?.thinking)
                ? live.tool || live.thinking
                : agent.role;
            const hasTokens = agent.inputTokens > 0 || agent.outputTokens > 0;
            return (
              <button
                key={agent.id}
                type="button"
                className="v2-agent-node v2-agent-node--worker m3-focus-ring"
                data-status={agent.status}
                style={{ left: x, top: y, width: agentW, height: agentH }}
                onClick={() => onSelectAgent(agent.id)}
                title={`${agent.name} (${agent.role}) — ${agent.status}`}
              >
                <div className="v2-agent-node__head">
                  <span className="v2-agent-node__icon" data-status={agent.status}>
                    {agent.status === 'running' ? (
                      <LoadingIndicator size={14} aria-hidden />
                    ) : (
                      <Icon name={statusIcon(agent.status)} size={15} />
                    )}
                  </span>
                  <span className="v2-agent-node__name v2-ellipsis">{agent.name}</span>
                  <span className="v2-agent-node__scope">{agent.toolScope}</span>
                </div>
                <div className="v2-agent-node__meta">
                  <span className="v2-agent-node__sub v2-ellipsis">{subtitle}</span>
                  {hasTokens && (
                    <span className="v2-agent-node__tokens tabular-nums">
                      {formatTokens(agent.inputTokens)}↑ {formatTokens(agent.outputTokens)}↓
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Shared Blackboard Node */}
          {hasBlackboard && (
            onSelectBlackboard ? (
              <button
                type="button"
                className="v2-agent-node v2-agent-node--board v2-agent-node--interactive m3-focus-ring"
                style={{ left: boardX, top: boardY, width: boardW, height: boardH }}
                onClick={() => onSelectBlackboard(run, runBlackboard)}
                title={runBlackboard.map((e) => e.title || e.key).join(', ')}
              >
                <div className="v2-agent-node__head">
                  <span className="v2-agent-node__icon">
                    <Icon name="description" size={16} />
                  </span>
                  <span className="v2-agent-node__name v2-ellipsis">
                    {t('v2.assistant.swarm.blackboardShort', 'Shared blackboard')}
                  </span>
                </div>
                <div className="v2-agent-node__sub v2-ellipsis">
                  {t('v2.assistant.swarm.blackboardCount', {
                    defaultValue: '{{count}} shared draft(s)',
                    count: runBlackboard.length,
                  })}
                </div>
              </button>
            ) : (
              <div
                className="v2-agent-node v2-agent-node--board"
                style={{ left: boardX, top: boardY, width: boardW, height: boardH }}
                title={runBlackboard.map((e) => e.title || e.key).join(', ')}
              >
                <div className="v2-agent-node__head">
                  <span className="v2-agent-node__icon">
                    <Icon name="description" size={16} />
                  </span>
                  <span className="v2-agent-node__name v2-ellipsis">
                    {t('v2.assistant.swarm.blackboardShort', 'Shared blackboard')}
                  </span>
                </div>
                <div className="v2-agent-node__sub v2-ellipsis">
                  {t('v2.assistant.swarm.blackboardCount', {
                    defaultValue: '{{count}} shared draft(s)',
                    count: runBlackboard.length,
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

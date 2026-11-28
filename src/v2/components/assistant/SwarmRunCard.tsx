import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssistantSwarmAgentStatus,
  AssistantSwarmBlackboardEntry,
  AssistantSwarmRun,
} from '../../../api';
import { Icon, IconButton, LoadingIndicator } from '../../../m3';
import { AgentGraph } from './AgentGraph';
import type { LiveAgentActivity } from './AgentSidePanel';

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

export interface SwarmRunCardProps {
  run: AssistantSwarmRun;
  coordinatorModelLabel?: string;
  liveAgentActivity?: Record<string, LiveAgentActivity>;
  blackboardEntries?: AssistantSwarmBlackboardEntry[];
  onSelectAgent: (agentId: string) => void;
}

/**
 * Inline Multi-agents run card rendered inside the Coordinator transcript.
 * Auto-expands the live architecture graph while running; stays compact when
 * settled with a one-click toggle to inspect the Coordinator → Agents graph.
 */
export function SwarmRunCard({
  run,
  coordinatorModelLabel,
  liveAgentActivity,
  blackboardEntries,
  onSelectAgent,
}: SwarmRunCardProps) {
  const { t } = useTranslation();
  const [graphToggled, setGraphToggled] = useState<boolean | null>(null);
  const showGraph = graphToggled ?? run.status === 'running';

  return (
    <div className="v2-swarm-card" data-status={run.status}>
      <div className="v2-swarm-strip" data-status={run.status} title={run.goal}>
        <span className="v2-swarm-strip__label">
          {run.status === 'running' ? (
            <LoadingIndicator size={14} aria-hidden />
          ) : (
            <Icon name="hub" size={15} />
          )}
          <span>{t('v2.assistant.swarm.shortLabel', 'Multi-agents')}</span>
        </span>
        <div className="v2-swarm-strip__pills">
          {run.agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="v2-swarm-pill m3-focus-ring"
              data-status={agent.status}
              onClick={() => onSelectAgent(agent.id)}
              title={`${agent.name} (${agent.role}) — ${agent.status}`}
            >
              {agent.status === 'running' ? (
                <LoadingIndicator size={13} aria-hidden />
              ) : (
                <Icon name={statusIcon(agent.status)} size={13} />
              )}
              <span className="v2-ellipsis">{agent.name}</span>
            </button>
          ))}
        </div>
        <IconButton
          size="xs"
          icon="account_tree"
          label={showGraph
            ? t('v2.assistant.swarm.hideGraph', 'Hide graph')
            : t('v2.assistant.swarm.viewGraph', 'Architecture graph')}
          tooltip
          selected={showGraph}
          onClick={() => setGraphToggled(!showGraph)}
        />
      </div>

      {showGraph && (
        <AgentGraph
          run={run}
          coordinatorModelLabel={coordinatorModelLabel}
          liveAgentActivity={liveAgentActivity}
          blackboardEntries={blackboardEntries}
          onSelectAgent={onSelectAgent}
          compact
        />
      )}
    </div>
  );
}

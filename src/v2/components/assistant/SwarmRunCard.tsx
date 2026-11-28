import { useTranslation } from 'react-i18next';
import type { AssistantSwarmAgentStatus, AssistantSwarmRun } from '../../../api';
import { Icon, LoadingIndicator } from '../../../m3';

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
  onSelectAgent: (agentId: string) => void;
}

/**
 * Compact inline Swarm strip rendered inside the Coordinator transcript.
 * Clicking any worker pill opens that worker's inspector dialog.
 */
export function SwarmRunCard({ run, onSelectAgent }: SwarmRunCardProps) {
  const { t } = useTranslation();

  return (
    <div className="v2-swarm-strip" data-status={run.status} title={run.goal}>
      <span className="v2-swarm-strip__label">
        {run.status === 'running' ? (
          <LoadingIndicator size={14} aria-hidden />
        ) : (
          <Icon name="hub" size={15} />
        )}
        <span>{t('v2.assistant.swarm.shortLabel', 'Swarm')}</span>
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
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { AssistantSwarmAgentStatus, AssistantSwarmRun } from '../../../api';
import { Icon, LoadingIndicator, Text } from '../../../m3';

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
 * Compact inline Swarm Card rendered inside the Coordinator transcript.
 * Clicking any worker status pill opens and focuses that worker directly in
 * the Agent Side Panel.
 */
export function SwarmRunCard({ run, onSelectAgent }: SwarmRunCardProps) {
  const { t } = useTranslation();
  const runningCount = run.agents.filter((a) => a.status === 'running' || a.status === 'queued').length;
  const completedCount = run.agents.filter((a) => a.status === 'completed').length;
  const awaitingCount = run.agents.filter((a) => a.status === 'awaiting_confirmation').length;

  return (
    <section className="v2-swarm-inline-card" data-status={run.status}>
      <div className="v2-swarm-inline-card__head">
        <span className="v2-swarm-inline-card__icon">
          {run.status === 'running' ? (
            <LoadingIndicator size={18} aria-hidden />
          ) : (
            <Icon name="hub" size={18} />
          )}
        </span>
        <div className="v2-swarm-inline-card__title">
          <Text variant="label-large" className="v2-ellipsis">{run.goal}</Text>
          <Text variant="body-small" className="text-on-surface-variant">
            {t('v2.assistant.swarm.workerSummary', {
              defaultValue: '{{total}} workers · {{completed}} done{{running}}',
              total: run.agents.length,
              completed: completedCount,
              running: runningCount > 0 ? ` · ${runningCount} active` : awaitingCount > 0 ? ` · ${awaitingCount} awaiting approval` : '',
            })}
          </Text>
        </div>
      </div>

      {run.agents.length > 0 && (
        <div className="v2-swarm-inline-card__pills">
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
                <LoadingIndicator size={14} aria-hidden />
              ) : (
                <Icon name={statusIcon(agent.status)} size={14} />
              )}
              <span className="v2-ellipsis">{agent.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

import { RefreshCw } from 'lucide-react';
import { useToolView } from './shared/runtime';
import { Header, StateMessage, Waiting, formatNumber, mount } from './shared/ui';
import './project-preview.css';

interface WorkflowStep {
  type?: string;
  content?: string | null;
  libraryId?: string | null;
  libraryName?: string | null;
  selectedTags?: string[];
  disabled?: boolean;
  mediaKind?: string | null;
  fileName?: string | null;
}

/**
 * Accepts responses from get_project, create_project_with_workflow,
 * update_project, draft_jobs, start_jobs, and get_project_job_counts.
 */
interface ProjectResult {
  projectId?: string;
  id?: string;
  url?: string;
  projectUrl?: string;
  name?: string;
  projectName?: string;
  description?: string | null;
  type?: string | null;
  status?: string | null;
  modelConfigId?: string | null;
  aspectRatio?: string | null;
  quality?: string | null;
  format?: string | null;
  resolution?: string | null;
  duration?: number | string | null;
  workflowItems?: WorkflowStep[];
  workflowItemCount?: number;
  counts?: { jobs?: number; album?: number };
  // Job count tools (draft_jobs, start_jobs, get_project_job_counts)
  drafts?: number;
  pending?: number;
  processing?: number;
  queued?: number;
  completed?: number;
  failed?: number;
  albumItems?: number;
  message?: string;
}

function formatStepType(raw?: string): string {
  if (!raw) return 'Step';
  return raw
    .split(/[_-]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ProjectPreview() {
  const view = useToolView<ProjectResult>('project-preview');
  const { data, error, pending, t, canCallTools } = view;

  if (!data && error) {
    return <div className="rs-view"><StateMessage tone="danger">{error}</StateMessage></div>;
  }
  if (!data) return <Waiting t={t} />;

  const projectId = data.projectId || data.id || (typeof view.toolArgs.projectId === 'string' ? view.toolArgs.projectId : '');
  const title = data.name || data.projectName || 'Project';
  const url = data.url || data.projectUrl;
  const workflowItems = Array.isArray(data.workflowItems) ? data.workflowItems : null;

  const chips = [
    data.type ? data.type.toUpperCase() : null,
    data.modelConfigId,
    data.aspectRatio,
    data.quality,
    data.resolution,
    data.format ? data.format.toUpperCase() : null,
    data.duration != null ? `${data.duration}s` : null,
  ].filter(Boolean) as string[];

  const hasDetailedCounts =
    typeof data.drafts === 'number' ||
    typeof data.queued === 'number' ||
    typeof data.completed === 'number' ||
    typeof data.albumItems === 'number';

  const stats: { label: string; value: number; tone?: 'info' | 'success' | 'danger' }[] = hasDetailedCounts
    ? [
        ...(typeof data.drafts === 'number' ? [{ label: t('drafts'), value: data.drafts }] : []),
        ...(typeof data.queued === 'number' ? [{ label: t('queued'), value: data.queued, tone: data.queued > 0 ? 'info' as const : undefined }] : []),
        ...(typeof data.completed === 'number' ? [{ label: t('completed'), value: data.completed, tone: data.completed > 0 ? 'success' as const : undefined }] : []),
        ...(typeof data.albumItems === 'number' ? [{ label: t('album'), value: data.albumItems }] : []),
        ...(typeof data.failed === 'number' && data.failed > 0 ? [{ label: t('failed'), value: data.failed, tone: 'danger' as const }] : []),
      ]
    : data.counts
      ? [
          ...(typeof data.counts.jobs === 'number' ? [{ label: t('queue'), value: data.counts.jobs }] : []),
          ...(typeof data.counts.album === 'number' ? [{ label: t('album'), value: data.counts.album }] : []),
        ]
      : [];

  const handleRefresh = () => {
    if (!projectId) return;
    void view.refetch('get_project', { projectId });
  };

  return (
    <div className={`rs-view${pending ? ' rs-busy' : ''}`}>
      <Header
        title={title}
        subtitle={data.status ? t.status(data.status) : undefined}
        url={url}
        onOpen={view.openLink}
        t={t}
      >
        {canCallTools && projectId ? (
          <button type="button" className="rs-button" disabled={pending} onClick={handleRefresh}>
            <RefreshCw size={14} aria-hidden />
            <span className="rs-label-collapsible">{t('refresh')}</span>
          </button>
        ) : null}
      </Header>

      {chips.length > 0 ? (
        <div className="pj-meta">
          {chips.map((chip) => (
            <span key={chip} className="rs-badge">{chip}</span>
          ))}
        </div>
      ) : null}

      {data.description ? <p className="pj-desc">{data.description}</p> : null}

      {stats.length > 0 ? (
        <div className="pj-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="pj-stat" data-tone={stat.tone}>
              <span className="pj-stat-value">{formatNumber(stat.value, t.locale)}</span>
              <span className="pj-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <StateMessage tone="danger">{error}</StateMessage> : null}

      {workflowItems ? (
        <section className="pj-section">
          <div className="pj-section-head">
            <h2 className="pj-section-title">
              {t('workflow')} ({workflowItems.length})
            </h2>
          </div>
          {workflowItems.length === 0 ? (
            <StateMessage>{t('noWorkflow')}</StateMessage>
          ) : (
            <ol className="pj-steps">
              {workflowItems.map((step, index) => (
                <li key={index} className="pj-step" data-disabled={step.disabled ? '' : undefined}>
                  <span className="pj-step-index">{index + 1}</span>
                  <div className="pj-step-body">
                    <div className="pj-step-top">
                      <span className="rs-badge">{formatStepType(step.type)}</span>
                      {step.libraryName ? (
                        <span className="rs-badge" data-tone="info">{step.libraryName}</span>
                      ) : null}
                      {step.disabled ? (
                        <span className="rs-badge" data-tone="warning">{t('disabled')}</span>
                      ) : null}
                      {Array.isArray(step.selectedTags) && step.selectedTags.map((tag) => (
                        <span key={tag} className="rs-badge">#{tag}</span>
                      ))}
                    </div>
                    {(step.content || step.fileName) ? (
                      <p className="pj-step-text rs-clamp-4">{step.content || step.fileName}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : canCallTools && projectId ? (
        <div className="pj-section-head">
          {data.message ? <p className="pj-desc">{data.message}</p> : <span />}
          <button type="button" className="rs-button" disabled={pending} onClick={handleRefresh}>
            {t('loadProject')}
          </button>
        </div>
      ) : data.message ? (
        <p className="pj-desc">{data.message}</p>
      ) : null}
    </div>
  );
}

mount(<ProjectPreview />);

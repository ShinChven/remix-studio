import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { clearFailedQueueJobs, fetchQueueStatus } from '../../api';
import { Button, Icon, LinearProgress, Text, useSnackbar } from '../../m3';
import type { QueueMonitorJob, QueueMonitorProject, QueueMonitorProvider, QueueMonitorStatus, QueueMonitorView } from '../../types';
import { ProviderLogo } from '../components/ProviderLogo';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader } from '../ui/Page';
import { MetricChip, StatTile, StatusPill, type Tone } from '../ui/Stat';
import { Segmented } from '../ui/Toolbar';

type ClearTarget = { type: 'all'; name: string } | { type: 'project'; id: string; name: string } | { type: 'provider'; id: string; name: string };

const resolveView = (value: string | null): QueueMonitorView => (value === 'providers' ? 'providers' : 'projects');
const formatTime = (value: number | undefined, t: TFunction) =>
  value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : t('queueMonitor.unknown');

function stateTone(job: QueueMonitorJob): Tone {
  if (job.queueState === 'running' || job.queueState === 'detached') return 'primary';
  if (job.queueState === 'queued') return 'warning';
  if (job.queueState === 'failed') return 'error';
  return 'neutral';
}

function JobRow({ job, showProject, showProvider }: { job: QueueMonitorJob; showProject?: boolean; showProvider?: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const running = job.queueState === 'running' || job.queueState === 'detached';
  return (
    <div className="v2-job" data-expanded={expanded ? '' : undefined} role="button" tabIndex={0} onClick={() => setExpanded((e) => !e)} onKeyDown={(e) => e.key === 'Enter' && setExpanded((x) => !x)}>
      <Icon name="expand_more" className="v2-job__chevron text-on-surface-variant" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={stateTone(job)} icon={running ? 'progress_activity' : undefined}>
            {t(`queueMonitor.states.${job.queueState}`)}
          </StatusPill>
          {showProject && (
            <Link to={`/project/${job.projectId}`} className="v2-link" onClick={(e) => e.stopPropagation()}>
              <Text as="span" variant="label-large">
                {job.projectName}
              </Text>
            </Link>
          )}
          {showProvider && job.providerName && (
            <Text as="span" variant="label-large" className="text-on-surface-variant">
              {job.providerName}
            </Text>
          )}
          {job.modelName && <StatusPill>{job.modelName}</StatusPill>}
          {job.taskId && (
            <StatusPill tone="tertiary">
              {t('queueMonitor.taskShort')} {job.taskId.slice(0, 8)}
            </StatusPill>
          )}
        </div>
        <Text variant="body-medium" className={`mt-2 ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`} title={expanded ? undefined : job.prompt}>
          {job.prompt}
        </Text>
        {expanded && (
          <div className="mt-2 flex flex-wrap gap-2">
            {job.aspectRatio && <StatusPill>{job.aspectRatio}</StatusPill>}
            {job.quality && <StatusPill>{job.quality}</StatusPill>}
            {job.format && <StatusPill>{job.format.toUpperCase()}</StatusPill>}
            {job.resolution && <StatusPill>{job.resolution}</StatusPill>}
            {job.duration !== undefined && <StatusPill>{job.duration}s</StatusPill>}
            {job.sound && <StatusPill>Sound: {job.sound}</StatusPill>}
          </div>
        )}
        {job.error && (
          <Text variant="body-small" className={`mt-1 text-error ${expanded ? 'whitespace-pre-wrap break-all' : 'truncate'}`} title={expanded ? undefined : job.error}>
            {job.error}
          </Text>
        )}
      </div>
      <Text as="span" variant="body-small" className="inline-flex items-center gap-1 text-on-surface-variant">
        <Icon name="schedule" size={14} />
        {formatTime(job.createdAt, t)}
      </Text>
    </div>
  );
}

function ClearFailed({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <Button variant="tonal" size="xs" icon="mop" className="v2-button-danger" loading={busy} onClick={onClick}>
      {t('projectViewer.queue.clearAllFailed')}
    </Button>
  );
}

function ProjectPanel({ project, onClear, busy }: { project: QueueMonitorProject; onClear: (target: ClearTarget) => void; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <article className="v2-panel">
      <div className="v2-panel__head">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/project/${project.id}`} className="v2-link">
              <Text as="span" variant="title-medium" emphasized>
                {project.name}
              </Text>
            </Link>
            <StatusPill>{project.type}</StatusPill>
            {project.status === 'archived' && <StatusPill tone="warning">{t('queueMonitor.archived')}</StatusPill>}
          </div>
          <Text variant="body-small" className="mt-1 text-on-surface-variant">
            {t('queueMonitor.projectUpdated', { provider: project.providerName || t('queueMonitor.noProvider'), time: formatTime(project.latestJobAt, t) })}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetricChip label={t('queueMonitor.metrics.running')} value={project.runningJobs + project.detachedJobs} tone="primary" />
          <MetricChip label={t('queueMonitor.metrics.queued')} value={project.queuedJobs + project.waitingJobs} tone="warning" />
          <MetricChip label={t('queueMonitor.metrics.failed')} value={project.failedJobs} tone={project.failedJobs > 0 ? 'error' : 'neutral'} />
          {project.failedJobs > 0 && <ClearFailed busy={busy} onClick={() => onClear({ type: 'project', id: project.id, name: project.name })} />}
        </div>
      </div>
      {project.jobs.map((job) => (
        <JobRow key={job.id} job={job} showProvider />
      ))}
    </article>
  );
}

function ProviderPanel({ provider, onClear, busy }: { provider: QueueMonitorProvider; onClear: (target: ClearTarget) => void; busy: boolean }) {
  const { t } = useTranslation();
  const percent = provider.concurrency > 0 ? Math.min(100, (provider.activeSlots / provider.concurrency) * 100) : 0;
  return (
    <article className="v2-panel">
      <div className="v2-panel__head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="v2-row__lead">
            <ProviderLogo type={provider.type} size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/provider/${provider.id}`} className="v2-link">
                <Text as="span" variant="title-medium" emphasized>
                  {provider.name}
                </Text>
              </Link>
              <StatusPill>{provider.type}</StatusPill>
            </div>
            <LinearProgress value={percent} aria-label={t('queueMonitor.metrics.slots')} className="mt-2 w-48 max-w-full" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetricChip label={t('queueMonitor.metrics.slots')} value={provider.activeSlots} tone="primary" />
          <MetricChip label={t('queueMonitor.metrics.limit')} value={provider.concurrency} />
          <MetricChip label={t('queueMonitor.metrics.queued')} value={provider.queuedJobs + provider.waitingJobs} tone="warning" />
          <MetricChip label={t('queueMonitor.metrics.failed')} value={provider.failedJobs} tone={provider.failedJobs > 0 ? 'error' : 'neutral'} />
          {provider.failedJobs > 0 && <ClearFailed busy={busy} onClick={() => onClear({ type: 'provider', id: provider.id, name: provider.name })} />}
        </div>
      </div>
      {provider.jobs.length > 0 ? (
        provider.jobs.map((job) => <JobRow key={job.id} job={job} showProject />)
      ) : (
        <Text variant="body-medium" className="border-t border-outline-variant px-4 py-5 text-on-surface-variant">
          {t('queueMonitor.noProviderJobs')}
        </Text>
      )}
    </article>
  );
}

export function QueueMonitor() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveView(searchParams.get('view'));
  const [status, setStatus] = useState<QueueMonitorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [clearTarget, setClearTarget] = useState<ClearTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      setError(null);
      setStatus(await fetchQueueStatus(view));
    } catch (err) {
      console.error(err);
      setError(t('queueMonitor.loadError'));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      try {
        setError(null);
        const next = await fetchQueueStatus(view);
        if (active) setStatus(next);
      } catch (err) {
        console.error(err);
        if (active) setError(t('queueMonitor.loadError'));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    const interval = setInterval(() => {
      void fetchQueueStatus(view)
        .then((next) => active && setStatus(next))
        .catch(() => {});
    }, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [view, t]);

  const totals = status?.totals;
  const projects = status?.projects || [];
  const providers = status?.providers || [];

  return (
    <Page density="compact">
      <PageHeader
        size="large"
        title={t('queueMonitor.title')}
        description={t('queueMonitor.description')}
        backLink={{ to: '/projects', label: t('projects.title') }}
        actions={
          <>
            {(totals?.failedJobs || 0) > 0 && (
              <Button variant="tonal" icon="mop" className="v2-button-danger" loading={clearing} onClick={() => setClearTarget({ type: 'all', name: t('queueMonitor.title') })}>
                {t('projectViewer.queue.clearAllFailed')}
              </Button>
            )}
            <Button variant="tonal" icon="refresh" loading={isLoading} onClick={() => void load()}>
              {t('queueMonitor.refresh')}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<QueueMonitorView>
          value={view}
          onChange={(next) =>
            setSearchParams((prev) => {
              const params = new URLSearchParams(prev);
              if (next === 'projects') params.delete('view');
              else params.set('view', next);
              return params;
            })
          }
          options={[
            { value: 'projects', label: t('queueMonitor.projectView'), icon: 'stacks' },
            { value: 'providers', label: t('queueMonitor.providerView'), icon: 'dns' },
          ]}
        />
        {status && (
          <Text variant="body-small" className="inline-flex items-center gap-1 text-on-surface-variant">
            <Icon name="timer" size={16} />
            {t('queueMonitor.updatedAt')} {formatTime(status.updatedAt, t)}
          </Text>
        )}
      </div>
      {totals && (
        <div className="v2-stat-grid mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <StatTile label={t('queueMonitor.metrics.projects')} value={totals.projects} />
          <StatTile label={t('queueMonitor.metrics.providers')} value={totals.providers} />
          <StatTile label={t('queueMonitor.metrics.running')} value={totals.runningJobs + totals.detachedJobs} tone="primary" />
          <StatTile label={t('queueMonitor.metrics.queued')} value={totals.queuedJobs + totals.waitingJobs} tone="warning" />
          <StatTile label={t('queueMonitor.metrics.pending')} value={totals.pendingJobs} />
          <StatTile label={t('queueMonitor.metrics.failed')} value={totals.failedJobs} tone={totals.failedJobs > 0 ? 'error' : 'neutral'} />
          <StatTile label={t('queueMonitor.metrics.slots')} value={totals.activeSlots} tone="secondary" />
          <StatTile label={t('queueMonitor.metrics.limit')} value={totals.concurrency} />
        </div>
      )}
      {error && <ErrorState message={error} />}
      {isLoading ? (
        <LoadingState />
      ) : view === 'projects' ? (
        <div className="flex flex-col gap-3">
          {projects.length > 0 ? (
            projects.map((p) => <ProjectPanel key={p.id} project={p} busy={clearing} onClear={setClearTarget} />)
          ) : (
            <EmptyState icon="view_list" title={t('queueMonitor.empty.projectsTitle')} description={t('queueMonitor.empty.description')} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {providers.length > 0 ? (
            providers.map((p) => <ProviderPanel key={p.id} provider={p} busy={clearing} onClear={setClearTarget} />)
          ) : (
            <EmptyState icon="dns" title={t('queueMonitor.empty.providersTitle')} description={t('queueMonitor.empty.description')} />
          )}
        </div>
      )}
      <ConfirmDialog
        open={clearTarget !== null}
        tone="danger"
        title={t('projectViewer.confirm.clearFailedJobs.title')}
        message={
          clearTarget?.type === 'project'
            ? t('queueMonitor.confirm.clearProjectFailed', { name: clearTarget.name, defaultValue: `Clear failed jobs for project "${clearTarget.name}"?` })
            : clearTarget?.type === 'provider'
              ? t('queueMonitor.confirm.clearProviderFailed', { name: clearTarget.name, defaultValue: `Clear failed jobs for provider queue "${clearTarget.name}"?` })
              : t('projectViewer.confirm.clearFailedJobs.message')
        }
        confirmLabel={t('projectViewer.confirm.clearFailedJobs.confirm')}
        onClose={() => setClearTarget(null)}
        onConfirm={async () => {
          const target = clearTarget;
          if (!target) return;
          setClearing(true);
          try {
            const result = await clearFailedQueueJobs(target.type === 'project' ? { projectId: target.id } : target.type === 'provider' ? { providerId: target.id } : {});
            snackbar.show(t('queueMonitor.clearFailedSuccess', { count: result.cleared, defaultValue: `Cleared ${result.cleared} failed job${result.cleared === 1 ? '' : 's'}` }));
            await load(false);
          } catch (err) {
            console.error(err);
            snackbar.show(t('queueMonitor.clearFailedError', { defaultValue: 'Failed to clear failed jobs.' }));
          } finally {
            setClearing(false);
          }
        }}
      />
    </Page>
  );
}

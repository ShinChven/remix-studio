import { uiLocale } from '../lib/format';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { clearFailedQueueJobs, fetchQueueStatus } from '../../api';
import { Button, Icon, IconButton, LinearProgress, Text } from '../../m3';
import type { QueueMonitorJob, QueueMonitorProject, QueueMonitorProvider, QueueMonitorStatus, QueueMonitorView } from '../../types';
import { ProviderLogo } from '../components/ProviderLogo';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader } from '../ui/Page';
import type { ActionMenuItem } from '../ui/ActionMenu';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { Row, RowList } from '../ui/Rows';
import { StatTile, StatusPill, type Tone } from '../ui/Stat';
import { Segmented } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';
import { useAsyncData } from '../lib/useAsyncData';

type ClearTarget = { type: 'all'; name: string } | { type: 'project'; id: string; name: string } | { type: 'provider'; id: string; name: string };

const resolveView = (value: string | null): QueueMonitorView => (value === 'providers' ? 'providers' : 'projects');
const formatTime = (value: number | undefined, t: TFunction) =>
  value ? new Intl.DateTimeFormat(uiLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : t('queueMonitor.unknown');

function stateTone(job: QueueMonitorJob): Tone {
  if (job.queueState === 'running' || job.queueState === 'detached') return 'primary';
  if (job.queueState === 'queued' || job.queueState === 'waiting') return 'warning';
  if (job.queueState === 'failed') return 'error';
  return 'neutral';
}

const STATE_ICONS: Record<QueueMonitorJob['queueState'], string> = {
  running: 'progress_activity',
  detached: 'cloud_sync',
  queued: 'hourglass_top',
  waiting: 'schedule',
  failed: 'error',
};

/** One job as a list row: state on the leading tile, the prompt as its title; a click opens its options and full text. */
function JobRow({ job, showProject, showProvider }: { job: QueueMonitorJob; showProject?: boolean; showProvider?: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const tone = stateTone(job);
  const options = [job.aspectRatio, job.quality, job.format?.toUpperCase(), job.resolution, job.duration !== undefined ? `${job.duration}s` : undefined, job.sound ? `Sound: ${job.sound}` : undefined].filter(Boolean);
  return (
    <Row
      className="v2-queue-row"
      onClick={() => setExpanded((open) => !open)}
      selected={expanded}
      lead={
        <span className="v2-feed-thumb" data-tone={tone}>
          <Icon name={STATE_ICONS[job.queueState]} className={job.queueState === 'running' ? 'v2-queue-row__spin' : undefined} />
        </span>
      }
      title={expanded ? <span className="whitespace-pre-wrap break-words">{job.prompt}</span> : <span title={job.prompt}>{job.prompt}</span>}
      meta={
        <>
          <span className="v2-queue-row__state" data-tone={tone}>
            {t(`queueMonitor.states.${job.queueState}`)}
          </span>
          {showProject && (
            <>
              <span>·</span>
              <Link to={`/project/${job.projectId}`} className="v2-link">
                {job.projectName}
              </Link>
            </>
          )}
          {showProvider && job.providerName && (
            <>
              <span>·</span>
              <span>{job.providerName}</span>
            </>
          )}
          {job.modelName && (
            <>
              <span>·</span>
              <span>{job.modelName}</span>
            </>
          )}
          <span>·</span>
          <span className="tabular-nums">{formatTime(job.createdAt, t)}</span>
          {job.taskId && (
            <span className="v2-info-chip" title={job.taskId}>
              {t('queueMonitor.taskShort')} {job.taskId.slice(0, 8)}
            </span>
          )}
          {job.error && !expanded && (
            <span className="w-full truncate text-error" title={job.error}>
              {job.error}
            </span>
          )}
        </>
      }
      actions={<Icon name="expand_more" className="v2-queue-row__chevron text-on-surface-variant" />}
    >
      {expanded && (options.length > 0 || job.error) && (
        <div className="v2-queue-row__detail">
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => (
                <span key={option} className="v2-info-chip">
                  {option}
                </span>
              ))}
            </div>
          )}
          {job.error && (
            <Text variant="body-small" className="whitespace-pre-wrap break-all text-error">
              {job.error}
            </Text>
          )}
        </div>
      )}
    </Row>
  );
}

/** Running, queued and failed counts for one pane; zeros stay out of the way. */
function QueueCounts({ running, queued, failed }: { running: number; queued: number; failed: number }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {running > 0 && (
        <StatusPill tone="primary" icon="progress_activity">
          {running} {t('queueMonitor.metrics.running')}
        </StatusPill>
      )}
      {queued > 0 && (
        <StatusPill tone="warning" icon="hourglass_top">
          {queued} {t('queueMonitor.metrics.queued')}
        </StatusPill>
      )}
      {failed > 0 && (
        <StatusPill tone="error" icon="error">
          {failed} {t('queueMonitor.metrics.failed')}
        </StatusPill>
      )}
    </span>
  );
}

function clearFailedItem(t: TFunction, count: number, onSelect: () => void): ActionMenuItem[] {
  return count > 0 ? [{ key: 'clear-failed', icon: 'mop', label: t('projectViewer.queue.clearAllFailed'), danger: true, onSelect }] : [];
}

function ProjectPane({ project, onClear }: { project: QueueMonitorProject; onClear: (target: ClearTarget) => void }) {
  const { t } = useTranslation();
  return (
    <ListPane
      className="v2-queue-pane"
      label={project.name}
      lead={
        <ListTitle
          icon="stacks"
          count={project.jobs.length}
          title={
            <Link to={`/project/${project.id}`} className="v2-link">
              {project.name}
            </Link>
          }
        />
      }
      summary={
        <span className="inline-flex items-center gap-2">
          {project.status === 'archived' && <StatusPill tone="warning">{t('queueMonitor.archived')}</StatusPill>}
          {t('queueMonitor.projectUpdated', { provider: project.providerName || t('queueMonitor.noProvider'), time: formatTime(project.latestJobAt, t) })}
        </span>
      }
      tools={<QueueCounts running={project.runningJobs + project.detachedJobs} queued={project.queuedJobs + project.waitingJobs} failed={project.failedJobs} />}
      menuItems={clearFailedItem(t, project.failedJobs, () => onClear({ type: 'project', id: project.id, name: project.name }))}
      loading={false}
      count={project.jobs.length}
      empty={{ icon: 'check_circle', title: t('queueMonitor.empty.projectsTitle') }}
    >
      <RowList className="v2-list-pane__grid">
        {project.jobs.map((job) => (
          <JobRow key={job.id} job={job} showProvider />
        ))}
      </RowList>
    </ListPane>
  );
}

function ProviderPane({ provider, onClear }: { provider: QueueMonitorProvider; onClear: (target: ClearTarget) => void }) {
  const { t } = useTranslation();
  const percent = provider.concurrency > 0 ? Math.min(100, (provider.activeSlots / provider.concurrency) * 100) : 0;
  return (
    <ListPane
      className="v2-queue-pane"
      label={provider.name}
      lead={
        <div className="v2-list-title">
          <ProviderLogo type={provider.type} size={20} />
          <Text as="h2" variant="title-medium" emphasized className="v2-list-title__text">
            <Link to={`/provider/${provider.id}`} className="v2-link">
              {provider.name}
            </Link>
          </Text>
          {provider.jobs.length > 0 && <span className="v2-count v2-list-title__count">{provider.jobs.length}</span>}
        </div>
      }
      summary={
        <span className="inline-flex items-center gap-2 tabular-nums">
          <LinearProgress value={percent} aria-label={t('queueMonitor.metrics.slots')} className="w-20" />
          {provider.activeSlots} / {provider.concurrency} {t('queueMonitor.metrics.slots')}
        </span>
      }
      tools={<QueueCounts running={provider.runningJobs + provider.detachedJobs} queued={provider.queuedJobs + provider.waitingJobs} failed={provider.failedJobs} />}
      menuItems={clearFailedItem(t, provider.failedJobs, () => onClear({ type: 'provider', id: provider.id, name: provider.name }))}
      loading={false}
      count={provider.jobs.length}
      empty={{ icon: 'check_circle', title: t('queueMonitor.noProviderJobs') }}
    >
      <RowList className="v2-list-pane__grid">
        {provider.jobs.map((job) => (
          <JobRow key={job.id} job={job} showProject />
        ))}
      </RowList>
    </ListPane>
  );
}

/** Providers with nothing queued: one compact row each instead of a pane apiece. */
function IdleProviders({ providers }: { providers: QueueMonitorProvider[] }) {
  const { t } = useTranslation();
  const label = t('v2.queueMonitor.idleProviders', { defaultValue: 'Idle providers' });
  return (
    <ListPane className="v2-queue-pane" label={label} lead={<ListTitle title={label} icon="bedtime" count={providers.length} />} loading={false} count={providers.length} empty={{ title: label }}>
      <RowList columns={2} className="v2-list-pane__grid">
        {providers.map((provider) => (
          <Row
            key={provider.id}
            to={`/provider/${provider.id}`}
            lead={
              <span className="v2-feed-thumb">
                <ProviderLogo type={provider.type} size={20} />
              </span>
            }
            title={provider.name}
            meta={
              <span className="tabular-nums">
                {provider.activeSlots} / {provider.concurrency} {t('queueMonitor.metrics.slots')}
              </span>
            }
            actions={<Icon name="arrow_forward" size={18} className="m3-mirror-rtl text-on-surface-variant" />}
          />
        ))}
      </RowList>
    </ListPane>
  );
}

export function QueueMonitor() {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveView(searchParams.get('view'));
  // The queues move on their own, so the page keeps itself current.
  const queue = useAsyncData(() => fetchQueueStatus(view), [view], { pollMs: 5000 });
  const status = queue.data ?? null;
  const isLoading = queue.loading;
  const error = queue.error ? t('queueMonitor.loadError') : null;
  const load = (showLoading = true) => queue.reload(!showLoading);
  const [clearing, setClearing] = useState(false);
  const [clearTarget, setClearTarget] = useState<ClearTarget | null>(null);

  const totals = status?.totals;
  const projects = status?.projects || [];
  const providers = status?.providers || [];
  const busyProviders = providers.filter((p) => p.jobs.length > 0 || p.failedJobs > 0);
  const idleProviders = providers.filter((p) => p.jobs.length === 0 && p.failedJobs === 0);

  const setView = (next: QueueMonitorView) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'projects') params.delete('view');
      else params.set('view', next);
      return params;
    });

  return (
    <Page density="compact">
      <PageHeader
        title={t('queueMonitor.title')}
        description={
          <>
            {t('queueMonitor.description')}
            {status && (
              <span className="tabular-nums">
                {' '}
                · {t('queueMonitor.updatedAt')} {formatTime(status.updatedAt, t)}
              </span>
            )}
          </>
        }
        backLink={{ to: '/projects', label: t('projects.title') }}
        actions={
          <>
            <Segmented<QueueMonitorView>
              value={view}
              onChange={setView}
              options={[
                { value: 'projects', label: t('queueMonitor.projectView'), icon: 'stacks' },
                { value: 'providers', label: t('queueMonitor.providerView'), icon: 'dns' },
              ]}
            />
            {(totals?.failedJobs || 0) > 0 && (
              <Button variant="tonal" icon="mop" className="v2-button-danger" loading={clearing} onClick={() => setClearTarget({ type: 'all', name: t('queueMonitor.title') })}>
                {t('projectViewer.queue.clearAllFailed')}
              </Button>
            )}
            <IconButton icon="refresh" variant="tonal" label={t('queueMonitor.refresh')} tooltip disabled={queue.refreshing} onClick={() => void load()} />
          </>
        }
      />
      {totals && (
        <div className="v2-stat-grid mb-4">
          <StatTile icon="progress_activity" label={t('queueMonitor.metrics.running')} value={totals.runningJobs + totals.detachedJobs} />
          <StatTile icon="hourglass_top" label={t('queueMonitor.metrics.queued')} value={totals.queuedJobs + totals.waitingJobs} />
          <StatTile icon="pending" label={t('queueMonitor.metrics.pending')} value={totals.pendingJobs} />
          <StatTile icon="error" label={t('queueMonitor.metrics.failed')} value={totals.failedJobs} tone={totals.failedJobs > 0 ? 'error' : 'neutral'} />
          <StatTile icon="memory" label={t('queueMonitor.metrics.slots')} value={<span className="tabular-nums">{totals.activeSlots} / {totals.concurrency}</span>} />
        </div>
      )}
      {error && <ErrorState message={error} onRetry={() => void queue.reload()} retryLabel={t('v2.common.retry')} />}
      {isLoading ? (
        <LoadingState />
      ) : view === 'projects' ? (
        projects.length > 0 ? (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
              <ProjectPane key={p.id} project={p} onClear={setClearTarget} />
            ))}
          </div>
        ) : (
          <EmptyState icon="view_list" shape="clover-4" title={t('queueMonitor.empty.projectsTitle')} description={t('queueMonitor.empty.description')} />
        )
      ) : providers.length > 0 ? (
        <div className="flex flex-col gap-3">
          {busyProviders.map((p) => (
            <ProviderPane key={p.id} provider={p} onClear={setClearTarget} />
          ))}
          {idleProviders.length > 0 && <IdleProviders providers={idleProviders} />}
        </div>
      ) : (
        <EmptyState icon="dns" shape="clover-4" title={t('queueMonitor.empty.providersTitle')} description={t('queueMonitor.empty.description')} />
      )}
      <ConfirmDialog
        open={clearTarget !== null}
        tone="danger"
        title={t('projectViewer.confirm.clearFailedJobs.title')}
        message={
          clearTarget?.type === 'project'
            ? t('v2.queueMonitor.confirm.clearProjectFailed', { name: clearTarget.name, defaultValue: `Clear failed jobs for project "${clearTarget.name}"?` })
            : clearTarget?.type === 'provider'
              ? t('v2.queueMonitor.confirm.clearProviderFailed', { name: clearTarget.name, defaultValue: `Clear failed jobs for provider queue "${clearTarget.name}"?` })
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
            toast.success(t('v2.queueMonitor.clearFailedSuccess', { count: result.cleared, defaultValue: `Cleared ${result.cleared} failed job${result.cleared === 1 ? '' : 's'}` }));
            await load(false);
          } catch (err) {
            console.error(err);
            toast.error(t('v2.queueMonitor.clearFailedError', { defaultValue: 'Failed to clear failed jobs.' }));
          } finally {
            setClearing(false);
          }
        }}
      />
    </Page>
  );
}

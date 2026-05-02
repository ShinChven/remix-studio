import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, BrushCleaning, ChevronDown, Clock, Layers3, Loader2, RefreshCw, Rows3, Server, Timer } from 'lucide-react';
import { clearFailedQueueJobs, fetchQueueStatus } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { InfoChip } from '../components/ProjectViewer/InfoChip';
import { ProviderIcon } from '../components/ProviderIcon';
import type { QueueMonitorJob, QueueMonitorProject, QueueMonitorProvider, QueueMonitorStatus, QueueMonitorView } from '../types';
import type { TFunction } from 'i18next';

const VIEW_PARAM_VALUES: QueueMonitorView[] = ['projects', 'providers'];

type ClearFailedTarget =
  | { type: 'all'; name: string }
  | { type: 'project'; id: string; name: string }
  | { type: 'provider'; id: string; name: string };

function resolveView(value: string | null): QueueMonitorView {
  return VIEW_PARAM_VALUES.includes(value as QueueMonitorView) ? value as QueueMonitorView : 'projects';
}

function formatTime(value: number | undefined, t: TFunction) {
  if (!value) return t('queueMonitor.unknown');
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function jobStateLabel(job: QueueMonitorJob, t: TFunction) {
  return t(`queueMonitor.states.${job.queueState}`);
}

function jobStateClass(job: QueueMonitorJob) {
  if (job.queueState === 'running' || job.queueState === 'detached') return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
  if (job.queueState === 'queued') return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (job.queueState === 'failed') return 'text-red-500 bg-red-500/10 border-red-500/20';
  return 'text-neutral-500 dark:text-neutral-400 bg-neutral-500/10 border-neutral-500/20';
}

function Metric({
  label,
  value,
  tone = 'neutral',
  layout = 'stacked',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'blue' | 'amber' | 'red';
  layout?: 'stacked' | 'inline';
}) {
  const toneClass = {
    neutral: 'text-neutral-900 dark:text-white',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-500',
  }[tone];

  if (layout === 'inline') {
    return (
      <div className="flex min-h-10 min-w-0 items-center justify-between gap-4 rounded-lg border border-neutral-200/50 bg-white/50 px-3 py-2 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/40 sm:min-w-28">
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">{label}</p>
        <p className={`text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white/50 dark:bg-neutral-900/40 px-3 py-2 shadow-sm backdrop-blur-xl">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ClearFailedButton({ onClick, isClearing, className = '' }: { onClick: () => void; isClearing: boolean; className?: string }) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 shadow-sm backdrop-blur-xl transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-40 sm:min-w-28 ${className}`}
      disabled={isClearing}
      title={t('projectViewer.queue.clearAllFailed')}
      aria-label={t('projectViewer.queue.clearAllFailed')}
    >
      {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrushCleaning className="h-3.5 w-3.5" />}
      <span className="truncate">{t('projectViewer.queue.clearAllFailed')}</span>
    </button>
  );
}

function JobRow({ job, showProject = false, showProvider = false }: { job: QueueMonitorJob; showProject?: boolean; showProvider?: boolean }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className={`group border-t border-neutral-200/60 dark:border-neutral-800/60 px-4 py-3 transition-colors hover:bg-neutral-50/50 dark:hover:bg-white/5 cursor-pointer ${isExpanded ? 'bg-neutral-50/50 dark:bg-white/5' : ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <InfoChip className={jobStateClass(job)}>
              {(job.queueState === 'running' || job.queueState === 'detached') && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {jobStateLabel(job, t)}
            </InfoChip>
            {showProject && (
              <Link 
                to={`/project/${job.projectId}`} 
                className="text-xs font-semibold text-neutral-800 hover:text-blue-600 dark:text-neutral-200 dark:hover:text-blue-400"
                onClick={(e) => e.stopPropagation()}
              >
                {job.projectName}
              </Link>
            )}
            {showProvider && job.providerName && (
              <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{job.providerName}</span>
            )}
            {job.modelName && <InfoChip className="text-neutral-500 dark:text-neutral-500">{job.modelName}</InfoChip>}
            {job.taskId && <InfoChip className="text-violet-500">{t('queueMonitor.taskShort')} {job.taskId.slice(0, 8)}</InfoChip>}
          </div>
          <p className={`mt-2 text-sm text-neutral-700 dark:text-neutral-300 ${isExpanded ? 'whitespace-pre-wrap' : 'truncate'}`} title={isExpanded ? undefined : job.prompt}>
            {job.prompt}
          </p>
          {isExpanded && (
            <div className="mt-3 flex flex-wrap gap-2">
              {job.aspectRatio && (
                <InfoChip className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {job.aspectRatio}
                </InfoChip>
              )}
              {job.quality && (
                <InfoChip className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {job.quality}
                </InfoChip>
              )}
              {job.format && (
                <InfoChip className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {job.format.toUpperCase()}
                </InfoChip>
              )}
              {job.resolution && (
                <InfoChip className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {job.resolution}
                </InfoChip>
              )}
              {job.duration !== undefined && (
                <InfoChip className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  {job.duration}s
                </InfoChip>
              )}
              {job.sound && (
                <InfoChip className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  Sound: {job.sound}
                </InfoChip>
              )}
            </div>
          )}
          {job.error && (
            <p className={`mt-1 text-xs text-red-500 ${isExpanded ? 'whitespace-pre-wrap break-all' : 'truncate'}`} title={isExpanded ? undefined : job.error}>
              {job.error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
          <Clock className="h-3.5 w-3.5" />
          {formatTime(job.createdAt, t)}
        </div>
      </div>
    </div>
  );
}

function ProjectPanel({
  project,
  onClearFailed,
  isClearingFailed,
}: {
  project: QueueMonitorProject;
  onClearFailed: (target: ClearFailedTarget) => void;
  isClearingFailed: boolean;
}) {
  const { t } = useTranslation();

  return (
    <article className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/60 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/50">
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/project/${project.id}`} className="truncate text-base font-semibold text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
              {project.name}
            </Link>
            <InfoChip className="text-neutral-500 dark:text-neutral-500">{project.type}</InfoChip>
            {project.status === 'archived' && <InfoChip className="text-amber-600 dark:text-amber-400">{t('queueMonitor.archived')}</InfoChip>}
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
            {t('queueMonitor.projectUpdated', {
              provider: project.providerName || t('queueMonitor.noProvider'),
              time: formatTime(project.latestJobAt, t),
            })}
          </p>
        </div>
        <div className={project.failedJobs > 0 ? 'grid grid-cols-2 gap-2 sm:flex sm:items-center' : 'grid grid-cols-3 gap-2 sm:flex sm:items-center'}>
          <Metric layout="inline" label={t('queueMonitor.metrics.running')} value={project.runningJobs + project.detachedJobs} tone="blue" />
          <Metric layout="inline" label={t('queueMonitor.metrics.queued')} value={project.queuedJobs + project.waitingJobs} tone="amber" />
          <Metric layout="inline" label={t('queueMonitor.metrics.failed')} value={project.failedJobs} tone={project.failedJobs > 0 ? 'red' : 'neutral'} />
          {project.failedJobs > 0 && (
            <ClearFailedButton
              isClearing={isClearingFailed}
              onClick={() => onClearFailed({ type: 'project', id: project.id, name: project.name })}
            />
          )}
        </div>
      </div>
      <div>
        {project.jobs.map((job) => <JobRow key={job.id} job={job} showProvider />)}
      </div>
    </article>
  );
}

function ProviderPanel({
  provider,
  onClearFailed,
  isClearingFailed,
}: {
  provider: QueueMonitorProvider;
  onClearFailed: (target: ClearFailedTarget) => void;
  isClearingFailed: boolean;
}) {
  const { t } = useTranslation();
  const slotPercent = provider.concurrency > 0 ? Math.min(100, (provider.activeSlots / provider.concurrency) * 100) : 0;

  return (
    <article className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/60 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/50">
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-neutral-100 p-2 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            <ProviderIcon type={provider.type} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/provider/${provider.id}`} className="truncate text-base font-semibold text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                {provider.name}
              </Link>
              <InfoChip className="text-neutral-500 dark:text-neutral-500">{provider.type}</InfoChip>
            </div>
            <div className="mt-2 h-2 w-48 max-w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${slotPercent}%` }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Metric layout="inline" label={t('queueMonitor.metrics.slots')} value={provider.activeSlots} tone="blue" />
          <Metric layout="inline" label={t('queueMonitor.metrics.limit')} value={provider.concurrency} />
          <Metric layout="inline" label={t('queueMonitor.metrics.queued')} value={provider.queuedJobs + provider.waitingJobs} tone="amber" />
          <Metric layout="inline" label={t('queueMonitor.metrics.failed')} value={provider.failedJobs} tone={provider.failedJobs > 0 ? 'red' : 'neutral'} />
          {provider.failedJobs > 0 && (
            <ClearFailedButton
              isClearing={isClearingFailed}
              className="col-span-2 w-full min-w-0 sm:col-span-1 sm:w-auto sm:min-w-28"
              onClick={() => onClearFailed({ type: 'provider', id: provider.id, name: provider.name })}
            />
          )}
        </div>
      </div>
      {provider.jobs.length > 0 ? (
        provider.jobs.map((job) => <JobRow key={job.id} job={job} showProject />)
      ) : (
        <div className="border-t border-neutral-200/60 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-800/60 dark:text-neutral-500">{t('queueMonitor.noProviderJobs')}</div>
      )}
    </article>
  );
}

export function QueueMonitor() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveView(searchParams.get('view'));
  const [status, setStatus] = useState<QueueMonitorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearingFailed, setIsClearingFailed] = useState(false);
  const [clearFailedTarget, setClearFailedTarget] = useState<ClearFailedTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextView = view, showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      setError(null);
      setStatus(await fetchQueueStatus(nextView));
    } catch (err) {
      console.error(err);
      setError(t('queueMonitor.loadError'));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadView = async () => {
      setIsLoading(true);
      try {
        setError(null);
        const nextStatus = await fetchQueueStatus(view);
        if (active) setStatus(nextStatus);
      } catch (err) {
        console.error(err);
        if (active) setError(t('queueMonitor.loadError'));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadView();
    const interval = setInterval(() => {
      void fetchQueueStatus(view).then((nextStatus) => {
        if (active) setStatus(nextStatus);
      }).catch(() => {});
    }, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [view, t]);

  const tabs = useMemo(() => ([
    { id: 'projects' as const, label: t('queueMonitor.projectView'), icon: <Layers3 className="h-4 w-4" /> },
    { id: 'providers' as const, label: t('queueMonitor.providerView'), icon: <Server className="h-4 w-4" /> },
  ]), [t]);

  const setView = (nextView: QueueMonitorView) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextView === 'projects') next.delete('view');
      else next.set('view', nextView);
      return next;
    });
  };

  const handleClearFailedJobs = async () => {
    const target = clearFailedTarget;
    if (!target) return;

    setIsClearingFailed(true);
    try {
      const result = await clearFailedQueueJobs(
        target.type === 'project'
          ? { projectId: target.id }
          : target.type === 'provider'
            ? { providerId: target.id }
            : {}
      );
      toast.success(t('queueMonitor.clearFailedSuccess', {
        count: result.cleared,
        defaultValue: `Cleared ${result.cleared} failed job${result.cleared === 1 ? '' : 's'}`,
      }));
      await load(view, false);
    } catch (err) {
      console.error(err);
      toast.error(t('queueMonitor.clearFailedError', { defaultValue: 'Failed to clear failed jobs.' }));
    } finally {
      setIsClearingFailed(false);
    }
  };

  const totals = status?.totals;
  const projects = status?.projects || [];
  const providers = status?.providers || [];
  const hasFailedJobs = (totals?.failedJobs || 0) > 0;

  return (
    <div className="p-4 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title={t('queueMonitor.title')}
        description={t('queueMonitor.description')}
        actions={
          <>
            {hasFailedJobs && (
              <button
                onClick={() => setClearFailedTarget({ type: 'all', name: t('queueMonitor.title') })}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-500 shadow-sm backdrop-blur-xl transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-40"
                disabled={isClearingFailed}
              >
                {isClearingFailed ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrushCleaning className="h-4 w-4" />}
                {t('projectViewer.queue.clearAllFailed')}
              </button>
            )}
            <button
              onClick={() => load(view)}
              className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/60 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-neutral-700 shadow-sm backdrop-blur-xl transition-all hover:bg-neutral-100 active:scale-95 disabled:opacity-40 dark:border-white/5 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('queueMonitor.refresh')}
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full rounded-xl border border-neutral-200/50 bg-neutral-100/40 p-1 shadow-inner backdrop-blur-md dark:border-white/5 dark:bg-black/40 lg:w-auto">
          {tabs.map((tab) => {
            const isActive = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-all lg:flex-none ${
                  isActive
                    ? 'border border-neutral-200 bg-white text-blue-600 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white'
                    : 'border border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        {status && (
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
            <Timer className="h-3.5 w-3.5" />
            {t('queueMonitor.updatedAt')} {formatTime(status.updatedAt, t)}
          </div>
        )}
      </div>

      {totals && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Metric label={t('queueMonitor.metrics.projects')} value={totals.projects} />
          <Metric label={t('queueMonitor.metrics.providers')} value={totals.providers} />
          <Metric label={t('queueMonitor.metrics.running')} value={totals.runningJobs + totals.detachedJobs} tone="blue" />
          <Metric label={t('queueMonitor.metrics.queued')} value={totals.queuedJobs + totals.waitingJobs} tone="amber" />
          <Metric label={t('queueMonitor.metrics.pending')} value={totals.pendingJobs} />
          <Metric label={t('queueMonitor.metrics.failed')} value={totals.failedJobs} tone={totals.failedJobs > 0 ? 'red' : 'neutral'} />
          <Metric label={t('queueMonitor.metrics.slots')} value={totals.activeSlots} tone="blue" />
          <Metric label={t('queueMonitor.metrics.limit')} value={totals.concurrency} />
        </section>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : view === 'projects' ? (
        <section className="space-y-3">
          {projects.length > 0 ? (
            projects.map((project) => (
              <ProjectPanel
                key={project.id}
                project={project}
                isClearingFailed={isClearingFailed}
                onClearFailed={setClearFailedTarget}
              />
            ))
          ) : (
            <EmptyMonitorState icon={<Rows3 className="h-8 w-8" />} title={t('queueMonitor.empty.projectsTitle')} />
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {providers.length > 0 ? (
            providers.map((provider) => (
              <ProviderPanel
                key={provider.id}
                provider={provider}
                isClearingFailed={isClearingFailed}
                onClearFailed={setClearFailedTarget}
              />
            ))
          ) : (
            <EmptyMonitorState icon={<Server className="h-8 w-8" />} title={t('queueMonitor.empty.providersTitle')} />
          )}
        </section>
      )}

      <ConfirmModal
        isOpen={clearFailedTarget !== null}
        onClose={() => setClearFailedTarget(null)}
        onConfirm={handleClearFailedJobs}
        title={t('projectViewer.confirm.clearFailedJobs.title')}
        message={
          clearFailedTarget?.type === 'project'
            ? t('queueMonitor.confirm.clearProjectFailed', {
              name: clearFailedTarget.name,
              defaultValue: `Clear failed jobs for project "${clearFailedTarget.name}"?`,
            })
            : clearFailedTarget?.type === 'provider'
              ? t('queueMonitor.confirm.clearProviderFailed', {
                name: clearFailedTarget.name,
                defaultValue: `Clear failed jobs for provider queue "${clearFailedTarget.name}"?`,
              })
              : t('projectViewer.confirm.clearFailedJobs.message')
        }
        confirmText={t('projectViewer.confirm.clearFailedJobs.confirm')}
        type="danger"
      />
    </div>
  );
}

function EmptyMonitorState({ icon, title }: { icon: ReactNode; title: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-neutral-200 bg-white/40 py-20 text-center text-neutral-500 shadow-sm backdrop-blur-3xl dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-500">
      <div className="rounded-full border border-neutral-200 bg-white p-4 text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold tracking-tight text-neutral-700 dark:text-neutral-300">{title}</p>
        <p className="mt-1 text-sm">{t('queueMonitor.empty.description')}</p>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, CheckCircle2, XCircle, Trash2, Clock, ArrowRight, List, HardDrive, Cloud, Upload, Rocket, Tag, History as HistoryIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExportTask, DeliveryStatus } from '../types';
import { fetchAllExports, deleteExport, uploadExportToDrive, fetchDeliveryStatus, fetchActiveDeliveries, fetchReleaseConnections, ReleaseConnection, ReleaseProvider } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from 'sonner';
import { PageNav } from '../components/PageNav';
import { ProjectImportPanel } from '../components/ProjectImportPanel';

const EXPORTS_PAGE_SIZE = 15;

/** Icon per drive provider, mirroring the Releases page. */
const DRIVE_ICON: Record<string, typeof Cloud> = {
  'google-drive': HardDrive,
  onedrive: Cloud,
  mega: Cloud,
};

export function Exports() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [exports, setExports] = useState<ExportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [taskToUploadDrive, setTaskToUploadDrive] = useState<ExportTask | null>(null);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);

  // deliveryId → DeliveryStatus for in-progress uploads (drive + gumroad)
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryStatus>>({});
  const deliveriesRef = useRef(deliveries);
  useEffect(() => { deliveriesRef.current = deliveries; }, [deliveries]);
  // Track which delivery IDs we've already surfaced as toast (success or failure) so
  // overlapping poll cycles don't re-fire the same toast.
  const toastedRef = useRef<Set<string>>(new Set());
  // exportTaskId → deliveryTaskId per destination
  const [pendingDeliveries, setPendingDeliveries] = useState<Record<string, string>>({});
  const [pendingGumroadDeliveries, setPendingGumroadDeliveries] = useState<Record<string, string>>({});
  const [hasStores, setHasStores] = useState(false);
  const [drives, setDrives] = useState<ReleaseConnection[]>([]);
  const [providers, setProviders] = useState<ReleaseProvider[]>([]);
  const deliveryPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exportsLoadSeqRef = useRef(0);
  const activeExportCount = exports.filter(t => t.status === 'pending' || t.status === 'processing').length;
  const hasActiveExportTasks = activeExportCount > 0;

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${parseFloat(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0$/, ''))} ${sizes[index]}`;
  };

  // Poll delivery statuses (drive + gumroad).
  // Note: deliveries is intentionally NOT in the dep array — we read it via ref to
  // avoid the effect re-firing on every status update (which would cause overlapping
  // poll cycles and duplicate toasts).
  useEffect(() => {
    const trackedIds = [
      ...Object.values(pendingDeliveries),
      ...Object.values(pendingGumroadDeliveries),
    ];
    if (trackedIds.length === 0) {
      if (deliveryPollRef.current) clearInterval(deliveryPollRef.current);
      return;
    }

    let cancelled = false;

    const removeFromPending = (dId: string, destination: 'drive' | 'gumroad') => {
      const setter = destination === 'gumroad' ? setPendingGumroadDeliveries : setPendingDeliveries;
      setter(prev => {
        const exportId = Object.entries(prev).find(([, v]) => v === dId)?.[0];
        if (!exportId) return prev;
        const next = { ...prev };
        delete next[exportId];
        return next;
      });
    };

    const poll = async () => {
      if (cancelled) return;
      const idsToCheck = trackedIds.filter(dId => {
        const d = deliveriesRef.current[dId];
        return !d || d.status === 'pending' || d.status === 'processing';
      });
      for (const dId of idsToCheck) {
        if (cancelled) return;
        try {
          const status = await fetchDeliveryStatus(dId);
          if (cancelled) return;
          setDeliveries(prev => ({ ...prev, [dId]: status }));

          if (status.status === 'completed' && !toastedRef.current.has(dId)) {
            toastedRef.current.add(dId);
            if (status.destination === 'gumroad') {
              toast.success(
                <span>
                  {t('sell.publishSuccess')}{' '}
                  {status.externalUrl ? (
                    <a href={status.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {t('sell.openProduct')}
                    </a>
                  ) : null}
                </span>
              );
            } else {
              toast.success(
                <span>
                  {t('releases.drive.uploadSuccess')}{' '}
                  {status.externalUrl ? (
                    <a href={status.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {t('releases.drive.openFile')}
                    </a>
                  ) : null}
                </span>
              );
            }
            removeFromPending(dId, status.destination);
          } else if (status.status === 'failed' && !toastedRef.current.has(dId)) {
            toastedRef.current.add(dId);
            const fallback = status.destination === 'gumroad' ? t('sell.publishFailed') : t('releases.drive.uploadFailed');
            toast.error(status.error || fallback);
            removeFromPending(dId, status.destination);
          }
        } catch {
          // ignore transient errors
        }
      }
    };

    void poll();
    deliveryPollRef.current = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (deliveryPollRef.current) clearInterval(deliveryPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeliveries, pendingGumroadDeliveries, t]);

  // Which release destinations exist decides whether the Sell and drive
  // actions show up on a finished export at all.
  useEffect(() => {
    let cancelled = false;
    fetchReleaseConnections()
      .then(({ connections, providers: available }) => {
        if (cancelled) return;
        setHasStores(connections.some((c) => c.kind === 'store'));
        setDrives(connections.filter((c) => c.kind === 'drive'));
        setProviders(available);
      })
      .catch(() => {
        if (cancelled) return;
        setHasStores(false);
        setDrives([]);
      });
    return () => { cancelled = true; };
  }, []);

  const driveLabel = (platform: string) =>
    providers.find((provider) => provider.id === platform)?.label ?? platform;

  const driveName = (drive: ReleaseConnection) =>
    drive.displayName || drive.email || driveLabel(drive.platform);

  const loadExports = useCallback(async (pageToLoad: number, options: { showLoading?: boolean } = {}) => {
    const requestId = ++exportsLoadSeqRef.current;
    const showLoading = options.showLoading ?? true;
    try {
      if (showLoading) setLoading(true);
      const [{ items, total: nextTotal, pages: nextPages }, activeDeliveries] = await Promise.all([
        fetchAllExports(pageToLoad, EXPORTS_PAGE_SIZE),
        fetchActiveDeliveries(),
      ]);
      if (requestId !== exportsLoadSeqRef.current) return;
      setExports(items);
      setTotal(nextTotal);
      setPages(nextPages);
      setDeliveries(prev => {
        const next = { ...prev };
        for (const delivery of activeDeliveries) {
          next[delivery.id] = delivery;
        }
        return next;
      });
      setPendingDeliveries(
        Object.fromEntries(
          activeDeliveries
            .filter((d) => d.destination !== 'gumroad')
            .map((delivery) => [delivery.exportTaskId, delivery.id])
        )
      );
      setPendingGumroadDeliveries(
        Object.fromEntries(
          activeDeliveries
            .filter((d) => d.destination === 'gumroad')
            .map((delivery) => [delivery.exportTaskId, delivery.id])
        )
      );
    } catch (err) {
      console.error('Failed to load exports:', err);
    } finally {
      if (requestId === exportsLoadSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExports(page);
  }, [loadExports, page]);

  useEffect(() => {
    if (!hasActiveExportTasks) return undefined;
    const interval = setInterval(() => {
      void loadExports(page, { showLoading: false });
    }, 3000);
    return () => clearInterval(interval);
  }, [hasActiveExportTasks, loadExports, page]);

  const handlePageChange = (newPage: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', newPage.toString());
      return next;
    });
  };

  const getTaskTarget = (task: ExportTask): { to: string; labelPrefix: string } => {
    if (task.sourceType === 'library' && task.libraryId) {
      return {
        to: `/library/${task.libraryId}`,
        labelPrefix: t('libraries.title'),
      };
    }

    return {
      to: task.projectId ? `/project/${task.projectId}` : '/exports',
      labelPrefix: t('projects.title'),
    };
  };

  const handleDelete = async (taskId: string) => {
    setTaskToDelete(taskId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteExport(taskToDelete);
      if (exports.length <= 1 && page > 1) {
        handlePageChange(page - 1);
      } else {
        await loadExports(page, { showLoading: false });
      }
    } catch (err: any) {
      toast.error(`Failed to delete export record: ${err.message}`);
    } finally {
      setTaskToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleUploadToDrive = (task: ExportTask) => {
    if (pendingDeliveries[task.id] || drives.length === 0) return;
    // With one drive there is nothing to pick, so pre-select it and the dialog
    // becomes a plain confirmation.
    setSelectedDriveId(drives.length === 1 ? drives[0].id : null);
    setTaskToUploadDrive(task);
  };

  const confirmUploadToDrive = async () => {
    const task = taskToUploadDrive;
    if (!task || !selectedDriveId) return;
    if (pendingDeliveries[task.id]) {
      setTaskToUploadDrive(null);
      return;
    }
    try {
      const { deliveryTaskId } = await uploadExportToDrive(task.id, selectedDriveId);
      setPendingDeliveries(prev => ({ ...prev, [task.id]: deliveryTaskId }));
      toast.success(t('releases.drive.uploadQueued'));
    } catch (err: any) {
      toast.error(err.message || t('releases.drive.uploadFailed'));
    } finally {
      setTaskToUploadDrive(null);
    }
  };

  const getDriveDelivery = (exportId: string): DeliveryStatus | null => {
    const dId = pendingDeliveries[exportId];
    return dId ? (deliveries[dId] ?? null) : null;
  };

  const getGumroadDelivery = (exportId: string): DeliveryStatus | null => {
    const dId = pendingGumroadDeliveries[exportId];
    return dId ? (deliveries[dId] ?? null) : null;
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title={t('exports.title')}
        description={t('exports.description')}
        actions={
          <div className="flex items-center flex-wrap gap-3">
            {/* Releases + history capsule */}
            <div className="flex-shrink-0 flex items-center gap-3 bg-white/60 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 px-4 py-2.5 rounded-card shadow-sm backdrop-blur-md h-[42px]">
              <Link
                to="/releases"
                className="flex items-center gap-2 hover:opacity-80 transition"
              >
                <Rocket className="h-4 w-4 text-pink-600 dark:text-pink-400 flex-shrink-0" />
                <span className="text-[10px] font-black text-neutral-700 dark:text-neutral-400 uppercase tracking-widest">
                  {t('releases.headerLink')}
                </span>
              </Link>
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-800" />
              <Link
                to="/releases/history"
                className="flex items-center gap-2 hover:opacity-80 transition"
              >
                <HistoryIcon className="h-4 w-4 text-pink-600 dark:text-pink-400 flex-shrink-0" />
                <span className="text-[10px] font-black text-neutral-700 dark:text-neutral-400 uppercase tracking-widest">
                  {t('releases.history.headerLink')}
                </span>
              </Link>
            </div>

            {/* Combined Stats Pill */}
            <div className="flex-shrink-0 bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 px-4 py-2.5 rounded-card flex items-center gap-4 shadow-sm backdrop-blur-md h-[42px]">
              {/* Database */}
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-neutral-500 dark:text-neutral-500 flex-shrink-0" />
                <span className="text-[10px] font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest">
                  {total} <span className="opacity-50 ml-0.5">{t('exports.stats.total')}</span>
                </span>
              </div>
              
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-800" />
              
              {/* In Progress */}
              <div className="flex items-center gap-2">
                {activeExportCount > 0 ? (
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                )}
                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                  {activeExportCount} <span className="opacity-50 ml-0.5">{t('exports.stats.active')}</span>
                </span>
              </div>
            </div>
          </div>
        }
      />

      <ProjectImportPanel />

      {!loading && exports.length === 0 ? (
        <div className="py-32 text-center text-neutral-600 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card bg-white/40 dark:bg-neutral-900/40 shadow-sm backdrop-blur-3xl">
          <List className="w-12 h-12 mx-auto opacity-10 mb-4" />
          <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-2">{t('exports.empty.title')}</div>
          <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-8 max-w-[200px] mx-auto leading-relaxed">{t('exports.empty.description')}</div>
          <Link to="/projects" className="px-6 py-2.5 bg-white dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white text-[10px] font-black uppercase tracking-widest rounded-card transition-all border border-neutral-200 dark:border-neutral-800 active:scale-95">
            {t('exports.empty.viewProjects')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {exports.map((task) => {
            const taskTarget = getTaskTarget(task);
            const driveDelivery = getDriveDelivery(task.id);
            const isDriveUploading = driveDelivery && (driveDelivery.status === 'pending' || driveDelivery.status === 'processing');
            const driveProgress = driveDelivery && driveDelivery.totalBytes
              ? Math.round((driveDelivery.bytesTransferred / driveDelivery.totalBytes) * 100)
              : 0;
            const gumroadDelivery = getGumroadDelivery(task.id);
            const isGumroadPublishing = gumroadDelivery && (gumroadDelivery.status === 'pending' || gumroadDelivery.status === 'processing');
            const gumroadProgress = gumroadDelivery && gumroadDelivery.totalBytes
              ? Math.round((gumroadDelivery.bytesTransferred / gumroadDelivery.totalBytes) * 100)
              : 0;

            return (
              <div
                key={task.id}
                className={`bg-white/70 dark:bg-neutral-900/70 p-4 md:p-5 rounded-card border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-ui group/task shadow-sm hover:shadow-xl backdrop-blur-xl duration-300 hover:-translate-y-0.5 ${task.status === 'failed' ? 'border-red-500/30' : 'border-neutral-200/50 dark:border-white/5 hover:border-blue-500/50'}`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Status Indicator Bar */}
                  <div className={`w-1 h-10 sm:h-8 rounded-full flex-shrink-0 ${
                    task.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                    task.status === 'failed' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                    'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                  }`} />

                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      <Link
                        to={taskTarget.to}
                        className="w-fit text-[9px] font-black text-blue-600 dark:text-blue-500 hover:text-blue-500 transition-colors uppercase tracking-widest bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20 flex items-center gap-1 group/project shadow-sm"
                      >
                        {taskTarget.labelPrefix}: {task.projectName}
                        <ArrowRight className="w-2.5 h-2.5 group-hover/project:translate-x-0.5 transition-transform" />
                      </Link>
                      <span className="text-[11px] sm:text-[10px] font-bold text-neutral-900 dark:text-white sm:text-neutral-400 truncate tracking-tight">
                        {task.packageName || `Archive #${task.id.slice(0, 8)}`}
                      </span>
                      {task.sourceType === 'project-bundle' && (
                        <span className="w-fit rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-600 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400">
                          {t('projectImports.bundleBadge')}
                        </span>
                      )}
                    </div>

                    {/* Context Info */}
                    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-1">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">
                        <Clock className="w-3 h-3" />
                        {new Date(task.createdAt).toLocaleString()}
                      </div>
                      {task.status === 'completed' && task.size ? (
                        <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">
                          <HardDrive className="w-3 h-3" />
                          {formatSize(task.size)}
                        </div>
                      ) : null}
                      {task.status === 'completed' ? (
                        <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">
                          <List className="w-3 h-3" />
                          {t('exports.card.files', { count: task.total })}
                        </div>
                      ) : null}
                      {(task.status === 'processing' || task.status === 'pending') && (
                        <div className="flex items-center gap-2 group-hover/task:translate-x-1 transition-transform">
                          <div className="w-20 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-900 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-inner">
                            <div
                              className="h-full bg-blue-500 transition-all duration-500"
                              style={{ width: task.status === 'pending' || task.total <= 0 ? '0%' : `${(task.current / task.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-[8px] font-black text-blue-500 uppercase tracking-tighter">
                            {task.status === 'pending' ? t('exports.status.queued') : `${task.current}/${task.total}`}
                          </span>
                        </div>
                      )}

                      {/* Drive upload progress */}
                      {isDriveUploading && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 sm:w-20 h-1.5 bg-white dark:bg-neutral-900 rounded-full overflow-hidden border border-emerald-200 dark:border-emerald-900/40 shadow-inner">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-500"
                              style={{ width: driveDelivery?.status === 'pending' ? '5%' : `${driveProgress}%` }}
                            />
                          </div>
                          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">
                            {driveLabel(driveDelivery?.driveProvider || 'google-drive')}: {driveProgress}%
                          </span>
                        </div>
                      )}

                      {/* Gumroad publish progress */}
                      {isGumroadPublishing && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 sm:w-20 h-1.5 bg-white dark:bg-neutral-900 rounded-full overflow-hidden border border-pink-200 dark:border-pink-900/40 shadow-inner">
                            <div
                              className="h-full bg-pink-500 transition-all duration-500"
                              style={{ width: gumroadDelivery?.status === 'pending' ? '5%' : `${gumroadProgress}%` }}
                            />
                          </div>
                          <span className="text-[8px] font-black text-pink-500 uppercase tracking-tighter">
                            Gumroad: {gumroadDelivery?.phase ? `${gumroadDelivery.phase}` : `${gumroadProgress}%`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & Actions Row */}
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-200 dark:border-neutral-800 sm:border-none">
                  <div className="flex-shrink-0 flex items-center gap-2 sm:gap-3">
                    {task.status === 'completed' && (
                      <div className="flex items-center gap-1.5 text-emerald-500 text-[9px] font-black uppercase tracking-widest bg-emerald-500/5 px-2.5 py-1.5 rounded-lg border border-emerald-500/10">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('exports.status.ready')}
                      </div>
                    )}
                    {task.status === 'processing' && (
                      <div className="flex items-center gap-1.5 text-blue-400 text-[9px] font-black uppercase tracking-widest bg-blue-500/5 px-2.5 py-1.5 rounded-lg border border-blue-500/10">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('exports.status.archiving')}
                      </div>
                    )}
                     {task.status === 'pending' && (
                       <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-500 text-[9px] font-black uppercase tracking-widest bg-neutral-50 dark:bg-neutral-900 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm">
                         <Loader2 className="w-3.5 h-3.5 animate-pulse" />
                         {t('exports.status.queued')}
                       </div>
                     )}
                    {task.status === 'failed' && (
                      <div className="flex items-center gap-1.5 text-red-500 text-[9px] font-black uppercase tracking-widest bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20">
                        <XCircle className="w-3.5 h-3.5" />
                        {t('exports.status.failed')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:border-l sm:border-neutral-800 sm:pl-4">
                    {task.status === 'completed' && task.downloadUrl && (
                      <a
                        href={task.downloadUrl}
                        download
                        className="p-2 sm:p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 bg-blue-500/5 sm:bg-transparent"
                        title={t('exports.card.download')}
                      >
                        <Download className="w-5 h-5 sm:w-4 sm:h-4" />
                      </a>
                    )}
                    {task.status === 'completed' && drives.length > 0 && (
                      <button
                        onClick={() => handleUploadToDrive(task)}
                        disabled={!!isDriveUploading}
                        className="p-2 sm:p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-500/5 sm:bg-transparent"
                        title={isDriveUploading ? t('releases.drive.uploading') : t('releases.drive.releaseToDrive')}
                      >
                        {isDriveUploading ? <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" /> : <Upload className="w-5 h-5 sm:w-4 sm:h-4" />}
                      </button>
                    )}
                    {task.status === 'completed' && hasStores && (
                      <Link
                        to={`/exports/${task.id}/sell`}
                        className={`p-2 sm:p-1.5 text-pink-500 hover:bg-pink-500/10 rounded-lg transition-all active:scale-90 bg-pink-500/5 sm:bg-transparent ${isGumroadPublishing ? 'pointer-events-none opacity-50' : ''}`}
                        title={isGumroadPublishing ? t('sell.publishing') : t('sell.sell')}
                      >
                        {isGumroadPublishing ? <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" /> : <Tag className="w-5 h-5 sm:w-4 sm:h-4" />}
                      </Link>
                    )}
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-2 sm:p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-card transition-all active:scale-90 border border-transparent hover:border-red-100"
                      title={t('exports.card.delete')}
                    >
                      <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
             <div className="flex items-center justify-center py-12">
               <Loader2 className="w-6 h-6 text-neutral-800 animate-spin" />
             </div>
          )}
          {pages > 1 && (
            <div className="flex flex-col items-center gap-3 pt-8 pb-4">
              <PageNav page={page} pages={pages} onPageChange={handlePageChange} size="lg" />
              <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('exports.pagination', { current: page, total: pages })}</span>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setTaskToDelete(null);
        }}
        onConfirm={confirmDelete}
        title={t('exports.deleteDialog.title')}
        message={t('exports.deleteDialog.message')}
        confirmText={t('exports.deleteDialog.confirm')}
        type="danger"
      />

      {taskToUploadDrive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200/50 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900">
            <div>
              <h2 className="text-lg font-bold text-neutral-950 dark:text-white">
                {t('releases.drive.confirmDialog.title')}
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {t('releases.drive.confirmDialog.message', {
                  name: taskToUploadDrive.packageName || `Archive #${taskToUploadDrive.id.slice(0, 8)}`,
                })}
              </p>
            </div>

            <div className="space-y-2">
              {drives.map((drive) => {
                const DriveIcon = DRIVE_ICON[drive.platform] ?? Cloud;
                const isSelected = selectedDriveId === drive.id;
                return (
                  <button
                    key={drive.id}
                    type="button"
                    onClick={() => setSelectedDriveId(drive.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-neutral-200 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5'
                    }`}
                  >
                    <DriveIcon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-neutral-900 dark:text-white">
                        {driveName(drive)}
                      </span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {driveLabel(drive.platform)}
                      </span>
                    </span>
                    {isSelected ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskToUploadDrive(null)}
                className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                {t('releases.cancel')}
              </button>
              <button
                type="button"
                disabled={!selectedDriveId}
                onClick={confirmUploadToDrive}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {t('releases.drive.confirmDialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

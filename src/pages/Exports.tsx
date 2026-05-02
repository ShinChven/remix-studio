import { useState, useEffect, useRef } from 'react';
import { Download, Loader2, CheckCircle2, XCircle, Trash2, Clock, ArrowRight, List, ChevronDown, HardDrive, Link2Off, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExportTask, DeliveryStatus } from '../types';
import { fetchAllExports, deleteExport, uploadExportToDrive, fetchDeliveryStatus, fetchActiveDeliveries, disconnectGoogleDrive, fetchCurrentUser } from '../api';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from 'sonner';

export function Exports() {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(authUser);
  const [exports, setExports] = useState<ExportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // deliveryId → DeliveryStatus for in-progress Drive uploads
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryStatus>>({});
  // exportTaskId → deliveryTaskId (to know which export has an in-flight delivery)
  const [pendingDeliveries, setPendingDeliveries] = useState<Record<string, string>>({});
  const deliveryPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${parseFloat(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0$/, ''))} ${sizes[index]}`;
  };

  // Sync local user state when auth context updates
  useEffect(() => { setUser(authUser); }, [authUser]);

  // Handle OAuth callback result via URL params
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success) {
      toast.success(decodeURIComponent(success.replace(/\+/g, ' ')));
      fetchCurrentUser().then(setUser).catch(() => {});
      const next = new URLSearchParams(searchParams);
      next.delete('success');
      setSearchParams(next, { replace: true });
    } else if (error) {
      toast.error(decodeURIComponent(error.replace(/\+/g, ' ')));
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Poll delivery statuses
  useEffect(() => {
    const activeIds = Object.entries(pendingDeliveries)
      .map(([, dId]) => dId)
      .filter(dId => {
        const d = deliveries[dId];
        return !d || d.status === 'pending' || d.status === 'processing';
      });

    if (activeIds.length === 0) {
      if (deliveryPollRef.current) clearInterval(deliveryPollRef.current);
      return;
    }

    const poll = async () => {
      for (const dId of activeIds) {
        try {
          const status = await fetchDeliveryStatus(dId);
          setDeliveries(prev => ({ ...prev, [dId]: status }));
          if (status.status === 'completed') {
            toast.success(
              <span>
                {t('exports.drive.uploadSuccess')}{' '}
                <a href={status.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  {t('exports.drive.openFile')}
                </a>
              </span>
            );
          } else if (status.status === 'failed') {
            toast.error(status.error || t('exports.drive.uploadFailed'));
            // Remove from pending so the button resets
            setPendingDeliveries(prev => {
              const next = { ...prev };
              const exportId = Object.entries(prev).find(([, v]) => v === dId)?.[0];
              if (exportId) delete next[exportId];
              return next;
            });
          }
        } catch {
          // ignore transient errors
        }
      }
    };

    poll();
    deliveryPollRef.current = setInterval(poll, 3000);
    return () => { if (deliveryPollRef.current) clearInterval(deliveryPollRef.current); };
  }, [pendingDeliveries, deliveries, t]);

  const handleDisconnectDrive = async () => {
    setDisconnecting(true);
    try {
      await disconnectGoogleDrive();
      const me = await fetchCurrentUser();
      setUser(me);
      toast.success(t('exports.drive.disconnectSuccess'));
    } catch (err: any) {
      toast.error(err.message || t('exports.drive.disconnectError'));
    } finally {
      setDisconnecting(false);
    }
  };

  const loadExports = async (cursor?: string, append = false) => {
    try {
      if (append) setLoadingMore(true);
      const [{ items, nextCursor: newCursor }, activeDeliveries] = await Promise.all([
        fetchAllExports(15, cursor),
        fetchActiveDeliveries(),
      ]);
      if (append) {
        setExports(prev => [...prev, ...items]);
      } else {
        setExports(items);
      }
      setNextCursor(newCursor || null);
      setDeliveries(prev => {
        const next = { ...prev };
        for (const delivery of activeDeliveries) {
          next[delivery.id] = delivery;
        }
        return next;
      });
      setPendingDeliveries(
        Object.fromEntries(activeDeliveries.map((delivery) => [delivery.exportTaskId, delivery.id]))
      );
    } catch (err) {
      console.error('Failed to load exports:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadExports();
    const hasActiveTasks = exports.some(t => t.status === 'pending' || t.status === 'processing');
    let interval: any;
    if (hasActiveTasks) {
      interval = setInterval(() => loadExports(undefined, false), 3000);
    }
    return () => clearInterval(interval);
  }, [exports.some(t => t.status === 'pending' || t.status === 'processing')]);

  const handleLoadMore = () => {
    if (nextCursor) loadExports(nextCursor, true);
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
      setExports(prev => prev.filter(t => t.id !== taskToDelete));
    } catch (err: any) {
      toast.error(`Failed to delete export record: ${err.message}`);
    } finally {
      setTaskToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleUploadToDrive = async (task: ExportTask) => {
    // Disable if already uploading
    if (pendingDeliveries[task.id]) return;
    try {
      const { deliveryTaskId } = await uploadExportToDrive(task.id);
      setPendingDeliveries(prev => ({ ...prev, [task.id]: deliveryTaskId }));
      toast.success(t('exports.drive.uploadQueued'));
    } catch (err: any) {
      toast.error(err.message || t('exports.drive.uploadFailed'));
    }
  };

  const getDriveDelivery = (exportId: string): DeliveryStatus | null => {
    const dId = pendingDeliveries[exportId];
    return dId ? (deliveries[dId] ?? null) : null;
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title={t('exports.title')}
        description={t('exports.description')}
      />

      {/* Stats + Google Drive controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-end gap-3 mb-8">
        {/* Google Drive control */}
        {user?.googleDriveConnected ? (
          <div className="flex items-center justify-between sm:justify-start gap-3 bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 px-4 py-2.5 rounded-card shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">{t('exports.drive.connected')}</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-emerald-500/20" />
            <button
              onClick={handleDisconnectDrive}
              disabled={disconnecting}
              className="flex items-center gap-1.5 text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest hover:text-red-500 transition disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              <span className="sm:hidden">{t('exports.drive.disconnect')}</span>
              <span className="hidden sm:inline">{t('exports.drive.disconnect')}</span>
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/google-drive/connect"
            className="flex items-center justify-center gap-2 bg-white/60 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 px-4 py-2.5 rounded-card hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition shadow-sm backdrop-blur-md"
          >
            <HardDrive className="h-4 w-4 text-neutral-600 dark:text-neutral-500 flex-shrink-0" />
            <span className="text-[10px] font-black text-neutral-700 dark:text-neutral-400 uppercase tracking-widest text-center">{t('exports.drive.connect')}</span>
          </a>
        )}

        {/* Database stats */}
        <div className="bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 px-4 py-2.5 rounded-card flex items-center justify-between sm:justify-start gap-4 shadow-sm backdrop-blur-md">
          <div className="flex flex-col">
            <p className="text-[8px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">{t('exports.stats.database')}</p>
            <p className="text-xs font-bold text-neutral-900 dark:text-white">{exports.length} {t('exports.stats.total')}</p>
          </div>
          <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800" />
          <div className="flex flex-col">
            <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest">{t('exports.stats.inProgress')}</p>
            <p className="text-xs font-bold text-neutral-900 dark:text-white">
              {exports.filter(t => t.status === 'pending' || t.status === 'processing').length} {t('exports.stats.active')}
            </p>
          </div>
        </div>
      </div>

      {!loading && exports.length === 0 ? (
        <div className="py-32 text-center text-neutral-600 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card bg-white/40 dark:bg-neutral-900/40 shadow-sm backdrop-blur-3xl">
          <List className="w-12 h-12 mx-auto opacity-10 mb-4" />
          <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-2">{t('exports.empty.title')}</div>
          <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-8 max-w-[200px] mx-auto leading-relaxed">{t('exports.empty.description')}</div>
          <Link to="/projects" className="px-6 py-2.5 bg-white dark:bg-neutral-900 hover:bg-neutral-800 text-neutral-900 dark:text-white text-[10px] font-black uppercase tracking-widest rounded-card transition-all border border-neutral-200 dark:border-neutral-800 active:scale-95">
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

            return (
              <div
                key={task.id}
                className={`bg-white/70 dark:bg-neutral-900/70 p-4 md:p-5 rounded-card border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all group/task shadow-sm hover:shadow-xl backdrop-blur-xl duration-300 hover:-translate-y-0.5 ${task.status === 'failed' ? 'border-red-500/30' : 'border-neutral-200/50 dark:border-white/5 hover:border-blue-500/50'}`}
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
                              style={{ width: task.status === 'pending' ? '0%' : `${(task.current / task.total) * 100}%` }}
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
                            Drive: {driveProgress}%
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
                    {task.status === 'completed' && user?.googleDriveConnected && (
                      <button
                        onClick={() => handleUploadToDrive(task)}
                        disabled={!!isDriveUploading}
                        className="p-2 sm:p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-500/5 sm:bg-transparent"
                        title={isDriveUploading ? t('exports.drive.uploading') : t('exports.drive.uploadToDrive')}
                      >
                        {isDriveUploading ? <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" /> : <Upload className="w-5 h-5 sm:w-4 sm:h-4" />}
                      </button>
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
          {nextCursor && (
            <div className="flex justify-center pt-8">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md text-neutral-600 dark:text-neutral-400 hover:text-white text-xs font-black uppercase tracking-widest rounded-card transition-all border border-neutral-200/50 dark:border-white/5 hover:border-neutral-700 active:scale-95 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                )}
                {loadingMore ? t('libraries.duplicateDialog.confirm') + '...' : t('exports.loadMore')}
              </button>
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
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileArchive,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { ProjectImportTask } from '../types';
import { deleteProjectImport, fetchProjectImports, uploadProjectBundle } from '../api';
import { ConfirmModal } from './ConfirmModal';

const IMPORTS_PAGE_SIZE = 5;
const POLL_INTERVAL_MS = 3000;

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${parseFloat(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2))} ${units[index]}`;
}

/**
 * Upload a project bundle and watch it unpack. Lives on its own page under
 * Projects, reached from the import button in the Projects header.
 */
export function ProjectImportPanel() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imports, setImports] = useState<ProjectImportTask[]>([]);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Import ids already announced, so overlapping polls can't toast twice.
  const announcedRef = useRef<Set<string>>(new Set());
  // The first load seeds that set instead of toasting, so opening the page
  // doesn't replay every import that finished days ago.
  const seededRef = useRef(false);

  const hasActive = imports.some((task) => task.status === 'pending' || task.status === 'processing');
  const isUploading = uploadPercent !== null;

  const loadImports = useCallback(async () => {
    try {
      const { items } = await fetchProjectImports(1, IMPORTS_PAGE_SIZE);
      setImports(items);

      const seeding = !seededRef.current;
      seededRef.current = true;

      for (const task of items) {
        if (task.status !== 'completed' && task.status !== 'failed') continue;
        if (announcedRef.current.has(task.id)) continue;
        announcedRef.current.add(task.id);
        if (seeding) continue;

        if (task.status === 'completed') {
          toast.success(t('projectImports.toast.completed', { name: task.projectName || '' }));
        } else {
          toast.error(task.error || t('projectImports.toast.failed'));
        }
      }
    } catch (err) {
      console.error('Failed to load project imports:', err);
    }
  }, [t]);

  useEffect(() => {
    void loadImports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasActive) return undefined;
    const interval = setInterval(() => { void loadImports(); }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActive, loadImports]);

  const handleFile = async (file: File) => {
    if (isUploading) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error(t('projectImports.errors.notZip'));
      return;
    }

    setUploadPercent(0);
    try {
      await uploadProjectBundle(file, { onProgress: setUploadPercent });
      toast.success(t('projectImports.toast.queued'));
      await loadImports();
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || t('projectImports.errors.uploadFailed'));
      }
    } finally {
      setUploadPercent(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmDelete = async () => {
    const taskId = taskToDelete;
    if (!taskId) return;
    try {
      await deleteProjectImport(taskId);
      setImports((prev) => prev.filter((task) => task.id !== taskId));
    } catch (err: any) {
      toast.error(err?.message || t('projectImports.errors.deleteFailed'));
    } finally {
      setTaskToDelete(null);
    }
  };

  return (
    <section className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`rounded-card border p-4 md:p-5 shadow-sm backdrop-blur-xl transition-ui ${
          isDragging
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-neutral-200/50 bg-white/70 dark:border-white/5 dark:bg-neutral-900/70'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-2.5 text-violet-500 flex-shrink-0">
              <FileArchive className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-900 dark:text-white">
                {t('projectImports.dropzone.title')}
              </h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500 leading-relaxed">
                {t('projectImports.dropzone.hint')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {isUploading ? t('projectImports.uploading', { percent: uploadPercent ?? 0 }) : t('projectImports.selectFile')}
          </button>
        </div>

        {isUploading && (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 shadow-inner dark:border-neutral-800 dark:bg-neutral-900">
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${uploadPercent ?? 0}%` }}
            />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {imports.map((task) => {
        const percent = task.total > 0 ? Math.round((task.current / task.total) * 100) : 0;
        const isRunning = task.status === 'pending' || task.status === 'processing';

        return (
          <div
            key={task.id}
            className={`flex flex-col gap-3 rounded-card border bg-white/70 p-4 shadow-sm backdrop-blur-xl transition-ui dark:bg-neutral-900/70 sm:flex-row sm:items-center sm:justify-between ${
              task.status === 'failed'
                ? 'border-red-500/30'
                : 'border-neutral-200/50 dark:border-white/5'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className={`h-10 w-1 flex-shrink-0 rounded-full sm:h-8 ${
                task.status === 'completed' ? 'bg-emerald-500' :
                task.status === 'failed' ? 'bg-red-500' :
                'bg-violet-500 animate-pulse'
              }`} />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  {task.projectId ? (
                    <Link
                      to={`/project/${task.projectId}`}
                      className="flex w-fit items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-600 shadow-sm transition-colors hover:text-violet-500 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400"
                    >
                      {task.projectName || t('projectImports.untitled')}
                      <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  ) : (
                    <span className="w-fit rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                      {task.projectName || t('projectImports.untitled')}
                    </span>
                  )}
                  <span className="truncate text-[11px] font-bold tracking-tight text-neutral-900 dark:text-neutral-400 sm:text-[10px]">
                    {task.fileName || 'bundle.zip'}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                    <Clock className="h-3 w-3" />
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                  {formatSize(task.size) && (
                    <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                      {formatSize(task.size)}
                    </span>
                  )}
                  {isRunning && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 shadow-inner sm:w-24 dark:border-neutral-800 dark:bg-neutral-900">
                        <div
                          className="h-full bg-violet-500 transition-all duration-500"
                          style={{ width: task.status === 'pending' ? '0%' : `${percent}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-tighter text-violet-500">
                        {task.status === 'pending'
                          ? t('projectImports.status.queued')
                          : `${task.current}/${task.total}`}
                      </span>
                    </div>
                  )}
                  {task.status === 'failed' && task.error && (
                    <span className="text-[8px] font-bold uppercase tracking-widest text-red-500">
                      {task.error}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800 sm:justify-end sm:border-t-0 sm:pt-0">
              {task.status === 'completed' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('projectImports.status.imported')}
                </span>
              )}
              {task.status === 'processing' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-violet-500/10 bg-violet-500/5 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-violet-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('projectImports.status.unpacking')}
                </span>
              )}
              {task.status === 'pending' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                  <Loader2 className="h-3.5 w-3.5 animate-pulse" />
                  {t('projectImports.status.queued')}
                </span>
              )}
              {task.status === 'failed' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-500">
                  <XCircle className="h-3.5 w-3.5" />
                  {t('projectImports.status.failed')}
                </span>
              )}

              <button
                type="button"
                onClick={() => setTaskToDelete(task.id)}
                disabled={task.status === 'processing'}
                className="rounded-card border border-transparent p-2 text-neutral-400 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-500 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 sm:p-2.5 dark:hover:bg-red-500/10"
                title={t('projectImports.deleteRecord')}
              >
                <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        );
      })}

      <ConfirmModal
        isOpen={taskToDelete !== null}
        onClose={() => setTaskToDelete(null)}
        onConfirm={confirmDelete}
        title={t('projectImports.confirmDelete.title')}
        message={t('projectImports.confirmDelete.message')}
        confirmText={t('projectImports.confirmDelete.confirm')}
        type="danger"
      />
    </section>
  );
}

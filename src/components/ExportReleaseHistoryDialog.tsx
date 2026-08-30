import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Cloud, ExternalLink, HardDrive, History as HistoryIcon, Loader2, Store as StoreIcon, X, XCircle } from 'lucide-react';
import { ReleaseHistoryItem } from '../api';

/** Presentation for every destination a release can land on. */
const PLATFORM_META: Record<string, { label: string; icon: typeof Cloud; accent: string }> = {
  gumroad: { label: 'Gumroad', icon: StoreIcon, accent: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10 border-pink-200 dark:border-pink-500/20' },
  'google-drive': { label: 'Google Drive', icon: HardDrive, accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  onedrive: { label: 'OneDrive', icon: Cloud, accent: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20' },
  // MEGA can no longer be connected, but releases made before it was removed
  // stay in the history and should still be named properly.
  mega: { label: 'MEGA', icon: Cloud, accent: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
};

function platformMeta(platform: string) {
  return (
    PLATFORM_META[platform] ?? {
      label: platform,
      icon: Cloud,
      accent: 'text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-500/10 border-neutral-200 dark:border-neutral-500/20',
    }
  );
}

interface ExportReleaseHistoryDialogProps {
  /** Archive name shown in the dialog subtitle. */
  exportName: string;
  /** Cached rows, or null while they have never been loaded for this export. */
  items: ReleaseHistoryItem[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

/**
 * Store/drive upload history of a single export, loaded on demand by the
 * caller (nothing is fetched until the dialog is opened).
 */
export function ExportReleaseHistoryDialog({
  exportName,
  items,
  loading,
  error,
  onClose,
  onRetry,
}: ExportReleaseHistoryDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-300 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-release-history-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-neutral-200/50 bg-white shadow-[0_50px_100px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-300 dark:border-white/5 dark:bg-neutral-900 dark:shadow-[0_50px_100px_rgba(0,0,0,0.8)] sm:max-h-[calc(100dvh-3rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200/50 p-5 dark:border-white/5 sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex-shrink-0 rounded-xl border border-pink-500/20 bg-pink-500/10 p-2.5 text-pink-500">
              <HistoryIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="export-release-history-title" className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                {t('releases.history.exportDialog.title')}
              </h3>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-neutral-500" title={exportName}>
                {exportName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label={t('releases.history.errorDetails.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          {loading && items === null ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-800 dark:text-white" />
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <XCircle className="mx-auto mb-4 h-10 w-10 text-red-500/40" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-5 rounded-xl bg-neutral-900 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-neutral-700 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {t('releases.history.exportDialog.retry')}
              </button>
            </div>
          ) : !items || items.length === 0 ? (
            <div className="py-16 text-center text-neutral-600">
              <HistoryIcon className="mx-auto mb-4 h-10 w-10 opacity-10" />
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em]">
                {t('releases.history.exportDialog.empty.title')}
              </div>
              <div className="mx-auto max-w-[260px] text-[8px] font-bold uppercase leading-relaxed tracking-widest opacity-40">
                {t('releases.history.exportDialog.empty.description')}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => {
                const isSuccess = item.status === 'success';
                const meta = platformMeta(item.platform);
                const PlatformIcon = meta.icon;
                const accountName = item.store?.profileName || item.driveConnection?.displayName || item.driveConnection?.email;
                const targetUrl = item.targetUrl || item.product?.gumroadShortUrl || null;
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                      isSuccess
                        ? 'border-neutral-200/70 bg-white/60 dark:border-white/5 dark:bg-neutral-950/40'
                        : 'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`flex w-fit items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${meta.accent}`}>
                          <PlatformIcon className="h-2.5 w-2.5" />
                          {meta.label}
                        </span>
                        {accountName ? (
                          <span className="truncate text-[10px] font-bold tracking-tight text-neutral-600 dark:text-neutral-400">
                            {accountName}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                        <Clock className="h-3 w-3" />
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                      {targetUrl ? (
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 truncate text-[8px] font-bold uppercase tracking-widest text-blue-600 hover:underline dark:text-blue-400"
                          title={targetUrl}
                        >
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{targetUrl}</span>
                        </a>
                      ) : null}
                      {!isSuccess && item.error ? (
                        <p className="whitespace-pre-wrap break-words rounded border border-red-500/10 bg-red-500/5 px-2 py-1.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                          {item.error}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex-shrink-0">
                      {isSuccess ? (
                        <div className="flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t('releases.history.status.success')}
                        </div>
                      ) : (
                        <div className="flex w-fit items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-500">
                          <XCircle className="h-3.5 w-3.5" />
                          {t('releases.history.status.failed')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-200/50 bg-neutral-50/40 p-4 dark:border-white/5 dark:bg-neutral-950/40 sm:px-6">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {items ? t('releases.history.exportDialog.count', { count: items.length }) : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-xl bg-neutral-900 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/40 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {t('releases.history.errorDetails.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

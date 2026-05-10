import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, History as HistoryIcon, List, Loader2, Store as StoreIcon, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchStoreUploads, StoreUploadHistoryItem } from '../api';
import { PageHeader } from '../components/PageHeader';

const PAGE_SIZE = 20;

function platformLabel(platform: string) {
  if (platform === 'gumroad') return 'Gumroad';
  return platform;
}

export function StoreUploadHistory() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [items, setItems] = useState<StoreUploadHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStoreUploads(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setPages(Math.max(1, res.pages));
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast.error(err?.message || t('exports.uploads.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, t]);

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', newPage.toString());
      return next;
    });
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title={t('exports.uploads.title')}
        description={t('exports.uploads.description')}
        backLink={{ to: '/exports', label: t('exports.uploads.backToExports') }}
        actions={(
          <div className="flex-shrink-0 bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 px-4 py-2.5 rounded-card flex items-center gap-2 shadow-sm backdrop-blur-md h-[42px]">
            <List className="h-4 w-4 text-neutral-500 dark:text-neutral-500 flex-shrink-0" />
            <span className="text-[10px] font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-widest">
              {total} <span className="opacity-50 ml-0.5">{t('exports.uploads.stats.total')}</span>
            </span>
          </div>
        )}
      />

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-neutral-800 dark:text-white animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-32 text-center text-neutral-600 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card bg-white/40 dark:bg-neutral-900/40 shadow-sm backdrop-blur-3xl">
          <HistoryIcon className="w-12 h-12 mx-auto opacity-10 mb-4" />
          <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-2">
            {t('exports.uploads.empty.title')}
          </div>
          <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 max-w-[260px] mx-auto leading-relaxed">
            {t('exports.uploads.empty.description')}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isSuccess = item.status === 'success';
            const targetUrl = item.targetUrl || item.product?.gumroadShortUrl || null;
            const title = item.title || item.product?.title || t('exports.uploads.untitled');
            return (
              <div
                key={item.id}
                className={`bg-white/70 dark:bg-neutral-900/70 p-4 md:p-5 rounded-card border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm hover:shadow-xl backdrop-blur-xl duration-300 hover:-translate-y-0.5 ${
                  isSuccess ? 'border-neutral-200/50 dark:border-white/5' : 'border-red-500/30'
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-1 h-10 sm:h-8 rounded-full flex-shrink-0 ${
                    isSuccess
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                      : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                  }`} />
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      <span className="w-fit text-[9px] font-black text-pink-600 dark:text-pink-400 uppercase tracking-widest bg-pink-50 dark:bg-pink-500/10 px-2 py-0.5 rounded border border-pink-200 dark:border-pink-500/20 flex items-center gap-1">
                        <StoreIcon className="w-2.5 h-2.5" />
                        {platformLabel(item.platform)}
                      </span>
                      <span className="text-[11px] sm:text-[10px] font-bold text-neutral-900 dark:text-white sm:text-neutral-400 truncate tracking-tight">
                        {title}
                      </span>
                    </div>

                    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-1">
                      <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">
                        <Clock className="w-3 h-3" />
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                      {item.store?.profileName ? (
                        <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">
                          <StoreIcon className="w-3 h-3" />
                          {item.store.profileName}
                        </div>
                      ) : null}
                      {targetUrl ? (
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[8px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline truncate max-w-[280px]"
                          title={targetUrl}
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{targetUrl}</span>
                        </a>
                      ) : null}
                    </div>

                    {!isSuccess && item.error ? (
                      <div className="mt-2 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-500/5 border border-red-500/10 rounded px-2 py-1.5 break-words">
                        {item.error}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-200 dark:border-neutral-800 sm:border-none">
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {isSuccess ? (
                      <div className="flex items-center gap-1.5 text-emerald-500 text-[9px] font-black uppercase tracking-widest bg-emerald-500/5 px-2.5 py-1.5 rounded-lg border border-emerald-500/10">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('exports.uploads.status.success')}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500 text-[9px] font-black uppercase tracking-widest bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20">
                        <XCircle className="w-3.5 h-3.5" />
                        {t('exports.uploads.status.failed')}
                      </div>
                    )}
                  </div>

                  {targetUrl ? (
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 sm:p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 bg-blue-500/5 sm:bg-transparent"
                      title={t('exports.uploads.openProduct')}
                    >
                      <ExternalLink className="w-5 h-5 sm:w-4 sm:h-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}

          {pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-8 pb-4">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                {t('exports.pagination', { current: page, total: pages })}
              </span>
              <button
                onClick={() => handlePageChange(Math.min(pages, page + 1))}
                disabled={page === pages}
                className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

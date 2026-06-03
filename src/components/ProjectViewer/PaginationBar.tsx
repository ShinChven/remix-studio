import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS: (number | 'all')[] = [25, 50, 100, 200, 500, 'all'];

interface PaginationBarProps {
  page: number;
  pageSize: number | 'all';
  total: number;
  pages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number | 'all') => void;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  pages,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const { t } = useTranslation();
  const isAll = pageSize === 'all';
  const effectivePages = isAll ? 1 : Math.max(1, pages);
  const safePage = Math.min(Math.max(1, page), effectivePages);
  const startIndex = isAll || total === 0 ? (total === 0 ? 0 : 1) : (safePage - 1) * (pageSize as number) + 1;
  const endIndex = isAll
    ? total
    : Math.min(total, safePage * (pageSize as number));

  const isFirst = safePage <= 1;
  const isLast = safePage >= effectivePages;

  const goTo = (p: number) => {
    if (isAll) return;
    const next = Math.min(Math.max(1, p), effectivePages);
    if (next === safePage) return;
    onPageChange(next);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-neutral-950/40 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
        <span>{t('pagination.range', { start: startIndex, end: endIndex, total })}</span>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
          <span>{t('pagination.pageSize')}</span>
          <select
            value={isAll ? 'all' : String(pageSize)}
            onChange={(e) => {
              const v = e.target.value;
              onPageSizeChange(v === 'all' ? 'all' : Number(v));
            }}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 px-2 py-1 text-[10px] font-black text-neutral-700 dark:text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={String(opt)} value={String(opt)}>
                {opt === 'all' ? t('pagination.all') : opt}
              </option>
            ))}
          </select>
        </label>

        {!isAll && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goTo(1)}
              disabled={isFirst}
              aria-label={t('pagination.first')}
              className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => goTo(safePage - 1)}
              disabled={isFirst}
              aria-label={t('pagination.prev')}
              className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-300">
              {t('pagination.pageOf', { page: safePage, pages: effectivePages })}
            </span>
            <button
              type="button"
              onClick={() => goTo(safePage + 1)}
              disabled={isLast}
              aria-label={t('pagination.next')}
              className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => goTo(effectivePages)}
              disabled={isLast}
              aria-label={t('pagination.last')}
              className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

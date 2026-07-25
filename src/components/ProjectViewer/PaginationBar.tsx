import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageNav } from '../PageNav';

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

  // Everything fits on one page — pagination adds nothing.
  if (isAll || total <= pageSize) return null;

  const effectivePages = Math.max(1, pages);
  const safePage = Math.min(Math.max(1, page), effectivePages);
  const startIndex = (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-neutral-950/40 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
        <span>{t('pagination.range', { start: startIndex, end: endIndex, total })}</span>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
          <span>{t('pagination.pageSize')}</span>
          <select
            value={String(pageSize)}
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

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-300">
            {t('pagination.pageOf', { page: safePage, pages: effectivePages })}
          </span>
          <PageNav page={safePage} pages={effectivePages} onPageChange={onPageChange} />
        </div>
      </div>
    </div>
  );
}

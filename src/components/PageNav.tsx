import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal } from 'lucide-react';
import { useIsCompactViewport } from '../hooks/useMediaQuery';

const ELLIPSIS_JUMP = 5;

type PageItem = number | 'left-gap' | 'right-gap';

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Page numbers around the current page, with 1 / last always visible and gaps collapsed.
 * Always emits the same number of slots so the bar keeps a stable width while paging.
 */
function buildPageItems(page: number, pages: number, siblings: number): PageItem[] {
  // 1, last, current, siblings on both sides, plus a slot for each gap marker.
  const slots = siblings * 2 + 5;
  if (pages <= slots) return range(1, pages);

  // Window of consecutive pages shown when one side is collapsed instead of two.
  const edgeWindow = slots - 2;
  if (page <= edgeWindow - siblings) return [...range(1, edgeWindow), 'right-gap', pages];
  if (page > pages - edgeWindow + siblings) return [1, 'left-gap', ...range(pages - edgeWindow + 1, pages)];

  return [1, 'left-gap', ...range(page - siblings, page + siblings), 'right-gap', pages];
}

interface PageNavProps {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  /** 'lg' matches the roomier page-level layout, 'sm' the compact toolbars. */
  size?: 'sm' | 'lg';
  /** Page numbers shown on each side of the current page. */
  siblings?: number;
  className?: string;
}

export function PageNav({
  page,
  pages,
  onPageChange,
  size = 'sm',
  siblings = 1,
  className = '',
}: PageNavProps) {
  const { t } = useTranslation();
  // Phones cannot fit the full window: drop the siblings and the first/last jumps,
  // which the always-visible "1" and last-page buttons already cover.
  const isCompact = useIsCompactViewport();

  const effectivePages = Math.max(1, pages);
  const safePage = Math.min(Math.max(1, page), effectivePages);
  const isFirst = safePage <= 1;
  const isLast = safePage >= effectivePages;

  const goTo = (p: number) => {
    const next = Math.min(Math.max(1, p), effectivePages);
    if (next === safePage) return;
    onPageChange(next);
  };

  // Touch targets stay at least 36px wide on phones, where the desktop 'sm' size is too small to tap.
  // min-w keeps the squares square for 1-3 digits and lets large page numbers grow instead of clipping.
  const base =
    size === 'lg'
      ? 'min-w-10 h-10 sm:min-w-11 sm:h-11 px-1 rounded-xl text-sm'
      : 'min-w-9 h-9 sm:min-w-8 sm:h-8 px-1 rounded-lg text-xs sm:text-[11px]';
  const idle =
    'border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800';
  const control = `${base} ${idle} shrink-0 touch-manipulation select-none flex items-center justify-center font-black transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed`;
  const icon = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  const items = buildPageItems(safePage, effectivePages, isCompact ? 0 : siblings);

  return (
    <div className={`flex items-center justify-center gap-1 ${className}`}>
      {!isCompact && (
        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={isFirst}
          aria-label={t('pagination.first')}
          title={t('pagination.first')}
          className={control}
        >
          <ChevronsLeft className={icon} />
        </button>
      )}
      <button
        type="button"
        onClick={() => goTo(safePage - 1)}
        disabled={isFirst}
        aria-label={t('pagination.prev')}
        title={t('pagination.prev')}
        className={control}
      >
        <ChevronLeft className={icon} />
      </button>

      {items.map((item) => {
        if (item === 'left-gap' || item === 'right-gap') {
          const target =
            item === 'left-gap' ? safePage - ELLIPSIS_JUMP : safePage + ELLIPSIS_JUMP;
          const label =
            item === 'left-gap'
              ? t('pagination.jumpBack', { n: ELLIPSIS_JUMP })
              : t('pagination.jumpForward', { n: ELLIPSIS_JUMP });
          return (
            <button
              key={item}
              type="button"
              onClick={() => goTo(target)}
              aria-label={label}
              title={label}
              className={`${base} shrink-0 touch-manipulation select-none flex items-center justify-center text-neutral-400 dark:text-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-colors`}
            >
              <MoreHorizontal className={icon} />
            </button>
          );
        }

        const isCurrent = item === safePage;
        return (
          <button
            key={item}
            type="button"
            onClick={() => goTo(item)}
            aria-label={t('pagination.goToPage', { page: item })}
            aria-current={isCurrent ? 'page' : undefined}
            className={`${base} shrink-0 touch-manipulation select-none flex items-center justify-center font-black tabular-nums transition-all active:scale-95 ${
              isCurrent
                ? 'border border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                : idle
            }`}
          >
            {item}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => goTo(safePage + 1)}
        disabled={isLast}
        aria-label={t('pagination.next')}
        title={t('pagination.next')}
        className={control}
      >
        <ChevronRight className={icon} />
      </button>
      {!isCompact && (
        <button
          type="button"
          onClick={() => goTo(effectivePages)}
          disabled={isLast}
          aria-label={t('pagination.last')}
          title={t('pagination.last')}
          className={control}
        >
          <ChevronsRight className={icon} />
        </button>
      )}
    </div>
  );
}

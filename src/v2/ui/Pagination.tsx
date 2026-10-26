import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { scrollListToTop } from '../../lib/scroll';
import { Button, cx, IconButton, useMediaQuery } from '../../m3';

const ELLIPSIS_JUMP = 5;
type PageItem = number | 'left-gap' | 'right-gap';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Page numbers around the current page with the first and last always shown and fixed slot count. */
function buildPageItems(page: number, pages: number, siblings: number): PageItem[] {
  const slots = siblings * 2 + 5;
  if (pages <= slots) return range(1, pages);
  const edge = slots - 2;
  if (page <= edge - siblings) return [...range(1, edge), 'right-gap', pages];
  if (page > pages - edge + siblings) return [1, 'left-gap', ...range(pages - edge + 1, pages)];
  return [1, 'left-gap', ...range(page - siblings, page + siblings), 'right-gap', pages];
}

export interface PaginationProps {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  size?: 'xs' | 'sm';
  siblings?: number;
  /** Scroll the list back to its top after paging. */
  scrollToTop?: boolean;
  className?: string;
}

/** Page navigation: first/previous, numbered pages with jump gaps, next/last. */
export function Pagination({ page, pages, onPageChange, size = 'xs', siblings = 1, scrollToTop = true, className }: PaginationProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const compact = useMediaQuery('(max-width: 599.98px)');
  const total = Math.max(1, pages);
  const current = Math.min(Math.max(1, page), total);

  const goTo = (p: number) => {
    const next = Math.min(Math.max(1, p), total);
    if (next === current) return;
    onPageChange(next);
    if (scrollToTop) scrollListToTop(ref.current);
  };

  const items = buildPageItems(current, total, compact ? 0 : siblings);

  return (
    <nav ref={ref} className={cx('v2-pagination', className)} aria-label={t('pagination.label', 'Pagination')}>
      {!compact && (
        <IconButton icon="first_page" label={t('pagination.first')} size={size} disabled={current <= 1} onClick={() => goTo(1)} />
      )}
      <IconButton icon="chevron_left" label={t('pagination.prev')} size={size} disabled={current <= 1} onClick={() => goTo(current - 1)} className="m3-mirror-rtl" />
      {items.map((item) =>
        item === 'left-gap' || item === 'right-gap' ? (
          <IconButton
            key={item}
            icon="more_horiz"
            size={size}
            label={item === 'left-gap' ? t('pagination.jumpBack', { n: ELLIPSIS_JUMP }) : t('pagination.jumpForward', { n: ELLIPSIS_JUMP })}
            onClick={() => goTo(item === 'left-gap' ? current - ELLIPSIS_JUMP : current + ELLIPSIS_JUMP)}
          />
        ) : (
          <Button
            key={item}
            size={size}
            variant={item === current ? 'filled' : 'text'}
            shape={item === current ? 'square' : 'round'}
            aria-label={t('pagination.goToPage', { page: item })}
            aria-current={item === current ? 'page' : undefined}
            onClick={() => goTo(item)}
            className="v2-pagination__page"
          >
            {item}
          </Button>
        ),
      )}
      <IconButton icon="chevron_right" label={t('pagination.next')} size={size} disabled={current >= total} onClick={() => goTo(current + 1)} className="m3-mirror-rtl" />
      {!compact && (
        <IconButton icon="last_page" label={t('pagination.last')} size={size} disabled={current >= total} onClick={() => goTo(total)} />
      )}
    </nav>
  );
}

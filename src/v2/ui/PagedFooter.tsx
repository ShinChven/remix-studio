import { useTranslation } from 'react-i18next';
import { cx, Select, Text } from '../../m3';
import { useFitLevel } from '../lib/useFitLevel';
import { PAGE_SIZES, type PageSize } from '../lib/useListParams';
import { Pagination } from './Pagination';

/** Page size menu: its own control so "All" can be switched back from. */
export function PageSizeSelect({ value, onChange, options = PAGE_SIZES, className, 'aria-label': ariaLabel }: { value: PageSize; onChange: (value: PageSize) => void; options?: readonly PageSize[]; className?: string; 'aria-label'?: string }) {
  const { t } = useTranslation();
  return (
    <Select
      variant="outlined"
      aria-label={ariaLabel ?? t('pagination.pageSize')}
      value={String(value)}
      onChange={(next) => onChange(next === 'all' ? 'all' : Number(next))}
      options={options.map((option) => ({ value: String(option), label: option === 'all' ? t('pagination.all') : String(option) }))}
      className={cx('v2-inline-select v2-inline-select--narrow v2-page-size', className)}
    />
  );
}

export interface PagedFooterProps {
  page: number;
  pageSize: PageSize;
  total: number;
  /** Omit to work it out from `total` and `pageSize`. */
  pages?: number;
  onPageChange: (page: number) => void;
  /** Omit for a list with a fixed page size. */
  onPageSizeChange?: (size: PageSize) => void;
  /** Page sizes on offer; the size menu stays while the list outgrows the smallest. */
  pageSizes?: readonly PageSize[];
  className?: string;
}

/**
 * Range, page size and page navigation under a paged list; hidden when everything fits on one
 * page. On one row it gives up "Page x / y" first, then the range, then the far page buttons.
 */
export function PagedFooter({ page, pageSize, total, pages, onPageChange, onPageSizeChange, pageSizes = PAGE_SIZES, className }: PagedFooterProps) {
  const { t } = useTranslation();
  const fit = useFitLevel<HTMLDivElement>(3, `${page}|${pageSize}|${total}`);
  const smallest = Math.min(...pageSizes.filter((size): size is number => size !== 'all'));
  const sizable = Boolean(onPageSizeChange) && total > smallest;
  const paged = pageSize !== 'all' && total > pageSize;
  if (!paged && !sizable) return null;
  const effective = pageSize === 'all' ? 1 : Math.max(1, pages ?? Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), effective);
  const start = pageSize === 'all' ? 1 : (current - 1) * pageSize + 1;
  const end = pageSize === 'all' ? total : Math.min(total, current * pageSize);
  return (
    <div ref={fit.ref} className={cx('v2-paged-footer', className)} data-fit={fit.level} data-density="compact">
      <Text variant="label-medium" className="v2-paged-footer__range">
        {t('pagination.range', { start, end, total })}
      </Text>
      <span className="v2-paged-footer__spacer" />
      {sizable && onPageSizeChange && <PageSizeSelect value={pageSize} onChange={onPageSizeChange} options={pageSizes} />}
      {paged && (
        <>
          <Text variant="label-medium" className="v2-paged-footer__of">
            {t('pagination.pageOf', { page: current, pages: effective })}
          </Text>
          <Pagination page={current} pages={effective} onPageChange={onPageChange} compact={fit.level >= 3} />
        </>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { cx, Select, Text } from '../../m3';
import { Pagination } from './Pagination';

export const PAGE_SIZE_OPTIONS: (number | 'all')[] = [25, 50, 100, 200, 500, 'all'];

/** Page size menu: its own control so "All" can be switched back from. */
export function PageSizeSelect({ value, onChange, options = PAGE_SIZE_OPTIONS, className, 'aria-label': ariaLabel }: { value: number | 'all'; onChange: (value: number | 'all') => void; options?: (number | 'all')[]; className?: string; 'aria-label'?: string }) {
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
  pageSize: number | 'all';
  total: number;
  pages: number;
  onPageChange: (page: number) => void;
  /** Omit for a list with a fixed page size. */
  onPageSizeChange?: (size: number | 'all') => void;
  /** Page sizes of a list with its own set; the size menu then stays while the list outgrows the smallest. */
  pageSizeOptions?: number[];
  className?: string;
}

/** Range, page size and page navigation under a paged list; hidden when everything fits. */
export function PagedFooter({ page, pageSize, total, pages, onPageChange, onPageSizeChange, pageSizeOptions, className }: PagedFooterProps) {
  const { t } = useTranslation();
  if (pageSize === 'all') return null;
  const paged = total > pageSize;
  const sizable = Boolean(onPageSizeChange) && (paged || (pageSizeOptions !== undefined && total > Math.min(...pageSizeOptions)));
  if (!paged && !sizable) return null;
  const effective = Math.max(1, pages);
  const current = Math.min(Math.max(1, page), effective);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(total, current * pageSize);
  return (
    <div className={cx('v2-paged-footer', className)} data-density="compact">
      <Text variant="label-medium" className="text-on-surface-variant">
        {t('pagination.range', { start, end, total })}
      </Text>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {sizable && onPageSizeChange && <PageSizeSelect value={pageSize} onChange={onPageSizeChange} options={pageSizeOptions} />}
        {paged && (
          <>
            <Text variant="label-medium" className="text-on-surface-variant">
              {t('pagination.pageOf', { page: current, pages: effective })}
            </Text>
            <Pagination page={current} pages={effective} onPageChange={onPageChange} />
          </>
        )}
      </div>
    </div>
  );
}

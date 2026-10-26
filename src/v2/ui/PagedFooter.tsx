import { useTranslation } from 'react-i18next';
import { cx, Select, Text } from '../../m3';
import { Pagination } from './Pagination';

export const PAGE_SIZE_OPTIONS: (number | 'all')[] = [25, 50, 100, 200, 500, 'all'];

/** Page size menu: its own control so "All" can be switched back from. */
export function PageSizeSelect({ value, onChange, className, 'aria-label': ariaLabel }: { value: number | 'all'; onChange: (value: number | 'all') => void; className?: string; 'aria-label'?: string }) {
  const { t } = useTranslation();
  return (
    <Select
      variant="outlined"
      aria-label={ariaLabel ?? t('pagination.pageSize')}
      value={String(value)}
      onChange={(next) => onChange(next === 'all' ? 'all' : Number(next))}
      options={PAGE_SIZE_OPTIONS.map((option) => ({ value: String(option), label: option === 'all' ? t('pagination.all') : String(option) }))}
      className={cx('v2-page-size', className)}
    />
  );
}

export interface PagedFooterProps {
  page: number;
  pageSize: number | 'all';
  total: number;
  pages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number | 'all') => void;
  className?: string;
}

/** Range, page size and page navigation under a paged list; hidden when everything fits. */
export function PagedFooter({ page, pageSize, total, pages, onPageChange, onPageSizeChange, className }: PagedFooterProps) {
  const { t } = useTranslation();
  if (pageSize === 'all' || total <= pageSize) return null;
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
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        <Text variant="label-medium" className="text-on-surface-variant">
          {t('pagination.pageOf', { page: current, pages: effective })}
        </Text>
        <Pagination page={current} pages={effective} onPageChange={onPageChange} scrollToTop={false} />
      </div>
    </div>
  );
}

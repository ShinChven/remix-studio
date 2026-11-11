import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ListBar, type ListBarProps } from '../../ui/ListBar';

export type ProjectSection = 'draft' | 'queue' | 'completed' | 'album';

export interface ResultsBarProps extends Omit<ListBarProps, 'lead' | 'selectableCount' | 'onSelectAll'> {
  /** The section switcher. */
  nav: ReactNode;
  /** Rows on screen that Select all would take. */
  totalCount: number;
  /** The section's full total, shown beside the switcher where the project is one column and the switcher is icons only. */
  mobileCount?: number;
  onSelectAll?: () => void;
}

/** The bar of a project's results pane: the section switcher, then the section's tools. */
export function ResultsBar({ nav, totalCount, mobileCount, onSelectAll, ...bar }: ResultsBarProps) {
  const { t } = useTranslation();
  return (
    <ListBar
      {...bar}
      selectableCount={totalCount}
      onSelectAll={onSelectAll}
      lead={
        <>
          {nav}
          {mobileCount !== undefined && <span className="v2-list-bar__mobile-count">{t('v2.project.itemCount', { count: mobileCount })}</span>}
        </>
      }
    />
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, LoadingIndicator, Text } from '../../../m3';

export interface PaneToolbarProps {
  totalCount: number;
  selectedCount: number;
  onToggleSelectAll: () => void;
  /** Bulk actions while something is selected. */
  selectionActions?: ReactNode;
  /** Actions while nothing is selected. */
  zeroSelectionActions?: ReactNode;
  /** Always shown on the trailing side. */
  rightActions?: ReactNode;
  /** Summary before the select-all box, e.g. item count and size. */
  prefix?: ReactNode;
  /** A small spinner while the list behind refreshes, so it never covers a row. */
  isLoading?: boolean;
}

/** Sticky toolbar at the top of a results-pane list: select all, counts, and actions. */
export function PaneToolbar({ totalCount, selectedCount, onToggleSelectAll, selectionActions, zeroSelectionActions, rightActions, prefix, isLoading = false }: PaneToolbarProps) {
  const { t } = useTranslation();
  const active = selectedCount > 0;
  return (
    <div className="v2-pane-toolbar" data-active={active ? '' : undefined} data-density="compact">
      <div className="v2-pane-toolbar__lead">
        {prefix && <div className="v2-pane-toolbar__prefix">{prefix}</div>}
        <Checkbox
          checked={active && selectedCount === totalCount && totalCount > 0}
          indeterminate={active && selectedCount < totalCount}
          onChange={onToggleSelectAll}
          aria-label={t('projectViewer.common.selectAll')}
        />
        <Text as="span" variant="label-medium" emphasized={active} className="whitespace-nowrap">
          {active ? <span className="v2-pane-wide">{t('projectViewer.common.selectedCount', { count: selectedCount })}</span> : <span className="v2-pane-wide">{t('projectViewer.common.selectAll')}</span>}
          <span className="v2-pane-narrow">{active ? `${selectedCount}/${totalCount}` : totalCount}</span>
        </Text>
        {isLoading && <LoadingIndicator size={24} aria-label={t('projectViewer.common.loading')} />}
        {active ? selectionActions && <div className="v2-pane-toolbar__group">{selectionActions}</div> : zeroSelectionActions && <div className="v2-pane-toolbar__group">{zeroSelectionActions}</div>}
      </div>
      {rightActions && <div className="v2-pane-toolbar__group v2-pane-toolbar__trail">{rightActions}</div>}
    </div>
  );
}

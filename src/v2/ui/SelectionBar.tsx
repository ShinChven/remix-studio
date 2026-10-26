import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, cx, IconButton, Text } from '../../m3';

export interface SelectionBarProps {
  /** Selected items on this page. */
  selected: number;
  /** Items on this page. */
  total: number;
  onToggleAll: () => void;
  onClear?: () => void;
  selectAllLabel: ReactNode;
  selectedLabel: ReactNode;
  /** Filters and sort controls shown on the leading side. */
  filters?: ReactNode;
  /** Bulk actions, shown while something is selected. */
  actions?: ReactNode;
  className?: string;
}

/** Sticky bar above a selectable list: select all, filters, and bulk actions once items are picked. */
export function SelectionBar({ selected, total, onToggleAll, onClear, selectAllLabel, selectedLabel, filters, actions, className }: SelectionBarProps) {
  const { t } = useTranslation();
  const active = selected > 0;
  return (
    <div className={cx('v2-selection-bar', className)} data-active={active ? '' : undefined} data-density="compact">
      <div className="v2-selection-bar__lead">
        <Checkbox checked={active && selected === total && total > 0} indeterminate={active && selected < total} onChange={onToggleAll} aria-label={String(selectAllLabel)} />
        <Text as="span" variant="label-large" emphasized={active} className="v2-selection-bar__label">
          {active ? selectedLabel : selectAllLabel}
        </Text>
        {!active && filters}
      </div>
      {active && (
        <div className="v2-selection-bar__actions">
          {actions}
          {onClear && <IconButton icon="close" size="xs" label={t('v2.common.clearSelection')} tooltip onClick={onClear} />}
        </div>
      )}
    </div>
  );
}

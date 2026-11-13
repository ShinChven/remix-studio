import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx, IconButton, Text, Toolbar } from '../../m3';
import { useFitLevel } from '../lib/useFitLevel';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

/** Escape leaves selection and D triggers its delete action, unless a dialog, menu or field has focus. */
export function useEscapeClears(active: boolean, onClear: () => void, onDelete?: () => void) {
  const callbacksRef = useRef({ onClear, onDelete });
  callbacksRef.current = { onClear, onDelete };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const isEscape = event.key === 'Escape';
      const isDelete = (event.key === 'd' || event.key === 'D') && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isEscape && !isDelete) return;
      const target = (event.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
      if (target?.closest('input:not([type="checkbox"], [type="radio"]), textarea, select, [contenteditable="true"], [role="menu"]')) return;
      if (document.querySelector('[aria-modal="true"], .m3-dialog-root, [role="menu"][data-state="open"]')) return;
      if (isEscape) {
        callbacksRef.current.onClear();
      } else if (callbacksRef.current.onDelete) {
        event.preventDefault();
        callbacksRef.current.onDelete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

/**
 * A floating toolbar (M3 Expressive) that rides the foot of its list. Put it last in the list's
 * section: it sticks to the bottom of the scroller and never grows wider than the section.
 */
export function FloatBar({ children, label, className, fit }: { children: ReactNode; label: string; className?: string; fit?: { ref: (element: HTMLDivElement | null) => void; level: number } }) {
  return (
    <div className={cx('v2-float-bar', className)}>
      <div ref={fit?.ref} className="v2-float-bar__fit" data-fit={fit?.level ?? 0}>
        <Toolbar type="floating" color="vibrant" aria-label={label}>
          {children}
        </Toolbar>
      </div>
    </div>
  );
}

export interface SelectionAction {
  key: string;
  label: string;
  icon: string;
  onClick: () => void;
  variant?: 'filled' | 'tonal';
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  hidden?: boolean;
  /** A menu instead of one action, e.g. a list of targets. */
  menu?: ActionMenuItem[];
}

export interface SelectionBarProps {
  selectedCount: number;
  /** Rows that can be selected in view. */
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  actions: SelectionAction[];
  /** Further actions in the overflow menu. */
  menuItems?: ActionMenuItem[];
  /** Offers every match beyond the rows in view once all of those are selected. */
  allMatching?: { total: number; onSelect: () => void; loading?: boolean };
}

/**
 * What can be done with the selection, in a floating toolbar at the foot of the list. Escape or
 * the close button clears. Where the list is narrow it gives up Select all's label first, then
 * the actions' labels, then all but the prominent actions (the rest move into its menu), so it
 * never spills over the edge.
 */
export function SelectionBar({ selectedCount, totalCount, onSelectAll, onClear, actions, menuItems = [], allMatching }: SelectionBarProps) {
  const { t } = useTranslation();
  const selecting = selectedCount > 0;
  const allSelected = selecting && selectedCount >= totalCount;
  const visible = actions.filter((action) => !action.hidden);
  const deleteAction = visible.find((action) => action.key === 'delete' && !action.disabled && !action.loading && !action.menu);
  const fit = useFitLevel<HTMLDivElement>(3, [selectedCount, totalCount, allMatching?.total, ...visible.map((action) => `${action.key}:${action.label}`)].join('|'));
  useEscapeClears(selecting, onClear, deleteAction?.onClick);

  if (!selecting) return null;
  const slimSelectAll = fit.level >= 1;
  const compact = fit.level >= 2;
  // Tightest: only the actions that stand out stay on the bar; the rest move into the menu.
  const minimal = fit.level >= 3;
  const shown = minimal ? visible.filter((action) => action.variant || action.danger || action.menu) : visible;
  const folded: ActionMenuItem[] = minimal ? visible.filter((action) => !shown.includes(action)).map((action) => ({ key: action.key, icon: action.icon, label: action.label, disabled: action.disabled || action.loading, onSelect: action.onClick })) : [];
  const offerMatching = allMatching && allSelected && allMatching.total > selectedCount;
  const selectAllIcon = offerMatching ? 'done_all' : allSelected ? 'deselect' : 'select_all';
  const selectAllLabel = offerMatching ? t('v2.selection.selectAllMatching', { count: allMatching.total }) : allSelected ? t('v2.selection.deselectAll') : t('v2.selection.selectAll', { count: totalCount });
  const onSelectAllClick = offerMatching ? allMatching.onSelect : allSelected ? onClear : onSelectAll;
  const selectAllItem: ActionMenuItem = { key: 'select-all', icon: selectAllIcon, label: selectAllLabel, onSelect: onSelectAllClick };
  const overflow = compact ? [...folded, { ...selectAllItem, divider: folded.length > 0 }, ...menuItems.map((item, index) => (index === 0 ? { ...item, divider: true } : item))] : menuItems;

  return (
    <FloatBar label={t('v2.selection.selected', { count: selectedCount })} fit={fit}>
      <IconButton icon="close" size="sm" label={t('v2.common.clearSelection')} tooltip onClick={onClear} />
      <Text as="span" variant="label-large" emphasized className="v2-float-bar__count">
        {t('v2.selection.selected', { count: selectedCount })}
      </Text>
      {compact ? null : slimSelectAll ? (
        <IconButton icon={selectAllIcon} size="sm" label={selectAllLabel} tooltip disabled={allMatching?.loading} onClick={onSelectAllClick} />
      ) : (
        <Button variant="text" size="sm" icon={selectAllIcon} loading={offerMatching ? allMatching.loading : undefined} onClick={onSelectAllClick}>
          {selectAllLabel}
        </Button>
      )}
      <span className="v2-float-bar__actions">
        {shown.map((action) =>
          action.menu ? (
            <ActionMenu key={action.key} label={action.label} icon={action.icon} size="sm" placement="top-end" items={action.menu} />
          ) : compact ? (
            <IconButton key={action.key} icon={action.icon} size="sm" variant={action.variant} label={action.label} tooltip disabled={action.disabled || action.loading} className={action.danger ? 'v2-icon-danger' : undefined} onClick={action.onClick} />
          ) : (
            <Button key={action.key} variant={action.variant ?? 'text'} size="sm" icon={action.icon} loading={action.loading} disabled={action.disabled} className={action.danger ? 'v2-button-danger' : undefined} onClick={action.onClick}>
              {action.label}
            </Button>
          ),
        )}
        {overflow.length > 0 && <ActionMenu label={t('v2.selection.moreActions')} items={overflow} size="sm" placement="top-end" />}
      </span>
    </FloatBar>
  );
}

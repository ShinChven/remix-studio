import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx, Icon, IconButton, LoadingIndicator, Ripple, Text } from '../../../m3';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';

export type ProjectSection = 'draft' | 'queue' | 'completed' | 'album';

export interface SectionNavItem<T extends string = ProjectSection> {
  value: T;
  label: string;
  icon: string;
  count: number;
  /** A small dot after the label: jobs running, or jobs that failed. */
  signal?: 'running' | 'error';
}

// Each section renders its own bar, so the nav remounts on every switch; the indicator
// starts from where it last stood (per page, by `scope`) and slides to the new section.
const lastIndicators = new Map<string, { left: number; width: number }>();

/** The results pane's sections, as one quiet segmented pill with counts and a sliding indicator. */
export function SectionNav<T extends string = ProjectSection>({ items, value, onChange, label, scope = 'project', iconOnly = false }: { items: SectionNavItem<T>[]; value: T; onChange: (value: T) => void; label?: string; scope?: string; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const place = (rect: { left: number; width: number }) => {
      indicator.style.transform = `translateX(${rect.left}px)`;
      indicator.style.width = `${rect.width}px`;
    };
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[data-active]');
      return active ? { left: active.offsetLeft, width: active.offsetWidth } : null;
    };
    const target = measure();
    if (!target) return;
    const from = lastIndicators.get(scope);
    if (from && (from.left !== target.left || from.width !== target.width)) {
      indicator.style.transition = 'none';
      place(from);
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }
    place(target);
    lastIndicators.set(scope, target);
    // Counts and labels change widths; follow them without animating.
    const observer = new ResizeObserver(() => {
      const next = measure();
      // The observer also reports once as it starts; snapping then would cancel the slide.
      const last = lastIndicators.get(scope);
      if (!next || (last && next.left === last.left && next.width === last.width)) return;
      indicator.style.transition = 'none';
      place(next);
      void indicator.offsetWidth;
      indicator.style.transition = '';
      lastIndicators.set(scope, next);
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [value, scope]);

  return (
    <nav ref={navRef} className="v2-section-nav" data-icon-only={iconOnly ? '' : undefined} aria-label={label ?? t('projectViewer.tabs.ariaLabel', { defaultValue: 'Project sections' })}>
      <span ref={indicatorRef} className="v2-section-nav__indicator" aria-hidden />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button key={item.value} type="button" className="v2-section-nav__item m3-focus-ring" data-active={active ? '' : undefined} aria-current={active ? 'page' : undefined} aria-label={item.label} title={item.label} onClick={() => onChange(item.value)}>
            <Ripple />
            <Icon name={item.icon} size={18} filled={active} className="v2-section-nav__icon" />
            <span className="v2-section-nav__label">{item.label}</span>
            {item.count > 0 && <span className="v2-section-nav__count">{item.count}</span>}
            {item.signal && <span className="v2-section-nav__signal" data-signal={item.signal} />}
          </button>
        );
      })}
    </nav>
  );
}

export interface ResultsBarProps {
  /** The section switcher, shown while nothing is selected. */
  nav: ReactNode;
  totalCount: number;
  /** Full section total on mobile, separate from the current page's selectable count. */
  mobileCount?: number;
  selectedCount: number;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  /** Actions for the selection; they replace the tools while anything is selected. */
  selectionActions?: ReactNode;
  /** Section tools while nothing is selected. */
  tools?: ReactNode;
  /** The section's bulk actions, in the overflow menu after Select all. */
  menuItems?: ActionMenuItem[];
  /** Quiet text before the tools, e.g. a total size. */
  summary?: ReactNode;
  /** A row under the bar, e.g. the active filters. */
  below?: ReactNode;
  /** A small spinner while the list behind refreshes, so it never covers a row. */
  isLoading?: boolean;
  /** 'floating': the bar keeps its sections and tools while selecting, and a SelectionFloatBar carries the actions. */
  selection?: 'inline' | 'floating';
}

/** The results pane's top bar: sections and tools, turning into a contextual selection bar while anything is selected. */
export function ResultsBar({ nav, totalCount, mobileCount, selectedCount, onToggleSelectAll, onClearSelection, selectionActions, tools, menuItems = [], summary, below, isLoading = false, selection = 'inline' }: ResultsBarProps) {
  const { t } = useTranslation();
  const selecting = selection === 'inline' && selectedCount > 0;
  const allSelected = selecting && selectedCount >= totalCount;

  useEscapeClears(selecting, onClearSelection);

  return (
    <div className="v2-results-head">
      <div className="v2-results-bar" data-selecting={selecting ? '' : undefined} data-density="compact">
        {selecting ? (
          <>
            <IconButton icon="close" size="sm" label={t('v2.common.clearSelection')} tooltip onClick={onClearSelection} />
            <Text as="span" variant="title-small" emphasized className="v2-results-bar__count">
              {t('v2.project.selected', { count: selectedCount })}
            </Text>
            <Button variant="text" size="xs" onClick={allSelected ? onClearSelection : onToggleSelectAll}>
              {allSelected ? t('v2.project.deselectAll') : t('v2.project.selectAll', { count: totalCount })}
            </Button>
            <span className="v2-results-bar__spacer" />
            <div className="v2-results-bar__tools">{selectionActions}</div>
          </>
        ) : (
          <>
            {nav}
            {mobileCount !== undefined && <span className="v2-results-bar__mobile-count">{t('v2.project.itemCount', { count: mobileCount })}</span>}
            {isLoading && <LoadingIndicator size={24} aria-label={t('projectViewer.common.loading')} />}
            <span className="v2-results-bar__spacer" />
            {summary && <span className="v2-results-bar__summary">{summary}</span>}
            <div className="v2-results-bar__tools">
              {tools}
              <ActionMenu
                label={t('v2.project.moreActions')}
                size="sm"
                openOnHover
                items={[
                  { key: 'select-all', icon: 'select_all', label: t('v2.project.selectAll', { count: totalCount }), disabled: totalCount === 0, onSelect: onToggleSelectAll },
                  ...menuItems.map((item, index) => (index === 0 ? { ...item, divider: true } : item)),
                ]}
              />
            </div>
          </>
        )}
      </div>
      {below && !selecting && <div className={cx('v2-results-below')}>{below}</div>}
    </div>
  );
}

/** Escape leaves selection, unless a dialog, menu or field has it. */
function useEscapeClears(active: boolean, onClear: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input:not([type="checkbox"], [type="radio"]), textarea, select, [contenteditable="true"], [role="menu"]')) return;
      if (document.querySelector('[aria-modal="true"], .m3-dialog-root')) return;
      onClear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onClear]);
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
}

/**
 * The selection's actions in a pill that floats at the foot of the results pane. Put it last in
 * the section: it sits at the foot of the pane and sticks to the bottom of the scroller. Actions show their labels where the
 * pane has room and turn into icon buttons where it does not.
 */
export function SelectionFloatBar({ selectedCount, totalCount, onToggleSelectAll, onClearSelection, actions, menuItems = [], label }: { selectedCount: number; totalCount: number; onToggleSelectAll: () => void; onClearSelection: () => void; actions: SelectionAction[]; menuItems?: ActionMenuItem[]; label?: string }) {
  const { t } = useTranslation();
  const selecting = selectedCount > 0;
  const allSelected = selecting && selectedCount >= totalCount;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [paneWidth, setPaneWidth] = useState(Infinity);
  // The widths the bar takes with every label, and with Select all as an icon; 0 until measured for the current actions.
  const [needed, setNeeded] = useState({ full: 0, slim: 0 });
  useEscapeClears(selecting, onClearSelection);

  const visible = actions.filter((action) => !action.hidden);
  const signature = [selectedCount, totalCount, ...visible.map((action) => `${action.key}:${action.label}`)].join('|');
  // Labels show where the pane has room for them, measured rather than guessed. Select all gives
  // up its label first, then the actions do.
  const room = paneWidth - 24;
  const slimSelectAll = needed.full > 0 && room < needed.full;
  const compact = needed.slim > 0 && room < needed.slim;

  useLayoutEffect(() => setNeeded({ full: 0, slim: 0 }), [signature]);
  useLayoutEffect(() => {
    if (needed.full > 0 || !anchor) return;
    const row = anchor.querySelector<HTMLElement>('.v2-float-bar__actions');
    const selectAll = anchor.querySelector<HTMLElement>('[data-select-all]');
    const full = anchor.offsetWidth + (row ? row.scrollWidth - row.clientWidth : 0) + 1;
    setNeeded({ full, slim: full - (selectAll ? selectAll.offsetWidth - 40 : 0) });
  });
  useLayoutEffect(() => {
    const pane = anchor?.parentElement;
    if (!pane) return;
    const update = () => setPaneWidth(pane.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [anchor]);

  if (!selecting) return null;
  const selectAllIcon = allSelected ? 'deselect' : 'select_all';
  const selectAllLabel = allSelected ? t('v2.project.deselectAll') : t('v2.project.selectAll', { count: totalCount });
  const onSelectAll = allSelected ? onClearSelection : onToggleSelectAll;
  return (
    <div ref={setAnchor} className="v2-float-bar v2-float-bar--pane" data-compact={compact ? '' : undefined} role="toolbar" aria-label={label ?? t('v2.project.selected', { count: selectedCount })}>
      <IconButton icon="close" size="sm" label={t('v2.common.clearSelection')} tooltip onClick={onClearSelection} />
      <Text as="span" variant="label-large" emphasized className="tabular-nums whitespace-nowrap">
        {t('v2.project.selected', { count: selectedCount })}
      </Text>
      {compact ? null : slimSelectAll ? (
        <IconButton icon={selectAllIcon} size="sm" label={selectAllLabel} tooltip onClick={onSelectAll} />
      ) : (
        <Button data-select-all="" variant="tonal" size="sm" icon={selectAllIcon} onClick={onSelectAll}>
          {selectAllLabel}
        </Button>
      )}
      <span className="v2-float-bar__actions">
        {visible.map((action) =>
          compact ? (
            <IconButton key={action.key} icon={action.icon} size="sm" variant={action.variant} label={action.label} tooltip disabled={action.disabled || action.loading} className={action.danger ? 'v2-icon-danger' : undefined} onClick={action.onClick} />
          ) : (
            <Button key={action.key} variant={action.variant ?? 'text'} size="sm" icon={action.icon} loading={action.loading} disabled={action.disabled} className={action.danger ? 'v2-button-danger' : undefined} onClick={action.onClick}>
              {action.label}
            </Button>
          ),
        )}
        <ActionMenu
          label={t('v2.project.moreActions')}
          items={compact ? [{ key: 'select-all', icon: selectAllIcon, label: selectAllLabel, onSelect: onSelectAll }, ...menuItems.map((item, index) => (index === 0 ? { ...item, divider: true } : item))] : menuItems}
          size="sm"
          placement="top-end"
        />
      </span>
    </div>
  );
}

/** A danger-colored icon action for the selection bar. */
export function DangerAction({ label, onClick, disabled, icon = 'delete' }: { label: string; onClick: () => void; disabled?: boolean; icon?: string }) {
  return <IconButton icon={icon} size="sm" className="v2-icon-danger" label={label} tooltip disabled={disabled} onClick={onClick} />;
}

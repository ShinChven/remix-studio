import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
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
export function SectionNav<T extends string = ProjectSection>({ items, value, onChange, label, scope = 'project' }: { items: SectionNavItem<T>[]; value: T; onChange: (value: T) => void; label?: string; scope?: string }) {
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
    <nav ref={navRef} className="v2-section-nav" aria-label={label ?? t('projectViewer.tabs.ariaLabel', { defaultValue: 'Project sections' })}>
      <span ref={indicatorRef} className="v2-section-nav__indicator" aria-hidden />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button key={item.value} type="button" className="v2-section-nav__item m3-focus-ring" data-active={active ? '' : undefined} aria-current={active ? 'page' : undefined} title={item.label} onClick={() => onChange(item.value)}>
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
}

/** The results pane's top bar: sections and tools, turning into a contextual selection bar while anything is selected. */
export function ResultsBar({ nav, totalCount, selectedCount, onToggleSelectAll, onClearSelection, selectionActions, tools, menuItems = [], summary, below, isLoading = false }: ResultsBarProps) {
  const { t } = useTranslation();
  const selecting = selectedCount > 0;
  const allSelected = selecting && selectedCount >= totalCount;

  // Escape leaves selection, unless a dialog, menu or field has it.
  useEffect(() => {
    if (!selecting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input:not([type="checkbox"], [type="radio"]), textarea, select, [contenteditable="true"], [role="menu"]')) return;
      if (document.querySelector('[aria-modal="true"], .m3-dialog-root')) return;
      onClearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selecting, onClearSelection]);

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

/** A danger-colored icon action for the selection bar. */
export function DangerAction({ label, onClick, disabled, icon = 'delete' }: { label: string; onClick: () => void; disabled?: boolean; icon?: string }) {
  return <IconButton icon={icon} size="sm" className="v2-icon-danger" label={label} tooltip disabled={disabled} onClick={onClick} />;
}

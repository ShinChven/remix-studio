import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, Icon, LoadingIndicator, Ripple, Text } from '../../m3';
import { useFitLevel } from '../lib/useFitLevel';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

export interface SectionNavItem<T extends string = string> {
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
export function SectionNav<T extends string = string>({ items, value, onChange, label, scope = 'list', iconOnly = false }: { items: SectionNavItem<T>[]; value: T; onChange: (value: T) => void; label: string; scope?: string; iconOnly?: boolean }) {
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
    <nav ref={navRef} className="v2-section-nav" data-icon-only={iconOnly ? '' : undefined} aria-label={label}>
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

export interface ListBarProps {
  /** What leads the bar: a `SectionNav`, or a `ListTitle` for a list with one section. */
  lead?: ReactNode;
  /** Quiet text before the tools, e.g. a total size. The first thing to go when the bar is tight. */
  summary?: ReactNode;
  /** Search, filters and view switches. Put a `ListSearch` first. */
  tools?: ReactNode;
  /** The list's own actions, in the overflow menu. */
  menuItems?: ActionMenuItem[];
  /** Adds "Select all" to the overflow menu. */
  onSelectAll?: () => void;
  /** Rows that Select all would take. */
  selectableCount?: number;
  /** A row under the bar, e.g. the active filters. */
  below?: ReactNode;
  /** A small spinner while the list behind refreshes, so it never covers a row. */
  refreshing?: boolean;
  /** Changes with whatever alters the bar's width needs, e.g. the section; counts are tracked already. */
  fitKey?: string | number;
  className?: string;
}

/**
 * The bar above a list: what it shows, then its tools. It stays on one row for as long as that
 * fits and gives ground in a fixed order when it does not: the summary, then counts, then search
 * folds into an icon, then section labels give way to their icons; only after all that do the
 * tools wrap to a second row.
 */
export function ListBar({ lead, summary, tools, menuItems = [], onSelectAll, selectableCount = 0, below, refreshing = false, fitKey = '', className }: ListBarProps) {
  const { t } = useTranslation();
  const fit = useFitLevel<HTMLDivElement>(5, `${fitKey}|${selectableCount}|${menuItems.length}|${summary ? 1 : 0}|${refreshing ? 1 : 0}`);
  const overflow: ActionMenuItem[] = [
    ...(onSelectAll ? [{ key: 'select-all', icon: 'select_all', label: t('v2.selection.selectAll', { count: selectableCount }), disabled: selectableCount === 0, onSelect: onSelectAll }] : []),
    ...menuItems.map((item, index) => (index === 0 && onSelectAll ? { ...item, divider: true } : item)),
  ];
  return (
    <div className={cx('v2-list-head', className)}>
      <div ref={fit.ref} className="v2-list-bar" data-fit={fit.level} data-density="compact">
        {lead}
        {refreshing && <LoadingIndicator size={24} aria-label={t('v2.common.refreshing')} />}
        <span className="v2-list-bar__spacer" />
        {summary && <span className="v2-list-bar__summary">{summary}</span>}
        <div className="v2-list-bar__tools">
          {tools}
          {overflow.length > 0 && <ActionMenu label={t('v2.selection.moreActions')} size="sm" openOnHover items={overflow} />}
        </div>
      </div>
      {below && <div className="v2-list-below">{below}</div>}
    </div>
  );
}

/** The name of a list with a single section, with how many it holds. */
export function ListTitle({ title, icon, count }: { title: ReactNode; icon?: string; count?: number }) {
  return (
    <div className="v2-list-title">
      {icon && <Icon name={icon} className="v2-list-title__icon" />}
      <Text as="h2" variant="title-medium" emphasized className="v2-list-title__text">
        {title}
      </Text>
      {count !== undefined && count > 0 && <span className="v2-count v2-list-title__count">{count}</span>}
    </div>
  );
}

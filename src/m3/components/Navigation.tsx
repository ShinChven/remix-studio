import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react'
import { useM3Locale } from '../i18n/locale'
import { useFocusTrap } from '../utils/focus'
import { cx, useMediaQuery, usePresence, useStableId } from '../utils/hooks'
import { useLayer, useScrollLock } from '../utils/layers'
import { Portal } from '../utils/portal'
import { Action } from './Action'
import { Badge } from './Badge'
import { Fab, IconButton } from './Button'
import { type IconSource, renderIcon } from './Icon'
import { Ripple } from './Ripple'

export interface NavItem {
  /** Unique id of the destination. It is compared with `value` and passed to `onChange`. */
  key: string
  /** Visible text of the destination: one word where possible. */
  label: string
  /** Material Symbols name or an element. A named icon is filled while selected. */
  icon: IconSource
  /** Icon shown while selected. Defaults to the filled version of `icon`. */
  activeIcon?: IconSource
  /** Makes the destination a link, rendered through `LinkProvider`. */
  href?: string
  /** A number/text for a large badge, or `true` for a small dot. */
  badge?: number | string | boolean
  /** Accessible description of the badge, e.g. "3 unread messages". */
  badgeLabel?: string
  /** Dims the destination and ignores activation. */
  disabled?: boolean
  /** Other values that also mark this destination as current (e.g. its sub-pages). */
  activeFor?: string[]
}

function isActive(item: NavItem, value: string | null | undefined): boolean {
  return value != null && (item.key === value || !!item.activeFor?.includes(value))
}

export interface NavSection {
  /** Title above the section in the expanded rail. It also names the section for assistive tech. */
  headline?: string
  /** Destinations in this section. */
  items: NavItem[]
}

interface NavCommonProps {
  /** Key of the current destination. Items also match it through `activeFor`. */
  value?: string | null
  /** Called with the key and the item when a destination is activated. */
  onChange?: (key: string, item: NavItem) => void
  /** Accessible name of the navigation landmark, e.g. "Main". */
  'aria-label'?: string
  /** Extra class on the root element. */
  className?: string
}

function NavIcon({ item, active, dotOnly }: { item: NavItem; active: boolean; dotOnly?: boolean }) {
  const icon = active && item.activeIcon !== undefined ? item.activeIcon : item.icon
  const rendered = renderIcon(icon, { filled: active })
  if (item.badge === undefined || item.badge === false || (dotOnly && item.badge !== true)) {
    return <>{rendered}</>
  }
  return (
    <Badge value={item.badge === true ? undefined : item.badge} label={item.badgeLabel}>
      {rendered}
    </Badge>
  )
}

function NavDestination({
  item,
  active,
  className,
  onSelect,
  children,
}: {
  item: NavItem
  active: boolean
  className: string
  onSelect?: ((key: string, item: NavItem) => void) | undefined
  children: ReactNode
}) {
  const common = {
    className: cx(className, 'm3-focus-target'),
    disabled: item.disabled,
    'aria-current': active ? ('page' as const) : undefined,
    'data-active': active ? '' : undefined,
    onClick: () => onSelect?.(item.key, item),
  }
  return item.href !== undefined ? (
    <Action {...common} href={item.href}>
      {children}
    </Action>
  ) : (
    <Action {...common}>{children}</Action>
  )
}

/** Item layout in the navigation bar: icon above the label, or beside it in the indicator. */
export type NavigationBarItemLayout = 'vertical' | 'horizontal' | 'auto'

export interface NavigationBarProps extends NavCommonProps {
  /** Three to five destinations. */
  items: NavItem[]
  /**
   * `vertical` stacks icon and label (compact windows); `horizontal` puts the label beside the
   * icon (medium windows). `auto` (default) switches to horizontal at 600dp and wider.
   */
  itemLayout?: NavigationBarItemLayout
  /** Show labels on every destination, or only the selected one. */
  labels?: 'always' | 'selected'
}

/** Flexible navigation bar (M3 Expressive): 3–5 primary destinations at the bottom of the window. */
export function NavigationBar({
  items,
  value,
  onChange,
  itemLayout = 'auto',
  labels = 'always',
  className,
  ...rest
}: NavigationBarProps) {
  const wide = useMediaQuery('(min-width: 600px)')
  const layout = itemLayout === 'auto' ? (wide ? 'horizontal' : 'vertical') : itemLayout
  return (
    <nav
      aria-label={rest['aria-label']}
      className={cx('m3-navigation-bar', className)}
      data-layout={layout}
      data-labels={labels}
    >
      {items.map((item) => {
        const active = isActive(item, value)
        return (
          <NavDestination
            key={item.key}
            item={item}
            active={active}
            className="m3-navigation-bar__item"
            onSelect={onChange}
          >
            <span className="m3-nav-indicator">
              <Ripple disabled={item.disabled} />
              <NavIcon item={item} active={active} />
              {layout === 'horizontal' && (
                <span className="m3-navigation-bar__label">{item.label}</span>
              )}
            </span>
            {layout === 'vertical' && (
              <span className="m3-navigation-bar__label">{item.label}</span>
            )}
          </NavDestination>
        )
      })}
    </nav>
  )
}

/** The FAB of a navigation rail: icon-only while collapsed, extended (with label) when expanded. */
export interface RailFab {
  /** FAB icon. */
  icon: IconSource
  /** Accessible name, and the label of the extended FAB in the expanded rail. */
  label: string
  /** Called when the FAB is pressed. */
  onClick?: () => void
  /** Makes the FAB a link. It takes precedence over `onClick`. */
  href?: string
}

export interface NavigationRailProps extends NavCommonProps {
  /** The destinations of the collapsed rail: three to seven. */
  items: NavItem[]
  /**
   * Destinations of the expanded rail, grouped under headlines. The expanded rail can show
   * secondary destinations that the collapsed rail leaves out. Defaults to `items`.
   */
  sections?: NavSection[]
  /** Expanded rail: wider, with labels beside the icons (replaces the navigation drawer). */
  expanded?: boolean
  /** Called when the rail asks to expand or collapse: menu button, scrim, Escape, a chosen item. */
  onExpandedChange?: (expanded: boolean) => void
  /** The expanded rail floats over the content with a scrim instead of pushing it aside. */
  modal?: boolean
  /** While not expanded: show the collapsed rail (`collapse`, default) or nothing (`hide`). */
  collapseBehavior?: 'collapse' | 'hide'
  /** Shows a menu button at the top that expands and collapses the rail. */
  menuButton?: boolean
  /** Brand or title beside the menu button in the expanded rail. */
  brand?: ReactNode
  /** Content under the brand row of the expanded rail, e.g. a filter field. */
  expandedHeader?: ReactNode
  /** Floating action button under the menu button: it extends when the rail expands. */
  fab?: RailFab
  /** Other top content under the menu button and FAB. */
  header?: ReactNode
  /** Bottom content: settings, profile… */
  footer?: ReactNode
  /** Vertical alignment of the destinations (the menu and FAB stay at the top). */
  align?: 'top' | 'center'
  /** Hide the labels of unselected destinations in the collapsed rail. */
  hideLabels?: boolean
  /** Width of the expanded rail in px, between 220 and 360. Defaults to 256. */
  expandedWidth?: number
  /** Item height in the expanded rail: `standard` (56dp) or `compact` (40dp) for long lists. */
  density?: 'standard' | 'compact'
  /**
   * Active indicator in the expanded rail: `hug` (default) wraps the icon and label, as the spec
   * shows; `fill` spans the rail's width, like the former navigation drawer, and the extended
   * `fab` stretches to the same width. The target area spans the full width either way.
   */
  indicator?: 'hug' | 'fill'
}

/**
 * Navigation rail (M3 Expressive): a collapsed rail of 3–7 destinations that expands, from its
 * menu button, into a wider rail with labels beside the icons and grouped secondary
 * destinations. The expanded rail sits beside the content or, with `modal`, over it.
 */
export function NavigationRail({
  items,
  sections,
  value,
  onChange,
  expanded = false,
  onExpandedChange,
  modal = false,
  collapseBehavior = 'collapse',
  menuButton = false,
  brand,
  expandedHeader,
  fab,
  header,
  footer,
  align = 'top',
  hideLabels = false,
  expandedWidth = 256,
  density = 'standard',
  indicator = 'hug',
  className,
  ...rest
}: NavigationRailProps) {
  const ariaLabel = rest['aria-label']
  const width = Math.min(360, Math.max(220, expandedWidth))
  // A modal rail expands over the content; the rail in the layout stays collapsed (or hidden).
  const inlineExpanded = expanded && !modal
  const hidden = !inlineExpanded && collapseBehavior === 'hide'
  const shared = {
    items,
    sections,
    value,
    onChange,
    onExpandedChange,
    menuButton,
    brand,
    expandedHeader,
    fab,
    header,
    footer,
    align,
    hideLabels,
    density,
  }
  return (
    <>
      <nav
        aria-label={ariaLabel}
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
        className={cx('m3-navigation-rail', className)}
        data-expanded={inlineExpanded ? '' : undefined}
        data-hidden={hidden ? '' : undefined}
        data-align={align}
        data-density={density}
        data-indicator={indicator}
        data-hide-labels={hideLabels ? '' : undefined}
        style={{ '--_expanded-width': `${width}px` } as CSSProperties}
      >
        <RailContent {...shared} expanded={inlineExpanded} />
      </nav>
      {modal && (
        <ModalRail
          open={expanded}
          onClose={() => onExpandedChange?.(false)}
          width={width}
          density={density}
          indicator={indicator}
          align={align}
          className={className}
          aria-label={ariaLabel}
        >
          <RailContent
            {...shared}
            expanded
            onChange={(key, item) => {
              onChange?.(key, item)
              onExpandedChange?.(false)
            }}
          />
        </ModalRail>
      )}
    </>
  )
}

function RailContent({
  items,
  sections,
  value,
  onChange,
  expanded,
  onExpandedChange,
  menuButton,
  brand,
  expandedHeader,
  fab,
  header,
  footer,
}: Omit<NavigationRailProps, 'modal' | 'collapseBehavior' | 'expandedWidth' | 'className'>) {
  const { messages } = useM3Locale()
  const headingBase = useStableId('m3-rail-section')
  const listRef = useRef<HTMLDivElement>(null)
  const groups: NavSection[] = expanded && sections ? sections : [{ items }]
  // Bring the current destination into view when the rail expands or the destination changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these changes call for a reveal
  useLayoutEffect(() => {
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !item || list.scrollHeight <= list.clientHeight) return
    const box = list.getBoundingClientRect()
    const rect = item.getBoundingClientRect()
    if (rect.top < box.top || rect.bottom > box.bottom) {
      list.scrollTop += rect.top - box.top - (box.height - rect.height) / 2
    }
  }, [value, expanded])
  const showTop = menuButton || brand || fab || header || (expanded && expandedHeader)
  return (
    <>
      {showTop && (
        <div className="m3-navigation-rail__header">
          {(menuButton || brand) && (
            <div className="m3-navigation-rail__top">
              {menuButton && (
                <IconButton
                  icon={expanded ? 'menu_open' : 'menu'}
                  label={expanded ? messages.closeNavigation : messages.openNavigation}
                  aria-expanded={expanded}
                  className="m3-navigation-rail__menu"
                  onClick={() => onExpandedChange?.(!expanded)}
                />
              )}
              {brand && <div className="m3-navigation-rail__brand">{brand}</div>}
            </div>
          )}
          {expanded && expandedHeader && (
            <div className="m3-navigation-rail__expanded-header">{expandedHeader}</div>
          )}
          {fab && (
            <Fab
              icon={fab.icon}
              label={fab.label}
              aria-label={fab.label}
              expanded={expanded}
              className="m3-navigation-rail__fab"
              {...(fab.href !== undefined ? { href: fab.href } : { onClick: fab.onClick })}
            />
          )}
          {header}
        </div>
      )}
      <div ref={listRef} className="m3-navigation-rail__items">
        {groups.map((group, index) => (
          <section
            // biome-ignore lint/suspicious/noArrayIndexKey: sections have no stable id
            key={index}
            className="m3-navigation-rail__section"
            aria-labelledby={group.headline ? `${headingBase}-${index}` : undefined}
          >
            {expanded && group.headline && (
              <h3 id={`${headingBase}-${index}`} className="m3-navigation-rail__headline">
                {group.headline}
              </h3>
            )}
            {group.items.map((item) => (
              <RailItem key={item.key} item={item} value={value} onChange={onChange} />
            ))}
          </section>
        ))}
      </div>
      {footer && <div className="m3-navigation-rail__footer">{footer}</div>}
    </>
  )
}

function RailItem({
  item,
  value,
  onChange,
}: {
  item: NavItem
  value: string | null | undefined
  onChange: ((key: string, item: NavItem) => void) | undefined
}) {
  const active = isActive(item, value)
  const count =
    item.badge !== undefined && item.badge !== false && item.badge !== true ? item.badge : null
  return (
    <NavDestination
      item={item}
      active={active}
      className="m3-navigation-rail__item"
      onSelect={onChange}
    >
      <span className="m3-nav-indicator">
        <Ripple disabled={item.disabled} />
        <NavIcon item={item} active={active} />
        <span className="m3-navigation-rail__inline-label">
          <span>
            {item.label}
            {count !== null && (
              <span className="m3-navigation-rail__count" aria-hidden="true">
                {count}
              </span>
            )}
          </span>
        </span>
      </span>
      {/* The label inside the indicator names the item in both rails; this one is visual only. */}
      <span className="m3-navigation-rail__label" aria-hidden="true">
        <span>{item.label}</span>
      </span>
    </NavDestination>
  )
}

function ModalRail({
  open,
  onClose,
  width,
  density,
  indicator,
  align,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  open: boolean
  onClose: () => void
  width: number
  density: 'standard' | 'compact'
  indicator: 'hug' | 'fill'
  align: 'top' | 'center'
  className?: string | undefined
  children: ReactNode
  'aria-label'?: string | undefined
}) {
  const { mounted, state } = usePresence(open, 300)
  const ref = useRef<HTMLDivElement>(null)
  const isTop = useLayer(open, { onEscape: onClose })
  // Opening focuses the current destination rather than the first control.
  const initialFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!open || !mounted) return
    initialFocus.current = ref.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null
  }, [open, mounted])
  useFocusTrap(ref, open && mounted, { isTop, initialFocus })
  useScrollLock(open)
  if (!mounted) return null
  return (
    <Portal>
      <div className="m3-navigation-rail-root" data-state={state}>
        <div className="m3-scrim" data-state={state} onClick={onClose} />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="m3-navigation-rail__modal"
          data-state={state}
        >
          <nav
            aria-label={ariaLabel}
            className={cx('m3-navigation-rail', className)}
            data-expanded=""
            data-modal=""
            data-align={align}
            data-density={density}
            data-indicator={indicator}
            style={{ '--_expanded-width': `${width}px` } as CSSProperties}
          >
            {children}
          </nav>
        </div>
      </div>
    </Portal>
  )
}

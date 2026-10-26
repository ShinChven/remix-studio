import {
  Children,
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from 'react'
import { handleRovingKeyDown } from '../utils/focus'
import { cx, useControllableState, useIsoLayoutEffect, useStableId } from '../utils/hooks'
import { Badge } from './Badge'
import { type IconSource, renderIcon } from './Icon'
import { Ripple } from './Ripple'

interface TabsContextValue {
  value: string | null
  setValue: (value: string) => void
  idBase: string
  variant: 'primary' | 'secondary'
  manual: boolean
  /** The tab that is in the Tab order (selected, else the first enabled one). */
  focusValue?: string | null
}

const TabsContext = createContext<TabsContextValue | null>(null)

export interface TabGroupProps {
  /** Selected tab value (controlled). */
  value?: string | null
  /** Initially selected tab value (uncontrolled). */
  defaultValue?: string | null
  /** Called with the value of the newly selected tab. */
  onChange?: (value: string) => void
  /** The `Tabs` and the `TabPanel`s that share the selection. */
  children: ReactNode
}

/** Connects `Tabs` with their `TabPanel`s (ids and selection). */
export function TabGroup({ value, defaultValue = null, onChange, children }: TabGroupProps) {
  const [current, setCurrent] = useControllableState<string | null>({
    value,
    defaultValue,
    onChange: onChange as ((v: string | null) => void) | undefined,
  })
  const idBase = useStableId('m3-tabs')
  return (
    <TabsContext.Provider
      value={{ value: current, setValue: setCurrent, idBase, variant: 'primary', manual: false }}
    >
      {children}
    </TabsContext.Provider>
  )
}

export interface TabsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  /** Primary tabs sit under the top app bar; secondary tabs separate content within a page. */
  variant?: 'primary' | 'secondary'
  /** Selected tab value (controlled). Inside a `TabGroup`, the group holds the selection. */
  value?: string | null
  /** Initially selected tab value (uncontrolled). Ignored inside a `TabGroup`. */
  defaultValue?: string | null
  /** Called with the value of the newly selected tab. */
  onChange?: (value: string) => void
  /** Scroll horizontally instead of sharing the width equally. */
  scrollable?: boolean
  /** Select on Enter/Space instead of when focus moves. */
  activation?: 'automatic' | 'manual'
  /** The `Tab` elements. */
  children: ReactNode
}

/** Tab bar with an animated active indicator and arrow-key navigation. */
export function Tabs({
  variant = 'primary',
  value: valueProp,
  defaultValue = null,
  onChange,
  scrollable = false,
  activation = 'automatic',
  className,
  children,
  ...rest
}: TabsProps) {
  const group = useContext(TabsContext)
  const ownId = useStableId('m3-tabs')
  const [own, setOwn] = useControllableState<string | null>({
    value: valueProp,
    defaultValue,
    onChange: onChange as ((v: string | null) => void) | undefined,
  })
  const value = group ? group.value : own
  const setValue = (v: string) => {
    if (group) {
      group.setValue(v)
      onChange?.(v)
    } else setOwn(v)
  }
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  // Measure the active tab (content width for primary tabs, full width for secondary).
  useIsoLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const tab = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!tab) {
        setIndicator(null)
        return
      }
      const target =
        variant === 'primary' ? (tab.querySelector<HTMLElement>('.m3-tab__content') ?? tab) : tab
      const listRect = list.getBoundingClientRect()
      const rect = target.getBoundingClientRect()
      const left = rect.left - listRect.left + list.scrollLeft
      setIndicator((prev) =>
        prev && prev.left === left && prev.width === rect.width
          ? prev
          : { left, width: rect.width },
      )
      if (scrollable) {
        // Scroll only the tab strip; scrollIntoView would also scroll the page.
        const start = tab.offsetLeft
        const end = start + tab.offsetWidth
        if (start < list.scrollLeft) list.scrollLeft = start - 48
        else if (end > list.scrollLeft + list.clientWidth)
          list.scrollLeft = end - list.clientWidth + 48
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    for (const tab of list.querySelectorAll('[role="tab"]')) ro.observe(tab)
    return () => ro.disconnect()
  }, [value, variant, scrollable, children])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    rest.onKeyDown?.(e)
    if (!listRef.current) return
    const next = handleRovingKeyDown(e, listRef.current, '[role="tab"]', 'horizontal')
    if (next && activation === 'automatic' && next.dataset.value) setValue(next.dataset.value)
  }

  const firstEnabled = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => child.props as Partial<TabProps>)
    .find((props) => typeof props.value === 'string' && !props.disabled)?.value
  const context: TabsContextValue = {
    value,
    setValue,
    idBase: group?.idBase ?? ownId,
    variant,
    manual: activation === 'manual',
    focusValue: value ?? firstEnabled ?? null,
  }
  return (
    <TabsContext.Provider value={context}>
      <div
        role="tablist"
        {...rest}
        ref={listRef}
        className={cx('m3-tabs', className)}
        data-variant={variant}
        data-scrollable={scrollable ? '' : undefined}
        onKeyDown={onKeyDown}
      >
        {children}
        {indicator && (
          <span
            className="m3-tabs__indicator"
            aria-hidden="true"
            style={
              {
                '--_left': `${indicator.left}px`,
                '--_width': `${indicator.width}px`,
              } as CSSProperties
            }
          />
        )}
      </div>
    </TabsContext.Provider>
  )
}

export interface TabProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Unique value. It selects this tab and links it to the `TabPanel` with the same value. */
  value: string
  /** Visible text of the tab. */
  label?: ReactNode
  /** Material Symbols name or an element. A named icon is filled while selected. */
  icon?: IconSource
  /** A number/text for a large badge, or `true` for a small dot. */
  badge?: number | string | boolean
  /** Screen reader text for the badge, e.g. "2 issues". The visible badge is hidden from assistive tech. */
  badgeLabel?: string
  /** Place the icon beside the label instead of above it (primary tabs). */
  inlineIcon?: boolean
  /** Dims the tab; it cannot be selected or focused. */
  disabled?: boolean
  /** Accessible name. Required for a tab with an icon and no label. */
  'aria-label'?: string
}

export function Tab({
  value,
  label,
  icon,
  badge,
  badgeLabel,
  inlineIcon,
  disabled,
  className,
  onClick,
  ...rest
}: TabProps) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('<Tab> must be used inside <Tabs>')
  const selected = ctx.value === value
  const focusable = ctx.focusValue === value
  const iconEl = icon ? renderIcon(icon, { filled: selected }) : null
  const badgeEl =
    badge !== undefined && badge !== false ? (
      <Badge value={badge === true ? undefined : badge} label={badgeLabel} />
    ) : null
  return (
    <button
      type="button"
      role="tab"
      {...rest}
      id={`${ctx.idBase}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.idBase}-panel-${value}`}
      tabIndex={focusable ? 0 : -1}
      disabled={disabled}
      data-value={value}
      className={cx('m3-tab', 'm3-focus-target', className)}
      data-stacked={icon && label && !inlineIcon && ctx.variant === 'primary' ? '' : undefined}
      onClick={(e) => {
        onClick?.(e)
        ctx.setValue(value)
      }}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e)
        if (ctx.manual && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          ctx.setValue(value)
        }
      }}
    >
      <Ripple disabled={disabled} />
      <span className="m3-tab__content">
        {iconEl && (
          <span className="m3-tab__icon">
            {iconEl}
            {label ? null : badgeEl}
          </span>
        )}
        {label && (
          <span className="m3-tab__label">
            {label}
            {badgeEl}
          </span>
        )}
      </span>
    </button>
  )
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Value of the `Tab` that shows this panel. */
  value: string
  /** Keep the panel mounted (hidden) when inactive, preserving its state. */
  keepMounted?: boolean
}

export function TabPanel({ value, keepMounted, className, children, ...rest }: TabPanelProps) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('<TabPanel> must be used inside <TabGroup>')
  const selected = ctx.value === value
  if (!selected && !keepMounted) return null
  return (
    <div
      role="tabpanel"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: APG tab panels are focusable so their content is reachable
      tabIndex={0}
      {...rest}
      id={`${ctx.idBase}-panel-${value}`}
      aria-labelledby={`${ctx.idBase}-tab-${value}`}
      hidden={!selected}
      className={cx('m3-tab-panel', className)}
    >
      {children}
    </div>
  )
}

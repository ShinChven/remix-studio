import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { handleRovingKeyDown } from '../utils/focus'
import { cx, useIsoLayoutEffect } from '../utils/hooks'

/** Something that scrolls: an element, a ref to one, or the window (default). */
export type ScrollTarget = HTMLElement | Window | { current: HTMLElement | null } | null | undefined

function resolveTarget(target: ScrollTarget): HTMLElement | Window | null {
  if (target === undefined) return typeof window === 'undefined' ? null : window
  if (target === null) return null
  if ('current' in target) return target.current
  return target
}

function scrollTopOf(el: HTMLElement | Window): number {
  return el instanceof Window ? el.scrollY : el.scrollTop
}

/** Current scroll offset of a target, updated once per animation frame. */
export function useScrollOffset(target: ScrollTarget): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const el = resolveTarget(target)
    if (!el) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOffset(scrollTopOf(el)))
    }
    setOffset(scrollTopOf(el))
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', update)
    }
  }, [target])
  return offset
}

/** Hides a bar while the target scrolls down and shows it again when it scrolls up. */
export function useHideOnScroll(enabled: boolean, target: ScrollTarget, threshold = 80): boolean {
  const offset = useScrollOffset(enabled ? target : null)
  const [hidden, setHidden] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    if (!enabled) {
      setHidden(false)
      return
    }
    if (Math.abs(offset - last.current) < 8) return
    setHidden(offset > last.current && offset > threshold)
    last.current = offset
  }, [offset, enabled, threshold])
  return hidden
}

/**
 * App bar variant (M3 Expressive): `search` (a search bar instead of a headline), `small`,
 * `medium-flexible` or `large-flexible`.
 */
export type AppBarVariant = 'search' | 'small' | 'medium-flexible' | 'large-flexible'

export interface AppBarProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Size: `small` (64dp), `medium-flexible` (112dp), `large-flexible` (120dp) or `search`. */
  variant?: AppBarVariant
  /** Headline and subtitle at the leading edge (default) or centered. */
  align?: 'start' | 'center'
  /** Headline of the page. Flexible bars wrap it to a second line instead of truncating it. */
  title?: ReactNode
  /** Second line of context under the headline. */
  subtitle?: ReactNode
  /** Search bar of a `search` app bar, e.g. a `Search` component that opens the search view. */
  search?: ReactNode
  /** Leading navigation button (menu, back) or a logo. */
  navigation?: ReactNode
  /** One or two trailing actions (icon buttons, an avatar). */
  actions?: ReactNode
  /** Element whose scroll drives the "scrolled" color and the flexible bars' collapse. */
  scrollTarget?: ScrollTarget
  /** Force the scrolled look (overrides scroll tracking). */
  scrolled?: boolean
  /**
   * `static` (default): the bar sits outside the scroll container (e.g. in AppScaffold).
   * `sticky`: the bar is inside the scroll container and sticks to its top.
   * `fixed`: the bar stays fixed to the top of the window.
   */
  position?: 'sticky' | 'static' | 'fixed'
}

/** Height the flexible bars add under the 64dp row, before the content is measured. */
const EXPANDED_EXTRA: Record<AppBarVariant, [plain: number, withSubtitle: number]> = {
  search: [0, 0],
  small: [0, 0],
  'medium-flexible': [48, 72],
  'large-flexible': [56, 88],
}

/**
 * App bar (M3 Expressive; formerly the top app bar): the headline, navigation and one or two
 * key actions of the page. Medium and large flexible bars collapse into a small bar as the page
 * scrolls. Outside the scroll container (`static`/`fixed`) they shrink in place; inside it
 * (`sticky`) the row sticks and the large headline scrolls away with the content.
 */
export function AppBar({
  variant = 'small',
  align = 'start',
  title,
  subtitle,
  search,
  navigation,
  actions,
  scrollTarget,
  scrolled: scrolledProp,
  position = 'static',
  className,
  style,
  ...rest
}: AppBarProps) {
  const offset = useScrollOffset(scrollTarget)
  const flexible = variant === 'medium-flexible' || variant === 'large-flexible'
  const expandedRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<number | null>(null)
  const fallback = EXPANDED_EXTRA[variant][subtitle ? 1 : 0]
  const extra = flexible ? (measured ?? fallback) : 0
  // The flexible headline hugs its content (it can wrap), so measure its natural height.
  useIsoLayoutEffect(() => {
    const inner = expandedRef.current?.firstElementChild as HTMLElement | null
    if (!flexible || !inner) return
    const update = () => setMeasured(Math.max(fallback, Math.ceil(inner.scrollHeight)))
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [flexible, fallback])
  const collapse = extra ? Math.min(1, Math.max(0, offset / extra)) : 0
  const inFlow = position === 'sticky'
  // Expanded bars take the scrolled color once content passes under the collapsed row.
  const scrolled = scrolledProp ?? (flexible && inFlow ? offset >= extra : offset > 0)
  const vars = { '--_collapse': collapse, '--_extra': `${extra}px` } as CSSProperties
  const expanded = flexible && (
    <div
      ref={expandedRef}
      className="m3-app-bar__expanded"
      data-variant={variant}
      data-align={align}
      data-in-flow={inFlow ? '' : undefined}
      aria-hidden={collapse >= 1 ? true : undefined}
      style={inFlow ? vars : undefined}
    >
      <div className="m3-app-bar__expanded-content">
        <h1 className="m3-app-bar__headline">{title}</h1>
        {subtitle && <div className="m3-app-bar__subtitle">{subtitle}</div>}
      </div>
    </div>
  )
  const header = (
    <header
      {...rest}
      className={cx('m3-app-bar', className)}
      data-variant={variant}
      data-align={align}
      data-scrolled={scrolled ? '' : undefined}
      data-position={position}
      style={{ ...vars, ...style }}
    >
      <div className="m3-app-bar__row">
        {navigation && <div className="m3-app-bar__navigation">{navigation}</div>}
        {variant === 'search' ? (
          <div className="m3-app-bar__search">{search}</div>
        ) : (
          <div
            className="m3-app-bar__titles"
            aria-hidden={flexible && collapse < 1 ? true : undefined}
          >
            <h1 className="m3-app-bar__title">{title}</h1>
            {subtitle && <div className="m3-app-bar__subtitle">{subtitle}</div>}
          </div>
        )}
        {actions && <div className="m3-app-bar__actions">{actions}</div>}
      </div>
      {!inFlow && expanded}
    </header>
  )
  if (!inFlow || !flexible) return header
  return (
    <>
      {header}
      {expanded}
    </>
  )
}

/** Toolbar type: `docked` spans the bottom of the window; `floating` floats over the content. */
export type ToolbarType = 'docked' | 'floating'

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** `docked` (default): full width at the bottom, for global actions. `floating`: for actions of the page. */
  type?: ToolbarType
  /** Floating toolbars only: horizontal (default) or vertical, for larger windows. */
  orientation?: 'horizontal' | 'vertical'
  /** `standard` (low emphasis) or `vibrant` (draws attention, e.g. an edit mode). */
  color?: 'standard' | 'vibrant'
  /** A FAB next to a floating toolbar, or at the end of a docked one. */
  fab?: ReactNode
  /** Slide away while the target scrolls down; return when it scrolls up. */
  hideOnScroll?: boolean
  /** Element whose scroll drives `hideOnScroll` (defaults to the window). */
  scrollTarget?: ScrollTarget
  /** Floating toolbars: drop the elevation, e.g. on a visually distinct background. */
  flat?: boolean
  /** Accessible name of the toolbar, e.g. "Formatting". */
  'aria-label'?: string
}

const TOOLBAR_ITEMS = 'button, a[href], input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Toolbar (M3 Expressive): actions of the current page in a docked bar (replaces the bottom app
 * bar) or a floating, fully rounded bar, horizontal or vertical. Arrow keys move between its
 * controls. Pair a floating toolbar with a FAB for one high-priority action.
 */
export function Toolbar({
  type = 'docked',
  orientation = 'horizontal',
  color = 'standard',
  fab,
  hideOnScroll = false,
  scrollTarget,
  flat,
  className,
  children,
  onKeyDown,
  ...rest
}: ToolbarProps) {
  const hidden = useHideOnScroll(hideOnScroll, scrollTarget)
  const ref = useRef<HTMLDivElement>(null)
  const vertical = type === 'floating' && orientation === 'vertical'
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    const el = ref.current
    // Text fields keep their arrow keys.
    if (e.defaultPrevented || !el || (e.target as HTMLElement).matches('input, textarea')) return
    handleRovingKeyDown(e, el, TOOLBAR_ITEMS, vertical ? 'vertical' : 'horizontal')
  }
  const toolbar = (
    <div
      role="toolbar"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      {...rest}
      ref={ref}
      className={cx('m3-toolbar', className)}
      data-type={type}
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      data-color={color}
      data-flat={flat ? '' : undefined}
      data-hidden={hidden && !fab ? '' : undefined}
      onKeyDown={handleKeyDown}
    >
      {children}
      {type === 'docked' && fab && <div className="m3-toolbar__fab">{fab}</div>}
    </div>
  )
  if (type === 'docked' || !fab) return toolbar
  return (
    <div
      className="m3-toolbar-group"
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      data-color={color}
      data-hidden={hidden ? '' : undefined}
    >
      {toolbar}
      {fab}
    </div>
  )
}

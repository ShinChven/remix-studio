import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { Fab, IconButton } from '../components/Button'
import {
  type NavItem,
  NavigationBar,
  NavigationRail,
  type NavSection,
  type RailFab,
} from '../components/Navigation'
import { useM3Locale } from '../i18n/locale'
import { cx, useControllableState } from '../utils/hooks'
import { isAtLeast, useWindowSizeClass, type WindowSizeClass } from './windowSize'

/**
 * How the scaffold shows navigation (M3 Expressive): a navigation bar, a collapsed rail, an
 * expanded rail beside the content, or only a modal expanded rail opened from the app bar.
 */
export type NavigationMode = 'bar' | 'rail' | 'expanded-rail' | 'modal-rail'

/** The scaffold FAB: in the rail (extended when the rail is expanded) or above the bar. */
export type ScaffoldFab = RailFab

/** Passed to the `appBar` render function. */
export interface ScaffoldContext {
  /** Current window size class. */
  sizeClass: WindowSizeClass
  /** Navigation mode in effect. */
  mode: NavigationMode
  /** Menu button for the app bar, or null when the rail has its own. */
  menuButton: ReactNode
  /** The scrolling body: pass it to `AppBar scrollTarget`. */
  scrollTarget: RefObject<HTMLElement | null>
  /** Opens the modal expanded rail (or expands the rail beside the content). */
  openNavigation: () => void
}

export interface AppScaffoldProps {
  /** Top-level destinations (bar and collapsed rail). */
  items: NavItem[]
  /** Destinations of the expanded rail, grouped under headlines. Defaults to `items`. */
  sections?: NavSection[]
  /** Key of the current destination, or `null` when no destination matches. */
  value: string | null
  /** Called with the key and the item of the chosen destination. */
  onNavigate?: (key: string, item: NavItem) => void
  /** Brand shown beside the menu button in the expanded rail. */
  brand?: ReactNode
  /** Content under the brand row of the expanded rail, such as a filter field. */
  railHeader?: ReactNode
  /** Item height in the expanded rail: `standard` (56dp) or `compact` (40dp) for long lists. */
  navigationDensity?: 'standard' | 'compact'
  /** Width of the expanded rail in px (220–360). */
  railWidth?: number
  /**
   * Active indicator of the expanded rail: `hug` (default) or `fill` (full width, like a drawer;
   * the FAB stretches to match).
   */
  railIndicator?: 'hug' | 'fill'
  /** Floating action button for the main action of the app. */
  fab?: ScaffoldFab
  /** App bar, or a function that receives the scaffold context. */
  appBar?: ReactNode | ((context: ScaffoldContext) => ReactNode)
  /** Extra content at the bottom of the rail (settings, account). */
  navigationFooter?: ReactNode
  /** Force a navigation mode instead of adapting to the window size. */
  mode?: NavigationMode | 'auto'
  /** Expanded and larger windows: show the expanded rail (true) or the collapsed one (false). */
  railExpanded?: boolean
  /** Initial `railExpanded` value when the prop is not controlled. */
  defaultRailExpanded?: boolean
  /** Called when the menu button expands or collapses the rail beside the content. */
  onRailExpandedChange?: (expanded: boolean) => void
  /** Label for the skip link. */
  skipLinkLabel?: string
  /** When this value changes (e.g. the route path), the body scrolls back to the top. */
  scrollResetKey?: unknown
  /** Body content. It scrolls inside the scaffold. */
  children: ReactNode
  /** Extra class on the root element. */
  className?: string
  /** Accessible name of the navigation landmarks. */
  'aria-label'?: string
}

function resolveMode(size: WindowSizeClass, items: NavItem[], expanded: boolean): NavigationMode {
  if (!isAtLeast(size, 'medium')) return items.length <= 5 ? 'bar' : 'modal-rail'
  if (!isAtLeast(size, 'expanded')) return 'rail'
  return expanded ? 'expanded-rail' : 'rail'
}

/**
 * Adaptive app layout (M3 Expressive window size classes): a flexible navigation bar on compact
 * windows, a collapsed rail on medium windows, and an expanded rail beside the content on
 * expanded and larger windows. The expanded rail, with every destination, is one tap away.
 */
export function AppScaffold({
  items,
  sections,
  value,
  onNavigate,
  brand,
  railHeader,
  navigationDensity = 'standard',
  railWidth,
  railIndicator,
  fab,
  appBar,
  navigationFooter,
  mode: modeProp = 'auto',
  railExpanded: railExpandedProp,
  defaultRailExpanded = true,
  onRailExpandedChange,
  skipLinkLabel = 'Skip to content',
  scrollResetKey,
  children,
  className,
  'aria-label': ariaLabel,
}: AppScaffoldProps) {
  const { messages } = useM3Locale()
  const sizeClass = useWindowSizeClass()
  const [railExpanded, setRailExpanded] = useControllableState({
    value: railExpandedProp,
    defaultValue: defaultRailExpanded,
    onChange: onRailExpandedChange,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const bodyRef = useRef<HTMLElement>(null)
  const mode = modeProp === 'auto' ? resolveMode(sizeClass, items, railExpanded) : modeProp

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever the reset key changes
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [scrollResetKey])

  // On expanded windows (automatic mode) the rail's menu button expands and collapses it in
  // place; elsewhere it opens the modal expanded rail over the content.
  const togglesInPlace = isAtLeast(sizeClass, 'expanded') && modeProp === 'auto'
  // The modal rail only exists while the rail beside the content is not expanded.
  useEffect(() => {
    if (mode === 'expanded-rail') setModalOpen(false)
  }, [mode])
  const expandNavigation = () => {
    if (togglesInPlace) setRailExpanded(true)
    else setModalOpen(true)
  }
  const appBarMenu =
    mode === 'bar' || mode === 'modal-rail' ? (
      <IconButton
        icon="menu"
        label={messages.openNavigation}
        aria-expanded={modalOpen}
        onClick={() => setModalOpen(true)}
      />
    ) : null
  const context: ScaffoldContext = {
    sizeClass,
    mode,
    menuButton: appBarMenu,
    scrollTarget: bodyRef,
    openNavigation: expandNavigation,
  }

  const inRail = mode === 'rail' || mode === 'expanded-rail'
  const railProps = {
    items,
    sections,
    value,
    onChange: onNavigate,
    'aria-label': ariaLabel,
    brand,
    expandedHeader: railHeader,
    density: navigationDensity,
    expandedWidth: railWidth,
    indicator: railIndicator,
    footer: navigationFooter,
    menuButton: true,
  }

  return (
    <div className={cx('m3-scaffold', className)} data-mode={mode} data-size={sizeClass}>
      <a className="m3-scaffold__skip" href="#m3-main">
        {skipLinkLabel}
      </a>
      {inRail && (
        <aside className="m3-scaffold__nav">
          <NavigationRail
            {...railProps}
            fab={fab}
            expanded={mode === 'expanded-rail' || modalOpen}
            modal={mode === 'rail'}
            onExpandedChange={(next) => {
              if (togglesInPlace) setRailExpanded(next)
              else setModalOpen(next)
            }}
          />
        </aside>
      )}
      <div className="m3-scaffold__main">
        {typeof appBar === 'function' ? appBar(context) : appBar}
        <main ref={bodyRef} id="m3-main" tabIndex={-1} className="m3-scaffold__body">
          {children}
        </main>
        {mode === 'bar' && (
          <>
            {fab && (
              <div className="m3-scaffold__fab">
                <Fab
                  icon={fab.icon}
                  aria-label={fab.label}
                  {...(fab.href !== undefined ? { href: fab.href } : { onClick: fab.onClick })}
                />
              </div>
            )}
            <NavigationBar
              items={items}
              value={value}
              onChange={onNavigate}
              aria-label={ariaLabel}
            />
          </>
        )}
        {mode === 'modal-rail' && fab && (
          <div className="m3-scaffold__fab">
            <Fab
              icon={fab.icon}
              aria-label={fab.label}
              {...(fab.href !== undefined ? { href: fab.href } : { onClick: fab.onClick })}
            />
          </div>
        )}
      </div>
      {!inRail && (
        <NavigationRail
          {...railProps}
          modal
          collapseBehavior="hide"
          expanded={modalOpen}
          onExpandedChange={setModalOpen}
          className="m3-scaffold__modal-rail"
        />
      )}
    </div>
  )
}

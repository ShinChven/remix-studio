import {
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createTypeahead } from '../utils/focus'
import { cx, useEventCallback, useMergedRefs, usePresence, useStableId } from '../utils/hooks'
import { useLayer } from '../utils/layers'
import { useLinkComponent } from '../utils/link'
import { Portal } from '../utils/portal'
import { type AnchorLike, type Placement, useAnchorPosition } from '../utils/position'
import { Icon, type IconSource, renderIcon } from './Icon'
import { Ripple } from './Ripple'

export type MenuCloseReason = 'escape' | 'outside' | 'select' | 'tab'

interface MenuContextValue {
  /** Color style, inherited by submenus. */
  color: 'standard' | 'vibrant' | undefined
  /** Closes this menu and every parent menu. */
  closeAll: (reason: MenuCloseReason) => void
  /** Closes only this menu. */
  closeSelf: (reason: MenuCloseReason) => void
  depth: number
  menuRef: { current: HTMLDivElement | null }
  /** Id of the open submenu in this menu (only one at a time). */
  submenu: string | null
  /** Opens (id) or closes (null) a submenu after `delay` ms; a later call replaces a pending one. */
  setSubmenu: (id: string | null, delay?: number) => void
  /** Keeps the current submenu when the pointer reaches it (cancels a pending change). */
  holdSubmenu: () => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

const ITEM_SELECTOR = '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]'

function menuItems(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter(
    (el) => el.closest('[role="menu"]') === menu && el.getAttribute('aria-disabled') !== 'true',
  )
}

export interface MenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Shows the menu. */
  open: boolean
  /** Called when the menu asks to close: on Escape, outside click, selection or Tab. */
  onClose: (reason: MenuCloseReason) => void
  /** Element (or virtual point, see `pointAnchor`) the menu is positioned against. */
  anchor: AnchorLike | null | undefined
  /** Side of the anchor the menu opens on. Nested menus always open to the side. */
  placement?: Placement
  /** Which item receives focus on open. `none` focuses the menu itself; `keep` leaves focus where it is. */
  initialFocus?: 'first' | 'last' | 'selected' | 'none' | 'keep'
  /** Make the menu at least as wide as its anchor. */
  matchWidth?: boolean
  /** Return focus to the anchor element when the menu closes. Defaults to true. */
  restoreFocus?: boolean
  /** Color style: `standard` (surface-based) or `vibrant` (tertiary-based, for emphasis). */
  color?: 'standard' | 'vibrant'
  /** Separates `MenuGroup`s with gaps, each group in a container of its own, instead of dividers. */
  grouped?: boolean
  /** Menu items, groups, dividers and submenus. */
  children: ReactNode
  /** Ref to the menu element. */
  ref?: Ref<HTMLDivElement>
}

/**
 * Menu (M3 Expressive vertical menu): a temporary list of choices, positioned next to an anchor,
 * with rounded items, a highlighted selection, and submenus that take the active shape.
 */
export function Menu({
  open,
  onClose,
  anchor,
  placement = 'bottom-start',
  initialFocus = 'first',
  matchWidth,
  restoreFocus = true,
  color,
  grouped,
  children,
  className,
  style,
  onKeyDown,
  ref,
  ...rest
}: MenuProps) {
  const parent = useContext(MenuContext)
  const menuRef = useRef<HTMLDivElement>(null)
  const mergedRef = useMergedRefs(ref, menuRef)
  const { mounted, state } = usePresence(open, 200)
  const position = useAnchorPosition({
    anchor,
    floatingRef: menuRef,
    open: mounted,
    placement: parent ? 'right-start' : placement,
    offset: parent ? 0 : 4,
    matchWidth,
    fitHeight: true,
  })
  const typeahead = useRef(createTypeahead())

  const closeSelf = useEventCallback((reason: MenuCloseReason) => {
    onClose(reason)
    if (
      restoreFocus &&
      (reason === 'escape' || reason === 'select') &&
      anchor instanceof HTMLElement
    ) {
      anchor.focus({ preventScroll: true })
    }
  })
  const closeAll = useEventCallback((reason: MenuCloseReason) => {
    closeSelf(reason)
    parent?.closeAll(reason)
  })

  useLayer(open, {
    onEscape: () => closeSelf('escape'),
    onOutsidePointerDown: (event) => {
      const target = event.target as Node
      if (anchor instanceof Element && anchor.contains(target)) return
      if (parent?.menuRef.current?.contains(target)) closeSelf('outside')
      else closeAll('outside')
    },
    refs: [menuRef],
  })

  const [submenu, setSubmenuState] = useState<string | null>(null)
  const submenuTimer = useRef<number | undefined>(undefined)
  const setSubmenu = useEventCallback((id: string | null, delay?: number) => {
    window.clearTimeout(submenuTimer.current)
    if (delay) submenuTimer.current = window.setTimeout(() => setSubmenuState(id), delay)
    else setSubmenuState(id)
  })
  const holdSubmenu = useEventCallback(() => window.clearTimeout(submenuTimer.current))
  useEffect(() => {
    if (!open) setSubmenuState(null)
    return () => window.clearTimeout(submenuTimer.current)
  }, [open])

  // Move focus into the menu once it is positioned.
  useEffect(() => {
    if (!open || initialFocus === 'keep') return
    const frame = requestAnimationFrame(() => {
      const menu = menuRef.current
      if (!menu) return
      const items = menuItems(menu)
      const target =
        initialFocus === 'none'
          ? menu
          : initialFocus === 'last'
            ? items.at(-1)
            : initialFocus === 'selected'
              ? (items.find(
                  (el) =>
                    el.getAttribute('aria-checked') === 'true' || el.hasAttribute('data-selected'),
                ) ?? items[0])
              : items[0]
      ;(target ?? menu).focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, initialFocus])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    const menu = menuRef.current
    if (!menu || (e.target as HTMLElement).closest('[role="menu"]') !== menu) return
    const items = menuItems(menu)
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next = -1
    switch (e.key) {
      case 'ArrowDown':
        next = current + 1 >= items.length ? 0 : current + 1
        break
      case 'ArrowUp':
        next = current <= 0 ? items.length - 1 : current - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
      case 'ArrowLeft':
      case 'ArrowRight': {
        const rtl = getComputedStyle(menu).direction === 'rtl'
        const closeKey = rtl ? 'ArrowRight' : 'ArrowLeft'
        if (parent && e.key === closeKey) {
          e.preventDefault()
          closeSelf('escape')
        }
        return
      }
      case 'Tab':
        closeAll('tab')
        return
      default: {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const labels = items.map(
            (el) => el.querySelector('.m3-menu-item__label')?.textContent ?? el.textContent ?? '',
          )
          next = typeahead.current(e.key, labels, current)
        }
      }
    }
    if (next >= 0) {
      e.preventDefault()
      items[next]?.focus()
    }
  }

  if (!mounted) return null
  return (
    <Portal>
      <MenuContext.Provider
        value={{
          color: color ?? parent?.color,
          closeAll,
          closeSelf,
          depth: (parent?.depth ?? -1) + 1,
          menuRef,
          submenu,
          setSubmenu,
          holdSubmenu,
        }}
      >
        <div
          role="menu"
          tabIndex={-1}
          {...rest}
          ref={mergedRef}
          className={cx('m3-menu', className)}
          data-state={state}
          data-placement={position.placement}
          data-color={color ?? parent?.color ?? 'standard'}
          data-grouped={grouped ? '' : undefined}
          data-submenu={parent ? '' : undefined}
          data-inactive={submenu ? '' : undefined}
          style={{ ...position.style, ...style } as CSSProperties}
          onKeyDown={handleKeyDown}
          onPointerEnter={(e) => {
            rest.onPointerEnter?.(e)
            parent?.holdSubmenu()
          }}
        >
          {children}
        </div>
      </MenuContext.Provider>
    </Portal>
  )
}

export interface MenuItemProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  /** Leading icon: a Material Symbols name or an element. */
  icon?: IconSource
  /** Trailing icon: a Material Symbols name or an element. */
  trailingIcon?: IconSource
  /** Keyboard shortcut or short trailing text. */
  trailingText?: ReactNode
  /** Second line of text under the label. */
  supportingText?: ReactNode
  /** Dims the item; arrow keys skip it and it ignores activation. */
  disabled?: boolean
  /** `checkbox` and `radio` items expose `aria-checked`. */
  type?: 'item' | 'checkbox' | 'radio'
  /** Checked state of `checkbox` and `radio` items; shows a check mark. */
  checked?: boolean
  /** Highlights the item (e.g. the current choice) without checkbox semantics. */
  selected?: boolean
  /** Called when the item is clicked or activated with Enter or Space. */
  onSelect?: (event: MouseEvent | KeyboardEvent) => void
  /** Keep the menu open after selection (useful for checkbox items). */
  keepOpen?: boolean
  /** Makes the item a link (through `LinkProvider`). */
  href?: string
  /** Link target, used with `href`. */
  target?: string
  /** Item label. */
  children: ReactNode
}

/** An item in a `Menu`. */
export function MenuItem({
  icon,
  trailingIcon,
  trailingText,
  supportingText,
  disabled,
  type = 'item',
  checked,
  selected,
  onSelect,
  keepOpen,
  href,
  target,
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}: MenuItemProps) {
  const menu = useContext(MenuContext)
  const Link = useLinkComponent()
  const role =
    type === 'checkbox' ? 'menuitemcheckbox' : type === 'radio' ? 'menuitemradio' : 'menuitem'
  const activate = (event: MouseEvent | KeyboardEvent) => {
    if (disabled) return
    onSelect?.(event)
    if (!keepOpen) menu?.closeAll('select')
  }
  const leading =
    icon !== undefined ? (
      renderIcon(icon)
    ) : type !== 'item' && checked ? (
      <Icon name="check" />
    ) : null
  const content = (
    <>
      <Ripple disabled={disabled} />
      {(leading || type !== 'item') && <span className="m3-menu-item__icon">{leading}</span>}
      <span className="m3-menu-item__text">
        <span className="m3-menu-item__label">{children}</span>
        {supportingText && <span className="m3-menu-item__supporting">{supportingText}</span>}
      </span>
      {trailingText && <span className="m3-menu-item__trailing-text">{trailingText}</span>}
      {trailingIcon && <span className="m3-menu-item__icon">{renderIcon(trailingIcon)}</span>}
    </>
  )
  const common = {
    ...rest,
    // Moving to another item closes an open sibling submenu (after a short grace period).
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      rest.onPointerEnter?.(e as PointerEvent<HTMLDivElement>)
      if (menu?.submenu) menu.setSubmenu(null, 300)
    },
    role,
    tabIndex: -1,
    'aria-disabled': disabled || undefined,
    'aria-checked': type === 'item' ? undefined : !!checked,
    'data-selected': selected ? '' : undefined,
    className: cx('m3-menu-item', className),
    onClick: (e: MouseEvent<HTMLElement>) => {
      onClick?.(e as MouseEvent<HTMLDivElement>)
      if (!e.defaultPrevented) activate(e)
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(e as KeyboardEvent<HTMLDivElement>)
      if (e.defaultPrevented) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (href && !disabled) (e.currentTarget as HTMLElement).click()
        else activate(e)
      }
    },
  }
  if (href && !disabled) {
    return (
      <Link {...(common as HTMLAttributes<HTMLAnchorElement>)} href={href} target={target}>
        {content}
      </Link>
    )
  }
  return <div {...(common as HTMLAttributes<HTMLDivElement>)}>{content}</div>
}

export function MenuDivider() {
  return <hr className="m3-menu-divider" />
}

export interface MenuGroupProps {
  /** Heading above the items. It also names the group for assistive technology. */
  label?: ReactNode
  /** Items in the group. */
  children: ReactNode
}

/** Labelled group of items. */
export function MenuGroup({ label, children }: MenuGroupProps) {
  const id = useStableId('m3-menu-group')
  return (
    <div role="group" aria-labelledby={label ? id : undefined} className="m3-menu-group">
      {label && (
        <div id={id} className="m3-menu-group__label">
          {label}
        </div>
      )}
      {children}
    </div>
  )
}

export interface SubMenuProps {
  /** Label of the item that opens the nested menu. */
  label: ReactNode
  /** Leading icon: a Material Symbols name or an element. */
  icon?: IconSource
  /** Dims the item and stops the nested menu from opening. */
  disabled?: boolean
  /** Items of the nested menu. */
  children: ReactNode
}

/** An item that opens a nested menu (hover, click, or the arrow key). */
export function SubMenu({ label, icon, disabled, children }: SubMenuProps) {
  const parent = useContext(MenuContext)
  const id = useStableId('m3-submenu')
  const [item, setItem] = useState<HTMLDivElement | null>(null)
  // Opened by keyboard: focus moves into the submenu. Opened by pointer: focus stays put.
  const [focusMode, setFocusMode] = useState<'first' | 'keep'>('keep')
  // Outside a Menu there is no parent to coordinate with: keep local state.
  const [localOpen, setLocalOpen] = useState(false)
  const open = parent ? parent.submenu === id : localOpen
  const setOpen = (next: boolean, delay = 0) => {
    if (parent) parent.setSubmenu(next ? id : null, delay)
    else setLocalOpen(next)
  }
  return (
    <>
      <div
        ref={setItem}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-disabled={disabled || undefined}
        className="m3-menu-item"
        data-open={open ? '' : undefined}
        onClick={() => {
          if (disabled) return
          setFocusMode('first')
          setOpen(true)
        }}
        onPointerEnter={() => {
          if (disabled || open) return
          setFocusMode('keep')
          setOpen(true, 200)
        }}
        onKeyDown={(e) => {
          if (disabled) return
          const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
          if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            setFocusMode('first')
            setOpen(true)
          }
        }}
      >
        <Ripple disabled={disabled} />
        <span className="m3-menu-item__icon">{renderIcon(icon)}</span>
        <span className="m3-menu-item__text">
          <span className="m3-menu-item__label">{label}</span>
        </span>
        <span className="m3-menu-item__icon">
          <Icon name="arrow_right" className="m3-menu-item__submenu-arrow" />
        </span>
      </div>
      <Menu
        id={id}
        open={open}
        anchor={item}
        initialFocus={focusMode}
        onClose={(reason) => {
          setOpen(false)
          if (reason === 'escape') item?.focus()
        }}
        restoreFocus={false}
      >
        {children}
      </Menu>
    </>
  )
}

export interface MenuTriggerProps {
  /** Registers the trigger as the menu anchor. */
  ref: (el: HTMLElement | null) => void
  /** Opens or closes the menu. */
  onClick: () => void
  /** Opens the menu on ArrowDown (first item) or ArrowUp (last item). */
  onKeyDown: (e: KeyboardEvent) => void
  /** Tells assistive technology that the trigger opens a menu. */
  'aria-haspopup': 'menu'
  /** Whether the menu is open. */
  'aria-expanded': boolean
  /** ID of the menu while it is open. */
  'aria-controls': string | undefined
}

export interface MenuButtonProps {
  /** Renders the trigger; spread the given props onto a button. */
  trigger: (props: MenuTriggerProps) => ReactElement
  /** Menu items, groups, dividers and submenus. */
  children: ReactNode
  /** Side of the trigger the menu opens on. Defaults to `bottom-start`. */
  placement?: Placement
  /** Color style of the menu: `standard` or `vibrant`. */
  color?: 'standard' | 'vibrant'
  /** Separates `MenuGroup`s with gaps instead of dividers. */
  grouped?: boolean
  /** Accessible name of the menu. */
  'aria-label'?: string
}

/** A trigger and its menu, wired for mouse and keyboard (↓ opens at the first item, ↑ at the last). */
export function MenuButton({
  trigger,
  children,
  placement,
  color,
  grouped,
  'aria-label': ariaLabel,
}: MenuButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<'first' | 'last'>('first')
  const id = useStableId('m3-menu')
  return (
    <>
      {trigger({
        ref: setAnchor,
        onClick: () => {
          setFocus('first')
          setOpen((o) => !o)
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setFocus(e.key === 'ArrowDown' ? 'first' : 'last')
            setOpen(true)
          }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
      })}
      <Menu
        id={id}
        open={open}
        anchor={anchor}
        placement={placement}
        color={color}
        grouped={grouped}
        initialFocus={focus}
        onClose={() => setOpen(false)}
        aria-label={ariaLabel}
      >
        {children}
      </Menu>
    </>
  )
}

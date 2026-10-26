import {
  Children,
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useRef,
} from 'react'
import { cx, useControllableState, usePresence, useStableId } from '../utils/hooks'
import { useLayer } from '../utils/layers'
import { Action, type ActionProps } from './Action'
import type { FabSize } from './Button'
import { Icon, type IconSource, renderIcon } from './Icon'
import { Ripple } from './Ripple'

/** Color set of a FAB menu: the close button uses the color, the items its container color. */
export type FabMenuColor = 'primary' | 'secondary' | 'tertiary'

const FAB_ICON_SIZE: Record<FabSize, number> = { regular: 24, medium: 28, large: 36 }

const FabMenuContext = createContext<{ close: () => void } | null>(null)
const FabMenuIndex = createContext(0)

export interface FabMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Icon of the FAB that opens the menu. */
  icon?: IconSource
  /** Accessible name of the FAB, e.g. “Share”. */
  label: string
  /** Accessible name of the close button. */
  closeLabel?: string
  /** Color set: primary, secondary or tertiary. */
  color?: FabMenuColor
  /** Size of the FAB. The menu has one size for every FAB. */
  size?: FabSize
  /** Whether the menu is open (controlled). */
  open?: boolean
  /** Initially open (uncontrolled). */
  defaultOpen?: boolean
  /** Called when the menu opens or closes. */
  onOpenChange?: (open: boolean) => void
  /** Two to six `FabMenuItem`s. */
  children: ReactNode
}

const ITEM_SELECTOR = '.m3-fab-menu__item'

/**
 * FAB menu (M3 Expressive): a FAB that opens two to six related actions. The FAB turns into a
 * contrasting close button and the items spring out above it. Replaces the speed dial and
 * stacked small FABs.
 */
export function FabMenu({
  icon = 'add',
  label,
  closeLabel = 'Close menu',
  color = 'primary',
  size = 'regular',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  className,
  style,
  ...rest
}: FabMenuProps) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuId = useStableId('m3-fab-menu')
  const { mounted, state } = usePresence(open, 250)

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) fabRef.current?.focus({ preventScroll: true })
  }

  useLayer(open, {
    onEscape: () => close(),
    onOutsidePointerDown: () => close(false),
    refs: [rootRef],
  })

  const items = Children.toArray(children)

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = listRef.current
    if (!list) return
    const items = [...list.querySelectorAll<HTMLElement>(ITEM_SELECTOR)]
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next = -1
    if (e.key === 'ArrowDown') next = current + 1 >= items.length ? 0 : current + 1
    else if (e.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else if (e.key === 'Tab') close(false)
    if (next >= 0) {
      e.preventDefault()
      items[next]?.focus()
    }
  }

  const openMenu = (focus: 'first' | 'last' | 'none') => {
    setOpen(true)
    if (focus === 'none') return
    requestAnimationFrame(() => {
      const items = [...(listRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])]
      // The list is drawn bottom-up from the FAB, so the item next to it is the last one.
      ;(focus === 'first' ? items[0] : items.at(-1))?.focus({ preventScroll: true })
    })
  }

  return (
    <div
      {...rest}
      ref={rootRef}
      className={cx('m3-fab-menu', className)}
      data-color={color}
      data-size={size}
      data-open={open ? '' : undefined}
      style={style as CSSProperties}
    >
      {mounted && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="m3-fab-menu__list"
          data-state={state}
          style={{ '--_count': items.length } as CSSProperties}
          onKeyDown={onListKeyDown}
        >
          <FabMenuContext.Provider value={{ close: () => close() }}>
            {/* Items are numbered for the staggered entrance, nearest the FAB first. */}
            {items.map((item, i) => (
              <FabMenuIndex.Provider key={(item as { key?: string }).key ?? i} value={i}>
                {item}
              </FabMenuIndex.Provider>
            ))}
          </FabMenuContext.Provider>
        </div>
      )}
      <button
        ref={fabRef}
        type="button"
        className="m3-fab-menu__fab m3-focus-ring"
        aria-label={open ? closeLabel : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => (open ? close() : openMenu(e.detail === 0 ? 'last' : 'none'))}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            openMenu(e.key === 'ArrowUp' ? 'last' : 'first')
          }
        }}
      >
        <Ripple />
        <span className="m3-fab-menu__icon" data-icon="open">
          {renderIcon(icon, { size: FAB_ICON_SIZE[size] })}
        </span>
        <span className="m3-fab-menu__icon" data-icon="close">
          <Icon name="close" size={20} />
        </span>
      </button>
    </div>
  )
}

export type FabMenuItemProps = ActionProps & {
  /** Leading icon. */
  icon: IconSource
  /** Label: one or two words. */
  children: ReactNode
}

/** An action in a `FabMenu`. Selecting it closes the menu. */
export function FabMenuItem({ icon, children, className, onClick, ...rest }: FabMenuItemProps) {
  const menu = useContext(FabMenuContext)
  const index = useContext(FabMenuIndex)
  return (
    <Action
      {...({
        ...rest,
        onClick: (event: MouseEvent<HTMLElement>) => {
          ;(onClick as ((e: MouseEvent<HTMLElement>) => void) | undefined)?.(event)
          if (!event.defaultPrevented) menu?.close()
        },
      } as ActionProps)}
      role="menuitem"
      className={cx('m3-fab-menu__item', 'm3-focus-ring', className)}
      style={{ '--_index': index, ...(rest as { style?: CSSProperties }).style } as CSSProperties}
    >
      <Ripple disabled={rest.disabled} />
      {renderIcon(icon, { size: 24 })}
      <span className="m3-fab-menu__label">{children}</span>
    </Action>
  )
}

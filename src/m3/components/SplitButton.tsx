import { type HTMLAttributes, type MouseEvent, type ReactNode, useState } from 'react'
import { cx, useStableId } from '../utils/hooks'
import type { Placement } from '../utils/position'
import { Button } from './Button'
import type { ButtonSize } from './ButtonGroup'
import { Icon, type IconSource } from './Icon'
import { Menu } from './Menu'

export type SplitButtonVariant = 'filled' | 'tonal' | 'elevated' | 'outlined'

const CHEVRON_SIZE: Record<ButtonSize, number> = { xs: 22, sm: 22, md: 26, lg: 38, xl: 50 }

export interface SplitButtonProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick' | 'children'> {
  /** Color style, as for buttons: filled, tonal, elevated or outlined. */
  variant?: SplitButtonVariant
  /** Size from `xs` to `xl`, matching buttons and icon buttons. */
  size?: ButtonSize
  /** Label of the main (leading) action: one or two words. */
  label?: ReactNode
  /** Icon of the main action. */
  icon?: IconSource
  /** Accessible name of an icon-only main action. */
  actionLabel?: string
  /** Called when the main action is pressed. */
  onClick?: (event: MouseEvent<HTMLElement>) => void
  /** Accessible name of the menu button, e.g. “More send options”. */
  menuLabel: string
  /** Menu items (`MenuItem`, `MenuGroup`, `MenuDivider`) of the related actions. */
  children: ReactNode
  /** Side of the menu button the menu opens on. Defaults to `bottom-end`. */
  placement?: Placement
  /** Disables both buttons. */
  disabled?: boolean
}

/**
 * Split button (M3 Expressive): a main action next to a menu button with related actions. The
 * menu button's inner corners round off and its arrow turns while the menu is open.
 */
export function SplitButton({
  variant = 'filled',
  size = 'sm',
  label,
  icon,
  actionLabel,
  onClick,
  menuLabel,
  children,
  placement = 'bottom-end',
  disabled,
  className,
  ...rest
}: SplitButtonProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<'first' | 'last'>('first')
  const menuId = useStableId('m3-split-menu')
  return (
    <div
      role="group"
      {...rest}
      className={cx('m3-split-button', className)}
      data-variant={variant}
      data-size={size}
      data-open={open ? '' : undefined}
    >
      <Button
        variant={variant}
        size={size}
        icon={icon}
        shapeMorph={false}
        disabled={disabled}
        aria-label={actionLabel}
        onClick={onClick}
        className="m3-split-button__leading"
      >
        {label}
      </Button>
      <Button
        ref={setAnchor}
        variant={variant}
        size={size}
        shapeMorph={false}
        disabled={disabled}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="m3-split-button__trailing"
        onClick={() => {
          setFocus('first')
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setFocus(e.key === 'ArrowDown' ? 'first' : 'last')
            setOpen(true)
          }
        }}
      >
        {/* The arrow turns on the standard motion scheme, as the spec asks. */}
        <span className="m3-split-button__chevron" data-motion-scheme="standard">
          <Icon name="keyboard_arrow_down" size={CHEVRON_SIZE[size]} />
        </span>
      </Button>
      <Menu
        id={menuId}
        open={open}
        anchor={anchor}
        placement={placement}
        initialFocus={focus}
        onClose={() => setOpen(false)}
        aria-label={menuLabel}
      >
        {children}
      </Menu>
    </div>
  )
}

import type { MouseEvent, ReactNode } from 'react'
import { cx } from '../utils/hooks'
import { Action, type ActionProps } from './Action'
import { type ButtonShape, type ButtonSize, useButtonGroup } from './ButtonGroup'
import { type IconSource, renderIcon } from './Icon'
import { LoadingIndicator } from './LoadingIndicator'
import { Ripple } from './Ripple'
import { Tooltip } from './Tooltip'

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated'

interface ButtonOwnProps {
  /** Emphasis, from filled (highest) through tonal, elevated and outlined to text (lowest). */
  variant?: ButtonVariant
  /** Size from `xs` (32dp) to `xl` (136dp); `sm` (40dp) is the default. */
  size?: ButtonSize
  /** Round (pill) or square corners. */
  shape?: ButtonShape
  /** Shape morph: the corners get smaller while the button is pressed. On by default. */
  shapeMorph?: boolean
  /** Leading icon: a Material Symbols name or an element. */
  icon?: IconSource
  /** Icon after the label, e.g. `open_in_new` for a link that leaves the app. */
  trailingIcon?: IconSource
  /** Shows a loading indicator and ignores activation, but stays focusable. */
  loading?: boolean
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean
  /** Makes it a toggle button (`aria-pressed`). Selected buttons change color and shape. */
  selected?: boolean
  /** Uses the emphasized type style for the label, for primary actions. */
  emphasized?: boolean
  /** Value of the button in a selectable `ButtonGroup`; the group then controls `selected`. */
  value?: string
  /** The label: a short verb in sentence case. */
  children?: ReactNode
}

export type ButtonProps = ButtonOwnProps & ActionProps

const ICON_SIZE: Record<ButtonSize, number> = { xs: 20, sm: 20, md: 24, lg: 32, xl: 40 }

/**
 * Wires a button into the surrounding `ButtonGroup`: its default size and shape, and, when the
 * group is selectable and the button has a `value`, its selection and radio semantics.
 */
function useGroupItem(props: {
  size?: ButtonSize
  shape?: ButtonShape
  value?: string
  selected?: boolean
  disabled?: boolean
  onClick?: (event: MouseEvent<HTMLElement>) => void
}) {
  const group = useButtonGroup()
  const size = props.size ?? group?.size ?? 'sm'
  const shape = props.shape ?? group?.shape ?? 'round'
  const disabled = props.disabled || group?.disabled || undefined
  if (!group?.selection || props.value === undefined) {
    return { size, shape, disabled, selected: props.selected, extra: {}, onClick: props.onClick }
  }
  const value = props.value
  const selected = group.isSelected(value)
  const single = group.selection === 'single'
  return {
    size,
    shape,
    disabled,
    selected,
    extra: single
      ? {
          role: 'radio',
          'aria-checked': selected,
          'aria-pressed': undefined,
          tabIndex: value === group.focusValue ? 0 : -1,
          'data-value': value,
        }
      : { 'data-value': value },
    onClick: (event: MouseEvent<HTMLElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented) group.toggle(value)
    },
  }
}

/** Common button: filled, tonal, outlined, text or elevated. */
export function Button({
  variant = 'filled',
  size: sizeProp,
  shape: shapeProp,
  shapeMorph = true,
  icon,
  trailingIcon,
  loading = false,
  fullWidth,
  selected: selectedProp,
  emphasized,
  value,
  className,
  children,
  ...rest
}: ButtonProps) {
  const item = useGroupItem({
    size: sizeProp,
    shape: shapeProp,
    value,
    selected: selectedProp,
    disabled: rest.disabled,
    onClick: rest.onClick as ((event: MouseEvent<HTMLElement>) => void) | undefined,
  })
  const { size, shape, selected } = item
  const iconSize = ICON_SIZE[size]
  const leading = loading ? (
    <LoadingIndicator size={iconSize + 4} className="m3-button__icon" aria-hidden />
  ) : icon ? (
    <span className="m3-button__icon">
      {renderIcon(icon, { size: iconSize, filled: selected })}
    </span>
  ) : null
  return (
    <Action
      {...({ ...rest, onClick: item.onClick, disabled: item.disabled } as ActionProps)}
      busy={loading}
      aria-busy={loading || undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      {...item.extra}
      className={cx('m3-button', 'm3-focus-ring', className)}
      data-variant={variant}
      data-size={size}
      data-shape={shape}
      data-morph={shapeMorph ? '' : undefined}
      data-leading={leading ? '' : undefined}
      data-trailing={trailingIcon ? '' : undefined}
      data-full-width={fullWidth ? '' : undefined}
      data-toggle={selected === undefined ? undefined : ''}
      data-selected={selected ? '' : undefined}
      data-emphasized={emphasized ? '' : undefined}
    >
      <Ripple disabled={item.disabled} />
      {leading}
      {children !== undefined && <span className="m3-button__label">{children}</span>}
      {trailingIcon && (
        <span className="m3-button__icon">{renderIcon(trailingIcon, { size: iconSize })}</span>
      )}
    </Action>
  )
}

export type IconButtonVariant = 'standard' | 'filled' | 'tonal' | 'outlined'
export type IconButtonWidth = 'narrow' | 'default' | 'wide'

interface IconButtonOwnProps {
  /** Material Symbols name or an element. */
  icon: IconSource
  /** Icon shown when `selected` (toggle buttons). Defaults to the filled version of `icon`. */
  selectedIcon?: IconSource
  /** Accessible name. Required because the button has no visible text. */
  label: string
  /** Container style, from standard (no container) to filled (highest emphasis). */
  variant?: IconButtonVariant
  /** Size from `xs` (32dp) to `xl` (136dp); `sm` (40dp) is the default. */
  size?: ButtonSize
  /** Container width at the same height: narrow, default or wide. */
  width?: IconButtonWidth
  /** Round or square container. Selected toggle buttons switch to the other shape. */
  shape?: ButtonShape
  /** Shape morph: the corners get smaller while the button is pressed. On by default. */
  shapeMorph?: boolean
  /** Makes it a toggle button (`aria-pressed`). */
  selected?: boolean
  /** Value of the button in a selectable `ButtonGroup`; the group then controls `selected`. */
  value?: string
  /** Shows the label in a plain tooltip on hover and focus. */
  tooltip?: boolean
  /** A `Badge` at the top-end corner. Also put the count in `label`, which names the button. */
  badge?: ReactNode
}

export type IconButtonProps = IconButtonOwnProps & ActionProps

const ICON_BUTTON_ICON_SIZE: Record<ButtonSize, number> = { xs: 20, sm: 24, md: 24, lg: 32, xl: 40 }

/** Icon button: standard, filled, tonal or outlined; optionally a toggle. */
export function IconButton({
  icon,
  selectedIcon,
  label,
  variant = 'standard',
  size: sizeProp,
  width = 'default',
  shape: shapeProp,
  shapeMorph = true,
  selected: selectedProp,
  value,
  tooltip,
  badge,
  className,
  ...rest
}: IconButtonProps) {
  const item = useGroupItem({
    size: sizeProp,
    shape: shapeProp,
    value,
    selected: selectedProp,
    disabled: rest.disabled,
    onClick: rest.onClick as ((event: MouseEvent<HTMLElement>) => void) | undefined,
  })
  const { size, shape, selected } = item
  const iconSize = ICON_BUTTON_ICON_SIZE[size]
  const shown = selected && selectedIcon !== undefined ? selectedIcon : icon
  const button = (
    <Action
      {...({ ...rest, onClick: item.onClick, disabled: item.disabled } as ActionProps)}
      aria-label={label}
      aria-pressed={selected === undefined ? undefined : selected}
      {...item.extra}
      className={cx('m3-icon-button', 'm3-focus-ring', className)}
      data-variant={variant}
      data-size={size}
      data-width={width}
      data-shape={shape}
      data-morph={shapeMorph ? '' : undefined}
      data-toggle={selected === undefined ? undefined : ''}
      data-selected={selected ? '' : undefined}
    >
      <Ripple disabled={item.disabled} />
      {renderIcon(shown, { size: iconSize, filled: !!selected })}
      {badge}
    </Action>
  )
  // The tooltip repeats the accessible name, so it is not also linked as a description.
  return tooltip ? (
    <Tooltip title={label} describeChild={false}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}

export type FabColor =
  | 'primary-container'
  | 'secondary-container'
  | 'tertiary-container'
  | 'primary'
  | 'secondary'
  | 'tertiary'
export type FabSize = 'regular' | 'medium' | 'large'

interface FabOwnProps {
  /** Material Symbols name or an element. */
  icon: IconSource
  /** Text label: makes it an extended FAB. */
  label?: ReactNode
  /** Accessible name for an icon-only FAB. */
  'aria-label'?: string
  /** Container color role: tonal (`*-container`, the default) or high-emphasis colors. */
  color?: FabColor
  /** `regular` (56dp), `medium` (80dp) or `large` (96dp), for FABs and extended FABs alike. */
  size?: FabSize
  /** Lower resting elevation, for FABs on surfaces that are already raised. */
  lowered?: boolean
  /** For extended FABs: collapse to icon-only (e.g. while scrolling) when false. */
  expanded?: boolean
}

export type FabProps = FabOwnProps & ActionProps

const FAB_ICON_SIZE: Record<FabSize, number> = { regular: 24, medium: 28, large: 36 }

/** Floating action button (FAB), regular or extended, in three sizes. */
export function Fab({
  icon,
  label,
  color = 'primary-container',
  size = 'regular',
  lowered,
  expanded = true,
  className,
  ...rest
}: FabProps) {
  const extended = label !== undefined && label !== null
  return (
    <Action
      {...rest}
      className={cx('m3-fab', 'm3-focus-ring', className)}
      data-color={color}
      data-size={size}
      data-lowered={lowered ? '' : undefined}
      data-extended={extended ? '' : undefined}
      data-collapsed={extended && !expanded ? '' : undefined}
    >
      <Ripple disabled={rest.disabled} />
      {renderIcon(icon, { size: FAB_ICON_SIZE[size] })}
      {extended && (
        // Collapsed labels are clipped, not hidden, so they still name the button.
        <span className="m3-fab__label">
          <span>{label}</span>
        </span>
      )}
    </Action>
  )
}

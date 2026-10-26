import { type CSSProperties, type HTMLAttributes, isValidElement, type ReactNode } from 'react'
import { cx } from '../utils/hooks'

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Material Symbols ligature name, e.g. `home`, `edit_note`. */
  name: string
  /** Filled style (used for selected navigation destinations). */
  filled?: boolean
  /** Size in px. Defaults to 24. */
  size?: number
  /** Stroke weight 100–700. */
  weight?: number
  /** Accessible name. Without it the icon is decorative and hidden from assistive tech. */
  label?: string
}

/** A Material Symbols (Outlined) icon. Variable axes follow the M3 icon guidance. */
export function Icon({ name, filled, size, weight, label, className, style, ...rest }: IconProps) {
  const vars: Record<string, string | number> = {}
  if (filled) vars['--m3-icon-fill'] = 1
  if (size) vars['--m3-icon-size'] = `${size}px`
  if (weight) vars['--m3-icon-wght'] = weight
  return (
    <span
      {...rest}
      className={cx('m3-icon', className)}
      style={{ ...(vars as CSSProperties), ...style }}
      translate="no"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {name}
    </span>
  )
}

/** Accepts either an icon name or a ready element (custom SVG, avatar…). */
export type IconSource = string | ReactNode

export function renderIcon(icon: IconSource, props?: Partial<IconProps>): ReactNode {
  if (icon === undefined || icon === null || icon === false) return null
  if (typeof icon === 'string') return <Icon name={icon} {...props} />
  if (isValidElement(icon)) return icon
  return icon
}

import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../utils/hooks'

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Number or short text. Omit for a small dot badge. */
  value?: number | string
  /** Numbers above `max` show as `max+`. Defaults to 999. */
  max?: number
  /** Hides the badge (it animates out). Zero values hide automatically unless `showZero`. */
  invisible?: boolean
  /** Shows the badge when `value` is 0. */
  showZero?: boolean
  /** Accessible description, e.g. "3 unread messages". The visible badge is hidden from AT. */
  label?: string
  /** Element the badge is attached to (top-end corner). */
  children?: ReactNode
}

/** Small (dot) or large (number) badge. */
export function Badge({
  value,
  max = 999,
  invisible,
  showZero,
  label,
  children,
  className,
  ...rest
}: BadgeProps) {
  const hidden = invisible || (value === 0 && !showZero)
  const text = typeof value === 'number' && value > max ? `${max}+` : value
  const badge = (
    <span
      {...rest}
      className={cx('m3-badge', className)}
      data-size={value === undefined ? 'small' : 'large'}
      data-hidden={hidden ? '' : undefined}
      aria-hidden="true"
    >
      {value === undefined ? null : text}
    </span>
  )
  const description = label && !hidden ? <span className="m3-visually-hidden">{label}</span> : null
  if (children === undefined) {
    return (
      <>
        {badge}
        {description}
      </>
    )
  }
  return (
    <span className="m3-badge-anchor">
      {children}
      {badge}
      {description}
    </span>
  )
}

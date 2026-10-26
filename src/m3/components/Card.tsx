import {
  createContext,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
  type Ref,
  useContext,
} from 'react'
import type { MaterialShapeName } from '../shapes/materialShapes'
import { cx } from '../utils/hooks'
import { Action, type ActionProps } from './Action'
import { shapeMaskStyle } from './List'
import { Ripple } from './Ripple'

export type CardVariant = 'elevated' | 'filled' | 'outlined'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Container style: `elevated` (shadow), `filled` (tonal fill) or `outlined` (border). */
  variant?: CardVariant
  /** Shows the dragged state (raised elevation and state layer). */
  dragged?: boolean
  /** Dims the card and disables everything in it: the action area, buttons and form controls. */
  disabled?: boolean
  /** Ref to the card container. */
  ref?: Ref<HTMLDivElement>
}

const CardContext = createContext({ disabled: false })

/** Card container: elevated, filled or outlined. Make it interactive with `CardActionArea`. */
export function Card({
  variant = 'elevated',
  dragged,
  disabled = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cx('m3-card', className)}
      data-variant={variant}
      data-dragged={dragged ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      <CardContext.Provider value={{ disabled }}>
        {disabled ? (
          // A disabled fieldset disables every button and form control inside it.
          <fieldset disabled className="m3-card__fieldset">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </CardContext.Provider>
    </div>
  )
}

export type CardActionAreaProps = ActionProps & { children: ReactNode; className?: string }

/** The card's primary action: a button or link filling the card, with ripple and hover. */
export function CardActionArea({ children, className, ...rest }: CardActionAreaProps) {
  const card = useContext(CardContext)
  const disabled = rest.disabled || card.disabled
  return (
    <Action
      {...rest}
      disabled={disabled}
      className={cx('m3-card__action', 'm3-focus-ring', className)}
    >
      <Ripple disabled={disabled} />
      {children}
    </Action>
  )
}

export type CardMediaLayout = 'flush' | 'rounded' | 'inset'

export interface CardMediaProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** CSS aspect ratio, e.g. `16 / 9`. */
  aspectRatio?: string
  /**
   * `flush` runs edge to edge with square corners. `rounded` runs edge to edge with the card's
   * corner radius, so the container shows at the corners. `inset` sits inside the card's padding
   * with rounded corners.
   */
  layout?: CardMediaLayout
  /** Crops the image to a shape of the Material shape library, for expressive image moments. */
  shape?: MaterialShapeName
}

export function CardMedia({
  aspectRatio = '16 / 9',
  layout = 'flush',
  shape,
  className,
  style,
  alt = '',
  ...rest
}: CardMediaProps) {
  return (
    <img
      loading="lazy"
      decoding="async"
      {...rest}
      alt={alt}
      className={cx('m3-card__media', className)}
      data-layout={layout}
      data-shape={shape}
      style={{ aspectRatio, ...shapeMaskStyle(shape), ...style }}
    />
  )
}

export type CardHeaderSize = 'small' | 'large'

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Leading element, usually an `Avatar`. */
  avatar?: ReactNode
  /** Card title: title medium in a `small` header, headline small in a `large` one. */
  title: ReactNode
  /** Secondary line under the title. */
  subhead?: ReactNode
  /** Trailing element, e.g. an IconButton with a menu. */
  action?: ReactNode
  /**
   * `small` is a compact header row, e.g. next to an avatar. `large` sets the title as the card's
   * headline, for cards that lead with their subject.
   */
  size?: CardHeaderSize
}

export function CardHeader({
  avatar,
  title,
  subhead,
  action,
  size = 'small',
  className,
  ...rest
}: CardHeaderProps) {
  return (
    <div {...rest} className={cx('m3-card__header', className)} data-size={size}>
      {avatar && <div className="m3-card__avatar">{avatar}</div>}
      <div className="m3-card__titles">
        <div className="m3-card__title">{title}</div>
        {subhead && <div className="m3-card__subhead">{subhead}</div>}
      </div>
      {action && <div className="m3-card__header-action">{action}</div>}
    </div>
  )
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('m3-card__content', className)} />
}

export function CardActions({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('m3-card__actions', className)} />
}

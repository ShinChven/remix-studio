import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useRef,
} from 'react'
import { type MaterialShapeName, shapeMaskImage } from '../shapes/materialShapes'
import { handleRovingKeyDown } from '../utils/focus'
import { cx, useMergedRefs } from '../utils/hooks'
import { Action } from './Action'
import { type IconSource, renderIcon } from './Icon'
import { Ripple } from './Ripple'

export interface ListProps extends HTMLAttributes<HTMLUListElement> {
  /**
   * Visual style (M3 Expressive): `standard` items share one surface; `segmented` items are
   * separate rounded containers with 2dp gaps. Neither changes how the list behaves.
   */
  variant?: 'standard' | 'segmented'
  /** Arrow keys move focus between interactive items. */
  navigable?: boolean
  /** Ref to the `<ul>` element. */
  ref?: Ref<HTMLUListElement>
}

/** Expressive list: standard or segmented, with rounded items and a highlighted selection. */
export function List({
  variant = 'standard',
  navigable = true,
  className,
  onKeyDown,
  ref,
  ...rest
}: ListProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const merged = useMergedRefs(ref, listRef)
  return (
    <ul
      {...rest}
      ref={merged}
      className={cx('m3-list', className)}
      data-variant={variant}
      onKeyDown={(e: KeyboardEvent<HTMLUListElement>) => {
        onKeyDown?.(e)
        const target = e.target as HTMLElement
        if (
          navigable &&
          !e.defaultPrevented &&
          listRef.current &&
          target.matches('.m3-list-item__action')
        ) {
          handleRovingKeyDown(
            e,
            listRef.current,
            ':scope > li > .m3-list-item__action',
            'vertical',
            false,
          )
        }
      }}
    />
  )
}

export interface ListItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'onClick'> {
  /** Main text, on one line (truncated when too long). */
  headline: ReactNode
  /** Small text above the headline. Makes a three-line item. */
  overline?: ReactNode
  /** Text under the headline. A string makes a two-line item; other content three lines. */
  supportingText?: ReactNode
  /** Short text at the end of the item, e.g. a count. */
  trailingSupportingText?: ReactNode
  /** Leading element: avatar, image, checkbox… */
  leading?: ReactNode
  /** Material Symbols name (or icon element) at the start. Ignored when `leading` is set. */
  leadingIcon?: IconSource
  /** Trailing element: switch, icon button, checkbox… */
  trailing?: ReactNode
  /** Material Symbols name (or icon element) at the end. Ignored when `trailing` is set. */
  trailingIcon?: IconSource
  /** Leading size: `icon` (with `leadingIcon`), `avatar` (40), `image` (56) or `video` (114×64). */
  leadingSize?: 'icon' | 'avatar' | 'image' | 'video'
  /** Force a line count; inferred from content otherwise. */
  lines?: 1 | 2 | 3
  /** Renders the item as a button. */
  onClick?: () => void
  /** Renders the item as a link (through `LinkProvider`). */
  href?: string
  /** Link target, used with `href`. */
  target?: string
  /** Renders the item as a `<label>` so clicking anywhere toggles the control inside. */
  asLabel?: boolean
  /** Highlights the item with the selected color and shape. Links also get `aria-current="page"`. */
  selected?: boolean
  /** Dims the item and disables its button or link. Disable a control inside separately. */
  disabled?: boolean
}

/** One, two or three-line list item. */
export function ListItem({
  headline,
  overline,
  supportingText,
  trailingSupportingText,
  leading,
  leadingIcon,
  trailing,
  trailingIcon,
  leadingSize,
  lines,
  onClick,
  href,
  target,
  asLabel,
  selected,
  disabled,
  className,
  ...rest
}: ListItemProps) {
  const lineCount =
    lines ??
    (overline || (supportingText && typeof supportingText !== 'string')
      ? 3
      : supportingText
        ? 2
        : 1)
  const lead = leading ?? renderIcon(leadingIcon)
  const trail = trailing ?? renderIcon(trailingIcon)
  const content = (
    <>
      {(onClick || href || asLabel) && <Ripple disabled={disabled} />}
      {lead && (
        <span
          className="m3-list-item__leading"
          data-size={leadingSize ?? (leadingIcon ? 'icon' : undefined)}
        >
          {lead}
        </span>
      )}
      <span className="m3-list-item__text">
        {overline && <span className="m3-list-item__overline">{overline}</span>}
        <span className="m3-list-item__headline">{headline}</span>
        {supportingText && <span className="m3-list-item__supporting">{supportingText}</span>}
      </span>
      {trailingSupportingText && (
        <span className="m3-list-item__trailing-text">{trailingSupportingText}</span>
      )}
      {trail && <span className="m3-list-item__trailing">{trail}</span>}
    </>
  )
  let inner: ReactNode
  if (href !== undefined || onClick) {
    inner = (
      <Action
        {...(href !== undefined ? { href, target } : { onClick })}
        disabled={disabled}
        aria-current={selected ? (href !== undefined ? 'page' : 'true') : undefined}
        className="m3-list-item__action m3-list-item__row"
      >
        {content}
      </Action>
    )
  } else if (asLabel && !disabled) {
    // A disabled row is not a label, so clicking it does not toggle the control inside.
    inner = <label className="m3-list-item__row m3-list-item__label">{content}</label>
  } else {
    inner = <div className="m3-list-item__row">{content}</div>
  }
  return (
    <li
      {...rest}
      className={cx('m3-list-item', className)}
      data-lines={lineCount}
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      {inner}
    </li>
  )
}

export function ListSubheader({ className, ...rest }: HTMLAttributes<HTMLLIElement>) {
  return <li role="presentation" {...rest} className={cx('m3-list-subheader', className)} />
}

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  /** `start` insets the leading edge (16dp), `end` the trailing edge, `middle` both edges. */
  inset?: 'start' | 'middle' | 'end'
  /** Vertical divider that fills the height of a flex row. */
  vertical?: boolean
}

export function Divider({ inset, vertical, className, ...rest }: DividerProps) {
  return (
    <hr
      {...rest}
      aria-orientation={vertical ? 'vertical' : undefined}
      className={cx('m3-divider', className)}
      data-inset={inset}
      data-vertical={vertical ? '' : undefined}
    />
  )
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Image URL. Without it the avatar shows `icon`, or else the initials of `name`. */
  src?: string
  /** Used for the alt text and the initials fallback. */
  name?: string
  /** Icon shown when there is no `src`, in place of the initials. */
  icon?: IconSource
  /** Diameter in px. */
  size?: number
  /** Crops the avatar to a shape of the Material shape library instead of a circle. */
  shape?: MaterialShapeName
}

/** Avatar: image, initials or icon, in a circle or a shape of the Material shape library. */
export function Avatar({
  src,
  name,
  icon,
  size = 40,
  shape,
  className,
  style,
  ...rest
}: AvatarProps) {
  const initials = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join('')
    .toUpperCase()
  return (
    <span
      {...rest}
      className={cx('m3-avatar', className)}
      data-shape={shape}
      style={{ width: size, height: size, ...shapeMaskStyle(shape), ...style }}
    >
      {src ? (
        <img src={src} alt={name ?? ''} loading="lazy" decoding="async" />
      ) : icon ? (
        renderIcon(icon, { size: Math.round(size * 0.6) })
      ) : (
        <span aria-label={name} role={name ? 'img' : undefined} style={{ fontSize: size * 0.4 }}>
          {initials}
        </span>
      )}
    </span>
  )
}

/** Inline style that crops an element to a library shape with a CSS mask. */
export function shapeMaskStyle(shape: MaterialShapeName | undefined): CSSProperties | undefined {
  if (!shape) return undefined
  const image = shapeMaskImage(shape)
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  }
}

export type TypescaleRole =
  | 'display-large'
  | 'display-medium'
  | 'display-small'
  | 'headline-large'
  | 'headline-medium'
  | 'headline-small'
  | 'title-large'
  | 'title-medium'
  | 'title-small'
  | 'body-large'
  | 'body-medium'
  | 'body-small'
  | 'label-large'
  | 'label-medium'
  | 'label-small'

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** Typescale role, e.g. `title-medium`. */
  variant?: TypescaleRole
  /** Uses the emphasized style of the role (M3 Expressive): a higher weight for emphasis. */
  emphasized?: boolean
  /** HTML element to render. */
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'label' | 'strong'
  /** Color role, e.g. `on-surface-variant` or `primary`. */
  color?: string
}

/** Text in one of the 15 M3 typescale roles, baseline or emphasized. */
export function Text({
  variant = 'body-large',
  emphasized,
  as: Tag = 'p',
  color,
  className,
  style,
  ...rest
}: TextProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        'm3-text',
        emphasized ? `m3-typescale-emphasized-${variant}` : `m3-typescale-${variant}`,
        className,
      )}
      style={color ? { color: `var(--md-sys-color-${color})`, ...style } : style}
    />
  )
}

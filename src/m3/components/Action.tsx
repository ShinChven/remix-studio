import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import { useLinkComponent } from '../utils/link'

export type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  href?: undefined
  ref?: Ref<HTMLButtonElement>
}

export type NativeLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  href: string
  disabled?: boolean
  ref?: Ref<HTMLAnchorElement>
}

/** Props for something that is either a `<button>` or, with `href`, a link. */
export type ActionProps = NativeButtonProps | NativeLinkProps

type ActionInternalProps = ActionProps & {
  children?: ReactNode
  /** Busy: stays focusable but ignores activation. */
  busy?: boolean
  [data: `data-${string}`]: string | number | boolean | undefined
}

/** Renders a `<button>` or a link (through LinkProvider) with shared disabled semantics. */
export function Action(props: ActionInternalProps) {
  const Link = useLinkComponent()
  if (props.href !== undefined) {
    const { href, disabled, busy, onClick, ...rest } = props as NativeLinkProps & { busy?: boolean }
    if (disabled) {
      // A disabled link has no href, so it is not focusable or followable.
      const { ref, ...anchorRest } = rest
      return <a {...anchorRest} ref={ref} role="link" aria-disabled="true" data-disabled="" />
    }
    const handleClick = busy ? (e: MouseEvent<HTMLAnchorElement>) => e.preventDefault() : onClick
    return <Link {...rest} href={href} onClick={handleClick} aria-disabled={busy || undefined} />
  }
  const {
    disabled,
    busy,
    onClick,
    type = 'button',
    ...rest
  } = props as NativeButtonProps & { busy?: boolean }
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
    />
  )
}

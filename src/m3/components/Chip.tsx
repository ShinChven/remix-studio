import { type HTMLAttributes, type KeyboardEvent, type ReactNode, useRef } from 'react'
import { useM3Locale } from '../i18n/locale'
import { handleRovingKeyDown } from '../utils/focus'
import { cx } from '../utils/hooks'
import { Action, type ActionProps } from './Action'
import { Icon, type IconSource, renderIcon } from './Icon'
import { Ripple } from './Ripple'

interface ChipCommon {
  /** Chip text. Keep it to a few words. */
  label: ReactNode
  /** Leading icon: a Material Symbols name or an element. */
  icon?: IconSource
  /** Dims the chip and ignores activation. */
  disabled?: boolean
  /** Class name for the outer chip element. */
  className?: string
}

export type AssistChipProps = ChipCommon & {
  /** Elevated chips sit on top of images or busy surfaces. */
  elevated?: boolean
} & ActionProps

/** Assist chip: a smart or automated action (e.g. "Add to calendar"). */
export function AssistChip({ label, icon, elevated, className, ...rest }: AssistChipProps) {
  return (
    <span
      className={cx('m3-chip', className)}
      data-variant="assist"
      data-elevated={elevated ? '' : undefined}
      data-disabled={rest.disabled ? '' : undefined}
      data-leading={icon ? '' : undefined}
    >
      <Action {...rest} className="m3-chip__action m3-focus-ring" data-chip-focusable="">
        <Ripple disabled={rest.disabled} />
        {icon && <span className="m3-chip__icon">{renderIcon(icon, { size: 18 })}</span>}
        <span className="m3-chip__label">{label}</span>
      </Action>
    </span>
  )
}

/** Suggestion chip: a dynamically generated suggestion (e.g. a reply or search filter). */
export function SuggestionChip({ label, icon, elevated, className, ...rest }: AssistChipProps) {
  return (
    <span
      className={cx('m3-chip', className)}
      data-variant="suggestion"
      data-elevated={elevated ? '' : undefined}
      data-disabled={rest.disabled ? '' : undefined}
      data-leading={icon ? '' : undefined}
    >
      <Action {...rest} className="m3-chip__action m3-focus-ring" data-chip-focusable="">
        <Ripple disabled={rest.disabled} />
        {icon && <span className="m3-chip__icon">{renderIcon(icon, { size: 18 })}</span>}
        <span className="m3-chip__label">{label}</span>
      </Action>
    </span>
  )
}

export interface FilterChipProps extends ChipCommon {
  /** Whether the filter is on. A selected chip shows a check mark in place of `icon`. */
  selected: boolean
  /** Called with the new selected state when the chip is clicked. */
  onSelectedChange?: (selected: boolean) => void
  /** Elevated chips sit on top of images or busy surfaces. */
  elevated?: boolean
  /** Trailing icon, e.g. `arrow_drop_down` for a chip that opens a menu. */
  trailingIcon?: IconSource
  /** Called on click, after `onSelectedChange`. */
  onClick?: () => void
}

/** Filter chip: toggles a filter on or off (`aria-pressed`). */
export function FilterChip({
  label,
  icon,
  selected,
  onSelectedChange,
  elevated,
  trailingIcon,
  disabled,
  onClick,
  className,
}: FilterChipProps) {
  const leading = selected ? 'check' : icon
  return (
    <span
      className={cx('m3-chip', className)}
      data-variant="filter"
      data-selected={selected ? '' : undefined}
      data-elevated={elevated ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-leading={leading ? '' : undefined}
      data-trailing={trailingIcon ? '' : undefined}
    >
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        className="m3-chip__action m3-focus-ring"
        data-chip-focusable=""
        onClick={() => {
          onSelectedChange?.(!selected)
          onClick?.()
        }}
      >
        <Ripple disabled={disabled} />
        {leading && <span className="m3-chip__icon">{renderIcon(leading, { size: 18 })}</span>}
        <span className="m3-chip__label">{label}</span>
        {trailingIcon && (
          <span className="m3-chip__icon">{renderIcon(trailingIcon, { size: 18 })}</span>
        )}
      </button>
    </span>
  )
}

export interface InputChipProps extends ChipCommon {
  /** Avatar image or element; gives the chip fully rounded corners. */
  avatar?: ReactNode
  /** Selected look. With `onClick`, also sets `aria-pressed`. */
  selected?: boolean
  /** Makes the chip a button. */
  onClick?: () => void
  /** Makes the chip a link (through `LinkProvider`). */
  href?: string
  /** Shows a remove button; Backspace/Delete on the chip also call it. */
  onRemove?: () => void
  /** Accessible name of the remove button. Defaults to “Remove” and the label. */
  removeLabel?: string
}

/** Input chip: a discrete piece of user input (tag, contact, filter value). */
export function InputChip({
  label,
  icon,
  avatar,
  selected,
  onClick,
  href,
  onRemove,
  removeLabel,
  disabled,
  className,
}: InputChipProps) {
  const { messages } = useM3Locale()
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && onRemove && !disabled) {
      e.preventDefault()
      onRemove()
    }
  }
  const content = (
    <>
      <Ripple disabled={disabled} />
      {avatar ? (
        <span className="m3-chip__avatar">{avatar}</span>
      ) : (
        icon && <span className="m3-chip__icon">{renderIcon(icon, { size: 18 })}</span>
      )}
      <span className="m3-chip__label">{label}</span>
    </>
  )
  const textLabel = typeof label === 'string' ? label : ''
  return (
    <span
      className={cx('m3-chip', className)}
      data-variant="input"
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-avatar={avatar ? '' : undefined}
      data-leading={avatar || icon ? '' : undefined}
      data-trailing={onRemove ? '' : undefined}
    >
      {onClick || href ? (
        <Action
          {...(href ? { href } : { onClick })}
          disabled={disabled}
          aria-pressed={selected === undefined || href ? undefined : selected}
          className="m3-chip__action m3-focus-ring"
          data-chip-focusable=""
          onKeyDown={onKeyDown}
        >
          {content}
        </Action>
      ) : (
        <span
          className="m3-chip__action m3-focus-ring"
          tabIndex={disabled ? undefined : 0}
          aria-disabled={disabled || undefined}
          data-chip-focusable=""
          onKeyDown={onKeyDown}
        >
          {content}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="m3-chip__remove m3-focus-ring"
          aria-label={removeLabel ?? messages.remove(textLabel)}
          disabled={disabled}
          data-chip-focusable=""
          onClick={onRemove}
        >
          <Ripple disabled={disabled} />
          <Icon name="close" size={18} />
        </button>
      )}
    </span>
  )
}

export interface ChipSetProps extends HTMLAttributes<HTMLDivElement> {
  /** The chips. Arrow keys, Home and End move focus between them. */
  children: ReactNode
  /** Single line with horizontal scrolling instead of wrapping. */
  scroll?: boolean
}

/** Lays out chips and adds arrow-key navigation between them. */
export function ChipSet({ children, scroll, className, onKeyDown, ...rest }: ChipSetProps) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      role="group"
      {...rest}
      ref={ref}
      className={cx('m3-chip-set', className)}
      data-scroll={scroll ? '' : undefined}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (
          !e.defaultPrevented &&
          ref.current &&
          (e.target as HTMLElement).matches('[data-chip-focusable]')
        ) {
          handleRovingKeyDown(e, ref.current, '[data-chip-focusable]', 'horizontal', false)
        }
      }}
    >
      {children}
    </div>
  )
}

import {
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useRef,
  useState,
} from 'react'
import { useM3Locale } from '../i18n/locale'
import { cx, useIsoLayoutEffect, useMergedRefs, useStableId } from '../utils/hooks'
import { IconButton } from './Button'
import { Icon, type IconSource, renderIcon } from './Icon'

export type FieldVariant = 'filled' | 'outlined'

export interface FieldShellProps {
  /** Filled or outlined container. */
  variant: FieldVariant
  /** Floating label. */
  label?: ReactNode | undefined
  /** ID of the control that the label points to. */
  inputId: string
  /** ID for the label element, for `aria-labelledby`. */
  labelId?: string
  /** ID for the supporting text, for `aria-describedby`. */
  supportingId: string
  /** Content before the value, usually an icon. */
  leading?: ReactNode
  /** Content after the value, usually an icon or an icon button. */
  trailing?: ReactNode
  /** Text before the value, such as a currency sign. */
  prefixText?: ReactNode
  /** Text after the value, such as a unit. */
  suffixText?: ReactNode
  /** Help text under the field. */
  supportingText?: ReactNode
  /** Shows the error color, and an error icon when there is no trailing content. */
  error?: boolean | undefined
  /** Replaces the supporting text while `error` is true. */
  errorText?: ReactNode
  /** Character count text, shown at the end of the supporting line. */
  counter?: string | undefined
  /** Dims the field. */
  disabled?: boolean | undefined
  /** Adds an asterisk to the label. */
  required?: boolean | undefined
  /** Lays out the field for a textarea. */
  multiline?: boolean
  /** Forces the label to float (values the CSS cannot detect, such as a select). */
  populated?: boolean
  /** Forces the label to float even when empty (date/time inputs show their own format). */
  forceFloat?: boolean
  /** Forces the focused look, for controls whose focus the CSS cannot detect. */
  focused?: boolean
  /** Stretches the field to the width of its container. */
  fullWidth?: boolean | undefined
  /** Class name for the root element. */
  className?: string | undefined
  /** Inline style for the root element. */
  style?: CSSProperties | undefined
  /** Ref to the container, for example to anchor a popup. */
  containerRef?: Ref<HTMLDivElement>
  /** Called on clicks inside the container, for example to focus the control. */
  onContainerClick?: (event: MouseEvent<HTMLDivElement>) => void
  /** The control: an input, a textarea or a combobox. */
  children: ReactNode
}

/** Shared container, label, icons and supporting text for text fields and selects. */
export function FieldShell({
  variant,
  label,
  inputId,
  labelId,
  supportingId,
  leading,
  trailing,
  prefixText,
  suffixText,
  supportingText,
  error,
  errorText,
  counter,
  disabled,
  required,
  multiline,
  populated,
  forceFloat,
  focused,
  fullWidth,
  className,
  style,
  containerRef,
  onContainerClick,
  children,
}: FieldShellProps) {
  const hasLabel = label !== undefined && label !== null && label !== ''
  const supporting = error && errorText ? errorText : supportingText
  const showErrorIcon = error && !trailing
  return (
    <div
      className={cx('m3-field', className)}
      style={style}
      data-variant={variant}
      data-error={error ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-label={hasLabel ? '' : undefined}
      data-leading={leading ? '' : undefined}
      data-trailing={trailing || showErrorIcon ? '' : undefined}
      data-multiline={multiline ? '' : undefined}
      data-populated={populated || forceFloat ? '' : undefined}
      data-focused={focused ? '' : undefined}
      data-full-width={fullWidth ? '' : undefined}
    >
      <div ref={containerRef} className="m3-field__container" onClick={onContainerClick}>
        {variant === 'outlined' ? (
          <fieldset className="m3-field__outline" aria-hidden="true">
            {hasLabel && (
              <legend>
                <span>
                  {label}
                  {required && ' *'}
                </span>
              </legend>
            )}
          </fieldset>
        ) : (
          <span className="m3-field__indicator" aria-hidden="true" />
        )}
        {leading && <span className="m3-field__leading">{leading}</span>}
        <div className="m3-field__body">
          {hasLabel && (
            <label className="m3-field__label" htmlFor={inputId} id={labelId}>
              {label}
              {required && <span aria-hidden="true"> *</span>}
            </label>
          )}
          <div className="m3-field__row">
            {prefixText && <span className="m3-field__prefix">{prefixText}</span>}
            {children}
            {suffixText && <span className="m3-field__suffix">{suffixText}</span>}
          </div>
        </div>
        {(trailing || showErrorIcon) && (
          <span className="m3-field__trailing">{trailing ?? <Icon name="error" filled />}</span>
        )}
      </div>
      {(supporting || counter) && (
        <div className="m3-field__supporting">
          <span id={supportingId}>{supporting}</span>
          {counter && <span className="m3-field__counter">{counter}</span>}
        </div>
      )}
    </div>
  )
}

type InputAttrs = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'prefix' | 'onChange' | 'children'
>

export interface TextFieldProps extends InputAttrs {
  /** Filled or outlined container. */
  variant?: FieldVariant
  /** Floating label. Without it, pass `aria-label`. */
  label?: ReactNode
  /** Leading icon: a Material Symbols name or an element. */
  leadingIcon?: IconSource
  /** Icon name, or any element such as an IconButton. */
  trailingIcon?: IconSource
  /** Text before the value, such as `$` or `/`. */
  prefixText?: ReactNode
  /** Text after the value, such as a unit. */
  suffixText?: ReactNode
  /** Help text under the field. */
  supportingText?: ReactNode
  /** Shows the error color and an error icon, and sets `aria-invalid`. */
  error?: boolean
  /** Replaces the supporting text while `error` is true. */
  errorText?: ReactNode
  /** Shows `count / maxLength` under the field. Defaults to true when `maxLength` is set. */
  showCounter?: boolean
  /** Renders a textarea that grows with its content. */
  multiline?: boolean
  /** Minimum visible lines for multiline fields. */
  rows?: number
  /** Multiline fields grow with content up to this many lines, then scroll. */
  maxRows?: number
  /** Adds a show/hide button to password fields. */
  passwordToggle?: boolean
  /** Shows a clear button while the field has a value. */
  onClear?: () => void
  /** Stretches the field to the width of its container. */
  fullWidth?: boolean
  /** Native change event of the input or textarea. */
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  /** Called with the new text on every change. */
  onValueChange?: (value: string) => void
  /** Ref to the input or textarea element. */
  ref?: Ref<HTMLInputElement | HTMLTextAreaElement>
  /** Class name for the input or textarea element. */
  inputClassName?: string
}

const FLOAT_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'color', 'file'])

/** Text field: filled or outlined, single-line or multiline. */
export function TextField({
  variant = 'filled',
  label,
  leadingIcon,
  trailingIcon,
  prefixText,
  suffixText,
  supportingText,
  error = false,
  errorText,
  showCounter,
  multiline = false,
  rows = 1,
  maxRows,
  passwordToggle = false,
  onClear,
  fullWidth,
  className,
  style,
  inputClassName,
  id,
  type = 'text',
  value,
  defaultValue,
  maxLength,
  placeholder,
  disabled,
  required,
  onChange,
  onValueChange,
  ref,
  'aria-describedby': describedBy,
  ...rest
}: TextFieldProps) {
  const { messages } = useM3Locale()
  const inputId = useStableId('m3-field', id)
  const supportingId = `${inputId}-supporting`
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const mergedRef = useMergedRefs(ref, inputRef)
  const [revealed, setRevealed] = useState(false)
  const [innerLength, setInnerLength] = useState(() => String(defaultValue ?? '').length)
  const [innerPopulated, setInnerPopulated] = useState(() => String(defaultValue ?? '').length > 0)
  const length = value !== undefined ? String(value).length : innerLength
  const populated = value !== undefined ? String(value).length > 0 : innerPopulated
  const counter =
    maxLength !== undefined && (showCounter ?? true) ? `${length} / ${maxLength}` : undefined

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (value === undefined) {
      setInnerLength(event.target.value.length)
      setInnerPopulated(event.target.value.length > 0)
    }
    onChange?.(event)
    onValueChange?.(event.target.value)
  }

  // Grow multiline fields with their content, between `rows` and `maxRows` lines.
  useIsoLayoutEffect(() => {
    const el = inputRef.current
    if (!multiline || !(el instanceof HTMLTextAreaElement)) return
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 24
    el.style.height = 'auto'
    const min = rows * lineHeight
    const max = maxRows ? maxRows * lineHeight : Number.POSITIVE_INFINITY
    const next = Math.min(Math.max(el.scrollHeight, min), max)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  })

  const isPassword = type === 'password'
  let trailing: ReactNode = renderIcon(trailingIcon)
  if (isPassword && passwordToggle) {
    trailing = (
      <IconButton
        icon={revealed ? 'visibility_off' : 'visibility'}
        label={revealed ? messages.hidePassword : messages.showPassword}
        onClick={() => setRevealed((r) => !r)}
        disabled={disabled}
      />
    )
  } else if (onClear && populated && !disabled) {
    trailing = (
      <IconButton
        icon="cancel"
        label={messages.clear}
        onClick={() => {
          // Uncontrolled fields hold their text in the DOM: clear it there too.
          if (value === undefined && inputRef.current) inputRef.current.value = ''
          setInnerLength(0)
          setInnerPopulated(false)
          onClear()
          onValueChange?.('')
          inputRef.current?.focus()
        }}
      />
    )
  }

  const describedByIds =
    [describedBy, supportingText || (error && errorText) ? supportingId : undefined]
      .filter(Boolean)
      .join(' ') || undefined
  const common = {
    id: inputId,
    className: cx('m3-field__input', inputClassName),
    value,
    defaultValue,
    maxLength,
    disabled,
    required,
    // A blank placeholder lets CSS detect emptiness (`:placeholder-shown`), autofill included.
    placeholder: placeholder ?? ' ',
    'aria-invalid': error || undefined,
    'aria-describedby': describedByIds,
    onChange: handleChange,
  }

  return (
    <FieldShell
      variant={variant}
      label={label}
      inputId={inputId}
      supportingId={supportingId}
      leading={renderIcon(leadingIcon)}
      trailing={trailing}
      prefixText={prefixText}
      suffixText={suffixText}
      supportingText={supportingText}
      error={error}
      errorText={errorText}
      counter={counter}
      disabled={disabled}
      required={required}
      multiline={multiline}
      populated={populated}
      forceFloat={FLOAT_TYPES.has(type)}
      fullWidth={fullWidth}
      className={className}
      style={style}
      onContainerClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a, input, textarea'))
          inputRef.current?.focus()
      }}
    >
      {multiline ? (
        <textarea
          {...(rest as unknown as InputHTMLAttributes<HTMLTextAreaElement>)}
          {...common}
          ref={mergedRef as Ref<HTMLTextAreaElement>}
          rows={rows}
        />
      ) : (
        <input
          {...rest}
          {...common}
          ref={mergedRef as Ref<HTMLInputElement>}
          type={isPassword && revealed ? 'text' : type}
        />
      )}
    </FieldShell>
  )
}

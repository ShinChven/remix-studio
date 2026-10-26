import {
  type ChangeEvent,
  createContext,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useRef,
} from 'react'
import { cx, useControllableState, useMergedRefs, useStableId } from '../utils/hooks'
import { Icon } from './Icon'
import { Ripple } from './Ripple'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  ref?: Ref<HTMLInputElement>
}

function Field({
  label,
  supportingText,
  disabled,
  className,
  control,
  labelPosition = 'end',
}: {
  label?: ReactNode
  supportingText?: ReactNode
  disabled?: boolean | undefined
  className?: string | undefined
  control: ReactNode
  labelPosition?: 'start' | 'end'
}) {
  if (label === undefined) return <>{control}</>
  return (
    <label
      className={cx('m3-selection-field', className)}
      data-disabled={disabled ? '' : undefined}
      data-label-position={labelPosition}
    >
      {control}
      <span className="m3-selection-field__text">
        <span className="m3-selection-field__label">{label}</span>
        {supportingText && <span className="m3-selection-field__supporting">{supportingText}</span>}
      </span>
    </label>
  )
}

export interface CheckboxProps extends InputProps {
  /** Shows a dash: some, but not all, of the child options are checked. */
  indeterminate?: boolean
  /** Shows the error color and sets `aria-invalid`. */
  error?: boolean
  /** Visible label. Without it, pass `aria-label`. */
  label?: ReactNode
  /** Second line of text under the label. */
  supportingText?: ReactNode
  /** Side of the checkbox the label goes on. Defaults to `end`. */
  labelPosition?: 'start' | 'end'
}

/** Checkbox with checked, indeterminate and error states. */
export function Checkbox({
  indeterminate = false,
  error = false,
  label,
  supportingText,
  labelPosition,
  className,
  ref,
  disabled,
  ...rest
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const merged = useMergedRefs(ref, inputRef)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])
  const control = (
    <span
      className={cx('m3-checkbox', label === undefined && className)}
      data-error={error ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      <input
        {...rest}
        ref={merged}
        type="checkbox"
        disabled={disabled}
        aria-invalid={error || undefined}
        className="m3-checkbox__input"
      />
      <Ripple disabled={disabled} />
      <span className="m3-checkbox__box" aria-hidden="true">
        <svg viewBox="0 0 18 18" className="m3-checkbox__mark">
          <path className="m3-checkbox__check" d="M3.6 9.3l3.6 3.6 7.2-7.2" pathLength={1} />
          <path className="m3-checkbox__dash" d="M4 9h10" />
        </svg>
      </span>
    </span>
  )
  return (
    <Field
      label={label}
      supportingText={supportingText}
      disabled={disabled}
      className={className}
      control={control}
      labelPosition={labelPosition}
    />
  )
}

interface RadioGroupContextValue {
  name: string
  value: string | null
  disabled: boolean
  onSelect: (value: string) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export interface RadioGroupProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  /** Form name shared by every radio in the group. Generated when left out. */
  name?: string
  /** Selected value (controlled). `null` selects nothing. */
  value?: string | null
  /** Selected value on first render (uncontrolled). */
  defaultValue?: string | null
  /** Called with the value of the radio that becomes selected. */
  onChange?: (value: string) => void
  /** Disables every radio in the group. */
  disabled?: boolean
  /** Stacks the radios, or places them in a row that wraps. */
  orientation?: 'vertical' | 'horizontal'
  /** `Radio` elements, with any layout around them. */
  children: ReactNode
}

/** Groups radios: one name, one value. Arrow keys move the selection (native behavior). */
export function RadioGroup({
  name,
  value: valueProp,
  defaultValue = null,
  onChange,
  disabled = false,
  orientation = 'vertical',
  className,
  children,
  ...rest
}: RadioGroupProps) {
  const autoName = useStableId('m3-radio')
  const [value, setValue] = useControllableState<string | null>({
    value: valueProp,
    defaultValue,
    onChange: onChange as ((v: string | null) => void) | undefined,
  })
  return (
    <div
      role="radiogroup"
      {...rest}
      className={cx('m3-radio-group', className)}
      data-orientation={orientation}
      aria-disabled={disabled || undefined}
    >
      <RadioGroupContext.Provider
        value={{ name: name ?? autoName, value, disabled, onSelect: (v) => setValue(v) }}
      >
        {children}
      </RadioGroupContext.Provider>
    </div>
  )
}

export interface RadioProps extends Omit<InputProps, 'value'> {
  /** Value of this option. The group selects the radio whose value matches. */
  value: string
  /** Visible label. Without it, pass `aria-label`. */
  label?: ReactNode
  /** Second line of text under the label. */
  supportingText?: ReactNode
  /** Side of the radio the label goes on. Defaults to `end`. */
  labelPosition?: 'start' | 'end'
  /** Shows the error color. */
  error?: boolean
}

/** Radio button. Use inside `RadioGroup`, or standalone with `name`/`checked`. */
export function Radio({
  value,
  label,
  supportingText,
  labelPosition,
  error,
  className,
  disabled: disabledProp,
  onChange,
  checked: checkedProp,
  name: nameProp,
  ...rest
}: RadioProps) {
  const group = useContext(RadioGroupContext)
  const disabled = disabledProp || group?.disabled
  const checked = group ? group.value === value : checkedProp
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e)
    if (e.target.checked) group?.onSelect(value)
  }
  const control = (
    <span
      className={cx('m3-radio', label === undefined && className)}
      data-error={error ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      <input
        {...rest}
        type="radio"
        name={group?.name ?? nameProp}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className="m3-radio__input"
      />
      <Ripple disabled={disabled} />
      <span className="m3-radio__circle" aria-hidden="true">
        <span className="m3-radio__dot" />
      </span>
    </span>
  )
  return (
    <Field
      label={label}
      supportingText={supportingText}
      disabled={disabled}
      className={className}
      control={control}
      labelPosition={labelPosition}
    />
  )
}

export interface SwitchProps extends InputProps {
  /** Visible label. Without it, pass `aria-label`. */
  label?: ReactNode
  /** Second line of text under the label. */
  supportingText?: ReactNode
  /** Label before the switch (common in settings lists). Defaults to `start`. */
  labelPosition?: 'start' | 'end'
  /** Show a check icon in the selected handle. */
  icons?: boolean
  /** Also show an × icon in the unselected handle. */
  showUnselectedIcon?: boolean
}

/** Switch: toggles a single setting on or off immediately. */
export function Switch({
  label,
  supportingText,
  labelPosition = 'start',
  icons = false,
  showUnselectedIcon = false,
  className,
  disabled,
  ...rest
}: SwitchProps) {
  const control = (
    <span
      className={cx('m3-switch', label === undefined && className)}
      data-icons={icons ? '' : undefined}
      data-unselected-icon={icons && showUnselectedIcon ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      <input
        {...rest}
        type="checkbox"
        role="switch"
        disabled={disabled}
        className="m3-switch__input"
      />
      <span className="m3-switch__track" aria-hidden="true" />
      <Ripple disabled={disabled} />
      <span className="m3-switch__handle" aria-hidden="true">
        {icons && <Icon name="check" size={16} className="m3-switch__icon" data-on="" />}
        {icons && showUnselectedIcon && (
          <Icon name="close" size={16} className="m3-switch__icon" data-off="" />
        )}
      </span>
    </span>
  )
  return (
    <Field
      label={label}
      supportingText={supportingText}
      disabled={disabled}
      className={className}
      control={control}
      labelPosition={labelPosition}
    />
  )
}

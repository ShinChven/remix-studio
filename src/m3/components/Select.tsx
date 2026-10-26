import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { createTypeahead } from '../utils/focus'
import {
  cx,
  scrollIntoContainer,
  useControllableState,
  usePresence,
  useStableId,
} from '../utils/hooks'
import { useLayer } from '../utils/layers'
import { Portal } from '../utils/portal'
import { useAnchorPosition } from '../utils/position'
import { Icon, type IconSource, renderIcon } from './Icon'
import { FieldShell, type FieldVariant } from './TextField'

export interface SelectOption<V extends string = string> {
  /** Value that `onChange` receives and the form submits. */
  value: V
  /** Option text. Typeahead matches it. */
  label: string
  /** Leading icon. It also replaces the field’s leading icon while selected. */
  icon?: IconSource
  /** Second line of text under the label. */
  supportingText?: ReactNode
  /** Shows the option but prevents choosing it. */
  disabled?: boolean
}

export interface SelectProps<V extends string = string> {
  /** Options, in display order. */
  options: SelectOption<V>[]
  /** Selected value (controlled). `null` selects nothing. */
  value?: V | null
  /** Selected value on first render (uncontrolled). */
  defaultValue?: V | null
  /** Called with the value of the chosen option. */
  onChange?: (value: V) => void
  /** Filled or outlined container. */
  variant?: FieldVariant
  /** Floating label. Without it, pass `aria-label`. */
  label?: ReactNode
  /** Shown in the field when nothing is selected and the label is floating. */
  placeholder?: string
  /** Leading icon. The icon of the selected option replaces it. */
  leadingIcon?: IconSource
  /** Help text under the field. */
  supportingText?: ReactNode
  /** Shows the error color and sets `aria-invalid`. */
  error?: boolean
  /** Replaces the supporting text while `error` is true. */
  errorText?: ReactNode
  /** Dims the field and removes it from the tab order. */
  disabled?: boolean
  /** Adds an asterisk to the label and makes the form value required. */
  required?: boolean
  /** Form field name; a hidden input carries the value. */
  name?: string
  /** Base for the IDs of the combobox, label and listbox. */
  id?: string
  /** Stretches the field to the width of its container. */
  fullWidth?: boolean
  /** Class name for the root element. */
  className?: string
  /** Accessible name when there is no visible label. */
  'aria-label'?: string
}

/** Select (exposed dropdown menu): a select-only combobox with a listbox popup. */
export function Select<V extends string = string>({
  options,
  value: valueProp,
  defaultValue = null,
  onChange,
  variant = 'filled',
  label,
  placeholder,
  leadingIcon,
  supportingText,
  error,
  errorText,
  disabled,
  required,
  name,
  id,
  fullWidth,
  className,
  'aria-label': ariaLabel,
}: SelectProps<V>) {
  const baseId = useStableId('m3-select', id)
  const labelId = `${baseId}-label`
  const hasLabel = label !== undefined && label !== null && label !== ''
  const listboxId = `${baseId}-listbox`
  const supportingId = `${baseId}-supporting`
  const [value, setValue] = useControllableState<V | null>({
    value: valueProp,
    defaultValue,
    onChange: onChange as ((v: V | null) => void) | undefined,
  })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const comboRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef(createTypeahead())
  const { mounted, state } = usePresence(open, 150)
  const position = useAnchorPosition({
    anchor: containerRef.current,
    floatingRef: listRef,
    open: mounted,
    placement: 'bottom-start',
    offset: 2,
    matchWidth: true,
    fitHeight: true,
  })
  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const enabled = (i: number) => i >= 0 && i < options.length && !options[i]!.disabled

  const openList = (index = selectedIndex) => {
    if (disabled) return
    setActive(enabled(index) ? index : seek(0, 1))
    setOpen(true)
  }
  const close = (focus = true) => {
    setOpen(false)
    if (focus) comboRef.current?.focus({ preventScroll: true })
  }
  const commit = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    setValue(option.value)
    close()
  }
  /** The first enabled option at or after `from`, moving by `delta`; -1 when there is none. */
  const seek = (from: number, delta: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += delta) if (enabled(i)) return i
    return -1
  }
  /** The next enabled option from `from`, or `from` itself at the end of the list. */
  const step = (from: number, delta: 1 | -1) => {
    const next = seek(from + delta, delta)
    return next >= 0 ? next : from
  }
  const page = (from: number, delta: 1 | -1) => {
    const target = Math.min(options.length - 1, Math.max(0, from + delta * 10))
    const next = seek(target, delta === 1 ? -1 : 1)
    return next >= 0 && next !== from && (next - from) * delta > 0 ? next : step(from, delta)
  }
  // Disabled options never match typeahead.
  const typeaheadLabels = () => options.map((o) => (o.disabled ? '' : o.label))

  useLayer(open, {
    onEscape: () => close(),
    onOutsidePointerDown: () => close(false),
    refs: [listRef, containerRef],
  })

  useEffect(() => {
    if (!open || active < 0) return
    const option = document.getElementById(`${baseId}-option-${active}`)
    if (option && listRef.current) scrollIntoContainer(listRef.current, option)
  }, [open, active, baseId])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const { key } = e
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        e.preventDefault()
        openList(key === 'ArrowUp' && selectedIndex < 0 ? options.length - 1 : selectedIndex)
      } else if (key === 'Home' || key === 'End') {
        e.preventDefault()
        openList(key === 'Home' ? seek(0, 1) : seek(options.length - 1, -1))
      } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const index = typeahead.current(key, typeaheadLabels(), selectedIndex)
        if (index >= 0) openList(index)
      }
      return
    }
    switch (key) {
      case 'ArrowDown':
        e.preventDefault()
        if (e.altKey) return
        setActive((a) => step(a, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (e.altKey) commit(active)
        else setActive((a) => step(a, -1))
        break
      case 'Home':
        e.preventDefault()
        setActive(seek(0, 1))
        break
      case 'End':
        e.preventDefault()
        setActive(seek(options.length - 1, -1))
        break
      case 'PageDown':
        e.preventDefault()
        setActive((a) => page(a, 1))
        break
      case 'PageUp':
        e.preventDefault()
        setActive((a) => page(a, -1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        commit(active)
        break
      case 'Tab':
        if (active >= 0) commit(active)
        setOpen(false)
        break
      default:
        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const index = typeahead.current(key, typeaheadLabels(), active)
          if (index >= 0) setActive(index)
        }
    }
  }

  return (
    <FieldShell
      variant={variant}
      label={label}
      labelId={labelId}
      inputId={`${baseId}-combo`}
      supportingId={supportingId}
      leading={selected?.icon ? renderIcon(selected.icon) : renderIcon(leadingIcon)}
      trailing={<Icon name="arrow_drop_down" className="m3-select__arrow" />}
      supportingText={supportingText}
      error={error}
      errorText={errorText}
      disabled={disabled}
      required={required}
      populated={selected !== undefined || (open && !!placeholder)}
      focused={open}
      fullWidth={fullWidth}
      className={cx('m3-select', className)}
      containerRef={containerRef}
      onContainerClick={() => {
        if (disabled) return
        if (open) close()
        else {
          comboRef.current?.focus({ preventScroll: true })
          openList()
        }
      }}
    >
      <div
        ref={comboRef}
        id={`${baseId}-combo`}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={ariaLabel ? undefined : labelId}
        aria-label={ariaLabel}
        aria-describedby={supportingText || (error && errorText) ? supportingId : undefined}
        aria-activedescendant={open && active >= 0 ? `${baseId}-option-${active}` : undefined}
        aria-invalid={error || undefined}
        aria-required={required || undefined}
        aria-disabled={disabled || undefined}
        className="m3-field__input m3-select__value"
        data-open={open ? '' : undefined}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (open && !listRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
        }}
      >
        {selected ? (
          selected.label
        ) : (
          <span className="m3-select__placeholder">{placeholder ?? ' '}</span>
        )}
      </div>
      <input
        className="m3-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value ?? ''}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onFocus={() => comboRef.current?.focus()}
      />
      {mounted && (
        <Portal>
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={hasLabel ? labelId : undefined}
            aria-label={hasLabel ? undefined : ariaLabel}
            className="m3-menu m3-select__listbox"
            data-state={state}
            data-placement={position.placement}
            style={position.style}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${baseId}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className="m3-menu-item"
                data-active={index === active ? '' : undefined}
                data-selected={option.value === value ? '' : undefined}
                onClick={() => commit(index)}
                onPointerMove={() => !option.disabled && setActive(index)}
              >
                {option.icon && (
                  <span className="m3-menu-item__icon">{renderIcon(option.icon)}</span>
                )}
                <span className="m3-menu-item__text">
                  <span className="m3-menu-item__label">{option.label}</span>
                  {option.supportingText && (
                    <span className="m3-menu-item__supporting">{option.supportingText}</span>
                  )}
                </span>
                {option.value === value && (
                  <span className="m3-menu-item__icon">
                    <Icon name="check" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </Portal>
      )}
    </FieldShell>
  )
}

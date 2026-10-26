import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useM3Locale } from '../i18n/locale'
import { cx, useLatest } from '../utils/hooks'
import { Button, IconButton } from './Button'
import { Dialog } from './Dialog'
import { type FieldVariant, TextField } from './TextField'

export interface TimeValue {
  /** Hour on a 24-hour clock, 0–23. */
  hour: number
  /** Minute, 0–59. */
  minute: number
}

/** Parses an `HH:mm` (24-hour) string; returns `null` when it is not a valid time. */
export function parseTime(value: string | null | undefined): TimeValue | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  return hour < 24 && minute < 60 ? { hour, minute } : null
}

/** Formats a time as `HH:mm` (24-hour, zero-padded). */
export function formatTimeValue(t: TimeValue): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

function formatTimeLocale(t: TimeValue, locale: string, hour12: boolean): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, t.hour, t.minute)))
}

const DIAL = 256
const CENTER = DIAL / 2
const OUTER = 104
const INNER = 68

type Part = 'hour' | 'minute'

function dialItems(
  part: Part,
  hour12: boolean,
): { value: number; label: string; inner: boolean }[] {
  if (part === 'minute') {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i * 5,
      label: String(i * 5).padStart(2, '0'),
      inner: false,
    }))
  }
  if (hour12)
    return Array.from({ length: 12 }, (_, i) => ({
      value: i === 0 ? 12 : i,
      label: String(i === 0 ? 12 : i),
      inner: false,
    }))
  return [
    ...Array.from({ length: 12 }, (_, i) => ({
      value: i === 0 ? 12 : i,
      label: String(i === 0 ? 12 : i),
      inner: false,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      value: i === 0 ? 0 : i + 12,
      label: i === 0 ? '00' : String(i + 12),
      inner: true,
    })),
  ]
}

function position(index: number, radius: number) {
  const angle = (index / 12) * 2 * Math.PI
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) }
}

interface ClockDialProps {
  part: Part
  time: TimeValue
  hour12: boolean
  onChange: (time: TimeValue, done: boolean) => void
}

function ClockDial({ part, time, hour12, onChange }: ClockDialProps) {
  const { messages } = useM3Locale()
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pm = time.hour >= 12
  const displayHour = hour12 ? time.hour % 12 || 12 : time.hour
  const items = dialItems(part, hour12)

  const fromPointer = (clientX: number, clientY: number, done: boolean) => {
    const rect = ref.current!.getBoundingClientRect()
    const scale = rect.width / DIAL || 1
    const x = (clientX - rect.left) / scale - CENTER
    const y = (clientY - rect.top) / scale - CENTER
    let angle = Math.atan2(x, -y)
    if (angle < 0) angle += 2 * Math.PI
    const distance = Math.hypot(x, y)
    if (part === 'minute') {
      const minute = Math.round((angle / (2 * Math.PI)) * 60) % 60
      onChange({ ...time, minute }, done)
      return
    }
    const index = Math.round((angle / (2 * Math.PI)) * 12) % 12
    let hour: number
    if (hour12) {
      const h = index === 0 ? 12 : index
      hour = (h % 12) + (pm ? 12 : 0)
    } else {
      const inner = distance < (OUTER + INNER) / 2
      hour = inner ? (index === 0 ? 0 : index + 12) : index === 0 ? 12 : index
    }
    onChange({ ...time, hour }, done)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    fromPointer(e.clientX, e.clientY, false)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) fromPointer(e.clientX, e.clientY, false)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    fromPointer(e.clientX, e.clientY, true)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 5,
      PageDown: -5,
    }[e.key]
    if (delta === undefined) return
    e.preventDefault()
    if (part === 'minute') onChange({ ...time, minute: (time.minute + delta + 60) % 60 }, false)
    else if (hour12) {
      // Cycle 1–12 within the current AM/PM period.
      const next = ((displayHour - 1 + Math.sign(delta) + 12) % 12) + 1
      onChange({ ...time, hour: (next % 12) + (pm ? 12 : 0) }, false)
    } else onChange({ ...time, hour: (time.hour + Math.sign(delta) + 24) % 24 }, false)
  }

  const selectedValue = part === 'minute' ? time.minute : displayHour
  const handIndex = part === 'minute' ? time.minute / 5 : (hour12 ? displayHour : time.hour) % 12
  const handInner = part === 'hour' && !hour12 && (time.hour === 0 || time.hour > 12)
  const handEnd = position(handIndex, handInner ? INNER : OUTER)
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={part === 'hour' ? messages.hour : messages.minute}
      aria-valuemin={part === 'hour' ? (hour12 ? 1 : 0) : 0}
      aria-valuemax={part === 'hour' ? (hour12 ? 12 : 23) : 59}
      aria-valuenow={part === 'hour' ? (hour12 ? displayHour : time.hour) : time.minute}
      className="m3-clock m3-focus-ring"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onKeyDown={onKeyDown}
    >
      <svg viewBox={`0 0 ${DIAL} ${DIAL}`} aria-hidden="true">
        <circle className="m3-clock__face" cx={CENTER} cy={CENTER} r={CENTER} />
        <line className="m3-clock__hand" x1={CENTER} y1={CENTER} x2={handEnd.x} y2={handEnd.y} />
        <circle className="m3-clock__center" cx={CENTER} cy={CENTER} r={3} />
        <circle className="m3-clock__selector" cx={handEnd.x} cy={handEnd.y} r={24} />
        {part === 'minute' && time.minute % 5 !== 0 && (
          <circle className="m3-clock__dot" cx={handEnd.x} cy={handEnd.y} r={2} />
        )}
        {items.map((item, i) => {
          const p = position(i % 12, item.inner ? INNER : OUTER)
          const active =
            part === 'minute'
              ? item.value === selectedValue
              : hour12
                ? item.value === displayHour
                : item.value === time.hour
          return (
            <text
              key={`${item.inner}-${item.value}`}
              x={p.x}
              y={p.y}
              className="m3-clock__number"
              data-inner={item.inner ? '' : undefined}
              data-active={active ? '' : undefined}
            >
              {item.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

export interface TimePickerDialogProps {
  /** Shows the dialog. */
  open: boolean
  /** Called on Cancel, Escape, a scrim click, and after OK. */
  onClose: () => void
  /** `HH:mm` (24-hour). The dialog starts at 09:00 when there is no value. */
  value?: string | null
  /** Called with the picked time as `HH:mm` (24-hour) when people press OK; `onClose` follows. */
  onConfirm: (value: string) => void
  /** Shows a 12-hour clock with AM/PM. Defaults to the locale’s convention. */
  hour12?: boolean
  /** Mode shown each time the dialog opens: clock dial or keyboard input. */
  initialMode?: 'dial' | 'input'
  /** Accessible name and title. Defaults to “Select time”, or “Enter time” in input mode. */
  title?: string
}

/** Modal time picker with a clock dial and a keyboard-input mode. */
export function TimePickerDialog({
  open,
  onClose,
  value,
  onConfirm,
  hour12: hour12Prop,
  initialMode = 'dial',
  title,
}: TimePickerDialogProps) {
  const { messages, hour12: localeHour12 } = useM3Locale()
  const hour12 = hour12Prop ?? localeHour12
  const [time, setTime] = useState<TimeValue>(parseTime(value) ?? { hour: 9, minute: 0 })
  const [part, setPart] = useState<Part>('hour')
  const [inputMode, setInputMode] = useState(initialMode === 'input')
  // Typed fields that hold an out-of-range value: OK stays disabled until they are fixed.
  const [invalid, setInvalid] = useState<{ hour?: boolean; minute?: boolean }>({})
  useEffect(() => {
    if (!open) return
    setTime(parseTime(value) ?? { hour: 9, minute: 0 })
    setPart('hour')
    setInputMode(initialMode === 'input')
    setInvalid({})
  }, [open, value, initialMode])
  const hasInvalid = inputMode && (invalid.hour || invalid.minute)

  const pm = time.hour >= 12
  const displayHour = hour12 ? time.hour % 12 || 12 : time.hour
  const setPeriod = (toPm: boolean) => {
    if (toPm !== pm) setTime((t) => ({ ...t, hour: (t.hour + 12) % 24 }))
  }

  const period = hour12 && (
    <div className="m3-time__period" role="radiogroup" aria-label={`${messages.am}/${messages.pm}`}>
      <button
        type="button"
        role="radio"
        aria-checked={!pm}
        data-selected={!pm ? '' : undefined}
        className="m3-focus-ring"
        onClick={() => setPeriod(false)}
      >
        {messages.am}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={pm}
        data-selected={pm ? '' : undefined}
        className="m3-focus-ring"
        onClick={() => setPeriod(true)}
      >
        {messages.pm}
      </button>
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label={title ?? (inputMode ? messages.enterTime : messages.selectTime)}
      className="m3-time-dialog"
      maxWidth={328}
      actions={
        <>
          <IconButton
            icon={inputMode ? 'schedule' : 'keyboard'}
            label={inputMode ? messages.switchToClock : messages.switchToKeyboard}
            onClick={() => {
              // The time keeps its last valid value, so unfinished typed entries are dropped.
              setInvalid({})
              setInputMode((m) => !m)
            }}
            className="m3-time__mode"
          />
          <Button variant="text" onClick={onClose}>
            {messages.cancel}
          </Button>
          <Button
            variant="text"
            disabled={hasInvalid}
            onClick={() => {
              onConfirm(formatTimeValue(time))
              onClose()
            }}
          >
            {messages.ok}
          </Button>
        </>
      }
    >
      <div className="m3-time__title">
        {title ?? (inputMode ? messages.enterTime : messages.selectTime)}
      </div>
      <div className="m3-time__selectors">
        {inputMode ? (
          <>
            <TimeNumberInput
              label={messages.hour}
              value={displayHour}
              min={hour12 ? 1 : 0}
              max={hour12 ? 12 : 23}
              onChange={(h) =>
                setTime((t) => ({ ...t, hour: hour12 ? (h % 12) + (t.hour >= 12 ? 12 : 0) : h }))
              }
              onValidityChange={(ok) => setInvalid((v) => ({ ...v, hour: !ok }))}
            />
            <span className="m3-time__colon">:</span>
            <TimeNumberInput
              label={messages.minute}
              value={time.minute}
              min={0}
              max={59}
              onChange={(m) => setTime((t) => ({ ...t, minute: m }))}
              onValidityChange={(ok) => setInvalid((v) => ({ ...v, minute: !ok }))}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className="m3-time__box m3-focus-ring"
              aria-pressed={part === 'hour'}
              aria-label={`${messages.hour} ${displayHour}`}
              data-selected={part === 'hour' ? '' : undefined}
              onClick={() => setPart('hour')}
            >
              {hour12 ? displayHour : String(displayHour).padStart(2, '0')}
            </button>
            <span className="m3-time__colon">:</span>
            <button
              type="button"
              className="m3-time__box m3-focus-ring"
              aria-pressed={part === 'minute'}
              aria-label={`${messages.minute} ${time.minute}`}
              data-selected={part === 'minute' ? '' : undefined}
              onClick={() => setPart('minute')}
            >
              {String(time.minute).padStart(2, '0')}
            </button>
          </>
        )}
        {period}
      </div>
      {!inputMode && (
        <ClockDial
          part={part}
          time={time}
          hour12={hour12}
          onChange={(t, done) => {
            setTime(t)
            if (done && part === 'hour') setPart('minute')
          }}
        />
      )}
    </Dialog>
  )
}

function TimeNumberInput({
  label,
  value,
  min,
  max,
  onChange,
  onValidityChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onValidityChange: (valid: boolean) => void
}) {
  const [text, setText] = useState(String(value).padStart(2, '0'))
  // Only reformat from the value while the user is not typing in this field.
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setText(String(value).padStart(2, '0'))
  }, [value])
  const n = Number(text)
  const invalid = text === '' || !Number.isInteger(n) || n < min || n > max
  const report = useLatest(onValidityChange)
  useEffect(() => {
    report.current(!invalid)
  }, [invalid, report])
  return (
    <div className="m3-time__input">
      <TextField
        variant="filled"
        aria-label={label}
        value={text}
        inputMode="numeric"
        maxLength={2}
        showCounter={false}
        error={invalid}
        supportingText={label}
        onValueChange={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 2)
          setText(digits)
          const next = Number(digits)
          if (digits !== '' && next >= min && next <= max) onChange(next)
        }}
        onFocus={() => {
          editing.current = true
        }}
        onBlur={() => {
          editing.current = false
          // Keep an invalid entry visible (with its error) instead of silently reverting it.
          if (!invalid) setText(String(value).padStart(2, '0'))
        }}
      />
    </div>
  )
}

export interface TimePickerFieldProps {
  /** Floating label of the text field. */
  label?: ReactNode
  /** `HH:mm` (24-hour). */
  value?: string | null
  /** Called with the picked `HH:mm` time, or `null` when people press Backspace or Delete. */
  onChange?: (value: string | null) => void
  /** Shows a 12-hour clock with AM/PM. Defaults to the locale’s convention. */
  hour12?: boolean
  /** Text field style: `outlined` or `filled`. */
  variant?: FieldVariant
  /** Text under the field. */
  supportingText?: ReactNode
  /** Disables the field and the clock button. */
  disabled?: boolean
  /** Marks the field as required. */
  required?: boolean
  /** Adds a hidden input with the `HH:mm` value, for native form submits. */
  name?: string
  /** Makes the field fill the width of its container. */
  fullWidth?: boolean
  /** Extra class on the root element. */
  className?: string
}

/** Read-only field that shows the time in the locale’s format and opens the time picker. */
export function TimePickerField({
  label,
  value,
  onChange,
  hour12: hour12Prop,
  variant = 'outlined',
  supportingText,
  disabled,
  required,
  name,
  fullWidth,
  className,
}: TimePickerFieldProps) {
  const { locale, messages, hour12: localeHour12 } = useM3Locale()
  const hour12 = hour12Prop ?? localeHour12
  const [open, setOpen] = useState(false)
  const parsed = parseTime(value)
  return (
    <div className={cx('m3-time-field', className)}>
      <TextField
        variant={variant}
        label={label}
        value={parsed ? formatTimeLocale(parsed, locale, hour12) : ''}
        readOnly
        disabled={disabled}
        required={required}
        supportingText={supportingText}
        fullWidth={fullWidth}
        onClick={() => !disabled && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && e.altKey)) {
            e.preventDefault()
            setOpen(true)
          }
          if ((e.key === 'Backspace' || e.key === 'Delete') && value) onChange?.(null)
        }}
        trailingIcon={
          <IconButton
            icon="schedule"
            label={messages.selectTime}
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={() => setOpen(true)}
          />
        }
      />
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <TimePickerDialog
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        hour12={hour12}
        onConfirm={(v) => onChange?.(v)}
      />
    </div>
  )
}

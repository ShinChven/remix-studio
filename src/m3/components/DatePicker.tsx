import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useM3Locale } from '../i18n/locale'
import {
  addDays,
  addMonths,
  clampDate,
  compareDates,
  datePattern,
  dayOfWeek,
  formatDate,
  formatPattern,
  monthGrid,
  type PlainDate,
  parseISODate,
  parsePattern,
  sameDate,
  todayDate,
  toISODate,
  weekdayNames,
} from '../utils/date'
import { cx, scrollIntoContainer, usePresence, useStableId } from '../utils/hooks'
import { useLayer } from '../utils/layers'
import { Portal } from '../utils/portal'
import { useAnchorPosition } from '../utils/position'
import { Button, IconButton } from './Button'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { type FieldVariant, TextField } from './TextField'

type View = 'days' | 'months' | 'years'

interface CalendarViewProps {
  mode: 'single' | 'range'
  start: PlainDate | null
  end: PlainDate | null
  onSelect: (date: PlainDate) => void
  min: PlainDate | null
  max: PlainDate | null
  isDateDisabled?: ((iso: string) => boolean) | undefined
  variant: 'modal' | 'docked'
  autoFocus?: boolean
}

function CalendarView({
  mode,
  start,
  end,
  onSelect,
  min,
  max,
  isDateDisabled,
  variant,
  autoFocus,
}: CalendarViewProps) {
  const { locale, messages, firstDayOfWeek } = useM3Locale()
  const today = useMemo(todayDate, [])
  const initial = clampDate(start ?? today, min, max)
  const [visible, setVisible] = useState({ year: initial.year, month: initial.month })
  const [focused, setFocused] = useState<PlainDate>(initial)
  const [view, setView] = useState<View>('days')
  const [hover, setHover] = useState<PlainDate | null>(null)
  const gridRef = useRef<HTMLTableElement>(null)
  const yearsRef = useRef<HTMLDivElement>(null)
  const focusAfterRender = useRef(!!autoFocus)
  const minYear = min?.year ?? 1900
  const maxYear = max?.year ?? 2100

  const disabled = (d: PlainDate) =>
    (min !== null && compareDates(d, min) < 0) ||
    (max !== null && compareDates(d, max) > 0) ||
    !!isDateDisabled?.(toISODate(d))

  useEffect(() => {
    if (!focusAfterRender.current || view !== 'days') return
    focusAfterRender.current = false
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${toISODate(focused)}"]`)
      ?.focus()
  })

  useLayoutEffect(() => {
    if (view === 'years') {
      const list = yearsRef.current
      const el = list?.querySelector<HTMLElement>('[data-current]')
      if (list && el) scrollIntoContainer(list, el, 'center')
      el?.focus({ preventScroll: true })
    } else if (view === 'months') {
      yearsRef.current?.querySelector<HTMLElement>('[data-current]')?.focus({ preventScroll: true })
    }
  }, [view])

  const moveFocus = (next: PlainDate) => {
    const target = clampDate(next, min, max)
    setFocused(target)
    setVisible({ year: target.year, month: target.month })
    focusAfterRender.current = true
  }

  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const weekOffset = (dayOfWeek(focused) - firstDayOfWeek + 7) % 7
    let next: PlainDate
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(focused, rtl ? 1 : -1)
        break
      case 'ArrowRight':
        next = addDays(focused, rtl ? -1 : 1)
        break
      case 'ArrowUp':
        next = addDays(focused, -7)
        break
      case 'ArrowDown':
        next = addDays(focused, 7)
        break
      case 'Home':
        next = addDays(focused, -weekOffset)
        break
      case 'End':
        next = addDays(focused, 6 - weekOffset)
        break
      case 'PageUp':
        next = addMonths(focused, e.shiftKey ? -12 : -1)
        break
      case 'PageDown':
        next = addMonths(focused, e.shiftKey ? 12 : 1)
        break
      default:
        return
    }
    e.preventDefault()
    moveFocus(next)
  }

  const goMonth = (delta: number) => {
    const next = addMonths({ ...visible, day: 1 }, delta)
    setVisible({ year: next.year, month: next.month })
    setFocused(clampDate({ ...next, day: Math.min(focused.day, 28) }, min, max))
  }
  const canPrev =
    !min || compareDates(addMonths({ ...visible, day: 1 }, -1), { ...min, day: 1 }) >= 0
  const canNext =
    !max || compareDates(addMonths({ ...visible, day: 1 }, 1), { ...max, day: 1 }) <= 0
  const monthLabel = formatDate({ ...visible, day: 1 }, locale, { year: 'numeric', month: 'long' })
  // Plain numerals in the locale's digits, without the day suffix some locales add.
  const dayNumber = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const weekdays = weekdayNames(locale, firstDayOfWeek, 'narrow')
  const weekdaysLong = weekdayNames(locale, firstDayOfWeek, 'long')
  const rows = monthGrid(visible.year, visible.month, firstDayOfWeek)
  const rangeEnd =
    mode === 'range' && start && !end && hover && compareDates(hover, start) > 0 ? hover : end

  const header =
    variant === 'modal' ? (
      <div className="m3-calendar__header">
        <button
          type="button"
          className="m3-calendar__period m3-focus-ring"
          aria-label={`${monthLabel}, ${messages.selectYear}`}
          aria-expanded={view === 'years'}
          onClick={() => setView(view === 'years' ? 'days' : 'years')}
        >
          {monthLabel}
          <Icon
            name="arrow_drop_down"
            className="m3-calendar__drop"
            data-open={view === 'years' ? '' : undefined}
          />
        </button>
        {view === 'days' && (
          <span className="m3-calendar__nav">
            <IconButton
              icon="chevron_left"
              label={messages.previousMonth}
              onClick={() => goMonth(-1)}
              disabled={!canPrev}
              className="m3-mirror-rtl"
            />
            <IconButton
              icon="chevron_right"
              label={messages.nextMonth}
              onClick={() => goMonth(1)}
              disabled={!canNext}
              className="m3-mirror-rtl"
            />
          </span>
        )}
      </div>
    ) : (
      <div className="m3-calendar__header" data-docked="">
        <span className="m3-calendar__segment">
          <IconButton
            icon="chevron_left"
            label={messages.previousMonth}
            onClick={() => goMonth(-1)}
            disabled={!canPrev || view !== 'days'}
            size="sm"
            className="m3-mirror-rtl"
          />
          <button
            type="button"
            className="m3-calendar__period m3-focus-ring"
            aria-expanded={view === 'months'}
            onClick={() => setView(view === 'months' ? 'days' : 'months')}
          >
            {formatDate({ ...visible, day: 1 }, locale, { month: 'short' })}
            <Icon
              name="arrow_drop_down"
              className="m3-calendar__drop"
              data-open={view === 'months' ? '' : undefined}
            />
          </button>
          <IconButton
            icon="chevron_right"
            label={messages.nextMonth}
            onClick={() => goMonth(1)}
            disabled={!canNext || view !== 'days'}
            size="sm"
            className="m3-mirror-rtl"
          />
        </span>
        <span className="m3-calendar__segment">
          <IconButton
            icon="chevron_left"
            label={`${messages.selectYear} −1`}
            onClick={() => goMonth(-12)}
            disabled={visible.year <= minYear || view !== 'days'}
            size="sm"
            className="m3-mirror-rtl"
          />
          <button
            type="button"
            className="m3-calendar__period m3-focus-ring"
            aria-expanded={view === 'years'}
            aria-label={`${visible.year}, ${messages.selectYear}`}
            onClick={() => setView(view === 'years' ? 'days' : 'years')}
          >
            {formatDate({ ...visible, day: 1 }, locale, { year: 'numeric' })}
            <Icon
              name="arrow_drop_down"
              className="m3-calendar__drop"
              data-open={view === 'years' ? '' : undefined}
            />
          </button>
          <IconButton
            icon="chevron_right"
            label={`${messages.selectYear} +1`}
            onClick={() => goMonth(12)}
            disabled={visible.year >= maxYear || view !== 'days'}
            size="sm"
            className="m3-mirror-rtl"
          />
        </span>
      </div>
    )

  return (
    <div className="m3-calendar" data-variant={variant}>
      {header}
      {view === 'years' && (
        <div
          ref={yearsRef}
          className="m3-calendar__years"
          role="listbox"
          aria-label={messages.selectYear}
        >
          {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map((year) => (
            <button
              key={year}
              type="button"
              role="option"
              aria-selected={year === visible.year}
              tabIndex={year === visible.year ? 0 : -1}
              className="m3-calendar__year m3-focus-ring"
              data-current={year === visible.year ? '' : undefined}
              data-this-year={year === today.year ? '' : undefined}
              onClick={() => {
                const next = clampDate(
                  { year, month: visible.month, day: Math.min(focused.day, 28) },
                  min,
                  max,
                )
                setVisible({ year: next.year, month: next.month })
                setFocused(next)
                setView('days')
              }}
              onKeyDown={(e) => {
                const cols = variant === 'modal' ? 3 : 1
                const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[
                  e.key
                ]
                if (delta === undefined) return
                e.preventDefault()
                const target = e.currentTarget.parentElement?.querySelector<HTMLElement>(
                  `[data-year="${year + delta}"]`,
                )
                target?.focus()
              }}
              data-year={year}
            >
              {formatDate({ year, month: 1, day: 1 }, locale, { year: 'numeric' })}
            </button>
          ))}
        </div>
      )}
      {view === 'months' && (
        <div ref={yearsRef} className="m3-calendar__months" role="listbox">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <button
              key={month}
              type="button"
              role="option"
              aria-selected={month === visible.month}
              className="m3-calendar__month-option m3-focus-ring"
              data-current={month === visible.month ? '' : undefined}
              onClick={() => {
                setVisible({ year: visible.year, month })
                setFocused(
                  clampDate(
                    { year: visible.year, month, day: Math.min(focused.day, 28) },
                    min,
                    max,
                  ),
                )
                setView('days')
              }}
            >
              {month === visible.month && <Icon name="check" />}
              {formatDate({ year: 2001, month, day: 1 }, locale, { month: 'long' })}
            </button>
          ))}
        </div>
      )}
      {view === 'days' && (
        <table
          ref={gridRef}
          className="m3-calendar__grid"
          role="grid"
          aria-label={monthLabel}
          onKeyDown={onGridKeyDown}
        >
          <thead>
            <tr>
              {weekdays.map((name, i) => (
                <th key={weekdaysLong[i]} scope="col" abbr={weekdaysLong[i]}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody onPointerLeave={() => setHover(null)}>
            {rows.map((row) => (
              <tr key={toISODate(row.find(Boolean)!)}>
                {row.map((date, i) => {
                  if (!date) {
                    // biome-ignore lint/suspicious/noArrayIndexKey: empty cells are positional
                    return <td key={`empty-${i}`} role="gridcell" />
                  }
                  const iso = toISODate(date)
                  const isStart = sameDate(date, start)
                  const isEnd = mode === 'range' && sameDate(date, rangeEnd)
                  const inRange =
                    mode === 'range' &&
                    start &&
                    rangeEnd &&
                    compareDates(date, start) > 0 &&
                    compareDates(date, rangeEnd) < 0
                  const selected = isStart || isEnd
                  return (
                    <td
                      key={iso}
                      role="gridcell"
                      aria-selected={selected || !!inRange}
                      data-in-range={inRange ? '' : undefined}
                      data-range-start={
                        mode === 'range' && isStart && rangeEnd && !sameDate(start, rangeEnd)
                          ? ''
                          : undefined
                      }
                      data-range-end={isEnd && start && !sameDate(start, rangeEnd) ? '' : undefined}
                    >
                      <button
                        type="button"
                        className="m3-calendar__day"
                        tabIndex={sameDate(date, focused) ? 0 : -1}
                        disabled={disabled(date)}
                        aria-current={sameDate(date, today) ? 'date' : undefined}
                        aria-label={formatDate(date, locale, {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                        data-date={iso}
                        data-selected={selected ? '' : undefined}
                        data-today={sameDate(date, today) ? '' : undefined}
                        onPointerEnter={() => mode === 'range' && setHover(date)}
                        onFocus={() => setFocused(date)}
                        onClick={() => onSelect(date)}
                      >
                        {dayNumber.format(date.day)}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export interface CalendarProps {
  /** Selected date as an ISO string (`YYYY-MM-DD`); `null` selects nothing. */
  value?: string | null
  /** Called with the ISO date (`YYYY-MM-DD`) that people pick. */
  onChange?: (value: string) => void
  /** Earliest date people can pick (`YYYY-MM-DD`). */
  min?: string
  /** Latest date people can pick (`YYYY-MM-DD`). */
  max?: string
  /** Returns true for dates that people cannot pick, such as weekends or holidays. */
  isDateDisabled?: (iso: string) => boolean
  /** Extra class on the root element. */
  className?: string
}

/** Inline month calendar (the date picker’s calendar on its own). */
export function Calendar({ value, onChange, min, max, isDateDisabled, className }: CalendarProps) {
  return (
    <div className={cx('m3-calendar-standalone', className)}>
      <CalendarView
        mode="single"
        start={parseISODate(value)}
        end={null}
        onSelect={(d) => onChange?.(toISODate(d))}
        min={parseISODate(min)}
        max={parseISODate(max)}
        isDateDisabled={isDateDisabled}
        variant="modal"
      />
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
  error,
  autoFocus,
}: {
  label: string
  value: PlainDate | null
  onChange: (d: PlainDate | null, valid: boolean) => void
  error?: string | undefined
  autoFocus?: boolean
}) {
  const { locale } = useM3Locale()
  const pattern = useMemo(() => datePattern(locale), [locale])
  const [text, setText] = useState(value ? formatPattern(value, pattern) : '')
  return (
    <TextField
      variant="outlined"
      label={label}
      value={text}
      placeholder={pattern.placeholder}
      supportingText={pattern.placeholder}
      error={!!error}
      errorText={error}
      inputMode="numeric"
      autoFocus={autoFocus}
      fullWidth
      onValueChange={(t) => {
        setText(t)
        const parsed = parsePattern(t, pattern)
        onChange(parsed, t.trim() === '' || parsed !== null)
      }}
    />
  )
}

interface DialogFrameProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  headline: ReactNode
  inputMode: boolean
  onToggleMode: () => void
  canConfirm: boolean
  children: ReactNode
}

function PickerDialogFrame({
  open,
  onClose,
  onConfirm,
  title,
  headline,
  inputMode,
  onToggleMode,
  canConfirm,
  children,
}: DialogFrameProps) {
  const { messages } = useM3Locale()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label={title}
      className="m3-date-dialog"
      maxWidth={inputMode ? 328 : 360}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {messages.cancel}
          </Button>
          <Button variant="text" onClick={onConfirm} disabled={!canConfirm}>
            {messages.ok}
          </Button>
        </>
      }
    >
      <div className="m3-date-dialog__header">
        <div className="m3-date-dialog__title">{title}</div>
        <div className="m3-date-dialog__headline-row">
          <div className="m3-date-dialog__headline">{headline}</div>
          <IconButton
            icon={inputMode ? 'calendar_today' : 'edit'}
            label={inputMode ? messages.switchToCalendar : messages.switchToInput}
            onClick={onToggleMode}
          />
        </div>
      </div>
      {children}
    </Dialog>
  )
}

export interface DatePickerDialogProps {
  /** Shows the dialog. */
  open: boolean
  /** Called on Cancel, Escape, a scrim click, and after OK. */
  onClose: () => void
  /** ISO date (`YYYY-MM-DD`) shown as selected when the dialog opens. */
  value?: string | null
  /** Called with the picked ISO date (or `null`) when people press OK; `onClose` follows. */
  onConfirm: (value: string | null) => void
  /** Earliest date people can pick (`YYYY-MM-DD`). Typed dates before it show an error. */
  min?: string
  /** Latest date people can pick (`YYYY-MM-DD`). Typed dates after it show an error. */
  max?: string
  /** Returns true for dates that people cannot pick, such as weekends or holidays. */
  isDateDisabled?: (iso: string) => boolean
  /** Text above the headline. Defaults to “Select date”, or “Enter date” in input mode. */
  title?: string
  /** Mode shown each time the dialog opens. People can switch with the icon button. */
  initialMode?: 'calendar' | 'input'
}

/** Modal date picker with calendar and text-input modes. */
export function DatePickerDialog({
  open,
  onClose,
  value,
  onConfirm,
  min,
  max,
  isDateDisabled,
  title,
  initialMode = 'calendar',
}: DatePickerDialogProps) {
  const { locale, messages } = useM3Locale()
  const [draft, setDraft] = useState<PlainDate | null>(parseISODate(value))
  const [inputMode, setInputMode] = useState(initialMode === 'input')
  const [invalid, setInvalid] = useState<string | undefined>()
  const minDate = parseISODate(min)
  const maxDate = parseISODate(max)
  useEffect(() => {
    if (open) {
      setDraft(parseISODate(value))
      setInvalid(undefined)
      setInputMode(initialMode === 'input')
    }
  }, [open, value, initialMode])
  const outOfRange = (d: PlainDate) =>
    (minDate && compareDates(d, minDate) < 0) ||
    (maxDate && compareDates(d, maxDate) > 0) ||
    isDateDisabled?.(toISODate(d))
  return (
    <PickerDialogFrame
      open={open}
      onClose={onClose}
      onConfirm={() => {
        onConfirm(draft ? toISODate(draft) : null)
        onClose()
      }}
      title={title ?? (inputMode ? messages.enterDate : messages.selectDate)}
      headline={
        draft
          ? formatDate(draft, locale, { weekday: 'short', month: 'short', day: 'numeric' })
          : messages.selectDate
      }
      inputMode={inputMode}
      onToggleMode={() => {
        // The draft keeps the last valid date, so an unfinished typed entry is dropped.
        setInvalid(undefined)
        setInputMode((m) => !m)
      }}
      canConfirm={!invalid}
    >
      {inputMode ? (
        <div className="m3-date-dialog__inputs">
          <DateInput
            label={messages.selectDate}
            value={draft}
            autoFocus
            error={invalid}
            onChange={(d, valid) => {
              if (!valid) setInvalid(messages.invalidDate)
              else if (d && outOfRange(d)) setInvalid(messages.dateOutOfRange)
              else {
                setInvalid(undefined)
                setDraft(d)
              }
            }}
          />
        </div>
      ) : (
        <CalendarView
          mode="single"
          start={draft}
          end={null}
          onSelect={(d) => {
            setInvalid(undefined)
            setDraft(d)
          }}
          min={minDate}
          max={maxDate}
          isDateDisabled={isDateDisabled}
          variant="modal"
        />
      )}
    </PickerDialogFrame>
  )
}

export interface DateRangePickerDialogProps {
  /** Shows the dialog. */
  open: boolean
  /** Called on Cancel, Escape, a scrim click, and after OK. */
  onClose: () => void
  /** Start and end as ISO dates (`YYYY-MM-DD`), shown as selected when the dialog opens. */
  value?: [string | null, string | null]
  /** Called with `[start, end]` when people press OK; either date can be `null`. */
  onConfirm: (value: [string | null, string | null]) => void
  /** Earliest date people can pick in the calendar (`YYYY-MM-DD`). */
  min?: string
  /** Latest date people can pick in the calendar (`YYYY-MM-DD`). */
  max?: string
  /** Returns true for dates that people cannot pick in the calendar. */
  isDateDisabled?: (iso: string) => boolean
  /** Text above the headline. Defaults to “Select dates”, or “Enter dates” in input mode. */
  title?: string
  /** Mode shown each time the dialog opens: the calendar or two text fields. */
  initialMode?: 'calendar' | 'input'
}

/** Modal date range picker: pick a start date, then an end date. */
export function DateRangePickerDialog({
  open,
  onClose,
  value,
  onConfirm,
  min,
  max,
  isDateDisabled,
  title,
  initialMode = 'calendar',
}: DateRangePickerDialogProps) {
  const { locale, messages } = useM3Locale()
  const [start, setStart] = useState<PlainDate | null>(null)
  const [end, setEnd] = useState<PlainDate | null>(null)
  const [inputMode, setInputMode] = useState(initialMode === 'input')
  const [errors, setErrors] = useState<{ start?: string | undefined; end?: string | undefined }>({})
  const minDate = parseISODate(min)
  const maxDate = parseISODate(max)
  useEffect(() => {
    if (!open) return
    setStart(parseISODate(value?.[0]))
    setEnd(parseISODate(value?.[1]))
    setErrors({})
    setInputMode(initialMode === 'input')
  }, [open, value, initialMode])
  const fmt = (d: PlainDate | null, fallback: string) =>
    d ? formatDate(d, locale, { month: 'short', day: 'numeric' }) : fallback
  const select = (d: PlainDate) => {
    setErrors({})
    if (!start || end || compareDates(d, start) < 0) {
      setStart(d)
      setEnd(null)
    } else {
      setEnd(d)
    }
  }
  /** Error for a typed date, or undefined when it can be used. */
  const check = (d: PlainDate | null, valid: boolean) => {
    if (!valid) return messages.invalidDate
    if (
      d &&
      ((minDate && compareDates(d, minDate) < 0) ||
        (maxDate && compareDates(d, maxDate) > 0) ||
        isDateDisabled?.(toISODate(d)))
    ) {
      return messages.dateOutOfRange
    }
    return undefined
  }
  const reversed = !!start && !!end && compareDates(start, end) > 0
  return (
    <PickerDialogFrame
      open={open}
      onClose={onClose}
      onConfirm={() => {
        onConfirm([start ? toISODate(start) : null, end ? toISODate(end) : null])
        onClose()
      }}
      title={title ?? (inputMode ? messages.enterDateRange : messages.selectDateRange)}
      headline={`${fmt(start, messages.startDate)} – ${fmt(end, messages.endDate)}`}
      inputMode={inputMode}
      onToggleMode={() => {
        // Dates keep their last valid values, so unfinished typed entries are dropped.
        setErrors({})
        setInputMode((m) => !m)
      }}
      canConfirm={!errors.start && !errors.end && !reversed}
    >
      {inputMode ? (
        <div className="m3-date-dialog__inputs">
          <DateInput
            label={messages.startDate}
            value={start}
            autoFocus
            error={errors.start}
            onChange={(d, valid) => {
              const error = check(d, valid)
              setErrors((e) => ({ ...e, start: error }))
              if (!error) setStart(d)
            }}
          />
          <DateInput
            label={messages.endDate}
            value={end}
            error={errors.end ?? (reversed ? messages.endBeforeStart : undefined)}
            onChange={(d, valid) => {
              const error = check(d, valid)
              setErrors((e) => ({ ...e, end: error }))
              if (!error) setEnd(d)
            }}
          />
        </div>
      ) : (
        <CalendarView
          mode="range"
          start={start}
          end={end}
          onSelect={select}
          min={minDate}
          max={maxDate}
          isDateDisabled={isDateDisabled}
          variant="modal"
        />
      )}
    </PickerDialogFrame>
  )
}

export interface DatePickerFieldProps {
  /** Floating label of the text field. */
  label?: ReactNode
  /** Value as an ISO date (`YYYY-MM-DD`), or `null` when the field is empty. */
  value?: string | null
  /** Called with the ISO date, or `null` when people clear the field. Invalid text is not sent. */
  onChange?: (value: string | null) => void
  /** Earliest date people can pick (`YYYY-MM-DD`). Typed dates before it show an error. */
  min?: string
  /** Latest date people can pick (`YYYY-MM-DD`). Typed dates after it show an error. */
  max?: string
  /** Returns true for dates that people cannot pick. Typed disabled dates show an error. */
  isDateDisabled?: (iso: string) => boolean
  /** Text field style: `outlined` or `filled`. */
  variant?: FieldVariant
  /** Text under the field. Defaults to the locale’s date format, such as `MM/DD/YYYY`. */
  supportingText?: ReactNode
  /** Shows the error style. Typed text that is not valid shows an error on its own. */
  error?: boolean
  /** Replaces the supporting text while `error` is true. */
  errorText?: ReactNode
  /** Disables typing and the calendar button. */
  disabled?: boolean
  /** Marks the field as required. */
  required?: boolean
  /** Adds a hidden input with the ISO value, for native form submits. */
  name?: string
  /** Makes the field fill the width of its container. */
  fullWidth?: boolean
  /** Extra class on the root element. */
  className?: string
}

/** Docked date picker: a text field in the locale’s date format with a calendar popover. */
export function DatePickerField({
  label,
  value,
  onChange,
  min,
  max,
  isDateDisabled,
  variant = 'outlined',
  supportingText,
  error,
  errorText,
  disabled,
  required,
  name,
  fullWidth,
  className,
}: DatePickerFieldProps) {
  const { locale, messages } = useM3Locale()
  const pattern = useMemo(() => datePattern(locale), [locale])
  const selected = parseISODate(value)
  const [text, setText] = useState(selected ? formatPattern(selected, pattern) : '')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const popoverId = useStableId('m3-date-popover')
  const { mounted, state } = usePresence(open, 150)
  const position = useAnchorPosition({
    anchor: fieldRef.current?.querySelector('.m3-field__container') ?? null,
    floatingRef: popoverRef,
    open: mounted,
    placement: 'bottom-start',
    offset: 4,
  })
  const minDate = parseISODate(min)
  const maxDate = parseISODate(max)

  useEffect(() => {
    const d = parseISODate(value)
    setText(d ? formatPattern(d, pattern) : '')
    setInvalid(null)
  }, [value, pattern])

  useLayer(open, {
    onEscape: () => {
      setOpen(false)
      inputRef.current?.focus()
    },
    onOutsidePointerDown: () => setOpen(false),
    refs: [popoverRef, fieldRef],
  })

  const commitText = (t: string) => {
    if (t.trim() === '') {
      setInvalid(null)
      if (value) onChange?.(null)
      return
    }
    const d = parsePattern(t, pattern)
    if (!d) {
      setInvalid(messages.invalidDate)
      return
    }
    if (
      (minDate && compareDates(d, minDate) < 0) ||
      (maxDate && compareDates(d, maxDate) > 0) ||
      isDateDisabled?.(toISODate(d))
    ) {
      setInvalid(messages.dateOutOfRange)
      return
    }
    setInvalid(null)
    setText(formatPattern(d, pattern))
    if (toISODate(d) !== value) onChange?.(toISODate(d))
  }

  return (
    <div
      ref={fieldRef}
      className={cx('m3-date-field', className)}
      data-full-width={fullWidth ? '' : undefined}
    >
      <TextField
        ref={inputRef}
        variant={variant}
        label={label}
        value={text}
        placeholder={pattern.placeholder}
        supportingText={supportingText ?? pattern.placeholder}
        error={error || !!invalid}
        errorText={invalid ?? errorText}
        disabled={disabled}
        required={required}
        inputMode="numeric"
        fullWidth={fullWidth}
        onValueChange={setText}
        onBlur={(e) => commitText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value)
          if (e.key === 'ArrowDown' && e.altKey) setOpen(true)
        }}
        trailingIcon={
          <IconButton
            icon="calendar_today"
            label={messages.selectDate}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popoverId : undefined}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
          />
        }
      />
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      {mounted && (
        <Portal>
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={messages.selectDate}
            className="m3-date-popover"
            data-state={state}
            style={position.style}
          >
            <CalendarView
              mode="single"
              start={selected}
              end={null}
              min={minDate}
              max={maxDate}
              isDateDisabled={isDateDisabled}
              variant="docked"
              autoFocus
              onSelect={(d) => {
                onChange?.(toISODate(d))
                setText(formatPattern(d, pattern))
                setInvalid(null)
                setOpen(false)
                inputRef.current?.focus()
              }}
            />
          </div>
        </Portal>
      )}
    </div>
  )
}

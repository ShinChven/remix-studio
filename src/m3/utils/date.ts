/**
 * Calendar dates without time zones. Values are ISO strings (`YYYY-MM-DD`) so a date picked in
 * one time zone is the same date everywhere.
 */
export interface PlainDate {
  year: number
  /** 1–12 */
  month: number
  day: number
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isValidDate(d: PlainDate): boolean {
  return (
    Number.isInteger(d.year) &&
    d.year >= 1 &&
    d.year <= 9999 &&
    d.month >= 1 &&
    d.month <= 12 &&
    d.day >= 1 &&
    d.day <= daysInMonth(d.year, d.month)
  )
}

export function parseISODate(value: string | null | undefined): PlainDate | null {
  if (!value) return null
  const m = ISO.exec(value)
  if (!m) return null
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return isValidDate(d) ? d : null
}

export function toISODate(d: PlainDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

export function compareDates(a: PlainDate, b: PlainDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

export function sameDate(a: PlainDate | null, b: PlainDate | null): boolean {
  return !!a && !!b && compareDates(a, b) === 0
}

function toUTC(d: PlainDate): Date {
  const date = new Date(Date.UTC(2000, d.month - 1, d.day))
  date.setUTCFullYear(d.year)
  return date
}

function fromUTC(date: Date): PlainDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function addDays(d: PlainDate, days: number): PlainDate {
  const date = toUTC(d)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUTC(date)
}

/** Adds months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: PlainDate, months: number): PlainDate {
  const index = d.year * 12 + (d.month - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) }
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(d: PlainDate): number {
  return toUTC(d).getUTCDay()
}

export function todayDate(): PlainDate {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

export function clampDate(d: PlainDate, min: PlainDate | null, max: PlainDate | null): PlainDate {
  if (min && compareDates(d, min) < 0) return min
  if (max && compareDates(d, max) > 0) return max
  return d
}

/** Weeks of the month as rows of 7 cells (null outside the month). */
export function monthGrid(
  year: number,
  month: number,
  firstDayOfWeek: number,
): (PlainDate | null)[][] {
  const first = { year, month, day: 1 }
  const offset = (dayOfWeek(first) - firstDayOfWeek + 7) % 7
  const total = daysInMonth(year, month)
  const cells: (PlainDate | null)[] = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= total; day++) cells.push({ year, month, day })
  while (cells.length % 7) cells.push(null)
  const rows: (PlainDate | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

export function formatDate(
  d: PlainDate,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(toUTC(d))
}

/** Short weekday names starting at `firstDayOfWeek`. */
export function weekdayNames(
  locale: string,
  firstDayOfWeek: number,
  style: 'narrow' | 'short' | 'long',
): string[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    formatDate({ year: 2023, month: 1, day: 1 + ((firstDayOfWeek + i) % 7) }, locale, {
      weekday: style,
    }),
  )
}

export type DatePart = 'year' | 'month' | 'day'

export interface DatePattern {
  order: DatePart[]
  separator: string
  /** Placeholder such as `MM/DD/YYYY` or `YYYY/MM/DD`. */
  placeholder: string
}

/** The numeric date pattern of a locale, used by date text inputs. */
export function datePattern(locale: string): DatePattern {
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(new Date(Date.UTC(2001, 10, 22)))
  const order: DatePart[] = []
  let separator = '/'
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') order.push(part.type)
    else if (part.type === 'literal' && order.length === 1)
      separator = part.value.trim() || part.value
  }
  const tokens = { year: 'YYYY', month: 'MM', day: 'DD' }
  if (order.length !== 3)
    return { order: ['month', 'day', 'year'], separator: '/', placeholder: 'MM/DD/YYYY' }
  return { order, separator, placeholder: order.map((p) => tokens[p]).join(separator) }
}

export function formatPattern(d: PlainDate, pattern: DatePattern): string {
  const values = {
    year: String(d.year).padStart(4, '0'),
    month: String(d.month).padStart(2, '0'),
    day: String(d.day).padStart(2, '0'),
  }
  return pattern.order.map((p) => values[p]).join(pattern.separator)
}

/** Parses digits typed in the locale's order; accepts any separator. */
export function parsePattern(text: string, pattern: DatePattern): PlainDate | null {
  const numbers = text.trim().split(/\D+/).filter(Boolean)
  if (numbers.length !== 3) return null
  const out: Partial<PlainDate> = {}
  pattern.order.forEach((part, i) => {
    out[part] = Number(numbers[i])
  })
  const d = out as PlainDate
  if (String(numbers[pattern.order.indexOf('year')]).length !== 4) return null
  return isValidDate(d) ? d : null
}

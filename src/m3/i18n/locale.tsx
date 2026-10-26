import { createContext, type ReactNode, useContext, useMemo } from 'react'

/** Built-in strings used by the components. They are English; apps can replace any of them. */
export interface M3Messages {
  /** Close buttons of dialogs, sheets and snackbars. */
  close: string
  /** Cancel button of the date and time pickers. */
  cancel: string
  /** Confirm button of the date and time pickers. */
  ok: string
  /** Clear buttons of text fields and search, and of the data table selection. */
  clear: string
  /** Back buttons of the search view and side sheets. */
  back: string
  /** Accessible name of search fields. */
  search: string
  /** Accessible name of loading indicators. */
  loading: string
  /** Shown when a search or a data table has no results. */
  noResults: string
  /** Accessible name of the bottom sheet drag handle. */
  dismiss: string
  /** Remove button of an input chip; receives the chip label. */
  remove: (label: string) => string
  /** Button that shows a password field value. */
  showPassword: string
  /** Button that hides a password field value. */
  hidePassword: string
  /** Button that expands a collapsed group. */
  expand: string
  /** Button that collapses an expanded group. */
  collapse: string
  /** Menu button that expands the navigation rail (or opens the modal rail). */
  openNavigation: string
  /** Menu button that collapses the expanded navigation rail. */
  closeNavigation: string
  // Date picker
  /** Title of the date picker, and the name of the button that opens it. */
  selectDate: string
  /** Title of the date range picker. */
  selectDateRange: string
  /** Title of the date picker in text input mode. */
  enterDate: string
  /** Title of the date range picker in text input mode. */
  enterDateRange: string
  /** Button that switches a date picker to the calendar. */
  switchToCalendar: string
  /** Button that switches a date picker to text input. */
  switchToInput: string
  /** Button that shows the previous month. */
  previousMonth: string
  /** Button that shows the next month. */
  nextMonth: string
  /** Button that opens the year list of the calendar. */
  selectYear: string
  /** Label of the start date field of a date range. */
  startDate: string
  /** Label of the end date field of a date range. */
  endDate: string
  /** Error when typed text is not a valid date. */
  invalidDate: string
  /** Error when a typed date is outside `min` and `max`. */
  dateOutOfRange: string
  /** Error when the end of a date range is before its start. */
  endBeforeStart: string
  // Time picker
  /** Title of the time picker. */
  selectTime: string
  /** Title of the time picker in keyboard input mode. */
  enterTime: string
  /** Button that switches the time picker to the clock dial. */
  switchToClock: string
  /** Button that switches the time picker to keyboard input. */
  switchToKeyboard: string
  /** Label of the hour field and clock dial. */
  hour: string
  /** Label of the minute field and clock dial. */
  minute: string
  /** Morning period of a 12-hour clock. */
  am: string
  /** Afternoon period of a 12-hour clock. */
  pm: string
  // Data table / tree
  /** Label of the data table page size menu. */
  rowsPerPage: string
  /** Data table button that shows the previous page. */
  previousPage: string
  /** Data table button that shows the next page. */
  nextPage: string
  /** Checkbox that selects every row on the page. */
  selectAll: string
  /** Checkbox that selects one row. */
  selectRow: string
  /** Number of selected rows, shown in the data table toolbar. */
  selectedCount: (count: number) => string
  /** Header and accessible label for row action buttons in data tables. */
  actions: string
  /** Tree view button that loads more children. */
  loadMore: string
  /** Button that tries a failed load again. */
  retry: string
  /** Announcement when a tree item could not be moved; receives the item label. */
  moveFailed: (label: string) => string
  /** Announcement after a tree item moves; receives the item label and the target. */
  moved: (label: string, target: string) => string
  // Carousel
  /** Carousel button that shows the previous item. */
  previousItem: string
  /** Carousel button that shows the next item. */
  nextItem: string
}

/** Built-in English messages. */
export const enUS: M3Messages = {
  close: 'Close',
  cancel: 'Cancel',
  ok: 'OK',
  clear: 'Clear',
  back: 'Back',
  search: 'Search',
  loading: 'Loading',
  noResults: 'No results',
  dismiss: 'Dismiss',
  remove: (label) => `Remove ${label}`,
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  expand: 'Expand',
  collapse: 'Collapse',
  openNavigation: 'Open navigation',
  closeNavigation: 'Close navigation',
  selectDate: 'Select date',
  selectDateRange: 'Select dates',
  enterDate: 'Enter date',
  enterDateRange: 'Enter dates',
  switchToCalendar: 'Switch to calendar',
  switchToInput: 'Switch to text input',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  selectYear: 'Select year',
  startDate: 'Start date',
  endDate: 'End date',
  invalidDate: 'Invalid date',
  dateOutOfRange: 'Date is out of range',
  endBeforeStart: 'End date is before the start date',
  selectTime: 'Select time',
  enterTime: 'Enter time',
  switchToClock: 'Switch to clock',
  switchToKeyboard: 'Switch to keyboard input',
  hour: 'Hour',
  minute: 'Minute',
  am: 'AM',
  pm: 'PM',
  rowsPerPage: 'Rows per page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  selectAll: 'Select all rows',
  selectRow: 'Select row',
  selectedCount: (count) => `${count} selected`,
  loadMore: 'Load more',
  actions: 'Actions',
  retry: 'Try again',
  moveFailed: (label) => `Could not move ${label}`,
  moved: (label, target) => `Moved ${label} ${target}`,
  previousItem: 'Previous',
  nextItem: 'Next',
}

/** The language and formatting conventions that components read. */
export interface M3Locale {
  /** BCP 47 locale tag used for `Intl` formatting. */
  locale: string
  /** Built-in English strings, with any overrides applied. */
  messages: M3Messages
  /** First day of the week: 0 = Sunday … 6 = Saturday. */
  firstDayOfWeek: number
  /** Whether times use a 12-hour clock. */
  hour12: boolean
}

function weekStart(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    if (info) return info.firstDay % 7
  } catch {
    // Fall through to the region table below.
  }
  const region = locale.split('-')[1]?.toUpperCase()
  return region &&
    ['US', 'CA', 'JP', 'BR', 'MX', 'IL', 'IN', 'PH', 'KR', 'TW', 'HK'].includes(region)
    ? 0
    : 1
}

function uses12Hour(locale: string): boolean {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  } catch {
    return false
  }
}

/**
 * Builds a locale object: the English messages with any overrides, plus the first day of the
 * week and the clock style that `Intl` gives for the locale.
 */
export function createLocale(locale: string, overrides?: Partial<M3Messages>): M3Locale {
  return {
    locale,
    messages: { ...enUS, ...overrides },
    firstDayOfWeek: weekStart(locale),
    hour12: uses12Hour(locale),
  }
}

const defaultLocale = createLocale('en-US')
const LocaleContext = createContext<M3Locale>(defaultLocale)

export interface M3LocaleProviderProps {
  /** BCP 47 locale tag, e.g. `en-US` or `en-GB`. Sets how dates, times and numbers are formatted. */
  locale: string
  /** Strings that replace the built-in English ones, for example your own wording. */
  messages?: Partial<M3Messages>
  /** First day of the week: 0 = Sunday … 6 = Saturday. Defaults to the locale convention. */
  firstDayOfWeek?: number
  /** Use a 12-hour clock. Defaults to the locale convention. */
  hour12?: boolean
  /** The part of the app that uses this locale. */
  children: ReactNode
}

/** Sets the regional formats (and any replaced strings) for every M3 component below it. */
export function M3LocaleProvider({
  locale,
  messages,
  firstDayOfWeek,
  hour12,
  children,
}: M3LocaleProviderProps) {
  const value = useMemo(() => {
    const base = createLocale(locale, messages)
    return {
      ...base,
      firstDayOfWeek: firstDayOfWeek ?? base.firstDayOfWeek,
      hour12: hour12 ?? base.hour12,
    }
  }, [locale, messages, firstDayOfWeek, hour12])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/** Reads the locale that applies at this point of the tree (en-US outside any provider). */
export function useM3Locale(): M3Locale {
  return useContext(LocaleContext)
}

/**
 * Dates in the current year are rendered without it to keep labels short; anything
 * outside it keeps the year so ranges crossing a year boundary stay unambiguous.
 */
export function shouldShowYear(...dates: (Date | null | undefined)[]): boolean {
  const currentYear = new Date().getFullYear();
  return dates.some((date) => !!date && date.getFullYear() !== currentYear);
}

/** "Mar 3, 10:00 AM", or "Mar 3, 2027, 10:00 AM" when the year matters. */
export function formatDateTime(date: Date, showYear = shouldShowYear(date)): string {
  return date.toLocaleString(undefined, {
    ...(showYear ? { year: 'numeric' as const } : {}),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Mar 3", or "Mar 3, 2027" when the year matters. */
export function formatShortDate(date: Date, showYear = shouldShowYear(date)): string {
  return date.toLocaleDateString(undefined, {
    ...(showYear ? { year: 'numeric' as const } : {}),
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Clock time for today, a short date otherwise. For activity feeds, where a bare
 * "10:04 AM" on a months-old entry reads as if it just happened.
 */
export function formatTimeOrDate(date: Date): string {
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : formatShortDate(date);
}

import type { Tone } from '../ui/Stat';

/** A post status as people read it. */
export function postStatusLabel(status: string) {
  if (status === 'completed') return 'Posted';
  if (status === 'queued') return 'Queued';
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

/** The tone a post status is shown in. */
export function postStatusTone(status: string): Tone {
  if (status === 'draft') return 'neutral';
  if (status === 'scheduled') return 'warning';
  if (status === 'queued' || status === 'processing') return 'primary';
  if (status === 'completed') return 'success';
  return 'error';
}

/** `YYYY-MM-DDTHH:mm` in local time, for a datetime-local field. */
export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

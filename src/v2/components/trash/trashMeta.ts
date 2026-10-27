import type { TrashItem } from '../../../types';

export type TrashKind = 'image' | 'video' | 'audio' | 'text';
export const TRASH_KINDS: TrashKind[] = ['image', 'video', 'audio', 'text'];

export type TrashSort = 'recent' | 'oldest' | 'largest' | 'project';
export const TRASH_SORTS: Record<TrashSort, { icon: string }> = {
  recent: { icon: 'south' },
  oldest: { icon: 'north' },
  largest: { icon: 'hard_drive' },
  project: { icon: 'folder' },
};

const AUDIO_FORMATS = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg']);

/** What a deleted item holds, read from the item itself: its project may be gone. */
export function trashKind(item: TrashItem): TrashKind {
  if (!item.imageUrl) return 'text';
  if (item.format === 'mp4' || item.civitaiParams?.mediaType === 'video') return 'video';
  if (item.format && AUDIO_FORMATS.has(item.format)) return 'audio';
  // WebM holds either; only videos get a poster or a resolution.
  if (item.format === 'webm') return item.thumbnailUrl || item.resolution ? 'video' : 'audio';
  return 'image';
}

/** The item's own file name, or its id. */
export function trashFilename(item: TrashItem): string {
  const path = (item.imageUrl || '').split('?')[0];
  return decodeURIComponent(path.split('/').pop() || '') || item.id;
}

/** What to call an item: its file for media, the start of its first line for text. */
export function trashTitle(item: TrashItem): string {
  if (trashKind(item) !== 'text') return trashFilename(item);
  const line = (item.textContent || item.prompt || item.id).trim().split('\n')[0].replace(/^[#>*\s-]+/, '');
  return line.length > 72 ? `${line.slice(0, 71).trimEnd()}…` : line;
}

/** Bytes an item takes, with its optimized copy and thumbnail. */
export function trashBytes(item: TrashItem): number {
  return (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
}

/** “3 days ago”, in the reader's language. */
export function timeAgo(ts: number, lang: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const seconds = (ts - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  if (abs < 30 * 86400) return rtf.format(Math.round(seconds / (7 * 86400)), 'week');
  if (abs < 365 * 86400) return rtf.format(Math.round(seconds / (30 * 86400)), 'month');
  return rtf.format(Math.round(seconds / (365 * 86400)), 'year');
}

const startOfDay = (ts: number) => {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Today, Yesterday, a weekday this week, or the date. */
export function dayLabel(ts: number, lang: string, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (days <= 1) {
    const label = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-days, 'day');
    return label.charAt(0).toLocaleUpperCase(lang) + label.slice(1);
  }
  const date = new Date(ts);
  if (days < 7) return date.toLocaleDateString(lang, { weekday: 'long' });
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(lang, { weekday: 'short', month: 'long', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

export function sortItems(items: TrashItem[], sort: TrashSort, lang: string): TrashItem[] {
  const sorted = [...items];
  if (sort === 'oldest') sorted.sort((a, b) => a.deletedAt - b.deletedAt);
  else if (sort === 'largest') sorted.sort((a, b) => trashBytes(b) - trashBytes(a) || b.deletedAt - a.deletedAt);
  else if (sort === 'project') sorted.sort((a, b) => a.projectName.localeCompare(b.projectName, lang) || a.projectId.localeCompare(b.projectId) || b.deletedAt - a.deletedAt);
  else sorted.sort((a, b) => b.deletedAt - a.deletedAt);
  return sorted;
}

export interface TrashGroup {
  key: string;
  /** Empty when the list is not grouped. */
  label: string;
  items: TrashItem[];
  bytes: number;
  /** For project groups: the project is gone. */
  orphaned?: boolean;
}

/** Already sorted items, in runs: by the day they were deleted, or by project; one run when sorted by size. */
export function groupItems(items: TrashItem[], sort: TrashSort, lang: string): TrashGroup[] {
  const groups: TrashGroup[] = [];
  for (const item of items) {
    const key = sort === 'largest' ? 'all' : sort === 'project' ? `p:${item.projectId}` : `d:${startOfDay(item.deletedAt)}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: sort === 'largest' ? '' : sort === 'project' ? item.projectName : dayLabel(item.deletedAt, lang),
        items: [],
        bytes: 0,
        orphaned: sort === 'project' ? item.projectExists === false : undefined,
      };
      groups.push(group);
    }
    group.items.push(item);
    group.bytes += trashBytes(item);
  }
  return groups;
}

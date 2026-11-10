import type { AlbumItem } from '../../types';

const URL_FIELDS = ['imageUrl', 'thumbnailUrl', 'optimizedUrl'] as const;
// A kept URL must stay valid for a while yet, or the page would show a broken image later.
const MIN_REMAINING_MS = 10 * 60 * 1000;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** When a presigned URL stops working, or null if it is not one. */
function expiresAt(url: URL): number | null {
  const date = url.searchParams.get('X-Amz-Date');
  const seconds = Number(url.searchParams.get('X-Amz-Expires'));
  if (!date || !seconds) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + seconds * 1000;
}

/** The current URL when it names the same object and is still good, otherwise the fresh one. */
function keep(current: string | undefined, fresh: string | undefined): string | undefined {
  if (!current || !fresh || current === fresh) return fresh;
  const a = parse(current);
  const b = parse(fresh);
  if (!a || !b || a.origin !== b.origin || a.pathname !== b.pathname) return fresh;
  const expiry = expiresAt(a);
  if (expiry === null || expiry - Date.now() < MIN_REMAINING_MS) return fresh;
  return current;
}

/**
 * Every album fetch signs its URLs anew, so the same image arrives under a new address and the
 * browser loads it again. Keep the URLs already on screen for items whose files have not changed,
 * so a refresh only touches the items that did, and reuse the item objects that are unchanged.
 */
export function withStableAlbumUrls(current: AlbumItem[], fresh: AlbumItem[]): AlbumItem[] {
  if (current.length === 0) return fresh;
  const byId = new Map(current.map((item) => [item.id, item]));
  return fresh.map((item) => {
    const prev = byId.get(item.id);
    if (!prev) return item;
    const next = { ...item };
    for (const field of URL_FIELDS) next[field] = keep(prev[field], item[field]) as string;
    return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
  });
}

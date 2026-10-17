export type AlbumPageSize = number | 'all';

export const DEFAULT_ALBUM_PAGE_SIZE = 500;

const STORAGE_PREFIX = 'album_page_size:';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

/** Parses `'all'` or a positive whole number; anything else is `null`. */
export function parseAlbumPageSize(raw: string | null): AlbumPageSize | null {
  if (raw === 'all') return 'all';
  const size = Math.floor(Number(raw));
  return size > 0 ? size : null;
}

/** The album page size last picked for a project in this browser. */
export function getRememberedAlbumPageSize(projectId: string): AlbumPageSize {
  if (!canUseStorage() || !projectId) return DEFAULT_ALBUM_PAGE_SIZE;
  try {
    return parseAlbumPageSize(window.localStorage.getItem(storageKey(projectId))) ?? DEFAULT_ALBUM_PAGE_SIZE;
  } catch {
    return DEFAULT_ALBUM_PAGE_SIZE;
  }
}

export function rememberAlbumPageSize(projectId: string, size: AlbumPageSize) {
  if (!canUseStorage() || !projectId) return;
  try {
    if (size === DEFAULT_ALBUM_PAGE_SIZE) window.localStorage.removeItem(storageKey(projectId));
    else window.localStorage.setItem(storageKey(projectId), String(size));
  } catch {
    // Ignore quota or privacy-mode failures; remembering the page size is best effort.
  }
}

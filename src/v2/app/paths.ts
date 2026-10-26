/** Base path the new UI is served under; its router uses it as the basename. */
export const V2_BASE = '/v2';

/** localStorage key that makes visits to classic paths open in the new UI. */
export const UI_PREFERENCE_KEY = 'ui-version';

/** Strips the `/v2` prefix from a path, e.g. a `next` parameter that already carries it. */
export function stripBase(path: string): string {
  if (path === V2_BASE) return '/';
  return path.startsWith(`${V2_BASE}/`) ? path.slice(V2_BASE.length) : path;
}

/** Full browser path of an in-app route, for `window.location` and links outside the router. */
export function withBase(path: string): string {
  return `${V2_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function setPreferNewUi(prefer: boolean) {
  try {
    if (prefer) localStorage.setItem(UI_PREFERENCE_KEY, 'v2');
    else localStorage.removeItem(UI_PREFERENCE_KEY);
  } catch {
    // Without storage the choice only lasts for this visit.
  }
}

export function prefersNewUi(): boolean {
  try {
    return localStorage.getItem(UI_PREFERENCE_KEY) === 'v2';
  } catch {
    return false;
  }
}

/** Leaves the new UI for the same page in the classic UI. */
export function openClassicUi() {
  setPreferNewUi(false);
  const { pathname, search, hash } = window.location;
  window.location.href = `${stripBase(pathname)}${search}${hash}`;
}

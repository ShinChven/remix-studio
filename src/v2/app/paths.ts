/** Base path the app was served under while it ran beside the older interface. */
const LEGACY_BASE = '/v2';

/** Strips the old `/v2` prefix from a path, e.g. a bookmark or a `next` parameter that carries it. */
export function stripLegacyBase(path: string): string {
  if (path === LEGACY_BASE) return '/';
  return path.startsWith(`${LEGACY_BASE}/`) ? path.slice(LEGACY_BASE.length) : path;
}

/**
 * Entry point. The classic UI and the Material 3 Expressive UI (under `/v2`) are separate apps
 * that share the API layer; only the one being visited is loaded, along with its own styles.
 */
const V2_BASE = '/v2';
const UI_PREFERENCE_KEY = 'ui-version';

const { pathname, search, hash } = window.location;
const isV2 = pathname === V2_BASE || pathname.startsWith(`${V2_BASE}/`);

let preferV2 = false;
try {
  preferV2 = localStorage.getItem(UI_PREFERENCE_KEY) === 'v2';
} catch {
  // Storage can be blocked; the classic UI stays the default.
}

if (!isV2 && preferV2) {
  // Links into the app (OAuth callbacks, share targets, bookmarks) keep their path in the new UI.
  window.location.replace(`${V2_BASE}${pathname === '/' ? '' : pathname}${search}${hash}`);
} else if (isV2) {
  void import('./v2/main');
} else {
  void import('./classic');
}

/**
 * Entry point. The app used to be served under `/v2` beside an older interface; links and
 * bookmarks into `/v2/...` now open the same page at the root.
 */
import { stripLegacyBase } from './v2/app/paths';

const { pathname, search, hash } = window.location;
const path = stripLegacyBase(pathname);
if (path !== pathname) window.history.replaceState(window.history.state, '', `${path}${search}${hash}`);

try {
  // Chose between the two interfaces; nothing reads it any more.
  localStorage.removeItem('ui-version');
} catch {
  // Storage can be blocked.
}

void import('./v2/styles/load');
void import('./v2/main');

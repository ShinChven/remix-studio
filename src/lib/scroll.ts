/**
 * Scroll helpers for list views.
 *
 * Pages are not scrolled by the window in this app: `MainLayout` puts the routed
 * content inside its own `overflow-y-auto` pane, and some views (project tabs,
 * chat history) add another scroller of their own. So "back to top" means the
 * nearest scrollable ancestor of the control that was clicked, with the window
 * as the fallback.
 */

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The closest ancestor that actually scrolls vertically, or null when none does. */
function findScrollableAncestor(from: HTMLElement | null): HTMLElement | null {
  let el = from?.parentElement ?? null;
  while (el && el !== document.body && el !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(el);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    // A wrapper that only scrolls sideways (overflow-x-auto tables) computes an
    // 'auto' overflow-y too, so check that there is vertical overflow as well.
    if (scrolls && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Scroll the list `element` sits in back to the top, so a new page of results
 * starts at its first row instead of wherever the pager was clicked.
 */
export function scrollListToTop(element: HTMLElement | null): void {
  if (typeof window === 'undefined') return;
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const scroller = findScrollableAncestor(element);
  if (scroller) scroller.scrollTo({ top: 0, behavior });
  else window.scrollTo({ top: 0, behavior });
}

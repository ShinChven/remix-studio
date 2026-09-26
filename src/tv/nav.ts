/**
 * Remote-control navigation. TV browsers have no reliable focus ring or
 * spatial navigation, so focus is tracked here: elements marked
 * `data-focus` can take it, arrow keys move it to the nearest one in that
 * direction, and grids (`data-grid` containers) move by row and column.
 */

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'ok' | 'back'
  | 'play' | 'pause' | 'playpause' | 'stop'
  | 'next' | 'prev' | 'pageup' | 'pagedown'
  | 'info';

/** Key codes from LG webOS, Samsung Tizen, Android TV and desktop keyboards. */
const KEY_CODES: Record<number, Action> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  13: 'ok', 32: 'playpause',
  8: 'back', 27: 'back', 461: 'back', 10009: 'back', 166: 'back',
  415: 'play', 19: 'pause', 10252: 'playpause', 179: 'playpause', 413: 'stop', 178: 'stop',
  417: 'next', 412: 'prev', 228: 'next', 227: 'prev', 176: 'next', 177: 'prev',
  33: 'pageup', 34: 'pagedown', 427: 'pageup', 428: 'pagedown',
  457: 'info', 73: 'info',
};

const KEY_NAMES: Record<string, Action> = {
  ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down',
  Enter: 'ok', Escape: 'back', Backspace: 'back', GoBack: 'back', BrowserBack: 'back',
  MediaPlay: 'play', MediaPause: 'pause', MediaPlayPause: 'playpause', MediaStop: 'stop',
  MediaTrackNext: 'next', MediaTrackPrevious: 'prev', MediaFastForward: 'next', MediaRewind: 'prev',
  PageUp: 'pageup', PageDown: 'pagedown', ChannelUp: 'pageup', ChannelDown: 'pagedown', Info: 'info',
};

export function actionFor(event: KeyboardEvent): Action | null {
  if (event.key && KEY_NAMES[event.key]) return KEY_NAMES[event.key];
  return KEY_CODES[event.keyCode] || null;
}

interface Rect { left: number; top: number; right: number; bottom: number; cx: number; cy: number }

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
}

function isVisible(el: HTMLElement): boolean {
  return el.offsetWidth > 0 || el.offsetHeight > 0;
}

export class FocusManager {
  current: HTMLElement | null = null;
  private root: HTMLElement | null = null;

  setRoot(root: HTMLElement) {
    this.root = root;
    this.current = null;
  }

  focusables(): HTMLElement[] {
    if (!this.root) return [];
    const list = this.root.querySelectorAll<HTMLElement>('[data-focus]');
    const result: HTMLElement[] = [];
    for (let i = 0; i < list.length; i++) if (isVisible(list[i])) result.push(list[i]);
    return result;
  }

  focus(el: HTMLElement | null, scroll = true) {
    if (!el) return;
    if (this.current && this.current !== el) this.current.classList.remove('is-focused');
    this.current = el;
    el.classList.add('is-focused');
    if (scroll) scrollIntoViewIfNeeded(el);
    const onFocus = (el as HTMLElement & { onTvFocus?: () => void }).onTvFocus;
    if (onFocus) onFocus();
  }

  /** Focuses the first element matching the selector, else the first focusable. */
  focusFirst(selector?: string) {
    const preferred = selector && this.root ? this.root.querySelector<HTMLElement>(selector) : null;
    this.focus(preferred && isVisible(preferred) ? preferred : this.focusables()[0] || null);
  }

  /** Keeps focus valid after a re-render replaced the focused element. */
  ensure() {
    if (!this.current || !this.root || !this.root.contains(this.current)) this.focusFirst();
  }

  move(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    const from = this.current;
    if (!from) {
      this.focusFirst();
      return true;
    }
    const grid = from.parentElement && from.parentElement.hasAttribute('data-grid') ? from.parentElement : null;
    if (grid) {
      const target = gridNeighbor(grid, from, direction);
      if (target === 'stay') return false;
      if (target) {
        this.focus(target);
        return true;
      }
    }
    const next = this.nearest(from, direction, grid);
    if (next) {
      this.focus(next);
      return true;
    }
    return false;
  }

  private nearest(from: HTMLElement, direction: string, excludeGrid: Element | null): HTMLElement | null {
    const a = rectOf(from);
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of this.focusables()) {
      if (el === from || (excludeGrid && el.parentElement === excludeGrid)) continue;
      const b = rectOf(el);
      let primary: number;
      let overlap: boolean;
      if (direction === 'right') {
        if (b.cx <= a.cx) continue;
        primary = b.left - a.right;
        overlap = b.top < a.bottom && b.bottom > a.top;
      } else if (direction === 'left') {
        if (b.cx >= a.cx) continue;
        primary = a.left - b.right;
        overlap = b.top < a.bottom && b.bottom > a.top;
      } else if (direction === 'down') {
        if (b.cy <= a.cy + 1) continue;
        primary = b.top - a.bottom;
        overlap = b.left < a.right && b.right > a.left;
      } else {
        if (b.cy >= a.cy - 1) continue;
        primary = a.top - b.bottom;
        overlap = b.left < a.right && b.right > a.left;
      }
      const horizontal = direction === 'left' || direction === 'right';
      // Left and right stay on the same row: never jump up to a toolbar.
      if (horizontal && !overlap) continue;
      const secondary = horizontal ? Math.abs(b.cy - a.cy) : Math.abs(b.cx - a.cx);
      // Prefer targets in line with the current one; distance breaks ties.
      const score = Math.max(0, primary) + (overlap ? 0 : 1000 + secondary * 2) + secondary * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }
}

function columnsOf(grid: Element): number {
  const children = grid.children;
  if (children.length === 0) return 1;
  const top = (children[0] as HTMLElement).offsetTop;
  let cols = 0;
  for (let i = 0; i < children.length; i++) {
    if ((children[i] as HTMLElement).offsetTop !== top) break;
    cols++;
  }
  return Math.max(1, cols);
}

/** Row/column moves inside a grid; null leaves the grid, 'stay' blocks the move. */
function gridNeighbor(grid: Element, from: HTMLElement, direction: string): HTMLElement | null | 'stay' {
  const items = grid.children;
  const count = items.length;
  let index = -1;
  for (let i = 0; i < count; i++) if (items[i] === from) index = i;
  if (index < 0) return null;
  const cols = columnsOf(grid);
  const col = index % cols;
  if (direction === 'left') return col === 0 ? null : (items[index - 1] as HTMLElement);
  if (direction === 'right') {
    if (col === cols - 1) return null;
    return index + 1 < count ? (items[index + 1] as HTMLElement) : 'stay';
  }
  if (direction === 'up') return index - cols >= 0 ? (items[index - cols] as HTMLElement) : null;
  // Down: the item below, or the last item when the last row is shorter.
  if (index + cols < count) return items[index + cols] as HTMLElement;
  const lastRowStart = count - (count % cols || cols);
  if (index < lastRowStart) return items[count - 1] as HTMLElement;
  return null;
}

/** Scrolls the nearest scrollable ancestor so the element sits comfortably in view. */
export function scrollIntoViewIfNeeded(el: HTMLElement) {
  let container: HTMLElement | null = el.parentElement;
  while (container && !container.hasAttribute('data-scroll')) container = container.parentElement;
  if (!container) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const margin = Math.min(160, c.height / 4);
  if (r.top < c.top + margin) container.scrollTop -= c.top + margin - r.top;
  else if (r.bottom > c.bottom - margin) container.scrollTop += r.bottom - (c.bottom - margin);
}

import { useEffect, useRef } from 'react';
import { LIVE_CLIENT_ID, subscribeLive, type LiveResourceEvent } from '../lib/live';

const DEBOUNCE_MS = 250;
// Events kept for one refresh; past this only the refetch itself matters.
const MAX_PENDING_EVENTS = 200;

interface LiveRefreshOptions {
  /** Stop listening while false. */
  enabled?: boolean;
  /** Minimum gap between two refreshes, so a burst of changes refetches once. */
  minIntervalMs?: number;
}

/**
 * Call `refresh` when the user's change feed reports a change `matches`
 * accepts, so the page picks up edits made in another tab, by the assistant
 * or by an MCP client without a reload.
 *
 * Changes caused by this tab's own requests are skipped (the page already
 * shows them). Bursts are folded into one call that receives every matching
 * event since the last one; it receives none after a reconnect, when changes
 * may have been missed. Hidden tabs wait until they are visible again.
 */
export function useLiveRefresh(
  matches: (event: LiveResourceEvent) => boolean,
  refresh: (events: LiveResourceEvent[]) => unknown,
  { enabled = true, minIntervalMs = 1_000 }: LiveRefreshOptions = {},
) {
  const matchesRef = useRef(matches);
  const refreshRef = useRef(refresh);
  matchesRef.current = matches;
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    let disposed = false;
    let timer: number | null = null;
    let dirty = false;
    let inFlight = false;
    let lastRunAt = 0;
    let pending: LiveResourceEvent[] = [];

    const schedule = () => {
      if (disposed || timer !== null) return;
      const delay = Math.max(DEBOUNCE_MS, lastRunAt + minIntervalMs - Date.now());
      timer = window.setTimeout(run, delay);
    };

    const run = async () => {
      timer = null;
      // Rescheduled when the tab becomes visible or the current run ends.
      if (disposed || inFlight || document.visibilityState === 'hidden') return;

      const events = pending;
      pending = [];
      dirty = false;
      inFlight = true;
      try {
        await refreshRef.current(events);
      } catch (error) {
        console.error('Live refresh failed:', error);
      } finally {
        inFlight = false;
        lastRunAt = Date.now();
        if (dirty) schedule();
      }
    };

    const unsubscribe = subscribeLive((message) => {
      if (message.type === 'resync') {
        dirty = true;
        schedule();
        return;
      }
      if (message.origin === LIVE_CLIENT_ID || !matchesRef.current(message)) return;
      if (pending.length < MAX_PENDING_EVENTS) pending.push(message);
      dirty = true;
      schedule();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && dirty) schedule();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, minIntervalMs]);
}

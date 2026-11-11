import { useEffect, useRef } from 'react';

/**
 * Calls `tick` every `intervalMs` while the tab is visible, never overlapping a call still in
 * flight, and once more as soon as a hidden tab returns. 0 or false stops it.
 */
export function usePolling(tick: () => unknown, intervalMs: number | false) {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!intervalMs) return;
    let disposed = false;
    let inFlight = false;
    const run = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        await tickRef.current();
      } catch (error) {
        console.error('Polling failed:', error);
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void run(), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
}

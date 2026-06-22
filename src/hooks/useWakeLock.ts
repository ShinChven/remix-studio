import { useEffect, useRef } from 'react';

/**
 * Holds a screen wake lock while `active` is true, keeping the display from
 * dimming or sleeping (e.g. during a hands-off slideshow).
 *
 * The browser releases a wake lock whenever the page becomes hidden — switching
 * tabs, minimizing, or the OS locking the screen — so this also re-acquires the
 * lock when the page returns to view while still active.
 *
 * Pass `maxDurationMs` to cap how long the lock is held: once that window
 * elapses (measured from when `active` last became true), the lock is released
 * and not re-acquired, so the screen returns to its normal idle behaviour even
 * if `active` is still true. The window resets each time `active` flips back on.
 *
 * No-ops gracefully where the API is unavailable (insecure context or older
 * browsers); the slideshow still runs, just without the wake guarantee.
 */
export function useWakeLock(active: boolean, maxDurationMs?: number) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let cancelled = false;
    let expiryTimer = 0;
    // Past this moment we stop holding (and re-acquiring) the lock.
    const deadline = maxDurationMs != null ? Date.now() + maxDurationMs : Infinity;

    const release = () => {
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };

    const acquire = async () => {
      // Only attempt while visible, before the deadline, and not already held;
      // the request rejects when the page isn't visible.
      if (cancelled || Date.now() >= deadline) return;
      if (document.visibilityState !== 'visible' || sentinelRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled || Date.now() >= deadline) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        // The sentinel fires 'release' when the system reclaims it (e.g. page
        // hidden); drop our reference so we know to re-acquire on return.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Request can reject if the page lost visibility or the user/OS denied
        // it; nothing to do but leave the screen to its normal idle behaviour.
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', handleVisibility);
    if (Number.isFinite(deadline)) {
      // Release once the cap is reached; visibilitychange won't re-acquire past
      // the deadline, so the lock stays released for the rest of this run.
      expiryTimer = window.setTimeout(release, deadline - Date.now());
    }

    return () => {
      cancelled = true;
      window.clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      release();
    };
  }, [active, maxDurationMs]);
}

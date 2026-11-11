import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import type { LiveResourceEvent } from '../../lib/live';
import { usePolling } from './usePolling';

export interface AsyncDataOptions<T> {
  /** Skip loading while false, e.g. until an id is known. */
  enabled?: boolean;
  /** Refetch quietly when the change feed reports a matching change. */
  live?: (event: LiveResourceEvent) => boolean;
  /** Refetch quietly on this interval; a function decides from the current data, and 0 or false stops. */
  pollMs?: number | false | ((data: T | undefined) => number | false);
  /** Shown data while the first load runs. */
  initial?: T;
  /** Called after each successful load. */
  onLoaded?: (data: T) => void;
}

export interface AsyncData<T> {
  data: T | undefined;
  /** The first load, or a reload after an error: nothing to show yet. */
  loading: boolean;
  /** A later load: the previous data stays on screen. */
  refreshing: boolean;
  /** Why the last load failed; previous data, if any, is kept. */
  error: Error | null;
  /** Load again. `quiet` keeps the current data on screen without a busy mark. */
  reload: (quiet?: boolean) => Promise<void>;
  /** Patch the data in place after a change the page made itself. */
  setData: Dispatch<SetStateAction<T | undefined>>;
}

/**
 * Loads data for the current `deps` and keeps only the newest answer: a slower earlier request
 * never overwrites a later one, and nothing is set after the page is left. Changing `deps` keeps
 * the previous data on screen while the next loads.
 */
export function useAsyncData<T>(load: () => Promise<T>, deps: readonly unknown[], { enabled = true, live, pollMs = false, initial, onLoaded }: AsyncDataOptions<T> = {}): AsyncData<T> {
  const [data, setData] = useState<T | undefined>(initial);
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const seq = useRef(0);
  const loaded = useRef(initial !== undefined);
  const loadRef = useRef(load);
  const onLoadedRef = useRef(onLoaded);
  loadRef.current = load;
  onLoadedRef.current = onLoaded;

  const run = useCallback(async (quiet = false) => {
    const current = ++seq.current;
    if (!quiet) setBusy(true);
    try {
      const result = await loadRef.current();
      if (current !== seq.current) return;
      loaded.current = true;
      setData(result);
      setError(null);
      onLoadedRef.current?.(result);
    } catch (cause) {
      if (current !== seq.current) return;
      console.error(cause);
      // A failed background refresh leaves what is on screen alone.
      if (!quiet || !loaded.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (current === seq.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setBusy(false);
      return;
    }
    void run();
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  useLiveRefresh(live ?? (() => false), () => run(true), { enabled: enabled && !!live });

  const interval = typeof pollMs === 'function' ? pollMs(data) : pollMs;
  usePolling(() => run(true), enabled ? interval : false);

  const hasData = data !== undefined;
  return { data, loading: busy && !hasData, refreshing: busy && hasData, error, reload: run, setData };
}

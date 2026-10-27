import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { updateProvider } from '../../../api';
import { useSnackbar } from '../../../m3';
import type { Provider } from '../../../types';

/** Long enough to settle on a number before it is saved. */
const SAVE_DELAY_MS = 700;

/**
 * Saves a provider's parallel-task count once the stepping stops, and anything still waiting when
 * the page goes away. `onFailed` runs after a failed save, e.g. to reload the true value.
 */
export function useParallelSaver(onFailed: () => void) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const pending = useRef(new Map<string, { timer: number; save: () => void }>());
  const failed = useRef(onFailed);
  failed.current = onFailed;

  useEffect(() => {
    const saves = pending.current;
    return () => {
      for (const { timer, save } of [...saves.values()]) {
        window.clearTimeout(timer);
        save();
      }
    };
  }, []);

  const schedule = useCallback(
    (provider: Provider, concurrency: number) => {
      const saves = pending.current;
      const waiting = saves.get(provider.id);
      if (waiting) window.clearTimeout(waiting.timer);
      const save = () => {
        saves.delete(provider.id);
        updateProvider(provider.id, { concurrency })
          .then(() => snackbar.show(t('v2.providers.parallelSaved', { name: provider.name, count: concurrency })))
          .catch((err: Error) => {
            snackbar.show(err.message || t('v2.providers.saveFailed'));
            failed.current();
          });
      };
      saves.set(provider.id, { timer: window.setTimeout(save, SAVE_DELAY_MS), save });
    },
    [snackbar, t],
  );

  /** Whether a count for this provider is still waiting to be saved. */
  const isPending = useCallback((id: string) => pending.current.has(id), []);

  return { schedule, isPending };
}

/** The number of tasks a provider may run at once, within what the server accepts. */
export function clampParallel(value: number): number {
  return Math.min(1000, Math.max(1, Math.round(value)));
}

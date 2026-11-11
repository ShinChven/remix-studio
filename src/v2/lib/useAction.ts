import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast, type ToastOptions } from '../ui/useToast';
import { errorText } from './errors';

export interface ActionOptions<T> {
  /** Marks what is busy, e.g. a row id, so only that row shows progress. Defaults to one shared mark. */
  key?: string;
  /** Notice shown when the work succeeds. */
  success?: string | ((result: T) => string);
  successOptions?: ToastOptions;
  /** Shown when the failure carries no message of its own. */
  error?: string;
  /** Pass the failure on after reporting it, so a dialog awaiting the work stays open. */
  rethrow?: boolean;
}

/**
 * Runs a change the person asked for: marks it busy, reports success or failure in a notice and
 * never runs the same key twice at once. Resolves to the result, or undefined when it failed.
 */
export function useAction() {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const running = useRef(new Set<string>());

  const run = useCallback(
    async <T,>(work: () => Promise<T>, { key = '', success, successOptions, error, rethrow }: ActionOptions<T> = {}): Promise<T | undefined> => {
      if (running.current.has(key)) return undefined;
      running.current.add(key);
      setBusy(new Set(running.current));
      try {
        const result = await work();
        if (success) toast.success(typeof success === 'function' ? success(result) : success, successOptions);
        return result;
      } catch (cause) {
        console.error(cause);
        toast.error(errorText(cause, error ?? t('v2.common.actionFailed')));
        if (rethrow) throw cause;
        return undefined;
      } finally {
        running.current.delete(key);
        setBusy(new Set(running.current));
      }
    },
    [t, toast],
  );

  const isBusy = useCallback((key = '') => busy.has(key), [busy]);
  return { run, isBusy, anyBusy: busy.size > 0 };
}

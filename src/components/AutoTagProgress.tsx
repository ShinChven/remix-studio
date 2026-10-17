import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, Loader2, RotateCcw, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { cancelAutoTag, fetchAutoTagStatus, retryAutoTag } from '../api';
import type { AutoTagRunStatus, AutoTagScope } from '../types';

const POLL_MS = 2_000;

interface AutoTagProgressProps {
  scope: AutoTagScope;
  /** Bumped by the page after it starts a run, so polling begins at once. */
  runKey: number;
  /** Extra classes for the bar, e.g. a full border where it stands on its own. */
  className?: string;
}

/**
 * Progress of the auto-tagging run in an album or library: a bar while items
 * are being tagged, and the failures with Retry and Dismiss once it ends.
 * Renders nothing when there is no run to show.
 */
export function AutoTagProgress({ scope, runKey, className = '' }: AutoTagProgressProps) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<AutoTagRunStatus | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const wasActiveRef = useRef(false);
  const scopeId = scope.kind === 'album' ? scope.projectId : scope.libraryId;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await fetchAutoTagStatus(scopeRef.current);
        if (cancelled) return;
        if (wasActiveRef.current && !next.active && next.failures.length === 0 && next.completed > 0) {
          toast.success(t('autoTag.finished', { count: next.completed }));
        }
        wasActiveRef.current = next.active;
        setStatus(next);
        if (next.active) timer = window.setTimeout(tick, POLL_MS);
      } catch {
        // A blip while a run is going should not freeze the bar; otherwise stay quiet.
        if (!cancelled && wasActiveRef.current) timer = window.setTimeout(tick, POLL_MS * 3);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scope.kind, scopeId, runKey, pollKey, t]);

  const errorSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const failure of status?.failures ?? []) counts.set(failure.error, (counts.get(failure.error) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [status]);

  if (!status || (!status.active && status.failures.length === 0)) return null;

  const failed = status.failures.length;
  const done = status.completed + failed;
  const percent = status.total > 0 ? Math.min(100, (done / status.total) * 100) : 0;

  const run = async (action: () => Promise<AutoTagRunStatus>, failureKey: string) => {
    setBusy(true);
    try {
      const next = await action();
      wasActiveRef.current = next.active;
      setStatus(next);
      setShowErrors(false);
      if (next.active) setPollKey((key) => key + 1);
    } catch (error: any) {
      toast.error(error?.message || t(failureKey));
    } finally {
      setBusy(false);
    }
  };

  if (status.active) {
    return (
      <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-violet-500/20 ${className} bg-violet-500/5 px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300`}>
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
        <span className="whitespace-nowrap">
          {t('autoTag.progress', { done, total: status.total })}
          {failed > 0 && <span className="text-amber-600 dark:text-amber-400"> · {t('autoTag.failedCount', { count: failed })}</span>}
        </span>
        <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-violet-500/15">
          <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
        <button
          type="button"
          onClick={() => void run(() => cancelAutoTag(scope), 'autoTag.stopFailed')}
          disabled={busy || status.pending === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-2.5 py-1 transition-colors hover:bg-violet-500/10 disabled:opacity-50"
        >
          <Square className="h-3 w-3" />
          {t('autoTag.stop')}
        </button>
      </div>
    );
  }

  return (
    <div className={`border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-semibold">{t('autoTag.summary', { completed: status.completed, failed })}</span>
        <button
          type="button"
          onClick={() => setShowErrors((value) => !value)}
          aria-expanded={showErrors}
          className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
        >
          {t('autoTag.details')}
          <ChevronDown className={`h-3 w-3 transition-transform ${showErrors ? 'rotate-180' : ''}`} />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void run(() => retryAutoTag(scope, i18n.language), 'autoTag.retryFailed')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-2.5 py-1 font-semibold transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            {t('autoTag.retry')}
          </button>
          <button
            type="button"
            onClick={() => void run(() => cancelAutoTag(scope), 'autoTag.stopFailed')}
            disabled={busy}
            title={t('autoTag.dismiss')}
            aria-label={t('autoTag.dismiss')}
            className="rounded-lg p-1 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {showErrors && (
        <ul className="mt-2 space-y-1 pl-6">
          {errorSummary.map(([error, count]) => (
            <li key={error} className="break-words">
              {count > 1 && <span className="font-bold">{count}× </span>}
              {error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

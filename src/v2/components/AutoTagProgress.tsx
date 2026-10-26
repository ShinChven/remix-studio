import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cancelAutoTag, fetchAutoTagStatus, retryAutoTag } from '../../api';
import { Button, cx, Icon, IconButton, LinearProgress, Text, useSnackbar } from '../../m3';
import type { AutoTagRunStatus, AutoTagScope } from '../../types';

const POLL_MS = 2_000;

export interface AutoTagProgressProps {
  scope: AutoTagScope;
  /** Bumped by the page after it starts a run, so polling begins at once. */
  runKey: number;
  className?: string;
}

/**
 * Progress of the auto-tagging run in an album or library: a bar while items
 * are tagged, then the failures with Retry and Dismiss. Renders nothing when
 * there is no run to show.
 */
export function AutoTagProgress({ scope, runKey, className }: AutoTagProgressProps) {
  const { t, i18n } = useTranslation();
  const snackbar = useSnackbar();
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
          snackbar.show(t('autoTag.finished', { count: next.completed }));
        }
        wasActiveRef.current = next.active;
        setStatus(next);
        if (next.active) timer = window.setTimeout(tick, POLL_MS);
      } catch {
        // A blip during a run should not freeze the bar; otherwise stay quiet.
        if (!cancelled && wasActiveRef.current) timer = window.setTimeout(tick, POLL_MS * 3);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scopeId, runKey, pollKey, t]);

  const errorSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const failure of status?.failures ?? []) counts.set(failure.error, (counts.get(failure.error) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [status]);

  if (!status || (!status.active && status.failures.length === 0)) return null;

  const failed = status.failures.length;
  const done = status.completed + failed;
  const fraction = status.total > 0 ? Math.min(1, done / status.total) : 0;

  const run = async (action: () => Promise<AutoTagRunStatus>, failureKey: string) => {
    setBusy(true);
    try {
      const next = await action();
      wasActiveRef.current = next.active;
      setStatus(next);
      setShowErrors(false);
      if (next.active) setPollKey((key) => key + 1);
    } catch (error) {
      snackbar.show((error as Error)?.message || t(failureKey));
    } finally {
      setBusy(false);
    }
  };

  if (status.active) {
    return (
      <div role="status" className={cx('v2-autotag', className)} data-density="compact">
        <Icon name="wand_stars" size={18} className="text-tertiary" />
        <Text as="span" variant="label-medium" className="whitespace-nowrap">
          {t('autoTag.progress', { done, total: status.total })}
          {failed > 0 && <span className="text-warning"> · {t('autoTag.failedCount', { count: failed })}</span>}
        </Text>
        <LinearProgress value={fraction} max={1} shape="wavy" className="v2-autotag__bar" aria-label={t('autoTag.progress', { done, total: status.total })} />
        <Button variant="outlined" size="xs" icon="stop" disabled={busy || status.pending === 0} onClick={() => void run(() => cancelAutoTag(scope), 'autoTag.stopFailed')}>
          {t('autoTag.stop')}
        </Button>
      </div>
    );
  }

  return (
    <div className={cx('v2-autotag', className)} data-tone="warning" data-density="compact">
      <Icon name="error" size={18} />
      <Text as="span" variant="label-medium" emphasized>
        {t('autoTag.summary', { completed: status.completed, failed })}
      </Text>
      <Button variant="text" size="xs" trailingIcon={showErrors ? 'expand_less' : 'expand_more'} aria-expanded={showErrors} onClick={() => setShowErrors((value) => !value)}>
        {t('autoTag.details')}
      </Button>
      <span className="ms-auto flex items-center gap-1">
        <Button variant="tonal" size="xs" icon="refresh" disabled={busy} onClick={() => void run(() => retryAutoTag(scope, i18n.language), 'autoTag.retryFailed')}>
          {t('autoTag.retry')}
        </Button>
        <IconButton icon="close" size="xs" label={t('autoTag.dismiss')} tooltip disabled={busy} onClick={() => void run(() => cancelAutoTag(scope), 'autoTag.stopFailed')} />
      </span>
      {showErrors && (
        <ul className="v2-autotag__errors">
          {errorSummary.map(([error, count]) => (
            <li key={error}>
              {count > 1 && <strong>{count}× </strong>}
              {error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

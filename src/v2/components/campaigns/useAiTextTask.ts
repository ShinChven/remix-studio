import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchBatchGeneratePostTextStatus, type BatchGenerateTextResult } from '../../../api';
import { errorText } from '../../lib/errors';
import { usePolling } from '../../lib/usePolling';
import { useToast } from '../../ui/useToast';

const POLL_MS = 1500;
const finished = (task: BatchGenerateTextResult | null) => !task?.batchId || task.status === 'completed' || task.status === 'failed';

/**
 * Follows an AI text run until it finishes, reporting how it went. `onProgress` is called each
 * time more posts are done, so the list behind can show the new text as it arrives.
 */
export function useAiTextTask(onProgress: () => unknown) {
  const { t } = useTranslation();
  const toast = useToast();
  const [task, setTask] = useState<BatchGenerateTextResult | null>(null);
  const taskRef = useRef(task);
  taskRef.current = task;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const running = !finished(task);

  const poll = async () => {
    const current = taskRef.current;
    if (finished(current) || !current) return;
    try {
      const status = await fetchBatchGeneratePostTextStatus(current.batchId);
      if (taskRef.current?.batchId !== current.batchId) return;
      setTask(status);
      const done = status.status === 'completed' || status.status === 'failed';
      if (done) {
        const ok = status.results.filter((result) => result.ok).length;
        const failed = status.results.length - ok;
        const reason = status.error || status.results.find((result) => !result.ok)?.error;
        const tally = t('v2.campaigns.ai.tally', { ok, failed });
        if (status.status === 'failed') toast.error(reason || tally);
        else if (failed > 0) toast.info(reason ? `${tally} · ${reason}` : tally);
        else toast.success(t('v2.campaigns.ai.done', { count: ok }));
      }
      if (done || status.completed !== current.completed) await onProgressRef.current();
    } catch (error) {
      toast.error(errorText(error, t('v2.campaigns.ai.statusFailed')));
      setTask(null);
    }
  };

  usePolling(poll, running ? POLL_MS : false);
  const batchId = task?.batchId;
  useEffect(() => {
    if (batchId) void poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  return { task, running, start: setTask };
}

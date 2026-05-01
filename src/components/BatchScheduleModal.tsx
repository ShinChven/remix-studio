import React, { useState } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { batchSchedulePosts, BatchScheduleItem } from '../api';

interface Props {
  postIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

function nowPlusMinutesLocal(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function BatchScheduleModal({ postIds, onClose, onComplete }: Props) {
  const [scheduledAt, setScheduledAt] = useState<string>(nowPlusMinutesLocal(15));
  const [staggerMinutes, setStaggerMinutes] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledAt) return;

    const baseTime = new Date(scheduledAt);
    if (Number.isNaN(baseTime.getTime())) {
      toast.error('Invalid date');
      return;
    }
    const fiveMinsFromNow = new Date(Date.now() + 5 * 60_000);
    if (baseTime < fiveMinsFromNow) {
      toast.error('Scheduled time must be at least 5 minutes in the future.');
      return;
    }

    const items: BatchScheduleItem[] = postIds.map((postId, idx) => {
      const t = new Date(baseTime.getTime() + idx * staggerMinutes * 60_000);
      return { postId, scheduledAt: t.toISOString() };
    });

    try {
      setSubmitting(true);
      const result = await batchSchedulePosts(items);
      if (result.skipped.length > 0) {
        toast.warning(`Scheduled ${result.updated}. Skipped ${result.skipped.length}: ${result.skipped[0].reason}${result.skipped.length > 1 ? '…' : ''}`);
      } else {
        toast.success(`Scheduled ${result.updated} post${result.updated === 1 ? '' : 's'}`);
      }
      onComplete();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule posts');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-white/10 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.4)] dark:shadow-[0_50px_100px_rgba(0,0,0,0.8)] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <h2 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight mb-2">
            Batch Schedule
          </h2>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-6">
            Schedule {postIds.length} post{postIds.length === 1 ? '' : 's'} to be published.
          </p>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
                Start Time
              </label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-neutral-400" />
                <input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3.5 text-sm font-bold text-neutral-900 dark:text-neutral-100 outline-none transition focus:border-indigo-500/50 shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
                Stagger Minutes Between Posts
              </label>
              <input
                type="number"
                min={0}
                max={1440}
                value={staggerMinutes}
                onChange={(e) => setStaggerMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3.5 text-sm font-bold text-neutral-900 dark:text-neutral-100 outline-none transition focus:border-indigo-500/50 shadow-sm"
              />
              <p className="text-[10px] font-medium text-neutral-500 dark:text-neutral-500 mt-2">
                {staggerMinutes > 0
                  ? `Posts will publish ${staggerMinutes} min apart starting at the time above.`
                  : 'All posts will be scheduled at the same time.'}
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-3 border-t border-neutral-200/50 dark:border-white/5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="mt-4 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="mt-4 px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 hover:bg-neutral-900 dark:hover:bg-indigo-500 text-white shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Schedule
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

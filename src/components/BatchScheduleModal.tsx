import React, { useState } from 'react';
import { Loader2, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { batchSchedulePosts, BatchScheduleItem } from '../api';

interface Props {
  postIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultScheduleWindow() {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startTime: formatDateTimeLocal(start),
    endTime: formatDateTimeLocal(end),
  };
}

function calculateSchedules(postIds: string[], start: Date, end: Date): BatchScheduleItem[] {
  if (postIds.length === 0) return [];
  if (postIds.length === 1) {
    return [{ postId: postIds[0], scheduledAt: start.toISOString() }];
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  const interval = (endMs - startMs) / (postIds.length - 1);
  const randomness = interval * 0.1;

  return postIds.map((postId, index) => {
    const baseTime = startMs + index * interval;
    const offset = (Math.random() * 2 - 1) * randomness;
    return {
      postId,
      scheduledAt: new Date(baseTime + offset).toISOString(),
    };
  });
}

export function BatchScheduleModal({ postIds, onClose, onComplete }: Props) {
  const defaults = getDefaultScheduleWindow();
  const [startTime, setStartTime] = useState<string>(defaults.startTime);
  const [endTime, setEndTime] = useState<string>(defaults.endTime);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) {
      toast.error('Please select both start and end times');
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Invalid date');
      return;
    }
    if (end <= start) {
      toast.error('End time must be after start time');
      return;
    }

    const items = calculateSchedules(postIds, start, end);

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
            Batch Schedule Posts
          </h2>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-6">
            Distribute {postIds.length} post{postIds.length === 1 ? '' : 's'} between the selected start and end times with 10% randomness.
          </p>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
                Start Date & Time
              </label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-neutral-400" />
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3.5 text-sm font-bold text-neutral-900 dark:text-neutral-100 outline-none transition focus:border-indigo-500/50 shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
                End Date & Time
              </label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-400" />
                <input
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3.5 text-sm font-bold text-neutral-900 dark:text-neutral-100 outline-none transition focus:border-indigo-500/50 shadow-sm"
                />
              </div>
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
                Confirm Schedule
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

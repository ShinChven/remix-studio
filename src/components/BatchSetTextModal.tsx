import React, { useState } from 'react';
import { Loader2, Type } from 'lucide-react';
import { toast } from 'sonner';
import { batchSetPostText } from '../api';

interface Props {
  postIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

export function BatchSetTextModal({ postIds, onClose, onComplete }: Props) {
  const [textContent, setTextContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textContent.trim()) {
      toast.error('Enter the text to apply');
      return;
    }

    try {
      setSubmitting(true);
      const result = await batchSetPostText(postIds, textContent);
      if (result.skipped.length > 0) {
        toast.warning(`Updated ${result.updated}. Skipped ${result.skipped.length}: ${result.skipped[0].reason}${result.skipped.length > 1 ? '…' : ''}`);
      } else {
        toast.success(`Updated text for ${result.updated} post${result.updated === 1 ? '' : 's'}`);
      }
      onComplete();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to set post text');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-neutral-200/50 bg-white/90 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300 dark:border-white/10 dark:bg-neutral-900/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto p-8">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            <Type className="h-5 w-5 text-indigo-500" />
            Set Post Text
          </h2>
          <p className="mb-6 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Apply the same text to {postIds.length} selected post{postIds.length === 1 ? '' : 's'}. Existing text on those posts is replaced.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                Post Text
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={6}
                disabled={submitting}
                className="min-h-40 w-full resize-y rounded-card border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm font-medium text-neutral-900 shadow-inner outline-none ring-indigo-500/10 transition focus:border-indigo-500/50 focus:ring-4 dark:border-neutral-800 dark:bg-black/20 dark:text-neutral-100"
                placeholder="e.g., New drop is live. Link in bio. #launch"
                autoFocus
              />
              <p className="mt-2 text-right text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {textContent.length} characters
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-neutral-200/50 pt-2 dark:border-white/5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="mt-4 rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !textContent.trim()}
                className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Applying...' : 'Apply Text'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Scissors } from 'lucide-react';

interface PromptLimitModalProps {
  isOpen: boolean;
  modelName: string;
  affectedCount: number;
  limitLabel: string;
  longestPromptLabel: string;
  onTruncate: () => void;
  onKeep: () => void;
  onCancel: () => void;
}

export function PromptLimitModal({
  isOpen,
  modelName,
  affectedCount,
  limitLabel,
  longestPromptLabel,
  onTruncate,
  onKeep,
  onCancel,
}: PromptLimitModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={onCancel} />

      <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl">
        <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-black tracking-tight text-neutral-900 dark:text-white">
                {t('projectViewer.promptLimitModal.title')}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {t('projectViewer.promptLimitModal.message', {
                  count: affectedCount,
                  model: modelName,
                  limit: limitLabel,
                  longest: longestPromptLabel,
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-200/50 dark:border-neutral-800/50 bg-neutral-50/30 dark:bg-neutral-950/30 p-5 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-400 transition-all hover:bg-neutral-800/60 hover:text-white"
          >
            {t('projectViewer.promptLimitModal.cancel')}
          </button>
          <button
            onClick={onKeep}
            className="rounded-xl border border-neutral-700 bg-neutral-200/60 dark:bg-neutral-800/60 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-900 dark:text-white transition-all hover:bg-neutral-700"
          >
            {t('projectViewer.promptLimitModal.keep')}
          </button>
          <button
            onClick={onTruncate}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-900 dark:text-white transition-all hover:bg-blue-500"
          >
            <Scissors className="h-3.5 w-3.5" />
            {t('projectViewer.promptLimitModal.truncate')}
          </button>
        </div>
      </div>
    </div>
  );
}

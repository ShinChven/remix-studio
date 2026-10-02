import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Job } from '../../types';

/**
 * The text and number values a ComfyUI job submits — including the seeds the
 * runner rolled — so a result can be traced back and reproduced. Imported and
 * library media already show as the job's reference contexts.
 */
export function ComfyJobInputs({ job }: { job: Job }) {
  const { t } = useTranslation();
  const values = (job.comfyInputs || []).filter((input) => input.kind === 'text');
  if (values.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.comfy.jobInputs')}</label>
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
        {values.map((input) => (
          <div key={`${input.nodeId}/${input.input}`} className="flex gap-3 px-3 py-1.5 text-xs">
            <span className="shrink-0 font-mono text-neutral-500">#{input.nodeId} {input.input}</span>
            <span className="min-w-0 flex-1 text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words line-clamp-3 select-all">{input.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

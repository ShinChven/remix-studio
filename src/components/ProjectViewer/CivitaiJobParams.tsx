import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CivitaiGenerationConfig, Job } from '../../types';
import {
  civitaiModelPageUrl,
  civitaiResourceLabel,
  civitaiSchedulerLabel,
  civitaiVideoEngine,
  isCivitaiEmbedding,
  isCivitaiVideo,
} from '../../lib/civitai';

/**
 * The checkpoint, resources and parameters a Civitai job runs with — including
 * the seed it was given — so a result can be traced back and reproduced.
 */
export function CivitaiJobParams({ job }: { job: Job }) {
  return <CivitaiParamsTable params={job.civitaiParams} sourceCount={job.imageContexts?.length ?? 0} />;
}

/**
 * The same table for any saved settings, a job's or an album result's.
 * `sourceCount` is how many images the generation started from.
 */
export function CivitaiParamsTable({ params, sourceCount }: { params?: CivitaiGenerationConfig; sourceCount: number }) {
  const { t } = useTranslation();
  if (!params) return null;

  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  const video = isCivitaiVideo(params);
  if (video) {
    const engine = civitaiVideoEngine(params.video?.engine);
    rows.push({ label: t('projectViewer.civitai.video.engine'), value: engine.label });
    if (sourceCount > 0 && engine.imageToVideo) {
      rows.push({
        label: t('projectViewer.civitai.video.mode'),
        value: sourceCount > 1 && engine.endFrame ? t('projectViewer.civitai.video.firstLastFrame') : t('projectViewer.civitai.video.imageToVideo'),
      });
    }
  } else if (params.model) {
    const href = civitaiModelPageUrl(params.model.air);
    rows.push({
      label: t('projectViewer.civitai.checkpoint'),
      value: href
        ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-sky-600 dark:hover:text-sky-400 underline-offset-2 hover:underline">{civitaiResourceLabel(params.model)}</a>
        : civitaiResourceLabel(params.model),
    });
  }
  for (const resource of params.resources || []) {
    rows.push({
      label: resource.type || t('projectViewer.civitai.resource'),
      value: isCivitaiEmbedding(resource)
        ? civitaiResourceLabel(resource)
        : `${civitaiResourceLabel(resource)} · ${resource.strength ?? 1}`,
    });
  }
  if (params.negativePrompt) rows.push({ label: t('projectViewer.civitai.negativePrompt'), value: params.negativePrompt });
  if (video) {
    const settings = params.video || {};
    if (settings.width && settings.height) rows.push({ label: t('projectViewer.civitai.size'), value: `${settings.width} × ${settings.height}` });
    if (settings.resolution) rows.push({ label: t('projectViewer.civitai.video.resolution'), value: [settings.resolution, settings.aspectRatio].filter(Boolean).join(' · ') });
    if (settings.duration !== undefined) rows.push({ label: t('projectViewer.civitai.video.duration'), value: t('projectViewer.civitai.video.seconds', { count: settings.duration }) });
    if (settings.cfgScale !== undefined) rows.push({ label: t('projectViewer.civitai.cfgScale'), value: settings.cfgScale });
    if (settings.steps !== undefined) rows.push({ label: t('projectViewer.civitai.steps'), value: settings.steps });
    if (settings.shift !== undefined) rows.push({ label: t('projectViewer.civitai.video.shift'), value: settings.shift });
    if (settings.interpolator && settings.interpolator !== 'none') rows.push({ label: t('projectViewer.civitai.video.interpolator'), value: settings.interpolator.toUpperCase() });
    if (settings.promptExpansion) rows.push({ label: t('projectViewer.civitai.video.promptExpansion'), value: t('projectViewer.civitai.video.on') });
    if (settings.usePrime) rows.push({ label: t('projectViewer.civitai.video.usePrime'), value: t('projectViewer.civitai.video.on') });
  } else {
    if (params.width && params.height) rows.push({ label: t('projectViewer.civitai.size'), value: `${params.width} × ${params.height}` });
    if (params.scheduler) rows.push({ label: t('projectViewer.civitai.sampler'), value: civitaiSchedulerLabel(params.scheduler) });
    if (params.steps !== undefined) rows.push({ label: t('projectViewer.civitai.steps'), value: params.steps });
    if (params.cfgScale !== undefined) rows.push({ label: t('projectViewer.civitai.cfgScale'), value: params.cfgScale });
    if (params.clipSkip !== undefined) rows.push({ label: t('projectViewer.civitai.clipSkip'), value: params.clipSkip });
    if (sourceCount > 0 && params.denoise !== undefined) rows.push({ label: t('projectViewer.civitai.denoise'), value: params.denoise });
  }
  rows.push({
    label: t('projectViewer.civitai.seed'),
    value: params.seed !== undefined ? params.seed : <span className="italic text-neutral-500">{t('projectViewer.civitai.seedRolledOnRun')}</span>,
  });

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.civitai.jobParams')}</label>
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-3 px-3 py-1.5 text-xs">
            <span className="shrink-0 w-24 font-mono text-neutral-500 truncate">{row.label}</span>
            <span className="min-w-0 flex-1 text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words line-clamp-3 select-all">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

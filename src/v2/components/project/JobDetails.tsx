import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { civitaiModelPageUrl, civitaiResourceLabel, civitaiSchedulerLabel, civitaiVideoEngine, isCivitaiEmbedding, isCivitaiVideo } from '../../../lib/civitai';
import { Text } from '../../../m3';
import type { CivitaiGenerationConfig, Job } from '../../../types';

export type OpenLightbox = (data: { images: string[]; index: number }) => void;

/** A labelled block inside an expanded job. */
export function DetailBlock({ label, tone, children }: { label: ReactNode; tone?: 'error' | 'success'; children: ReactNode }) {
  return (
    <div className="v2-detail-block" data-tone={tone}>
      <Text as="div" variant="label-small" className="v2-detail-block__label">
        {label}
      </Text>
      {children}
    </div>
  );
}

/** Rows of label → value, for parameters a job ran with. */
export function ParamTable({ label, rows }: { label: ReactNode; rows: Array<{ label: ReactNode; value: ReactNode }> }) {
  if (rows.length === 0) return null;
  return (
    <DetailBlock label={label}>
      <div className="v2-param-table">
        {rows.map((row, index) => (
          <div key={index} className="v2-param-table__row">
            <span className="v2-param-table__key">{row.label}</span>
            <span className="v2-param-table__value">{row.value}</span>
          </div>
        ))}
      </div>
    </DetailBlock>
  );
}

/** The text and number values a ComfyUI job submits, including the seeds rolled for it. */
export function ComfyJobInputs({ job }: { job: Job }) {
  const { t } = useTranslation();
  const values = (job.comfyInputs || []).filter((input) => input.kind === 'text');
  return <ParamTable label={t('projectViewer.comfy.jobInputs')} rows={values.map((input) => ({ label: `#${input.nodeId} ${input.input}`, value: input.value }))} />;
}

/** The checkpoint, resources and parameters of a Civitai generation, including its seed. */
export function CivitaiParamsTable({ params, sourceCount }: { params?: CivitaiGenerationConfig; sourceCount: number }) {
  const { t } = useTranslation();
  if (!params) return null;
  const rows: Array<{ label: string; value: ReactNode }> = [];
  const video = isCivitaiVideo(params);
  if (video) {
    const engine = civitaiVideoEngine(params.video?.engine);
    rows.push({ label: t('projectViewer.civitai.video.engine'), value: engine.label });
    if (sourceCount > 0 && engine.imageToVideo) {
      rows.push({ label: t('projectViewer.civitai.video.mode'), value: sourceCount > 1 && engine.endFrame ? t('projectViewer.civitai.video.firstLastFrame') : t('projectViewer.civitai.video.imageToVideo') });
    }
  } else if (params.model) {
    const href = civitaiModelPageUrl(params.model.air);
    rows.push({
      label: t('projectViewer.civitai.checkpoint'),
      value: href ? (
        <a href={href} target="_blank" rel="noreferrer" className="v2-link">
          {civitaiResourceLabel(params.model)}
        </a>
      ) : (
        civitaiResourceLabel(params.model)
      ),
    });
  }
  for (const resource of params.resources || []) {
    rows.push({ label: resource.type || t('projectViewer.civitai.resource'), value: isCivitaiEmbedding(resource) ? civitaiResourceLabel(resource) : `${civitaiResourceLabel(resource)} · ${resource.strength ?? 1}` });
  }
  if (params.negativePrompt) rows.push({ label: t('projectViewer.civitai.negativePrompt'), value: params.negativePrompt });
  if (video) {
    const s = params.video || {};
    if (s.width && s.height) rows.push({ label: t('projectViewer.civitai.size'), value: `${s.width} × ${s.height}` });
    if (s.resolution) rows.push({ label: t('projectViewer.civitai.video.resolution'), value: [s.resolution, s.aspectRatio].filter(Boolean).join(' · ') });
    if (s.duration !== undefined) rows.push({ label: t('projectViewer.civitai.video.duration'), value: t('projectViewer.civitai.video.seconds', { count: s.duration }) });
    if (s.cfgScale !== undefined) rows.push({ label: t('projectViewer.civitai.cfgScale'), value: s.cfgScale });
    if (s.steps !== undefined) rows.push({ label: t('projectViewer.civitai.steps'), value: s.steps });
    if (s.shift !== undefined) rows.push({ label: t('projectViewer.civitai.video.shift'), value: s.shift });
    if (s.interpolator && s.interpolator !== 'none') rows.push({ label: t('projectViewer.civitai.video.interpolator'), value: s.interpolator.toUpperCase() });
    if (s.promptExpansion) rows.push({ label: t('projectViewer.civitai.video.promptExpansion'), value: t('projectViewer.civitai.video.on') });
    if (s.usePrime) rows.push({ label: t('projectViewer.civitai.video.usePrime'), value: t('projectViewer.civitai.video.on') });
  } else {
    if (params.width && params.height) rows.push({ label: t('projectViewer.civitai.size'), value: `${params.width} × ${params.height}` });
    if (params.scheduler) rows.push({ label: t('projectViewer.civitai.sampler'), value: civitaiSchedulerLabel(params.scheduler) });
    if (params.steps !== undefined) rows.push({ label: t('projectViewer.civitai.steps'), value: params.steps });
    if (params.cfgScale !== undefined) rows.push({ label: t('projectViewer.civitai.cfgScale'), value: params.cfgScale });
    if (params.clipSkip !== undefined) rows.push({ label: t('projectViewer.civitai.clipSkip'), value: params.clipSkip });
    if (sourceCount > 0 && params.denoise !== undefined) rows.push({ label: t('projectViewer.civitai.denoise'), value: params.denoise });
  }
  rows.push({ label: t('projectViewer.civitai.seed'), value: params.seed !== undefined ? params.seed : <em className="text-on-surface-variant">{t('projectViewer.civitai.seedRolledOnRun')}</em> });
  return <ParamTable label={t('projectViewer.civitai.jobParams')} rows={rows} />;
}

/** Everything an expanded job shows: prompt, submitted values, references, result, error and metadata. */
export function JobDetails({ job, onLightbox, showResultText, showError, showMetadata }: { job: Job; onLightbox: OpenLightbox; showResultText?: boolean; showError?: boolean; showMetadata?: boolean }) {
  const { t } = useTranslation();
  const meta = [job.aspectRatio, job.quality, job.format, job.size ? `${(job.size / 1024).toFixed(1)} KB` : null, job.updatedAt || job.createdAt ? new Date(job.updatedAt || job.createdAt || 0).toLocaleString() : null].filter(Boolean) as string[];
  return (
    <div className="v2-job-details">
      <DetailBlock label={t('projectViewer.common.fullPrompt')}>
        <div className="v2-code-block">{job.prompt}</div>
      </DetailBlock>
      <ComfyJobInputs job={job} />
      <CivitaiParamsTable params={job.civitaiParams} sourceCount={job.imageContexts?.length ?? 0} />
      {showResultText && job.resultText && (
        <DetailBlock label={t('projectViewer.common.generatedText')} tone="success">
          <div className="v2-code-block">{job.resultText}</div>
        </DetailBlock>
      )}
      {job.imageContexts && job.imageContexts.length > 0 && (
        <DetailBlock label={t('projectViewer.queue.visualContexts')}>
          <div className="v2-context-grid">
            {job.imageContexts.map((ctx, idx) => (
              <button
                key={idx}
                type="button"
                className="v2-context-thumb m3-focus-ring"
                title={t('projectViewer.queue.contextShort', { index: idx + 1 })}
                onClick={(e) => {
                  e.stopPropagation();
                  onLightbox({ images: (job.imageContexts || []).map(imageDisplayUrl), index: idx });
                }}
              >
                <img src={imageDisplayUrl(ctx)} alt={t('projectViewer.queue.contextAlt', { index: idx + 1 })} loading="lazy" />
              </button>
            ))}
          </div>
        </DetailBlock>
      )}
      {job.videoContexts && job.videoContexts.length > 0 && (
        <DetailBlock label="Reference Videos">
          <div className="grid gap-2 sm:grid-cols-2">
            {job.videoContexts.map((ctx, idx) => (
              <video key={idx} src={imageDisplayUrl(ctx)} controls className="v2-media-player" />
            ))}
          </div>
        </DetailBlock>
      )}
      {job.audioContexts && job.audioContexts.length > 0 && (
        <DetailBlock label="Reference Audio">
          <div className="flex flex-col gap-2">
            {job.audioContexts.map((ctx, idx) => (
              <audio key={idx} src={imageDisplayUrl(ctx)} controls className="w-full" />
            ))}
          </div>
        </DetailBlock>
      )}
      {showError && job.status === 'failed' && (
        <DetailBlock label={t('projectViewer.queue.errorDetails')} tone="error">
          <pre className="v2-error-text">{job.error || t('projectViewer.queue.unknownError')}</pre>
        </DetailBlock>
      )}
      {showMetadata && meta.length > 0 && (
        <DetailBlock label={t('projectViewer.completed.metadata')}>
          <Text as="div" variant="body-small" className="v2-detail-meta">
            {meta.join(' · ')}
          </Text>
        </DetailBlock>
      )}
    </div>
  );
}

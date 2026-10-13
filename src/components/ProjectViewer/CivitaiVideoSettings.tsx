import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { CivitaiVideoSettings as VideoSettings } from '../../types';
import { CIVITAI_VIDEO_ENGINES, civitaiVideoEngine, resolveCivitaiVideoSettings } from '../../lib/civitai';
import { NumberInput } from '../NumberInput';
import { civitaiChipClass, civitaiFieldClass, civitaiNumberClass } from './CivitaiResourceParts';

const sectionLabelClass = 'text-[9px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-500 block px-1';
const rowLabelClass = 'text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400';

export function CivitaiToggleRow({ label, hint, checked, onChange }: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked} className="w-full flex items-center justify-between gap-3 text-left">
      <span>
        <span className={`block ${rowLabelClass}`}>{label}</span>
        {hint && <span className="block text-[10px] leading-4 text-neutral-500">{hint}</span>}
      </span>
      <span className={`shrink-0 w-8 h-4 rounded-full relative transition-all duration-300 ${checked ? 'bg-sky-500' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
        <span className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all duration-300 ${checked ? 'left-5' : 'left-1'}`} />
      </span>
    </button>
  );
}

function NumberRow({ label, value, onChange, min, max, step, integer }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className={rowLabelClass}>{label}</span>
      <NumberInput value={value} onValueChange={onChange} min={min} max={max} step={step} integer={integer} className={`${civitaiNumberClass} !w-24 !py-1.5`} />
    </label>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-1.5 px-1 text-[10px] leading-4 text-neutral-500">
      <Info className="w-3 h-3 mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The settings of a Civitai video project: the engine, and the choices that
 * engine takes — Civitai's own generator offers the same ones. What the
 * workflow feeds it is summed up underneath: whether the first image becomes
 * the start frame, and what happens to LoRAs and the negative prompt.
 */
export function CivitaiVideoSettings({ video, onChange, imageCount, loraCount, hasNegative }: {
  video: VideoSettings | undefined;
  onChange: (video: VideoSettings) => void;
  /** Enabled image items and image libraries in the workflow. */
  imageCount: number;
  /** Enabled LoRA slots. */
  loraCount: number;
  hasNegative: boolean;
}) {
  const { t } = useTranslation();
  const engine = civitaiVideoEngine(video?.engine);
  const settings = resolveCivitaiVideoSettings(video);
  // Only what the user picked is stored; anything left unset follows the
  // engine's default, so switching engines picks up the new engine's defaults.
  const update = (patch: Partial<VideoSettings>) => onChange({ ...video, engine: engine.value, ...patch });
  const fromImage = imageCount > 0 && engine.imageToVideo;

  return (
    <>
      <div className="space-y-2">
        <span className={sectionLabelClass}>{t('projectViewer.civitai.video.engine')}</span>
        <select
          value={engine.value}
          onChange={(e) => onChange({ ...video, engine: e.target.value as VideoSettings['engine'] })}
          className={civitaiFieldClass}
        >
          {CIVITAI_VIDEO_ENGINES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {t(`projectViewer.civitai.video.engineHints.${option.value.replace(/[.-]/g, '_')}`)}
            </option>
          ))}
        </select>
        {fromImage && (
          <Note>{imageCount > 1 && engine.endFrame ? t('projectViewer.civitai.video.firstLastFrameHint') : t('projectViewer.civitai.video.imageToVideoHint')}</Note>
        )}
        {imageCount > 0 && !engine.imageToVideo && <Note>{t('projectViewer.civitai.video.textOnlyHint', { engine: engine.label })}</Note>}
        {imageCount > 1 && engine.imageToVideo && !engine.endFrame && <Note>{t('projectViewer.civitai.video.onlyFirstImage')}</Note>}
        {loraCount > 0 && engine.loras === 0 && <Note>{t('projectViewer.civitai.video.noLorasHint', { engine: engine.label })}</Note>}
        {loraCount > engine.loras && engine.loras > 0 && <Note>{t('projectViewer.civitai.video.loraLimitHint', { engine: engine.label, count: engine.loras })}</Note>}
        {hasNegative && !engine.negativePrompt && <Note>{t('projectViewer.civitai.video.noNegativeHint', { engine: engine.label })}</Note>}
      </div>

      <div className="space-y-2.5">
        <span className={sectionLabelClass}>{t('projectViewer.civitai.video.shape')}</span>
        <div className="flex items-center justify-between gap-3">
          <span className={rowLabelClass}>{t('projectViewer.civitai.video.resolution')}</span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {engine.resolutions.map((resolution) => (
              <button key={resolution} type="button" className={civitaiChipClass(settings.resolution === resolution)} onClick={() => update({ resolution })}>
                {resolution}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className={rowLabelClass}>{t('projectViewer.civitai.video.aspectRatio')}</span>
          <div className={`flex flex-wrap gap-1.5 ${fromImage ? 'opacity-50' : ''}`}>
            {engine.aspectRatios.map((aspectRatio) => (
              <button key={aspectRatio} type="button" className={civitaiChipClass(settings.aspectRatio === aspectRatio)} onClick={() => update({ aspectRatio })}>
                {aspectRatio}
              </button>
            ))}
          </div>
          {fromImage && <Note>{t('projectViewer.civitai.video.aspectFromImageHint')}</Note>}
          {!fromImage && settings.width && settings.height && (
            <p className="px-1 text-[10px] leading-4 text-neutral-500">{settings.width} × {settings.height}</p>
          )}
        </div>
        {engine.durations && (
          <div className="flex items-center justify-between gap-3">
            <span className={rowLabelClass}>{t('projectViewer.civitai.video.duration')}</span>
            <div className="flex gap-1.5">
              {engine.durations.map((duration) => (
                <button key={duration} type="button" className={civitaiChipClass(settings.duration === duration)} onClick={() => update({ duration })}>
                  {t('projectViewer.civitai.video.seconds', { count: duration })}
                </button>
              ))}
            </div>
          </div>
        )}
        {engine.durationRange && (
          <NumberRow
            label={t('projectViewer.civitai.video.durationSeconds')}
            value={settings.duration ?? engine.defaults.duration ?? engine.durationRange.min}
            onChange={(duration) => update({ duration })}
            {...engine.durationRange}
            integer
          />
        )}
        {!engine.durations && !engine.durationRange && <Note>{t('projectViewer.civitai.video.fixedLengthHint', { engine: engine.label })}</Note>}
      </div>

      {(engine.cfg || engine.steps || engine.shift || engine.interpolator) && (
        <div className="space-y-2.5">
          <span className={sectionLabelClass}>{t('projectViewer.civitai.sampling')}</span>
          {engine.cfg && (
            <NumberRow label={t('projectViewer.civitai.cfgScale')} value={settings.cfgScale ?? engine.cfg.default} onChange={(cfgScale) => update({ cfgScale })} min={engine.cfg.min} max={engine.cfg.max} step={engine.cfg.step} />
          )}
          {engine.steps && (
            <NumberRow label={t('projectViewer.civitai.steps')} value={settings.steps ?? engine.steps.default} onChange={(steps) => update({ steps })} min={engine.steps.min} max={engine.steps.max} integer />
          )}
          {engine.shift && (
            <NumberRow label={t('projectViewer.civitai.video.shift')} value={settings.shift ?? engine.shift.default} onChange={(shift) => update({ shift })} min={engine.shift.min} max={engine.shift.max} step={0.5} />
          )}
          {engine.interpolator && (
            <div className="flex items-center justify-between gap-3">
              <span className={rowLabelClass}>{t('projectViewer.civitai.video.interpolator')}</span>
              <div className="flex gap-1.5">
                {(['none', 'film', 'rife'] as const).map((option) => (
                  <button key={option} type="button" className={civitaiChipClass((settings.interpolator || 'none') === option)} onClick={() => update({ interpolator: option })}>
                    {option === 'none' ? t('projectViewer.civitai.video.interpolatorNone') : option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(engine.promptExpansion || engine.usePrime) && (
        <div className="space-y-2.5">
          <span className={sectionLabelClass}>{t('projectViewer.civitai.video.options')}</span>
          {engine.promptExpansion && (
            <CivitaiToggleRow
              label={t('projectViewer.civitai.video.promptExpansion')}
              hint={t('projectViewer.civitai.video.promptExpansionHint')}
              checked={!!settings.promptExpansion}
              onChange={(promptExpansion) => update({ promptExpansion })}
            />
          )}
          {engine.usePrime && (
            <CivitaiToggleRow
              label={t('projectViewer.civitai.video.usePrime')}
              hint={t('projectViewer.civitai.video.usePrimeHint')}
              checked={!!settings.usePrime}
              onChange={(usePrime) => update({ usePrime })}
            />
          )}
        </div>
      )}
    </>
  );
}

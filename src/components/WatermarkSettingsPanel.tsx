import React, { useEffect, useRef, useState } from 'react';
import { Droplets, Image as ImageIcon, Loader2, Paintbrush } from 'lucide-react';
import {
  imageDisplayUrl,
  PostWatermarkPosition,
  PostWatermarkSettings,
} from '../api';
import { cn } from '../lib/utils';

export const DEFAULT_WATERMARK_SETTINGS: PostWatermarkSettings = {
  enabled: false,
  text: '',
  position: 'center',
  padding: 32,
  fontSize: 48,
  opacity: 0.35,
  color: '#ffffff',
};

const WATERMARK_POSITIONS: Array<{ value: PostWatermarkPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'center', label: 'Center' },
  { value: 'top_left', label: 'Top left' },
  { value: 'top_right', label: 'Top right' },
  { value: 'bottom_left', label: 'Bottom left' },
  { value: 'bottom_right', label: 'Bottom right' },
];

const WATERMARK_BASE_SHORT_EDGE = 1080;

function getScaledPreviewWatermarkMetrics(width: number, height: number, settings: PostWatermarkSettings) {
  const shortEdge = Math.min(width, height);
  const scale = shortEdge / WATERMARK_BASE_SHORT_EDGE;
  const fontSize = Math.max(1, Math.min(settings.fontSize * scale, shortEdge * 0.5));
  const padding = Math.max(0, Math.min(settings.padding * scale, shortEdge / 2));
  return { fontSize, padding };
}

function getPreviewWatermarkPoint(
  position: PostWatermarkPosition,
  width: number,
  height: number,
  padding: number,
  fontSize: number,
) {
  const topY = padding + (fontSize / 2);
  const bottomY = height - padding - (fontSize / 2);
  switch (position) {
    case 'top':
      return { x: width / 2, y: topY, anchor: 'middle' as const };
    case 'bottom':
      return { x: width / 2, y: bottomY, anchor: 'middle' as const };
    case 'left':
      return { x: padding, y: height / 2, anchor: 'start' as const };
    case 'right':
      return { x: width - padding, y: height / 2, anchor: 'end' as const };
    case 'top_left':
      return { x: padding, y: topY, anchor: 'start' as const };
    case 'top_right':
      return { x: width - padding, y: topY, anchor: 'end' as const };
    case 'bottom_left':
      return { x: padding, y: bottomY, anchor: 'start' as const };
    case 'bottom_right':
      return { x: width - padding, y: bottomY, anchor: 'end' as const };
    case 'center':
    default:
      return { x: width / 2, y: height / 2, anchor: 'middle' as const };
  }
}

function getPreviewWatermarkStyle(
  settings: PostWatermarkSettings,
  naturalSize: { width: number; height: number },
  previewSize: { width: number; height: number },
): React.CSSProperties {
  const { fontSize, padding } = getScaledPreviewWatermarkMetrics(naturalSize.width, naturalSize.height, settings);
  const point = getPreviewWatermarkPoint(settings.position, naturalSize.width, naturalSize.height, padding, fontSize);
  const scaleX = previewSize.width / naturalSize.width;
  const scaleY = previewSize.height / naturalSize.height;
  const transform = point.anchor === 'middle'
    ? 'translate(-50%, -50%)'
    : point.anchor === 'end'
      ? 'translate(-100%, -50%)'
      : 'translate(0, -50%)';
  const base: React.CSSProperties = {
    color: settings.color,
    opacity: settings.opacity,
    fontSize: Math.max(1, fontSize * scaleY),
    fontWeight: 800,
    lineHeight: 1,
    textShadow: '0 1px 3px rgba(0,0,0,0.45)',
    left: point.x * scaleX,
    top: point.y * scaleY,
    transform,
    whiteSpace: 'nowrap',
  };
  if (point.anchor === 'middle') return { ...base, textAlign: 'center' };
  if (point.anchor === 'end') return { ...base, textAlign: 'right' };
  return { ...base, textAlign: 'left' };
}

function WatermarkPreview({ settings, sampleUrl }: { settings: PostWatermarkSettings; sampleUrl?: string }) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewText = settings.text.trim() || 'Watermark';
  const previewSrc = sampleUrl ? imageDisplayUrl(sampleUrl) : undefined;
  const aspectRatio = naturalSize ? `${naturalSize.width} / ${naturalSize.height}` : '1 / 1';

  useEffect(() => {
    setNaturalSize(null);
  }, [sampleUrl]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setPreviewSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspectRatio]);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Preview</span>
        <span className="text-[10px] font-bold uppercase text-neutral-400">Images only</span>
      </div>
      <div className="flex min-h-[220px] items-center justify-center rounded-card border border-neutral-200 bg-neutral-950 p-3 shadow-inner dark:border-white/10">
        <div
          ref={previewRef}
          className="relative w-full max-w-full overflow-hidden rounded-lg bg-neutral-900"
          style={{ aspectRatio }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt=""
              className="h-full w-full object-contain"
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth && image.naturalHeight) {
                  setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#27272a_25%,#18181b_25%,#18181b_50%,#27272a_50%,#27272a_75%,#18181b_75%,#18181b)] bg-[length:28px_28px]">
              <ImageIcon className="h-10 w-10 text-white/30" />
            </div>
          )}
          {settings.enabled && previewText && naturalSize && previewSize && (
            <div className="pointer-events-none absolute px-1" style={getPreviewWatermarkStyle(settings, naturalSize, previewSize)}>
              {previewText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface WatermarkSettingsPanelProps {
  settings: PostWatermarkSettings;
  sampleUrl?: string;
  isSaving: boolean;
  onChange: (settings: PostWatermarkSettings) => void;
  title?: string;
  description?: string;
  statusText?: string;
  savingText?: string;
}

export function WatermarkSettingsPanel({
  settings,
  sampleUrl,
  isSaving,
  onChange,
  title = 'Batch Watermark',
  description = 'Saved per user and applied to image posts created from this page.',
  statusText = 'Settings save after Confirm Batch runs.',
  savingText = 'Saving watermark settings...',
}: WatermarkSettingsPanelProps) {
  const updateSetting = <K extends keyof PostWatermarkSettings>(key: K, value: PostWatermarkSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <section className={cn(
      'rounded-card border border-neutral-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/50',
      settings.enabled && 'grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]',
    )}>
      <div className="space-y-5">
        <div className={cn('flex flex-col gap-3 sm:flex-row sm:justify-between', settings.enabled ? 'sm:items-start' : 'sm:items-center')}>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-950 dark:text-white">
              <Paintbrush className="h-5 w-5 text-indigo-600" />
              {title}
            </h2>
            {settings.enabled && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
            )}
          </div>
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={settings.enabled}
              onChange={(event) => updateSetting('enabled', event.target.checked)}
            />
            Enabled
          </label>
        </div>

        {settings.enabled && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="md:col-span-2 xl:col-span-3">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Text</span>
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-neutral-200/60 bg-white/70 px-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                  placeholder="Enter watermark text..."
                  maxLength={200}
                  value={settings.text}
                  onChange={(event) => updateSetting('text', event.target.value)}
                />
              </label>

              <label>
                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Position</span>
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-neutral-200/60 bg-white/70 px-3 text-sm font-semibold outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                  value={settings.position}
                  onChange={(event) => updateSetting('position', event.target.value as PostWatermarkPosition)}
                >
                  {WATERMARK_POSITIONS.map((position) => (
                    <option key={position.value} value={position.value}>{position.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Padding</span>
                <input
                  type="number"
                  min={0}
                  max={512}
                  className="mt-2 h-11 w-full rounded-xl border border-neutral-200/60 bg-white/70 px-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                  value={settings.padding}
                  onChange={(event) => updateSetting('padding', Math.max(0, Math.min(512, Number(event.target.value) || 0)))}
                />
              </label>

              <label>
                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Font size</span>
                <input
                  type="number"
                  min={8}
                  max={256}
                  className="mt-2 h-11 w-full rounded-xl border border-neutral-200/60 bg-white/70 px-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                  value={settings.fontSize}
                  onChange={(event) => updateSetting('fontSize', Math.max(8, Math.min(256, Number(event.target.value) || 8)))}
                />
              </label>

              <label>
                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Opacity</span>
                <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-neutral-200/60 bg-white/70 px-3 dark:border-white/10 dark:bg-neutral-950">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    className="min-w-0 flex-1 accent-indigo-600"
                    value={settings.opacity}
                    onChange={(event) => updateSetting('opacity', Math.max(0, Math.min(1, Number(event.target.value))))}
                  />
                  <span className="w-10 text-right text-xs font-bold text-neutral-500">{Math.round(settings.opacity * 100)}%</span>
                </div>
              </label>

              <label>
                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Color</span>
                <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-neutral-200/60 bg-white/70 px-3 dark:border-white/10 dark:bg-neutral-950">
                  <input
                    type="color"
                    className="h-7 w-9 rounded border-0 bg-transparent p-0"
                    value={settings.color}
                    onChange={(event) => updateSetting('color', event.target.value)}
                  />
                  <span className="font-mono text-xs font-bold text-neutral-500">{settings.color.toUpperCase()}</span>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Droplets className="h-3.5 w-3.5" />}
              {isSaving ? savingText : statusText}
            </div>
          </>
        )}
      </div>

      {settings.enabled && <WatermarkPreview settings={settings} sampleUrl={sampleUrl} />}
    </section>
  );
}

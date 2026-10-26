import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { imageDisplayUrl, type PostWatermarkPosition, type PostWatermarkSettings } from '../../api';
import { Icon, LoadingIndicator, Select, Slider, Switch, Text, TextField } from '../../m3';
import { NumberField } from '../ui/NumberField';
import { Section } from '../ui/Page';

export const DEFAULT_WATERMARK_SETTINGS: PostWatermarkSettings = {
  enabled: false,
  text: '',
  position: 'center',
  padding: 32,
  fontSize: 48,
  opacity: 0.35,
  color: '#ffffff',
};

const POSITIONS: Array<{ value: PostWatermarkPosition; label: string }> = [
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

/** Font size and padding are set for a 1080px short edge and scale with the image. */
const BASE_SHORT_EDGE = 1080;

function previewStyle(settings: PostWatermarkSettings, natural: { width: number; height: number }, shown: { width: number; height: number }): CSSProperties {
  const shortEdge = Math.min(natural.width, natural.height);
  const scale = shortEdge / BASE_SHORT_EDGE;
  const fontSize = Math.max(1, Math.min(settings.fontSize * scale, shortEdge * 0.5));
  const padding = Math.max(0, Math.min(settings.padding * scale, shortEdge / 2));
  const { width: w, height: h } = natural;
  const top = padding + fontSize / 2;
  const bottom = h - padding - fontSize / 2;
  const points: Record<PostWatermarkPosition, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = {
    top: { x: w / 2, y: top, anchor: 'middle' },
    bottom: { x: w / 2, y: bottom, anchor: 'middle' },
    left: { x: padding, y: h / 2, anchor: 'start' },
    right: { x: w - padding, y: h / 2, anchor: 'end' },
    top_left: { x: padding, y: top, anchor: 'start' },
    top_right: { x: w - padding, y: top, anchor: 'end' },
    bottom_left: { x: padding, y: bottom, anchor: 'start' },
    bottom_right: { x: w - padding, y: bottom, anchor: 'end' },
    center: { x: w / 2, y: h / 2, anchor: 'middle' },
  };
  const point = points[settings.position] ?? points.center;
  const sx = shown.width / w;
  const sy = shown.height / h;
  return {
    color: settings.color,
    opacity: settings.opacity,
    fontSize: Math.max(1, fontSize * sy),
    fontWeight: 800,
    lineHeight: 1,
    textShadow: '0 1px 3px rgba(0,0,0,0.45)',
    left: point.x * sx,
    top: point.y * sy,
    transform: point.anchor === 'middle' ? 'translate(-50%, -50%)' : point.anchor === 'end' ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
    whiteSpace: 'nowrap',
    textAlign: point.anchor === 'middle' ? 'center' : point.anchor === 'end' ? 'right' : 'left',
  };
}

/** Live preview of the watermark on a sample image, at the image's real proportions. */
export function WatermarkPreview({ settings, sampleUrl }: { settings: PostWatermarkSettings; sampleUrl?: string }) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [shown, setShown] = useState<{ width: number; height: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const text = settings.text.trim() || 'Watermark';
  const src = sampleUrl ? imageDisplayUrl(sampleUrl) : undefined;
  const aspectRatio = natural ? `${natural.width} / ${natural.height}` : '1 / 1';

  useEffect(() => setNatural(null), [sampleUrl]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setShown({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspectRatio]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Text variant="label-large" emphasized>
          Preview
        </Text>
        <Text variant="label-small" className="uppercase text-on-surface-variant">
          Images only
        </Text>
      </div>
      <div className="v2-watermark-stage">
        <div ref={ref} className="v2-watermark-canvas" style={{ aspectRatio }}>
          {src ? (
            <img
              src={src}
              alt=""
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
              }}
            />
          ) : (
            <div className="v2-checker">
              <Icon name="image" size={40} />
            </div>
          )}
          {settings.enabled && text && natural && shown && (
            <div className="pointer-events-none absolute px-1" style={previewStyle(settings, natural, shown)}>
              {text}
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
  /** Hide the switch where the watermark is the whole point of the page. */
  showEnabledToggle?: boolean;
}

/** Text watermark settings with a live preview. */
export function WatermarkSettingsPanel({
  settings,
  sampleUrl,
  isSaving,
  onChange,
  title = 'Batch Watermark',
  description = 'Saved per user and applied to image posts created from this page.',
  statusText = 'Settings save after Confirm Batch runs.',
  savingText = 'Saving watermark settings...',
  showEnabledToggle = true,
}: WatermarkSettingsPanelProps) {
  const set = <K extends keyof PostWatermarkSettings>(key: K, value: PostWatermarkSettings[K]) => onChange({ ...settings, [key]: value });

  return (
    <Section
      variant="tonal"
      icon={<Icon name="format_paint" />}
      title={title}
      description={settings.enabled ? description : undefined}
      actions={showEnabledToggle ? <Switch label="Enabled" checked={settings.enabled} onChange={(e) => set('enabled', e.target.checked)} /> : undefined}
    >
      {settings.enabled && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-density="compact">
          <div className="flex flex-col gap-4">
            <TextField variant="outlined" label="Text" placeholder="Enter watermark text..." maxLength={200} showCounter={false} value={settings.text} onValueChange={(v) => set('text', v)} fullWidth />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select variant="outlined" label="Position" value={settings.position} onChange={(v) => set('position', v as PostWatermarkPosition)} options={POSITIONS} fullWidth />
              <NumberField label="Padding" min={0} max={512} integer value={settings.padding} onValueChange={(v) => set('padding', v)} fullWidth />
              <NumberField label="Font size" min={8} max={256} integer value={settings.fontSize} onValueChange={(v) => set('fontSize', v)} fullWidth />
            </div>
            <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1">
                <Text variant="label-medium" className="text-on-surface-variant">
                  Opacity · {Math.round(settings.opacity * 100)}%
                </Text>
                <Slider aria-label="Opacity" min={0} max={1} step={0.05} value={settings.opacity} onChange={(v) => set('opacity', Math.max(0, Math.min(1, v)))} />
              </div>
              <label className="v2-color-input">
                <input type="color" value={settings.color} onChange={(e) => set('color', e.target.value)} aria-label="Color" />
                <span className="font-mono">{settings.color.toUpperCase()}</span>
              </label>
            </div>
            <Text variant="body-small" className="inline-flex items-center gap-2 text-on-surface-variant">
              {isSaving ? <LoadingIndicator size={20} aria-hidden /> : <Icon name="water_drop" size={16} />}
              {isSaving ? savingText : statusText}
            </Text>
          </div>
          <WatermarkPreview settings={settings} sampleUrl={sampleUrl} />
        </div>
      )}
    </Section>
  );
}

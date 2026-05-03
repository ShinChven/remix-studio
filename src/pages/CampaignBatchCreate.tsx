import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Droplets,
  Images,
  Image as ImageIcon,
  Layers,
  Loader2,
  Paintbrush,
  Plus,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CampaignMediaImportSource,
  fetchCampaign,
  fetchPostWatermarkSettings,
  imageDisplayUrl,
  importCampaignMediaPosts,
  PostWatermarkPosition,
  PostWatermarkSettings,
  updatePost,
  updatePostWatermarkSettings,
  uploadCampaignMediaPosts,
} from '../api';
import { PageHeader } from '../components/PageHeader';
import { UniversalMediaPicker, UniversalPickedItem } from '../components/UniversalMediaPicker';
import { cn } from '../lib/utils';

const POST_MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime';

const DEFAULT_WATERMARK_SETTINGS: PostWatermarkSettings = {
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

type PickerMode = 'library' | 'album';
type MediaType = 'image' | 'video';

type BatchQueueItem =
  | {
      id: string;
      kind: 'local';
      file: File;
      preview: string;
      mediaType: MediaType;
      content: string;
    }
  | {
      id: string;
      kind: 'library';
      libraryId: string;
      itemId: string;
      preview?: string;
      title?: string;
      rawUrl?: string;
      mediaType: MediaType;
      content: string;
    }
  | {
      id: string;
      kind: 'album';
      projectId: string;
      itemId: string;
      preview?: string;
      title?: string;
      rawUrl?: string;
      mediaType: MediaType;
      content: string;
    };

function importKey(mode: PickerMode, sourceId: string, itemId: string) {
  return JSON.stringify([mode, sourceId, itemId]);
}

function mediaSourceLabel(type: MediaType) {
  return type === 'video' ? 'Video' : 'Image';
}

function getFileMediaType(file: File): MediaType {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

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

interface WatermarkSettingsPanelProps {
  settings: PostWatermarkSettings;
  sampleUrl?: string;
  isSaving: boolean;
  onChange: (settings: PostWatermarkSettings) => void;
}

function WatermarkPreview({ settings, sampleUrl }: { settings: PostWatermarkSettings; sampleUrl?: string }) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
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

function WatermarkSettingsPanel({ settings, sampleUrl, isSaving, onChange }: WatermarkSettingsPanelProps) {
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
              Batch Watermark
            </h2>
            {settings.enabled && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Saved per user and applied to image posts created from this page.</p>
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
              {isSaving ? 'Saving watermark settings...' : 'Settings save after Confirm Batch runs.'}
            </div>
          </>
        )}
      </div>

      {settings.enabled && <WatermarkPreview settings={settings} sampleUrl={sampleUrl} />}
    </section>
  );
}

export function CampaignBatchCreate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [campaign, setCampaign] = useState<any>(null);
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [watermarkSettings, setWatermarkSettings] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const [isWatermarkSaving, setIsWatermarkSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      if (!id) return;
      setIsLoading(true);
      try {
        const watermarkPromise = fetchPostWatermarkSettings().catch((error) => {
          console.warn('Failed to load watermark settings', error);
          toast.error('Failed to load watermark settings');
          return DEFAULT_WATERMARK_SETTINGS;
        });
        const [campaignData, watermarkData] = await Promise.all([
          fetchCampaign(id),
          watermarkPromise,
        ]);
        if (cancelled) return;
        setCampaign(campaignData);
        setWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, ...watermarkData });
        setWatermarkLoaded(true);
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'Failed to load campaign');
          navigate('/campaigns');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
      setQueue((items) => {
        for (const item of items) {
          if (item.kind === 'local') URL.revokeObjectURL(item.preview);
        }
        return items;
      });
    };
  }, [id, navigate]);

  const watermarkPreviewUrl = useMemo(() => {
    const imageItem = queue.find((item) => item.mediaType === 'image');
    if (!imageItem) return undefined;
    return imageItem.kind === 'local' ? imageItem.preview : imageItem.preview;
  }, [queue]);

  const openPicker = (mode: PickerMode) => {
    setPickerMode(mode);
  };

  const closePicker = () => {
    setPickerMode(null);
  };

  const addPickedItemsToQueue = (pickedItems: UniversalPickedItem[]) => {
    const existingKeys = new Set(queue.map((item) => {
      if (item.kind === 'library') return importKey('library', item.libraryId, item.itemId);
      if (item.kind === 'album') return importKey('album', item.projectId, item.itemId);
      return item.id;
    }));

    const additions = pickedItems.flatMap<BatchQueueItem>((item) => {
      if (item.type !== 'image' && item.type !== 'video') return [];
      const key = importKey(item.sourceKind, item.sourceId, item.itemId);
      if (existingKeys.has(key)) return [];

      return item.sourceKind === 'library'
        ? [{
            id: crypto.randomUUID(),
            kind: 'library',
            libraryId: item.sourceId,
            itemId: item.itemId,
            preview: item.previewUrl,
            title: item.title || item.sourceName,
            rawUrl: item.rawUrl,
            mediaType: item.type,
            content: '',
          }]
        : [{
            id: crypto.randomUUID(),
            kind: 'album',
            projectId: item.sourceId,
            itemId: item.itemId,
            preview: item.previewUrl,
            title: item.title || item.sourceName,
            rawUrl: item.rawUrl,
            mediaType: item.type,
            content: '',
          }];
    });

    if (additions.length > 0) {
      setQueue((prev) => [...prev, ...additions]);
      toast.success(`Added ${additions.length} item${additions.length === 1 ? '' : 's'} to queue`);
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    const unsupported = nextFiles.find((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'));
    if (unsupported) {
      toast.error('Only images and videos are supported');
      return;
    }
    const drafts: BatchQueueItem[] = nextFiles.map((file) => ({
      id: crypto.randomUUID(),
      kind: 'local',
      file,
      preview: URL.createObjectURL(file),
      mediaType: getFileMediaType(file),
      content: '',
    }));
    setQueue((prev) => [...prev, ...drafts]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = '';
  };

  const removeQueueItem = (itemId: string) => {
    setQueue((prev) => {
      const item = prev.find((queueItem) => queueItem.id === itemId);
      if (item?.kind === 'local') URL.revokeObjectURL(item.preview);
      return prev.filter((queueItem) => queueItem.id !== itemId);
    });
  };

  const clearQueue = () => {
    for (const item of queue) {
      if (item.kind === 'local') URL.revokeObjectURL(item.preview);
    }
    setQueue([]);
  };

  const updateContent = (itemId: string, content: string) => {
    setQueue((prev) => prev.map((item) => item.id === itemId ? { ...item, content } : item));
  };

  const handleConfirm = async () => {
    if (!id || queue.length === 0) {
      toast.error('Please add at least one media item');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    let createdCount = 0;
    const failures: string[] = [];

    for (const item of queue) {
      try {
        let postId: string | undefined;
        if (item.kind === 'local') {
          const base64 = await readFileAsDataUrl(item.file);
          const result = await uploadCampaignMediaPosts(id, [{ base64, name: item.file.name }], watermarkSettings);
          postId = result.created[0]?.postId;
          createdCount += result.count;
        } else {
          const source: CampaignMediaImportSource = item.kind === 'library'
            ? { kind: 'library', libraryId: item.libraryId, itemId: item.itemId }
            : { kind: 'album', projectId: item.projectId, itemId: item.itemId };
          const result = await importCampaignMediaPosts(id, [source], watermarkSettings);
          postId = result.created[0]?.postId;
          createdCount += result.count;
        }

        const content = item.content?.trim();
        if (postId && content) {
          try {
            await updatePost(postId, { textContent: content, status: 'draft' });
          } catch (captionError: any) {
            console.warn('Failed to update caption', captionError);
          }
        }
      } catch (error: any) {
        const label = item.kind === 'local' ? item.file.name : item.title || item.itemId;
        failures.push(label);
        console.error('Batch item failed', error);
      } finally {
        setUploadProgress((prev) => prev + 1);
      }
    }

    if (watermarkLoaded) {
      setIsWatermarkSaving(true);
      try {
        await updatePostWatermarkSettings(watermarkSettings);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to save watermark settings');
      } finally {
        setIsWatermarkSaving(false);
      }
    }

    setIsUploading(false);

    if (createdCount > 0) {
      toast.success(`Successfully created ${createdCount} posts for ${campaign?.name}`);
    }
    if (failures.length > 0) {
      toast.error(`Failed to process ${failures.length} item${failures.length === 1 ? '' : 's'}`);
    }

    if (createdCount > 0) {
      clearQueue();
      navigate(`/campaigns/${id}/batch`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-8 pb-32">
        <PageHeader
          title="Create Batch"
          description={<>Queue media from uploads, libraries, or albums for <span className="font-semibold text-neutral-950 dark:text-white">{campaign?.name}</span></>}
          backLink={{ to: `/campaigns/${id}/batch`, label: 'Back to Batch Actions' }}
          actions={(
            <div className="flex items-center gap-3">
              <button className="h-10 rounded-xl border border-neutral-200/50 bg-white/40 px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => navigate(`/campaigns/${id}/batch`)}>Cancel</button>
              <button className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60" onClick={() => void handleConfirm()} disabled={isUploading || queue.length === 0}>
                {isUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing {uploadProgress}/{queue.length}...</> : <><CheckCircle2 className="h-4 w-4" /> Confirm Batch</>}
              </button>
            </div>
          )}
        />

        <div className="flex flex-col gap-3 rounded-card border border-neutral-200/60 bg-white/50 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/50 sm:flex-row sm:flex-wrap sm:items-center">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-200" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload Files
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-200" onClick={() => openPicker('library')}>
            <Images className="h-4 w-4" /> Pick Library
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-700 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-200" onClick={() => openPicker('album')}>
            <Layers className="h-4 w-4" /> Pick Album
          </button>
          <div className="text-xs font-medium text-neutral-500 sm:ml-auto">
            {queue.length} queued · 1 media item per post
          </div>
        </div>

        <WatermarkSettingsPanel
          settings={watermarkSettings}
          sampleUrl={watermarkPreviewUrl}
          isSaving={isWatermarkSaving}
          onChange={setWatermarkSettings}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (event.dataTransfer.files.length > 0) handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            'group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed p-8 transition-all md:p-12',
            isDragging
              ? 'scale-[0.99] border-indigo-500/50 bg-indigo-500/10 shadow-inner'
              : 'border-neutral-200 bg-white/40 hover:border-indigo-500/30 hover:bg-white/60 dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:border-indigo-500/30 dark:hover:bg-neutral-800/60',
          )}
        >
          <input type="file" multiple accept={POST_MEDIA_ACCEPT} className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <div className={cn('flex h-16 w-16 items-center justify-center rounded-full border shadow-sm transition-all', isDragging ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-neutral-200 bg-white text-neutral-500 group-hover:text-indigo-500 dark:border-white/10 dark:bg-neutral-900')}>
            <Upload className={cn('h-8 w-8', isDragging && 'animate-bounce')} />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-neutral-950 dark:text-white">{isDragging ? 'Drop files to queue' : 'Drag and drop images or video here'}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">or click to browse from your computer</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <span>JPG, PNG, WEBP, GIF, MP4</span>
            <span className="h-1 w-1 rounded-full bg-neutral-400" />
            <span>Library and album picks use the same queue below</span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-bold text-neutral-950 dark:text-white">
              Batch Queue
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">{queue.length}</span>
            </h2>
            {queue.length > 0 && (
              <button className="rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-500/10" onClick={clearQueue}>Clear All</button>
            )}
          </div>

          {queue.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {queue.map((item) => {
                const preview = item.kind === 'local' ? item.preview : item.preview;
                return (
                  <div key={item.id} className="group overflow-hidden rounded-card border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
                    <div className="flex h-48">
                      <div className="relative w-1/3 bg-neutral-100 dark:bg-neutral-800">
                        {preview ? (
                          item.mediaType === 'video' && item.kind === 'local'
                            ? <video src={preview} className="h-full w-full object-cover" />
                            : <img src={item.kind === 'local' ? preview : imageDisplayUrl(preview)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {item.mediaType === 'video' ? <Video className="h-6 w-6 text-neutral-400" /> : <ImageIcon className="h-6 w-6 text-neutral-400" />}
                          </div>
                        )}
                        <button className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); removeQueueItem(item.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400" title={item.kind === 'local' ? item.file.name : item.title || item.rawUrl || item.itemId}>
                            {item.kind === 'local' ? item.file.name : item.title || item.rawUrl || item.itemId}
                          </div>
                          <span className="shrink-0 rounded bg-neutral-950/10 px-1 text-[9px] font-bold uppercase text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                            {item.kind} · {mediaSourceLabel(item.mediaType)}
                          </span>
                        </div>
                        <textarea className="min-h-0 flex-1 resize-none rounded-xl border border-neutral-200/50 bg-white/40 p-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white" placeholder="Enter caption for this post..." value={item.content} onChange={(event) => updateContent(item.id, event.target.value)} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => fileInputRef.current?.click()} className="flex h-48 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-neutral-200 bg-neutral-100/20 text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-100/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Add more files</span>
              </button>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 bg-white/40 shadow-sm backdrop-blur-3xl dark:border-neutral-800 dark:bg-neutral-900/40">
              <ImageIcon className="mb-4 h-12 w-12 text-neutral-300" />
              <p className="font-medium text-neutral-500 dark:text-neutral-400">No media queued yet</p>
            </div>
          )}
        </div>
      </div>

      <UniversalMediaPicker
        isOpen={pickerMode !== null}
        title="Media Picker"
        allowedTypes={['image', 'video']}
        defaultSourceKind={pickerMode || 'library'}
        multiple
        onClose={closePicker}
        onConfirm={addPickedItemsToQueue}
      />
    </div>
  );
}

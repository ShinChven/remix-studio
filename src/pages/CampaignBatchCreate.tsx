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
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CampaignMediaImportSource,
  fetchCampaign,
  fetchLibraries,
  fetchLibraryItems,
  fetchPostWatermarkSettings,
  fetchProject,
  fetchProjects,
  imageDisplayUrl,
  importCampaignMediaPosts,
  PostWatermarkPosition,
  PostWatermarkSettings,
  updatePost,
  updatePostWatermarkSettings,
  uploadCampaignMediaPosts,
} from '../api';
import { PageHeader } from '../components/PageHeader';
import { AlbumItem, Library, LibraryItem, Project } from '../types';
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

interface PickerSource {
  id: string;
  name: string;
  description?: string;
  type: MediaType;
  itemCount: number;
}

interface PickerItem {
  id: string;
  title?: string;
  mediaType: MediaType;
  previewUrl?: string;
  rawUrl?: string;
  sourceLabel: string;
  aspectRatio?: string;
  quality?: string;
  resolution?: string;
}

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

function getCssAspectRatio(value?: string) {
  const ratio = value?.trim();
  if (!ratio) return '1 / 1';
  const match = ratio.match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return '1 / 1';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return '1 / 1';
  return `${width} / ${height}`;
}

function parseImportKey(key: string): [PickerMode, string, string] {
  return JSON.parse(key) as [PickerMode, string, string];
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

function libraryItemToPickerItem(item: LibraryItem, library: PickerSource): PickerItem {
  return {
    id: item.id,
    title: item.title,
    mediaType: library.type,
    previewUrl: library.type === 'video' ? item.thumbnailUrl : (item.thumbnailUrl || item.optimizedUrl || item.content),
    rawUrl: item.content,
    sourceLabel: library.name,
  };
}

function albumItemToPickerItem(item: AlbumItem, project: PickerSource): PickerItem {
  return {
    id: item.id,
    title: item.prompt || item.textContent || undefined,
    mediaType: project.type,
    previewUrl: project.type === 'video' ? item.thumbnailUrl : (item.thumbnailUrl || item.optimizedUrl || item.imageUrl),
    rawUrl: item.imageUrl,
    sourceLabel: project.name,
    aspectRatio: item.aspectRatio,
    quality: item.quality,
    resolution: item.resolution,
  };
}

interface MediaPickerModalProps {
  mode: PickerMode;
  sources: PickerSource[];
  activeSourceId: string | null;
  items: PickerItem[];
  selectedKeys: Set<string>;
  isLoadingItems: boolean;
  onClose: () => void;
  onSelectSource: (sourceId: string) => void;
  onToggleItem: (key: string) => void;
  onAddSelected: () => void;
}

function MediaPickerModal({
  mode,
  sources,
  activeSourceId,
  items,
  selectedKeys,
  isLoadingItems,
  onClose,
  onSelectSource,
  onToggleItem,
  onAddSelected,
}: MediaPickerModalProps) {
  const [query, setQuery] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [aspectRatioFilter, setAspectRatioFilter] = useState<string>('all');
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);
  const activeSource = sources.find((source) => source.id === activeSourceId);
  const selectedCount = selectedKeys.size;

  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
  }, [sources, sourceQuery]);

  const availableAspectRatios = useMemo(() => {
    const ratios = new Set<string>();
    items.forEach((item) => {
      if (item.aspectRatio) ratios.add(item.aspectRatio);
    });
    return Array.from(ratios).sort();
  }, [items]);

  useEffect(() => {
    setQuery('');
    setAspectRatioFilter('all');
    setLastSelectedKey(null);
  }, [activeSourceId]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q || (
        item.title?.toLowerCase().includes(q) ||
        item.sourceLabel.toLowerCase().includes(q) ||
        item.rawUrl?.toLowerCase().includes(q)
      );
      const matchesRatio = aspectRatioFilter === 'all' || item.aspectRatio === aspectRatioFilter;
      return matchesQuery && matchesRatio;
    });
  }, [items, query, aspectRatioFilter]);

  const filteredKeys = useMemo(() => (
    filteredItems.map((item) => importKey(mode, activeSourceId || '', item.id))
  ), [filteredItems, mode, activeSourceId]);

  const isAllFilteredSelected = filteredKeys.length > 0 && filteredKeys.every((key) => selectedKeys.has(key));

  const handleItemClick = (key: string, isShiftPressed: boolean) => {
    if (isShiftPressed && lastSelectedKey && lastSelectedKey !== key) {
      const lastIndex = filteredKeys.indexOf(lastSelectedKey);
      const currentIndex = filteredKeys.indexOf(key);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const shouldSelect = !selectedKeys.has(key);
        for (let i = start; i <= end; i++) {
          const rangeKey = filteredKeys[i];
          const isSelected = selectedKeys.has(rangeKey);
          if (shouldSelect !== isSelected) onToggleItem(rangeKey);
        }
        setLastSelectedKey(key);
        return;
      }
    }
    onToggleItem(key);
    setLastSelectedKey(key);
  };

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // Deselect all filtered items
      filteredKeys.forEach((key) => {
        if (selectedKeys.has(key)) onToggleItem(key);
      });
    } else {
      // Select all filtered items
      filteredKeys.forEach((key) => {
        if (!selectedKeys.has(key)) onToggleItem(key);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative flex h-[88vh] w-full max-w-7xl overflow-hidden rounded-card border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80 p-5 dark:border-white/10 dark:bg-neutral-900/80 md:flex">
          <div className="mb-5 flex shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              {mode === 'library' ? <Images className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-bold text-neutral-950 dark:text-white">{mode === 'library' ? 'Pick from Library' : 'Pick from Album'}</h3>
              <p className="text-xs text-neutral-500">Add selected media to queue</p>
            </div>
          </div>

          <div className="mb-4 shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                placeholder={mode === 'library' ? 'Search libraries...' : 'Search projects...'}
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-10 text-center dark:border-white/10">
                <Search className="mb-3 h-8 w-8 text-neutral-300" />
                <p className="px-4 text-xs font-bold text-neutral-950 dark:text-white">No matches found</p>
                <p className="mt-1 px-4 text-[10px] text-neutral-500">Try a different search term</p>
              </div>
            ) : (
              filteredSources.map((source) => {
                const active = source.id === activeSourceId;
                return (
                  <button
                    key={source.id}
                    className={cn(
                      'w-full rounded-card border p-4 text-left transition',
                      active
                        ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-white/10 dark:bg-neutral-950 dark:hover:border-white/20',
                    )}
                    onClick={() => onSelectSource(source.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-bold text-neutral-950 dark:text-white">{source.name}</span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500 dark:bg-white/10">
                        {mediaSourceLabel(source.type)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{source.description || `${source.itemCount} items`}</p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-4 dark:border-white/10 md:p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                {activeSource ? `${activeSource.name} · ${activeSource.itemCount} items` : 'No source selected'}
              </p>
              <h2 className="mt-1 text-lg font-bold text-neutral-950 dark:text-white md:text-xl">
                {mode === 'library' ? 'Library Media Picker' : 'Album Media Picker'}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">Selected media will be added to the batch queue.</p>
            </div>
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-white/10 md:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-900 dark:text-white"
                placeholder={mode === 'library' ? 'Search libraries...' : 'Search projects...'}
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
              />
            </div>
            <select
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-neutral-900 dark:text-white"
              value={activeSourceId || ''}
              onChange={(event) => onSelectSource(event.target.value)}
            >
              {!activeSourceId && <option value="">Select source...</option>}
              {filteredSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-white/10 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-900 dark:text-white"
                placeholder="Search items..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            
            <div className="flex shrink-0 items-center gap-3">
              {mode === 'album' && availableAspectRatios.length > 0 && (
                <select
                  className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-neutral-900 dark:text-white"
                  value={aspectRatioFilter}
                  onChange={(e) => setAspectRatioFilter(e.target.value)}
                >
                  <option value="all">All Ratios</option>
                  {availableAspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>{ratio}</option>
                  ))}
                </select>
              )}
              
              <button
                onClick={handleToggleSelectAll}
                className={cn(
                  "h-11 rounded-xl border px-4 text-sm font-bold transition whitespace-nowrap",
                  isAllFilteredSelected
                    ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-white/10"
                )}
              >
                {isAllFilteredSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
            {sources.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 text-center dark:border-white/10">
                <Images className="mb-4 h-12 w-12 text-neutral-300" />
                <p className="font-bold text-neutral-950 dark:text-white">No image or video sources found</p>
                <p className="mt-1 text-sm text-neutral-500">Create an image/video library or album first.</p>
              </div>
            ) : isLoadingItems ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                <p className="text-sm font-medium text-neutral-500">Loading media...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 text-center dark:border-white/10">
                <Search className="mb-4 h-12 w-12 text-neutral-300" />
                <p className="font-bold text-neutral-950 dark:text-white">No media found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => {
                  const key = importKey(mode, activeSourceId || '', item.id);
                  const selected = selectedKeys.has(key);
                  const aspectRatioStr = getCssAspectRatio(item.aspectRatio);
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        'group flex flex-col overflow-hidden rounded-card border bg-white text-left shadow-sm transition active:scale-[0.99] dark:bg-neutral-900',
                        selected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'border-neutral-200 hover:border-indigo-400/50 dark:border-white/10',
                      )}
                      onClick={(e) => handleItemClick(key, e.shiftKey)}
                    >
                      <div className="relative w-full shrink-0 bg-neutral-100 dark:bg-neutral-800" style={{ aspectRatio: aspectRatioStr }}>
                        {item.previewUrl ? (
                          <img src={imageDisplayUrl(item.previewUrl)} alt={item.title || item.id} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {item.mediaType === 'video' ? <Video className="h-8 w-8 text-neutral-400" /> : <ImageIcon className="h-8 w-8 text-neutral-400" />}
                          </div>
                        )}
                        <div className="absolute left-2 top-2 flex flex-col gap-1">
                          <div className="rounded-lg bg-black/70 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white w-fit">
                            {mediaSourceLabel(item.mediaType)}
                          </div>
                          {item.aspectRatio && (
                            <div className="rounded-lg bg-indigo-600/80 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white w-fit">
                              {item.aspectRatio}
                            </div>
                          )}
                          {(item.resolution || item.quality) && (
                            <div className="rounded-lg bg-emerald-600/80 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white w-fit">
                              {item.resolution || item.quality}
                            </div>
                          )}
                        </div>
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/30">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                              <CheckCircle2 className="h-6 w-6" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="mt-auto w-full p-3">
                        <p className="truncate text-sm font-bold text-neutral-950 dark:text-white">{item.title || item.id}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-neutral-500">{item.rawUrl || 'No raw key'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-neutral-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <p className="text-sm text-neutral-500">
              <span className="font-bold text-neutral-950 dark:text-white">{selectedCount}</span> selected
            </p>
            <div className="flex items-center gap-3">
              <button className="h-10 rounded-xl border border-neutral-200 px-4 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10" onClick={onClose}>
                Cancel
              </button>
              <button className="inline-flex h-10 min-w-[160px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60" onClick={onAddSelected} disabled={selectedCount === 0}>
                <Plus className="h-4 w-4" /> Add to Queue
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
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
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [watermarkSettings, setWatermarkSettings] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const [isWatermarkSaving, setIsWatermarkSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isLoadingItems, setIsLoadingItems] = useState(false);

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
        const [campaignData, librariesData, projectsData, watermarkData] = await Promise.all([
          fetchCampaign(id),
          fetchLibraries(1, 100, undefined, false),
          fetchProjects(1, 100, undefined, 'all'),
          watermarkPromise,
        ]);
        if (cancelled) return;
        setCampaign(campaignData);
        setLibraries(librariesData.items || []);
        setProjects(projectsData.items || []);
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

  const librarySources = useMemo<PickerSource[]>(() => (
    libraries
      .filter((library) => library.type === 'image' || library.type === 'video')
      .map((library) => ({
        id: library.id,
        name: library.name,
        description: library.description,
        type: library.type as MediaType,
        itemCount: library.itemCount ?? library.items?.length ?? 0,
      }))
  ), [libraries]);

  const albumSources = useMemo<PickerSource[]>(() => (
    projects
      .filter((project) => (project.type === 'image' || project.type === 'video') && ((project as any).albumCount ?? 0) > 0)
      .map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        type: project.type as MediaType,
        itemCount: (project as any).albumCount ?? project.album?.length ?? 0,
      }))
  ), [projects]);

  const activeLibrarySource = useMemo(
    () => librarySources.find((source) => source.id === activeLibraryId) || null,
    [activeLibraryId, librarySources],
  );

  const activeAlbumSource = useMemo(
    () => albumSources.find((source) => source.id === activeProjectId) || null,
    [activeProjectId, albumSources],
  );

  useEffect(() => {
    if (pickerMode !== 'library' || activeLibraryId || librarySources.length === 0) return;
    setActiveLibraryId(librarySources[0].id);
  }, [activeLibraryId, librarySources, pickerMode]);

  useEffect(() => {
    if (pickerMode !== 'album' || activeProjectId || albumSources.length === 0) return;
    setActiveProjectId(albumSources[0].id);
  }, [activeProjectId, albumSources, pickerMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraryItems() {
      if (pickerMode !== 'library' || !activeLibraryId) {
        setLibraryItems([]);
        return;
      }
      setIsLoadingItems(true);
      try {
        const data = await fetchLibraryItems(activeLibraryId, 1, 500);
        if (!cancelled) setLibraryItems(data.items || []);
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Failed to load library items');
      } finally {
        if (!cancelled) setIsLoadingItems(false);
      }
    }

    void loadLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [activeLibraryId, pickerMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbumItems() {
      if (pickerMode !== 'album' || !activeProjectId) {
        setAlbumItems([]);
        return;
      }
      setIsLoadingItems(true);
      try {
        const project = await fetchProject(activeProjectId);
        if (!cancelled) setAlbumItems(project.album || []);
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Failed to load album items');
      } finally {
        if (!cancelled) setIsLoadingItems(false);
      }
    }

    void loadAlbumItems();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, pickerMode]);

  const pickerSources = pickerMode === 'library' ? librarySources : albumSources;
  const activeSourceId = pickerMode === 'library' ? activeLibraryId : activeProjectId;
  const activeSource = pickerMode === 'library' ? activeLibrarySource : activeAlbumSource;
  const pickerItems = useMemo<PickerItem[]>(() => {
    if (!activeSource) return [];
    if (pickerMode === 'library') {
      return libraryItems.map((item) => libraryItemToPickerItem(item, activeSource));
    }
    return albumItems
      .filter((item) => item.imageUrl)
      .map((item) => albumItemToPickerItem(item, activeSource));
  }, [activeSource, albumItems, libraryItems, pickerMode]);

  const watermarkPreviewUrl = useMemo(() => {
    const imageItem = queue.find((item) => item.mediaType === 'image');
    if (!imageItem) return undefined;
    return imageItem.kind === 'local' ? imageItem.preview : imageItem.preview;
  }, [queue]);

  const openPicker = (mode: PickerMode) => {
    setSelectedKeys(new Set());
    setPickerMode(mode);
    if (mode === 'library' && !activeLibraryId && librarySources.length > 0) setActiveLibraryId(librarySources[0].id);
    if (mode === 'album' && !activeProjectId && albumSources.length > 0) setActiveProjectId(albumSources[0].id);
  };

  const closePicker = () => {
    setPickerMode(null);
    setSelectedKeys(new Set());
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

  const togglePickerItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addSelectedToQueue = () => {
    if (!pickerMode || !activeSourceId || selectedKeys.size === 0) return;
    const source = pickerMode === 'library' ? activeLibrarySource : activeAlbumSource;
    if (!source) return;

    const existingKeys = new Set(queue.map((item) => {
      if (item.kind === 'library') return importKey('library', item.libraryId, item.itemId);
      if (item.kind === 'album') return importKey('album', item.projectId, item.itemId);
      return item.id;
    }));

    const additions: BatchQueueItem[] = [];
    for (const key of selectedKeys) {
      if (existingKeys.has(key)) continue;
      const [mode, sourceId, itemId] = parseImportKey(key);
      const pickerItem = pickerItems.find((item) => item.id === itemId);
      if (!pickerItem) continue;
      additions.push(mode === 'library'
        ? {
            id: crypto.randomUUID(),
            kind: 'library',
            libraryId: sourceId,
            itemId,
            preview: pickerItem.previewUrl,
            title: pickerItem.title || source.name,
            rawUrl: pickerItem.rawUrl,
            mediaType: pickerItem.mediaType,
            content: '',
          }
        : {
            id: crypto.randomUUID(),
            kind: 'album',
            projectId: sourceId,
            itemId,
            preview: pickerItem.previewUrl,
            title: pickerItem.title || source.name,
            rawUrl: pickerItem.rawUrl,
            mediaType: pickerItem.mediaType,
            content: '',
          });
    }

    if (additions.length > 0) {
      setQueue((prev) => [...prev, ...additions]);
      toast.success(`Added ${additions.length} item${additions.length === 1 ? '' : 's'} to queue`);
    }
    closePicker();
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

      {pickerMode && (
        <MediaPickerModal
          mode={pickerMode}
          sources={pickerSources}
          activeSourceId={activeSourceId}
          items={pickerItems}
          selectedKeys={selectedKeys}
          isLoadingItems={isLoadingItems}
          onClose={closePicker}
          onSelectSource={pickerMode === 'library' ? setActiveLibraryId : setActiveProjectId}
          onToggleItem={togglePickerItem}
          onAddSelected={addSelectedToQueue}
        />
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Image as ImageIcon, Loader2, Package, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlbumExportVersion,
  fetchPostWatermarkSettings,
  fetchProject,
  fetchProjectAlbum,
  imageDisplayUrl,
  PostWatermarkSettings,
  startAlbumExport,
  updatePostWatermarkSettings,
} from '../api';
import type { AlbumItem, Project } from '../types';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';

type WatermarkExportLocationState = {
  itemIds?: string[];
  packageName?: string;
  exportVersion?: AlbumExportVersion;
};

function getDefaultExportPackageName(projectName?: string) {
  const safeName = (projectName || 'Album').replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${safeName}_watermark.zip`;
}

function getAlbumFilename(item: AlbumItem) {
  const path = (item.imageUrl || '').split('?')[0];
  const decoded = decodeURIComponent(path.split('/').pop() || '');
  return decoded || item.id;
}

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readScopedItemIds(searchParams: URLSearchParams, locationState: WatermarkExportLocationState | null): string[] | undefined {
  if (Array.isArray(locationState?.itemIds)) return locationState.itemIds;

  const scopeKey = searchParams.get('scopeKey');
  if (scopeKey) {
    try {
      const stored = sessionStorage.getItem(scopeKey);
      const parsed = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
    } catch {
      return undefined;
    }
  }

  const ids = searchParams.get('ids');
  if (ids) return ids.split(',').map((item) => item.trim()).filter(Boolean);
  return undefined;
}

export function ExportWatermark() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const locationState = location.state as WatermarkExportLocationState | null;
  const scopedItemIds = useMemo(() => readScopedItemIds(searchParams, locationState), [locationState, searchParams]);

  const [project, setProject] = useState<Project | null>(null);
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>([]);
  const [watermarkSettings, setWatermarkSettings] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [packageName, setPackageName] = useState(() => locationState?.packageName || searchParams.get('name') || '');
  const [exportVersion, setExportVersion] = useState<AlbumExportVersion>(() => {
    const version = locationState?.exportVersion || searchParams.get('version');
    return version === 'optimized' ? 'optimized' : 'raw';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingWatermark, setIsSavingWatermark] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      try {
        const [projectData, albumData, watermarkData] = await Promise.all([
          fetchProject(id),
          fetchProjectAlbum(id, { limit: 999999, sort: 'newest' }),
          fetchPostWatermarkSettings().catch((error) => {
            console.warn('Failed to load watermark settings', error);
            toast.error('Failed to load watermark settings');
            return DEFAULT_WATERMARK_SETTINGS;
          }),
        ]);
        if (cancelled) return;
        setProject(projectData);
        setAlbumItems(albumData.items);
        setWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, ...watermarkData });
        setPackageName((current) => current || getDefaultExportPackageName(projectData.name));
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'Failed to load export page');
          navigate(id ? `/project/${id}` : '/projects');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const selectedItems = useMemo(() => {
    if (!scopedItemIds) return albumItems;
    const selected = new Set(scopedItemIds);
    return albumItems.filter((item) => selected.has(item.id));
  }, [albumItems, scopedItemIds]);

  const sampleUrl = selectedItems[0]?.optimizedUrl || selectedItems[0]?.thumbnailUrl || selectedItems[0]?.imageUrl;
  const selectedSize = selectedItems.reduce((total, item) => {
    const size = exportVersion === 'optimized' ? item.optimizedSize || item.size : item.size;
    return total + (size || 0);
  }, 0);
  const canExport = Boolean(id && packageName.trim() && selectedItems.length > 0 && !isSubmitting && project?.type === 'image');

  const handleStartExport = async () => {
    if (!id || !canExport) return;

    setIsSubmitting(true);
    setIsSavingWatermark(true);
    try {
      await updatePostWatermarkSettings(watermarkSettings);
      setIsSavingWatermark(false);
      await startAlbumExport(id, scopedItemIds, packageName, exportVersion, { watermarkSettings });
      toast.success('Watermark export queued');
      navigate('/exports');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start watermark export');
    } finally {
      setIsSavingWatermark(false);
      setIsSubmitting(false);
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

  if (project?.type !== 'image') {
    return (
      <div className="relative flex h-full flex-col overflow-y-auto p-4 md:p-8">
        <PageHeader
          title="Export With Watermark"
          description="Watermark export is available for image projects."
          backLink={{ to: id ? `/project/${id}` : '/projects', label: 'Back to Project' }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-6 pb-32">
        <PageHeader
          title="Export With Watermark"
          description={<>Prepare a watermarked image ZIP for <span className="font-semibold text-neutral-950 dark:text-white">{project?.name}</span>.</>}
          backLink={{ to: id ? `/project/${id}` : '/projects', label: 'Back to Project' }}
          actions={(
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-200/50 bg-white/40 px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-white/10"
                onClick={() => navigate(id ? `/project/${id}` : '/projects')}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60"
                onClick={() => void handleStartExport()}
                disabled={!canExport}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isSubmitting ? 'Queueing...' : 'Start Export'}
              </button>
            </div>
          )}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <label className="block rounded-card border border-neutral-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/50">
            <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Package name</span>
            <input
              type="text"
              value={packageName}
              onChange={(event) => setPackageName(event.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200/60 bg-white/70 px-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
            />
          </label>

          <div className="rounded-card border border-neutral-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/50">
            <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Version</span>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-1">
              {[
                { value: 'raw' as const, label: 'Raw', icon: ImageIcon },
                { value: 'optimized' as const, label: 'Optimized', icon: Sparkles },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setExportVersion(value)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    exportVersion === value
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-neutral-500 hover:bg-white hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-white'
                  }`}
                  aria-pressed={exportVersion === value}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <WatermarkSettingsPanel
          settings={watermarkSettings}
          sampleUrl={sampleUrl}
          isSaving={isSavingWatermark}
          onChange={setWatermarkSettings}
          title="Export Watermark"
          description="Saved per user and applied to this image export."
          statusText="Settings save when export starts."
        />

        <section className="rounded-card border border-neutral-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/50">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-950 dark:text-white">
              <Package className="h-5 w-5 text-indigo-600" />
              Images
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">{selectedItems.length}</span>
            </h2>
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              {scopedItemIds ? 'Selected scope' : 'Full album'}{selectedSize ? ` - ${formatSize(selectedSize)}` : ''}
            </div>
          </div>

          {selectedItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {selectedItems.map((item, index) => {
                const thumb = item.thumbnailUrl || item.optimizedUrl || item.imageUrl;
                return (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/70 shadow-sm dark:border-white/10 dark:bg-neutral-950/60">
                    <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-900">
                      {thumb ? (
                        <img
                          src={imageDisplayUrl(thumb)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-neutral-400" />
                        </div>
                      )}
                      <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-white">
                        #{(index + 1).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-xs font-black text-neutral-900 dark:text-white" title={getAlbumFilename(item)}>
                        {getAlbumFilename(item)}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        <span className="truncate">{item.aspectRatio || item.format || 'Image'}</span>
                        <span className="shrink-0">{formatSize(exportVersion === 'optimized' ? item.optimizedSize || item.size : item.size)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-52 flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 bg-white/40 dark:border-neutral-800 dark:bg-neutral-950/40">
              <ImageIcon className="mb-3 h-10 w-10 text-neutral-300" />
              <p className="font-medium text-neutral-500 dark:text-neutral-400">No images found in this export scope</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

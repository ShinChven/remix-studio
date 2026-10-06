import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Image as ImageIcon, Images, Loader2, Sparkles, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlbumExportVersion,
  fetchPostWatermarkSettings,
  fetchQuickWatermarkSource,
  PostWatermarkSettings,
  QuickWatermarkSource,
  QuickWatermarkTarget,
  renderQuickWatermark,
} from '../api';
import { PageHeader } from '../components/PageHeader';
import { UniversalMediaPicker, UniversalPickedItem } from '../components/UniversalMediaPicker';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a moment to start the download before the blob goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface QuickWatermarkProps {
  source: 'album' | 'library';
}

/**
 * Choosing another image replaces this page's URL; what the user has set up
 * so far rides along in the navigation state.
 */
type QuickWatermarkLocationState = {
  watermarkSettings?: PostWatermarkSettings;
  version?: AlbumExportVersion;
  /** Where Back goes: a path, or null to step back through history. */
  back?: { path: string | null; label: string };
};

function quickWatermarkRoute(item: UniversalPickedItem) {
  const sourceId = encodeURIComponent(item.sourceId);
  const itemId = encodeURIComponent(item.itemId);
  return item.sourceKind === 'album'
    ? `/project/${sourceId}/album/${itemId}/watermark`
    : `/library/${sourceId}/items/${itemId}/watermark`;
}

/**
 * Watermark a single album or library image. The server renders the result
 * and sends it straight to the browser as a download; nothing is written to
 * storage, and the user's saved watermark settings are only read, never
 * changed — they also drive campaign posts, which a one-off stamp shouldn't touch.
 */
export function QuickWatermark({ source }: QuickWatermarkProps) {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const target = useMemo<QuickWatermarkTarget | null>(() => {
    if (!id || !itemId) return null;
    return source === 'album'
      ? { kind: 'album', projectId: id, itemId }
      : { kind: 'library', libraryId: id, itemId };
  }, [source, id, itemId]);
  const fallbackPath = source === 'album' ? `/project/${id}?tab=album` : `/library/${id}`;
  const locationState = location.state as QuickWatermarkLocationState | null;

  const [image, setImage] = useState<QuickWatermarkSource | null>(null);
  const [watermarkSettings, setWatermarkSettings] = useState<PostWatermarkSettings>({ ...DEFAULT_WATERMARK_SETTINGS, enabled: true });
  const [version, setVersion] = useState<AlbumExportVersion>('raw');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Back returns to the exact album or library view (page, filters) this was
  // opened from; a page loaded directly has no such history, so it goes to the
  // image's own album or library. Settled on arrival, then carried through
  // image switches, which replace this history entry.
  const [back] = useState(() => locationState?.back ?? {
    path: location.key === 'default' ? fallbackPath : null,
    label: source === 'album' ? 'Back to Album' : 'Back to Library',
  });

  const goBack = () => {
    if (back.path) navigate(back.path);
    else navigate(-1);
  };

  const handlePickImage = (items: UniversalPickedItem[]) => {
    const picked = items[0];
    setIsPickerOpen(false);
    if (!picked || (picked.sourceKind === source && picked.sourceId === id && picked.itemId === itemId)) return;
    const state: QuickWatermarkLocationState = { watermarkSettings, version, back };
    navigate(quickWatermarkRoute(picked), { replace: true, state });
  };

  useEffect(() => {
    if (!target) return;
    const currentTarget = target;
    const carried = locationState;
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      try {
        const [imageData, watermarkData] = await Promise.all([
          fetchQuickWatermarkSource(currentTarget),
          carried?.watermarkSettings ?? fetchPostWatermarkSettings().catch((error) => {
            console.warn('Failed to load watermark settings', error);
            return DEFAULT_WATERMARK_SETTINGS;
          }),
        ]);
        if (cancelled) return;
        setImage(imageData);
        setWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, ...watermarkData, enabled: true });
        setVersion(carried?.version === 'optimized' && imageData.optimizedUrl ? 'optimized' : 'raw');
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'Failed to load image');
          navigate(fallbackPath, { replace: true });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [target, navigate, fallbackPath]);

  const canCreate = Boolean(target && image && watermarkSettings.text.trim() && !isCreating && !isLoading);
  const selectedSize = version === 'optimized' ? image?.optimizedSize || image?.size : image?.size;
  // Preview the same file the server will render, with the same fallback.
  const previewUrl = version === 'optimized'
    ? image?.optimizedUrl || image?.rawUrl
    : image?.rawUrl || image?.optimizedUrl;

  const handleCreate = async () => {
    if (!target || !image || !canCreate) return;

    setIsCreating(true);
    try {
      const blob = await renderQuickWatermark(target, watermarkSettings, version);
      downloadBlob(blob, image.downloadName);
      toast.success('Watermarked image downloaded');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to watermark image');
    } finally {
      setIsCreating(false);
    }
  };

  if (!image) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-6 pb-32">
        <PageHeader
          title="Quick Watermark"
          description="Watermark one image from any album or library. The result downloads to this browser once and is not saved to storage."
          backLink={{ onClick: goBack, label: back.label }}
          actions={(
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-200/50 bg-white px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-white/10"
                onClick={goBack}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60"
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                title={watermarkSettings.text.trim() ? undefined : 'Enter watermark text first'}
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          )}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 rounded-card border border-neutral-200/60 bg-white p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Image</span>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 transition hover:border-indigo-500/40 hover:text-indigo-600 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:text-indigo-400"
                onClick={() => setIsPickerOpen(true)}
                disabled={isCreating || isLoading}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Images className="h-3.5 w-3.5" />}
                Choose image
              </button>
            </div>
            <p className="truncate text-sm font-bold text-neutral-950 dark:text-white" title={image.filename}>
              {image.filename}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-neutral-500 dark:text-neutral-400" title={image.containerName}>
              {source === 'album' ? 'Album' : 'Library'} - {image.containerName}
            </p>
            <p className="mt-2 truncate text-xs font-medium text-neutral-500 dark:text-neutral-400" title={image.downloadName}>
              Downloads as <span className="font-mono font-bold text-neutral-700 dark:text-neutral-200">{image.downloadName}</span>
              {formatSize(selectedSize) ? ` - source ${formatSize(selectedSize)}` : ''}
            </p>
          </div>

          {image.optimizedUrl && (
            <div className="rounded-card border border-neutral-200/60 bg-white p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900">
              <span className="mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500">Version</span>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-1">
                {[
                  { value: 'raw' as const, label: 'Raw', icon: ImageIcon },
                  { value: 'optimized' as const, label: 'Optimized', icon: Sparkles },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVersion(value)}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                      version === value
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                        : 'text-neutral-500 hover:bg-white hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-white'
                    }`}
                    aria-pressed={version === value}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <WatermarkSettingsPanel
          settings={watermarkSettings}
          sampleUrl={previewUrl}
          isSaving={isCreating}
          onChange={setWatermarkSettings}
          title="Watermark"
          description="Starts from your saved watermark settings. Changes here apply to this image only and are not saved."
          statusText="Click Create to download the watermarked JPEG. Nothing is kept on the server."
          savingText="Creating watermarked image..."
          showEnabledToggle={false}
        />
      </div>

      <UniversalMediaPicker
        isOpen={isPickerOpen}
        title="Choose Image"
        allowedTypes={['image']}
        defaultSourceKind={source}
        defaultSourceId={id}
        multiple={false}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={handlePickImage}
      />
    </div>
  );
}

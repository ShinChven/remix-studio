import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchPostWatermarkSettings, fetchQuickWatermarkSource, renderQuickWatermark, type AlbumExportVersion, type PostWatermarkSettings, type QuickWatermarkSource, type QuickWatermarkTarget } from '../../api';
import { Button, Icon, Text, useSnackbar } from '../../m3';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Segmented } from '../ui/Toolbar';

const formatSize = (bytes?: number) => (!bytes || bytes <= 0 ? null : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Watermarks one album or library image and downloads it. Nothing is stored, and the saved
 * watermark settings are only read: they also drive campaign posts.
 */
export function QuickWatermark({ source }: { source: 'album' | 'library' }) {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const location = useLocation();
  const target = useMemo<QuickWatermarkTarget | null>(() => {
    if (!id || !itemId) return null;
    return source === 'album' ? { kind: 'album', projectId: id, itemId } : { kind: 'library', libraryId: id, itemId };
  }, [source, id, itemId]);
  const fallbackPath = source === 'album' ? `/project/${id}?tab=album` : `/library/${id}`;
  const backLabel = source === 'album' ? 'Back to Album' : 'Back to Library';
  const [image, setImage] = useState<QuickWatermarkSource | null>(null);
  const [watermark, setWatermark] = useState<PostWatermarkSettings>({ ...DEFAULT_WATERMARK_SETTINGS, enabled: true });
  const [version, setVersion] = useState<AlbumExportVersion>('raw');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Opened in its own tab from the album or library: closing it returns to the exact view.
  const goBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    window.close();
    if (!window.closed) navigate(fallbackPath);
  };

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [img, settings] = await Promise.all([
          fetchQuickWatermarkSource(target),
          fetchPostWatermarkSettings().catch((error) => {
            console.warn('Failed to load watermark settings', error);
            return DEFAULT_WATERMARK_SETTINGS;
          }),
        ]);
        if (cancelled) return;
        setImage(img);
        setWatermark({ ...DEFAULT_WATERMARK_SETTINGS, ...settings, enabled: true });
      } catch (error) {
        if (!cancelled) {
          snackbar.show((error as Error)?.message || 'Failed to load image');
          navigate(fallbackPath, { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, navigate, fallbackPath]);

  const canCreate = Boolean(target && image && watermark.text.trim() && !creating);
  const size = version === 'optimized' ? image?.optimizedSize || image?.size : image?.size;
  const previewUrl = version === 'optimized' ? image?.optimizedUrl || image?.rawUrl : image?.rawUrl || image?.optimizedUrl;

  const create = async () => {
    if (!target || !image || !canCreate) return;
    setCreating(true);
    try {
      downloadBlob(await renderQuickWatermark(target, watermark, version), image.downloadName);
      snackbar.show('Watermarked image downloaded');
    } catch (error) {
      snackbar.show((error as Error)?.message || 'Failed to watermark image');
    } finally {
      setCreating(false);
    }
  };

  if (loading || !image) return <LoadingState label="Loading..." minHeight={400} />;

  return (
    <Page width="default" density="compact">
      <PageHeader
        title="Quick Watermark"
        description={
          <>
            Watermark <strong className="text-on-surface">{image.filename}</strong> from <strong className="text-on-surface">{image.containerName}</strong>. The result downloads to this browser once and is not saved to storage.
          </>
        }
        backLink={{ onClick: goBack, label: backLabel }}
        actions={
          <>
            <Button variant="text" onClick={goBack} disabled={creating}>
              Close
            </Button>
            <Button variant="filled" icon="approval" loading={creating} disabled={!canCreate} onClick={() => void create()} title={watermark.text.trim() ? undefined : 'Enter watermark text first'} emphasized>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <Section variant="tonal" icon={<Icon name="download" />} title="Download as">
            <Text variant="label-large" emphasized className="truncate font-mono" title={image.downloadName}>
              {image.downloadName}
            </Text>
            <Text variant="body-small" className="text-on-surface-variant">
              JPEG{formatSize(size) ? ` - source ${formatSize(size)}` : ''}
            </Text>
          </Section>
          {image.optimizedUrl && (
            <Segmented<AlbumExportVersion>
              aria-label="Version"
              value={version}
              onChange={setVersion}
              options={[
                { value: 'raw', label: 'Raw', icon: 'image' },
                { value: 'optimized', label: 'Optimized', icon: 'auto_awesome' },
              ]}
            />
          )}
        </div>
        <WatermarkSettingsPanel
          settings={watermark}
          sampleUrl={previewUrl}
          isSaving={creating}
          onChange={setWatermark}
          title="Watermark"
          description="Starts from your saved watermark settings. Changes here apply to this image only and are not saved."
          statusText="Click Create to download the watermarked JPEG. Nothing is kept on the server."
          savingText="Creating watermarked image..."
          showEnabledToggle={false}
        />
      </div>
    </Page>
  );
}

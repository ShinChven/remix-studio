import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchPostWatermarkSettings, fetchQuickWatermarkSource, renderQuickWatermark, type AlbumExportVersion, type PostWatermarkSettings, type QuickWatermarkSource, type QuickWatermarkTarget } from '../../api';
import { Button, Icon, Text } from '../../m3';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Segmented } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';
import { errorText } from '../lib/errors';
import { formatBytes } from '../lib/format';

const formatSize = (bytes?: number) => (!bytes || bytes <= 0 ? null : formatBytes(bytes));

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
  const { t } = useTranslation();
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const target = useMemo<QuickWatermarkTarget | null>(() => {
    if (!id || !itemId) return null;
    return source === 'album' ? { kind: 'album', projectId: id, itemId } : { kind: 'library', libraryId: id, itemId };
  }, [source, id, itemId]);
  const fallbackPath = source === 'album' ? `/project/${id}?tab=album` : `/library/${id}`;
  const backLabel = source === 'album' ? t('v2.watermark.backToAlbum') : t('v2.watermark.backToLibrary');
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
          toast.error(errorText(error, t('v2.watermark.imageLoadFailed')));
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
      toast.success(t('v2.watermark.downloaded'));
    } catch (error) {
      toast.error(errorText(error, t('v2.watermark.createFailed')));
    } finally {
      setCreating(false);
    }
  };

  if (loading || !image) return <LoadingState label={t('projectViewer.common.loading')} minHeight={400} />;

  return (
    <Page width="default" density="compact">
      <PageHeader
        title={t('v2.watermark.quickTitle')}
        description={
          t('v2.watermark.quickDescription', { filename: image.filename, container: image.containerName })
        }
        backLink={{ onClick: goBack, label: backLabel }}
        actions={
          <>
            <Button variant="text" onClick={goBack} disabled={creating}>
              {t('projectViewer.common.close')}
            </Button>
            <Button variant="filled" icon="approval" loading={creating} disabled={!canCreate} onClick={() => void create()} title={watermark.text.trim() ? undefined : t('v2.watermark.enterText')} emphasized>
              {creating ? t('v2.watermark.creating') : t('v2.watermark.create')}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <Section variant="tonal" icon={<Icon name="download" />} title={t('v2.watermark.downloadAs')}>
            <Text variant="label-large" emphasized className="truncate font-mono" title={image.downloadName}>
              {image.downloadName}
            </Text>
            <Text variant="body-small" className="text-on-surface-variant">
              {formatSize(size) ? t('v2.watermark.sourceSize', { size: formatSize(size) }) : 'JPEG'}
            </Text>
          </Section>
          {image.optimizedUrl && (
            <Segmented<AlbumExportVersion>
              aria-label={t('v2.watermark.version')}
              value={version}
              onChange={setVersion}
              options={[
                { value: 'raw', label: t('v2.watermark.raw'), icon: 'image' },
                { value: 'optimized', label: t('v2.watermark.optimized'), icon: 'auto_awesome' },
              ]}
            />
          )}
        </div>
        <WatermarkSettingsPanel
          settings={watermark}
          sampleUrl={previewUrl}
          isSaving={creating}
          onChange={setWatermark}
          title={t('v2.watermark.title')}
          description={t('v2.watermark.quickSettingsDescription')}
          statusText={t('v2.watermark.quickStatus')}
          savingText={t('v2.watermark.quickSaving')}
          showEnabledToggle={false}
        />
      </div>
    </Page>
  );
}

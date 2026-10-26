import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchPostWatermarkSettings, fetchProject, fetchProjectAlbum, imageDisplayUrl, startAlbumExport, updatePostWatermarkSettings, type AlbumExportVersion, type PostWatermarkSettings } from '../../api';
import { projectMediaType } from '../../lib/project-media';
import { Button, Icon, TextField, useSnackbar } from '../../m3';
import type { AlbumItem, Project } from '../../types';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatusPill } from '../ui/Stat';
import { ThumbTile } from '../ui/ThumbTile';
import { Segmented } from '../ui/Toolbar';

type LocationState = { itemIds?: string[]; packageName?: string; exportVersion?: AlbumExportVersion };

const defaultPackageName = (projectName?: string) => `${(projectName || 'Album').replace(/[^a-zA-Z0-9-_]/g, '_')}_watermark.zip`;
const albumFilename = (item: AlbumItem) => decodeURIComponent((item.imageUrl || '').split('?')[0].split('/').pop() || '') || item.id;
const formatSize = (bytes?: number) => (!bytes || bytes <= 0 ? null : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Album items a watermark export covers: from navigation state, a session scope key, or `ids`. */
export function readScopedItemIds(searchParams: URLSearchParams, state: LocationState | null): string[] | undefined {
  if (Array.isArray(state?.itemIds)) return state.itemIds;
  const scopeKey = searchParams.get('scopeKey');
  if (scopeKey) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(scopeKey) || 'null');
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
    } catch {
      return undefined;
    }
  }
  const ids = searchParams.get('ids');
  return ids ? ids.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
}

export function ExportWatermark() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = location.state as LocationState | null;
  const scoped = useMemo(() => readScopedItemIds(searchParams, state), [state, searchParams]);
  const [project, setProject] = useState<Project | null>(null);
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>([]);
  const [watermark, setWatermark] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [packageName, setPackageName] = useState(() => state?.packageName || searchParams.get('name') || '');
  const [version, setVersion] = useState<AlbumExportVersion>(() => ((state?.exportVersion || searchParams.get('version')) === 'optimized' ? 'optimized' : 'raw'));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingWatermark, setSavingWatermark] = useState(false);
  const back = id ? `/project/${id}` : '/projects';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [proj, album, settings] = await Promise.all([
          fetchProject(id),
          fetchProjectAlbum(id, { limit: 999999, sort: 'newest' }),
          fetchPostWatermarkSettings().catch((error) => {
            console.warn('Failed to load watermark settings', error);
            snackbar.show('Failed to load watermark settings');
            return DEFAULT_WATERMARK_SETTINGS;
          }),
        ]);
        if (cancelled) return;
        setProject(proj);
        setAlbumItems(album.items);
        setWatermark({ ...DEFAULT_WATERMARK_SETTINGS, ...settings });
        setPackageName((current) => current || defaultPackageName(proj.name));
      } catch (error) {
        if (!cancelled) {
          snackbar.show((error as Error)?.message || 'Failed to load export page');
          navigate(back);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  const items = useMemo(() => {
    if (!scoped) return albumItems;
    const set = new Set(scoped);
    return albumItems.filter((item) => set.has(item.id));
  }, [albumItems, scoped]);
  const sampleUrl = items[0]?.optimizedUrl || items[0]?.thumbnailUrl || items[0]?.imageUrl;
  const size = items.reduce((sum, item) => sum + ((version === 'optimized' ? item.optimizedSize || item.size : item.size) || 0), 0);
  const isImageProject = project ? projectMediaType(project) === 'image' : false;
  const canExport = Boolean(id && packageName.trim() && items.length > 0 && !submitting && isImageProject);

  const start = async () => {
    if (!id || !canExport) return;
    setSubmitting(true);
    setSavingWatermark(true);
    try {
      await updatePostWatermarkSettings(watermark);
      setSavingWatermark(false);
      await startAlbumExport(id, scoped, packageName, version, { watermarkSettings: watermark });
      snackbar.show('Watermark export queued');
      navigate('/exports');
    } catch (error) {
      snackbar.show((error as Error)?.message || 'Failed to start watermark export');
    } finally {
      setSavingWatermark(false);
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading..." minHeight={400} />;
  if (!project || !isImageProject) {
    return (
      <Page>
        <PageHeader title="Export With Watermark" description="Watermark export is available for image projects." backLink={{ to: back, label: 'Back to Project' }} />
      </Page>
    );
  }

  return (
    <Page density="compact">
      <PageHeader
        title="Export With Watermark"
        description={
          <>
            Prepare a watermarked image ZIP for <strong className="text-on-surface">{project.name}</strong>.
          </>
        }
        backLink={{ to: back, label: 'Back to Project' }}
        actions={
          <>
            <Button variant="text" disabled={submitting} onClick={() => navigate(back)}>
              Cancel
            </Button>
            <Button variant="filled" icon="download" loading={submitting} disabled={!canExport} onClick={() => void start()} emphasized>
              {submitting ? 'Queueing...' : 'Start Export'}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <TextField variant="outlined" label="Package name" leadingIcon="folder_zip" value={packageName} onValueChange={setPackageName} fullWidth />
          <Segmented<AlbumExportVersion>
            aria-label="Version"
            value={version}
            onChange={setVersion}
            options={[
              { value: 'raw', label: 'Raw', icon: 'image' },
              { value: 'optimized', label: 'Optimized', icon: 'auto_awesome' },
            ]}
          />
        </div>
        <WatermarkSettingsPanel
          settings={watermark}
          sampleUrl={sampleUrl}
          isSaving={savingWatermark}
          onChange={setWatermark}
          title="Export Watermark"
          description="Saved per user and applied to this image export."
          statusText="Settings save when export starts."
        />
        <Section
          variant="card"
          icon={<Icon name="inventory_2" />}
          title={
            <span className="inline-flex items-center gap-2">
              Images <StatusPill>{items.length}</StatusPill>
            </span>
          }
          actions={
            <StatusPill tone="secondary">
              {scoped ? 'Selected scope' : 'Full album'}
              {size ? ` - ${formatSize(size)}` : ''}
            </StatusPill>
          }
        >
          {items.length > 0 ? (
            <div className="v2-thumb-grid">
              {items.map((item, index) => {
                const thumb = item.thumbnailUrl || item.optimizedUrl || item.imageUrl;
                return (
                  <ThumbTile
                    key={item.id}
                    src={thumb ? imageDisplayUrl(thumb) : null}
                    badge={`#${(index + 1).toString().padStart(2, '0')}`}
                    title={albumFilename(item)}
                    meta={item.aspectRatio || item.format || 'Image'}
                    trailing={formatSize(version === 'optimized' ? item.optimizedSize || item.size : item.size)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState size="inline" icon="image" title="No images found in this export scope" />
          )}
        </Section>
      </div>
    </Page>
  );
}

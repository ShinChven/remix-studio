import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createProduct,
  fetchPostWatermarkSettings,
  fetchProductExports,
  fetchProject,
  fetchProjectAlbum,
  fetchStores,
  updatePostWatermarkSettings,
  type ConnectedStore,
  type CreateProductInput,
  type PostWatermarkSettings,
  type ProductCoverItem,
} from '../../api';
import { Button, Checkbox, ChipSet, AssistChip, Icon, IconButton, Select, Switch, Text, TextField, useSnackbar } from '../../m3';
import type { AlbumItem, ExportTask, Project } from '../../types';
import { MediaPicker, type UniversalPickedItem } from '../components/MediaPicker';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';

const MAX_COVERS = 8;
const stripZip = (name?: string | null) => (name ? name.replace(/\.zip$/i, '').trim() : '');
const isImageItem = (item: AlbumItem) => (!item.format ? Boolean(item.imageUrl) : ['png', 'jpeg', 'webp'].includes(item.format));

export function SellExport() {
  const { exportId } = useParams<{ exportId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exportTask, setExportTask] = useState<ExportTask | null>(null);
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [title, setTitle] = useState('');
  const [priceUsd, setPriceUsd] = useState('5.00');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [taxonomyId, setTaxonomyId] = useState('');
  const [covers, setCovers] = useState<ProductCoverItem[]>([]);
  const [picked, setPicked] = useState<Record<string, UniversalPickedItem>>({});
  const [watermark, setWatermark] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [watermarkSaving, setWatermarkSaving] = useState(false);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [dragged, setDragged] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (!exportId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [storesRes, task, watermarkRes] = await Promise.all([
          fetchStores(),
          fetchProductExports(exportId),
          fetchPostWatermarkSettings().catch((error) => {
            console.warn('Failed to load watermark settings', error);
            return DEFAULT_WATERMARK_SETTINGS;
          }),
        ]);
        if (cancelled) return;
        setStores(storesRes);
        setWatermark({ ...DEFAULT_WATERMARK_SETTINGS, ...watermarkRes });
        if (storesRes.length === 1) setStoreId(storesRes[0].id);
        setExportTask(task);
        setTitle(stripZip(task?.packageName) || task?.projectName || '');
        if (task?.projectId) {
          try {
            const [proj, albumPage] = await Promise.all([fetchProject(task.projectId), fetchProjectAlbum(task.projectId)]);
            if (!cancelled) setProject({ ...proj, album: albumPage.items });
          } catch {
            // Without an album the covers stay empty.
          }
        }
      } catch (err) {
        if (!cancelled) snackbar.show((err as Error)?.message || t('releases.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportId, t]);

  const albumImages = useMemo(() => (project?.album || []).filter(isImageItem), [project]);
  const tags = useMemo(() => tagsInput.split(',').map((s) => s.trim()).filter(Boolean), [tagsInput]);
  const priceCents = useMemo(() => {
    const v = Number.parseFloat(priceUsd);
    return !Number.isFinite(v) || v < 0 ? NaN : Math.round(v * 100);
  }, [priceUsd]);

  const coverSrc = (c: ProductCoverItem) => {
    const local = albumImages.find((a) => a.id === c.albumItemId);
    const p = picked[c.albumItemId];
    return c.useRaw
      ? local?.imageUrl || p?.rawUrl || ''
      : local?.thumbnailUrl || local?.optimizedUrl || local?.imageUrl || p?.thumbnailUrl || p?.optimizedUrl || p?.previewUrl || p?.rawUrl || '';
  };
  const previewUrl = covers[0] ? coverSrc(covers[0]) || undefined : undefined;

  const canSubmit = !!storeId && title.trim().length > 0 && Number.isFinite(priceCents) && priceCents >= 0 && !!exportTask && exportTask.status === 'completed' && !submitting;

  const move = (from: number, to: number) => {
    if (from === to) return;
    setCovers((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const submit = async () => {
    if (!exportTask || !canSubmit) return;
    setSubmitting(true);
    setWatermarkSaving(true);
    try {
      await updatePostWatermarkSettings(watermark);
      setWatermarkSaving(false);
      const input: CreateProductInput = {
        storeId,
        exportTaskId: exportTask.id,
        title: title.trim(),
        priceCents,
        currency: 'usd',
        description: description.trim() || null,
        taxonomyId: taxonomyId.trim() || null,
        tags,
        coverItems: covers,
        coverWatermarkSettings: watermark,
        publishImmediately,
      };
      await createProduct(input);
      snackbar.show(t('sell.queued'));
      navigate('/exports');
    } catch (err) {
      snackbar.show((err as Error)?.message || t('sell.failed'));
    } finally {
      setWatermarkSaving(false);
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState minHeight={400} />;
  if (!exportTask) return <EmptyState icon="error" title={t('sell.exportNotFound')} />;
  if (exportTask.status !== 'completed') return <EmptyState icon="hourglass_top" title={t('sell.exportNotReady')} />;

  return (
    <Page width="default" density="compact">
      <PageHeader
        title={t('sell.title')}
        description={t('sell.description')}
        backLink={{ to: '/exports', label: t('releases.backToExports') }}
        actions={
          <>
            <Button variant="text" onClick={() => navigate('/exports')}>
              {t('sell.cancel')}
            </Button>
            <Button variant="filled" icon="package_2" loading={submitting} disabled={!canSubmit} onClick={() => void submit()} emphasized>
              {t('sell.confirm')}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        {stores.length === 0 && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="storefront" />
            <Text variant="body-medium" className="flex-1">
              {t('sell.noStoresHint')}
            </Text>
            <Button variant="text" size="xs" href="/exports/releases">
              {t('releases.headerLink')}
            </Button>
          </div>
        )}

        <Section variant="card" icon={<Icon name="storefront" />} title={t('sell.section.store')}>
          <Select
            variant="outlined"
            label={t('sell.field.store')}
            placeholder={t('sell.field.storePlaceholder')}
            value={storeId || null}
            onChange={setStoreId}
            options={stores.map((s) => ({ value: s.id, label: `${s.profileName || s.email || s.accountId} (${s.platform})` }))}
            fullWidth
          />
        </Section>

        <Section variant="card" icon={<Icon name="inventory_2" />} title={t('sell.section.product')}>
          <TextField variant="outlined" label={t('sell.field.title')} value={title} onValueChange={setTitle} maxLength={200} showCounter={false} fullWidth />
          <TextField
            variant="outlined"
            label={t('sell.field.price')}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            prefixText="$"
            suffixText="USD"
            value={priceUsd}
            onValueChange={setPriceUsd}
            className="v2-number-field max-w-[240px]"
          />
          <TextField variant="outlined" label={t('sell.field.description')} value={description} onValueChange={setDescription} multiline rows={4} maxRows={12} fullWidth />
          <TextField variant="outlined" label={t('sell.field.tags')} placeholder={t('sell.field.tagsPlaceholder')} value={tagsInput} onValueChange={setTagsInput} fullWidth />
          {tags.length > 0 && (
            <ChipSet>
              {tags.map((tag) => (
                <AssistChip key={tag} label={tag} icon="sell" />
              ))}
            </ChipSet>
          )}
          <TextField variant="outlined" label={t('sell.field.taxonomy')} placeholder={t('sell.field.taxonomyPlaceholder')} value={taxonomyId} onValueChange={setTaxonomyId} fullWidth />
          <Switch label={t('sell.field.publishImmediately')} labelPosition="end" checked={publishImmediately} onChange={(e) => setPublishImmediately(e.target.checked)} />
        </Section>

        <Section
          variant="card"
          icon={<Icon name="photo_library" />}
          title={`${t('sell.section.covers')} (${covers.length}/${MAX_COVERS})`}
          description={t('sell.covers.hint')}
          actions={
            <Button variant="tonal" size="xs" icon="add" onClick={() => setPickerOpen(true)}>
              {t('sell.covers.pick')}
            </Button>
          }
        >
          <WatermarkSettingsPanel
            settings={watermark}
            sampleUrl={previewUrl}
            isSaving={watermarkSaving}
            onChange={setWatermark}
            title="Listing Cover Watermark"
            description="Saved per user and applied to Gumroad cover images added from this page."
            statusText="Settings save when the listing is created."
          />
          {covers.length === 0 ? (
            <EmptyState size="inline" icon="add_photo_alternate" title={t('sell.covers.empty')} />
          ) : (
            <>
              <Text variant="body-small" className="text-on-surface-variant">
                {t('sell.covers.reorderHint')}
              </Text>
              <div className="v2-cover-grid">
                {covers.map((c, index) => {
                  const src = coverSrc(c);
                  if (!src) return null;
                  return (
                    <div
                      key={c.albumItemId}
                      className="v2-cover"
                      data-dragging={dragged === index ? '' : undefined}
                      data-over={dragOver === index ? '' : undefined}
                      draggable
                      onDragStart={(e: DragEvent) => {
                        setDragged(index);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e: DragEvent) => {
                        e.preventDefault();
                        if (dragOver !== index) setDragOver(index);
                      }}
                      onDrop={(e: DragEvent) => {
                        e.preventDefault();
                        if (dragged !== null) move(dragged, index);
                        setDragged(null);
                        setDragOver(null);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDragOver(null);
                      }}
                    >
                      <img src={src} alt="" draggable={false} />
                      <span className="v2-cover__index" title={t('sell.covers.dragToReorder')}>
                        <Icon name="drag_indicator" size={14} />
                        {index + 1}
                      </span>
                      <IconButton icon="delete" label={t('sell.covers.remove')} size="xs" variant="filled" className="v2-cover__remove" onClick={() => setCovers((prev) => prev.filter((x) => x.albumItemId !== c.albumItemId))} />
                      <div className="v2-cover__bar">
                        <Checkbox
                          label={t('sell.covers.useRaw')}
                          checked={!!c.useRaw}
                          onChange={(e) => setCovers((prev) => prev.map((x) => (x.albumItemId === c.albumItemId ? { ...x, useRaw: e.target.checked } : x)))}
                        />
                        <span className="flex">
                          <IconButton icon="chevron_left" label={t('sell.covers.moveEarlier')} size="xs" disabled={index === 0} onClick={() => move(index, index - 1)} />
                          <IconButton icon="chevron_right" label={t('sell.covers.moveLater')} size="xs" disabled={index === covers.length - 1} onClick={() => move(index, index + 1)} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>
      </div>

      {pickerOpen && (
        <MediaPicker
          isOpen
          title={t('sell.covers.pickerTitle')}
          allowedTypes={['image']}
          sourceKinds={['album']}
          fixedSourceId={project?.id}
          multiple
          onClose={() => setPickerOpen(false)}
          onConfirm={(items) => {
            const nextMap = { ...picked };
            const next = [...covers];
            items.forEach((it) => {
              if (next.length >= MAX_COVERS) return;
              if (!next.find((c) => c.albumItemId === it.itemId)) {
                next.push({ albumItemId: it.itemId, useRaw: false });
                nextMap[it.itemId] = it;
              }
            });
            if (items.length > 0 && next.length >= MAX_COVERS && items.length > MAX_COVERS - covers.length) snackbar.show(t('sell.coversLimit', { count: MAX_COVERS }));
            setPicked(nextMap);
            setCovers(next);
          }}
        />
      )}
    </Page>
  );
}

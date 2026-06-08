import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Package, Plus, Store as StoreIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ConnectedStore,
  CreateProductInput,
  ProductCoverItem,
  createProduct,
  fetchPostWatermarkSettings,
  fetchProductExports,
  fetchProject,
  fetchProjectAlbum,
  fetchStores,
  PostWatermarkSettings,
  updatePostWatermarkSettings,
} from '../api';
import { AlbumItem, ExportTask, Project } from '../types';
import { PageHeader } from '../components/PageHeader';
import { UniversalMediaPicker, UniversalPickedItem } from '../components/UniversalMediaPicker';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';

const MAX_COVERS = 8;

function stripZipExtension(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\.zip$/i, '').trim();
}

function isImageItem(item: AlbumItem): boolean {
  if (!item.format) return Boolean(item.imageUrl);
  return ['png', 'jpeg', 'webp'].includes(item.format);
}

export function SellExport() {
  const { exportId } = useParams<{ exportId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exportTask, setExportTask] = useState<ExportTask | null>(null);
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);

  // Form state
  const [storeId, setStoreId] = useState('');
  const [title, setTitle] = useState('');
  const [priceUsd, setPriceUsd] = useState('5.00');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [taxonomyId, setTaxonomyId] = useState('');
  const [coverItems, setCoverItems] = useState<ProductCoverItem[]>([]);
  const [pickedItemsMap, setPickedItemsMap] = useState<Record<string, UniversalPickedItem>>({});
  const [watermarkSettings, setWatermarkSettings] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [isWatermarkSaving, setIsWatermarkSaving] = useState(false);
  const [publishImmediately, setPublishImmediately] = useState(true);

  useEffect(() => {
    if (!exportId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [storesRes, exportsRes, watermarkRes] = await Promise.all([
          fetchStores(),
          fetchProductExports(exportId),
          fetchPostWatermarkSettings().catch((error) => {
            console.warn('Failed to load watermark settings', error);
            return DEFAULT_WATERMARK_SETTINGS;
          }),
        ]);
        if (cancelled) return;
        setStores(storesRes);
        setWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, ...watermarkRes });
        if (storesRes.length === 1) setStoreId(storesRes[0].id);

        const task = exportsRes;
        setExportTask(task);
        setTitle(stripZipExtension(task?.packageName) || task?.projectName || '');

        if (task?.projectId) {
          try {
            const [proj, albumPage] = await Promise.all([
              fetchProject(task.projectId),
              fetchProjectAlbum(task.projectId),
            ]);
            if (!cancelled) setProject({ ...proj, album: albumPage.items });
          } catch {
            // No album available — covers stay empty
          }
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || t('exports.stores.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exportId, t]);

  const albumImages = useMemo(() => (project?.album || []).filter(isImageItem), [project]);

  const tagList = useMemo(
    () => tagsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    [tagsInput]
  );

  const priceCents = useMemo(() => {
    const v = Number.parseFloat(priceUsd);
    if (!Number.isFinite(v) || v < 0) return NaN;
    return Math.round(v * 100);
  }, [priceUsd]);

  const coverWatermarkPreviewUrl = useMemo(() => {
    const cover = coverItems[0];
    if (!cover) return undefined;
    const localItem = albumImages.find((a) => a.id === cover.albumItemId);
    const pickedItem = pickedItemsMap[cover.albumItemId];
    return cover.useRaw
      ? localItem?.imageUrl || pickedItem?.rawUrl
      : localItem?.thumbnailUrl || localItem?.optimizedUrl || localItem?.imageUrl || pickedItem?.thumbnailUrl || pickedItem?.optimizedUrl || pickedItem?.previewUrl || pickedItem?.rawUrl;
  }, [albumImages, coverItems, pickedItemsMap]);

  const canSubmit =
    !!storeId &&
    title.trim().length > 0 &&
    Number.isFinite(priceCents) &&
    priceCents >= 0 &&
    !!exportTask &&
    exportTask.status === 'completed' &&
    !submitting;

  const setCoverUseRaw = (albumItemId: string, useRaw: boolean) => {
    setCoverItems((prev) => prev.map((c) => (c.albumItemId === albumItemId ? { ...c, useRaw } : c)));
  };

  const removeCover = (albumItemId: string) => {
    setCoverItems((prev) => prev.filter((c) => c.albumItemId !== albumItemId));
  };

  const onSubmit = async () => {
    if (!exportTask || !canSubmit) return;
    setSubmitting(true);
    setIsWatermarkSaving(true);
    try {
      await updatePostWatermarkSettings(watermarkSettings);
      setIsWatermarkSaving(false);
      const input: CreateProductInput = {
        storeId,
        exportTaskId: exportTask.id,
        title: title.trim(),
        priceCents,
        currency: 'usd',
        description: description.trim() || null,
        taxonomyId: taxonomyId.trim() || null,
        tags: tagList,
        coverItems,
        coverWatermarkSettings: watermarkSettings,
        publishImmediately,
      };
      await createProduct(input);
      toast.success(t('sell.queued'));
      navigate('/exports');
    } catch (err: any) {
      toast.error(err?.message || t('sell.failed'));
    } finally {
      setIsWatermarkSaving(false);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-950 dark:text-white" />
      </div>
    );
  }

  if (!exportTask) {
    return (
      <div className="p-8 text-center text-neutral-500">
        {t('sell.exportNotFound')}
      </div>
    );
  }

  if (exportTask.status !== 'completed') {
    return (
      <div className="p-8 text-center text-neutral-500">
        {t('sell.exportNotReady')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-6 pb-20">
        <PageHeader
          title={t('sell.title')}
          description={t('sell.description')}
          backLink={{ to: '/exports', label: t('exports.stores.backToExports') }}
        />

        {stores.length === 0 ? (
          <div className="rounded-card border border-amber-300/60 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
            {t('sell.noStoresHint')}
            <button
              type="button"
              onClick={() => navigate('/exports/stores')}
              className="ml-2 underline font-bold"
            >
              {t('exports.stores.headerLink')}
            </button>
          </div>
        ) : null}

        <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            {t('sell.section.store')}
          </h3>
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500">
              {t('sell.field.store')}
            </label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white"
            >
              <option value="" disabled>
                {t('sell.field.storePlaceholder')}
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.profileName || s.email || s.accountId} ({s.platform})
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            {t('sell.section.product')}
          </h3>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500">
              {t('sell.field.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500">
              {t('sell.field.price')}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-neutral-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                className="w-32 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white"
              />
              <span className="text-xs text-neutral-500">USD</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500">
              {t('sell.field.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500">
              {t('sell.field.tags')}
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('sell.field.tagsPlaceholder')}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white"
            />
            {tagList.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tagList.map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500">
              {t('sell.field.taxonomy')}
            </label>
            <input
              type="text"
              value={taxonomyId}
              onChange={(e) => setTaxonomyId(e.target.value)}
              placeholder={t('sell.field.taxonomyPlaceholder')}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              id="publishImmediately"
              type="checkbox"
              checked={publishImmediately}
              onChange={(e) => setPublishImmediately(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-pink-600 focus:ring-pink-500 dark:border-white/10 dark:bg-neutral-800"
            />
            <label htmlFor="publishImmediately" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('sell.field.publishImmediately')}
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              {t('sell.section.covers')} <span className="ml-1 text-neutral-400">({coverItems.length}/{MAX_COVERS})</span>
            </h3>
            <button
              type="button"
              onClick={() => setAlbumPickerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('sell.covers.pick')}
            </button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('sell.covers.hint')}
          </p>

          <WatermarkSettingsPanel
            settings={watermarkSettings}
            sampleUrl={coverWatermarkPreviewUrl}
            isSaving={isWatermarkSaving}
            onChange={setWatermarkSettings}
            title="Listing Cover Watermark"
            description="Saved per user and applied to Gumroad cover images added from this page."
            statusText="Settings save when the listing is created."
          />

          {coverItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-xs text-neutral-500 dark:border-white/10 dark:bg-neutral-900/40">
              {t('sell.covers.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-start">
              {coverItems.map((c) => {
                const localItem = albumImages.find((a) => a.id === c.albumItemId);
                const pickedItem = pickedItemsMap[c.albumItemId];

                let src = '';
                if (c.useRaw) {
                  src = localItem?.imageUrl || pickedItem?.rawUrl || '';
                } else {
                  src = localItem?.thumbnailUrl || localItem?.optimizedUrl || localItem?.imageUrl || pickedItem?.thumbnailUrl || pickedItem?.optimizedUrl || pickedItem?.previewUrl || pickedItem?.rawUrl || '';
                }

                if (!src) return null;
                return (
                  <div key={c.albumItemId} className="relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800/50">
                    <img src={src} alt="" className="w-full h-auto block" />
                    <button
                      type="button"
                      onClick={() => removeCover(c.albumItemId)}
                      className="absolute right-1 top-1 rounded-full bg-red-500/90 p-1 text-white shadow"
                      title={t('sell.covers.remove')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <label className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <input
                        type="checkbox"
                        checked={!!c.useRaw}
                        onChange={(e) => setCoverUseRaw(c.albumItemId, e.target.checked)}
                        className="h-3 w-3"
                      />
                      {t('sell.covers.useRaw')}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/exports')}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
          >
            {t('sell.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="inline-flex items-center gap-2 rounded-lg border border-pink-700 bg-pink-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-pink-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            {t('sell.confirm')}
          </button>
        </div>
      </div>

      {albumPickerOpen ? (
        <UniversalMediaPicker
          isOpen={true}
          title={t('sell.covers.pickerTitle')}
          allowedTypes={['image']}
          sourceKinds={['album']}
          fixedSourceId={project?.id}
          multiple={true}
          onClose={() => setAlbumPickerOpen(false)}
          onConfirm={(items) => {
            const nextMap = { ...pickedItemsMap };
            const nextCovers = [...coverItems];
            
            items.forEach((it) => {
              if (nextCovers.length >= MAX_COVERS) return;
              if (!nextCovers.find((c) => c.albumItemId === it.itemId)) {
                nextCovers.push({ albumItemId: it.itemId, useRaw: false });
                nextMap[it.itemId] = it;
              }
            });
            
            if (items.length > 0 && nextCovers.length >= MAX_COVERS && items.length > MAX_COVERS - coverItems.length) {
              toast.error(t('sell.coversLimit', { count: MAX_COVERS }));
            }
            
            setPickedItemsMap(nextMap);
            setCoverItems(nextCovers);
          }}
        />
      ) : null}
    </div>
  );
}

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
  fetchProductExports,
  fetchProject,
  fetchStores,
} from '../api';
import { AlbumItem, ExportTask, Project } from '../types';
import { PageHeader } from '../components/PageHeader';

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

  useEffect(() => {
    if (!exportId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [storesRes, exportsRes] = await Promise.all([
          fetchStores(),
          fetchProductExports(exportId),
        ]);
        if (cancelled) return;
        setStores(storesRes);
        if (storesRes.length === 1) setStoreId(storesRes[0].id);

        const task = exportsRes;
        setExportTask(task);
        setTitle(stripZipExtension(task?.packageName) || task?.projectName || '');

        if (task?.projectId) {
          try {
            const proj = await fetchProject(task.projectId);
            if (!cancelled) setProject(proj);
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

  const canSubmit =
    !!storeId &&
    title.trim().length > 0 &&
    Number.isFinite(priceCents) &&
    priceCents >= 0 &&
    !!exportTask &&
    exportTask.status === 'completed' &&
    !submitting;

  const toggleCover = (item: AlbumItem) => {
    setCoverItems((prev) => {
      const idx = prev.findIndex((c) => c.albumItemId === item.id);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      if (prev.length >= MAX_COVERS) {
        toast.error(t('sell.coversLimit', { count: MAX_COVERS }));
        return prev;
      }
      return [...prev, { albumItemId: item.id, useRaw: false }];
    });
  };

  const setCoverUseRaw = (albumItemId: string, useRaw: boolean) => {
    setCoverItems((prev) => prev.map((c) => (c.albumItemId === albumItemId ? { ...c, useRaw } : c)));
  };

  const removeCover = (albumItemId: string) => {
    setCoverItems((prev) => prev.filter((c) => c.albumItemId !== albumItemId));
  };

  const onSubmit = async () => {
    if (!exportTask || !canSubmit) return;
    setSubmitting(true);
    try {
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
        publishImmediately: true,
      };
      await createProduct(input);
      toast.success(t('sell.queued'));
      navigate('/exports');
    } catch (err: any) {
      toast.error(err?.message || t('sell.failed'));
    } finally {
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
      <div className="w-full max-w-3xl mx-auto space-y-6 pb-20">
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
        </section>

        <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
              {t('sell.section.covers')} <span className="ml-1 text-neutral-400">({coverItems.length}/{MAX_COVERS})</span>
            </h3>
            {albumImages.length > 0 ? (
              <button
                type="button"
                onClick={() => setAlbumPickerOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('sell.covers.pick')}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('sell.covers.hint')}
          </p>

          {coverItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-xs text-neutral-500 dark:border-white/10 dark:bg-neutral-900/40">
              {albumImages.length === 0 ? t('sell.covers.noAlbum') : t('sell.covers.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {coverItems.map((c) => {
                const item = albumImages.find((a) => a.id === c.albumItemId);
                if (!item) return null;
                const src = c.useRaw ? item.imageUrl : (item.thumbnailUrl || item.optimizedUrl || item.imageUrl);
                return (
                  <div key={c.albumItemId} className="relative overflow-hidden rounded-lg border border-neutral-200 dark:border-white/10">
                    <img src={src} alt="" className="aspect-square w-full object-cover" />
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
        <AlbumPicker
          items={albumImages}
          selected={coverItems.map((c) => c.albumItemId)}
          maxSelection={MAX_COVERS}
          onClose={() => setAlbumPickerOpen(false)}
          onToggle={(item) => toggleCover(item)}
        />
      ) : null}
    </div>
  );
}

function AlbumPicker({
  items,
  selected,
  maxSelection,
  onClose,
  onToggle,
}: {
  items: AlbumItem[];
  selected: string[];
  maxSelection: number;
  onClose: () => void;
  onToggle: (item: AlbumItem) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-white/10">
          <div>
            <h3 className="text-base font-bold text-neutral-950 dark:text-white">{t('sell.covers.pickerTitle')}</h3>
            <p className="text-xs text-neutral-500">{t('sell.covers.pickerHint', { count: maxSelection })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-800 dark:text-white"
          >
            {t('sell.covers.done')}
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">{t('sell.covers.noAlbum')}</div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {items.map((item) => {
                const isSelected = selected.includes(item.id);
                const src = item.thumbnailUrl || item.optimizedUrl || item.imageUrl;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggle(item)}
                    className={`group relative overflow-hidden rounded-lg border transition ${
                      isSelected
                        ? 'border-pink-500 ring-2 ring-pink-500'
                        : 'border-neutral-200 hover:border-neutral-400 dark:border-white/10'
                    }`}
                  >
                    <img src={src} alt="" className="aspect-square w-full object-cover" />
                    {isSelected ? (
                      <span className="absolute right-1 top-1 rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {selected.indexOf(item.id) + 1}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { TrashItem } from '../types';
import {
  fetchTrash,
  restoreTrashItem,
  restoreTrashBatch,
  deleteTrashPermanently,
  deleteTrashBatch,
  emptyTrash,
  fetchLibraryTrash,
  restoreLibraryTrash,
  deleteLibraryTrash,
  emptyLibraryTrash,
  imageDisplayUrl,
} from '../api';
import { Trash2, RotateCcw, CheckSquare, Square, CheckCircle2, Calendar, Folder, HardDrive, Library, FileText, Music, Video, Image as ImageIcon, FolderKanban } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { ConfirmModal } from './ConfirmModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';
import { trashBytes, trashKind, trashTitle, type TrashKind, type TrashSource } from '../v2/components/trash/trashMeta';

/** The calls behind each bin: album items from projects, or items from libraries. */
const BINS: Record<TrashSource, {
  fetch: () => Promise<TrashItem[]>;
  restore: (ids: string[]) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
  empty: () => Promise<void>;
}> = {
  projects: {
    fetch: fetchTrash,
    restore: (ids) => (ids.length === 1 ? restoreTrashItem(ids[0]) : restoreTrashBatch(ids)),
    remove: (ids) => (ids.length === 1 ? deleteTrashPermanently(ids[0]) : deleteTrashBatch(ids)),
    empty: emptyTrash,
  },
  libraries: {
    fetch: fetchLibraryTrash,
    restore: restoreLibraryTrash,
    remove: deleteLibraryTrash,
    empty: emptyLibraryTrash,
  },
};

const KIND_ICONS: Record<TrashKind, typeof ImageIcon> = { image: ImageIcon, video: Video, audio: Music, text: FileText };

/** Items whose project or library is gone can only be deleted. */
const canRestore = (item: TrashItem) => item.projectExists !== false;

export function TrashView() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const source: TrashSource = searchParams.get('from') === 'libraries' ? 'libraries' : 'projects';
  const bin = BINS[source];

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  const [lightboxData, setLightboxData] = useState<{images: string[], index: number} | null>(null);

  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);

  const loadTrash = async () => {
    try {
      setLoading(true);
      const data = await bin.fetch();
      setItems(data);
    } catch (e) {
      console.error('Failed to load trash:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setSelectedIds(new Set());
    loadTrash();
  }, [source]);

  const switchSource = (next: TrashSource) => {
    if (next === source) return;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'projects') params.delete('from');
      else params.set('from', next);
      return params;
    }, { replace: true });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dropItems = (ids: Set<string>) => {
    setItems(prev => prev.filter(i => !ids.has(i.id)));
    setSelectedIds(prev => new Set([...prev].filter(id => !ids.has(id))));
  };

  const restore = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await bin.restore(ids);
      dropItems(new Set(ids));
    } catch (e) {
      console.error('Restore failed:', e);
      // Some may have gone back before the failure; show what is still here.
      void loadTrash();
    }
  };

  const handleRestore = (id: string) => restore([id]);

  const handleRestoreBatch = () => {
    const ids = items.filter(i => selectedIds.has(i.id) && canRestore(i)).map(i => i.id);
    return restore(ids);
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setIsDeleting(true);
      await bin.remove(ids);
      dropItems(new Set(ids));
      setShowDeleteSelectedConfirm(false);
    } catch (e) {
      console.error('Batch delete failed:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async () => {
    if (!itemToDeleteId) return;
    try {
      setIsDeleting(true);
      await bin.remove([itemToDeleteId]);
      dropItems(new Set([itemToDeleteId]));
      setItemToDeleteId(null);
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      setIsDeleting(true);
      await bin.empty();
      setItems([]);
      setSelectedIds(new Set());
      setShowEmptyConfirm(false);
    } catch (e) {
      console.error('Empty trash failed:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalSize = items.reduce((acc, item) => acc + trashBytes(item), 0);
  const selectedSize = items.reduce((acc, item) => acc + (selectedIds.has(item.id) ? trashBytes(item) : 0), 0);
  const restorableSelected = items.filter(i => selectedIds.has(i.id) && canRestore(i)).length;

  const imageItems = items.filter(i => trashKind(i) === 'image' && i.imageUrl);
  const openLightbox = (item: TrashItem) => {
    const idx = imageItems.findIndex(i => i.id === item.id);
    setLightboxData({ images: imageItems.map(i => imageDisplayUrl(i.optimizedUrl || i.imageUrl)), index: idx >= 0 ? idx : 0 });
  };

  const ParentIcon = source === 'libraries' ? Library : Folder;

  const renderPreview = (item: TrashItem, isSelected: boolean) => {
    const kind = trashKind(item);
    const dim = isSelected ? 'opacity-40' : '';
    if (kind === 'text') {
      return (
        <div className={`w-full h-full p-4 pt-14 overflow-hidden text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words ${dim}`}>
          {item.title && <p className="font-bold text-neutral-900 dark:text-white mb-2 line-clamp-2">{item.title}</p>}
          <p className="line-clamp-[10]">{item.textContent || item.prompt}</p>
        </div>
      );
    }
    if (kind === 'audio') {
      return (
        <div className={`w-full h-full flex flex-col items-center justify-center gap-4 p-4 ${dim}`}>
          {item.thumbnailUrl
            ? <img src={imageDisplayUrl(item.thumbnailUrl)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" referrerPolicy="no-referrer" />
            : null}
          <Music className="relative w-12 h-12 text-blue-400" />
          <audio className="relative w-full" src={imageDisplayUrl(item.imageUrl)} controls preload="none" />
        </div>
      );
    }
    if (kind === 'video') {
      return (
        <video
          className={`w-full h-full object-cover ${dim}`}
          src={imageDisplayUrl(item.optimizedUrl || item.imageUrl)}
          poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined}
          controls
          muted
          playsInline
          preload="metadata"
        />
      );
    }
    return (
      <img
        src={imageDisplayUrl(item.thumbnailUrl || item.optimizedUrl || item.imageUrl)}
        alt={trashTitle(item)}
        className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 cursor-pointer ${dim}`}
        referrerPolicy="no-referrer"
        onClick={() => openLightbox(item)}
      />
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
        <PageHeader
          title={t('trash.title')}
          description={t('trash.description')}
        />

      <div role="tablist" aria-label={t('trash.sources.label')} className="inline-flex gap-1 p-1 bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-white/5 rounded-xl">
        {(['projects', 'libraries'] as TrashSource[]).map((value) => {
          const Icon = value === 'libraries' ? Library : FolderKanban;
          const active = value === source;
          return (
            <button
              key={value}
              role="tab"
              aria-selected={active}
              onClick={() => switchSource(value)}
              className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${active ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/30' : 'text-neutral-500 border border-transparent hover:text-neutral-800 dark:hover:text-neutral-200'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(`trash.sources.${value}`)}
            </button>
          );
        })}
      </div>

      {/* Stays on one row on phones — stacking made this pinned bar twice as tall as it needs to be. */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 md:gap-4 bg-white dark:bg-neutral-900 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 p-2.5 md:p-4 rounded-card shadow-lg shadow-black/5 dark:shadow-black/20">
        {/* A phone cannot fit the totals next to the selection actions, and the count is already on the restore button. */}
        <div className={`min-w-0 items-center gap-1.5 md:gap-2 ${selectedIds.size > 0 ? 'hidden sm:flex' : 'flex'}`}>
          <span className="truncate text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">
            {t('trash.stats.items', { count: items.length })}
          </span>
          <span className="text-neutral-800">·</span>
          <span className="truncate text-[10px] font-bold text-blue-400 uppercase tracking-widest">
            {t('trash.stats.total', { size: formatSize(totalSize) })}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 md:gap-2 animate-in slide-in-from-right-4 duration-300">
              <button
                onClick={handleRestoreBatch}
                disabled={restorableSelected === 0}
                title={t('trash.actions.restoreCount', { count: restorableSelected })}
                className="flex items-center gap-1.5 md:gap-2 px-2.5 py-1.5 md:px-4 md:py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-blue-500/30 transition-all shadow-lg shadow-blue-500/5 disabled:opacity-40 disabled:pointer-events-none"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t('trash.actions.restoreCount', { count: restorableSelected })}</span>
                <span className="sm:hidden">{restorableSelected}</span>
              </button>
              <button
                onClick={() => setShowDeleteSelectedConfirm(true)}
                title={t('trash.actions.deletePermanently')}
                aria-label={t('trash.actions.deletePermanently')}
                className="flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-red-500/30 transition-all shadow-lg shadow-red-500/5"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t('trash.actions.deletePermanently')}</span>
              </button>
            </div>
          )}

          {items.length > 0 && (
            <button
              onClick={() => setShowEmptyConfirm(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 bg-white dark:bg-neutral-900 hover:bg-red-100 dark:hover:bg-red-900/20 text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-red-500/30 transition-all md:ml-2"
            >
              {t('trash.actions.emptyTrash')}
            </button>
          )}
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-neutral-900 border-2 border-dashed border-neutral-200/50 dark:border-white/5 rounded-card text-center space-y-6 transition-colors hover:border-neutral-300 dark:hover:border-neutral-700 backdrop-blur-3xl shadow-sm">
          <div className="p-6 bg-white dark:bg-neutral-900 rounded-full border border-neutral-200 dark:border-neutral-800">
            <Trash2 className="w-12 h-12 text-neutral-800" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">{t('trash.empty.title')}</h3>
            <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">
              {t(source === 'libraries' ? 'trash.empty.descriptionLibraries' : 'trash.empty.description')}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
          {items.map(item => {
            const isSelected = selectedIds.has(item.id);
            const kind = trashKind(item);
            const KindIcon = KIND_ICONS[kind];
            const restorable = canRestore(item);
            const bytes = trashBytes(item);
            return (
              <div
                key={item.id}
                data-kind={kind}
                className={`group relative bg-white dark:bg-neutral-900 border rounded-card overflow-hidden flex flex-col transition-ui duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10 backdrop-blur-xl
                  ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/10 bg-blue-500/5' : 'border-neutral-200/50 dark:border-white/5 hover:border-blue-500/30'}`}
              >
                {/* Preview Section */}
                <div className="aspect-square relative overflow-hidden bg-neutral-50 dark:bg-neutral-950">
                  {renderPreview(item, isSelected)}

                  {/* Selection Overlay */}
                  <div className="absolute top-4 left-4 z-10 transition-all opacity-100">
                    <button
                      onClick={() => toggleSelection(item.id)}
                      aria-pressed={isSelected}
                      aria-label={trashTitle(item)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-xl transition-ui ${isSelected ? 'bg-blue-600 border-blue-500' : 'bg-black/60 border-white/20 hover:border-white/40'}`}
                    >
                      {isSelected ? <CheckSquare className="w-5 h-5 text-white" /> : <Square className="w-5 h-5 text-white/40" />}
                    </button>
                  </div>

                  <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 border border-white/10 text-[8px] font-black text-white uppercase tracking-widest pointer-events-none">
                    <KindIcon className="w-3 h-3" />
                    {t(`trash.kind.${kind}`)}
                  </div>

                  {kind === 'image' && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 transition-opacity flex flex-col justify-end p-4 pointer-events-none">
                      <p className="text-[9px] leading-relaxed text-blue-100/90 font-medium line-clamp-3 mb-2">{item.prompt || item.title}</p>
                      <div className="flex items-center gap-2 text-[8px] font-bold text-neutral-300 uppercase tracking-widest">
                         <HardDrive className="w-3 h-3" /> {formatSize(bytes)}
                      </div>
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <CheckCircle2 className="w-12 h-12 text-blue-500 animate-in zoom-in duration-300" />
                    </div>
                  )}
                </div>

                {/* Info Section */}
                <div className="p-4 space-y-3">
                  {kind !== 'image' && kind !== 'text' && (
                    <p className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 truncate" title={trashTitle(item)}>{trashTitle(item)}</p>
                  )}
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                    <ParentIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span className={`truncate flex-1 ${restorable ? '' : 'line-through'}`} title={item.projectName}>{item.projectName}</span>
                    {kind !== 'image' && bytes > 0 && <span className="shrink-0">{formatSize(bytes)}</span>}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-600 uppercase tracking-widest">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.deletedAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2">
                       <button
                        onClick={() => handleRestore(item.id)}
                        disabled={!restorable}
                        className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        title={restorable ? t('trash.card.restore') : t(source === 'libraries' ? 'trash.card.libraryGone' : 'trash.card.projectGone')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setItemToDeleteId(item.id)}
                        className="p-2 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
                        title={t('trash.card.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={showEmptyConfirm}
        onClose={() => setShowEmptyConfirm(false)}
        onConfirm={handleEmptyTrash}
        title={t('trash.confirm.empty.title')}
        message={t('trash.confirm.empty.message', { count: items.length, size: formatSize(totalSize) })}
        confirmText={isDeleting ? t('trash.confirm.deleting') : t('trash.confirm.empty.confirm')}
        type="danger"
      />

      <ConfirmModal
        isOpen={showDeleteSelectedConfirm}
        onClose={() => setShowDeleteSelectedConfirm(false)}
        onConfirm={handleDeleteSelected}
        title={t('trash.confirm.deleteSelected.title')}
        message={t('trash.confirm.deleteSelected.message', { count: selectedIds.size, size: formatSize(selectedSize) })}
        confirmText={isDeleting ? t('trash.confirm.deleting') : t('trash.confirm.deleteSelected.confirm')}
        type="danger"
      />

      <ConfirmModal
        isOpen={!!itemToDeleteId}
        onClose={() => setItemToDeleteId(null)}
        onConfirm={handleDeleteSingle}
        title={t('trash.confirm.deleteSingle.title')}
        message={t('trash.confirm.deleteSingle.message')}
        confirmText={isDeleting ? t('trash.confirm.deleting') : t('trash.confirm.deleteSingle.confirm')}
        type="danger"
      />

      {lightboxData && (
        <ImageLightbox
          images={lightboxData.images}
          startIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { TrashItem } from '../types';
import { fetchTrash, restoreTrashItem, restoreTrashBatch, deleteTrashPermanently, deleteTrashBatch, emptyTrash, imageDisplayUrl } from '../api';
import { Trash2, RotateCcw, CheckSquare, Square, CheckCircle2, Calendar, Folder, HardDrive } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';

export function TrashView() {
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
      const data = await fetchTrash();
      setItems(data);
    } catch (e) {
      console.error('Failed to load trash:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const toggleSelection = (id: string, isShift: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreTrashItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error('Restore failed:', e);
    }
  };

  const handleRestoreBatch = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await restoreTrashBatch(ids);
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
    } catch (e) {
      console.error('Batch restore failed:', e);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setIsDeleting(true);
      await deleteTrashBatch(ids);
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
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
      await deleteTrashPermanently(itemToDeleteId);
      setItems(prev => prev.filter(i => i.id !== itemToDeleteId));
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
      await emptyTrash();
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

  const totalSize = items.reduce((acc, item) => acc + (item.size || 0), 0);
  const selectedSize = Array.from(selectedIds).reduce((acc, id) => {
    const item = items.find(i => i.id === id);
    return acc + (item?.size || 0);
  }, 0);



  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      <header className="mb-6 md:mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">Recycle Bin</h2>
        <p className="text-sm md:text-base text-neutral-400">Review deleted items, restore what you need, or remove them permanently.</p>
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            {items.length} Items
          </span>
          <span className="text-neutral-800">·</span>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
            {formatSize(totalSize)} Total
          </span>
        </div>

        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-300">
              <button
                onClick={handleRestoreBatch}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-blue-500/30 transition-all shadow-lg shadow-blue-500/5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore ({selectedIds.size})
              </button>
              <button
                onClick={() => setShowDeleteSelectedConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-xl border border-red-500/30 transition-all shadow-lg shadow-red-500/5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
              </button>
            </div>
          )}
          
          {items.length > 0 && (
            <button
              onClick={() => setShowEmptyConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-red-900/20 text-neutral-400 hover:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-neutral-800 hover:border-red-500/30 transition-all ml-2"
            >
              Empty Trash
            </button>
          )}
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-neutral-900/20 border-2 border-dashed border-neutral-800 rounded-[40px] text-center space-y-6 transition-colors hover:border-neutral-700">
          <div className="p-6 bg-neutral-900/50 rounded-full border border-neutral-800">
            <Trash2 className="w-12 h-12 text-neutral-800" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Recycle Bin is Empty</h3>
            <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">Deleted album items will appear here</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
          {items.map(item => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div 
                key={item.id} 
                className={`group relative bg-neutral-900/50 border rounded-3xl overflow-hidden flex flex-col transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10 
                  ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/10 bg-blue-500/5' : 'border-neutral-800 hover:border-blue-500/30'}`}
              >
                {/* Image Section */}
                <div className="aspect-square relative overflow-hidden bg-neutral-950">
                  <img
                    src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)}
                    alt={item.prompt}
                    className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 cursor-pointer ${isSelected ? 'opacity-40' : ''}`}
                    referrerPolicy="no-referrer"
                    onClick={() => {
                        const validItems = items.filter(i => i.imageUrl);
                        const imgUrls = validItems.map(i => imageDisplayUrl(i.optimizedUrl || i.imageUrl));
                        const idx = validItems.findIndex(i => i.id === item.id);
                        setLightboxData({ images: imgUrls, index: idx >= 0 ? idx : 0 });
                    }}
                  />
                  
                  {/* Selection Overlay */}
                  <div className={`absolute top-4 left-4 z-10 transition-all opacity-100`}>
                    <button
                      onClick={() => toggleSelection(item.id, false)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-xl transition-all ${isSelected ? 'bg-blue-600 border-blue-500' : 'bg-black/40 backdrop-blur-xl border-white/20 hover:border-white/40'}`}
                    >
                      {isSelected ? <CheckSquare className="w-5 h-5 text-white" /> : <Square className="w-5 h-5 text-white/40" />}
                    </button>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 transition-opacity flex flex-col justify-end p-4 pointer-events-none">
                    <p className="text-[9px] leading-relaxed text-blue-100/90 font-medium line-clamp-3 mb-2">{item.prompt}</p>
                    <div className="flex items-center gap-2 text-[8px] font-bold text-neutral-400 uppercase tracking-widest">
                       <HardDrive className="w-3 h-3" /> {formatSize(item.size)}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <CheckCircle2 className="w-12 h-12 text-blue-500 animate-in zoom-in duration-300" />
                    </div>
                  )}
                </div>

                {/* Info Section */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                    <Folder className="w-3.5 h-3.5 text-blue-400" />
                    <span className="truncate flex-1" title={item.projectName}>{item.projectName}</span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-600 uppercase tracking-widest">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.deletedAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2">
                       <button
                        onClick={() => handleRestore(item.id)}
                        className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                        title="Restore"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setItemToDeleteId(item.id)}
                        className="p-2 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
                        title="Delete Permanently"
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
        title="Empty Recycle Bin"
        message={`Are you sure you want to permanently delete all ${items.length} items? This will free up ${formatSize(totalSize)} but cannot be undone.`}
        confirmText={isDeleting ? "Deleting..." : "Empty Trash"}
        type="danger"
      />

      <ConfirmModal
        isOpen={showDeleteSelectedConfirm}
        onClose={() => setShowDeleteSelectedConfirm(false)}
        onConfirm={handleDeleteSelected}
        title="Delete Selected Items"
        message={`Are you sure you want to permanently delete ${selectedIds.size} items? This will free up ${formatSize(selectedSize)} and cannot be undone.`}
        confirmText={isDeleting ? "Deleting..." : "Delete Permanently"}
        type="danger"
      />

      <ConfirmModal
        isOpen={!!itemToDeleteId}
        onClose={() => setItemToDeleteId(null)}
        onConfirm={handleDeleteSingle}
        title="Permanently Delete Image"
        message="Are you sure you want to permanently delete this image? This action cannot be undone."
        confirmText={isDeleting ? "Deleting..." : "Delete Permanently"}
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

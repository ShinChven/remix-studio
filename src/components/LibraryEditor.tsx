import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library } from '../types';
import { Trash2, Plus, GripVertical, Image as ImageIcon, Edit3, Settings, Search, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { saveImage, createLibraryItem, deleteLibraryItem as apiDeleteLibraryItem, updateLibraryItemOrders } from '../api';

interface Props {
  library: Library;
  onUpdate: (lib: Library) => void;
  onDelete: () => void;
}

export function LibraryEditor({ library, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [showDeleteLibraryModal, setShowDeleteLibraryModal] = useState(false);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const ITEMS_PER_PAGE = 24;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredItems = library.items
    .map((item, index) => ({ item, originalIndex: index }))
    .filter(({ item }) => {
      const search = searchTerm.toLowerCase();
      return (
        (item.title?.toLowerCase().includes(search) || false) ||
        (item.content.toLowerCase().includes(search))
      );
    });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleRemoveItem = (index: number) => {
    setItemToRemoveIndex(index);
  };

  const confirmRemoveItem = async () => {
    if (itemToRemoveIndex !== null) {
      const item = library.items[itemToRemoveIndex];
      try {
        await apiDeleteLibraryItem(library.id, item.id);
        const newItems = [...library.items];
        newItems.splice(itemToRemoveIndex, 1);
        onUpdate({ ...library, items: newItems });
      } catch (e) {
        console.error('Failed to delete item:', e);
      }
      setItemToRemoveIndex(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newItems = [...library.items];
      const draggedItem = newItems[draggedIndex];
      newItems.splice(draggedIndex, 1);
      newItems.splice(dragOverIndex, 0, draggedItem);
      
      onUpdate({ ...library, items: newItems });
      
      const updates = newItems.map((item, idx) => ({ id: item.id, order: idx }));
      try {
        await updateLibraryItemOrders(library.id, updates);
      } catch (err) {
        console.error('Failed to save updated order', err);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setUploading(true);
    try {
      const newItems = [...library.items];

      for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });

        const url = await saveImage(base64, library.id);
        const newItem = { id: crypto.randomUUID(), content: url, order: newItems.length };
        await createLibraryItem(library.id, newItem);
        newItems.push(newItem);
      }

      onUpdate({ ...library, items: newItems });
    } catch (err) {
      console.error('Failed to upload images:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col px-4 md:px-10 py-6 md:py-12 w-full overflow-hidden animate-in fade-in duration-700">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 md:mb-12 flex-shrink-0 gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <div className="w-1.5 h-6 md:h-8 bg-blue-600 rounded-full" />
             <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight">{library.name}</h2>
          </div>

          <div className="flex items-center gap-4 mt-2 md:mt-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 px-2.5 py-1 bg-neutral-900/50 border border-neutral-800 rounded-lg backdrop-blur-sm">
              {library.type || 'text'} Collection
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter items..."
              className="bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all w-full sm:w-48 lg:w-64"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {library.type === 'image' ? (
              <label className={`flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2.5 rounded-xl transition-all border border-blue-600/20 hover:border-blue-600 active:scale-95 group shadow-sm ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4 transition-transform group-hover:scale-110" />}
                <span className="text-xs font-bold uppercase tracking-widest">{uploading ? 'Uploading...' : 'Upload'}</span>
                <input type="file" className="hidden" multiple accept="image/*" onChange={handleImageUpload} disabled={uploading} />
              </label>
            ) : (
              <button
                onClick={() => navigate(`/library/${library.id}/prompt/new`)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2.5 rounded-xl transition-all border border-blue-600/20 hover:border-blue-600 active:scale-95 group shadow-sm"
              >
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                <span className="text-xs font-bold uppercase tracking-widest">Add Fragment</span>
              </button>
            )}

            <button
              onClick={() => navigate(`/library/${library.id}/edit`)}
              className="p-2.5 text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all border border-neutral-800/50 hover:border-neutral-700 active:scale-95"
              title="Edit Library Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowDeleteLibraryModal(true)}
              className="p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-400/10 rounded-xl transition-all border border-neutral-800/50 hover:border-red-400/20 active:scale-95"
              title="Delete Library"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 md:pr-4 -mr-2 md:-mr-4 custom-scrollbar space-y-6 md:space-y-10 pb-20">
        <div className={library.type === 'image' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8" : "space-y-4"}>
          {paginatedItems.map(({ item, originalIndex }) => (
            <div 
              key={item.id} 
              className={`group relative ${draggedIndex === originalIndex ? 'opacity-50' : ''} ${dragOverIndex === originalIndex ? 'ring-2 ring-blue-500 rounded-3xl scale-105 z-10 transition-transform' : ''}`}
              draggable={library.type === 'image' && !searchTerm}
              onDragStart={(e) => handleDragStart(e, originalIndex)}
              onDragEnter={(e) => handleDragEnter(e, originalIndex)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              onDrop={(e) => e.preventDefault()}
            >
                <div className={`group/item bg-neutral-900/40 border border-neutral-800/60 rounded-3xl transition-all duration-300 hover:bg-neutral-800/40 hover:border-neutral-700/80 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${library.type === 'image' ? 'aspect-square flex flex-col p-2 overflow-hidden' : 'p-4 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 md:gap-6'}`}>
                  {library.type === 'image' ? (
                    <div className="relative flex-1 rounded-2xl overflow-hidden">
                      <img src={item.content} alt={`${originalIndex}`} className="w-full h-full object-cover transition-transform duration-1000 group-hover/item:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">IMG_{originalIndex + 1}</span>
                          <div className="flex items-center gap-2">
                             <button
                               onClick={() => handleRemoveItem(originalIndex)}
                               className="p-2.5 bg-neutral-950/80 text-neutral-400 hover:text-red-500 rounded-xl backdrop-blur-md border border-white/5 hover:border-red-500/20 transition-all active:scale-90"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="text-neutral-700 p-1 flex-shrink-0 mt-0.5">
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          {item.title && (
                            <h4 className="text-blue-400 text-xs font-black uppercase tracking-widest truncate">
                              {item.title}
                            </h4>
                          )}
                          <p className={`text-neutral-300 leading-relaxed text-sm font-medium tracking-wide ${item.title ? 'line-clamp-2' : 'line-clamp-3'}`}>
                            {item.content}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => navigate(`/library/${library.id}/prompt/${originalIndex}`)}
                          className="p-2.5 md:p-3 text-neutral-500 hover:text-white hover:bg-neutral-800/80 rounded-2xl transition-all border border-transparent hover:border-neutral-700 active:scale-95 shadow-sm"
                          title="Refine in Full Editor"
                        >
                          <Edit3 className="w-4 h-4 md:w-4.5 md:h-4.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveItem(originalIndex)}
                          className="p-2.5 md:p-3 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all border border-transparent hover:border-red-500/20 active:scale-95 shadow-sm"
                          title="Delete Fragment"
                        >
                          <Trash2 className="w-4 h-4 md:w-4.5 md:h-4.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-neutral-800/50 rounded-[40px] bg-neutral-900/10 flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in-95">
              <div className="p-8 rounded-[32px] bg-neutral-900 border border-neutral-800 shadow-2xl">
                {searchTerm ? <Search className="w-16 h-16 text-neutral-800" /> : <Plus className="w-16 h-16 text-neutral-800" />}
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-neutral-500 tracking-tight italic">
                  {searchTerm ? 'No results found' : 'Ghost Town'}
                </p>
                <p className="text-[10px] font-black text-neutral-700 uppercase tracking-[0.3em]">
                  {searchTerm ? 'Try a different search term' : 'Add content below to initialize library'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-6 pt-12">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-3 bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-700 rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-10 h-10 rounded-xl text-xs font-black transition-all active:scale-95 ${
                    currentPage === i + 1
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-3 bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-700 rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteLibraryModal}
        onClose={() => setShowDeleteLibraryModal(false)}
        onConfirm={onDelete}
        title="Destroy Library"
        message={`This will permanently delete the collection "${library.name}" and all its fragments. This action is irreversible.`}
        confirmText="Destroy Collection"
        type="danger"
      />

      <ConfirmModal
        isOpen={itemToRemoveIndex !== null}
        onClose={() => setItemToRemoveIndex(null)}
        onConfirm={confirmRemoveItem}
        title="Expunge Fragment"
        message="Are you sure you want to remove this fragment from the collection?"
        confirmText="Remove Now"
        type="danger"
      />
    </div>
  );
}

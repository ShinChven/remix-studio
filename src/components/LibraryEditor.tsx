import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library } from '../types';
import { Trash2, Plus, GripVertical, Image as ImageIcon, Edit3, Settings, Search, ArrowRight, ArrowLeft, Loader2, X, ChevronLeft, ChevronRight, AlertCircle, Play, UploadCloud, Tag as TagIcon, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { TagModal } from './TagModal';
import { saveImage, createLibraryItem, deleteLibraryItem as apiDeleteLibraryItem, updateLibraryItemOrders, fetchLibraryReferences, updateLibraryItem } from '../api';
import { toast } from 'sonner';

interface Props {
  library: Library;
  onUpdate: (lib: Library) => void;
  onDelete: () => void;
}

export function LibraryEditor({ library, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [showDeleteLibraryModal, setShowDeleteLibraryModal] = useState(false);
  const [showReferencesModal, setShowReferencesModal] = useState(false);
  const [referencingProjects, setReferencingProjects] = useState<{ id: string; name: string }[]>([]);
  const [checkingReferences, setCheckingReferences] = useState(false);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [tagModalItemId, setTagModalItemId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [showTagFilterDropdown, setShowTagFilterDropdown] = useState(false);

  const ITEMS_PER_PAGE = 24;

  const toggleItemExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedItemId(prev => prev === id ? null : id);
  };

  const toggleItemSelection = (id: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      
      if (e.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const rangeIds = filteredItems.slice(start, end + 1).map(f => f.item.id);
        
        // If the start item is being selected, select the range. Otherwise, deselect.
        const shouldSelect = !prev.has(id);
        rangeIds.forEach(rangeId => {
          if (shouldSelect) next.add(rangeId);
          else next.delete(rangeId);
        });
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      
      return next;
    });
    
    setLastSelectedIndex(index);
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map(f => f.item.id)));
    }
  };

  const deleteSelectedItems = async () => {
    const idsToDelete = Array.from(selectedItemIds);
    try {
      for (const id of idsToDelete) {
        await apiDeleteLibraryItem(library.id, id);
      }
      const newItems = library.items.filter(i => !selectedItemIds.has(i.id));
      onUpdate({ ...library, items: newItems });
      setSelectedItemIds(new Set());
      setLastSelectedIndex(null);
    } catch (e) {
      console.error('Failed to delete items:', e);
    }
    setShowDeleteSelectedModal(false);
  };

  const handleBatchTagSave = async (tagsToAdd: string[]) => {
     if (tagsToAdd.length === 0) return;
     const newItems = [...library.items];
     for (const id of selectedItemIds) {
       const index = newItems.findIndex(i => i.id === id);
       if (index !== -1) {
         const currentTags = newItems[index].tags || [];
         const updatedTags = Array.from(new Set([...currentTags, ...tagsToAdd]));
         newItems[index] = { ...newItems[index], tags: updatedTags };
         updateLibraryItem(library.id, id, { tags: updatedTags }).catch(console.error);
       }
     }
     onUpdate({ ...library, items: newItems });
     setSelectedItemIds(new Set());
     setLastSelectedIndex(null);
  };

  const handleSingleTagSave = async (tags: string[]) => {
    if (!tagModalItemId) return;
    const newItems = [...library.items];
    const index = newItems.findIndex(i => i.id === tagModalItemId);
    if (index !== -1) {
      newItems[index] = { ...newItems[index], tags };
      updateLibraryItem(library.id, tagModalItemId, { tags }).catch(console.error);
    }
    onUpdate({ ...library, items: newItems });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex(prev => (prev !== null && prev < library.items.length - 1 ? prev + 1 : prev));
      }
    };
    
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, library.items.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showTagFilterDropdown) return;
    const handleClick = () => setShowTagFilterDropdown(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showTagFilterDropdown]);

  const availableTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    library.items.forEach(i => {
      if (i.tags) i.tags.forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [library.items]);

  const toggleFilterTag = (tag: string) => {
    setSelectedFilterTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filteredItems = library.items
    .map((item, index) => ({ item, originalIndex: index }))
    .filter(({ item }) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = (item.title?.toLowerCase().includes(search) || false) ||
                           (item.content?.toLowerCase().includes(search) || false);
      
      const matchesTags = selectedFilterTags.length === 0 || 
                         (item.tags && selectedFilterTags.some(t => item.tags?.includes(t)));
      
      return matchesSearch && matchesTags;
    });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleDeleteLibrary = async () => {
    setCheckingReferences(true);
    try {
      const refs = await fetchLibraryReferences(library.id);
      if (refs.length > 0) {
        setReferencingProjects(refs);
        setShowReferencesModal(true);
      } else {
        setShowDeleteLibraryModal(true);
      }
    } catch (e) {
      console.error('Failed to check references:', e);
      setShowDeleteLibraryModal(true);
    } finally {
      setCheckingReferences(false);
    }
  };

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

        const { key, url, thumbnailKey, thumbnailUrl, optimizedKey, optimizedUrl, size } = await saveImage(base64, library.id);
        const newItem = { 
          id: crypto.randomUUID(), 
          content: key, 
          order: newItems.length,
          thumbnailUrl: thumbnailKey,
          optimizedUrl: optimizedKey,
          size: size
        };
        await createLibraryItem(library.id, newItem);
        // Use signed URLs for immediate display, DB stores the S3 keys
        newItems.push({ 
          ...newItem, 
          content: url,
          thumbnailUrl: thumbnailUrl,
          optimizedUrl: optimizedUrl
        });
      }

      onUpdate({ ...library, items: newItems });
    } catch (err: any) {
      console.error('Failed to upload images:', err);
      toast.error(err.message || 'Failed to upload images');
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
 
            {library.type === 'text' && (
              <button
                onClick={() => navigate(`/library/${library.id}/import-export`)}
                className="p-2.5 text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all border border-neutral-800/50 hover:border-blue-400/20 active:scale-95"
                title="Import / Export"
              >
                <UploadCloud className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={handleDeleteLibrary}
              disabled={checkingReferences}
              className="p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-400/10 rounded-xl transition-all border border-neutral-800/50 hover:border-red-400/20 active:scale-95 disabled:opacity-50"
              title="Delete Library"
            >
              {checkingReferences ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {availableTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 px-1">
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 md:pr-4 -mr-2 md:-mr-4 custom-scrollbar space-y-4 md:space-y-6 pb-20">
        {/* Batch Action Toolbar (Mirrors item style) */}
        {filteredItems.length > -1 && (
          <div className={`
            flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300
            ${selectedItemIds.size > 0 
              ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
              : 'bg-neutral-900/40 border-neutral-800/60'}
          `}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div 
                  onClick={toggleSelectAll}
                  className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
                >
                  {selectedItemIds.size === filteredItems.length && filteredItems.length > 0 ? (
                    <CheckSquare className="w-4.5 h-4.5 text-blue-500" />
                  ) : selectedItemIds.size > 0 ? (
                    <div className="w-4.5 h-4.5 flex items-center justify-center">
                      <div className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
                    </div>
                  ) : (
                    <Square className="w-4.5 h-4.5 text-neutral-600" />
                  )}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${selectedItemIds.size > 0 ? 'text-blue-400' : 'text-neutral-500'}`}>
                  {selectedItemIds.size > 0 ? `${selectedItemIds.size} Selected` : 'Select All'}
                </span>
              </div>

              {/* Tag Filter Dropdown */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowTagFilterDropdown(!showTagFilterDropdown)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                    selectedFilterTags.length > 0
                      ? 'bg-blue-600/10 border-blue-500/40 text-blue-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300'
                  }`}
                >
                  <TagIcon className="w-3.5 h-3.5" />
                  {selectedFilterTags.length === 0 ? 'Filter by Tag' : 
                   selectedFilterTags.length === 1 ? selectedFilterTags[0] : 
                   `${selectedFilterTags.length} Tags Selected`}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showTagFilterDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showTagFilterDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] p-2 animate-in fade-in zoom-in-95 duration-200">
                    <button
                      onClick={() => setSelectedFilterTags([])}
                      className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors mb-1 ${
                        selectedFilterTags.length === 0 ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                      }`}
                    >
                      All Fragments
                    </button>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {availableTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleFilterTag(tag)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-between group ${
                            selectedFilterTags.includes(tag) ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                          }`}
                        >
                          {tag}
                          {selectedFilterTags.includes(tag) && <CheckSquare className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedItemIds.size > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                <button 
                  onClick={() => setShowBatchTagModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg transition-all font-bold text-[10px] uppercase tracking-[0.15em] border border-blue-500/30"
                >
                  <TagIcon className="w-3.5 h-3.5" /> Batch Tag
                </button>
                <button 
                  onClick={() => setShowDeleteSelectedModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition-all font-bold text-[10px] uppercase tracking-[0.15em] border border-red-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <div className="w-px h-4 bg-neutral-800/60 mx-1"></div>
                <button 
                  onClick={() => setSelectedItemIds(new Set())}
                  className="p-1 text-neutral-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className={library.type === 'image' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8" : "space-y-2.5"}>
          {paginatedItems.map(({ item, originalIndex }) => {
            const isExpanded = expandedItemId === item.id;
            const isSelected = selectedItemIds.has(item.id);
            
            return (
            <div 
              key={item.id} 
              className={`group relative flex flex-col transition-all duration-300 ${draggedIndex === originalIndex ? 'opacity-50' : ''} ${dragOverIndex === originalIndex ? 'ring-2 ring-blue-500 rounded-xl scale-105 z-10' : ''}`}
              draggable={library.type === 'image' && !searchTerm}
              onDragStart={(e) => handleDragStart(e, originalIndex)}
              onDragEnter={(e) => handleDragEnter(e, originalIndex)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              onDrop={(e) => e.preventDefault()}
            >
                <div className={`
                  group/item flex flex-col transition-all duration-300 border overflow-hidden
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)] z-10' 
                    : 'bg-neutral-900/40 border-neutral-800/60 hover:bg-neutral-800/40 hover:border-neutral-700/80'}
                  ${library.type === 'image' 
                    ? 'rounded-2xl aspect-square p-2' 
                    : 'rounded-xl cursor-pointer'}
                `}>
                  {library.type === 'image' ? (
                    <div className={`relative flex-1 rounded-xl overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-4 ring-blue-500/50 scale-95' : ''}`} onClick={(e) => { 
                      if (e.metaKey || e.ctrlKey || e.shiftKey) toggleItemSelection(item.id, originalIndex, e); 
                      else setLightboxIndex(originalIndex); 
                    }}>
                      <img src={item.thumbnailUrl || item.content} alt={`${originalIndex}`} className="w-full h-full object-cover transition-transform duration-1000 group-hover/item:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">IMG_{originalIndex + 1}</span>
                          <div className="flex items-center gap-2">
                             <button
                               onClick={(e) => { e.stopPropagation(); setTagModalItemId(item.id); }}
                               className="p-2.5 bg-neutral-950/80 text-neutral-400 hover:text-blue-400 rounded-xl backdrop-blur-md border border-white/5 hover:border-blue-400/20 transition-all active:scale-90"
                               title="Edit Tags"
                             >
                               <TagIcon className="w-4 h-4" />
                             </button>
                             <button
                               onClick={(e) => { e.stopPropagation(); handleRemoveItem(originalIndex); }}
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
                      <div 
                        className={`p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 ${isExpanded ? 'border-b border-neutral-800/50 bg-neutral-800/20' : ''}`}
                        onClick={(e) => { 
                          if (e.metaKey || e.ctrlKey || e.shiftKey) toggleItemSelection(item.id, originalIndex, e); 
                          else toggleItemExpand(item.id, e);
                        }}
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div 
                            onClick={(e) => toggleItemSelection(item.id, originalIndex, e)}
                            className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4.5 h-4.5 text-blue-500" />
                            ) : (
                              <Square className="w-4.5 h-4.5 text-neutral-600" />
                            )}
                          </div>
                          <div className="p-1 cursor-pointer" onClick={(e) => toggleItemExpand(item.id, e)}>
                            <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {item.title && (
                              <h4 className="text-blue-400 text-[10px] font-black uppercase tracking-widest truncate shrink-0 px-1.5 py-0.5 bg-blue-400/5 border border-blue-400/10 rounded">
                                {item.title}
                              </h4>
                            )}
                            <span className={`text-xs font-medium truncate pr-6 ${isExpanded ? 'text-white' : 'text-neutral-400'}`}>
                              {item.content}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-end">
                          {(item.tags && item.tags.length > 0) && (
                            <div className="hidden lg:flex items-center gap-1.5 mr-2">
                              {item.tags.slice(0, 2).map(t => (
                                <span key={t} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[9px] font-bold tracking-wider truncate max-w-[70px] uppercase">{t}</span>
                              ))}
                              {item.tags.length > 2 && (
                                <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 rounded text-[9px] font-bold tracking-wider">+{item.tags.length - 2}</span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1 opacity-60 group-hover/item:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setTagModalItemId(item.id); }}
                              className="p-1.5 text-neutral-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all border border-transparent hover:border-blue-400/20 active:scale-95"
                              title="Edit Tags"
                            >
                              <TagIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/library/${library.id}/prompt/${originalIndex}`); }}
                              className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800/80 rounded-lg transition-all border border-transparent hover:border-neutral-700 active:scale-95"
                              title="Refine in Full Editor"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveItem(originalIndex); }}
                              className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-500/20 active:scale-95"
                              title="Delete Fragment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-4 sm:p-5 space-y-4 animate-in slide-in-from-top-1 duration-200 border-t border-neutral-800/50 bg-neutral-900/30">
                          <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">Full Source</label>
                               <span className="text-[8px] font-bold text-neutral-700 uppercase tracking-tighter">Markdown Enabled</span>
                             </div>
                             <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50 select-all whitespace-pre-wrap font-mono">
                               {item.content}
                             </div>
                          </div>
                          {(item.tags && item.tags.length > 0) && (
                            <div className="flex flex-wrap gap-1.5">
                              {item.tags.map(t => (
                                <span key={t} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-[9px] font-bold tracking-wider uppercase">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

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
                  className={`w-10 h-10 rounded-xl text-xs font-black transition-all active:scale-95 border ${
                    currentPage === i + 1
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-transparent'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-700'
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

      {/* References warning modal */}
      {showReferencesModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setShowReferencesModal(false)}
        >
          <div
            className="bg-neutral-900 border border-neutral-800/50 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-start gap-6">
                <div className="p-4 rounded-3xl flex-shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-2xl font-black text-white tracking-tight">Library In Use</h3>
                  <p className="mt-3 text-base text-neutral-400 font-medium leading-relaxed">
                    "{library.name}" is referenced by {referencingProjects.length} project{referencingProjects.length > 1 ? 's' : ''}. You need to remove these references before deleting.
                  </p>
                  <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                    {referencingProjects.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-neutral-300 bg-neutral-800/50 px-3 py-2 rounded-lg">
                        <Play className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-8 py-6 bg-neutral-950/40 flex items-center justify-end gap-4 border-t border-neutral-800/50">
              <button
                onClick={() => setShowReferencesModal(false)}
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowReferencesModal(false);
                  navigate(`/library/${library.id}/cleanup`);
                }}
                className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-white shadow-2xl shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                Resolve References
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={itemToRemoveIndex !== null}
        onClose={() => setItemToRemoveIndex(null)}
        onConfirm={confirmRemoveItem}
        title="Expunge Fragment"
        message="Are you sure you want to remove this fragment from the collection?"
        confirmText="Remove Now"
        type="danger"
      />

      {lightboxIndex !== null && library.items[lightboxIndex] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={() => setLightboxIndex(null)}>
          <button 
            onClick={() => setLightboxIndex(null)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
          >
            <X className="w-6 h-6" />
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => prev! > 0 ? prev! - 1 : prev); }}
            disabled={lightboxIndex === 0}
            className="absolute left-4 md:left-10 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-0 disabled:pointer-events-none text-white rounded-full transition-all"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          
          <div className="relative w-full max-w-7xl h-[85vh] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <img 
              src={library.items[lightboxIndex].optimizedUrl || library.items[lightboxIndex].content} 
              alt={`img-${lightboxIndex}`}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-500"
            />
            <div className="absolute bottom-[-3rem] text-white/50 font-black tracking-widest text-xs uppercase bg-black/50 px-4 py-2 rounded-full border border-white/10">
              {lightboxIndex + 1} / {library.items.length}
            </div>
          </div>

          <button 
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => prev! < library.items.length - 1 ? prev! + 1 : prev); }}
            disabled={lightboxIndex === library.items.length - 1}
            className="absolute right-4 md:right-10 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-0 disabled:pointer-events-none text-white rounded-full transition-all"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteSelectedModal}
        onClose={() => setShowDeleteSelectedModal(false)}
        onConfirm={deleteSelectedItems}
        title="Destroy Selected Fragments"
        message={`Are you sure you want to delete ${selectedItemIds.size} fragment(s)?`}
        confirmText="Destroy Selected"
        type="danger"
      />

      <TagModal 
        isOpen={showBatchTagModal}
        onClose={() => setShowBatchTagModal(false)}
        onSave={handleBatchTagSave}
        title="Batch Tag Selected Items"
        description={`Add tags to ${selectedItemIds.size} selected item(s).`}
        saveButtonText="Add Tags"
      />

      <TagModal
        isOpen={tagModalItemId !== null}
        onClose={() => setTagModalItemId(null)}
        onSave={handleSingleTagSave}
        initialTags={tagModalItemId ? (library.items.find(i => i.id === tagModalItemId)?.tags || []) : []}
        title="Edit Item Tags"
      />
    </div>
  );
}

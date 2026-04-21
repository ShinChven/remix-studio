import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, LibraryItem } from '../types';
import { Trash2, Plus, GripVertical, Image as ImageIcon, Edit3, Settings, Search, ArrowRight, ArrowLeft, Loader2, X, AlertCircle, Play, UploadCloud, Tag as TagIcon, CheckSquare, Square, ChevronDown, Copy, Music, Video, FileArchive } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { TagModal } from './TagModal';
import { PageHeader } from './PageHeader';
import { saveImage, saveVideo, saveAudio, createLibraryItem, deleteLibraryItem as apiDeleteLibraryItem, updateLibraryItemOrders, fetchLibraryReferences, updateLibraryItem, duplicateLibrary, fetchLibraryItems, imageDisplayUrl, exportMediaLibraryZip } from '../api';
import { DuplicateLibraryDialog } from './DuplicateLibraryDialog';
import { RenameItemModal } from './RenameItemModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';
import { ExportFileNameModal } from './ExportFileNameModal';
import { toast } from 'sonner';

interface Props {
  library: Library;
  onUpdate: (lib: Library) => void;
  onDelete: () => void;
}

function getDefaultLibraryExportName(name: string): string {
  const raw = (name || '').trim() || 'Library';
  const withoutZip = raw.replace(/\.zip$/i, '').trim() || 'Library';
  const withoutAlbumSuffix = withoutZip.replace(/[\s_-]*album$/i, '').trim();
  const safeBase = (withoutAlbumSuffix || 'Library')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const compactBase = safeBase || 'Library';
  return `${compactBase}_Library.zip`;
}

export function LibraryEditor({ library, onUpdate, onDelete }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const searchTerm = searchParams.get('q') || '';

  const [showDeleteLibraryModal, setShowDeleteLibraryModal] = useState(false);
  const [showReferencesModal, setShowReferencesModal] = useState(false);
  const [referencingProjects, setReferencingProjects] = useState<{ id: string; name: string }[]>([]);
  const [checkingReferences, setCheckingReferences] = useState(false);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState(searchTerm);
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
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState(getDefaultLibraryExportName(library.name));
  const [exportingLibrary, setExportingLibrary] = useState(false);

  // Server-side paginated items
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingItems, setLoadingItems] = useState(true);

  const ITEMS_PER_PAGE = 25;
  const selectedTagsKey = selectedFilterTags.join('\u0000');

  const setCurrentPage = useCallback((page: number | ((prev: number) => number)) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const prevPage = parseInt(prev.get('page') || '1', 10);
      const newPage = typeof page === 'function' ? page(prevPage) : page;
      next.set('page', Math.max(1, newPage).toString());
      return next;
    });
  }, [setSearchParams]);

  const setSearchTerm = useCallback((q: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const normalized = q.trim();
      if (normalized) {
        next.set('q', normalized);
      } else {
        next.delete('q');
      }
      next.set('page', '1');
      return next;
    });
  }, [setSearchParams]);

  // Fetch items from server when page/search/library changes
  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const result = await fetchLibraryItems(library.id, currentPage, ITEMS_PER_PAGE, searchTerm || undefined, selectedFilterTags);
      setItems(result.items);
      setTotalItems(result.total);
      setTotalPages(result.pages);
    } catch (e) {
      console.error('Failed to load items:', e);
    } finally {
      setLoadingItems(false);
    }
  }, [library.id, currentPage, searchTerm, selectedTagsKey]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  const hasActiveItemFilters = Boolean(searchTerm) || selectedFilterTags.length > 0;

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
        const rangeIds = items.slice(start, end + 1).map(item => item.id);

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
    if (selectedItemIds.size === items.length && items.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(items.map(item => item.id)));
    }
  };

  const deleteSelectedItems = async () => {
    const idsToDelete = Array.from(selectedItemIds);
    try {
      for (const id of idsToDelete) {
        await apiDeleteLibraryItem(library.id, id);
      }
      setSelectedItemIds(new Set());
      setLastSelectedIndex(null);
      await loadItems();
    } catch (e) {
      console.error('Failed to delete items:', e);
    }
    setShowDeleteSelectedModal(false);
  };

  const handleBatchTagSave = async (tagsToAdd: string[]) => {
     if (tagsToAdd.length === 0) return;
     for (const id of selectedItemIds) {
       const item = items.find(i => i.id === id);
       if (item) {
         const currentTags = item.tags || [];
         const updatedTags = Array.from(new Set([...currentTags, ...tagsToAdd]));
         await updateLibraryItem(library.id, id, { tags: updatedTags }).catch(console.error);
       }
     }
     setSelectedItemIds(new Set());
     setLastSelectedIndex(null);
     await loadItems();
  };

  const handleSingleTagSave = async (tags: string[]) => {
    if (!tagModalItemId) return;
    await updateLibraryItem(library.id, tagModalItemId, { tags }).catch(console.error);
    await loadItems();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showTagFilterDropdown) return;
    const handleClick = () => setShowTagFilterDropdown(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showTagFilterDropdown]);

  const availableTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    [...library.items, ...items].forEach(i => {
      if (i.tags) i.tags.forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [library.items, items]);

  const toggleFilterTag = (tag: string) => {
    setCurrentPage(1);
    setSelectedFilterTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

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

  const handleDuplicateLibrary = async (name: string) => {
    try {
      const duplicated = await duplicateLibrary(library.id, name);
      toast.success(t('libraries.duplicateDialog.success', { name: library.name }));
      navigate(`/library/${duplicated.id}`);
    } catch (error: any) {
      toast.error(error.message || t('libraries.duplicateDialog.error'));
      throw error;
    }
  };

  const handleRemoveItem = (index: number) => {
    setItemToRemoveIndex(index);
  };

  const confirmRemoveItem = async () => {
    if (itemToRemoveIndex !== null) {
      const item = items[itemToRemoveIndex];
      if (item) {
        try {
          await apiDeleteLibraryItem(library.id, item.id);
          await loadItems();
        } catch (e) {
          console.error('Failed to delete item:', e);
        }
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
      const reordered = [...items];
      const draggedItem = reordered[draggedIndex];
      reordered.splice(draggedIndex, 1);
      reordered.splice(dragOverIndex, 0, draggedItem);

      // Optimistic update for immediate visual feedback
      setItems(reordered);

      const pageOffset = (currentPage - 1) * ITEMS_PER_PAGE;
      const updates = reordered.map((item, idx) => ({ id: item.id, order: pageOffset + idx }));
      try {
        await updateLibraryItemOrders(library.id, updates);
      } catch (err) {
        console.error('Failed to save updated order', err);
        await loadItems();
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });

        let result;
        if (library.type === 'image') {
          result = await saveImage(base64, library.id);
        } else if (library.type === 'video') {
          result = await saveVideo(base64, library.id);
        } else if (library.type === 'audio') {
          result = await saveAudio(base64, library.id);
        } else {
          throw new Error('Unsupported library type for upload');
        }

        const newItem = {
          id: crypto.randomUUID(),
          content: result.key,
          title: file.name,
          order: totalItems + files.indexOf(file),
          thumbnailUrl: 'thumbnailKey' in result ? result.thumbnailKey : undefined,
          optimizedUrl: 'optimizedKey' in result ? result.optimizedKey : undefined,
          size: result.size
        };
        await createLibraryItem(library.id, newItem);
      }

      await loadItems();
    } catch (err: any) {
      console.error('Failed to upload files:', err);
      toast.error(err.message || t('libraryEditor.toasts.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateTitle = async (itemId: string, newTitle: string) => {
    const updatedTitle = newTitle.trim();
    try {
      await updateLibraryItem(library.id, itemId, { title: updatedTitle });
      await loadItems();
    } catch (err) {
      console.error('Failed to update title', err);
      toast.error('Failed to update title');
    }
    setEditingTitleId(null);
  };

  const handleConfirmExportLibrary = async (fileName: string) => {
    setExportingLibrary(true);
    try {
      await exportMediaLibraryZip(library.id, fileName);
      setShowExportModal(false);
      navigate('/exports');
      toast.success(t('libraryEditor.exportModal.success', 'Library export queued.'));
    } catch (error: any) {
      toast.error(error?.message || t('libraryEditor.exportModal.error', 'Failed to export library'));
    } finally {
      setExportingLibrary(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 w-full overflow-hidden animate-in fade-in duration-700">
      <PageHeader
        title={library.name}
        description={(
          <div className="flex items-center gap-4 mt-2 md:mt-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-400 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-sm">
              {t('libraryEditor.collectionType', { type: library.type || 'text' })}
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 px-3 py-1.5 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg shadow-sm">
              {t('libraries.libraryCard.items', { count: totalItems })}
            </div>
          </div>
        )}
        size="large"
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSearchTerm(searchInput); }}
                placeholder={t('libraryEditor.filterItems')}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all w-full sm:w-48 lg:w-64 font-medium shadow-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {library.type === 'text' ? (
                <button
                  onClick={() => navigate(`/library/${library.id}/prompt/new`)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-5 py-2.5 rounded-xl transition-all border border-blue-700 active:scale-95 group shadow-lg shadow-blue-600/10"
                >
                  <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                  <span className="text-xs font-bold uppercase tracking-widest">{t('libraryEditor.addFragment')}</span>
                </button>
              ) : (
                <label className={`flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-5 py-2.5 rounded-xl transition-all border border-blue-700 active:scale-95 group shadow-lg shadow-blue-600/10 ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   library.type === 'audio' ? <Music className="w-4 h-4 transition-transform group-hover:scale-110" /> :
                   library.type === 'video' ? <Video className="w-4 h-4 transition-transform group-hover:scale-110" /> :
                   <ImageIcon className="w-4 h-4 transition-transform group-hover:scale-110" />}
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {uploading ? t('libraryEditor.uploading') : t('libraryEditor.upload')}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept={
                      library.type === 'image' ? 'image/*' :
                      library.type === 'video' ? 'video/*' :
                      library.type === 'audio' ? 'audio/*' :
                      '*/*'
                    }
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              )}

              <button
                onClick={() => setShowDuplicateDialog(true)}
                className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-blue-400/20 active:scale-95"
                title={t('libraries.libraryCard.duplicate')}
              >
                <Copy className="w-5 h-5" />
              </button>

              <button
                onClick={() => navigate(`/library/${library.id}/edit`)}
                className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-neutral-700 active:scale-95"
                title={t('libraryEditor.editLibrarySettings')}
              >
                <Settings className="w-5 h-5" />
              </button>

              {library.type === 'text' && (
                <button
                  onClick={() => navigate(`/library/${library.id}/import-export`)}
                  className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-blue-400/20 active:scale-95"
                  title={t('libraryEditor.importOutput')}
                >
                  <UploadCloud className="w-5 h-5" />
                </button>
              )}

              {(library.type === 'image' || library.type === 'video' || library.type === 'audio') && (
                <button
                  onClick={() => {
                    setExportFileName(getDefaultLibraryExportName(library.name));
                    setShowExportModal(true);
                  }}
                  className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-blue-400/20 active:scale-95"
                  title={t('libraryEditor.exportModal.trigger', 'Export ZIP')}
                >
                  <FileArchive className="w-5 h-5" />
                </button>
              )}

              <button
                onClick={handleDeleteLibrary}
                disabled={checkingReferences}
                className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-red-500 hover:bg-red-400/10 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-red-400/20 active:scale-95 disabled:opacity-50"
                title={t('libraryEditor.deleteLibrary')}
              >
                {checkingReferences ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto pr-2 md:pr-4 -mr-2 md:-mr-4 custom-scrollbar space-y-3 md:space-y-6 pb-20">
        {/* Batch Action Toolbar (Mirrors item style) */}
        {items.length > -1 && (
          <div className={`
            sticky top-0 z-20 flex flex-nowrap items-center justify-between gap-2 p-3 rounded-2xl border transition-all duration-300 shadow-xl
            ${selectedItemIds.size > 0
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'}
          `}>
             <div className="flex items-center gap-2 flex-1 min-w-0">
               <div className="flex items-center gap-2 px-1">
                 <div
                   onClick={toggleSelectAll}
                   className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
                 >
                   {selectedItemIds.size === items.length && items.length > 0 ? (
                     <CheckSquare className="w-5 h-5 text-blue-500" />
                   ) : selectedItemIds.size > 0 ? (
                     <div className="w-5 h-5 flex items-center justify-center">
                       <div className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
                     </div>
                   ) : (
                     <Square className="w-5 h-5 text-neutral-600" />
                   )}
                 </div>
                 <span className={`text-[10px] font-black uppercase tracking-widest hidden sm:inline ${selectedItemIds.size > 0 ? 'text-white' : 'text-neutral-500 dark:text-neutral-500'}`}>
                   {selectedItemIds.size > 0 ? t('libraryEditor.selectedCount', { count: selectedItemIds.size }) : t('libraryEditor.selectAll')}
                 </span>
                 {selectedItemIds.size > 0 && <span className="text-[10px] font-black sm:hidden">{selectedItemIds.size}</span>}
               </div>

               {/* Tag Filter Dropdown */}
               <div className="relative" onClick={e => e.stopPropagation()}>
                 <button
                   onClick={() => setShowTagFilterDropdown(!showTagFilterDropdown)}
                   className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                     selectedFilterTags.length > 0
                       ? 'bg-blue-600/10 border-blue-500/40 text-blue-400'
                       : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:border-neutral-700 hover:text-neutral-300'
                   }`}
                 >
                   <TagIcon className="w-3.5 h-3.5" />
                   <span className="hidden xs:inline">
                     {selectedFilterTags.length === 0 ? t('libraryEditor.filterByTag') :
                      selectedFilterTags.length === 1 ? selectedFilterTags[0] :
                      t('libraryEditor.tagsSelected', { count: selectedFilterTags.length })}
                   </span>
                   <ChevronDown className={`w-3 h-3 transition-transform ${showTagFilterDropdown ? 'rotate-180' : ''}`} />
                 </button>

                {showTagFilterDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] p-2 animate-in fade-in zoom-in-95 duration-200">
                    <button
                      onClick={() => {
                        setSelectedFilterTags([]);
                        setCurrentPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors mb-1 ${
                        selectedFilterTags.length === 0 ? 'bg-blue-600 text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-800 hover:text-white'
                      }`}
                    >
                      {t('libraryEditor.allFragments')}
                    </button>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {availableTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleFilterTag(tag)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-between group ${
                            selectedFilterTags.includes(tag) ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-800 hover:text-white'
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
              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                <button
                  onClick={() => setShowBatchTagModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest border border-white/20"
                >
                  <TagIcon className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('libraryEditor.batchTag')}</span>
                </button>
                <button
                  onClick={() => setShowDeleteSelectedModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest border border-red-700 shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('libraryEditor.delete')}</span>
                </button>
                <div className="w-px h-4 bg-neutral-200/60 dark:bg-neutral-800/60 mx-1"></div>
                <button
                  onClick={() => setSelectedItemIds(new Set())}
                  className="p-1 text-neutral-500 dark:text-neutral-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {loadingItems && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        <div className={`${library.type !== 'text' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8" : "space-y-2.5"} ${loadingItems ? 'hidden' : ''}`}>
          {items.map((item, index) => {
            const isExpanded = expandedItemId === item.id;
            const isSelected = selectedItemIds.has(item.id);

            return (
            <div
              key={item.id}
              className={`group relative flex flex-col transition-all duration-300 ${draggedIndex === index ? 'opacity-50' : ''} ${dragOverIndex === index ? 'ring-2 ring-blue-500 rounded-xl scale-105 z-10' : ''}`}
              draggable={library.type === 'image' && !hasActiveItemFilters}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              onDrop={(e) => e.preventDefault()}
            >
                <div className={`
                  group/item flex flex-col transition-all duration-300 border overflow-hidden
                  ${isSelected
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900 shadow-[0_0_20px_rgba(59,130,246,0.15)] z-10'
                    : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-700 shadow-sm'}
                  ${library.type === 'image'
                    ? 'rounded-3xl aspect-square p-3'
                    : 'rounded-2xl cursor-pointer'}
                `}>
                  {library.type !== 'text' ? (
                    <div className={`relative flex-1 rounded-xl overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-4 ring-blue-500/50 scale-95' : ''}`} onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) toggleItemSelection(item.id, index, e);
                      else {
                        if (library.type === 'image') setLightboxIndex(index);
                        // For video/audio, expansion or separate player could be used, but for now let's just use the grid
                      }
                    }}>
                      {library.type === 'image' ? (
                        <img src={item.thumbnailUrl || item.content} alt={`${index}`} className="w-full h-full object-cover transition-transform duration-1000 group-hover/item:scale-110" />
                      ) : library.type === 'video' ? (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-800">
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <Video className="w-12 h-12 text-neutral-600" />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/item:bg-black/40 transition-colors">
                            <Play className="w-10 h-10 text-neutral-900 dark:text-white opacity-80" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-800">
                          <Music className="w-12 h-12 text-neutral-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3">
                        <div className="flex flex-col gap-1.5">
                            <div
                              className="flex items-center justify-between gap-1 group/title cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTitleId(item.id);
                                setTempTitle(item.title || '');
                              }}
                              title={t('libraryEditor.clickToRename', 'Click to rename')}
                            >
                              <span className="text-[10px] font-bold text-white/90 truncate flex-1">
                                {item.title || (library.type === 'image' ? t('libraryEditor.imageLabel', { index: (currentPage - 1) * ITEMS_PER_PAGE + index + 1 }) :
                                 library.type === 'video' ? 'Video ' + ((currentPage - 1) * ITEMS_PER_PAGE + index + 1) : 'Audio ' + ((currentPage - 1) * ITEMS_PER_PAGE + index + 1))}
                              </span>
                              <Edit3 className="w-3 h-3 text-white/40 group-hover/item:text-white/70 flex-shrink-0 transition-colors" />
                            </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest truncate max-w-[60px]">
                              {library.type.toUpperCase()}
                            </span>
                            <div className="flex items-center gap-1.5">
                               <button
                                 onClick={(e) => { e.stopPropagation(); setTagModalItemId(item.id); }}
                                 className="p-1.5 bg-neutral-50/80 dark:bg-neutral-950/80 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 rounded-lg backdrop-blur-md border border-white/5 hover:border-blue-400/20 transition-all active:scale-90"
                                 title={t('libraryEditor.editTags')}
                               >
                                 <TagIcon className="w-3.5 h-3.5" />
                               </button>
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                                 className="p-1.5 bg-neutral-50/80 dark:bg-neutral-950/80 text-neutral-600 dark:text-neutral-400 hover:text-red-500 rounded-lg backdrop-blur-md border border-white/5 hover:border-red-500/20 transition-all active:scale-90"
                               >
                                 <Trash2 className="w-3.5 h-3.5" />
                               </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`px-3 py-3 md:px-5 md:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${isExpanded ? 'border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800/40' : ''}`}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) toggleItemSelection(item.id, index, e);
                          else toggleItemExpand(item.id, e);
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            onClick={(e) => toggleItemSelection(item.id, index, e)}
                            className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4.5 h-4.5 text-blue-500" />
                            ) : (
                              <Square className="w-4.5 h-4.5 text-neutral-600" />
                            )}
                          </div>
                          <div className="p-0.5 cursor-pointer shrink-0" onClick={(e) => toggleItemExpand(item.id, e)}>
                            <ChevronDown className={`w-4 h-4 text-neutral-500 dark:text-neutral-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {item.title && (
                              <h4 className="text-blue-400 text-[9px] font-black uppercase tracking-widest truncate shrink-0 px-1.5 py-0.5 bg-blue-400/5 border border-blue-400/10 rounded">
                                {item.title}
                              </h4>
                            )}
                            <span className={`text-xs font-medium truncate flex-1 ${isExpanded ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>
                              {item.content}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 w-full sm:w-auto">
                          {(item.tags && item.tags.length > 0) && (
                            <div className="flex items-center gap-1.5">
                              {item.tags.slice(0, 1).map(t => (
                                <span key={t} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[9px] font-bold tracking-wider truncate max-w-[60px] uppercase">{t}</span>
                              ))}
                              {item.tags.length > 1 && (
                                <span className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-500 rounded text-[9px] font-bold tracking-wider">+{item.tags.length - 1}</span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1 opacity-60 group-hover/item:opacity-100 transition-opacity ml-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); setTagModalItemId(item.id); }}
                              className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all active:scale-95"
                              title={t('libraryEditor.editTags')}
                            >
                              <TagIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                               onClick={(e) => { e.stopPropagation(); navigate(`/library/${library.id}/prompt/${item.id}`); }}
                               className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-neutral-800/80 rounded-lg transition-all active:scale-95"
                               title={library.type === 'text' ? t('libraryEditor.refineInFullEditor') : t('libraryEditor.editDetails', 'Edit Details')}
                             >
                               {library.type === 'text' ? <Edit3 className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
                             </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                              className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all active:scale-95"
                              title={t('libraryEditor.deleteFragment')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-4 md:p-8 space-y-4 animate-in slide-in-from-top-1 duration-200 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/20">
                          <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">{t('libraryEditor.fullSource')}</label>
                               <span className="text-[8px] font-bold text-neutral-700 uppercase tracking-tighter">{t('libraryEditor.markdownEnabled')}</span>
                             </div>
                             <div className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50/50 dark:bg-neutral-950/50 p-4 rounded-xl border border-neutral-200/50 dark:border-neutral-800/50 select-all whitespace-pre-wrap font-mono">
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

          {items.length === 0 && !loadingItems && (
            <div className="col-span-full py-24 m-4 md:m-8 text-center border-2 border-dashed border-neutral-200/50 dark:border-neutral-800/50 rounded-[40px] bg-white/10 dark:bg-neutral-900/10 flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in-95">
              <div className="p-8 rounded-[32px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl">
                {hasActiveItemFilters ? <Search className="w-16 h-16 text-neutral-800" /> : <Plus className="w-16 h-16 text-neutral-800" />}
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-neutral-500 dark:text-neutral-500 tracking-tight italic">
                  {hasActiveItemFilters ? t('libraryEditor.noResultsFound') : t('libraryEditor.emptyTitle')}
                </p>
                <p className="text-[10px] font-black text-neutral-700 uppercase tracking-[0.3em]">
                  {hasActiveItemFilters ? t('libraryEditor.tryDifferentSearch') : t('libraryEditor.emptyDescription')}
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
              className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:text-white hover:border-neutral-700 rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
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
                      ? 'bg-blue-600 text-neutral-900 dark:text-white shadow-lg shadow-blue-500/20 border-transparent'
                      : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:text-white hover:border-neutral-700 rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
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
        title={t('libraryEditor.confirm.deleteLibrary.title')}
        message={t('libraryEditor.confirm.deleteLibrary.message', { name: library.name })}
        confirmText={t('libraryEditor.confirm.deleteLibrary.confirm')}
        type="danger"
      />

      {/* References warning modal */}
      {showReferencesModal && createPortal(
        <div
          className="fixed inset-0 z-[900] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setShowReferencesModal(false)}
        >
          <div
            className="bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800/50 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-start gap-6">
                <div className="p-4 rounded-3xl flex-shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t('libraryEditor.references.title')}</h3>
                  <p className="mt-3 text-base text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    {t('libraryEditor.references.message', { name: library.name, count: referencingProjects.length })}
                  </p>
                  <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                    {referencingProjects.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-200/50 dark:bg-neutral-800/50 px-3 py-2 rounded-lg">
                        <Play className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-8 py-6 bg-neutral-50/40 dark:bg-neutral-950/40 flex items-center justify-end gap-4 border-t border-neutral-200/50 dark:border-neutral-800/50">
              <button
                onClick={() => setShowReferencesModal(false)}
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
              >
                {t('confirmModal.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowReferencesModal(false);
                  navigate(`/library/${library.id}/cleanup`);
                }}
                className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-neutral-900 dark:text-white shadow-2xl shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                {t('libraryEditor.references.resolve')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={itemToRemoveIndex !== null}
        onClose={() => setItemToRemoveIndex(null)}
        onConfirm={confirmRemoveItem}
        title={t('libraryEditor.confirm.expungeFragment.title')}
        message={t('libraryEditor.confirm.expungeFragment.message')}
        confirmText={t('libraryEditor.confirm.expungeFragment.confirm')}
        type="danger"
      />

      {lightboxIndex !== null && items[lightboxIndex] && (
        <ImageLightbox
          images={items.map(item => imageDisplayUrl(item.optimizedUrl || item.content))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteSelectedModal}
        onClose={() => setShowDeleteSelectedModal(false)}
        onConfirm={deleteSelectedItems}
        title={t('libraryEditor.confirm.deleteSelected.title')}
        message={t('libraryEditor.confirm.deleteSelected.message', { count: selectedItemIds.size })}
        confirmText={t('libraryEditor.confirm.deleteSelected.confirm')}
        type="danger"
      />

      <TagModal
        isOpen={showBatchTagModal}
        onClose={() => setShowBatchTagModal(false)}
        onSave={handleBatchTagSave}
        title={t('libraryEditor.tagModal.batchTitle')}
        description={t('libraryEditor.tagModal.batchDescription', { count: selectedItemIds.size })}
        saveButtonText={t('libraryEditor.tagModal.addTags')}
      />

      <TagModal
        isOpen={tagModalItemId !== null}
        onClose={() => setTagModalItemId(null)}
        onSave={handleSingleTagSave}
        initialTags={tagModalItemId ? (items.find(i => i.id === tagModalItemId)?.tags || []) : []}
        title={t('libraryEditor.tagModal.editTitle')}
      />

      <RenameItemModal
        isOpen={editingTitleId !== null}
        onClose={() => setEditingTitleId(null)}
        onConfirm={(newTitle) => editingTitleId ? handleUpdateTitle(editingTitleId, newTitle) : undefined}
        initialName={tempTitle}
      />

      <DuplicateLibraryDialog
        isOpen={showDuplicateDialog}
        currentName={library.name}
        onClose={() => setShowDuplicateDialog(false)}
        onConfirm={handleDuplicateLibrary}
      />

      <ExportFileNameModal
        isOpen={showExportModal}
        defaultName={exportFileName}
        exporting={exportingLibrary}
        onClose={() => setShowExportModal(false)}
        onConfirm={handleConfirmExportLibrary}
      />
    </div>
  );
}

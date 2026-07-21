import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, LibraryItem } from '../types';
import { Trash2, Plus, Image as ImageIcon, Edit3, Settings, Search, ArrowRight, ArrowLeft, Loader2, X, AlertCircle, Play, UploadCloud, Tag as TagIcon, CheckSquare, Square, ChevronDown, Copy, Music, Video, FileArchive, FileText, Stars, Filter, ArrowDownNarrowWide, Check } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { TagModal } from './TagModal';
import { PageHeader } from './PageHeader';
import { saveImage, saveVideo, saveAudio, createLibraryItem, deleteLibraryItem as apiDeleteLibraryItem, updateLibraryItem, duplicateLibrary, fetchLibraryItems, imageDisplayUrl, exportMediaLibraryZip, copyLibraryItems, moveLibraryItems, fetchLibraryReferences } from '../api';
import { DuplicateLibraryDialog } from './DuplicateLibraryDialog';
import { CopyMoveItemsDialog } from './CopyMoveItemsDialog';
import { RenameItemModal } from './RenameItemModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';
import { ExportFileNameModal } from './ExportFileNameModal';
import type { BoundContext } from './Assistant/AssistantComposer';
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

function formatLibraryItemDateTime(value?: number): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [tagModalItemId, setTagModalItemId] = useState<string | null>(null);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [showTagFilterDropdown, setShowTagFilterDropdown] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState(getDefaultLibraryExportName(library.name));
  const [exportingLibrary, setExportingLibrary] = useState(false);
  const [showCopyMoveDialog, setShowCopyMoveDialog] = useState(false);
  const [copyMoveAction, setCopyMoveAction] = useState<'copy' | 'move'>('copy');

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

  const sortBy = (searchParams.get('sortBy') as 'time' | 'name') || 'time';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';

  const setSort = useCallback((newSortBy: 'time' | 'name', newSortOrder: 'asc' | 'desc') => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('sortBy', newSortBy);
      next.set('sortOrder', newSortOrder);
      next.set('page', '1');
      return next;
    });
  }, [setSearchParams]);

  // Fetch items from server when page/search/library changes
  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const result = await fetchLibraryItems(
        library.id, 
        currentPage, 
        ITEMS_PER_PAGE, 
        searchTerm || undefined, 
        selectedFilterTags,
        sortBy,
        sortOrder
      );
      setItems(result.items);
      setTotalItems(result.total);
      setTotalPages(result.pages);
    } catch (e) {
      console.error('Failed to load items:', e);
    } finally {
      setLoadingItems(false);
    }
  }, [library.id, currentPage, searchTerm, selectedTagsKey, sortBy, sortOrder]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  const hasActiveItemFilters = Boolean(searchTerm) || selectedFilterTags.length > 0;

  useEffect(() => {
    if (!viewingItemId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewingItemId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingItemId]);

  const viewingItem = viewingItemId ? items.find(i => i.id === viewingItemId) : null;

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
      await loadItems();
      setSelectedItemIds(new Set());
      setLastSelectedIndex(null);
      setShowDeleteSelectedModal(false);
    } catch (e) {
      console.error('Failed to delete items:', e);
      throw e;
    }
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

  const handleCopyMoveConfirm = async (destinationLibraryId: string) => {
    const itemIds = Array.from(selectedItemIds);
    try {
      if (copyMoveAction === 'copy') {
        await copyLibraryItems(library.id, itemIds, destinationLibraryId);
        toast.success(t('libraryEditor.copySuccess', { count: itemIds.length }));
      } else {
        await moveLibraryItems(library.id, itemIds, destinationLibraryId);
        toast.success(t('libraryEditor.moveSuccess', { count: itemIds.length }));
      }
      setSelectedItemIds(new Set());
      setLastSelectedIndex(null);
      await loadItems();
    } catch (e: any) {
      console.error(`Failed to ${copyMoveAction} items:`, e);
      toast.error(e.message || t(`libraryEditor.${copyMoveAction}Error`, `Failed to ${copyMoveAction} items`));
      throw e;
    }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setUploading(true);
    try {
      const filesToUpload = [...files].reverse();
      for (const file of filesToUpload) {
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

  const handleStartAssistantChat = () => {
    const libraryContext: BoundContext = {
      id: library.id,
      name: library.name,
      type: 'library',
      subType: library.type || 'text',
    };

    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: {
        draftBoundContexts: [libraryContext],
      },
    });
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 w-full overflow-hidden animate-in fade-in duration-700">
      <PageHeader
        title={library.name}
        description={(
          <div className="mt-2 md:mt-3 space-y-3">
            {library.description && (
              <p className="max-w-3xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                {library.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600 dark:text-neutral-400 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-sm">
                {t('libraryEditor.collectionType', { type: library.type || 'text' })}
              </div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 px-3 py-1.5 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg shadow-sm">
                {t('libraries.libraryCard.items', { count: totalItems })}
              </div>
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
                  className="p-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all border border-blue-700 active:scale-95 group shadow-lg shadow-blue-600/10"
                  title={t('libraryEditor.addItem')}
                  aria-label={t('libraryEditor.addItem')}
                >
                  <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
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
                onClick={handleStartAssistantChat}
                className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-neutral-700 active:scale-95"
                title={t('libraryEditor.startAssistantChat', { defaultValue: 'Start assistant chat for this library' })}
                aria-label={t('libraryEditor.startAssistantChat', { defaultValue: 'Start assistant chat for this library' })}
              >
                <Stars className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowDuplicateDialog(true)}
                className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-blue-400/20 active:scale-95"
                title={t('libraries.libraryCard.duplicate')}
              >
                <Copy className="w-5 h-5" />
              </button>

              <button
                onClick={() => navigate(`/library/${library.id}/edit`)}
                className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80 rounded-xl transition-all border border-neutral-200/50 dark:border-neutral-800/50 hover:border-neutral-700 active:scale-95"
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
            sticky top-0 z-20 flex flex-nowrap items-center justify-between gap-2 p-3 border transition-colors
            ${selectedItemIds.size > 0
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'}
          `}>
             <div className="flex items-center gap-2 flex-1 min-w-0">
               <div className="flex items-center gap-2 px-1">
                 <div
                   onClick={toggleSelectAll}
                   className="p-1 hover:bg-white/5 transition-colors cursor-pointer"
                 >
                   {selectedItemIds.size === items.length && items.length > 0 ? (
                     <CheckSquare className="w-5 h-5 text-blue-500" />
                   ) : selectedItemIds.size > 0 ? (
                     <div className="w-5 h-5 flex items-center justify-center">
                       <div className="w-2.5 h-0.5 bg-blue-500" />
                     </div>
                   ) : (
                     <Square className="w-5 h-5 text-neutral-600" />
                   )}
                 </div>
                 <span className={`text-xs font-medium hidden sm:inline ${selectedItemIds.size > 0 ? 'text-white' : 'text-neutral-500 dark:text-neutral-500'}`}>
                   {selectedItemIds.size > 0 ? t('libraryEditor.selectedCount', { count: selectedItemIds.size }) : t('libraryEditor.selectAll')}
                 </span>
                 {selectedItemIds.size > 0 && <span className="text-xs font-medium sm:hidden">{selectedItemIds.size}</span>}
               </div>

               {/* Tag Filter Dropdown */}
               <div className="relative" onClick={e => e.stopPropagation()}>
                 <button
                   onClick={() => setShowTagFilterDropdown(!showTagFilterDropdown)}
                   className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors border ${
                     selectedFilterTags.length > 0
                       ? 'bg-blue-600/10 border-blue-500/40 text-blue-400'
                       : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:border-neutral-400 dark:hover:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300'
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
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] p-1 animate-in fade-in duration-150">
                    <button
                      onClick={() => {
                        setSelectedFilterTags([]);
                        setCurrentPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors mb-1 ${
                        selectedFilterTags.length === 0 ? 'bg-blue-600 text-white' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      {t('libraryEditor.allItems')}
                    </button>
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {availableTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleFilterTag(tag)}
                          className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between group ${
                            selectedFilterTags.includes(tag) ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
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

              <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 hidden sm:block" />

              <div className="flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1">
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [newSortBy, newSortOrder] = e.target.value.split('-') as [any, any];
                    setSort(newSortBy, newSortOrder);
                  }}
                  className="bg-transparent text-xs font-medium text-neutral-600 dark:text-neutral-400 focus:outline-none px-2 py-0.5 cursor-pointer appearance-none"
                >
                  <option value="time-desc">{t('libraryEditor.sort.timeDesc')}</option>
                  <option value="time-asc">{t('libraryEditor.sort.timeAsc')}</option>
                  <option value="name-asc">{t('libraryEditor.sort.nameAsc')}</option>
                  <option value="name-desc">{t('libraryEditor.sort.nameDesc')}</option>
                </select>
                <ArrowDownNarrowWide className="w-3.5 h-3.5 text-neutral-400" />
              </div>
            </div>

            {selectedItemIds.size > 0 && (
              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                <button
                  onClick={() => {
                    setCopyMoveAction('copy');
                    setShowCopyMoveDialog(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white transition-colors font-medium text-xs border border-white/20"
                >
                  <Copy className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('libraryEditor.copyTo', 'Copy To')}</span>
                </button>
                <button
                  onClick={() => {
                    setCopyMoveAction('move');
                    setShowCopyMoveDialog(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white transition-colors font-medium text-xs border border-white/20"
                >
                  <ArrowRight className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('libraryEditor.moveTo', 'Move To')}</span>
                </button>
                <button
                  onClick={() => setShowBatchTagModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white transition-colors font-medium text-xs border border-white/20"
                >
                  <TagIcon className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('libraryEditor.batchTag')}</span>
                </button>
                <button
                  onClick={() => setShowDeleteSelectedModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 text-white hover:bg-red-700 transition-colors font-medium text-xs border border-red-700"
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

        <div className={`${library.type !== 'text' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8" : items.length > 0 ? "border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 bg-white dark:bg-neutral-950" : ""} ${loadingItems ? 'hidden' : ''}`}>
          {items.map((item, index) => {
            const isSelected = selectedItemIds.has(item.id);
            const updatedAtLabel = formatLibraryItemDateTime(item.updatedAt);

            return (
            <div
              key={item.id}
              className={`group relative flex flex-col`}
            >
                <div className={`
                  group/item flex flex-col transition-colors
                  ${library.type === 'text'
                    ? isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
                    : `border overflow-hidden ${isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900 shadow-[0_0_20px_rgba(59,130,246,0.15)] z-10'
                        : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 dark:hover:border-neutral-700 shadow-sm'}
                      ${library.type === 'image' ? 'rounded-card aspect-square p-3' : 'rounded-card cursor-pointer'}`}
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
                    <div
                      className="h-11 px-3 md:px-4 flex items-center gap-3 cursor-pointer"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) toggleItemSelection(item.id, index, e);
                        else setViewingItemId(item.id);
                      }}
                    >
                        <div
                          onClick={(e) => toggleItemSelection(item.id, index, e)}
                          className="p-1 -m-1 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-400 dark:text-neutral-600" />
                          )}
                        </div>
                        {item.title && (
                          <span className="text-sm font-medium text-neutral-900 dark:text-white truncate shrink-0 max-w-[30%]">
                            {item.title}
                          </span>
                        )}
                        <span className="text-sm text-neutral-600 dark:text-neutral-400 truncate flex-1 min-w-0">
                          {item.content}
                        </span>
                        {(item.tags && item.tags.length > 0) && (
                          <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[11px] truncate max-w-[100px]">{item.tags[0]}</span>
                            {item.tags.length > 1 && (
                              <span className="text-[11px] text-neutral-500 dark:text-neutral-600">+{item.tags.length - 1}</span>
                            )}
                          </span>
                        )}
                        {updatedAtLabel && (
                          <span className="hidden md:block text-[11px] text-neutral-500 dark:text-neutral-600 tabular-nums whitespace-nowrap shrink-0">
                            {updatedAtLabel}
                          </span>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.content);
                              toast.success(t('libraryEditor.copiedToClipboard', { defaultValue: 'Copied to clipboard' }));
                            }}
                            className="p-2 text-neutral-600 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title={t('libraryEditor.copyContent', { defaultValue: 'Copy Content' })}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setTagModalItemId(item.id); }}
                            className="p-2 text-neutral-600 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title={t('libraryEditor.editTags')}
                          >
                            <TagIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/library/${library.id}/prompt/${item.id}`); }}
                            className="p-2 text-neutral-600 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80 transition-colors"
                            title={t('libraryEditor.refineInFullEditor')}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                            className="p-2 text-neutral-600 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title={t('libraryEditor.deleteItem')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {items.length === 0 && !loadingItems && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 bg-white/10 dark:bg-neutral-900/10 flex flex-col items-center justify-center gap-4 animate-in fade-in">
              {hasActiveItemFilters ? <Search className="w-10 h-10 text-neutral-300 dark:text-neutral-700" /> : <Plus className="w-10 h-10 text-neutral-300 dark:text-neutral-700" />}
              <div className="space-y-1">
                <p className="text-base font-semibold text-neutral-600 dark:text-neutral-400">
                  {hasActiveItemFilters ? t('libraryEditor.noResultsFound') : t('libraryEditor.emptyTitle')}
                </p>
                <p className="text-sm text-neutral-400 dark:text-neutral-600">
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
              className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-10 h-10 text-xs font-medium transition-colors active:scale-95 border ${
                    currentPage === i + 1
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
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
            className="bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800/50 rounded-card shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-start gap-6">
                <div className="p-4 rounded-card flex-shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/20">
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
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
              >
                {t('confirmModal.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowReferencesModal(false);
                  navigate(`/library/${library.id}/cleanup`);
                }}
                className="px-8 py-3 rounded-card text-xs font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-white shadow-2xl shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                {t('libraryEditor.references.resolve')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Text item detail dialog */}
      {viewingItem && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setViewingItemId(null)}
        >
          <div
            className="bg-white dark:bg-neutral-900/90 border border-neutral-200/50 dark:border-white/5 backdrop-blur-2xl rounded-card shadow-[0_50px_100px_rgba(0,0,0,0.3)] dark:shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(720px,calc(100dvh-3rem))] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              <div className="flex items-center gap-4 sm:gap-6 mb-6">
                <div className="p-3 sm:p-4 rounded-card flex-shrink-0 bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <FileText className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight truncate">
                    {viewingItem.title || t('libraryEditor.fullSource')}
                  </h3>
                  {(viewingItem.createdAt || viewingItem.updatedAt) && (
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-500 tabular-nums truncate">
                      {viewingItem.createdAt ? `${t('libraryEditor.createdAt', { defaultValue: 'Created' })} ${formatLibraryItemDateTime(viewingItem.createdAt)}` : ''}
                      {viewingItem.updatedAt && viewingItem.updatedAt !== viewingItem.createdAt ? `${viewingItem.createdAt ? ' · ' : ''}${t('libraryEditor.updatedAt', { defaultValue: 'Updated' })} ${formatLibraryItemDateTime(viewingItem.updatedAt)}` : ''}
                    </p>
                  )}
                  {(viewingItem.tags && viewingItem.tags.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {viewingItem.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-md text-[11px] font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
                {viewingItem.content}
              </div>
            </div>

            <div className="px-5 py-4 sm:px-8 sm:py-6 bg-neutral-50 dark:bg-black/20 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-4 border-t border-neutral-200/50 dark:border-white/5 shrink-0">
              <button
                onClick={() => setViewingItemId(null)}
                className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent active:scale-95"
              >
                {t('common.close', 'Close')}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewingItem.content);
                  toast.success(t('libraryEditor.copiedToClipboard', { defaultValue: 'Copied to clipboard' }));
                }}
                className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent active:scale-95 flex items-center justify-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                {t('libraryEditor.copyContent', { defaultValue: 'Copy Content' })}
              </button>
              <button
                onClick={() => navigate(`/library/${library.id}/prompt/${viewingItem.id}`)}
                className="w-full sm:w-auto px-5 sm:px-8 py-3 rounded-xl sm:rounded-card text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 flex items-center justify-center gap-2"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {t('libraryEditor.refineInFullEditor')}
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
        title={t('libraryEditor.confirm.removeItem.title')}
        message={t('libraryEditor.confirm.removeItem.message')}
        confirmText={t('libraryEditor.confirm.removeItem.confirm')}
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

      <CopyMoveItemsDialog
        isOpen={showCopyMoveDialog}
        action={copyMoveAction}
        sourceLibraryId={library.id}
        libraryType={library.type || 'text'}
        itemCount={selectedItemIds.size}
        onClose={() => setShowCopyMoveDialog(false)}
        onConfirm={handleCopyMoveConfirm}
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

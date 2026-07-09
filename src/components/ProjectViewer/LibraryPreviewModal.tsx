import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { X, ChevronDown, Library as LibraryIcon, Video as VideoIcon, Volume2, Search, ExternalLink } from 'lucide-react';
import { Library, LibraryItem } from '../../types';
import { imageDisplayUrl } from '../../api';
import { filterItemsByTags } from '../../lib/remixEngine';
import { ImageLightbox } from './ImageLightbox';

function TextLibraryItem({ 
  item, 
  isSelectionMode, 
  onSelect 
}: { 
  item: LibraryItem, 
  isSelectionMode?: boolean, 
  onSelect?: (content: string) => void 
}) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      onClick={() => {
        if (isSelectionMode && onSelect) {
          onSelect(item.content);
        } else {
          setIsExpanded(!isExpanded);
        }
      }}
      className={`bg-white/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3.5 md:p-4 cursor-pointer transition-all hover:border-emerald-500/30 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 group/text-item ${isExpanded ? 'shadow-xl border-emerald-500/20 ring-1 ring-emerald-500/10' : 'shadow-sm'} ${isSelectionMode ? 'hover:ring-2 hover:ring-blue-500/50' : ''}`}
    >
      <div className="flex justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2.5">
            {item.title && (
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                {item.title}
              </div>
            )}
            {isSelectionMode && (
              <div className="text-[8px] font-black uppercase tracking-widest text-blue-400 opacity-0 group-hover/text-item:opacity-100 transition-opacity">
                {t('projectViewer.libraryPreview.pickThisText')}
              </div>
            )}
          </div>
          <p className={`text-neutral-700 dark:text-neutral-300 text-sm leading-relaxed transition-all whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-1'}`}>
            {item.content}
          </p>
        </div>
        <div className={`p-1.5 rounded-lg bg-neutral-50/50 dark:bg-neutral-950/50 border border-neutral-200/50 dark:border-neutral-800/50 group-hover/text-item:bg-neutral-800 transition-all self-start ${isExpanded ? 'rotate-180 bg-emerald-500/10 border-emerald-500/20' : ''}`}>
           <ChevronDown className={`w-4 h-4 transition-colors ${isExpanded ? 'text-emerald-500' : 'text-neutral-600 group-hover/text-item:text-neutral-400'}`} />
        </div>
      </div>
    </div>
  );
}

interface LibraryPreviewModalProps {
  library: Library | null;
  selectedTags: string[];
  onUpdateTags: (tags: string[]) => void;
  tagMatchMode?: 'and' | 'or';
  onUpdateTagMatchMode?: (mode: 'and' | 'or') => void;
  onClose: () => void;
  isSelectionMode?: boolean;
  onSelectItem?: (itemContent: string) => void;
}

export function LibraryPreviewModal({
  library,
  selectedTags,
  onUpdateTags,
  tagMatchMode = 'or',
  onUpdateTagMatchMode,
  onClose,
  isSelectionMode = false,
  onSelectItem
}: LibraryPreviewModalProps) {
  const { t } = useTranslation();
  const [previewLightbox, setPreviewLightbox] = useState<{images: string[], index: number} | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery('');
  }, [library?.id]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const availableTags = React.useMemo(() => {
    if (!library) return [];
    const tagMap = new Map<string, string>();
    library.items.forEach(i => {
      if (i.tags) i.tags.forEach(t => {
        const key = t.toLowerCase();
        if (!tagMap.has(key)) tagMap.set(key, t);
      });
    });
    return Array.from(tagMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [library]);

  const filteredItems = React.useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return filterItemsByTags(library.items, selectedTags, tagMatchMode).filter(item => {
      if (q) {
        const inTitle = item.title?.toLowerCase().includes(q);
        const inContent = item.content?.toLowerCase().includes(q);
        const inTags = item.tags?.some(tag => tag.toLowerCase().includes(q));
        if (!inTitle && !inContent && !inTags) return false;
      }
      return true;
    });
  }, [library, selectedTags, query, tagMatchMode]);

  const isTagSelected = (tag: string) => selectedTags.some(t => t.toLowerCase() === tag.toLowerCase());

  const toggleTag = (tag: string) => {
    const next = isTagSelected(tag)
      ? selectedTags.filter(t => t.toLowerCase() !== tag.toLowerCase())
      : [...selectedTags, tag];
    onUpdateTags(next);
  };
  
  if (!library) return null;

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center md:p-8">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[100dvh] md:h-[85vh] bg-white dark:bg-neutral-900 md:border border-neutral-200 dark:border-neutral-800 md:rounded-card shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-4 py-3 md:px-5 md:py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:block p-2 bg-emerald-600/10 rounded-lg shrink-0">
              <LibraryIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base md:text-lg font-bold text-neutral-900 dark:text-white tracking-tight truncate">{library.name}</h3>
              {library.description && (
                <p className="mt-0.5 max-w-2xl text-xs leading-5 text-neutral-600 dark:text-neutral-400 hidden md:line-clamp-1">
                  {library.description}
                </p>
              )}
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5 truncate">
                {t('projectViewer.libraryPreview.itemsSummary', { filtered: filteredItems.length, total: library.items.length })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 shrink-0 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {(library.items.length > 0 || availableTags.length > 0) && (
          <div className="px-4 md:px-5 py-2.5 space-y-2 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            {library.items.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('projectViewer.libraryPreview.searchPlaceholder')}
                  autoFocus={isSelectionMode}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/40 transition-colors"
                />
              </div>
            )}
            {availableTags.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-y-auto md:max-h-24">
                <button
                  onClick={() => onUpdateTags([])}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                    selectedTags.length === 0
                      ? 'bg-blue-600 text-white border-transparent'
                      : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {t('projectViewer.libraryPreview.allItems')}
                </button>
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    title={tag}
                    className={`shrink-0 max-w-[60vw] md:max-w-80 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                      isTagSelected(tag)
                        ? 'bg-blue-600/20 text-blue-500 dark:text-blue-400 border-blue-500/50'
                        : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <span className="block truncate">{tag}</span>
                  </button>
                ))}
              </div>
            )}
            {onUpdateTagMatchMode && selectedTags.length >= 2 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                  {t('projectViewer.libraryPreview.matchMode')}
                </span>
                <div className="inline-flex p-0.5 rounded-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                  {(['or', 'and'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => onUpdateTagMatchMode(mode)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                        tagMatchMode === mode
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                      }`}
                    >
                      {t(mode === 'and' ? 'projectViewer.libraryPreview.matchAll' : 'projectViewer.libraryPreview.matchAny')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 md:p-6 custom-scrollbar bg-neutral-50/10 dark:bg-neutral-950/10">
          {filteredItems.length === 0 ? (
             <div className="h-64 flex flex-col items-center justify-center text-neutral-600 gap-4 opacity-50">
               <LibraryIcon className="w-12 h-12 stroke-[1px]" />
               <div className="text-center">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('projectViewer.libraryPreview.noItemsMatch')}</p>
                 <button onClick={() => { onUpdateTags([]); setQuery(''); }} className="text-[9px] font-bold text-blue-500/60 hover:text-blue-500 underline uppercase tracking-widest">{t('projectViewer.libraryPreview.clearAllFilters')}</button>
               </div>
             </div>
          ) : (
            <div className={library.type === 'text' ? "max-w-4xl mx-auto space-y-2 md:space-y-3" : "grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"}>
              {filteredItems.map(item => (
                library.type === 'text' ? (
                  <TextLibraryItem 
                    key={item.id} 
                    item={item} 
                    isSelectionMode={isSelectionMode} 
                    onSelect={onSelectItem} 
                  />
                ) : (
                  <div key={item.id} className="bg-white/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden flex flex-col shadow-sm group/card">
                    {library.type === 'image' && (
                      <div 
                        className={`aspect-video bg-black relative border-b border-neutral-200 dark:border-neutral-800 group/img-container cursor-pointer overflow-hidden ${isSelectionMode ? 'ring-inset hover:ring-2 hover:ring-blue-500' : ''}`}
                        onClick={() => {
                          if (isSelectionMode && onSelectItem) {
                            onSelectItem(item.content);
                          } else {
                            const imageItems = library.items.filter(i => i.content).map(i => imageDisplayUrl(i.optimizedUrl || i.content));
                            const currentDisplay = imageDisplayUrl(item.optimizedUrl || item.content);
                            const idx = imageItems.indexOf(currentDisplay);
                            setPreviewLightbox({ images: imageItems, index: idx >= 0 ? idx : 0 });
                          }
                        }}
                      >
                        <img 
                          src={imageDisplayUrl(item.thumbnailUrl || item.content)} 
                          alt={item.content} 
                          className="w-full h-full object-cover" 
                        />
                        {isSelectionMode && (
                          <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover/img-container:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="px-3 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xl">
                              {t('projectViewer.libraryPreview.clickToSelect')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {library.type === 'video' && (
                      <div 
                        className={`aspect-video bg-black relative border-b border-neutral-200 dark:border-neutral-800 group/vid-container cursor-pointer overflow-hidden ${isSelectionMode ? 'ring-inset hover:ring-2 hover:ring-blue-500' : ''}`}
                        onClick={() => {
                          if (isSelectionMode && onSelectItem) {
                            onSelectItem(item.content);
                          }
                        }}
                      >
                        {item.thumbnailUrl ? (
                          <img 
                            src={imageDisplayUrl(item.thumbnailUrl)} 
                            alt={item.content} 
                            className="w-full h-full object-cover group-hover/vid-container:scale-105 transition-transform duration-500" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
                            <VideoIcon className="w-8 h-8 text-neutral-800" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                          <div className="flex items-center gap-2">
                             <div className="p-1 bg-white/10 rounded backdrop-blur-sm">
                               <VideoIcon className="w-3 h-3 text-neutral-900 dark:text-white" />
                             </div>
                             <span className="text-[8px] font-black text-neutral-900 dark:text-white uppercase tracking-widest">{t('projectViewer.common.video')}</span>
                          </div>
                        </div>
                        {isSelectionMode && (
                          <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover/vid-container:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="px-3 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xl">
                              {t('projectViewer.libraryPreview.clickToSelect')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {library.type === 'audio' && (
                      <div 
                        className={`aspect-[4/1] bg-neutral-50 dark:bg-neutral-950 relative border-b border-neutral-200 dark:border-neutral-800 group/aud-container cursor-pointer overflow-hidden ${isSelectionMode ? 'ring-inset hover:ring-2 hover:ring-blue-500' : ''}`}
                        onClick={() => {
                          if (isSelectionMode && onSelectItem) {
                            onSelectItem(item.content);
                          }
                        }}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          <Volume2 className="w-6 h-6 text-neutral-700 group-hover/aud-container:text-cyan-500/50 transition-colors" />
                        </div>
                        <div className="absolute inset-y-0 left-0 w-1 bg-cyan-500/40" />
                        {isSelectionMode && (
                          <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover/aud-container:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="px-3 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xl">
                              {t('projectViewer.libraryPreview.clickToSelect')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-3 md:p-4 flex-1">
                      {item.title && (
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2">{item.title}</div>
                      )}
                      <p className="text-neutral-600 dark:text-neutral-400 text-[11px] line-clamp-4 leading-relaxed group-hover/card:text-neutral-200 transition-colors">
                        <span className="opacity-60 italic whitespace-nowrap overflow-hidden text-ellipsis block">{item.content}</span>
                      </p>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 md:px-5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex justify-end pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2 md:gap-3 w-full sm:w-auto">
            {!isSelectionMode && (
              <Link
                to={`/library/${library.id}`}
                onClick={onClose}
                className="flex-1 sm:flex-none justify-center px-4 md:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-emerald-500 shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('projectViewer.libraryPreview.openFullLibrary')}
              </Link>
            )}
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 md:px-6 py-2.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-neutral-300 dark:border-neutral-700"
            >
              {t('projectViewer.libraryPreview.closeViewer')}
            </button>
          </div>
        </div>
      </div>
      {previewLightbox && (
        <ImageLightbox 
          images={previewLightbox.images}
          startIndex={previewLightbox.index}
          onClose={() => setPreviewLightbox(null)}
        />
      )}
    </div>,
    document.body
  );
}

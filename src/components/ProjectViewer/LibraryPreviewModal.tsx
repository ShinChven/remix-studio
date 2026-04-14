import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, Library as LibraryIcon, Video as VideoIcon, Volume2 } from 'lucide-react';
import { Library, LibraryItem } from '../../types';
import { imageDisplayUrl } from '../../api';
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
      className={`bg-white/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 cursor-pointer transition-all hover:border-emerald-500/30 hover:bg-neutral-800/50 group/text-item ${isExpanded ? 'shadow-xl border-emerald-500/20 ring-1 ring-emerald-500/10' : 'shadow-sm'} ${isSelectionMode ? 'hover:ring-2 hover:ring-blue-500/50' : ''}`}
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
  onClose: () => void;
  isSelectionMode?: boolean;
  onSelectItem?: (itemContent: string) => void;
}

export function LibraryPreviewModal({ 
  library, 
  selectedTags, 
  onUpdateTags, 
  onClose,
  isSelectionMode = false,
  onSelectItem
}: LibraryPreviewModalProps) {
  const { t } = useTranslation();
  const [previewLightbox, setPreviewLightbox] = useState<{images: string[], index: number} | null>(null);
  
  const availableTags = React.useMemo(() => {
    if (!library) return [];
    const tagSet = new Set<string>();
    library.items.forEach(i => {
      if (i.tags) i.tags.forEach(t => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [library]);

  const filteredItems = React.useMemo(() => {
    if (!library) return [];
    if (!selectedTags || selectedTags.length === 0) return library.items;
    return library.items.filter(item => 
      item.tags && item.tags.some(tag => selectedTags.includes(tag))
    );
  }, [library, selectedTags]);

  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag) 
      ? selectedTags.filter(t => t !== tag) 
      : [...selectedTags, tag];
    onUpdateTags(next);
  };
  
  if (!library) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/10 rounded-xl">
              <LibraryIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{library.name}</h3>
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5">
                {t('projectViewer.libraryPreview.itemsSummary', { filtered: filteredItems.length, total: library.items.length })}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {availableTags.length > 0 && (
          <div className="px-6 py-4 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-2">
            <div className="w-full text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-2 flex items-center gap-2">
              <span className="w-4 h-px bg-neutral-200 dark:bg-neutral-800" />
              {t('projectViewer.libraryPreview.filterByTags')}
            </div>
            <button
              onClick={() => onUpdateTags([])}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                selectedTags.length === 0
                  ? 'bg-blue-600 text-neutral-900 dark:text-white border-transparent'
                  : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {t('projectViewer.libraryPreview.allItems')}
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                    : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-neutral-50/10 dark:bg-neutral-950/10">
          {filteredItems.length === 0 ? (
             <div className="h-64 flex flex-col items-center justify-center text-neutral-600 gap-4 opacity-50">
               <LibraryIcon className="w-12 h-12 stroke-[1px]" />
               <div className="text-center">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('projectViewer.libraryPreview.noItemsMatch')}</p>
                 <button onClick={() => onUpdateTags([])} className="text-[9px] font-bold text-blue-500/60 hover:text-blue-500 underline uppercase tracking-widest">{t('projectViewer.libraryPreview.clearAllFilters')}</button>
               </div>
             </div>
          ) : (
            <div className={library.type === 'text' ? "max-w-4xl mx-auto space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
              {filteredItems.map(item => (
                library.type === 'text' ? (
                  <TextLibraryItem 
                    key={item.id} 
                    item={item} 
                    isSelectionMode={isSelectionMode} 
                    onSelect={onSelectItem} 
                  />
                ) : (
                  <div key={item.id} className="bg-white/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-sm group/card">
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
                          className="w-full h-full object-cover group-hover/img-container:scale-105 transition-transform duration-500" 
                        />
                        {isSelectionMode && (
                          <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover/img-container:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="px-3 py-1.5 bg-blue-600 text-neutral-900 dark:text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xl">
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
                            <div className="px-3 py-1.5 bg-blue-600 text-neutral-900 dark:text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xl">
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
                            <div className="px-3 py-1.5 bg-blue-600 text-neutral-900 dark:text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-xl">
                              {t('projectViewer.libraryPreview.clickToSelect')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-4 flex-1">
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

        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-neutral-700"
          >
            {t('projectViewer.libraryPreview.closeViewer')}
          </button>
        </div>
      </div>
      {previewLightbox && (
        <ImageLightbox 
          images={previewLightbox.images}
          startIndex={previewLightbox.index}
          onClose={() => setPreviewLightbox(null)}
        />
      )}
    </div>
  );
}

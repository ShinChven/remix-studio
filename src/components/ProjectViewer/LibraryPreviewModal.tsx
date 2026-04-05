import React, { useState } from 'react';
import { X, ChevronDown, Library as LibraryIcon } from 'lucide-react';
import { Library, LibraryItem } from '../../types';
import { ImageLightbox } from './ImageLightbox';

function TextLibraryItem({ item }: { item: LibraryItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={`bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 cursor-pointer transition-all hover:border-emerald-500/30 hover:bg-neutral-800/50 group/text-item ${isExpanded ? 'shadow-xl border-emerald-500/20 ring-1 ring-emerald-500/10' : 'shadow-sm'}`}
    >
      <div className="flex justify-between gap-4">
        <div className="flex-1 min-w-0">
          {item.title && (
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2.5 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              {item.title}
            </div>
          )}
          <p className={`text-neutral-300 text-sm leading-relaxed transition-all whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-1'}`}>
            {item.content}
          </p>
        </div>
        <div className={`p-1.5 rounded-lg bg-neutral-950/50 border border-neutral-800/50 group-hover/text-item:bg-neutral-800 transition-all self-start ${isExpanded ? 'rotate-180 bg-emerald-500/10 border-emerald-500/20' : ''}`}>
           <ChevronDown className={`w-4 h-4 transition-colors ${isExpanded ? 'text-emerald-500' : 'text-neutral-600 group-hover/text-item:text-neutral-400'}`} />
        </div>
      </div>
    </div>
  );
}

interface LibraryPreviewModalProps {
  library: Library | null;
  onClose: () => void;
}

export function LibraryPreviewModal({ library, onClose }: LibraryPreviewModalProps) {
  const [previewLightbox, setPreviewLightbox] = useState<{images: string[], index: number} | null>(null);
  
  if (!library) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-[80vh] bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/10 rounded-xl">
              <LibraryIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">{library.name}</h3>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">{library.items.length} workflow items</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-neutral-950/10">
          <div className={library.type === 'text' ? "max-w-4xl mx-auto space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
            {library.items.map(item => (
              library.type === 'text' ? (
                <TextLibraryItem key={item.id} item={item} />
              ) : (
                <div key={item.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                  {library.type === 'image' && (
                    <div className="aspect-video bg-black relative border-b border-neutral-800">
                      <img src={item.thumbnailUrl || item.content} alt={item.content} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                        const imageItems = library.items.filter(i => i.content).map(i => i.optimizedUrl || i.content);
                        const currentOptimized = item.optimizedUrl || item.content;
                        const idx = imageItems.indexOf(currentOptimized);
                        setPreviewLightbox({ images: imageItems, index: idx >= 0 ? idx : 0 });
                      }} />
                    </div>
                  )}
                  <div className="p-4 flex-1">
                    {item.title && (
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2">{item.title}</div>
                    )}
                    <p className="text-neutral-400 text-[11px] line-clamp-4 leading-relaxed">
                      <span className="opacity-60 italic whitespace-nowrap overflow-hidden text-ellipsis block">{item.content}</span>
                    </p>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/40 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-neutral-700"
          >
            Close Viewer
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

import React from 'react';
import { Type, Library as LibraryIcon, ImageIcon, Trash2, GripVertical, Maximize2, Loader2 } from 'lucide-react';
import { WorkflowItem as WorkflowItemType, Library } from '../../types';
import { imageDisplayUrl } from '../../api';

interface WorkflowItemProps {
  item: WorkflowItemType;
  index: number;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onRemove: (id: string) => void;
  onEdit: (item: WorkflowItemType) => void;
  onPreviewLibrary: (library: Library) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  uploadingItemIds: Set<string>;
  onLightbox: (images: string[], index: number) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onSelectFromLibrary: (id: string) => void;
  libraries: Library[];
}

export function WorkflowItem({
  item,
  index,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  onEdit,
  onPreviewLibrary,
  onImageUpload,
  uploadingItemIds,
  onLightbox,
  onUpdateTags,
  onSelectFromLibrary,
  libraries
}: WorkflowItemProps) {
  const isLibrary = item.type === 'library';
  const library = isLibrary ? libraries.find(l => l.id === item.value) : null;

  return (
    <div 
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`bg-neutral-900/50 border rounded-xl p-3 group transition-all ${
        draggedIndex === index ? 'opacity-50 border-blue-500' : 
        dragOverIndex === index ? 'border-blue-400 border-dashed bg-neutral-800' : 
        'border-neutral-800 hover:border-neutral-700 shadow-sm'
      }`}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <div className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
            {item.type === 'text' && <Type className="w-3 h-3 text-blue-500" />}
            {item.type === 'library' && <LibraryIcon className="w-3 h-3 text-emerald-500" />}
            {item.type === 'image' && <ImageIcon className="w-3 h-3 text-amber-500" />}
            {item.type}
          </span>
        </div>
        <button onClick={() => onRemove(item.id)} className="text-neutral-600 hover:text-red-400 opacity-100 transition-all p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {item.type === 'text' && (
        <div className="space-y-3">
          <div 
            onClick={() => onEdit(item)}
            className="group/text relative cursor-pointer"
          >
            <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 line-clamp-4 min-h-[96px] transition-all hover:border-blue-500/30 hover:bg-neutral-900/50">
              {item.value || <span className="opacity-30 italic">No text content...</span>}
              <div className="absolute top-2 right-2 p-1.5 bg-neutral-900/80 rounded-md border border-neutral-800 opacity-100 transition-all hover:text-blue-400">
                <Maximize2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
          <button 
            onClick={() => onSelectFromLibrary(item.id)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-neutral-800 rounded-lg bg-neutral-900/20 hover:bg-neutral-800/40 hover:border-blue-500/30 text-[9px] font-black text-neutral-500 hover:text-neutral-300 transition-all group uppercase tracking-[0.1em]"
          >
            <LibraryIcon className="w-3 h-3 text-neutral-600 group-hover:text-blue-500" />
            Pick from Library
          </button>
        </div>
      )}

      {item.type === 'library' && (
        <div 
          onClick={() => {
            if (library) onPreviewLibrary(library);
          }}
          className="group/library relative cursor-pointer"
        >
          <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs flex items-center justify-between transition-all hover:border-emerald-500/30 hover:bg-neutral-900/50">
            <div className="flex items-center gap-3">
              {(() => {
                const firstImage = library?.type === 'image' && library.items[0]?.content;
                return firstImage ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-800 flex-shrink-0">
                    <img src={firstImage} alt="Thumbnail" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-500/10 rounded-lg flex-shrink-0">
                    <LibraryIcon className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                );
              })()}
              <div className="min-w-0">
                <div className="text-neutral-200 font-bold truncate">
                  {library?.name || 'Unknown Library'}
                </div>
                <div className="text-[10px] text-neutral-500 font-medium mt-0.5 flex items-center gap-2">
                  {library?.items.length || 0} items
                  {(item.selectedTags || []).length > 0 && (
                    <span className="text-[9px] font-black text-blue-500/80 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest">
                      Filtered: {(item.selectedTags || []).length} tags
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="p-1.5 bg-neutral-900/80 rounded-md border border-neutral-800 opacity-100 transition-all hover:text-emerald-400">
              <Maximize2 className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      )}

      {item.type === 'image' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 block text-center py-2.5 border border-dashed border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-800/50 hover:border-amber-500/50 transition-all group relative overflow-hidden">
              {uploadingItemIds.has(item.id) ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-500/70">Wait</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-500" />
                  <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">Upload</span>
                  <input type="file" accept="image/*" onChange={(e) => onImageUpload(e, item.id)} className="hidden" disabled={uploadingItemIds.has(item.id)} />
                </div>
              )}
            </label>
            <button 
              onClick={() => onSelectFromLibrary(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-dashed border-neutral-800 rounded-lg hover:bg-neutral-800/50 hover:border-emerald-500/50 transition-all group"
            >
              <LibraryIcon className="w-4 h-4 text-neutral-500 group-hover:text-emerald-500" />
              <span className="text-[9px] font-black text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">Library</span>
            </button>
          </div>
          {item.value && !uploadingItemIds.has(item.id) && (
            <div className="relative aspect-video rounded-lg overflow-hidden border border-neutral-800 mt-2">
               <img 
                 src={imageDisplayUrl(item.thumbnailUrl || item.value)} 
                 alt="Reference" 
                 className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                 onClick={() => onLightbox([imageDisplayUrl(item.optimizedUrl || item.value)], 0)} 
               />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

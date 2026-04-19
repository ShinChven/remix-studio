import React from 'react';
import { useTranslation } from 'react-i18next';
import { Type, Library as LibraryIcon, ImageIcon, Trash2, GripVertical, Maximize2, Loader2, Video as VideoIcon, Volume2, Eye, EyeOff } from 'lucide-react';
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
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  uploadingItemIds: Set<string>;
  onLightbox: (images: string[], index: number) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onSelectFromLibrary: (id: string) => void;
  libraries: Library[];
  onToggleDisable?: (id: string) => void;
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
  onVideoUpload,
  onAudioUpload,
  uploadingItemIds,
  onLightbox,
  onUpdateTags,
  onSelectFromLibrary,
  libraries,
  onToggleDisable
}: WorkflowItemProps) {
  const { t } = useTranslation();
  const isLibrary = item.type === 'library';
  const library = isLibrary ? libraries.find(l => l.id === item.value) : null;

  return (
    <div 
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`bg-white/70 dark:bg-neutral-950/70 border rounded-xl p-4 group transition-all backdrop-blur-xl ${item.disabled ? 'opacity-40 grayscale-[0.5]' : ''} ${
        draggedIndex === index ? 'opacity-50 border-blue-500' : 
        dragOverIndex === index ? 'border-blue-400 border-dashed bg-white/40 dark:bg-neutral-800/40' : 
        'border-neutral-200/50 dark:border-white/5 hover:border-blue-500/50 shadow-sm hover:shadow-xl duration-300 hover:-translate-y-0.5'
      }`}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <div className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${item.disabled ? 'text-neutral-400 dark:text-neutral-600 line-through' : 'text-neutral-500 dark:text-neutral-500'}`}>
            {item.type === 'audio' && <Volume2 className="w-3 h-3 text-cyan-400" />}
            {item.type === 'text' ? t('projectViewer.common.text') :
             item.type === 'image' ? t('projectViewer.common.imageShort') :
             item.type === 'video' ? t('projectViewer.common.video') :
             item.type === 'audio' ? t('projectViewer.common.audio') :
             item.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleDisable && (
            <button onClick={() => onToggleDisable(item.id)} className={`transition-all p-1.5 rounded-lg border border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 ${item.disabled ? 'text-neutral-400 hover:text-neutral-600' : 'text-blue-500 hover:text-blue-600'}`}>
              {item.disabled ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => onRemove(item.id)} className="text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all p-1.5 rounded-lg border border-transparent hover:border-red-200">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {item.type === 'text' && (
        <div className="space-y-3">
          <div 
            onClick={() => onEdit(item)}
            className="group/text relative cursor-pointer"
          >
            <div className="w-full bg-white/40 dark:bg-black/40 border border-neutral-200/50 dark:border-white/5 rounded-xl p-4 pb-10 text-xs text-neutral-900 dark:text-neutral-300 line-clamp-4 min-h-[110px] transition-all hover:border-blue-500/30 hover:bg-white/60 dark:hover:bg-neutral-900/60 shadow-inner backdrop-blur-md">
              {item.value || <span className="opacity-30 italic font-medium">{t('projectViewer.workflow.noTextContent')}</span>}
              <div className="absolute bottom-3 left-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-500 shadow-sm">
                {t('projectViewer.workflow.characterCount', { count: item.value.length })}
              </div>
              <div className="absolute top-3 right-3 p-1.5 bg-white dark:bg-neutral-900 rounded-md border border-neutral-200 dark:border-neutral-800 shadow-sm opacity-100 transition-all text-neutral-400 hover:text-blue-500 hover:border-blue-200">
                <Maximize2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
          <button 
            onClick={() => onSelectFromLibrary(item.id)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-neutral-200/50 dark:border-white/5 rounded-xl bg-white/20 dark:bg-neutral-900/20 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 hover:border-blue-500/50 text-[10px] font-black text-neutral-500 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all group uppercase tracking-widest shadow-sm backdrop-blur-sm"
          >
            <LibraryIcon className="w-3.5 h-3.5 text-neutral-400 group-hover:text-blue-500" />
            {t('projectViewer.workflow.pickFromLibrary')}
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
          <div className="w-full bg-white/40 dark:bg-black/40 border border-neutral-200/50 dark:border-white/5 rounded-xl p-4 text-xs flex items-center justify-between transition-all hover:border-emerald-500/30 hover:bg-white/60 dark:hover:bg-neutral-900/60 shadow-inner backdrop-blur-md">
            <div className="flex items-center gap-3 min-w-0">
              {(() => {
                const firstImage = library?.type === 'image' && library.items[0]?.content;
                return firstImage ? (
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 flex-shrink-0 shadow-sm">
                    <img src={firstImage} alt="Thumbnail" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="p-2.5 bg-emerald-500/10 rounded-lg flex-shrink-0 border border-emerald-500/20">
                    <LibraryIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                  </div>
                );
              })()}
              <div className="min-w-0">
                <div className="text-neutral-900 dark:text-white font-black tracking-tight truncate">
                  {library?.name || t('projectViewer.workflow.unknownLibrary')}
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-500 font-bold mt-1 flex items-center gap-2">
                  {t('projectViewer.workflow.itemsCount', { count: library?.items.length || 0 })}
                  {(item.selectedTags || []).length > 0 && (
                    <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest shadow-sm">
                      {t('projectViewer.workflow.filteredTags', { count: (item.selectedTags || []).length })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="p-2 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm opacity-100 transition-all text-neutral-400 hover:text-emerald-500 hover:border-emerald-200">
              <Maximize2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {item.type === 'image' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 block text-center py-3 border border-dashed border-neutral-200/50 dark:border-white/5 rounded-xl cursor-pointer hover:bg-amber-50/40 dark:hover:bg-amber-500/10 hover:border-amber-500/50 transition-all group relative overflow-hidden bg-white/20 dark:bg-neutral-900/20 shadow-sm backdrop-blur-sm">
              {uploadingItemIds.has(item.id) ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 text-amber-600 dark:text-amber-500 animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-600/70">{t('projectViewer.workflow.wait')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <ImageIcon className="w-4 h-4 text-neutral-400 group-hover:text-amber-600" />
                  <span className="text-[10px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest group-hover:text-neutral-900 dark:group-hover:text-neutral-200">{t('projectViewer.common.upload')}</span>
                  <input type="file" accept="image/*" onChange={(e) => onImageUpload(e, item.id)} className="hidden" disabled={uploadingItemIds.has(item.id)} />
                </div>
              )}
            </label>
            <button 
              onClick={() => onSelectFromLibrary(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-dashed border-neutral-200/50 dark:border-white/5 rounded-xl hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all group bg-white/20 dark:bg-neutral-900/20 shadow-sm backdrop-blur-sm"
            >
              <LibraryIcon className="w-4 h-4 text-neutral-400 group-hover:text-emerald-600" />
              <span className="text-[10px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest group-hover:text-neutral-900 dark:group-hover:text-neutral-200">{t('projectViewer.common.library')}</span>
            </button>
          </div>
          {item.value && !uploadingItemIds.has(item.id) && (
            <div className="relative aspect-video rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 mt-2">
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

      {item.type === 'video' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 block text-center py-2.5 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:border-violet-500/50 transition-all group relative overflow-hidden">
              {uploadingItemIds.has(item.id) ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-violet-300/70">{t('projectViewer.workflow.wait')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <VideoIcon className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-500 group-hover:text-violet-400" />
                  <span className="text-[9px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">
                    {t('projectViewer.common.upload')} {t('projectViewer.common.video')}
                  </span>
                  <input type="file" accept="video/*" onChange={(e) => onVideoUpload(e, item.id)} className="hidden" disabled={uploadingItemIds.has(item.id)} />
                </div>
              )}
            </label>
            <button 
              onClick={() => onSelectFromLibrary(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:border-emerald-500/50 transition-all group"
            >
              <LibraryIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-500 group-hover:text-emerald-500" />
              <span className="text-[9px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">{t('projectViewer.common.library')}</span>
            </button>
          </div>
          {item.value && !uploadingItemIds.has(item.id) && (
            <div className="relative aspect-video rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 mt-2 bg-black">
              <video
                src={imageDisplayUrl(item.value)}
                poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined}
                controls
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      )}

      {item.type === 'audio' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 block text-center py-2.5 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:border-cyan-500/50 transition-all group relative overflow-hidden">
              {uploadingItemIds.has(item.id) ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-cyan-300/70">{t('projectViewer.workflow.wait')}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-500 group-hover:text-cyan-400" />
                  <span className="text-[9px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">
                    {t('projectViewer.common.upload')} {t('projectViewer.common.audio')}
                  </span>
                  <input type="file" accept="audio/*" onChange={(e) => onAudioUpload(e, item.id)} className="hidden" disabled={uploadingItemIds.has(item.id)} />
                </div>
              )}
            </label>
            <button 
              onClick={() => onSelectFromLibrary(item.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:border-emerald-500/50 transition-all group"
            >
              <LibraryIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-500 group-hover:text-emerald-500" />
              <span className="text-[9px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">{t('projectViewer.common.library')}</span>
            </button>
          </div>
          {item.value && !uploadingItemIds.has(item.id) && (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3 mt-2">
              <audio src={imageDisplayUrl(item.value)} controls className="w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

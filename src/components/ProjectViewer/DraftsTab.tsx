import React from 'react';
import { CheckSquare, Square, Trash2, Play, ChevronDown, Plus } from 'lucide-react';
import { Job, AlbumItem, ProjectType } from '../../types';
import { imageDisplayUrl } from '../../api';

interface DraftsTabProps {
  draftJobs: Job[];
  selectedDraftIds: Set<string>;
  toggleSelectAllDrafts: () => void;
  setShowDeleteSelectedModal: (show: boolean) => void;
  runSelectedDrafts: () => void;
  setShowDeleteAllDraftsModal: (show: boolean) => void;
  runAllDrafts: () => void;
  expandedJobId: string | null;
  toggleJobExpand: (id: string) => void;
  toggleDraftSelection: (id: string) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  runJob: (id: string) => void;
  setJobToDeleteId: (id: string) => void;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void } | null) => void;
  albumItems?: AlbumItem[];
  onSwitchToAlbum?: () => void;
  projectType?: ProjectType;
  projectName?: string;
}

export function DraftsTab({
  draftJobs,
  selectedDraftIds,
  toggleSelectAllDrafts,
  setShowDeleteSelectedModal,
  runSelectedDrafts,
  setShowDeleteAllDraftsModal,
  runAllDrafts,
  expandedJobId,
  toggleJobExpand,
  toggleDraftSelection,
  getProviderName,
  getModelName,
  runJob,
  setJobToDeleteId,
  setLightboxData,
  albumItems = [],
  onSwitchToAlbum,
  projectType = 'image',
  projectName = 'Untitled Project'
}: DraftsTabProps) {
  const displayAlbumItems = albumItems.slice(0, 5);

  const StackedGallery = () => (
    <div className="py-12 md:py-20 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-1000">
      <div className="relative w-64 h-64 md:w-80 md:h-80 mb-12 group cursor-pointer" onClick={onSwitchToAlbum}>
        {displayAlbumItems.map((item, idx) => {
          const rotations = [-6, 4, -2, 5, -3];
          const xOffsets = [-20, 15, -5, 25, -10];
          const yOffsets = [10, -5, 0, 15, -8];
          
          return (
            <div 
              key={item.id}
              className="absolute inset-0 transition-all duration-500 ease-out group-hover:scale-105"
              style={{
                transform: `rotate(${rotations[idx % rotations.length]}deg) translate(${xOffsets[idx % xOffsets.length]}px, ${yOffsets[idx % yOffsets.length]}px)`,
                zIndex: displayAlbumItems.length - idx
              }}
            >
              <div className="w-full h-full p-2 bg-white rounded-sm shadow-2xl border border-neutral-200 overflow-hidden">
                <img 
                  src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)} 
                  alt={item.prompt}
                  className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700"
                />
              </div>
            </div>
          );
        })}
        
        {displayAlbumItems.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-neutral-800 rounded-3xl opacity-20">
             <Plus className="w-12 h-12 text-neutral-500" />
          </div>
        )}
      </div>

      <div className="w-full max-w-xl mx-auto px-4 sm:px-6 text-center space-y-4 flex flex-col items-center">
        <h3 className="text-lg font-black text-white uppercase tracking-widest bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          {displayAlbumItems.length > 0 ? projectName : "Empty Canvas"}
        </h3>
        <p className="max-w-md text-[11px] font-medium text-neutral-500 uppercase tracking-[0.2em] leading-relaxed">
          {displayAlbumItems.length > 0 
            ? "You have beautiful creations ready. Start a new draft or explore your gallery."
            : "Build your project workflow on the left to start generating images."}
        </p>
        
        <div className="flex items-center justify-center gap-3 pt-4">
          {displayAlbumItems.length > 0 && (
            <button 
              onClick={onSwitchToAlbum}
              className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-neutral-800 transition-all active:scale-95 flex items-center gap-2"
            >
              Open Album
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4">
        {draftJobs.length > 0 && (
          <div className="sticky top-0 z-20 flex items-center justify-between bg-neutral-950/80 backdrop-blur-md border border-neutral-800 px-4 py-3 rounded-xl flex-wrap gap-2 shadow-lg shadow-black/20">
            <div className="flex items-center gap-3">
              <button 
                onClick={toggleSelectAllDrafts}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-neutral-800 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                {selectedDraftIds.size === draftJobs.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select All
              </button>
              
              {selectedDraftIds.size > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    {selectedDraftIds.size} Selected
                  </span>
                  <button 
                    onClick={() => setShowDeleteSelectedModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" /> Delete Selected
                  </button>
                  <button 
                    onClick={runSelectedDrafts}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all"
                  >
                    <Play className="w-3 h-3 fill-current" /> Start Selected
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowDeleteAllDraftsModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-neutral-500 hover:text-red-400 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                title="Delete All Drafts"
              >
                <Trash2 className="w-3 h-3" /> Delete All
              </button>
              <button 
                onClick={runAllDrafts}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Start All Now
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
            {draftJobs.map(task => {
              const isExpanded = expandedJobId === task.id;
              const isSelected = selectedDraftIds.has(task.id);
              return (
                <div key={task.id} className="flex flex-col gap-0 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className={`bg-neutral-950/50 p-4 rounded-xl border flex justify-between items-center transition-all cursor-pointer group/task ${isSelected ? 'border-blue-500/30 bg-blue-500/5' : isExpanded ? 'border-blue-500/50 bg-neutral-900/50 rounded-b-none' : 'border-neutral-800 hover:border-neutral-700'}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                         <button 
                           onClick={(e) => { e.stopPropagation(); toggleDraftSelection(task.id); }}
                           className={`flex-shrink-0 p-1 rounded-lg transition-colors ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-neutral-800 text-neutral-500 hover:text-white'}`}
                         >
                           {isSelected ? (
                             <CheckSquare className="w-4 h-4" />
                           ) : (
                             <Square className="w-4 h-4" />
                           )}
                         </button>
                         <div 
                           className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                           onClick={() => toggleJobExpand(task.id)}
                         >
                           <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />
                         </div>
                         <span 
                           className={`text-xs font-medium truncate pr-6 ${isExpanded ? 'text-white' : 'text-neutral-400'}`} 
                           title={task.prompt}
                           onClick={() => toggleJobExpand(task.id)}
                         >
                           {task.prompt}
                         </span>
                      </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-neutral-950 rounded-lg border border-neutral-800/50">
                        <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest leading-none">
                          {getProviderName(task.providerId)}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-neutral-800" />
                        <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest leading-none">
                          {getModelName(task.providerId, task.modelConfigId)}
                        </span>
                      </div>
                      {task.aspectRatio && (
                        <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                          {task.aspectRatio}
                        </span>
                      )}
                      {task.quality && (
                        <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                          {task.quality}
                        </span>
                      )}
                      {task.format && (
                        <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                          {task.format}
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-amber-500/70 uppercase tracking-widest px-2.5 py-1.5 bg-amber-500/5 rounded-lg border border-amber-500/20">Draft</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); runJob(task.id); }}
                          className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-500/20"
                          title="Run Job"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setJobToDeleteId(task.id); }}
                          className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete Job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="bg-neutral-900/30 border-x border-b border-blue-500/30 rounded-b-xl p-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">Full Prompt</label>
                          <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-3 rounded-lg border border-neutral-800 select-all whitespace-pre-wrap">
                            {task.prompt}
                          </div>
                       </div>
                       {task.imageContexts && task.imageContexts.length > 0 && (
                         <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">Visual Contexts</label>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                              {task.imageContexts.map((ctx, idx) => (
                                <div key={idx} className="group/ctx relative aspect-square rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-sm transition-all hover:scale-110 hover:shadow-xl hover:z-10 hover:border-blue-500/50">
                                  <img 
                                    src={imageDisplayUrl(ctx)}
                                    alt={`Context ${idx + 1}`} 
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                                    loading="lazy"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setLightboxData({ images: (task.imageContexts || []).map(imageDisplayUrl), index: idx });
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/ctx:opacity-100 transition-opacity flex items-end p-1.5 pointer-events-none">
                                    <span className="text-[8px] font-black text-white/70 uppercase tracking-widest truncate">C_{idx + 1}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                         </div>
                       )}
                    </div>
                  )}
                </div>
              );
            })}
            {draftJobs.length === 0 && <StackedGallery />}
        </div>
      </div>
    </section>
  );
}

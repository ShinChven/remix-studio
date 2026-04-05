import React from 'react';
import { CheckSquare, Square, Trash2, Play, ChevronDown, Plus } from 'lucide-react';
import { Job } from '../../types';
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
  setLightboxData: (data: { images: string[], index: number } | null) => void;
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
  setLightboxData
}: DraftsTabProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4">
        {draftJobs.length > 0 && (
          <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-3 rounded-xl">
            <div className="flex items-center gap-3">
              <button 
                onClick={toggleSelectAllDrafts}
                className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
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
        <div className="bg-neutral-900/30 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-inner">
          <div className="p-4 space-y-3">
            {draftJobs.map(task => {
              const isExpanded = expandedJobId === task.id;
              return (
                <div key={task.id} className="flex flex-col gap-0 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className={`bg-neutral-950/50 p-4 rounded-xl border flex justify-between items-center transition-all cursor-pointer group/task ${isExpanded ? 'border-blue-500/50 bg-neutral-900/50 rounded-b-none' : 'border-neutral-800 hover:border-neutral-700'}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                         <button 
                           onClick={(e) => { e.stopPropagation(); toggleDraftSelection(task.id); }}
                           className="p-1 hover:bg-neutral-800 rounded transition-colors"
                         >
                           {selectedDraftIds.has(task.id) ? (
                             <CheckSquare className="w-4 h-4 text-blue-500" />
                           ) : (
                             <Square className="w-4 h-4 text-neutral-600" />
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
            {draftJobs.length === 0 && (
              <div className="py-24 text-center text-neutral-600">
                <Plus className="w-12 h-12 mx-auto opacity-10 mb-4" />
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Add items to start a draft</div>
                <div className="text-[9px] opacity-40 mt-2">Use the left configuration panel</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

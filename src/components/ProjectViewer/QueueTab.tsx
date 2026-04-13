import React from 'react';
import { CheckSquare, Square, Trash2, Play, ChevronDown, Loader2, List } from 'lucide-react';
import { Job } from '../../types';
import { imageDisplayUrl } from '../../api';

interface QueueTabProps {
  queueJobs: Job[];
  selectedQueueIds: Set<string>;
  toggleSelectAllQueue: () => void;
  toggleQueueSelection: (id: string) => void;
  retrySelectedQueue: () => void;
  deleteSelectedQueue: () => void;
  clearAllFailed: () => void;
  expandedJobId: string | null;
  toggleJobExpand: (id: string) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  runJob: (id: string) => void;
  setJobToDeleteId: (id: string) => void;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void } | null) => void;
}

export function QueueTab({
  queueJobs,
  selectedQueueIds,
  toggleSelectAllQueue,
  toggleQueueSelection,
  retrySelectedQueue,
  deleteSelectedQueue,
  clearAllFailed,
  expandedJobId,
  toggleJobExpand,
  getProviderName,
  getModelName,
  runJob,
  setJobToDeleteId,
  setLightboxData
}: QueueTabProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-8">
        {/* Queue Toolbar */}
        {queueJobs.length > 0 && (
          <div className="sticky top-0 z-20 flex items-center justify-between bg-neutral-950/80 backdrop-blur-md border border-neutral-800 px-4 py-3 rounded-xl flex-wrap gap-2 shadow-lg shadow-black/20">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAllQueue}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-neutral-800 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                {selectedQueueIds.size === queueJobs.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select All
              </button>

              {selectedQueueIds.size > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    {selectedQueueIds.size} Selected
                  </span>
                  {queueJobs.some(j => selectedQueueIds.has(j.id) && j.status === 'failed') && (
                    <button
                      onClick={retrySelectedQueue}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all"
                    >
                      <Play className="w-3 h-3 fill-current" /> Retry
                    </button>
                  )}
                  <button
                    onClick={deleteSelectedQueue}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>

            {queueJobs.some(j => j.status === 'failed') && (
              <button
                onClick={clearAllFailed}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
              >
                <Trash2 className="w-3 h-3" /> Clear All Failed
              </button>
            )}
          </div>
        )}

        {/* Active Jobs */}
        <div className="space-y-3">
            {queueJobs.map(task => {
              const isExpanded = expandedJobId === task.id;
              const isSelected = selectedQueueIds.has(task.id);
              return (
                <div key={task.id} className="flex flex-col gap-0 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div
                    onClick={() => toggleJobExpand(task.id)}
                    className={`bg-neutral-950/50 p-4 rounded-xl border flex justify-between items-center transition-all cursor-pointer group/task ${isSelected ? 'border-blue-500/30 bg-blue-500/5' : isExpanded ? 'border-blue-500/50 bg-neutral-900/50 rounded-b-none' : 'border-neutral-800 hover:border-neutral-700'} ${task.status === 'failed' && !isSelected ? 'border-red-900/30 bg-red-950/5' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleQueueSelection(task.id); }}
                          className={`flex-shrink-0 p-1 rounded-lg transition-colors ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-neutral-800 text-neutral-500 hover:text-white'}`}
                        >
                         {isSelected ? (
                           <CheckSquare className="w-4 h-4" />
                         ) : (
                           <Square className="w-4 h-4" />
                         )}
                       </button>
                       <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                         <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />
                       </div>
                       <span className={`text-xs font-medium truncate pr-6 ${isExpanded ? 'text-white' : 'text-neutral-400'}`} title={task.prompt}>
                         {task.prompt}
                       </span>
                    </div>
                      <div className="flex-shrink-0 ml-4 flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-neutral-950/50 rounded-lg border border-neutral-800/50">
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
                        {task.status === 'processing' && (
                          <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-widest bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Running
                          </div>
                        )}
                        {task.status === 'pending' && <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800 shadow-sm">Queued</span>}
                        {task.status === 'failed' && <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest px-3 py-1.5 bg-red-500/10 rounded-lg border border-red-500/20">Failed</span>}
                      
                      <div className="flex items-center gap-1">
                        {task.status === 'failed' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); runJob(task.id); }}
                            className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="Retry Job"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
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
                    <div className={`bg-neutral-900/30 border-x border-b rounded-b-xl p-4 space-y-4 animate-in slide-in-from-top-1 duration-200 ${task.status === 'failed' ? 'border-red-500/30' : 'border-blue-500/30'}`}>
                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">Full Prompt</label>
                          <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-3 rounded-lg border border-neutral-800 select-all whitespace-pre-wrap font-mono">
                            {task.prompt}
                          </div>
                       </div>
                       {task.imageContexts && task.imageContexts.length > 0 && (
                         <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-neutral-600 px-1">Visual Contexts</label>
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
                       {task.status === 'failed' && (
                          <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500/70">Error Details</label>
                             <div className="text-[10px] font-mono text-red-400 bg-red-950/20 p-3 rounded-lg border border-red-500/20 break-all leading-tight">
                               {task.error || 'Unknown error occurred'}
                             </div>
                          </div>
                       )}
                    </div>
                  )}
                </div>
              );
            })}
            {queueJobs.length === 0 && (
              <div className="py-24 text-center text-neutral-600">
                <List className="w-12 h-12 mx-auto opacity-10 mb-4" />
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Queue is clear</div>
                <div className="text-[9px] opacity-40 mt-2">Active jobs will appear here</div>
              </div>
            )}
        </div>
      </div>
    </section>
  );
}

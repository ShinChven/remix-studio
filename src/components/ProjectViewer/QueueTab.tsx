import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Play, Loader2, List, BrushCleaning } from 'lucide-react';
import { Job } from '../../types';
import { imageDisplayUrl } from '../../api';
import { SelectionToolbar } from './SelectionToolbar';
import { JobListItem } from './JobListItem';
import { InfoChip } from './InfoChip';
import { EmptyState } from './EmptyState';

interface QueueTabProps {
  queueJobs: Job[];
  selectedQueueIds: Set<string>;
  toggleSelectAllQueue: () => void;
  toggleQueueSelection: (id: string, isShiftPressed: boolean, scopeIds: string[]) => void;
  retrySelectedQueue: () => void;
  deleteSelectedQueue: () => void;
  clearAllFailed: () => void;
  expandedJobId: string | null;
  toggleJobExpand: (id: string) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  runJob: (id: string) => void;
  setJobToDeleteId: (id: string) => void;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void, onIndexChange?: (index: number) => void } | null) => void;
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
  setLightboxData,
}: QueueTabProps) {
  const { t } = useTranslation();
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-0">
        {/* Queue Toolbar */}
        {queueJobs.length > 0 && (
          <SelectionToolbar
            totalCount={queueJobs.length}
            selectedCount={selectedQueueIds.size}
            onToggleSelectAll={toggleSelectAllQueue}
            mobileSingleLine
            mobileActionsRight
            rightActions={
              <>
                {selectedQueueIds.size > 0 && (
                  <button
                    onClick={deleteSelectedQueue}
                    title={t('projectViewer.common.delete')}
                    aria-label={t('projectViewer.common.delete')}
                    className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="hidden sm:inline">{t('projectViewer.common.delete')}</span>
                  </button>
                )}
                {queueJobs.some(j => selectedQueueIds.has(j.id) && j.status === 'failed') && (
                  <button
                    onClick={retrySelectedQueue}
                    title={t('projectViewer.queue.retry')}
                    aria-label={t('projectViewer.queue.retry')}
                    className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span className="hidden sm:inline">{t('projectViewer.queue.retry')}</span>
                  </button>
                )}
                {queueJobs.some(j => j.status === 'failed') && (
                  <button
                    onClick={clearAllFailed}
                    title={t('projectViewer.queue.clearAllFailed')}
                    aria-label={t('projectViewer.queue.clearAllFailed')}
                    className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <BrushCleaning className="w-3 h-3" />
                    <span>{t('projectViewer.queue.clearAllFailed')}</span>
                  </button>
                )}
              </>
            }
          />
        )}

        {/* Active Jobs */}
        <div className="space-y-0">
            {(() => {
              const scopeIds = queueJobs.map(j => j.id);
              return queueJobs.map(task => {
              const isExpanded = expandedJobId === task.id;
              const isSelected = selectedQueueIds.has(task.id);
              return (
                <JobListItem
                  key={task.id}
                  job={task}
                  isExpanded={isExpanded}
                  isSelected={isSelected}
                  accentColor="blue"
                  borderClassName={task.status === 'failed' ? 'border-red-900/30 bg-red-950/5' : ''}
                  providerName={getProviderName(task.providerId)}
                  modelName={getModelName(task.providerId, task.modelConfigId)}
                  onToggleExpand={toggleJobExpand}
                  onToggleSelect={(id, isShiftPressed) => toggleQueueSelection(id, isShiftPressed, scopeIds)}
                  metaChips={
                    <>
                      {task.aspectRatio && (
                        <InfoChip className="text-neutral-500 dark:text-neutral-500">
                          {task.aspectRatio}
                        </InfoChip>
                      )}
                      {task.quality && (
                        <InfoChip className="text-neutral-500 dark:text-neutral-500">
                          {task.quality}
                        </InfoChip>
                      )}
                      {task.format && (
                        <InfoChip className="text-neutral-500 dark:text-neutral-500">
                          {task.format}
                        </InfoChip>
                      )}
                      {(task.videoContexts?.length || 0) > 0 && (
                        <InfoChip className="text-violet-300">
                          {task.videoContexts?.length} vid
                        </InfoChip>
                      )}
                      {(task.audioContexts?.length || 0) > 0 && (
                        <InfoChip className="text-cyan-300">
                          {task.audioContexts?.length} aud
                        </InfoChip>
                      )}
                    </>
                  }
                  statusBadge={
                    <>
                      {task.status === 'processing' && (
                        <InfoChip className="gap-1 text-blue-400 bg-blue-500/5 border-blue-500/10">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          {t('projectViewer.queue.running')}
                        </InfoChip>
                      )}
                      {task.status === 'pending' && <InfoChip className="text-neutral-500 dark:text-neutral-500 shadow-sm">{t('projectViewer.queue.queued')}</InfoChip>}
                      {task.status === 'failed' && <InfoChip className="text-red-500 bg-red-500/10 border-red-500/20">{t('projectViewer.queue.failed')}</InfoChip>}
                    </>
                  }
                  actionButtons={
                    <>
                      {task.status === 'failed' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); runJob(task.id); }}
                          className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                          title={t('projectViewer.queue.retryJob')}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setJobToDeleteId(task.id); }}
                        className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title={t('projectViewer.common.deleteJob')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  }
                  expandedContent={
                    <>
                      <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">{t('projectViewer.common.fullPrompt')}</label>
                          <div className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50/50 dark:bg-neutral-950/50 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 select-all whitespace-pre-wrap font-mono">
                            {task.prompt}
                          </div>
                      </div>
                      {task.imageContexts && task.imageContexts.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-neutral-600 px-1">{t('projectViewer.queue.visualContexts')}</label>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                              {task.imageContexts.map((ctx, idx) => (
                                <div key={idx} className="group/ctx relative aspect-square rounded-xl overflow-hidden bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all hover:scale-110 hover:shadow-xl hover:z-10 hover:border-blue-500/50">
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
                                    <span className="text-[8px] font-black text-white/70 uppercase tracking-widest truncate">{t('projectViewer.queue.contextShort', { index: idx + 1 })}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                        </div>
                      )}
                      {task.videoContexts && task.videoContexts.length > 0 && (
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-[0.1em] text-violet-300/70 px-1">Reference Videos</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {task.videoContexts.map((ctx, idx) => (
                              <video key={idx} src={imageDisplayUrl(ctx)} controls className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-black" />
                            ))}
                          </div>
                        </div>
                      )}
                      {task.audioContexts && task.audioContexts.length > 0 && (
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-[0.1em] text-cyan-300/70 px-1">Reference Audio</label>
                          <div className="space-y-2">
                            {task.audioContexts.map((ctx, idx) => (
                              <audio key={idx} src={imageDisplayUrl(ctx)} controls className="w-full" />
                            ))}
                          </div>
                        </div>
                      )}
                      {task.status === 'failed' && (
                        <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500/70">{t('projectViewer.queue.errorDetails')}</label>
                             <div className="text-[10px] font-mono text-red-400 bg-red-950/20 p-3 rounded-lg border border-red-500/20 break-all leading-tight">
                               {task.error || t('projectViewer.queue.unknownError')}
                             </div>
                        </div>
                      )}
                    </>
                  }
                />
              );
            });
            })()}
            {queueJobs.length === 0 && (
              <EmptyState
                Icon={List}
                title={t('projectViewer.queue.emptyTitle')}
                description={t('projectViewer.queue.emptyDescription')}
                animateIcon={false}
              />
            )}
        </div>
      </div>
    </section>
  );
}

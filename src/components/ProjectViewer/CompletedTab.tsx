import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Trash2, List, ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-react';
import { Job, ProjectType } from '../../types';
import { imageDisplayUrl } from '../../api';
import { SelectionToolbar } from './SelectionToolbar';
import { JobListItem } from './JobListItem';
import { InfoChip } from './InfoChip';
import { EmptyState } from './EmptyState';
import { PaginationBar } from './PaginationBar';

interface CompletedTabProps {
  completedJobs: Job[];
  expandedJobId: string | null;
  toggleJobExpand: (id: string) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  setJobToDeleteId: (id: string) => void;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void, onIndexChange?: (index: number) => void } | null) => void;
  selectedCompletedIds: Set<string>;
  toggleCompletedSelection: (id: string, isShiftPressed: boolean, scopeIds: string[]) => void;
  toggleSelectAllCompleted: () => void;
  setShowDeleteSelectedModal: (show: boolean) => void;
  projectType?: ProjectType;
  onReuse?: (job: Job) => void;
  page: number;
  pageSize: number | 'all';
  total: number;
  pages: number;
  sort: 'newest' | 'oldest';
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number | 'all') => void;
  onSortChange: (sort: 'newest' | 'oldest') => void;
}

export function CompletedTab({
  completedJobs,
  expandedJobId,
  toggleJobExpand,
  getProviderName,
  getModelName,
  setJobToDeleteId,
  setLightboxData,
  selectedCompletedIds,
  toggleCompletedSelection,
  toggleSelectAllCompleted,
  setShowDeleteSelectedModal,
  projectType = 'image',
  onReuse,
  page,
  pageSize,
  total,
  pages,
  sort,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: CompletedTabProps) {
  const { t } = useTranslation();
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-0">
        {/* Completed Jobs Header/Toolbar */}
        {total > 0 && (
          <SelectionToolbar
            totalCount={completedJobs.length}
            selectedCount={selectedCompletedIds.size}
            accentColor="emerald"
            onToggleSelectAll={toggleSelectAllCompleted}
            mobileSingleLine
            mobileActionsRight
            rightActions={
              <>
                {selectedCompletedIds.size > 0 && (
                  <button
                    onClick={() => setShowDeleteSelectedModal(true)}
                    title={t('projectViewer.common.deleteSelected')}
                    aria-label={t('projectViewer.common.deleteSelected')}
                    className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="hidden sm:inline">{t('projectViewer.common.deleteSelected')}</span>
                  </button>
                )}
                <button
                  onClick={() => onSortChange(sort === 'newest' ? 'oldest' : 'newest')}
                  title={sort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
                  aria-label={sort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 text-[9px] font-black uppercase tracking-widest rounded-lg border border-neutral-700 transition-all"
                >
                  {sort === 'newest' ? <ArrowDownWideNarrow className="w-3 h-3" /> : <ArrowUpWideNarrow className="w-3 h-3" />}
                  <span className="hidden sm:inline">
                    {sort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
                  </span>
                </button>
              </>
            }
          />
        )}

        {/* Jobs List */}
        <div className="space-y-0">
          {(() => {
            const scopeIds = completedJobs.map(j => j.id);
            return completedJobs.map(job => {
            const isExpanded = expandedJobId === job.id;
            const isSelected = selectedCompletedIds.has(job.id);

            return (
              <JobListItem
                key={job.id}
                job={job}
                isExpanded={isExpanded}
                isSelected={isSelected}
                accentColor="emerald"
                providerName={getProviderName(job.providerId)}
                modelName={getModelName(job.providerId, job.modelConfigId)}
                onToggleExpand={toggleJobExpand}
                onToggleSelect={(id, isShiftPressed) => toggleCompletedSelection(id, isShiftPressed, scopeIds)}
                onReuse={onReuse}
                statusBadge={
                  <InfoChip className="text-emerald-500 bg-emerald-500/5 border-emerald-500/20">
                    {t('projectViewer.completed.completed')}
                  </InfoChip>
                }
                actionButtons={
                  <button
                    onClick={(e) => { e.stopPropagation(); setJobToDeleteId(job.id); }}
                    className="p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title={t('projectViewer.completed.deleteJobRecord')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                }
                expandedContent={
                  <div className="flex flex-col gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.common.fullPrompt')}</label>
                        <div className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50/50 dark:bg-neutral-950/50 p-4 rounded-xl border border-neutral-200/50 dark:border-neutral-800/50 select-all whitespace-pre-wrap font-mono">
                          {job.prompt}
                        </div>
                      </div>

                      {(projectType === 'text' || projectType === 'audio') && job.resultText && (
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.common.generatedText')}</label>
                          <div className="text-xs text-neutral-200 leading-relaxed bg-neutral-50/50 dark:bg-neutral-950/50 p-4 rounded-xl border border-emerald-500/20 select-all whitespace-pre-wrap">
                            {job.resultText}
                          </div>
                        </div>
                      )}

                      {job.imageContexts && job.imageContexts.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase tracking-[0.1em] text-neutral-600 px-1">{t('projectViewer.queue.visualContexts')}</label>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                              {job.imageContexts.map((ctx, idx) => (
                                <div key={idx} className="group/ctx relative aspect-square rounded-xl overflow-hidden bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all hover:scale-110 hover:shadow-xl hover:z-10 hover:border-emerald-500/50">
                                  <img 
                                    src={imageDisplayUrl(ctx)}
                                    alt={`Context ${idx + 1}`} 
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                                    loading="lazy"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setLightboxData({ images: (job.imageContexts || []).map(imageDisplayUrl), index: idx });
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
                      {job.videoContexts && job.videoContexts.length > 0 && (
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-[0.1em] text-violet-300/70 px-1">Reference Videos</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {job.videoContexts.map((ctx, idx) => (
                              <video key={idx} src={imageDisplayUrl(ctx)} controls className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-black" />
                            ))}
                          </div>
                        </div>
                      )}
                      {job.audioContexts && job.audioContexts.length > 0 && (
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-[0.1em] text-cyan-300/70 px-1">Reference Audio</label>
                          <div className="space-y-2">
                            {job.audioContexts.map((ctx, idx) => (
                              <audio key={idx} src={imageDisplayUrl(ctx)} controls className="w-full" />
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">{t('projectViewer.completed.metadata')}</span>
                          <div className="flex flex-wrap gap-2">
                            {job.aspectRatio && (
                              <span className="text-[8px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">{job.aspectRatio}</span>
                            )}
                            {job.quality && (
                              <span className="text-[8px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">{job.quality}</span>
                            )}
                            {job.format && (
                              <span className="text-[8px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">{job.format}</span>
                            )}
                            {job.size && (
                              <span className="text-[8px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">{(job.size / 1024).toFixed(1)} KB</span>
                            )}
                            {(job.updatedAt || job.createdAt) && (
                              <span className="text-[8px] font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">{new Date(job.updatedAt || job.createdAt || 0).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                  </div>
                }
              />
            );
          });
          })()}

          {total === 0 && (
            <EmptyState
              Icon={CheckCircle2}
              title={t('projectViewer.completed.emptyTitle')}
              description={t('projectViewer.completed.emptyDescription')}
              animateIcon={false}
            />
          )}
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            pages={pages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        )}
      </div>
    </section>
  );
}

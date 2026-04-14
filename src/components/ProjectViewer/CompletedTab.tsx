import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Trash2, List } from 'lucide-react';
import { Job, ProjectType } from '../../types';
import { SelectionToolbar } from './SelectionToolbar';
import { JobListItem } from './JobListItem';
import { InfoChip } from './InfoChip';

interface CompletedTabProps {
  completedJobs: Job[];
  expandedJobId: string | null;
  toggleJobExpand: (id: string) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  setJobToDeleteId: (id: string) => void;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void } | null) => void;
  selectedCompletedIds: Set<string>;
  toggleCompletedSelection: (id: string) => void;
  toggleSelectAllCompleted: () => void;
  setShowDeleteSelectedModal: (show: boolean) => void;
  projectType?: ProjectType;
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
}: CompletedTabProps) {
  const { t } = useTranslation();
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-0">
        {/* Completed Jobs Header/Toolbar */}
        {completedJobs.length > 0 && (
          <SelectionToolbar
            totalCount={completedJobs.length}
            selectedCount={selectedCompletedIds.size}
            accentColor="emerald"
            onToggleSelectAll={toggleSelectAllCompleted}
            mobileSingleLine
            mobileActionsRight
            rightActions={
              selectedCompletedIds.size > 0 ? (
                <button
                  onClick={() => setShowDeleteSelectedModal(true)}
                  title={t('projectViewer.common.deleteSelected')}
                  aria-label={t('projectViewer.common.deleteSelected')}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">{t('projectViewer.common.deleteSelected')}</span>
                </button>
              ) : undefined
            }
          />
        )}

        {/* Jobs List */}
        <div className="space-y-0">
          {completedJobs.map(job => {
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
                onToggleSelect={toggleCompletedSelection}
                statusBadge={
                  <InfoChip className="text-emerald-500 bg-emerald-500/5 border-emerald-500/20">
                    {t('projectViewer.completed.completed')}
                  </InfoChip>
                }
                actionButtons={
                  <button
                    onClick={(e) => { e.stopPropagation(); setJobToDeleteId(job.id); }}
                    className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title={t('projectViewer.completed.deleteJobRecord')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                }
                expandedContent={
                  <div className="flex flex-col gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.common.fullPrompt')}</label>
                        <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50 select-all whitespace-pre-wrap font-mono">
                          {job.prompt}
                        </div>
                      </div>

                      {projectType === 'text' && job.resultText && (
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.common.generatedText')}</label>
                          <div className="text-xs text-neutral-200 leading-relaxed bg-neutral-950/50 p-4 rounded-xl border border-emerald-500/20 select-all whitespace-pre-wrap">
                            {job.resultText}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">{t('projectViewer.completed.metadata')}</span>
                          <div className="flex flex-wrap gap-2">
                            {job.aspectRatio && (
                              <span className="text-[8px] font-bold text-neutral-400 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 uppercase tracking-widest">{job.aspectRatio}</span>
                            )}
                            {job.quality && (
                              <span className="text-[8px] font-bold text-neutral-400 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 uppercase tracking-widest">{job.quality}</span>
                            )}
                            {job.format && (
                              <span className="text-[8px] font-bold text-neutral-400 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 uppercase tracking-widest">{job.format}</span>
                            )}
                            {job.size && (
                              <span className="text-[8px] font-bold text-neutral-400 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 uppercase tracking-widest">{(job.size / 1024).toFixed(1)} KB</span>
                            )}
                          </div>
                        </div>
                      </div>
                  </div>
                }
              />
            );
          })}

          {completedJobs.length === 0 && (
            <div className="py-24 text-center text-neutral-600 bg-neutral-900/10 border-2 border-dashed border-neutral-900 rounded-3xl flex flex-col items-center gap-4">
              <CheckCircle2 className="w-12 h-12 opacity-10" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]">{t('projectViewer.completed.emptyTitle')}</div>
                <div className="text-[9px] opacity-40 mt-2">{t('projectViewer.completed.emptyDescription')}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

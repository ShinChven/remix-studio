import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Play, Plus } from 'lucide-react';
import { Job, AlbumItem, ProjectType } from '../../types';
import { imageDisplayUrl } from '../../api';
import { SelectionToolbar } from './SelectionToolbar';
import { JobListItem } from './JobListItem';
import { InfoChip } from './InfoChip';

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
  projectName = 'Untitled Project',
}: DraftsTabProps) {
  const { t } = useTranslation();
  const displayAlbumItems = albumItems.slice(0, 5);

  const StackedGallery = () => (
    <div className="py-12 md:py-20 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-1000">
      {projectType !== 'text' && (
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
      )}

      <div className="w-full max-w-xl mx-auto px-4 sm:px-6 text-center space-y-4 flex flex-col items-center">
        <h3 className="text-lg font-black text-white uppercase tracking-widest bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          {displayAlbumItems.length > 0 ? projectName : t('projectViewer.drafts.emptyCanvas')}
        </h3>
        <p className="max-w-md text-[11px] font-medium text-neutral-500 uppercase tracking-[0.2em] leading-relaxed">
          {displayAlbumItems.length > 0 
            ? t('projectViewer.drafts.galleryReady')
            : t('projectViewer.drafts.buildWorkflowHint')}
        </p>
        
        <div className="flex items-center justify-center gap-3 pt-4">
          {displayAlbumItems.length > 0 && (
            <button 
              onClick={onSwitchToAlbum}
              className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-neutral-800 transition-all active:scale-95 flex items-center gap-2"
            >
              {t('projectViewer.drafts.openAlbum')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-0">
        {draftJobs.length > 0 && (
          <SelectionToolbar
            totalCount={draftJobs.length}
            selectedCount={selectedDraftIds.size}
            onToggleSelectAll={toggleSelectAllDrafts}
            mobileSingleLine
            mobileActionsRight
            rightActions={
              <>
                <button
                  onClick={selectedDraftIds.size > 0 ? () => setShowDeleteSelectedModal(true) : () => setShowDeleteAllDraftsModal(true)}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  title={selectedDraftIds.size > 0 ? t('projectViewer.common.deleteSelected') : t('projectViewer.drafts.deleteAllDrafts')}
                  aria-label={selectedDraftIds.size > 0 ? t('projectViewer.common.deleteSelected') : t('projectViewer.drafts.deleteAllDrafts')}
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">
                    {selectedDraftIds.size > 0 ? t('projectViewer.common.deleteSelected') : t('projectViewer.common.deleteAll')}
                  </span>
                </button>
                <button
                  onClick={selectedDraftIds.size > 0 ? runSelectedDrafts : runAllDrafts}
                  title={selectedDraftIds.size > 0 ? t('projectViewer.drafts.startSelected') : t('projectViewer.drafts.startAllNow')}
                  aria-label={selectedDraftIds.size > 0 ? t('projectViewer.drafts.startSelected') : t('projectViewer.drafts.startAllNow')}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span className="hidden sm:inline">
                    {selectedDraftIds.size > 0 ? t('projectViewer.drafts.startSelected') : t('projectViewer.drafts.startAllNow')}
                  </span>
                </button>
              </>
            }
          />
        )}
        <div className="space-y-0">
            {draftJobs.map(task => {
              const isExpanded = expandedJobId === task.id;
              const isSelected = selectedDraftIds.has(task.id);
              return (
                <JobListItem
                  key={task.id}
                  job={task}
                  isExpanded={isExpanded}
                  isSelected={isSelected}
                  accentColor="blue"
                  providerName={getProviderName(task.providerId)}
                  modelName={getModelName(task.providerId, task.modelConfigId)}
                  onToggleExpand={toggleJobExpand}
                  onToggleSelect={toggleDraftSelection}
                  metaChips={
                    <>
                      {task.aspectRatio && (
                        <InfoChip className="text-neutral-500">
                          {task.aspectRatio}
                        </InfoChip>
                      )}
                      {task.quality && (
                        <InfoChip className="text-neutral-500">
                          {task.quality}
                        </InfoChip>
                      )}
                      {task.format && (
                        <InfoChip className="text-neutral-500">
                          {task.format}
                        </InfoChip>
                      )}
                    </>
                  }
                  statusBadge={
                    <InfoChip className="text-amber-500/70 bg-amber-500/5 border-amber-500/20">
                      {t('projectViewer.tabs.draft')}
                    </InfoChip>
                  }
                  actionButtons={
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); runJob(task.id); }}
                        className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-500/20"
                        title={t('projectViewer.drafts.runJob')}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setJobToDeleteId(task.id); }}
                        className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
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
                          <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-3 rounded-lg border border-neutral-800 select-all whitespace-pre-wrap">
                            {task.prompt}
                          </div>
                      </div>
                      {task.imageContexts && task.imageContexts.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">{t('projectViewer.queue.visualContexts')}</label>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                              {task.imageContexts.map((ctx, idx) => (
                                <div key={idx} className="group/ctx relative aspect-square rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-sm transition-all hover:scale-110 hover:shadow-xl hover:z-10 hover:border-blue-500/50">
                                  <img 
                                    src={imageDisplayUrl(ctx)}
                                    alt={t('projectViewer.queue.contextAlt', { index: idx + 1 })} 
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
                    </>
                  }
                />
              );
            })}
            {draftJobs.length === 0 && <StackedGallery />}
        </div>
      </div>
    </section>
  );
}

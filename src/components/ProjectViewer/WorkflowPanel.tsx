import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, CheckCircle2, Copy, Eraser, ImageIcon, Library as LibraryIcon, MoreVertical, Settings, Trash2, Type, Video as VideoIcon, Volume2 } from 'lucide-react';
import { Library, Project, Provider, WorkflowItem as WorkflowItemType, ProviderType, PROVIDER_MODELS_MAP, resolveCustomModels } from '../../types';
import { WorkflowItem } from './WorkflowItem';
import { SettingsPanel } from './SettingsPanel';

interface WorkflowPanelProps {
  project: Project;
  localProject: Project;
  libraries: Library[];
  providers: Provider[];
  mobileView: 'workflow' | 'jobs';
  workflowListRef: React.RefObject<HTMLDivElement | null>;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  selectedProviderId: string;
  selectedModelId: string;
  isSettingsCollapsed: boolean;
  queueCount: number;
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  isAddingDrafts: boolean;
  draftsProgress: { current: number; total: number; stage: 'composing' | 'saving' } | null;
  combinationsCount: number;
  onNavigateToEdit: () => void;
  onNavigateToOrphans: () => void;
  onNavigateToDuplicate: () => void;
  onShowDeleteProject: () => void;
  onToggleArchive: () => void;
  isArchived: boolean;
  onAddWorkflowItem: (type: 'text' | 'image' | 'video' | 'audio' | 'library') => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (item: WorkflowItemType) => void;
  onPreviewLibrary: (library: Library, workflowItemId: string) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onLightbox: (images: string[], index: number) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onSelectFromLibrary: (id: string) => void;
  setLocalProject: (project: Project) => void;
  onUpdate: (project: Project) => void;
  setIsSettingsCollapsed: (collapsed: boolean) => void;
  setQueueCount: (count: number) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  onAddDraftsToQueue: () => void;
}

export function WorkflowPanel({
  project,
  localProject,
  libraries,
  providers,
  mobileView,
  workflowListRef,
  draggedIndex,
  dragOverIndex,
  selectedProviderId,
  selectedModelId,
  isSettingsCollapsed,
  queueCount,
  workflowError,
  uploadingItemIds,
  isAddingDrafts,
  draftsProgress,
  combinationsCount,
  onNavigateToEdit,
  onNavigateToOrphans,
  onNavigateToDuplicate,
  onShowDeleteProject,
  onToggleArchive,
  isArchived,
  onAddWorkflowItem,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemoveItem,
  onEditItem,
  onPreviewLibrary,
  onImageUpload,
  onVideoUpload,
  onAudioUpload,
  onLightbox,
  onUpdateTags,
  onSelectFromLibrary,
  setLocalProject,
  onUpdate,
  setIsSettingsCollapsed,
  setQueueCount,
  setIsModelSelectorOpen,
  onAddDraftsToQueue,
}: WorkflowPanelProps) {
  const { t } = useTranslation();
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isActionMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!actionMenuRef.current) return;
      if (!actionMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsActionMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isActionMenuOpen]);

  const menuButtonBaseClass =
    'w-full px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-2 border border-transparent';
  const supportsImageInput = localProject.type !== 'audio';

  const closeMenuAndRun = (action: () => void) => {
    setIsActionMenuOpen(false);
    action();
  };

  return (
    <div className={`w-full lg:w-96 lg:h-full min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-neutral-200/50 dark:border-white/5 bg-white/30 dark:bg-black/30 backdrop-blur-3xl flex-col flex-shrink-0 ${mobileView === 'workflow' ? 'flex h-full' : 'hidden lg:flex'}`}>
      <div className="p-3 border-b border-neutral-200/50 dark:border-white/5 bg-transparent shadow-sm relative z-10">
        <div className="min-h-[40px] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black text-neutral-900 dark:text-white truncate tracking-widest leading-none uppercase mb-1.5 flex items-center gap-2 min-w-0">
              <span className="truncate">{localProject.name}</span>
              {isArchived && (
                <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none shrink-0">
                  <Archive className="w-2.5 h-2.5" />
                  {t('projectViewer.main.archivedBadge')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[8px] text-neutral-500 dark:text-neutral-500 font-mono uppercase tracking-widest px-1.5 py-0.5 bg-white/5 dark:bg-black/20 border border-neutral-200/50 dark:border-white/5 rounded truncate leading-none backdrop-blur-md">
                {t('projectViewer.main.projectId', { id: project.id })}
              </span>
              <span title={t('projectViewer.main.autoSavedTitle')} className="flex items-center gap-1 text-[8px] text-emerald-500 font-bold uppercase tracking-widest opacity-80 whitespace-nowrap leading-none">
                <CheckCircle2 className="w-3 h-3" /> {t('projectViewer.main.autoSaved')}
              </span>
            </div>
          </div>

          <div className="relative shrink-0" ref={actionMenuRef}>
            <button
              onClick={() => setIsActionMenuOpen((open) => !open)}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 transition-all hover:bg-white/10 rounded-lg border border-transparent hover:border-neutral-200/50 dark:hover:border-white/10"
              title={t('projectViewer.main.editProjectInfo')}
              aria-haspopup="menu"
              aria-expanded={isActionMenuOpen}
              aria-label={t('projectViewer.main.editProjectInfo')}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isActionMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 p-2 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-white/90 dark:bg-neutral-900/95 backdrop-blur-xl shadow-xl z-30">
                <button
                  onClick={() => closeMenuAndRun(onNavigateToEdit)}
                  className={`${menuButtonBaseClass} text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t('projectViewer.main.editProjectInfo')}
                </button>

                <button
                  onClick={() => closeMenuAndRun(onNavigateToDuplicate)}
                  className={`${menuButtonBaseClass} text-green-600/90 dark:text-green-400/90 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-500/10`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t('projectViewer.main.duplicateProject')}
                </button>

                <button
                  onClick={() => closeMenuAndRun(onNavigateToOrphans)}
                  className={`${menuButtonBaseClass} text-blue-600/90 dark:text-blue-400/90 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/10`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  {t('projectViewer.main.manageOrphans')}
                </button>

                <button
                  onClick={() => closeMenuAndRun(onToggleArchive)}
                  className={`${menuButtonBaseClass} text-amber-600/90 dark:text-amber-400/90 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/10`}
                >
                  {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  {t(isArchived ? 'projectViewer.main.unarchiveProject' : 'projectViewer.main.archiveProject')}
                </button>

                <button
                  onClick={() => closeMenuAndRun(onShowDeleteProject)}
                  className={`${menuButtonBaseClass} text-red-600/90 dark:text-red-400/90 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('projectViewer.main.deleteProject')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-[57px] p-3 border-b border-neutral-200/50 dark:border-white/5 flex gap-2 bg-white/30 dark:bg-black/20 items-center backdrop-blur-xl">
        <button onClick={() => onAddWorkflowItem('text')} className="flex-1 flex items-center justify-center gap-1.5 bg-white/40 dark:bg-neutral-900/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all border border-neutral-200/50 dark:border-white/5 shadow-sm backdrop-blur-md">
          <Type className="w-3 h-3" /> {t('projectViewer.common.text')}
        </button>
        {supportsImageInput && (
          <button onClick={() => onAddWorkflowItem('image')} className="flex-1 flex items-center justify-center gap-1.5 bg-white/40 dark:bg-neutral-900/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all border border-neutral-200/50 dark:border-white/5 shadow-sm backdrop-blur-md">
            <ImageIcon className="w-3 h-3" /> {t('projectViewer.common.imageShort')}
          </button>
        )}
        <button onClick={() => onAddWorkflowItem('library')} className="flex-1 flex items-center justify-center gap-1.5 bg-white/40 dark:bg-neutral-900/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all border border-neutral-200/50 dark:border-white/5 shadow-sm backdrop-blur-md">
          <LibraryIcon className="w-3 h-3" /> {t('projectViewer.common.libraryShort')}
        </button>
        {localProject.type === 'video' && (
          <>
            {(() => {
              const provider = providers.find((p) => p.id === selectedProviderId);
              const providerType = provider?.type as ProviderType;
              const baseModels = PROVIDER_MODELS_MAP[providerType] || [];
              const customAliases = Array.isArray(provider?.customModels) ? provider.customModels : [];
              const allModels = [...baseModels, ...resolveCustomModels(providerType, customAliases)];
              const selectedModel = allModels.find((m) => m.id === selectedModelId);

              return (
                <>
                  {selectedModel?.options.supportsReferenceVideo && (
                    <button onClick={() => onAddWorkflowItem('video')} className="flex-1 flex items-center justify-center gap-1.5 bg-white/40 dark:bg-neutral-900/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all border border-neutral-200/50 dark:border-white/5 shadow-sm backdrop-blur-md">
                      <VideoIcon className="w-3 h-3" /> {t('projectViewer.common.video')}
                    </button>
                  )}
                  {selectedModel?.options.supportsReferenceAudio && (
                    <button onClick={() => onAddWorkflowItem('audio')} className="flex-1 flex items-center justify-center gap-1.5 bg-white/40 dark:bg-neutral-900/40 hover:bg-white/60 dark:hover:bg-neutral-800/60 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all border border-neutral-200/50 dark:border-white/5 shadow-sm backdrop-blur-md">
                      <Volume2 className="w-3 h-3" /> {t('projectViewer.common.audio')}
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      <div ref={workflowListRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar lg:max-h-none">
        {(localProject.workflow || []).map((item, index) => (
          <WorkflowItem
            key={item.id}
            item={item}
            index={index}
            draggedIndex={draggedIndex}
            dragOverIndex={dragOverIndex}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onRemove={onRemoveItem}
            onEdit={onEditItem}
            onPreviewLibrary={(lib) => onPreviewLibrary(lib, item.id)}
            onImageUpload={onImageUpload}
            onVideoUpload={onVideoUpload}
            onAudioUpload={onAudioUpload}
            uploadingItemIds={uploadingItemIds}
            libraries={libraries}
            onLightbox={onLightbox}
            onUpdateTags={onUpdateTags}
            onSelectFromLibrary={onSelectFromLibrary}
          />
        ))}
        {(localProject.workflow || []).length === 0 && (
          <div className="text-center text-neutral-500 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-[0.2em] py-12 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl bg-white/20 dark:bg-neutral-900/20 shadow-inner backdrop-blur-sm">{t('projectViewer.main.buildWorkflow')}</div>
        )}
      </div>

      <SettingsPanel
        localProject={localProject}
        setLocalProject={setLocalProject}
        onUpdate={onUpdate}
        providers={providers}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        isSettingsCollapsed={isSettingsCollapsed}
        setIsSettingsCollapsed={setIsSettingsCollapsed}
        queueCount={queueCount}
        setQueueCount={setQueueCount}
        combinationsCount={combinationsCount}
        setIsModelSelectorOpen={setIsModelSelectorOpen}
        workflowError={workflowError}
        uploadingItemIds={uploadingItemIds}
        onAddDraftsToQueue={onAddDraftsToQueue}
        isAddingDrafts={isAddingDrafts}
        draftsProgress={draftsProgress}
      />
    </div>
  );
}

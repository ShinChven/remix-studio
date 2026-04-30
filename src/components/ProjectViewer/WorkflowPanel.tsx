import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Copy, Eraser, HardDrive, Hash, ImageIcon, Library as LibraryIcon, MoreVertical, Settings, Stars, Trash2, Type, Video as VideoIcon, Volume2, X } from 'lucide-react';
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
  onStartAssistantChat: () => void;
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
  onToggleDisable?: (id: string) => void;
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
  onStartAssistantChat,
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
  onToggleDisable,
}: WorkflowPanelProps) {
  const { t } = useTranslation();
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
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
  const selectedProviderRecord = providers.find((p) => p.id === selectedProviderId);
  const selectedProviderType = selectedProviderRecord?.type as ProviderType;
  const selectedBaseModels = PROVIDER_MODELS_MAP[selectedProviderType] || [];
  const selectedCustomAliases = Array.isArray(selectedProviderRecord?.customModels) ? selectedProviderRecord.customModels : [];
  const selectedAllModels = [...selectedBaseModels, ...resolveCustomModels(selectedProviderType, selectedCustomAliases)];
  const selectedModel = selectedAllModels.find((m) => m.id === selectedModelId);
  const supportsImageInput = localProject.type !== 'audio' || selectedModel?.options.supportsReferenceImages === true;
  const sumStoredSize = (item: { size?: number; optimizedSize?: number; thumbnailSize?: number }) => {
    return Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
  };
  const projectStorageUsage = localProject.totalSize ?? [
    ...(localProject.album || []),
    ...(localProject.workflow || []),
  ].reduce((sum, item) => sum + sumStoredSize(item), 0);

  const formatStorageSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const unit = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), units.length - 1);
    const value = bytes / Math.pow(unit, index);
    return `${parseFloat(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2))} ${units[index]}`;
  };

  const closeMenuAndRun = (action: () => void) => {
    setIsActionMenuOpen(false);
    action();
  };

  return (
    <div className={`w-full lg:w-96 lg:h-full min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-neutral-200/50 dark:border-white/5 bg-white/30 dark:bg-black/30 backdrop-blur-3xl flex-col flex-shrink-0 ${mobileView === 'workflow' ? 'flex h-full' : 'hidden lg:flex'}`}>
      <div className="p-3 border-b border-neutral-200/50 dark:border-white/5 bg-transparent shadow-sm relative z-10">
        <div className="min-h-[40px] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-neutral-900 dark:text-white tracking-tight leading-none flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsProjectInfoOpen(true)}
                className="min-w-0 truncate text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title={localProject.name}
              >
                {localProject.name}
              </button>
              {isArchived && (
                <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none shrink-0">
                  <Archive className="w-2.5 h-2.5" />
                  {t('projectViewer.main.archivedBadge')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onStartAssistantChat}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 transition-all hover:bg-white/10 rounded-lg border border-transparent hover:border-neutral-200/50 dark:hover:border-white/10"
              title={t('projectViewer.main.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })}
              aria-label={t('projectViewer.main.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })}
            >
              <Stars className="w-4 h-4" />
            </button>

            <div className="relative" ref={actionMenuRef}>
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
      </div>

      {isProjectInfoOpen && createPortal((
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsProjectInfoOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-neutral-200/60 dark:border-white/10 bg-white/95 dark:bg-neutral-900/95 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200/60 dark:border-white/10 p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                  {t('projectViewer.main.projectInfo', { defaultValue: 'Project info' })}
                </p>
                <h3 className="mt-2 text-xl font-black leading-tight text-neutral-900 dark:text-white break-words">
                  {localProject.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProjectInfoOpen(false)}
                className="shrink-0 rounded-xl border border-transparent p-2 text-neutral-500 transition-all hover:border-neutral-200 dark:hover:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                aria-label={t('projectViewer.common.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-neutral-50/80 dark:bg-black/20 p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                  <Type className="h-3.5 w-3.5" />
                  {t('projectViewer.main.projectTitle', { defaultValue: 'Title' })}
                </div>
                <p className="break-words text-sm font-semibold text-neutral-900 dark:text-white">{localProject.name}</p>
              </div>

              {localProject.description && (
                <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-neutral-50/80 dark:bg-black/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                    <LibraryIcon className="h-3.5 w-3.5" />
                    {t('projectViewer.main.projectDescription', { defaultValue: 'Description' })}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700 dark:text-neutral-300">{localProject.description}</p>
                </div>
              )}

              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-neutral-50/80 dark:bg-black/20 p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                  <Hash className="h-3.5 w-3.5" />
                  {t('projectViewer.main.id', { defaultValue: 'ID' })}
                </div>
                <p className="break-all font-mono text-xs font-semibold text-neutral-900 dark:text-white">{localProject.id || project.id}</p>
              </div>

              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-neutral-50/80 dark:bg-black/20 p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                  <HardDrive className="h-3.5 w-3.5" />
                  {t('projectViewer.main.storageUsage', { defaultValue: 'Storage usage' })}
                </div>
                <p className="text-sm font-black text-neutral-900 dark:text-white">{formatStorageSize(projectStorageUsage)}</p>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

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
            onToggleDisable={onToggleDisable}
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

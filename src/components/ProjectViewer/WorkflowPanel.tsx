import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Eraser, ImageIcon, Library as LibraryIcon, Settings, Trash2, Type, Video as VideoIcon, Volume2 } from 'lucide-react';
import { Library, Project, Provider, WorkflowItem as WorkflowItemType } from '../../types';
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
  combinations: any[];
  onNavigateToEdit: () => void;
  onNavigateToOrphans: () => void;
  onShowDeleteProject: () => void;
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
  setHasManuallySetQueueCount: (manual: boolean) => void;
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
  combinations,
  onNavigateToEdit,
  onNavigateToOrphans,
  onShowDeleteProject,
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
  setHasManuallySetQueueCount,
  setIsModelSelectorOpen,
  onAddDraftsToQueue,
}: WorkflowPanelProps) {
  const { t } = useTranslation();

  return (
    <div className={`w-full lg:w-96 lg:h-full min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-neutral-800 bg-neutral-900/30 flex-col flex-shrink-0 ${mobileView === 'workflow' ? 'flex h-full' : 'hidden lg:flex'}`}>
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/20 backdrop-blur-md shadow-sm">
        <div className="min-h-[40px] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black text-white truncate tracking-widest leading-none uppercase">
              {localProject.name}
            </div>
            <div className="mt-0.5 flex items-center gap-2 min-w-0">
              <span className="text-[8px] text-neutral-500 font-mono uppercase tracking-widest px-1.5 py-0.5 bg-neutral-950 border border-neutral-800 rounded truncate leading-none">
                {t('projectViewer.main.projectId', { id: project.id })}
              </span>
              <span title={t('projectViewer.main.autoSavedTitle')} className="flex items-center gap-1 text-[8px] text-emerald-500 font-bold uppercase tracking-widest opacity-60 whitespace-nowrap leading-none">
                <CheckCircle2 className="w-3 h-3" /> {t('projectViewer.main.autoSaved')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onNavigateToEdit}
              className="p-1.5 text-neutral-600 hover:text-green-400 transition-all hover:bg-green-400/10 rounded-lg"
              title={t('projectViewer.main.editProjectInfo')}
            ><Settings className="w-4 h-4" /></button>
            <button
              onClick={onNavigateToOrphans}
              className="p-1.5 text-neutral-600 hover:text-blue-400 transition-all hover:bg-blue-400/10 rounded-lg"
              title={t('projectViewer.main.manageOrphans')}
            ><Eraser className="w-4 h-4" /></button>
            <button
              onClick={onShowDeleteProject}
              className="p-1.5 text-neutral-600 hover:text-red-400 transition-all hover:bg-red-400/10 rounded-lg"
              title={t('projectViewer.main.deleteProject')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="h-[57px] p-3 border-b border-neutral-800 flex gap-2 bg-neutral-900/50 items-center">
        <button onClick={() => onAddWorkflowItem('text')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
          <Type className="w-3 h-3" /> {t('projectViewer.common.text')}
        </button>
        <button onClick={() => onAddWorkflowItem('image')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
          <ImageIcon className="w-3 h-3" /> {t('projectViewer.common.imageShort')}
        </button>
        {localProject.type === 'video' && (
          <>
            <button onClick={() => onAddWorkflowItem('video')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
              <VideoIcon className="w-3 h-3" /> Video
            </button>
            <button onClick={() => onAddWorkflowItem('audio')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
              <Volume2 className="w-3 h-3" /> Audio
            </button>
          </>
        )}
        <button onClick={() => onAddWorkflowItem('library')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors">
          <LibraryIcon className="w-3 h-3" /> {t('projectViewer.common.libraryShort')}
        </button>
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
          <div className="text-center text-neutral-600 text-[10px] font-bold uppercase tracking-widest py-12 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">{t('projectViewer.main.buildWorkflow')}</div>
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
        setHasManuallySetQueueCount={setHasManuallySetQueueCount}
        combinations={combinations}
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

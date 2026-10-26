import { useState, type DragEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { civitaiModelItems, civitaiVideoEngine, isCivitaiVideo } from '../../../lib/civitai';
import { Button, Dialog, Icon, IconButton, LoadingIndicator, MenuButton, MenuDivider, MenuItem, Text } from '../../../m3';
import { PROVIDER_MODELS_MAP, resolveCustomModels, type Library, type Project, type Provider, type ProviderType, type WorkflowItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { CivitaiModelStep } from './CivitaiModelStep';
import { CivitaiSettingsPanel } from './CivitaiSettings';
import { ComfySettingsPanel, ComfyWorkflowPanel } from './ComfyWorkflowPanel';
import type { DraftsProgress } from './RunDock';
import { SettingsPanel } from './SettingsPanel';
import { WorkflowStep } from './WorkflowStep';

export interface WorkflowPanelProps {
  isLoading?: boolean;
  project: Project;
  localProject: Project;
  libraries: Library[];
  providers: Provider[];
  hasHistory: boolean;
  workflowListRef: RefObject<HTMLDivElement | null>;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  selectedProviderId: string;
  selectedModelId: string;
  isSettingsCollapsed: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  queueCount: number;
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  isAddingDrafts: boolean;
  draftsProgress: DraftsProgress | null;
  combinationsCount: number;
  onNavigateToEdit: () => void;
  onNavigateToOrphans: () => void;
  onNavigateToDuplicate: () => void;
  onImportWorkflow?: () => void;
  onStartAssistantChat: () => void;
  onShowDeleteProject: () => void;
  onToggleArchive: () => Promise<void>;
  isTogglingArchive: boolean;
  isArchived: boolean;
  onAddWorkflowItem: (type: 'text' | 'image' | 'video' | 'audio' | 'library') => void;
  onDragStart: (e: DragEvent, index: number) => void;
  onDragOver: (e: DragEvent, index: number) => void;
  onDrop: (e: DragEvent, index: number) => void;
  onDragEnd: () => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (item: WorkflowItem) => void;
  onEditImage?: (item: WorkflowItem) => void;
  onPreviewLibrary: (library: Library, workflowItemId: string) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onLightbox: (images: string[], index: number) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onSelectFromLibrary: (id: string) => void;
  onChangeLibrary: (id: string) => void;
  onSaveToLibrary?: (item: WorkflowItem) => void;
  setLocalProject: (project: Project) => void;
  onUpdate: (project: Project) => void;
  setIsSettingsCollapsed: (collapsed: boolean) => void;
  setQueueCount: (count: number) => void;
  setIsModelSelectorOpen: (open: boolean) => void;
  onAddDraftsToQueue: () => void;
  onToggleDisable?: (id: string) => void;
  showDisabledItems: boolean;
  onToggleShowDisabledItems: () => void;
  onFilesDrop?: (files: File[]) => void;
  isRefreshingLibraries: boolean;
  libraryRefreshError: string | null;
  onRefreshLibraries: () => Promise<unknown>;
}

/** The project's left pane: its name and menu, the workflow steps, and the settings that turn them into drafts. */
export function WorkflowPanel(props: WorkflowPanelProps) {
  const { localProject, providers, isExpanded, workflowListRef, isLoading } = props;
  const { t } = useTranslation();
  const [infoOpen, setInfoOpen] = useState(false);
  const [dragOverFiles, setDragOverFiles] = useState(false);
  const isComfy = localProject.type === 'comfyui';
  const isCivitai = localProject.type === 'civitai';

  const saveProject = (next: Project) => {
    props.setLocalProject(next);
    props.onUpdate(next);
  };

  const providerRecord = providers.find((p) => p.id === props.selectedProviderId);
  const providerType = providerRecord?.type as ProviderType;
  const allModels = [...(PROVIDER_MODELS_MAP[providerType] || []), ...resolveCustomModels(providerType, Array.isArray(providerRecord?.customModels) ? providerRecord.customModels : [])];
  const model = allModels.find((m) => m.id === props.selectedModelId);
  const supportsImageInput = localProject.type !== 'audio' || model?.options.supportsReferenceImages === true;
  const items = localProject.workflow || [];
  const disabledCount = items.filter((item) => item.disabled).length;
  // Keep each item's index in the full workflow: drag and drop reorders by index.
  const visible = items.map((item, index) => ({ item, index })).filter(({ item }) => props.showDisabledItems || !item.disabled);
  const storage = localProject.totalSize ?? [...(localProject.album || []), ...items].reduce((sum, item: { size?: number; optimizedSize?: number; thumbnailSize?: number }) => sum + Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0), 0);

  const hasCheckpoint = civitaiModelItems(items, 'checkpoint').length > 0;
  const civitaiVideo = isCivitai && isCivitaiVideo(localProject.civitaiConfig);
  const engine = civitaiVideoEngine(localProject.civitaiConfig?.video?.engine);
  const lorasUnsupported = civitaiVideo && engine.loras === 0;

  const updateItem = (next: WorkflowItem) => saveProject({ ...localProject, workflow: items.map((item) => (item.id === next.id ? next : item)) });

  /** A checkpoint or LoRA slot; one checkpoint slot holds every checkpoint. */
  const addModelItem = (slot: 'checkpoint' | 'lora') => {
    if (slot === 'checkpoint' && hasCheckpoint) return;
    saveProject({ ...localProject, workflow: [...items, { id: crypto.randomUUID(), type: 'model', value: '', order: items.length, civitai: { slot, options: [] } }] });
    requestAnimationFrame(() => workflowListRef.current?.scrollTo({ top: workflowListRef.current.scrollHeight, behavior: 'smooth' }));
  };

  /** In a Civitai project, text and text libraries feed the prompt, or the negative prompt once switched. */
  const promptSwitch = (item: WorkflowItem) => {
    if (!isCivitai) return undefined;
    const textLibrary = item.type === 'library' && props.libraries.find((l) => l.id === item.value)?.type === 'text';
    if (item.type !== 'text' && !textLibrary) return undefined;
    const negative = item.civitai?.slot === 'negative';
    return (
      <button type="button" className="v2-prompt-switch m3-focus-ring" data-negative={negative ? '' : undefined} aria-pressed={negative} title={t('projectViewer.civitai.promptSwitchHint')} onClick={() => updateItem({ ...item, civitai: negative ? undefined : { slot: 'negative' } })}>
        {negative ? t('projectViewer.civitai.negativeShort') : t('projectViewer.civitai.promptShort')}
      </button>
    );
  };

  const onPanelDragOver = (e: DragEvent) => {
    if (isComfy || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOverFiles(true);
  };
  const onPanelDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOverFiles(false);
    if (props.onFilesDrop && e.dataTransfer.files.length > 0) props.onFilesDrop(Array.from(e.dataTransfer.files));
  };

  const addButton = (type: 'text' | 'image' | 'video' | 'audio' | 'library', icon: string, label: string) => (
    <Button key={type} variant="tonal" size="xs" icon={icon} onClick={() => props.onAddWorkflowItem(type)}>
      {label}
    </Button>
  );

  return (
    <div className="v2-workflow" data-expanded={isExpanded ? '' : undefined} onDragOver={onPanelDragOver} onDragLeave={(e) => e.dataTransfer.types.includes('Files') && setDragOverFiles(false)} onDrop={onPanelDrop}>
      {dragOverFiles && (
        <div className="v2-workflow__drop">
          <Icon name="upload_file" size={40} />
          <Text variant="title-medium">{t('projectViewer.workflow.dropFilesHere', { defaultValue: 'Drop files to add to workflow' })}</Text>
        </div>
      )}
      <header className="v2-workflow__head">
        <button type="button" className="v2-workflow__title m3-focus-ring" title={localProject.name} onClick={() => setInfoOpen(true)}>
          <Text as="span" variant="title-large" emphasized className="truncate">
            {localProject.name}
          </Text>
        </button>
        {props.isArchived && (
          <span className="v2-info-chip" data-tone="warning">
            <Icon name="archive" size={14} /> {t('projectViewer.main.archivedBadge')}
          </span>
        )}
        <span className="ms-auto flex items-center">
          <IconButton icon="auto_awesome" size="sm" label={t('projectViewer.main.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })} tooltip onClick={props.onStartAssistantChat} />
          <IconButton
            icon={isExpanded ? 'close_fullscreen' : 'open_in_full'}
            size="sm"
            className="v2-hide-compact"
            label={isExpanded ? t('projectViewer.workflow.collapseWorkflow', { defaultValue: 'Exit full screen' }) : t('projectViewer.workflow.expandWorkflow', { defaultValue: 'Expand workflow to full screen' })}
            tooltip
            selected={isExpanded}
            onClick={props.onToggleExpand}
          />
          <MenuButton
            placement="bottom-end"
            aria-label={t('projectViewer.main.editProjectInfo')}
            trigger={(p) => <IconButton {...p} icon="more_vert" size="sm" label={t('projectViewer.main.editProjectInfo')} />}
          >
            <MenuItem icon={props.showDisabledItems ? 'visibility_off' : 'visibility'} disabled={disabledCount === 0} trailingText={disabledCount > 0 ? `${disabledCount} · H` : 'H'} onSelect={props.onToggleShowDisabledItems}>
              {t(props.showDisabledItems ? 'projectViewer.main.hideDisabledItems' : 'projectViewer.main.showDisabledItems')}
            </MenuItem>
            {props.onImportWorkflow && (
              <MenuItem icon="download" onSelect={props.onImportWorkflow}>
                {t('projectViewer.main.importWorkflow')}
              </MenuItem>
            )}
            <MenuDivider />
            <MenuItem icon="settings" onSelect={props.onNavigateToEdit}>
              {t('projectViewer.main.editProjectInfo')}
            </MenuItem>
            <MenuItem icon="content_copy" onSelect={props.onNavigateToDuplicate}>
              {t('projectViewer.main.duplicateProject')}
            </MenuItem>
            <MenuItem icon="ink_eraser" onSelect={props.onNavigateToOrphans}>
              {t('projectViewer.main.manageOrphans')}
            </MenuItem>
            <MenuItem icon={props.isArchived ? 'unarchive' : 'archive'} disabled={props.isTogglingArchive} onSelect={() => void props.onToggleArchive()}>
              {t(props.isArchived ? 'projectViewer.main.unarchiveProject' : 'projectViewer.main.archiveProject')}
            </MenuItem>
            <MenuItem icon="delete" className="v2-menu-danger" onSelect={props.onShowDeleteProject}>
              {t('projectViewer.main.deleteProject')}
            </MenuItem>
          </MenuButton>
        </span>
      </header>

      {isComfy ? (
        <>
          <div className="v2-workflow__list" ref={workflowListRef}>
            <ComfyWorkflowPanel
              localProject={localProject}
              libraries={props.libraries}
              isExpanded={isExpanded}
              uploadingItemIds={props.uploadingItemIds}
              isRefreshingLibraries={props.isRefreshingLibraries}
              libraryRefreshError={props.libraryRefreshError}
              onSaveProject={saveProject}
              onRefreshLibraries={props.onRefreshLibraries}
              onImageUpload={props.onImageUpload}
              onVideoUpload={props.onVideoUpload}
              onAudioUpload={props.onAudioUpload}
              onEditItem={props.onEditItem}
              onPreviewLibrary={props.onPreviewLibrary}
              onLightbox={props.onLightbox}
              onRemoveItem={props.onRemoveItem}
              onUpdateTags={props.onUpdateTags}
              onSelectFromLibrary={props.onSelectFromLibrary}
              onSaveToLibrary={props.onSaveToLibrary || (() => undefined)}
            />
          </div>
          <ComfySettingsPanel
            localProject={localProject}
            onSaveProject={saveProject}
            queueCount={props.queueCount}
            setQueueCount={props.setQueueCount}
            combinationsCount={props.combinationsCount}
            workflowError={props.workflowError}
            uploadingItemIds={props.uploadingItemIds}
            onAddDraftsToQueue={props.onAddDraftsToQueue}
            isAddingDrafts={props.isAddingDrafts}
            draftsProgress={props.draftsProgress}
          />
        </>
      ) : (
        <>
          <div className="v2-workflow__add" data-density="compact">
            {addButton('text', 'text_fields', t('projectViewer.common.text'))}
            {supportsImageInput && addButton('image', 'image', t('projectViewer.common.imageShort'))}
            {addButton('library', 'library_books', t('projectViewer.common.libraryShort'))}
            {isCivitai && (
              <>
                {!civitaiVideo && (
                  <Button variant="tonal" size="xs" icon="hexagon" disabled={hasCheckpoint} title={hasCheckpoint ? t('projectViewer.civitai.oneCheckpointItem') : t('projectViewer.civitai.addCheckpointItem')} onClick={() => addModelItem('checkpoint')}>
                    {t('projectViewer.civitai.modelShort')}
                  </Button>
                )}
                <Button variant="tonal" size="xs" icon="layers" disabled={lorasUnsupported} title={lorasUnsupported ? t('projectViewer.civitai.video.noLorasHint', { engine: engine.label }) : t('projectViewer.civitai.addLoraItem')} onClick={() => addModelItem('lora')}>
                  {t('projectViewer.civitai.loraShort')}
                </Button>
              </>
            )}
            {localProject.type === 'video' && model?.options.supportsReferenceVideo && addButton('video', 'movie', t('projectViewer.common.video'))}
            {localProject.type === 'video' && model?.options.supportsReferenceAudio && addButton('audio', 'graphic_eq', t('projectViewer.common.audio'))}
          </div>
          <div ref={workflowListRef} className="v2-workflow__list" data-grid={isExpanded ? '' : undefined}>
            {isLoading && (
              <div className="flex justify-center py-10">
                <LoadingIndicator />
              </div>
            )}
            {!isLoading &&
              visible.map(({ item, index }) =>
                item.type === 'model' ? (
                  <CivitaiModelStep
                    key={item.id}
                    item={item}
                    index={index}
                    providerId={isCivitai ? localProject.providerId : undefined}
                    videoEngine={civitaiVideo ? engine : undefined}
                    draggedIndex={props.draggedIndex}
                    dragOverIndex={props.dragOverIndex}
                    onDragStart={props.onDragStart}
                    onDragOver={props.onDragOver}
                    onDrop={props.onDrop}
                    onDragEnd={props.onDragEnd}
                    onRemove={props.onRemoveItem}
                    onToggleDisable={props.onToggleDisable}
                    onChange={updateItem}
                    gridView={isExpanded}
                  />
                ) : (
                  <WorkflowStep
                    key={item.id}
                    item={item}
                    index={index}
                    draggedIndex={props.draggedIndex}
                    dragOverIndex={props.dragOverIndex}
                    onDragStart={props.onDragStart}
                    onDragOver={props.onDragOver}
                    onDrop={props.onDrop}
                    onDragEnd={props.onDragEnd}
                    onRemove={props.onRemoveItem}
                    onEdit={props.onEditItem}
                    onEditImage={props.onEditImage}
                    onPreviewLibrary={(lib) => props.onPreviewLibrary(lib, item.id)}
                    onImageUpload={props.onImageUpload}
                    onVideoUpload={props.onVideoUpload}
                    onAudioUpload={props.onAudioUpload}
                    uploadingItemIds={props.uploadingItemIds}
                    libraries={props.libraries}
                    onLightbox={props.onLightbox}
                    onSelectFromLibrary={props.onSelectFromLibrary}
                    onChangeLibrary={props.onChangeLibrary}
                    onSaveToLibrary={props.onSaveToLibrary}
                    onToggleDisable={props.onToggleDisable}
                    gridView={isExpanded}
                    headerExtra={promptSwitch(item)}
                  />
                ),
              )}
            {!isLoading && visible.length === 0 && (
              <Text variant="body-medium" className="v2-dashed-note">
                {items.length === 0 ? t('projectViewer.main.buildWorkflow') : t('projectViewer.workflow.allItemsHidden')}
              </Text>
            )}
          </div>
          {isCivitai ? (
            <CivitaiSettingsPanel
              localProject={localProject}
              isWorkflowLoaded={!isLoading}
              hasHistory={props.hasHistory}
              providers={providers}
              libraries={props.libraries}
              onSaveProject={saveProject}
              isSettingsCollapsed={props.isSettingsCollapsed}
              setIsSettingsCollapsed={props.setIsSettingsCollapsed}
              queueCount={props.queueCount}
              setQueueCount={props.setQueueCount}
              combinationsCount={props.combinationsCount}
              workflowError={props.workflowError}
              uploadingItemIds={props.uploadingItemIds}
              onAddDraftsToQueue={props.onAddDraftsToQueue}
              isAddingDrafts={props.isAddingDrafts}
              draftsProgress={props.draftsProgress}
            />
          ) : (
            <SettingsPanel
              localProject={localProject}
              setLocalProject={props.setLocalProject}
              onUpdate={props.onUpdate}
              providers={providers}
              selectedProviderId={props.selectedProviderId}
              selectedModelId={props.selectedModelId}
              isSettingsCollapsed={props.isSettingsCollapsed}
              setIsSettingsCollapsed={props.setIsSettingsCollapsed}
              queueCount={props.queueCount}
              setQueueCount={props.setQueueCount}
              combinationsCount={props.combinationsCount}
              setIsModelSelectorOpen={props.setIsModelSelectorOpen}
              workflowError={props.workflowError}
              uploadingItemIds={props.uploadingItemIds}
              onAddDraftsToQueue={props.onAddDraftsToQueue}
              isAddingDrafts={props.isAddingDrafts}
              draftsProgress={props.draftsProgress}
            />
          )}
        </>
      )}

      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} icon="info" headline={t('projectViewer.main.projectInfo', { defaultValue: 'Project info' })} maxWidth={520} actions={<Button variant="filled" onClick={() => setInfoOpen(false)}>{t('projectViewer.common.close')}</Button>}>
        <div className="flex flex-col gap-2">
          {[
            { icon: 'title', label: t('projectViewer.main.projectTitle', { defaultValue: 'Title' }), value: localProject.name },
            localProject.description ? { icon: 'notes', label: t('projectViewer.main.projectDescription', { defaultValue: 'Description' }), value: localProject.description } : null,
            { icon: 'tag', label: t('projectViewer.main.id', { defaultValue: 'ID' }), value: localProject.id || props.project.id, mono: true },
            { icon: 'hard_drive', label: t('projectViewer.main.storageUsage', { defaultValue: 'Storage usage' }), value: formatBytes(storage) },
          ]
            .filter(Boolean)
            .map((row) => (
              <div key={row!.label} className="v2-kv">
                <Text as="span" variant="label-small" className="flex items-center gap-1 uppercase tracking-widest text-on-surface-variant">
                  <Icon name={row!.icon} size={14} /> {row!.label}
                </Text>
                <Text as="span" variant="body-medium" className={row!.mono ? 'select-all break-all font-mono' : 'whitespace-pre-wrap break-words'}>
                  {row!.value}
                </Text>
              </div>
            ))}
        </div>
      </Dialog>
    </div>
  );
}

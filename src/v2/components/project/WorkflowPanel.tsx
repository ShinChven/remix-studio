import { useState, type DragEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { civitaiModelItems, civitaiVideoEngine, isCivitaiVideo } from '../../../lib/civitai';
import { Button, Dialog, Icon, IconButton, LoadingIndicator, MenuDivider, MenuItem, Ripple, Text } from '../../../m3';
import { PROVIDER_MODELS_MAP, resolveCustomModels, type Library, type Project, type Provider, type ProviderType, type WorkflowItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { CivitaiModelStep } from './CivitaiModelStep';
import { CivitaiSettingsPanel } from './CivitaiSettings';
import { ComfySettingsPanel, ComfyWorkflowPanel } from './ComfyWorkflowPanel';
import type { DraftsProgress } from './RunDock';
import { HoverMenuButton } from '../../ui/HoverMenuButton';
import { SettingsPanel } from './SettingsPanel';
import { WorkflowStep } from './WorkflowStep';
import { kindMeta } from '../../ui/entityMeta';

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

  const addItem = (type: 'text' | 'image' | 'video' | 'audio' | 'library', icon: string, label: string) => (
    <MenuItem key={type} icon={icon} onSelect={() => props.onAddWorkflowItem(type)}>
      {label}
    </MenuItem>
  );
  const addStepMenu = (
    <HoverMenuButton placement="top-start" aria-label={t('v2.project.addStep')} trigger={(p) => <IconButton {...p} icon="add" size="sm" variant="tonal" label={t('v2.project.addStep')} />}>
      {addItem('text', kindMeta('text').icon, t('projectViewer.common.text'))}
      {supportsImageInput && addItem('image', kindMeta('image').icon, t('projectViewer.common.imageShort'))}
      {addItem('library', 'library_books', t('projectViewer.common.libraryShort'))}
      {isCivitai && !civitaiVideo && (
        <MenuItem icon="hexagon" disabled={hasCheckpoint} supportingText={hasCheckpoint ? t('projectViewer.civitai.oneCheckpointItem') : undefined} onSelect={() => addModelItem('checkpoint')}>
          {t('projectViewer.civitai.modelShort')}
        </MenuItem>
      )}
      {isCivitai && (
        <MenuItem icon="layers" disabled={lorasUnsupported} supportingText={lorasUnsupported ? t('projectViewer.civitai.video.noLorasHint', { engine: engine.label }) : undefined} onSelect={() => addModelItem('lora')}>
          {t('projectViewer.civitai.loraShort')}
        </MenuItem>
      )}
      {localProject.type === 'video' && model?.options.supportsReferenceVideo && addItem('video', kindMeta('video').icon, t('projectViewer.common.video'))}
      {localProject.type === 'video' && model?.options.supportsReferenceAudio && addItem('audio', kindMeta('audio').icon, t('projectViewer.common.audio'))}
    </HoverMenuButton>
  );

  const enabledCount = items.length - disabledCount;
  const subtitle = [
    t('v2.project.stepCount', { count: enabledCount }),
    !isComfy && props.combinationsCount > 0 ? t('v2.project.combinationCount', { count: props.combinationsCount, formatted: props.combinationsCount.toLocaleString() }) : null,
    disabledCount > 0 ? t('v2.project.disabledCount', { count: disabledCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
          <Ripple />
          <Text as="span" variant="title-large" emphasized className="v2-workflow__name">
            {localProject.name}
          </Text>
          <Text as="span" variant="body-small" className="v2-workflow__sub">
            {props.isArchived && (
              <span className="v2-workflow__archived">
                <Icon name="archive" size={14} /> {t('projectViewer.main.archivedBadge')}
                {subtitle && ' · '}
              </span>
            )}
            {subtitle}
          </Text>
        </button>
        <span className="v2-workflow__tools">
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
          <HoverMenuButton
            placement="bottom-end"
            aria-label={t('v2.project.projectMenu')}
            trigger={(p) => <IconButton {...p} icon="more_vert" size="sm" label={t('v2.project.projectMenu')} />}
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
            <MenuItem icon="info" onSelect={() => setInfoOpen(true)}>
              {t('projectViewer.main.projectInfo', { defaultValue: 'Project info' })}
            </MenuItem>
            <MenuItem icon="edit" onSelect={props.onNavigateToEdit}>
              {t('v2.project.editProject')}
            </MenuItem>
            <MenuItem icon="content_copy" onSelect={props.onNavigateToDuplicate}>
              {t('v2.project.duplicateProject')}
            </MenuItem>
            <MenuItem icon="ink_eraser" onSelect={props.onNavigateToOrphans}>
              {t('v2.project.manageOrphans')}
            </MenuItem>
            <MenuItem icon={props.isArchived ? 'unarchive' : 'archive'} disabled={props.isTogglingArchive} onSelect={() => void props.onToggleArchive()}>
              {t(props.isArchived ? 'v2.project.unarchiveProject' : 'v2.project.archiveProject')}
            </MenuItem>
            <MenuDivider />
            <MenuItem icon="delete" className="v2-menu-danger" onSelect={props.onShowDeleteProject}>
              {t('v2.project.deleteProject')}
            </MenuItem>
          </HoverMenuButton>
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
              <div className="v2-workflow__empty">
                <Icon name={items.length === 0 ? 'account_tree' : 'visibility_off'} size={28} />
                <Text variant="title-small">{items.length === 0 ? t('projectViewer.main.buildWorkflow') : t('projectViewer.workflow.allItemsHidden')}</Text>
                {items.length === 0 && (
                  <Text variant="body-small" className="text-on-surface-variant">
                    {t('v2.project.buildWorkflowHint')}
                  </Text>
                )}
              </div>
            )}
          </div>
          {isCivitai ? (
            <CivitaiSettingsPanel
              addStep={addStepMenu}
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
              addStep={addStepMenu}
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

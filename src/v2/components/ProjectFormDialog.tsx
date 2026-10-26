import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createProject, fetchProject, fetchProjectWorkflow, updateProject } from '../../api';
import { Button, Dialog, Text, TextField, useSnackbar } from '../../m3';
import type { CivitaiMediaType, Project, ProjectType, WorkflowItem } from '../../types';
import { ChoiceTiles } from '../ui/ChoiceTiles';
import { kindMeta } from '../ui/entityMeta';
import { LoadingState, Section } from '../ui/Page';

const TYPES: ProjectType[] = ['image', 'text', 'video', 'audio', 'comfyui', 'civitai'];

export interface SavedProject {
  id: string;
  name: string;
  description: string;
  prefix: string;
  isNew: boolean;
}

interface ProjectFormDialogProps {
  /** The project being edited. Omit to create one. */
  projectId?: string;
  /** Seed a new project from this one: its settings and workflow travel across. */
  copyFromId?: string;
  onClose: () => void;
  onSaved: (saved: SavedProject) => void;
}

/** Creates, duplicates and edits a project. Full screen on phones, a dialog elsewhere. */
export function ProjectFormDialog({ projectId, copyFromId, onClose, onSaved }: ProjectFormDialogProps) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const isNew = !projectId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customId, setCustomId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('image');
  const [civitaiMediaType, setCivitaiMediaType] = useState<CivitaiMediaType>('image');
  const [workflowToCopy, setWorkflowToCopy] = useState<WorkflowItem[]>([]);
  const [sourceProject, setSourceProject] = useState<Partial<Project> | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectId || copyFromId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (projectId) {
          const proj = await fetchProject(projectId);
          if (cancelled) return;
          setName(proj.name);
          setDescription(proj.description || '');
          setPrefix(proj.prefix || '');
          setProjectType(proj.type || 'image');
        } else if (copyFromId) {
          const [proj, workflow] = await Promise.all([fetchProject(copyFromId), fetchProjectWorkflow(copyFromId)]);
          if (cancelled) return;
          setName(proj.name);
          setDescription(proj.description || '');
          setPrefix(proj.prefix || '');
          setProjectType(proj.type || 'image');
          setWorkflowToCopy(workflow.map((item) => ({ ...item, id: crypto.randomUUID() })));
          setSourceProject(proj);
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        if (!cancelled) {
          snackbar.show(t('projectForm.loadFailed'));
          onClose();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (projectId || copyFromId) void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, copyFromId]);

  useEffect(() => {
    if (isLoading || !window.matchMedia('(min-width: 640px)').matches) return;
    nameRef.current?.focus();
  }, [isLoading]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || isSubmitting || isLoading) return;
    setIsSubmitting(true);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedPrefix = prefix.trim();
    try {
      let targetId: string;
      if (isNew) {
        targetId = customId.trim().replace(/[^a-zA-Z0-9-_]/g, '_') || `project-${Date.now()}`;
        await createProject({
          id: targetId,
          name: trimmedName,
          description: trimmedDescription || undefined,
          type: projectType,
          createdAt: Date.now(),
          workflow: workflowToCopy,
          jobs: [],
          album: [],
          shuffle: sourceProject?.shuffle ?? false,
          prefix: trimmedPrefix,
          ...(!sourceProject && projectType === 'civitai' && civitaiMediaType === 'video' && {
            civitaiConfig: { mediaType: 'video' },
            format: 'mp4',
          }),
          ...(sourceProject && {
            providerId: sourceProject.providerId,
            modelConfigId: sourceProject.modelConfigId,
            aspectRatio: sourceProject.aspectRatio,
            quality: sourceProject.quality,
            background: sourceProject.background,
            format: sourceProject.format,
            systemPrompt: sourceProject.systemPrompt,
            temperature: sourceProject.temperature,
            maxTokens: sourceProject.maxTokens,
            duration: sourceProject.duration,
            resolution: sourceProject.resolution,
            sound: sourceProject.sound,
            steps: sourceProject.steps,
            guidance: sourceProject.guidance,
            comfyUrl: sourceProject.comfyUrl,
            comfyWorkflow: sourceProject.comfyWorkflow,
            comfyPassword: sourceProject.comfyPassword,
            civitaiConfig: sourceProject.civitaiConfig,
          }),
        } as Project);
      } else {
        targetId = projectId!;
        await updateProject(targetId, { name: trimmedName, description: trimmedDescription, prefix: trimmedPrefix });
      }
      onSaved({ id: targetId, name: trimmedName, description: trimmedDescription, prefix: trimmedPrefix, isNew });
    } catch (error) {
      console.error('Failed to save project:', error);
      snackbar.show(t('projectForm.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const namePlaceholder =
    projectType === 'text'
      ? t('projectForm.namePlaceholderText')
      : projectType === 'audio'
        ? t('projectForm.namePlaceholderAudio')
        : t('projectForm.namePlaceholderImage');
  const prefixHelp =
    projectType === 'text'
      ? t('projectForm.prefixDescriptionText')
      : projectType === 'audio'
        ? t('projectForm.prefixDescriptionAudio')
        : t('projectForm.prefixDescriptionImage');

  const submitButton = (
    <Button
      variant="filled"
      icon={isNew ? 'play_arrow' : 'save'}
      loading={isSubmitting}
      disabled={isLoading || !name.trim()}
      onClick={() => void submit()}
      emphasized
    >
      {isNew ? t('projectForm.submitCreate') : t('projectForm.submitSave')}
    </Button>
  );

  return (
    <Dialog
      open
      onClose={() => !isSubmitting && onClose()}
      dismissible={!isSubmitting}
      fullScreen="compact"
      icon={kindMeta(projectType).icon}
      headline={isNew ? t('projectForm.newTitle') : t('projectForm.editTitle')}
      maxWidth={640}
      confirmAction={submitButton}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={isSubmitting}>
            {t('projectForm.cancel')}
          </Button>
          {submitButton}
        </>
      }
    >
      {isLoading ? (
        <LoadingState minHeight={200} />
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('projectForm.description')}
          </Text>
          {isNew && (
            <Section title={t('projectForm.typeLabel')}>
              <ChoiceTiles<ProjectType>
                columns={3}
                aria-label={t('projectForm.typeLabel')}
                value={projectType}
                onChange={setProjectType}
                options={TYPES.map((type) => ({
                  value: type,
                  icon: kindMeta(type).icon,
                  tone: kindMeta(type).tone,
                  label: t(`projectForm.type${type[0].toUpperCase()}${type.slice(1)}`),
                }))}
              />
              {projectType === 'civitai' && !sourceProject && (
                <div className="mt-4 flex flex-col gap-2">
                  <Text variant="label-large" className="text-on-surface-variant">
                    {t('projectForm.civitaiMakes')}
                  </Text>
                  <ChoiceTiles<CivitaiMediaType>
                    size="compact"
                    value={civitaiMediaType}
                    onChange={setCivitaiMediaType}
                    options={(['image', 'video'] as const).map((mediaType) => ({
                      value: mediaType,
                      icon: mediaType === 'video' ? 'movie' : 'image',
                      label: t(mediaType === 'video' ? 'projectForm.civitaiVideos' : 'projectForm.civitaiImages'),
                      supportingText: t(mediaType === 'video' ? 'projectForm.civitaiVideosHint' : 'projectForm.civitaiImagesHint'),
                    }))}
                  />
                </div>
              )}
            </Section>
          )}

          <TextField
            ref={nameRef}
            variant="outlined"
            label={t('projectForm.nameLabel')}
            leadingIcon="description"
            value={name}
            onValueChange={setName}
            placeholder={namePlaceholder}
            required
            fullWidth
          />
          <TextField
            variant="outlined"
            label={t('projectForm.descriptionLabel')}
            leadingIcon="layers"
            value={description}
            onValueChange={setDescription}
            placeholder={t('projectForm.descriptionPlaceholder')}
            maxLength={2000}
            multiline
            rows={4}
            maxRows={10}
            supportingText={t('projectForm.descriptionHelp')}
            fullWidth
          />

          <Section
            variant="tonal"
            icon={<span className="material-symbols-outlined">tag</span>}
            title={t('projectForm.identityTitle')}
            description={t('projectForm.identityDescription')}
          >
            <div className="flex flex-col gap-4">
              <TextField
                variant="outlined"
                label={t('projectForm.prefixLabel')}
                value={prefix}
                onValueChange={setPrefix}
                placeholder={t('projectForm.prefixPlaceholder')}
                supportingText={prefixHelp}
                fullWidth
              />
              {isNew && (
                <TextField
                  variant="outlined"
                  label={t('projectForm.customIdLabel')}
                  leadingIcon="terminal"
                  value={customId}
                  onValueChange={(v) => setCustomId(v.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder={t('projectForm.customIdPlaceholder')}
                  supportingText={t('projectForm.customIdDescription')}
                  inputClassName="font-mono"
                  fullWidth
                />
              )}
            </div>
          </Section>
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, FileText, Hash, ImageIcon, Layers, Loader2, Play, Save, Terminal, Type, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { createProject, fetchProject, fetchProjectWorkflow, updateProject } from '../api';
import type { Project, ProjectType, WorkflowItem } from '../types';
import { cn } from '../lib/utils';

const typeOptions: Array<{ type: ProjectType; icon: typeof ImageIcon }> = [
  { type: 'image', icon: ImageIcon },
  { type: 'text', icon: Type },
  { type: 'video', icon: Video },
  { type: 'audio', icon: AudioLines },
];

function getTypeClasses(type: ProjectType, selected: boolean) {
  const color = type === 'text' ? 'blue' : type === 'video' ? 'purple' : type === 'audio' ? 'cyan' : 'green';
  if (!selected) {
    return 'border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-neutral-900/50 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-neutral-900';
  }
  if (color === 'blue') return 'border-blue-500/60 bg-blue-500/10 text-blue-600 dark:text-blue-300 shadow-blue-500/10';
  if (color === 'purple') return 'border-purple-500/60 bg-purple-500/10 text-purple-600 dark:text-purple-300 shadow-purple-500/10';
  if (color === 'cyan') return 'border-cyan-500/60 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 shadow-cyan-500/10';
  return 'border-green-500/60 bg-green-500/10 text-green-600 dark:text-green-300 shadow-green-500/10';
}

/**
 * 16px on a phone: Safari zooms the whole page in on a focused field whose text
 * is any smaller, and the dialog never zooms back out.
 */
const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base sm:text-sm text-neutral-900 shadow-sm transition-all placeholder:text-neutral-400 focus:border-green-500/60 focus:outline-none focus:ring-4 focus:ring-green-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600';

const labelClass = 'flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400';

/** What the dialog hands back once the project is written. */
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
  /** Seed a new project from this one — its settings and workflow travel across. */
  copyFromId?: string;
  onClose: () => void;
  onSaved: (saved: SavedProject) => void;
}

/**
 * Creates, duplicates and edits a project. A dialog rather than a page: editing
 * is raised from the project it belongs to, and creating from the list it lands
 * in, so neither has to leave what the user was looking at. Full screen on a
 * phone, a centred dialog once there is room.
 */
export function ProjectFormDialog({ projectId, copyFromId, onClose, onSaved }: ProjectFormDialogProps) {
  const { t } = useTranslation();
  const isNew = !projectId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customId, setCustomId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('image');
  const [workflowToCopy, setWorkflowToCopy] = useState<WorkflowItem[]>([]);
  const [sourceProject, setSourceProject] = useState<Partial<Project> | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectId || copyFromId));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

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
          toast.error(t('projectForm.loadFailed'));
          onClose();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (projectId || copyFromId) void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, copyFromId]);

  /**
   * Focus the name field where a keyboard is already there. On a phone it would
   * only raise the on-screen keyboard over the form the user came to read.
   */
  useEffect(() => {
    if (isLoading) return;
    if (!window.matchMedia('(min-width: 640px)').matches) return;
    nameInputRef.current?.focus();
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          }),
        });
      } else {
        targetId = projectId!;
        await updateProject(targetId, { name: trimmedName, description: trimmedDescription, prefix: trimmedPrefix });
      }

      onSaved({ id: targetId, name: trimmedName, description: trimmedDescription, prefix: trimmedPrefix, isNew });
    } catch (error) {
      console.error('Failed to save project:', error);
      toast.error(t('projectForm.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const TypeIcon = typeOptions.find((option) => option.type === projectType)?.icon || ImageIcon;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm animate-in fade-in duration-300 sm:p-6"
      onClick={() => !isSubmitting && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-form-title"
        onSubmit={handleSubmit}
        className="flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden border-0 border-neutral-200/50 bg-white shadow-2xl animate-in zoom-in-95 duration-300 dark:border-white/5 dark:bg-neutral-900 sm:h-auto sm:max-h-[90dvh] sm:rounded-card sm:border"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200/50 p-5 dark:border-white/5 sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex-shrink-0 rounded-xl border border-green-500/20 bg-green-500/10 p-2.5 text-green-500">
              <TypeIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="project-form-title" className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                {isNew ? t('projectForm.newTitle') : t('projectForm.editTitle')}
              </h3>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {t('projectForm.description')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label={t('projectForm.cancel')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — the one scroller in the dialog, so nothing nests inside it. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {isNew && (
                <section className="space-y-3">
                  <label className={labelClass}>{t('projectForm.typeLabel')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {typeOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = projectType === option.type;
                      return (
                        <button
                          key={option.type}
                          type="button"
                          onClick={() => setProjectType(option.type)}
                          className={`flex min-h-20 flex-col items-start justify-between gap-3 rounded-lg border p-3.5 text-left shadow-sm transition-all sm:min-h-24 sm:p-4 ${getTypeClasses(option.type, selected)}`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-black uppercase tracking-wider sm:text-sm">
                            {t(`projectForm.type${option.type[0].toUpperCase()}${option.type.slice(1)}`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <label htmlFor="project-form-name" className={labelClass}>
                  <FileText className="h-3.5 w-3.5" />
                  {t('projectForm.nameLabel')}
                </label>
                <input
                  id="project-form-name"
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    projectType === 'text'
                      ? t('projectForm.namePlaceholderText')
                      : projectType === 'audio'
                        ? t('projectForm.namePlaceholderAudio')
                        : t('projectForm.namePlaceholderImage')
                  }
                  className={cn(inputClass, 'font-semibold')}
                  required
                />
              </section>

              <section className="space-y-2">
                <label htmlFor="project-form-description" className={labelClass}>
                  <Layers className="h-3.5 w-3.5" />
                  {t('projectForm.descriptionLabel')}
                </label>
                <textarea
                  id="project-form-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('projectForm.descriptionPlaceholder')}
                  maxLength={2000}
                  rows={4}
                  className={cn(inputClass, 'resize-y leading-6')}
                />
                <div className="flex justify-between gap-3 text-[11px] font-medium text-neutral-500 dark:text-neutral-500">
                  <span>{t('projectForm.descriptionHelp')}</span>
                  <span className="flex-shrink-0">{description.length}/2000</span>
                </div>
              </section>

              <section className="space-y-5 rounded-lg border border-neutral-200/70 bg-neutral-50/70 p-4 dark:border-white/10 dark:bg-neutral-950/40 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-neutral-100 p-2 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-neutral-950 dark:text-white">{t('projectForm.identityTitle')}</h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">{t('projectForm.identityDescription')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="project-form-prefix" className={labelClass}>{t('projectForm.prefixLabel')}</label>
                  <input
                    id="project-form-prefix"
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder={t('projectForm.prefixPlaceholder')}
                    className={cn(inputClass, 'font-semibold')}
                  />
                  <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-500">
                    {projectType === 'text'
                      ? t('projectForm.prefixDescriptionText')
                      : projectType === 'audio'
                        ? t('projectForm.prefixDescriptionAudio')
                        : t('projectForm.prefixDescriptionImage')}
                  </p>
                </div>

                {isNew && (
                  <div className="space-y-2">
                    <label htmlFor="project-form-id" className={labelClass}>{t('projectForm.customIdLabel')}</label>
                    <div className="relative">
                      <Terminal className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        id="project-form-id"
                        type="text"
                        value={customId}
                        onChange={(e) => setCustomId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        placeholder={t('projectForm.customIdPlaceholder')}
                        className={cn(inputClass, 'pl-10 font-mono')}
                      />
                    </div>
                    <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-500">{t('projectForm.customIdDescription')}</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Footer — stacked and full-width on a phone, side by side once there is room. */}
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-200/50 bg-neutral-50 px-5 py-4 dark:border-white/5 dark:bg-black/20 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full rounded-xl border border-neutral-200/80 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-800/80 dark:text-neutral-400 dark:hover:text-white sm:w-auto"
          >
            {t('projectForm.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isLoading || !name.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-green-600/20 transition-all hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isNew ? (
              <Play className="h-4 w-4 fill-current" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isNew ? t('projectForm.submitCreate') : t('projectForm.submitSave')}
          </button>
        </div>
      </form>
    </div>
  );
}

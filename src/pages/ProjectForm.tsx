import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AudioLines, FileText, Hash, ImageIcon, Layers, Play, Save, Terminal, Type, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createProject, updateProject, fetchProject } from '../api';
import type { Project, ProjectType, WorkflowItem } from '../types';
import { PageHeader } from '../components/PageHeader';

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

export function ProjectForm() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isNew = !id;
  const copyFrom = location.state?.copyFrom;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('image');
  const [workflowToCopy, setWorkflowToCopy] = useState<WorkflowItem[]>([]);
  const [sourceProject, setSourceProject] = useState<Partial<Project> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProject(id).then(proj => {
        setName(proj.name);
        setDescription(proj.description || '');
        setProjectId(proj.id);
        setPrefix(proj.prefix || '');
        setProjectType(proj.type || 'image');
      }).catch(() => navigate('/projects'));
    } else if (copyFrom) {
      fetchProject(copyFrom).then(proj => {
        setName(proj.name);
        setDescription(proj.description || '');
        setPrefix(proj.prefix || '');
        setProjectType(proj.type || 'image');
        const copiedWorkflow = (proj.workflow || []).map(item => ({
          ...item,
          id: crypto.randomUUID()
        }));
        setWorkflowToCopy(copiedWorkflow);
        setSourceProject(proj);
      }).catch(err => console.error('Failed to fetch source project:', err));
    }
  }, [id, copyFrom, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      let targetId: string;
      const trimmedDescription = description.trim();

      if (isNew) {
        targetId = projectId.trim().replace(/[^a-zA-Z0-9-_]/g, '_') || `project-${Date.now()}`;
        await createProject({
          id: targetId,
          name: name.trim(),
          description: trimmedDescription || undefined,
          type: projectType,
          createdAt: Date.now(),
          workflow: workflowToCopy,
          jobs: [],
          album: [],
          shuffle: sourceProject?.shuffle ?? false,
          prefix: prefix.trim(),
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
        targetId = id!;
        await updateProject(targetId, { name: name.trim(), description: trimmedDescription, prefix: prefix.trim() });
      }
      navigate(`/project/${targetId}`);
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={isNew ? t('projectForm.newTitle') : t('projectForm.editTitle')}
          description={t('projectForm.description')}
          backLink={{ label: t('projectForm.cancel'), onClick: () => navigate(-1) }}
        />

        <form onSubmit={handleSubmit} className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6 rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55 md:p-6">
            {isNew && (
              <section className="space-y-3">
                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{t('projectForm.typeLabel')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {typeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = projectType === option.type;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => setProjectType(option.type)}
                        className={`flex min-h-24 flex-col items-start justify-between rounded-lg border p-4 text-left shadow-sm transition-all ${getTypeClasses(option.type, selected)}`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-sm font-black uppercase tracking-wider">{t(`projectForm.type${option.type[0].toUpperCase()}${option.type.slice(1)}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                  <FileText className="h-3.5 w-3.5" />
                  {t('projectForm.nameLabel')}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    projectType === 'text'
                      ? t('projectForm.namePlaceholderText')
                      : projectType === 'audio'
                        ? t('projectForm.namePlaceholderAudio')
                        : t('projectForm.namePlaceholderImage')
                  }
                  className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base font-semibold text-neutral-950 shadow-sm transition-all placeholder:text-neutral-400 focus:border-green-500/60 focus:outline-none focus:ring-4 focus:ring-green-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                  <Layers className="h-3.5 w-3.5" />
                  {t('projectForm.descriptionLabel', { defaultValue: 'Description' })}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('projectForm.descriptionPlaceholder', { defaultValue: 'Explain what this project does, what it generates, or how it should be used.' })}
                  maxLength={2000}
                  rows={6}
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 shadow-sm transition-all placeholder:text-neutral-400 focus:border-green-500/60 focus:outline-none focus:ring-4 focus:ring-green-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600"
                />
                <div className="flex justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-500">
                  <span>{t('projectForm.descriptionHelp', { defaultValue: 'Optional. Shown on cards, profile, and MCP tools.' })}</span>
                  <span>{description.length}/2000</span>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-lg bg-neutral-100 p-2 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  <Hash className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-neutral-950 dark:text-white">{t('projectForm.identityTitle', { defaultValue: 'Identity' })}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500">{t('projectForm.identityDescription', { defaultValue: 'Naming and file output settings.' })}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{t('projectForm.prefixLabel')}</label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder={t('projectForm.prefixPlaceholder')}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm transition-all placeholder:text-neutral-400 focus:border-green-500/60 focus:outline-none focus:ring-4 focus:ring-green-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600"
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
                    <label className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{t('projectForm.customIdLabel')}</label>
                    <div className="relative">
                      <Terminal className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        placeholder={t('projectForm.customIdPlaceholder')}
                        className="w-full rounded-lg border border-neutral-200 bg-white py-3 pl-10 pr-4 font-mono text-sm text-neutral-700 shadow-sm transition-all placeholder:text-neutral-400 focus:border-green-500/60 focus:outline-none focus:ring-4 focus:ring-green-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300 dark:placeholder:text-neutral-600"
                      />
                    </div>
                    <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-500">{t('projectForm.customIdDescription')}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {t('projectForm.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-green-600/15 transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-40"
              >
                {isNew ? <Play className="h-4 w-4 fill-current" /> : <Save className="h-4 w-4" />}
                {isNew ? t('projectForm.submitCreate') : t('projectForm.submitSave')}
              </button>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}

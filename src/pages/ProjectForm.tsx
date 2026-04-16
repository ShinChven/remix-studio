import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layers, Terminal, Play, ImageIcon, Type, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createProject, updateProject, fetchProject } from '../api';
import type { Project, ProjectType, WorkflowItem } from '../types';

export function ProjectForm() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isNew = !id;
  const copyFrom = location.state?.copyFrom;

  const [name, setName] = useState('');
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
        setProjectId(proj.id);
        setPrefix(proj.prefix || '');
        setProjectType(proj.type || 'image');
      }).catch(() => navigate('/projects'));
    } else if (copyFrom) {
      fetchProject(copyFrom).then(proj => {
        setName(proj.name);
        setPrefix(proj.prefix || '');
        setProjectType(proj.type || 'image');
        // Generate new IDs for workflow items when copying
        const copiedWorkflow = (proj.workflow || []).map(item => ({
          ...item,
          id: crypto.randomUUID()
        }));
        setWorkflowToCopy(copiedWorkflow);
        // Preserve model choices and generation settings
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

      if (isNew) {
        targetId = projectId.trim().replace(/[^a-zA-Z0-9-_]/g, '_') || `project-${Date.now()}`;
        await createProject({
          id: targetId,
          name: name.trim(),
          type: projectType,
          createdAt: Date.now(),
          workflow: workflowToCopy,
          jobs: [],
          album: [],
          shuffle: sourceProject?.shuffle ?? false,
          prefix: prefix.trim(),
          // Copy model choices and generation settings from source project
          ...(sourceProject && {
            providerId: sourceProject.providerId,
            modelConfigId: sourceProject.modelConfigId,
            aspectRatio: sourceProject.aspectRatio,
            quality: sourceProject.quality,
            background: sourceProject.background,
            format: sourceProject.format,
            // Text generation settings
            systemPrompt: sourceProject.systemPrompt,
            temperature: sourceProject.temperature,
            maxTokens: sourceProject.maxTokens,
            // Video generation settings
            duration: sourceProject.duration,
            resolution: sourceProject.resolution,
            sound: sourceProject.sound,
            steps: sourceProject.steps,
            guidance: sourceProject.guidance,
          }),
        });
      } else {
        targetId = id!;
        await updateProject(targetId, { name: name.trim(), prefix: prefix.trim() });
      }
      navigate(`/project/${targetId}`);
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-md bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 mb-8">
          <div className={`p-3 rounded-2xl ${projectType === 'text' ? 'bg-blue-600/10' : projectType === 'video' ? 'bg-purple-600/10' : 'bg-green-600/10'}`}>
            <Layers className={`w-6 h-6 ${projectType === 'text' ? 'text-blue-500' : projectType === 'video' ? 'text-purple-500' : 'text-green-500'}`} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
              {isNew ? t('projectForm.newTitle') : t('projectForm.editTitle')}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">{t('projectForm.description')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isNew && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">{t('projectForm.typeLabel')}</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setProjectType('image')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    projectType === 'image'
                      ? 'border-green-500 bg-green-500/10 text-green-400'
                      : 'border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl shadow-sm text-neutral-500 dark:text-neutral-500 hover:border-neutral-700'
                  }`}
                >
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-xs font-bold uppercase tracking-wider">{t('projectForm.typeImage')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectType('text')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    projectType === 'text'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl shadow-sm text-neutral-500 dark:text-neutral-500 hover:border-neutral-700'
                  }`}
                >
                  <Type className="w-6 h-6" />
                  <span className="text-xs font-bold uppercase tracking-wider">{t('projectForm.typeText')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectType('video')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    projectType === 'video'
                      ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                      : 'border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl shadow-sm text-neutral-500 dark:text-neutral-500 hover:border-neutral-700'
                  }`}
                >
                  <Video className="w-6 h-6" />
                  <span className="text-xs font-bold uppercase tracking-wider">{t('projectForm.typeVideo')}</span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">{t('projectForm.nameLabel')}</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={projectType === 'text' ? t('projectForm.namePlaceholderText') : t('projectForm.namePlaceholderImage')}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500/50 transition-all placeholder:text-neutral-700"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">{t('projectForm.prefixLabel')}</label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={t('projectForm.prefixPlaceholder')}
              className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500/50 transition-all placeholder:text-neutral-700"
            />
            <p className="text-[10px] text-neutral-600 ml-1 font-medium tracking-wide">{projectType === 'text' ? t('projectForm.prefixDescriptionText') : t('projectForm.prefixDescriptionImage')}</p>
          </div>

          {isNew && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">{t('projectForm.customIdLabel')}</label>
              <div className="relative">
                <Terminal className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-700" />
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder={t('projectForm.customIdPlaceholder')}
                  className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 font-mono focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500/50 transition-all placeholder:text-neutral-800"
                />
              </div>
              <p className="text-[10px] text-neutral-600 ml-1 font-medium tracking-wide">{t('projectForm.customIdDescription')}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
            >
              {t('projectForm.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-neutral-900 dark:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-green-500/20 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              {isNew ? t('projectForm.submitCreate') : t('projectForm.submitSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

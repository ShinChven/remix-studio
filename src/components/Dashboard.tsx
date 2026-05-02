import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Project } from '../types';
import { Plus, LayoutGrid, Clock, Loader2, Sparkles } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { fetchProjects, fetchLibraries, fetchAssistantProviders } from '../api';
import { Provider } from '../types';
import type { BoundContext, AttachedImage } from './Assistant/AssistantComposer';
import { LibraryCard, ProjectCard } from './EntityCards';
import {
  filterEnabledAssistantProviders,
  normalizeAssistantProviderSelection,
} from '../lib/assistant-provider-settings';
import { AssistantHero } from './Assistant/AssistantHero';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // AI Chat State
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => localStorage.getItem('assistant_last_provider') || '');
  const [selectedModelId, setSelectedModelId] = useState<string>(() => localStorage.getItem('assistant_last_model') || '');

  useEffect(() => {
    if (selectedProviderId) localStorage.setItem('assistant_last_provider', selectedProviderId);
  }, [selectedProviderId]);

  useEffect(() => {
    if (selectedModelId) localStorage.setItem('assistant_last_model', selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const [projRes, libRes, provRes] = await Promise.all([
          fetchProjects(1, 8, undefined, 'active'),
          fetchLibraries(1, 8),
          fetchAssistantProviders(),
        ]);
        if (mounted) {
          const enabledProviders = filterEnabledAssistantProviders(provRes.providers);
          setProjects(projRes.items);
          setLibraries(libRes.items);
          setProviders(enabledProviders);

          const normalizedSelection = normalizeAssistantProviderSelection(
            enabledProviders,
            selectedProviderId,
            selectedModelId,
          );
          setSelectedProviderId(normalizedSelection.providerId);
          setSelectedModelId(normalizedSelection.modelId);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const addProject = () => navigate('/project/new');
  const addLibrary = () => navigate('/library/new');

  const handleStartProjectChat = (project: Project) => {
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: {
        draftBoundContexts: [{
          id: project.id,
          name: project.name,
          type: 'project',
          subType: project.type || 'image',
        } satisfies BoundContext],
      },
    });
  };

  const handleStartLibraryChat = (library: Library) => {
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: {
        draftBoundContexts: [{
          id: library.id,
          name: library.name,
          type: 'library',
          subType: library.type || 'text',
        } satisfies BoundContext],
      },
    });
  };

  const handleStartChat = (text: string, contexts: BoundContext[], images: AttachedImage[]) => {
    const trimmedText = text.trim();
    if (!trimmedText && contexts.length === 0 && images.length === 0) return;
    
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', { 
      state: { 
        initialMessage: trimmedText,
        providerId: selectedProviderId,
        modelId: selectedModelId,
        boundContexts: contexts,
        attachedImages: images,
      } 
    });
  };

  // Key handler removed - handled by AssistantComposer

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        {!isLoading && providers.length === 0 && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="relative overflow-hidden rounded-card border border-indigo-500/20 bg-indigo-500/5 p-6 md:p-8 backdrop-blur-3xl dark:border-indigo-500/30 dark:bg-indigo-500/10">
              {/* Decorative elements */}
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-indigo-500/5 blur-3xl" />
              <Sparkles className="absolute -right-4 top-4 h-16 w-16 text-indigo-500/10 group-hover:rotate-12 transition-transform duration-500" />
              
              <div className="relative flex flex-col items-center gap-6 md:flex-row">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-xl shadow-indigo-600/20">
                  <Sparkles className="h-8 w-8" />
                </div>
                
                <div className="flex-1 space-y-2 text-center md:text-left">
                  <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                    {t('dashboard.setupNoticeTitle')}
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t('dashboard.setupNoticeDescription')}
                  </p>
                </div>
                
                <button
                  onClick={() => navigate('/provider/new')}
                  className="group flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30 active:scale-95"
                >
                  {t('dashboard.setupNoticeButton')}
                  <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Unified Hero Section - Matrix Style */}
        <section className="flex flex-col items-center justify-center py-8 md:py-16">
          <AssistantHero
            selectedProviderId={selectedProviderId}
            setSelectedProviderId={setSelectedProviderId}
            selectedModelId={selectedModelId}
            setSelectedModelId={setSelectedModelId}
            providers={providers}
            isSending={false}
            onSend={handleStartChat}
            placeholder={t('assistant.typePlaceholder', 'Type a message...')}
          />
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-neutral-500 dark:text-neutral-500 animate-spin" />
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg md:text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-green-500" />
                  {t('dashboard.recentProjects')}
                </h3>
                <button
                  onClick={addProject}
                  className="p-2.5 bg-green-600 text-white hover:bg-green-700 rounded-xl transition-all flex items-center justify-center border border-green-700 shadow-lg shadow-green-600/10 active:scale-95"
                  title={t('dashboard.newProject')}
                  aria-label={t('dashboard.newProject')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onStartAssistantChat={handleStartProjectChat}
                    onDuplicate={(item) => navigate('/project/new', { state: { copyFrom: item.id } })}
                  />
                ))}
                {projects.length === 0 && (
                  <div className="col-span-full p-8 border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 border-dashed rounded-xl text-center text-neutral-500 dark:text-neutral-500 backdrop-blur-3xl shadow-sm">
                    {t('dashboard.noProjects')}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg md:text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-blue-500" />
                  {t('dashboard.libraries')}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={addLibrary}
                    className="p-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-all flex items-center justify-center border border-blue-700 shadow-lg shadow-blue-600/10 active:scale-95"
                    title={t('dashboard.newLibrary')}
                    aria-label={t('dashboard.newLibrary')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {libraries.map(lib => (
                  <LibraryCard
                    key={lib.id}
                    library={lib}
                    onStartAssistantChat={handleStartLibraryChat}
                  />
                ))}
                {libraries.length === 0 && (
                  <div className="col-span-full p-8 border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 border-dashed rounded-xl text-center text-neutral-500 dark:text-neutral-500 backdrop-blur-3xl shadow-sm">
                    {t('dashboard.noLibraries')}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Project } from '../types';
import { Plus, LayoutGrid, Clock, Loader2, Sparkles, Megaphone } from 'lucide-react';
import { fetchProjects, fetchLibraries, fetchAssistantProviders, deleteProject, fetchCampaigns } from '../api';
import { Provider } from '../types';
import type { BoundContext, AttachedImage } from './Assistant/AssistantComposer';
import { LibraryCard, ProjectCard } from './EntityCards';
import {
  filterEnabledAssistantProviders,
  normalizeAssistantProviderSelection,
} from '../lib/assistant-provider-settings';
import { AssistantHero } from './Assistant/AssistantHero';

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
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
        const [projRes, libRes, provRes, campRes] = await Promise.all([
          fetchProjects(1, 8, undefined, 'active'),
          fetchLibraries(1, 8),
          fetchAssistantProviders(),
          fetchCampaigns().catch(() => []), // Fallback to empty if fails
        ]);
        if (mounted) {
          const enabledProviders = filterEnabledAssistantProviders(provRes.providers);
          setProjects(projRes.items);
          setLibraries(libRes.items);
          setProviders(enabledProviders);
          setCampaigns(Array.isArray(campRes) ? campRes.slice(0, 8) : []);

          const normalizedSelection = normalizeAssistantProviderSelection(
            enabledProviders,
            selectedProviderId,
            selectedModelId,
          );
          setSelectedProviderId(normalizedSelection.providerId);
          setSelectedModelId(normalizedSelection.modelId);
        }
      } catch (err) {
        console.error('Failed to load home data:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);
  
  const loadProjects = async () => {
    try {
      const projRes = await fetchProjects(1, 8, undefined, 'active');
      setProjects(projRes.items);
    } catch (err) {
      console.error('Failed to reload projects:', err);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(t('projects.deleteConfirmation', { name: project.name }))) return;
    try {
      await deleteProject(project.id);
      await loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

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
        <section className="flex flex-col items-center justify-center py-10 md:py-24">
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
              <div className="flex overflow-x-auto gap-6 pb-6 pt-4 -mx-4 px-4 scrollbar-hide">
                {projects.map(project => (
                  <div key={project.id} className="min-w-[300px] sm:min-w-[320px] flex-shrink-0">
                    <ProjectCard
                      project={project}
                      onStartAssistantChat={handleStartProjectChat}
                      onDuplicate={(item) => navigate('/project/new', { state: { copyFrom: item.id } })}
                      onDelete={handleDeleteProject}
                    />
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="flex-1 p-8 border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 border-dashed rounded-xl text-center text-neutral-500 dark:text-neutral-500 backdrop-blur-3xl shadow-sm">
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
              <div className="flex overflow-x-auto gap-6 pb-6 pt-4 -mx-4 px-4 scrollbar-hide">
                {libraries.map(lib => (
                  <div key={lib.id} className="min-w-[300px] sm:min-w-[320px] flex-shrink-0">
                    <LibraryCard
                      library={lib}
                      onStartAssistantChat={handleStartLibraryChat}
                    />
                  </div>
                ))}
                {libraries.length === 0 && (
                  <div className="flex-1 p-8 border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 border-dashed rounded-xl text-center text-neutral-500 dark:text-neutral-500 backdrop-blur-3xl shadow-sm">
                    {t('dashboard.noLibraries')}
                  </div>
                )}
              </div>
            </section>

<section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg md:text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-indigo-500" />
                  {t('sidebar.campaigns', 'Campaigns')}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate('/campaigns/new')}
                    className="p-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all flex items-center justify-center border border-indigo-700 shadow-lg shadow-indigo-600/10 active:scale-95"
                    title={t('campaigns.new', 'New Campaign')}
                    aria-label={t('campaigns.new', 'New Campaign')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex overflow-x-auto gap-6 pb-6 pt-4 -mx-4 px-4 scrollbar-hide">
                {campaigns.map(campaign => {
                  let thumbnail = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(campaign.id)}&backgroundColor=0f172a,1e293b,334155&shape1Color=6366f1,818cf8,4f46e5`;
                  const postWithMedia = (campaign.posts || []).find((p: any) => p.media && p.media.length > 0);
                  if (postWithMedia) {
                    thumbnail = postWithMedia.media[0].thumbnailUrl || postWithMedia.media[0].url || thumbnail;
                  }
                  return (
                    <div
                      key={campaign.id}
                      className="min-w-[300px] sm:min-w-[320px] flex-shrink-0 group relative flex flex-col justify-end cursor-pointer overflow-hidden rounded-[20px] h-[280px] shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-white/5 bg-neutral-900"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    >
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                        style={{ backgroundImage: `url(${thumbnail})` }}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none transition-opacity duration-300 backdrop-blur-md bg-gradient-to-t from-black/80 via-black/30 to-transparent"
                        style={{
                          maskImage: 'linear-gradient(to top, black 20%, transparent 100%)',
                          WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent 100%)'
                        }}
                      />
                      <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end z-10 text-white">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-white/60 mb-1 flex items-center gap-2">
                          {campaign.status === 'active' ? 'Active' : 'Paused'}
                        </div>
                        <h4 className="text-xl md:text-2xl font-medium leading-tight mb-1.5 truncate text-white/95">
                          {campaign.name}
                        </h4>
                        <p className="text-sm text-white/60 line-clamp-2 mb-4 leading-relaxed font-normal">
                          {campaign.description || 'Campaign'}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {campaigns.length === 0 && (
                  <div className="flex-1 p-8 border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 border-dashed rounded-xl text-center text-neutral-500 dark:text-neutral-500 backdrop-blur-3xl shadow-sm">
                    {t('campaigns.noCampaigns', 'No campaigns yet.')}
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

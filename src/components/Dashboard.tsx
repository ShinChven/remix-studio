import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Project } from '../types';
import { Plus, Play, Folder, LayoutGrid, Clock, Loader2, Copy, MessageCircle, Send, Bot, Sparkles } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { fetchProjects, fetchLibraries, fetchAssistantProviders } from '../api';
import { Provider } from '../types';
import { AssistantComposer, BoundContext, AttachedImage } from './Assistant/AssistantComposer';
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
  const [inputText, setInputText] = useState('');
  const [boundContexts, setBoundContexts] = useState<BoundContext[]>([]);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

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
          fetchProjects(1, 6),
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

  const handleStartChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text && boundContexts.length === 0 && attachedImages.length === 0) return;
    
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', { 
      state: { 
        initialMessage: text,
        providerId: selectedProviderId,
        modelId: selectedModelId,
        boundContexts: boundContexts,
        attachedImages: attachedImages,
      } 
    });
  };

  // Key handler removed - handled by AssistantComposer

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        {/* Unified Hero Section - Matrix Style */}
        <section className="flex flex-col items-center justify-center py-8 md:py-16">
          <AssistantHero
            inputText={inputText}
            setInputText={setInputText}
            selectedProviderId={selectedProviderId}
            setSelectedProviderId={setSelectedProviderId}
            selectedModelId={selectedModelId}
            setSelectedModelId={setSelectedModelId}
            boundContexts={boundContexts}
            setBoundContexts={setBoundContexts}
            attachedImages={attachedImages}
            setAttachedImages={setAttachedImages}
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
                <button onClick={addProject} className="text-xs md:text-sm bg-green-600 text-white hover:bg-green-700 px-5 md:px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 border border-green-700 font-black uppercase tracking-widest shadow-lg shadow-green-600/10 active:scale-95">
                  <Plus className="w-4 h-4" /> <span>{t('dashboard.newProject')}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(project => (
                  <Link
                    key={project.id}
                    to={`/project/${project.id}`}
                    className="bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl hover:border-green-500/50 p-6 rounded-xl text-left transition-all group shadow-sm hover:shadow-xl hover:-translate-y-1 duration-300 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-2 bg-green-500/10 rounded-lg text-green-500 group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/project/new', { state: { copyFrom: project.id } });
                          }}
                          className="p-1.5 text-neutral-500 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
                          title={t('projectViewer.main.duplicateProject')}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs text-neutral-500 dark:text-neutral-500 font-mono truncate max-w-[120px]">{project.id}</span>
                      </div>
                    </div>
                    <h4 className="font-medium text-neutral-900 dark:text-white truncate">{project.name}</h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      {t('dashboard.projectStats', { 
                        jobCount: (project.jobCount ?? project.jobs?.length) || 0,
                        imageCount: (project.albumCount ?? project.album?.length) || 0,
                        date: new Date(project.createdAt).toLocaleDateString()
                      })}
                    </p>
                  </Link>
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
                  <button onClick={addLibrary} className="text-xs md:text-sm bg-blue-600 text-white hover:bg-blue-700 px-5 md:px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 border border-blue-700 font-black uppercase tracking-widest shadow-lg shadow-blue-600/10 active:scale-95">
                    <Plus className="w-4 h-4" /> <span>{t('dashboard.newLibrary')}</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {libraries.map(lib => (
                  <Link
                    key={lib.id}
                    to={`/library/${lib.id}`}
                    className="bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl hover:border-blue-500/50 p-6 rounded-xl text-left transition-all group shadow-sm hover:shadow-xl hover:-translate-y-1 duration-300"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 group-hover:scale-110 transition-transform">
                        <Folder className="w-5 h-5" />
                      </div>
                      <h4 className="font-medium text-neutral-900 dark:text-white truncate flex-1">{lib.name}</h4>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">{lib.itemCount ?? lib.items?.length ?? 0} items</p>
                  </Link>
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

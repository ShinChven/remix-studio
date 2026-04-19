import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Project } from '../types';
import { Plus, Play, Folder, LayoutGrid, Clock, Loader2, Copy, MessageCircle, Send, Bot, Sparkles } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { fetchProjects, fetchLibraries, fetchAssistantProviders } from '../api';
import { getTextModelsForProvider, Provider } from '../types';

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
          setProjects(projRes.items);
          setLibraries(libRes.items);
          setProviders(provRes.providers);
          
          // Set default provider/model if none selected
          if (!selectedProviderId && provRes.providers.length > 0) {
            const firstWithModels = provRes.providers.find(p => getTextModelsForProvider(p.type).length > 0);
            if (firstWithModels) {
              const models = getTextModelsForProvider(firstWithModels.type);
              setSelectedProviderId(firstWithModels.id);
              if (models.length > 0) setSelectedModelId(models[0].id);
            }
          }
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
    if (!text) return;
    
    navigate('/assistant', { 
      state: { 
        initialMessage: text,
        providerId: selectedProviderId,
        modelId: selectedModelId
      } 
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartChat();
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <PageHeader
          title={t('dashboard.welcome')}
          description={t('dashboard.description')}
        />

        {/* AI Chat Hero Section */}
        <section className="flex flex-col items-center justify-center py-4 md:py-8">
          <div className="w-full max-w-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('dashboard.aiChat')}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
                {t('dashboard.aiChatDescription')}
              </h2>
            </div>

            <div className="relative group">
              {/* Glassmorphic Container with depth */}
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-1000 group-focus-within:duration-200"></div>
              
              <div className="relative bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl border border-neutral-200/50 dark:border-white/10 rounded-2xl shadow-2xl p-4 transition-all duration-300 group-focus-within:shadow-indigo-500/10">
                <div className="space-y-4">
                  {/* Model Selector */}
                  <div className="flex items-center gap-2 px-1">
                    <Bot className="w-4 h-4 text-indigo-500" />
                    <select
                      value={selectedProviderId && selectedModelId ? `${selectedProviderId}::${selectedModelId}` : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setSelectedProviderId('');
                          setSelectedModelId('');
                          return;
                        }
                        const [pId, mId] = val.split('::');
                        setSelectedProviderId(pId);
                        setSelectedModelId(mId);
                      }}
                      className="text-xs bg-transparent border-none text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 outline-none cursor-pointer p-0 appearance-none font-medium transition-colors"
                    >
                      <option value="">{t('assistant.selectModel', 'Select a model')}</option>
                      {providers.map((p) => {
                        const models = getTextModelsForProvider(p.type);
                        if (models.length === 0) return null;
                        return (
                          <optgroup key={p.id} label={p.name}>
                            {models.map((m) => (
                              <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                                {m.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  {/* Input Area */}
                  <div className="flex items-end gap-3">
                    <textarea
                      value={inputText}
                      onChange={(e) => {
                        setInputText(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={t('assistant.typePlaceholder')}
                      rows={1}
                      className="flex-1 bg-transparent border-none outline-none text-base text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 resize-none py-1 min-h-[40px] max-h-[120px] custom-scrollbar"
                    />
                    <button
                      onClick={() => handleStartChat()}
                      disabled={!inputText.trim()}
                      className="flex-shrink-0 p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed group/btn"
                    >
                      <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

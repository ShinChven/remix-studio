import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Project } from '../types';
import { Activity, Plus, Play, Clock, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { fetchProjects, updateProject } from '../api';
import { PageHeader } from '../components/PageHeader';
import type { BoundContext } from '../components/Assistant/AssistantComposer';
import { ProjectCard } from '../components/EntityCards';

type StatusFilter = 'active' | 'archived' | 'all';

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === 'active' || value === 'archived' || value === 'all';
}

export function Projects() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';
  const statusParam = searchParams.get('status');
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'active';

  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const navigate = useNavigate();

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const result = await fetchProjects(page, 24, q, status);
      setProjects(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchProjects(page, 24, q, status);
        if (mounted) {
          setProjects(result.items);
          setTotal(result.total);
          setPages(result.pages);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [page, q, status]);

  const addProject = () => navigate('/project/new');

  const handlePageChange = (newPage: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', newPage.toString());
      return next;
    });
  };

  const handleStatusChange = (newStatus: StatusFilter) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (newStatus === 'active') {
        next.delete('status');
      } else {
        next.set('status', newStatus);
      }
      next.set('page', '1');
      return next;
    });
  };

  const handleToggleArchive = async (project: Project) => {
    const nextStatus = project.status === 'archived' ? 'active' : 'archived';
    setTogglingId(project.id);
    try {
      await updateProject(project.id, { status: nextStatus });
      toast.success(
        nextStatus === 'archived'
          ? t('projects.archivedToast', { name: project.name })
          : t('projects.unarchivedToast', { name: project.name })
      );
      await loadProjects();
    } catch (e) {
      console.error(e);
      toast.error(t('projects.archiveFailed'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleStartAssistantChat = (project: Project) => {
    const projectContext: BoundContext = {
      id: project.id,
      name: project.name,
      type: 'project',
      subType: project.type || 'image',
    };

    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: {
        draftBoundContexts: [projectContext],
      },
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (searchInput) {
          next.set('q', searchInput);
        } else {
          next.delete('q');
        }
        next.set('page', '1');
        return next;
      });
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={t('projects.title')}
          description={t('projects.description')}
          actions={
            <Link
              to="/projects/queues"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-200/50 bg-white/40 text-neutral-600 shadow-sm backdrop-blur-3xl transition-all hover:border-indigo-500/40 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-400 dark:hover:border-indigo-400/30 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              title={t('sidebar.queueMonitor')}
              aria-label={t('sidebar.queueMonitor')}
            >
              <Activity className="h-4 w-4" />
            </Link>
          }
        />

        <section>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 md:mb-8">
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-500" />
              {t(`projects.statusHeading.${status}`)} {total > 0 && <span className="text-sm text-neutral-500 dark:text-neutral-500 font-normal">({total})</span>}
            </h3>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Status Filter Tabs */}
              <div className="flex bg-neutral-100/30 dark:bg-black/40 border border-neutral-200/50 dark:border-white/5 rounded-xl p-1 shadow-inner backdrop-blur-md">
                {(['active', 'all', 'archived'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      status === s
                        ? 'bg-white dark:bg-neutral-800 text-green-600 dark:text-white shadow-sm border border-neutral-200 dark:border-neutral-700'
                        : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 border border-transparent'
                    }`}
                  >
                    {t(`projects.statusFilter.${s}`)}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative flex-1 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-500" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t('projects.searchPlaceholder')}
                    className="w-full bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm font-medium text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500/50 transition-all shadow-sm"
                  />
              </div>

              {/* Desktop New Project Button */}
              <button
                onClick={addProject}
                className="hidden sm:flex p-2.5 bg-green-600 text-white hover:bg-green-700 rounded-xl transition-all items-center justify-center border border-green-700 shadow-lg shadow-green-600/10 active:scale-95"
                title={t('projects.newProject')}
                aria-label={t('projects.newProject')}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isToggling={togglingId === project.id}
                    onStartAssistantChat={handleStartAssistantChat}
                    onToggleArchive={handleToggleArchive}
                    onDuplicate={(item) => navigate('/project/new', { state: { copyFrom: item.id } })}
                  />
                ))}

                {projects.length === 0 && (
                  <div className="col-span-full py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900/20 shadow-sm">
                    <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm">
                      <Play className="w-8 h-8 text-neutral-700" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-neutral-600 dark:text-neutral-400 tracking-tight">{t('projects.noProjects.title')}</p>
                      <p className="text-sm mt-1">{q ? t('projects.noResultsFound') : t('projects.noProjects.description')}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-8 pb-4">
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('projects.pagination', { current: page, total: pages })}</span>
                  <button
                    onClick={() => handlePageChange(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {/* Mobile Floating Action Button */}
      <button
        onClick={addProject}
        className="fixed bottom-8 right-8 sm:hidden w-16 h-16 bg-green-600 text-white rounded-full shadow-[0_12px_48px_rgba(22,163,74,0.4)] hover:bg-green-500 transition-all active:scale-90 flex items-center justify-center z-50 border border-green-500/20"
      >
        <Plus className="w-8 h-8" />
      </button>
    </div>
  );
}

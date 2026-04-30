import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Project, ProjectType } from '../types';
import { Plus, Play, Clock, LayoutGrid, ImageIcon, HardDrive, ChevronLeft, ChevronRight, Loader2, Type, Video, Music, Search, Copy, Archive, ArchiveRestore, Stars } from 'lucide-react';
import { fetchProjects, updateProject } from '../api';
import { PageHeader } from '../components/PageHeader';
import type { BoundContext } from '../components/Assistant/AssistantComposer';

type StatusFilter = 'active' | 'archived' | 'all';

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === 'active' || value === 'archived' || value === 'all';
}

function getProjectTypeMeta(type: ProjectType | undefined) {
  switch (type) {
    case 'text':
      return {
        icon: Type,
        iconClassName: 'bg-blue-500/10 text-blue-500 shadow-blue-500/5',
        borderClassName: 'hover:border-blue-500/50',
        accentClassName: 'text-blue-500',
        glowClassName: 'via-blue-500/20',
        assetIcon: Type,
        assetLabel: 'texts',
      };
    case 'video':
      return {
        icon: Video,
        iconClassName: 'bg-purple-500/10 text-purple-500 shadow-purple-500/5',
        borderClassName: 'hover:border-purple-500/50',
        accentClassName: 'text-purple-500/80',
        glowClassName: 'via-purple-500/20',
        assetIcon: Video,
        assetLabel: 'videos',
      };
    case 'audio':
      return {
        icon: Music,
        iconClassName: 'bg-cyan-500/10 text-cyan-500 shadow-cyan-500/5',
        borderClassName: 'hover:border-cyan-500/50',
        accentClassName: 'text-cyan-500/80',
        glowClassName: 'via-cyan-500/20',
        assetIcon: Music,
        assetLabel: 'audios',
      };
    case 'image':
    default:
      return {
        icon: ImageIcon,
        iconClassName: 'bg-green-500/10 text-green-500 shadow-green-500/5',
        borderClassName: 'hover:border-green-500/50',
        accentClassName: 'text-green-500/80',
        glowClassName: 'via-green-500/20',
        assetIcon: ImageIcon,
        assetLabel: 'images',
      };
  }
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

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={t('projects.title')}
          description={t('projects.description')}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {projects.map(project => {
                  const typeMeta = getProjectTypeMeta(project.type);
                  const ProjectIcon = typeMeta.icon;
                  const AssetIcon = typeMeta.assetIcon;
                  const isArchived = project.status === 'archived';
                  const isToggling = togglingId === project.id;

                  return (
                  <Link
                    key={project.id}
                    to={`/project/${project.id}`}
                    className={`bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl ${typeMeta.borderClassName} p-5 md:p-6 rounded-2xl text-left transition-all group relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 duration-300 ${isArchived ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-3 md:mb-4">
                      <div className={`p-2.5 md:p-3 rounded-xl group-hover:scale-110 transition-transform shadow-lg ${typeMeta.iconClassName}`}>
                        <ProjectIcon className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleStartAssistantChat(project);
                          }}
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-all"
                          title={t('projects.projectCard.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })}
                          aria-label={t('projects.projectCard.startAssistantChat', { defaultValue: 'Start assistant chat for this project' })}
                        >
                          <Stars className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isToggling) handleToggleArchive(project);
                          }}
                          disabled={isToggling}
                          className={`p-1.5 rounded-lg transition-all ${isArchived ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-500/10' : 'text-neutral-500 hover:text-amber-500 hover:bg-amber-500/10'} disabled:opacity-50`}
                          title={t(isArchived ? 'projects.unarchiveProject' : 'projects.archiveProject')}
                        >
                          {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate('/project/new', { state: { copyFrom: project.id } });
                          }}
                          className="p-1.5 text-neutral-500 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
                          title={t('projectViewer.main.duplicateProject')}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-base md:text-lg font-semibold text-neutral-900 dark:text-white truncate">{project.name}</h4>
                      {isArchived && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none shrink-0">
                          <Archive className="w-2.5 h-2.5" />
                          {t('projects.archivedBadge')}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-sm text-neutral-500 dark:text-neutral-500 mb-4">
                      <div className="flex items-center gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="font-bold">{t('projects.projectCard.jobs', { count: (project.jobCount ?? project.jobs?.length) || 0 })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <AssetIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="font-bold">{t(`projects.projectCard.assets.${typeMeta.assetLabel}`, { count: (project.albumCount ?? project.album?.length) || 0 })}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 font-medium ${typeMeta.accentClassName}`}>
                        <HardDrive className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="font-bold">{formatSize(project.totalSize || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="truncate font-bold">{new Date(project.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className={`pt-3 md:pt-4 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end text-[10px] md:text-xs font-black uppercase tracking-widest opacity-100 transition-opacity ${typeMeta.accentClassName}`}>
                      {t('projects.projectCard.openProject')}
                    </div>

                    <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent ${typeMeta.glowClassName} to-transparent opacity-100 transition-opacity`} />
                  </Link>
                )})}

                {projects.length === 0 && (
                  <div className="col-span-full py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900/20 shadow-sm">
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

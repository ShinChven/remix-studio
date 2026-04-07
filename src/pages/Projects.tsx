import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Project } from '../types';
import { Plus, Play, Clock, LayoutGrid, ImageIcon, HardDrive, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fetchProjects } from '../api';

export function Projects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchProjects(page, 24);
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
  }, [page]);

  const addProject = () => navigate('/project/new');

  const handlePageChange = (newPage: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', newPage.toString());
      return next;
    });
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
        <header className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">Projects</h2>
          <p className="text-sm md:text-base text-neutral-400">Manage and track your AI workflows and generation tasks.</p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-500" />
              All Projects {total > 0 && <span className="text-sm text-neutral-500 font-normal">({total})</span>}
            </h3>
            <button
              onClick={addProject}
              className="text-xs md:text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-green-600/30 font-medium"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Project</span><span className="sm:hidden">New</span>
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {projects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 hover:border-green-500/50 p-5 rounded-2xl text-left transition-all group relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 bg-green-500/10 rounded-xl text-green-500 group-hover:scale-110 transition-transform shadow-lg shadow-green-500/5">
                        <Play className="w-6 h-6" />
                      </div>
                      <span className="text-xs text-neutral-500 font-mono bg-neutral-800/50 px-2 py-1 rounded border border-neutral-700/50 truncate max-w-[140px]">
                        {project.id}
                      </span>
                    </div>

                    <h4 className="text-lg font-semibold text-white truncate mb-2">{project.name}</h4>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500 mb-4">
                      <div className="flex items-center gap-1.5">
                        <LayoutGrid className="w-4 h-4" />
                        <span>{(project.jobCount ?? project.jobs?.length) || 0} jobs</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4" />
                        <span>{(project.albumCount ?? project.album?.length) || 0} images</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-500/80 font-medium">
                        <HardDrive className="w-4 h-4" />
                        <span>{formatSize(project.totalSize || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-neutral-800/50 flex items-center justify-end text-xs text-green-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Open Project →
                    </div>

                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-green-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}

                {projects.length === 0 && (
                  <div className="col-span-full py-16 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/20">
                    <Play className="w-12 h-12 text-neutral-700" />
                    <div>
                      <p className="text-lg font-medium text-neutral-400">No projects yet</p>
                      <p className="text-sm">Create a new project to start building your workflows.</p>
                    </div>
                  </div>
                )}
              </div>
              
              {pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-8 pb-4">
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-neutral-400 font-medium">Page {page} of {pages}</span>
                  <button
                    onClick={() => handlePageChange(Math.min(pages, page + 1))}
                    disabled={page === pages}
                    className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

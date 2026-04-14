import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Project } from '../types';
import { Plus, Play, Folder, LayoutGrid, Clock, Loader2 } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { fetchProjects, fetchLibraries } from '../api';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const [projRes, libRes] = await Promise.all([
          fetchProjects(1, 6),
          fetchLibraries(1, 8),
        ]);
        if (mounted) {
          setProjects(projRes.items);
          setLibraries(libRes.items);
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

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <PageHeader
          title={t('dashboard.welcome')}
          description={t('dashboard.description')}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-green-500" />
                  {t('dashboard.recentProjects')}
                </h3>
                <button onClick={addProject} className="text-xs md:text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1">
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('dashboard.newProject')}</span><span className="sm:hidden">{t('dashboard.new')}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(project => (
                  <Link
                    key={project.id}
                    to={`/project/${project.id}`}
                    className="bg-neutral-900 border border-neutral-800 hover:border-green-500/50 p-4 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-2 bg-green-500/10 rounded-lg text-green-500 group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-neutral-500 font-mono truncate max-w-[120px]">{project.id}</span>
                    </div>
                    <h4 className="font-medium text-white truncate">{project.name}</h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      {t('dashboard.projectStats', { 
                        jobCount: (project.jobCount ?? project.jobs?.length) || 0,
                        imageCount: (project.albumCount ?? project.album?.length) || 0,
                        date: new Date(project.createdAt).toLocaleDateString()
                      })}
                    </p>
                  </Link>
                ))}
                {projects.length === 0 && (
                  <div className="col-span-full p-8 border border-neutral-800 border-dashed rounded-xl text-center text-neutral-500">
                    {t('dashboard.noProjects')}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-blue-500" />
                  {t('dashboard.libraries')}
                </h3>
                <div className="flex gap-2">
                  <button onClick={addLibrary} className="text-xs md:text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('dashboard.newLibrary')}</span><span className="sm:hidden">{t('dashboard.new')}</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {libraries.map(lib => (
                  <Link
                    key={lib.id}
                    to={`/library/${lib.id}`}
                    className="bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 p-4 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 group-hover:scale-110 transition-transform">
                        <Folder className="w-5 h-5" />
                      </div>
                      <h4 className="font-medium text-white truncate flex-1">{lib.name}</h4>
                    </div>
                    <p className="text-xs text-neutral-500">{lib.items?.length || 0} items</p>
                  </Link>
                ))}
                {libraries.length === 0 && (
                  <div className="col-span-full p-8 border border-neutral-800 border-dashed rounded-xl text-center text-neutral-500">
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

import { useOutletContext, useNavigate } from 'react-router-dom';
import { Library, Project } from '../types';
import { Plus, Play, Folder, LayoutGrid, Clock } from 'lucide-react';

interface ContextType {
  libraries: Library[];
  projects: Project[];
  addLibrary: () => void;
  addProject: () => void;
}

export function Dashboard() {
  const { libraries, projects, addLibrary, addProject } = useOutletContext<ContextType>();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <header className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Welcome to Remix Studio</h2>
          <p className="text-sm md:text-base text-neutral-400">Select a project or library from the sidebar, or create a new one to get started.</p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-500" />
              Recent Projects
            </h3>
            <button onClick={addProject} className="text-xs md:text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Project</span><span className="sm:hidden">New</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map(project => (
              <button
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="bg-neutral-900 border border-neutral-800 hover:border-green-500/50 p-4 rounded-xl text-left transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 bg-green-500/10 rounded-lg text-green-500 group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-neutral-500 font-mono truncate max-w-[120px]">{project.id}</span>
                </div>
                <h4 className="font-medium text-white truncate">{project.name}</h4>
                <p className="text-xs text-neutral-500 mt-1">{(project.jobCount ?? project.jobs?.length) || 0} jobs • {(project.albumCount ?? project.album?.length) || 0} images • {new Date(project.createdAt).toLocaleDateString()}</p>
              </button>
            ))}
            {projects.length === 0 && (
              <div className="col-span-full p-8 border border-neutral-800 border-dashed rounded-xl text-center text-neutral-500">
                No projects yet. Create one to start generating.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-500" />
              Libraries
            </h3>
            <div className="flex gap-2">
              <button onClick={addLibrary} className="text-xs md:text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Library</span><span className="sm:hidden">New</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {libraries.slice(0, 8).map(lib => (
              <button
                key={lib.id}
                onClick={() => navigate(`/library/${lib.id}`)}
                className="bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 p-4 rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 group-hover:scale-110 transition-transform">
                    <Folder className="w-5 h-5" />
                  </div>
                  <h4 className="font-medium text-white truncate flex-1">{lib.name}</h4>
                </div>
                <p className="text-xs text-neutral-500">{lib.items?.length || 0} items</p>
              </button>
            ))}
            {libraries.length === 0 && (
              <div className="col-span-full p-8 border border-neutral-800 border-dashed rounded-xl text-center text-neutral-500">
                No libraries yet. Create one to store reusable prompts.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

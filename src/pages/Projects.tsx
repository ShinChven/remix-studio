import { useOutletContext, useNavigate } from 'react-router-dom';
import { AppData } from '../types';
import { Plus, Play, Clock, LayoutGrid } from 'lucide-react';

export function Projects() {
  const { data, addProject } = useOutletContext<{ data: AppData, addProject: () => void }>();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2 font-display">Projects</h2>
          <p className="text-neutral-400">Manage and track your AI workflows and generation tasks.</p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-500" />
              All Projects
            </h3>
            <button 
              onClick={addProject} 
              className="text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-green-600/30 font-medium"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.projects.map(project => (
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
                
                <div className="flex items-center gap-4 text-sm text-neutral-500 mb-4">
                  <div className="flex items-center gap-1.5">
                    <LayoutGrid className="w-4 h-4" />
                    <span>{project.jobs?.length || 0} jobs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-neutral-800/50 flex items-center justify-end text-xs text-green-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Open Project →
                </div>
                
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-green-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            
            {data.projects.length === 0 && (
              <div className="col-span-full py-16 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/20">
                <Play className="w-12 h-12 text-neutral-700" />
                <div>
                  <p className="text-lg font-medium text-neutral-400">No projects yet</p>
                  <p className="text-sm">Create a new project to start building your workflows.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

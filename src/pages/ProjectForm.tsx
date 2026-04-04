import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { AppData, Project } from '../types';
import { Save, Layers, Terminal, Play } from 'lucide-react';

interface ContextType {
  data: AppData;
  handleSave: (newData: AppData) => Promise<void>;
}

export function ProjectForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, handleSave } = useOutletContext<ContextType>();
  
  const isNew = !id;
  const existingProject = id ? data.projects.find(p => p.id === id) : null;
  
  const [name, setName] = useState(existingProject?.name || '');
  const [projectId, setProjectId] = useState(existingProject?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (id && !existingProject) {
      navigate('/projects');
    }
  }, [id, existingProject, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      let newData: AppData;
      let targetId: string;

      if (isNew) {
        targetId = projectId.trim().replace(/[^a-zA-Z0-9-_]/g, '_') || `project-${Date.now()}`;
        const newProject: Project = {
          id: targetId,
          name: name.trim(),
          createdAt: Date.now(),
          workflow: [],
          jobs: []
        };
        newData = { ...data, projects: [newProject, ...data.projects] };
      } else {
        targetId = id!;
        newData = {
          ...data,
          projects: data.projects.map(p => 
            p.id === id ? { ...p, name: name.trim() } : p
          )
        };
      }

      await handleSave(newData);
      navigate(`/project/${targetId}`);
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 bg-neutral-950">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-green-600/10 rounded-2xl">
            <Layers className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isNew ? 'New Project' : 'Edit Project'}
            </h2>
            <p className="text-sm text-neutral-500">Define your project parameters</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Project Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cyberpunk Character Series..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500/50 transition-all placeholder:text-neutral-700"
              required
            />
          </div>

          {isNew && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Custom ID (Optional)</label>
              <div className="relative">
                <Terminal className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-700" />
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="project-slug-id"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-400 font-mono focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500/50 transition-all placeholder:text-neutral-800"
                />
              </div>
              <p className="text-[10px] text-neutral-600 ml-1 font-medium tracking-wide">Leave blank for automatic ID generation</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-green-500/20 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              {isSubmitting ? 'Saving...' : 'Start Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

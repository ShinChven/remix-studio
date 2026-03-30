import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Outlet, Link } from 'react-router-dom';
import { AppData, Library, Project } from '../types';
import { loadData, saveData } from '../api';
import { Plus, Folder, Layers, Play, Search, ChevronDown, ChevronRight } from 'lucide-react';

export function MainLayout() {
  const [data, setData] = useState<AppData>({ libraries: [], projects: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLibsOpen, setIsLibsOpen] = useState(true);
  const [isProjsOpen, setIsProjsOpen] = useState(true);
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadData().then(fetchedData => {
      setData({
        libraries: (fetchedData.libraries || []).map(lib => ({
          ...lib,
          type: lib.type || 'text'
        })),
        // @ts-ignore - handle legacy data
        projects: fetchedData.projects || fetchedData.batches || []
      });
    }).catch(console.error);
  }, []);

  const handleSave = async (newData: AppData) => {
    setData(newData);
    await saveData(newData);
  };

  const addLibrary = (type: 'text' | 'image') => {
    const newLib: Library = {
      id: crypto.randomUUID(),
      name: `New ${type === 'image' ? 'Image ' : ''}Library ${data.libraries.length + 1}`,
      type,
      items: []
    };
    handleSave({ ...data, libraries: [...data.libraries, newLib] });
    navigate(`/library/${newLib.id}`);
  };

  const addProject = () => {
    const newProject: Project = {
      id: `project-${data.projects.length + 1}`,
      name: `New Project ${data.projects.length + 1}`,
      createdAt: Date.now(),
      workflow: [],
      jobs: []
    };
    handleSave({ ...data, projects: [newProject, ...data.projects] });
    navigate(`/project/${newProject.id}`);
  };

  const filteredLibraries = useMemo(() => 
    data.libraries.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase())),
  [data.libraries, searchQuery]);

  const filteredProjects = useMemo(() => 
    data.projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.id.toLowerCase().includes(searchQuery.toLowerCase())),
  [data.projects, searchQuery]);

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-200 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800">
          <Link 
            to="/"
            className="w-full text-left hover:opacity-80 transition-opacity block"
          >
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-500" />
              Remix Studio
            </h1>
          </Link>
        </div>
        
        <div className="p-3 border-b border-neutral-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6">
          {/* Libraries Section */}
          <div>
            <div className="flex items-center justify-between mb-1 px-1">
              <button 
                onClick={() => setIsLibsOpen(!isLibsOpen)}
                className="flex items-center gap-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider hover:text-neutral-300"
              >
                {isLibsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Libraries ({filteredLibraries.length})
              </button>
              <div className="flex gap-1">
                <button onClick={() => addLibrary('text')} className="text-neutral-400 hover:text-white p-1" title="Add Text Library">
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => addLibrary('image')} className="text-neutral-400 hover:text-white p-1" title="Add Image Library">
                  <Layers className="w-4 h-4" />
                </button>
              </div>
            </div>
            {isLibsOpen && (
              <ul className="space-y-0.5 mt-1">
                {filteredLibraries.map(lib => (
                  <li key={lib.id}>
                    <Link
                      to={`/library/${lib.id}`}
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors ${
                        location.pathname === `/library/${lib.id}`
                          ? 'bg-blue-600/20 text-blue-400' 
                          : 'hover:bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      <Folder className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{lib.name}</span>
                    </Link>
                  </li>
                ))}
                {filteredLibraries.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-neutral-600 italic">No libraries found</li>
                )}
              </ul>
            )}
          </div>

          {/* Projects Section */}
          <div>
            <div className="flex items-center justify-between mb-1 px-1">
              <button 
                onClick={() => setIsProjsOpen(!isProjsOpen)}
                className="flex items-center gap-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider hover:text-neutral-300"
              >
                {isProjsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Projects ({filteredProjects.length})
              </button>
              <button 
                onClick={addProject} 
                className="text-neutral-400 hover:text-white p-1"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {isProjsOpen && (
              <ul className="space-y-0.5 mt-1">
                {filteredProjects.map(project => (
                  <li key={project.id}>
                    <Link
                      to={`/project/${project.id}`}
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors ${
                        location.pathname === `/project/${project.id}`
                          ? 'bg-green-600/20 text-green-400' 
                          : 'hover:bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      <Play className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  </li>
                ))}
                {filteredProjects.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-neutral-600 italic">No projects found</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden bg-neutral-950">
        <Outlet context={{ data, handleSave, addLibrary, addProject }} />
      </div>
    </div>
  );
}

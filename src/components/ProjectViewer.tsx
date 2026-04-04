import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, Job, Library, WorkflowItem, WorkflowItemType, Provider } from '../types';
import { saveImage, fetchProviders, generateImage, fetchProject as apiFetchProject, updateProject as apiUpdateProject, runProjectWorkflow as apiRunWorkflow } from '../api';
import { Play, Square, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Trash2, GripVertical, Type, Library as LibraryIcon, Plus, Layers, ChevronDown, ChevronUp, Save, Settings, Maximize2, X } from 'lucide-react';
import { generateWorkflowCombinations } from '../lib/remixEngine';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  project: Project;
  libraries: Library[];
  onUpdate: (project: Project) => void;
  onDelete: () => void;
}

export function ProjectViewer({ project, libraries, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [localProject, setLocalProject] = useState<Project>(project);
  const [hasChanges, setHasChanges] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [itemToRemoveId, setItemToRemoveId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WorkflowItem | null>(null);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [previewingLibrary, setPreviewingLibrary] = useState<Library | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(project.providerId || '');
  const [isFetchingProviders, setIsFetchingProviders] = useState(true);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [hasManuallySetQueueCount, setHasManuallySetQueueCount] = useState(false);
  
  const projectRef = useRef(localProject);
  const isProcessing = localProject.jobs.some(j => j.status === 'pending' || j.status === 'processing');

  useEffect(() => {
    setLocalProject(project);
  }, [project]); // Sync when parent refreshes

  useEffect(() => {
    projectRef.current = localProject;
  }, [localProject]);

  // Polling for status updates when jobs are active
  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      interval = setInterval(async () => {
        try {
          // Fetch the latest project state from the server
          const updated = await apiFetchProject(localProject.id);
          
          // Check if anything actually changed to avoid unnecessary re-renders
          const hasUpdates = JSON.stringify(updated.jobs) !== JSON.stringify(localProject.jobs);
          if (hasUpdates) {
            setLocalProject(updated);
          }
        } catch (e) {
          console.error('Polling for project updates failed:', e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, localProject.id, localProject.jobs]);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProviders();
        setProviders(p);
        if (!selectedProviderId && p.length > 0) {
          const defaultProv = p.find(prov => prov.id === project.providerId) || p[0];
          setSelectedProviderId(defaultProv.id);
        }
      } catch (e) {
        console.error('Failed to fetch providers:', e);
      } finally {
        setIsFetchingProviders(false);
      }
    })();
  }, []);

  const combinations = generateWorkflowCombinations(localProject.workflow || [], libraries);

  useEffect(() => {
    if (!hasManuallySetQueueCount || queueCount > combinations.length) {
      setQueueCount(combinations.length);
    }
  }, [combinations.length]);

  const handleSave = async () => {
    onUpdate(localProject);
    setHasChanges(false);
  };

  const addWorkflowItem = (type: WorkflowItemType) => {
    if (type === 'library') {
      setShowLibrarySelector(true);
      return;
    }
    const newItem: WorkflowItem = {
      id: crypto.randomUUID(),
      type,
      value: ''
    };
    const updated = { ...localProject, workflow: [...(localProject.workflow || []), newItem] };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const handleLibrarySelect = (libraryId: string) => {
    const newItem: WorkflowItem = {
      id: crypto.randomUUID(),
      type: 'library',
      value: libraryId
    };
    const updated = { ...localProject, workflow: [...(localProject.workflow || []), newItem] };
    setLocalProject(updated);
    onUpdate(updated);
    setShowLibrarySelector(false);
  };

  const updateWorkflowItem = (id: string, value: string) => {
    const newWorkflow = localProject.workflow.map(item => 
      item.id === id ? { ...item, value } : item
    );
    const updated = { ...localProject, workflow: newWorkflow };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const removeWorkflowItem = (id: string) => {
    setItemToRemoveId(id);
  };

  const confirmRemoveWorkflowItem = () => {
    if (itemToRemoveId) {
      const updated = { ...localProject, workflow: localProject.workflow.filter(item => item.id !== itemToRemoveId) };
      setLocalProject(updated);
      onUpdate(updated);
      setItemToRemoveId(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newWorkflow = [...(localProject.workflow || [])];
    const [draggedItem] = newWorkflow.splice(draggedIndex, 1);
    newWorkflow.splice(dropIndex, 0, draggedItem);
    
    const updated = { ...localProject, workflow: newWorkflow };
    setLocalProject(updated);
    onUpdate(updated);
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        updateWorkflowItem(id, e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateAndStart = async () => {
    // 1. Sync any local pending workflow changes to the server
    const currentCombinations = generateWorkflowCombinations(localProject.workflow || [], libraries);
    if (currentCombinations.length === 0) return;

    // Use only the requested number of combinations
    const selectedCombinations = currentCombinations.slice(0, queueCount);

    const newJobs: Job[] = selectedCombinations.map(combo => ({
      id: crypto.randomUUID(),
      prompt: combo.prompt,
      imageContext: combo.imageContext,
      status: 'pending'
    }));

    const updatedProject = { ...localProject, jobs: [...localProject.jobs, ...newJobs] };
    
    // Save to server
    await apiUpdateProject(updatedProject.id, {
      jobs: updatedProject.jobs,
      workflow: updatedProject.workflow,
      providerId: selectedProviderId
    });

    setLocalProject(updatedProject);
    setHasChanges(false);

    // 2. Trigger server-side runner
    try {
      await apiRunWorkflow(updatedProject.id);
    } catch (e) {
      console.error("Failed to start workflow:", e);
    }
  };

  const toggleProcessing = () => {
    if (isProcessing) {
        // In the new server-side architecture, we don't have a "halt" yet, 
        // but we could implement it. For now, it just doesn't do anything 
        // to stop the server-side queue.
        console.log("Server-side process is running. Halting is not yet implemented.");
    } else {
      const pendingJobs = localProject.jobs.filter(j => j.status === 'pending');
      if (pendingJobs.length > 0) {
        // Just trigger the run if there are already pending jobs
        apiRunWorkflow(localProject.id);
      } else {
        generateAndStart();
      }
    }
  };

  const activeTasks = localProject.jobs.filter(j => j.status === 'pending' || j.status === 'processing');
  const completedTasks = localProject.jobs.filter(j => j.status === 'completed');
  const failedTasks = localProject.jobs.filter(j => j.status === 'failed');
  const total = localProject.jobs.length;
  const progress = total === 0 ? 0 : Math.round((completedTasks.length + failedTasks.length) / total * 100);
  const combinationsPreview = combinations.map((c, i) => ({ id: `preview-${i}`, prompt: c.prompt, imageContext: c.imageContext, status: 'preview' as const }));
  const displayTasks = activeTasks.length > 0 
    ? activeTasks 
    : combinationsPreview.slice(0, queueCount);

  return (
    <div className="flex flex-col lg:flex-row h-full bg-neutral-950 overflow-hidden lg:overflow-visible">
      {/* Left Pane: Workflow Builder */}
      <div className="w-full lg:w-96 lg:h-full border-b lg:border-b-0 lg:border-r border-neutral-800 bg-neutral-900/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-neutral-800 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center justify-between gap-2 flex-1 group">
              <h2 className="text-xl font-bold text-white truncate tracking-tight">{localProject.name}</h2>
              <button 
                onClick={() => navigate(`/project/${project.id}/edit`)}
                className="p-1.5 text-neutral-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-green-400/10 rounded-lg"
                title="Edit Project Information"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest px-1.5 py-0.5 bg-neutral-950 border border-neutral-800 rounded">ID: {project.id}</span>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <span title="All changes are auto-saved" className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-widest opacity-60">
                <CheckCircle2 className="w-3 h-3" /> Auto-saved
              </span>
              <button onClick={() => setShowDeleteProjectModal(true)} className="text-neutral-500 hover:text-red-400 p-1" title="Delete Project">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 border-b border-neutral-800 flex gap-2 bg-neutral-900/50">
          <button onClick={() => addWorkflowItem('text')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <Type className="w-3 h-3" /> Text
          </button>
          <button onClick={() => addWorkflowItem('library')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <LibraryIcon className="w-3 h-3" /> Lib
          </button>
          <button onClick={() => addWorkflowItem('image')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <ImageIcon className="w-3 h-3" /> Img
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar max-h-[40vh] lg:max-h-none">
          {(localProject.workflow || []).map((item, index) => (
            <div 
              key={item.id} 
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`bg-neutral-900/50 border rounded-xl p-3 group transition-all ${
                draggedIndex === index ? 'opacity-50 border-blue-500' : 
                dragOverIndex === index ? 'border-blue-400 border-dashed bg-neutral-800' : 
                'border-neutral-800 hover:border-neutral-700 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 transition-colors">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                    {item.type === 'text' && <Type className="w-3 h-3 text-blue-500" />}
                    {item.type === 'library' && <LibraryIcon className="w-3 h-3 text-emerald-500" />}
                    {item.type === 'image' && <ImageIcon className="w-3 h-3 text-amber-500" />}
                    {item.type}
                  </span>
                </div>
                <button onClick={() => removeWorkflowItem(item.id)} className="text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {item.type === 'text' && (
                <div 
                  onClick={() => setEditingItem(item)}
                  className="group/text relative cursor-pointer"
                >
                  <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 line-clamp-4 min-h-[96px] transition-all hover:border-blue-500/30 hover:bg-neutral-900/50">
                    {item.value || <span className="opacity-30 italic">No text content...</span>}
                    <div className="absolute top-2 right-2 p-1.5 bg-neutral-900/80 rounded-md border border-neutral-800 opacity-0 group-hover/text:opacity-100 transition-all hover:text-blue-400">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              )}

              {item.type === 'library' && (
                <div 
                  onClick={() => {
                    const lib = libraries.find(l => l.id === item.value);
                    if (lib) setPreviewingLibrary(lib);
                  }}
                  className="group/library relative cursor-pointer"
                >
                  <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs flex items-center justify-between transition-all hover:border-emerald-500/30 hover:bg-neutral-900/50">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const lib = libraries.find(l => l.id === item.value);
                        const firstImage = lib?.type === 'image' && lib.items[0]?.content;
                        return firstImage ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-800 flex-shrink-0">
                            <img src={firstImage} alt="Thumbnail" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="p-2 bg-emerald-500/10 rounded-lg flex-shrink-0">
                            <LibraryIcon className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                        );
                      })()}
                      <div className="min-w-0">
                        <div className="text-neutral-200 font-bold truncate">
                          {libraries.find(l => l.id === item.value)?.name || 'Unknown Library'}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-medium mt-0.5">
                          {libraries.find(l => l.id === item.value)?.items.length || 0} items
                        </div>
                      </div>
                    </div>
                    <div className="p-1.5 bg-neutral-900/80 rounded-md border border-neutral-800 opacity-0 group-hover/library:opacity-100 transition-all hover:text-emerald-400">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              )}

              {item.type === 'image' && (
                <div className="space-y-3">
                  <label className="block w-full text-center py-4 border border-dashed border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-800/50 hover:border-amber-500/50 transition-all group">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">Choose Image</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, item.id)} className="hidden" />
                  </label>
                  {item.value && (
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-neutral-800 mt-2">
                       <img src={item.value} alt="Reference" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {(localProject.workflow || []).length === 0 && (
            <div className="text-center text-neutral-600 text-[10px] font-bold uppercase tracking-widest py-12 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">
              Build your workflow
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-800 bg-neutral-900 shadow-2xl">
          <button 
            onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
            className="w-full p-3 bg-neutral-950/50 border border-neutral-800 rounded-xl mb-3 hover:bg-neutral-900/50 transition-all group flex flex-col gap-2.5"
          >
            {/* Row 1: Provider Name + Chevron */}
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Provider:</span>
                <span className="text-[10px] font-bold text-neutral-300 truncate capitalize">
                  {providers.find(p => p.id === selectedProviderId)?.name || 'None'}
                </span>
              </div>
              <div className={`p-1 rounded-md bg-neutral-800/50 group-hover:bg-neutral-800 transition-all ${isSettingsCollapsed ? 'rotate-180' : ''}`}>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              </div>
            </div>

            {/* Row 2: Options + Input */}
            <div className="w-full flex items-center justify-between pt-2 border-t border-neutral-800/50">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.aspectRatio || '1:1'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.quality || '1K'}
                </span>
              </div>

              <div 
                onClick={(e) => e.stopPropagation()} 
                className="flex items-center gap-2 bg-neutral-900 px-2 py-1 rounded-md border border-neutral-800"
              >
                <input
                  type="number"
                  min="1"
                  max={combinations.length}
                  value={queueCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      setQueueCount(Math.min(val, combinations.length));
                      setHasManuallySetQueueCount(true);
                    }
                  }}
                  className="w-10 bg-transparent text-[10px] text-blue-400 font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center"
                />
                <span className="text-[9px] text-neutral-500 font-black">/ {combinations.length}</span>
              </div>
            </div>
          </button>

          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isSettingsCollapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-[500px] opacity-100 mb-4'}`}>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  AI Provider
                </label>
                <select
                  value={selectedProviderId}
                  onChange={(e) => {
                    setSelectedProviderId(e.target.value);
                    const updated = { ...localProject, providerId: e.target.value };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-neutral-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/40 transition-all font-medium appearance-none cursor-pointer hover:bg-neutral-900 shadow-inner"
                  disabled={isProcessing || isFetchingProviders}
                >
                  {isFetchingProviders ? (
                    <option>Loading providers...</option>
                  ) : providers.length === 0 ? (
                    <option>No providers configured</option>
                  ) : (
                    providers.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '1:1', ratio: '1:1', icon: 'w-3 h-3' },
                    { label: '4:3', ratio: '4:3', icon: 'w-4 h-3' },
                    { label: '3:4', ratio: '3:4', icon: 'w-3 h-4' },
                    { label: '16:9', ratio: '16:9', icon: 'w-5 h-3' },
                    { label: '9:16', ratio: '9:16', icon: 'w-3 h-5' },
                    { label: '2:3', ratio: '2:3', icon: 'w-3 h-4.5' },
                    { label: '3:2', ratio: '3:2', icon: 'w-4.5 h-3' },
                  ].map((r) => (
                    <button
                      key={r.ratio}
                      onClick={() => {
                        const updated = { ...localProject, aspectRatio: r.ratio };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg border transition-all ${
                        (localProject.aspectRatio || '1:1') === r.ratio
                          ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className={`border-2 rounded-[2px] ${r.icon} ${(localProject.aspectRatio || '1:1') === r.ratio ? 'border-white' : 'border-neutral-700'}`} />
                      <span className="text-[8px] font-bold">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Quality
                </label>
                <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1">
                  {['1K', '2K', '4K'].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        const updated = { ...localProject, quality: q };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        (localProject.quality || '1K') === q
                          ? 'bg-neutral-800 text-blue-400 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-400'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={toggleProcessing}
            disabled={combinations.length === 0 && !isProcessing && activeTasks.length === 0}
            className={`w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all ${
              isProcessing 
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' 
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:grayscale shadow-lg shadow-blue-500/20 active:scale-[0.98]'
            }`}
          >
            {isProcessing ? <Square className="w-4 h-4 fill-current" /> : <Plus className="w-4 h-4" />}
            {isProcessing ? 'Halt Process' : 'Add to Queue'}
          </button>
        </div>
      </div>

      {/* Right Pane: Jobs Grid */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="p-4 md:p-6 border-b border-neutral-800 flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center bg-neutral-900/20 backdrop-blur-md shadow-sm">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Project Status</h2>
            <div className="flex items-center gap-3 md:gap-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1 md:mt-2">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> {completedTasks.length} Done</span>
              <span className="text-neutral-800">•</span>
              <span>{total} Total</span>
              {failedTasks.length > 0 && (
                <>
                  <span className="text-neutral-800">•</span>
                  <span className="text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {failedTasks.length} Failed</span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-black font-mono text-blue-500 tracking-[0.3em]">{progress}%</span>
            <div className="w-full sm:w-64 h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
              <div 
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 md:space-y-12 custom-scrollbar">
          
          {/* Tasks Section */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-neutral-400">Queue Management</h3>
              <div className="h-px flex-1 bg-neutral-800/50" />
            </div>
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="max-h-72 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {displayTasks.map(task => (
                  <div key={task.id} className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50 flex justify-between items-center hover:border-neutral-700 transition-colors">
                    <span className="text-xs text-neutral-400 font-medium line-clamp-1 flex-1 pr-6" title={task.prompt}>{task.prompt}</span>
                    <div className="flex-shrink-0">
                      {task.status === 'processing' && (
                        <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Running
                        </div>
                      )}
                      {task.status === 'pending' && <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest px-2.5 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800 shadow-sm">Queued</span>}
                      {task.status === 'preview' && <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest px-2.5 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800 border-dashed">Plan</span>}
                    </div>
                  </div>
                ))}
                {displayTasks.length === 0 && (
                  <div className="py-12 text-center text-neutral-600 text-xs font-bold uppercase tracking-widest">No active tasks in queue</div>
                )}
              </div>
            </div>
          </section>

          {/* Album Section */}
          <section>
            <div className="flex items-center gap-3 mb-8">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-neutral-400">Generation Album</h3>
              <div className="h-px flex-1 bg-neutral-800/50" />
            </div>
            
            {completedTasks.length === 0 ? (
              <div className="bg-neutral-900/20 border-2 border-dashed border-neutral-800 rounded-3xl p-12 md:p-20 text-center text-neutral-500 flex flex-col items-center gap-4 transition-colors hover:border-neutral-700 shadow-inner">
                <ImageIcon className="w-12 h-12 text-neutral-800" />
                <div>
                  <p className="text-base md:text-lg font-bold text-neutral-400 tracking-tight">Your Gallery is empty</p>
                  <p className="text-[10px] md:text-xs font-medium text-neutral-600 uppercase tracking-widest mt-1">Start workflow to generate</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {completedTasks.map(job => (
                  <div key={job.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col group hover:border-blue-500/50 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10 active:scale-100">
                    <div className="aspect-square bg-neutral-950 relative flex items-center justify-center overflow-hidden">
                      <img src={job.imageUrl} alt={job.prompt} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 shadow-lg" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                    </div>
                    <div className="p-4 bg-neutral-900/80 backdrop-blur-sm">
                      <p className="text-[10px] leading-relaxed text-neutral-400 line-clamp-3 font-medium" title={job.prompt}>
                        {job.prompt}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Errors Section */}
          {failedTasks.length > 0 && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button 
                onClick={() => setShowErrors(!showErrors)} 
                className="flex items-center gap-3 text-red-400 hover:text-red-300 transition-all font-black uppercase tracking-[0.2em] text-xs mb-6 group"
              >
                <div className={`p-1.5 rounded-lg border transition-all ${showErrors ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 border-red-500/20 group-hover:bg-red-500/20'}`}>
                  {showErrors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
                Logs ({failedTasks.length})
              </button>
              
              {showErrors && (
                <div className="grid grid-cols-1 gap-3">
                  {failedTasks.map(job => (
                    <div key={job.id} className="bg-red-950/10 border border-red-900/20 p-5 rounded-2xl flex flex-col gap-4 backdrop-blur-sm shadow-xl">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-red-500/10 rounded-xl">
                          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-neutral-300 mb-3 leading-relaxed">{job.prompt}</p>
                          <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl">
                            <code className="text-[10px] text-red-400 font-mono break-all leading-tight">{job.error}</code>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        </div>
      </div>
      <ConfirmModal
        isOpen={itemToRemoveId !== null}
        onClose={() => setItemToRemoveId(null)}
        onConfirm={confirmRemoveWorkflowItem}
        title="Remove Workflow Item"
        message="Are you sure you want to remove this item from your workflow?"
        confirmText="Remove Item"
        type="danger"
      />

      <PromptModal 
        item={editingItem} 
        onClose={() => setEditingItem(null)} 
        onSave={(value) => {
          if (editingItem) {
            updateWorkflowItem(editingItem.id, value);
          }
          setEditingItem(null);
        }}
      />

      <ConfirmModal
        isOpen={showDeleteProjectModal}
        onClose={() => setShowDeleteProjectModal(false)}
        onConfirm={onDelete}
        title="Delete Project"
        message={`Are you sure you want to delete "${localProject.name}"? This action cannot be undone.`}
        confirmText="Delete Project"
        type="danger"
      />

      <LibrarySelectionModal
        isOpen={showLibrarySelector}
        onClose={() => setShowLibrarySelector(false)}
        onSelect={handleLibrarySelect}
        libraries={libraries}
      />

      <LibraryPreviewModal
        library={previewingLibrary}
        onClose={() => setPreviewingLibrary(null)}
      />
    </div>
  );
}

function LibrarySelectionModal({ isOpen, onClose, onSelect, libraries }: { isOpen: boolean; onClose: () => void; onSelect: (id: string) => void; libraries: Library[] }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl max-h-[80vh] bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/10 rounded-xl">
              <LibraryIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Select Library</h3>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">Collections available for workflow</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {libraries.length === 0 ? (
            <div className="py-20 text-center">
              <LibraryIcon className="w-12 h-12 text-neutral-800 mx-auto mb-4" />
              <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">No libraries created yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {libraries.map(lib => (
                <button
                  key={lib.id}
                  onClick={() => onSelect(lib.id)}
                  className="group flex items-start gap-4 p-5 bg-neutral-950/40 border border-neutral-800 rounded-2xl text-left transition-all hover:bg-neutral-800 hover:border-emerald-500/30 hover:scale-[1.02] active:scale-100"
                >
                  <div className="flex-shrink-0">
                    {lib.type === 'image' && lib.items[0]?.content ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-neutral-800 shadow-md">
                        <img src={lib.items[0].content} alt={lib.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 group-hover:bg-neutral-950 group-hover:border-emerald-500/20 transition-all">
                        <LibraryIcon className="w-6 h-6 text-emerald-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 pt-1 min-w-0">
                    <div className="text-sm font-bold text-neutral-100 mb-1 group-hover:text-white transition-colors truncate">{lib.name}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest px-2 py-0.5 bg-neutral-900 rounded border border-neutral-800 group-hover:border-neutral-700">{lib.type}</span>
                      <span className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">{lib.items.length} items</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/40 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function LibraryPreviewModal({ library, onClose }: { library: Library | null; onClose: () => void }) {
  if (!library) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-[80vh] bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/10 rounded-xl">
              <LibraryIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">{library.name}</h3>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">{library.items.length} workflow items</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-neutral-950/10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {library.items.map(item => (
              <div key={item.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                {library.type === 'image' && (
                  <div className="aspect-video bg-black relative border-b border-neutral-800">
                    <img src={item.content} alt={item.content} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4 flex-1">
                  {item.title && (
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2">{item.title}</div>
                  )}
                  <p className={`text-neutral-400 leading-relaxed ${library.type === 'text' ? 'text-sm' : 'text-[11px] line-clamp-4'}`}>
                    {library.type === 'text' ? item.content : <span className="opacity-60 italic whitespace-nowrap overflow-hidden text-ellipsis block">{item.content}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/40 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-neutral-700"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptModal({ item, onClose, onSave }: { item: WorkflowItem | null; onClose: () => void; onSave: (val: string) => void }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (item) setValue(item.value);
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-[80vh] bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 rounded-xl">
              <Type className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Edit Prompt Fragment</h3>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">Workflow Text Block</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-6 md:p-8 flex flex-col">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your prompt here..."
            className="flex-1 w-full bg-transparent border-none text-neutral-200 text-lg md:text-xl font-medium leading-relaxed focus:outline-none focus:ring-0 resize-none placeholder:text-neutral-800 custom-scrollbar"
          />
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/40 flex items-center justify-between gap-4">
          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest pl-2">
            Character count: {value.length}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={() => onSave(value)}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


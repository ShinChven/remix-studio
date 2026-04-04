import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, Job, Library, WorkflowItem, WorkflowItemType, Provider } from '../types';
import { saveImage, fetchProviders, generateImage } from '../api';
import { Play, Square, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Trash2, GripVertical, Type, Library as LibraryIcon, Plus, Layers, ChevronDown, ChevronUp, Save, Settings } from 'lucide-react';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [itemToRemoveId, setItemToRemoveId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(project.providerId || '');
  const [isFetchingProviders, setIsFetchingProviders] = useState(true);
  
  const isProcessingRef = useRef(false);
  const projectRef = useRef(localProject);

  useEffect(() => {
    setLocalProject(project);
    setHasChanges(false);
  }, [project.id]);

  useEffect(() => {
    projectRef.current = localProject;
  }, [localProject]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProviders();
        setProviders(p);
        if (!selectedProviderId && p.length > 0) {
          setSelectedProviderId(p[0].id);
        }
      } catch (e) {
        console.error('Failed to fetch providers:', e);
      } finally {
        setIsFetchingProviders(false);
      }
    })();
  }, []);

  const handleSave = () => {
    onUpdate(localProject);
    setHasChanges(false);
  };

  const updateJob = (jobId: string, updates: Partial<Job>) => {
    const currentProject = projectRef.current;
    const updatedProject = {
      ...currentProject,
      jobs: currentProject.jobs.map(j => j.id === jobId ? { ...j, ...updates } : j)
    };
    setLocalProject(updatedProject);
    onUpdate(updatedProject); 
  };

  const addWorkflowItem = (type: WorkflowItemType) => {
    const newItem: WorkflowItem = {
      id: crypto.randomUUID(),
      type,
      value: type === 'library' && libraries.length > 0 ? libraries[0].id : ''
    };
    setLocalProject({ ...localProject, workflow: [...(localProject.workflow || []), newItem] });
    setHasChanges(true);
  };

  const updateWorkflowItem = (id: string, value: string) => {
    const newWorkflow = localProject.workflow.map(item => 
      item.id === id ? { ...item, value } : item
    );
    setLocalProject({ ...localProject, workflow: newWorkflow });
    setHasChanges(true);
  };

  const removeWorkflowItem = (id: string) => {
    setItemToRemoveId(id);
  };

  const confirmRemoveWorkflowItem = () => {
    if (itemToRemoveId) {
      setLocalProject({ ...localProject, workflow: localProject.workflow.filter(item => item.id !== itemToRemoveId) });
      setHasChanges(true);
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
    
    setLocalProject({ ...localProject, workflow: newWorkflow });
    setHasChanges(true);
    
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

  const generateAndStart = () => {
    if (hasChanges) {
      handleSave();
    }
    
    const combinations = generateWorkflowCombinations(localProject.workflow || [], libraries);
    if (combinations.length === 0) return;

    const newJobs: Job[] = combinations.map(combo => ({
      id: crypto.randomUUID(),
      prompt: combo.prompt,
      imageContext: combo.imageContext,
      status: 'pending'
    }));

    const updatedProject = { ...localProject, jobs: [...localProject.jobs, ...newJobs] };
    setLocalProject(updatedProject);
    onUpdate(updatedProject);
    
    setIsProcessing(true);
    processQueue();
  };

  const processQueue = async () => {
    const pendingJobs = [...projectRef.current.jobs.filter(j => j.status === 'pending' || j.status === 'failed')];
    
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) {
      console.error("No provider selected");
      setIsProcessing(false);
      return;
    }

    const concurrency = provider.concurrency || 1;
    let jobIndex = 0;
    
    const worker = async () => {
      while (jobIndex < pendingJobs.length && isProcessingRef.current) {
        const job = pendingJobs[jobIndex++];
        if (!job) break;

        try {
          updateJob(job.id, { status: 'processing', error: undefined });
          
          const refImage = job.imageContext 
            ? job.imageContext.replace(/^data:image\/\w+;base64,/, '') 
            : undefined;

          const result = await generateImage({
            providerId: provider.id,
            prompt: job.prompt,
            aspectRatio: "1:1",
            imageSize: "1K",
            refImage
          });

          if (result.image) {
            const url = await saveImage(result.image, localProject.id);
            updateJob(job.id, { status: 'completed', imageUrl: url });
          } else {
            throw new Error("No image data returned from server");
          }
        } catch (error: any) {
          console.error("Job failed:", error);
          updateJob(job.id, { status: 'failed', error: error.message || 'Unknown error' });
        }
        
        if (isProcessingRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };

    const workersCount = Math.min(concurrency, pendingJobs.length);
    const workers = Array.from({ length: workersCount }, worker);
    
    await Promise.all(workers);
    setIsProcessing(false);
  };

  const toggleProcessing = () => {
    if (isProcessing) {
      setIsProcessing(false);
    } else {
      const pendingJobs = localProject.jobs.filter(j => j.status === 'pending');
      if (pendingJobs.length > 0) {
        setIsProcessing(true);
        processQueue();
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
  const combinations = generateWorkflowCombinations(localProject.workflow || [], libraries);
  const displayTasks = activeTasks.length > 0 
    ? activeTasks 
    : combinations.map((c, i) => ({ id: `preview-${i}`, prompt: c.prompt, imageContext: c.imageContext, status: 'preview' as const }));

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
            {hasChanges && (
              <button
                onClick={handleSave}
                className="flex-shrink-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-500/20 transition-all animate-in fade-in zoom-in"
                title="Save Changes"
              >
                <Save className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest px-1.5 py-0.5 bg-neutral-950 border border-neutral-800 rounded">ID: {project.id}</span>
            </div>
            <div className="flex items-center gap-2 ml-2">
              {!hasChanges && (
                <span title="All changes saved">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </span>
              )}
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
                <textarea
                  value={item.value}
                  onChange={(e) => updateWorkflowItem(item.id, e.target.value)}
                  placeholder="Enter prompt text..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-200 focus:outline-none focus:border-blue-500/50 resize-none h-24 transition-colors"
                />
              )}

              {item.type === 'library' && (
                <select
                  value={item.value}
                  onChange={(e) => updateWorkflowItem(item.id, e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                >
                  <option value="" disabled>Select a library</option>
                  {libraries.map(lib => (
                    <option key={lib.id} value={lib.id}>{lib.name} ({lib.type || 'text'})</option>
                  ))}
                </select>
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
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] mb-2 text-neutral-500">
            <span>Combinations:</span>
            <span className="text-blue-400">{combinations.length}</span>
          </div>

          <div className="mb-4 space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              AI Provider
            </label>
            <select
              value={selectedProviderId}
              onChange={(e) => {
                setSelectedProviderId(e.target.value);
                setLocalProject(prev => ({ ...prev, providerId: e.target.value }));
                setHasChanges(true);
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
            {providers.length === 0 && !isFetchingProviders && (
              <p className="text-[8px] text-red-500/60 font-bold px-1 uppercase tracking-tight">
                Configure a provider in Settings
              </p>
            )}
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
            {isProcessing ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            {isProcessing ? 'Halt Process' : 'Run Workflow'}
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
        isOpen={showDeleteProjectModal}
        onClose={() => setShowDeleteProjectModal(false)}
        onConfirm={onDelete}
        title="Delete Project"
        message={`Are you sure you want to delete "${localProject.name}"? This action cannot be undone.`}
        confirmText="Delete Project"
        type="danger"
      />

      <ConfirmModal
        isOpen={itemToRemoveId !== null}
        onClose={() => setItemToRemoveId(null)}
        onConfirm={confirmRemoveWorkflowItem}
        title="Remove Workflow Item"
        message="Are you sure you want to remove this item from your workflow?"
        confirmText="Remove Item"
        type="danger"
      />
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, Job, Library, LibraryItem, WorkflowItem, WorkflowItemType, Provider } from '../types';
import { saveImage, fetchProviders, generateImage, fetchProject as apiFetchProject, updateProject as apiUpdateProject, runProjectWorkflow as apiRunWorkflow } from '../api';
import { Play, Square, CheckSquare, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Trash2, GripVertical, Type, Library as LibraryIcon, Plus, Layers, ChevronDown, ChevronUp, Save, Settings, Maximize2, X, Shuffle, List, Grid, ChevronLeft, ChevronRight } from 'lucide-react';
import { generateWorkflowCombinations, generateJobs } from '../lib/remixEngine';
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
  const [jobToDeleteId, setJobToDeleteId] = useState<string | null>(null);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [showDeleteAllDraftsModal, setShowDeleteAllDraftsModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkflowItem | null>(null);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [previewingLibrary, setPreviewingLibrary] = useState<Library | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(project.providerId || '');
  const [isFetchingProviders, setIsFetchingProviders] = useState(true);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [hasManuallySetQueueCount, setHasManuallySetQueueCount] = useState(false);
  const [activeTab, setActiveTab] = useState<'draft' | 'queue' | 'album'>('draft');
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [uploadingItemIds, setUploadingItemIds] = useState<Set<string>>(new Set());
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [lightboxData, setLightboxData] = useState<{images: string[], index: number} | null>(null);
  
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
      }, 10000);
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
    if (!hasManuallySetQueueCount) {
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
    // Check for duplicates
    const isDuplicate = (localProject.workflow || []).some(
      item => item.type === 'library' && item.value === libraryId
    );
    
    if (isDuplicate) {
      setShowLibrarySelector(false);
      return;
    }

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingItemIds(prev => new Set(prev).add(id));
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
      });
      reader.readAsDataURL(file);
      
      try {
        const base64 = await base64Promise;
        const { url } = await saveImage(base64, localProject.id);
        updateWorkflowItem(id, url);
      } catch (err) {
        console.error('Failed to upload image:', err);
        setWorkflowError("Failed to upload image. Please try again.");
        setTimeout(() => setWorkflowError(null), 4000);
      } finally {
        setUploadingItemIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const addDraftsToQueue = async () => {
    // Validation: check for empty items
    const emptyItems = (localProject.workflow || []).filter(item => {
      if (item.type === 'text') return !item.value.trim();
      if (item.type === 'image') return !item.value;
      if (item.type === 'library') return !item.value;
      return false;
    });

    if (emptyItems.length > 0) {
      setWorkflowError(`Missing information in ${emptyItems.length} workflow ${emptyItems.length === 1 ? 'item' : 'items'}. Please fill them before adding to queue.`);
      setTimeout(() => setWorkflowError(null), 4000);
      return;
    }

    const selectedCombinations = generateJobs(localProject.workflow || [], libraries, queueCount, !!localProject.shuffle);
    if (selectedCombinations.length === 0) return;

    const newJobs: Job[] = selectedCombinations.map(combo => ({
      id: crypto.randomUUID(),
      prompt: combo.prompt,
      imageContexts: combo.imageContexts,
      status: 'draft',
      providerId: selectedProviderId,
      aspectRatio: localProject.aspectRatio || '1:1',
      quality: localProject.quality || '1K',
    }));

    const updatedProject = { ...localProject, jobs: [...localProject.jobs, ...newJobs] };
    
    await apiUpdateProject(updatedProject.id, {
      jobs: updatedProject.jobs,
      workflow: updatedProject.workflow,
      providerId: selectedProviderId,
      aspectRatio: localProject.aspectRatio,
      quality: localProject.quality,
      shuffle: localProject.shuffle,
    });

    setLocalProject(updatedProject);
    setHasChanges(false);
    // Switch to draft tab to show the new drafts
    setActiveTab('draft');
  };
  
  const toggleJobExpand = (jobId: string) => {
    setExpandedJobId(prev => prev === jobId ? null : jobId);
  };

  const runJob = async (jobId: string) => {
    const updatedJobs = localProject.jobs.map(j =>
      j.id === jobId ? { ...j, status: 'pending' as const } : j
    );
    const updatedProject = { ...localProject, jobs: updatedJobs };
    setLocalProject(updatedProject);
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try {
      await apiRunWorkflow(localProject.id);
    } catch (e) {
      console.error("Failed to run job:", e);
    }
  };

  const runAllDrafts = async () => {
    const updatedJobs = localProject.jobs.map(j =>
      j.status === 'draft' ? { ...j, status: 'pending' as const } : j
    );
    const updatedProject = { ...localProject, jobs: updatedJobs };
    setLocalProject(updatedProject);
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try {
      await apiRunWorkflow(localProject.id);
    } catch (e) {
      console.error("Failed to run all drafts:", e);
    }
  };

  const runSelectedDrafts = async () => {
    if (selectedDraftIds.size === 0) return;
    const updatedJobs = localProject.jobs.map(j =>
      selectedDraftIds.has(j.id) ? { ...j, status: 'pending' as const } : j
    );
    const updatedProject = { ...localProject, jobs: updatedJobs };
    setLocalProject(updatedProject);
    setSelectedDraftIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try {
      await apiRunWorkflow(localProject.id);
    } catch (e) {
      console.error("Failed to run selected drafts:", e);
    }
  };

  const deleteJob = async (jobId: string) => {
    const updatedJobs = localProject.jobs.filter(j => j.id !== jobId);
    const updatedProject = { ...localProject, jobs: updatedJobs };
    setLocalProject(updatedProject);
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const deleteSelectedDrafts = async () => {
    if (selectedDraftIds.size === 0) return;
    const updatedJobs = localProject.jobs.filter(j => !selectedDraftIds.has(j.id));
    const updatedProject = { ...localProject, jobs: updatedJobs };
    setLocalProject(updatedProject);
    setSelectedDraftIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const deleteAllDrafts = async () => {
    const updatedJobs = localProject.jobs.filter(j => j.status !== 'draft');
    const updatedProject = { ...localProject, jobs: updatedJobs };
    setLocalProject(updatedProject);
    setSelectedDraftIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const toggleDraftSelection = (jobId: string) => {
    setSelectedDraftIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleSelectAllDrafts = () => {
    const draftIds = localProject.jobs.filter(j => j.status === 'draft').map(j => j.id);
    if (selectedDraftIds.size === draftIds.length) {
      setSelectedDraftIds(new Set());
    } else {
      setSelectedDraftIds(new Set(draftIds));
    }
  };

  const draftJobs = localProject.jobs.filter(j => j.status === 'draft');
  const queueJobs = localProject.jobs.filter(j => j.status === 'pending' || j.status === 'processing' || j.status === 'failed');
  const completedJobs = localProject.jobs.filter(j => j.status === 'completed');
  const total = localProject.jobs.length;
  // Progress calculations for the active queue
  const activeQueueCount = localProject.jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
  const processedCount = localProject.jobs.filter(j => j.status === 'completed' || j.status === 'failed').length;
  const totalActiveQueue = activeQueueCount + processedCount;
  const progress = totalActiveQueue === 0 ? 0 : Math.round((processedCount) / totalActiveQueue * 100);

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
          <button onClick={() => addWorkflowItem('image')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <ImageIcon className="w-3 h-3" /> Img
          </button>
          <button onClick={() => addWorkflowItem('library')} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg text-neutral-400 hover:text-white transition-colors">
            <LibraryIcon className="w-3 h-3" /> Lib
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
                  <label className="block w-full text-center py-5 border border-dashed border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-800/50 hover:border-amber-500/50 transition-all group relative overflow-hidden">
                    {uploadingItemIds.has(item.id) ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-500/70">Uploading...</span>
                      </div>
                    ) : (
                      <>
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest group-hover:text-neutral-300">Choose Image</span>
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, item.id)} className="hidden" disabled={uploadingItemIds.has(item.id)} />
                      </>
                    )}
                  </label>
                  {item.value && !uploadingItemIds.has(item.id) && (
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-neutral-800 mt-2">
                       <img src={item.value} alt="Reference" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxData({ images: [item.value], index: 0 })} />
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
                {localProject.shuffle && (
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase tracking-widest flex items-center gap-1">
                    <Shuffle className="w-2.5 h-2.5" /> Shuffle
                  </span>
                )}
              </div>

              <div 
                onClick={(e) => e.stopPropagation()} 
                className="flex items-center gap-2 bg-neutral-900 px-2 py-1 rounded-md border border-neutral-800"
              >
                <input
                  type="number"
                  min="1"
                  value={queueCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      setQueueCount(val);
                      setHasManuallySetQueueCount(true);
                    }
                  }}
                  className="w-10 bg-transparent text-[10px] text-blue-400 font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center"
                />
                <span className="text-[9px] text-neutral-500 font-black" title="Total unique combinations">/ {combinations.length}</span>
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

              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Workflow Options
                </label>
                <button
                  onClick={() => {
                    const updated = { ...localProject, shuffle: !localProject.shuffle };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                    localProject.shuffle
                      ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${localProject.shuffle ? 'bg-blue-500 text-white' : 'bg-neutral-900 text-neutral-600'}`}>
                      <Shuffle className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-left">
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${localProject.shuffle ? 'text-blue-400' : 'text-neutral-400'}`}>
                        Shuffle Workflow
                      </div>
                      <div className="text-[9px] opacity-60 font-medium">Randomize combinations order</div>
                    </div>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-all duration-300 ${localProject.shuffle ? 'bg-blue-500' : 'bg-neutral-800'}`}>
                    <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all duration-300 ${localProject.shuffle ? 'left-5' : 'left-1'}`} />
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className={`transition-all duration-300 overflow-hidden ${workflowError ? 'max-h-12 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`}>
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-bold text-red-500 shadow-lg shadow-red-500/5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="line-clamp-2">{workflowError}</span>
            </div>
          </div>

          <button
            onClick={addDraftsToQueue}
            disabled={localProject.workflow.length === 0 || uploadingItemIds.size > 0}
            className="w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:grayscale shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            {uploadingItemIds.size > 0 ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading Images...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add to Draft
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Pane: Jobs Grid */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="p-3 border-b border-neutral-800 bg-neutral-900/20 backdrop-blur-md shadow-sm flex justify-center">
          <div className="flex bg-neutral-950 border border-neutral-800 rounded-xl p-1 w-full max-w-lg">
            <button 
              onClick={() => setActiveTab('draft')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === 'draft' 
                  ? 'bg-neutral-800/80 text-white shadow-sm border border-neutral-700/50' 
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> Draft ({draftJobs.length})
            </button>
            <button 
              onClick={() => setActiveTab('queue')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === 'queue' 
                  ? 'bg-neutral-800/80 text-white shadow-sm border border-neutral-700/50' 
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Queue ({queueJobs.length})
            </button>
            <button 
              onClick={() => setActiveTab('album')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === 'album' 
                  ? 'bg-neutral-800/80 text-white shadow-sm border border-neutral-700/50' 
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'
              }`}
            >
              <Grid className="w-3.5 h-3.5" /> Album ({completedJobs.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 md:space-y-12 custom-scrollbar">
          
          {/* Draft Section */}
          {activeTab === 'draft' && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col gap-4">
                {draftJobs.length > 0 && (
                  <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={toggleSelectAllDrafts}
                        className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
                      >
                        {selectedDraftIds.size === draftJobs.length ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                        Select All
                      </button>
                      
                      {selectedDraftIds.size > 0 && (
                        <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                            {selectedDraftIds.size} Selected
                          </span>
                          <button 
                            onClick={() => setShowDeleteSelectedModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                          >
                            <Trash2 className="w-3 h-3" /> Delete Selected
                          </button>
                          <button 
                            onClick={runSelectedDrafts}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all"
                          >
                            <Play className="w-3 h-3 fill-current" /> Start Selected
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowDeleteAllDraftsModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-neutral-500 hover:text-red-400 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                        title="Delete All Drafts"
                      >
                        <Trash2 className="w-3 h-3" /> Delete All
                      </button>
                      <button 
                        onClick={runAllDrafts}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Start All Now
                      </button>
                    </div>
                  </div>
                )}
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-inner">
                  <div className="p-4 space-y-3">
                    {draftJobs.map(task => {
                      const isExpanded = expandedJobId === task.id;
                      return (
                        <div key={task.id} className="flex flex-col gap-0 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className={`bg-neutral-950/50 p-4 rounded-xl border flex justify-between items-center transition-all cursor-pointer group/task ${isExpanded ? 'border-blue-500/50 bg-neutral-900/50 rounded-b-none' : 'border-neutral-800 hover:border-neutral-700'}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); toggleDraftSelection(task.id); }}
                                   className="p-1 hover:bg-neutral-800 rounded transition-colors"
                                 >
                                   {selectedDraftIds.has(task.id) ? (
                                     <CheckSquare className="w-4 h-4 text-blue-500" />
                                   ) : (
                                     <Square className="w-4 h-4 text-neutral-600" />
                                   )}
                                 </button>
                                 <div 
                                   className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                                   onClick={() => toggleJobExpand(task.id)}
                                 >
                                   <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />
                                 </div>
                                 <span 
                                   className={`text-xs font-medium truncate pr-6 ${isExpanded ? 'text-white' : 'text-neutral-400'}`} 
                                   title={task.prompt}
                                   onClick={() => toggleJobExpand(task.id)}
                                 >
                                   {task.prompt}
                                 </span>
                              </div>
                            <div className="flex items-center gap-2">
                              {task.aspectRatio && (
                                <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                                  {task.aspectRatio}
                                </span>
                              )}
                              {task.quality && (
                                <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                                  {task.quality}
                                </span>
                              )}
                              <span className="text-[9px] font-bold text-amber-500/70 uppercase tracking-widest px-2.5 py-1.5 bg-amber-500/5 rounded-lg border border-amber-500/20">Draft</span>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); runJob(task.id); }}
                                  className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-500/20"
                                  title="Run Job"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setJobToDeleteId(task.id); }}
                                  className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="Delete Job"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="bg-neutral-900/30 border-x border-b border-blue-500/30 rounded-b-xl p-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
                               <div className="space-y-2">
                                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">Full Prompt</label>
                                  <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-3 rounded-lg border border-neutral-800 select-all whitespace-pre-wrap">
                                    {task.prompt}
                                  </div>
                               </div>
                               {task.imageContexts && task.imageContexts.length > 0 && (
                                 <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">Visual Contexts</label>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                                      {task.imageContexts.map((ctx, idx) => (
                                        <div key={idx} className="group/ctx relative aspect-square rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-sm transition-all hover:scale-110 hover:shadow-xl hover:z-10 hover:border-blue-500/50">
                                          <img 
                                            src={ctx} 
                                            alt={`Context ${idx + 1}`} 
                                            className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                                            loading="lazy"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setLightboxData({ images: task.imageContexts || [], index: idx });
                                            }}
                                          />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/ctx:opacity-100 transition-opacity flex items-end p-1.5 pointer-events-none">
                                            <span className="text-[8px] font-black text-white/70 uppercase tracking-widest truncate">C_{idx + 1}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                 </div>
                               )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {draftJobs.length === 0 && (
                      <div className="py-24 text-center text-neutral-600">
                        <Plus className="w-12 h-12 mx-auto opacity-10 mb-4" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Add items to start a draft</div>
                        <div className="text-[9px] opacity-40 mt-2">Use the left configuration panel</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Queue Section */}
          {activeTab === 'queue' && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col gap-8">
                {/* Active Jobs */}
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-inner">
                  <div className="p-4 space-y-3">
                    {queueJobs.map(task => {
                      const isExpanded = expandedJobId === task.id;
                      return (
                        <div key={task.id} className="flex flex-col gap-0 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div 
                            onClick={() => toggleJobExpand(task.id)}
                            className={`bg-neutral-950/50 p-4 rounded-xl border flex justify-between items-center transition-all cursor-pointer group/task ${isExpanded ? 'border-blue-500/50 bg-neutral-900/50 rounded-b-none' : 'border-neutral-800 hover:border-neutral-700'} ${task.status === 'failed' ? 'border-red-900/30 bg-red-950/5' : ''}`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                               <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                 <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />
                               </div>
                               <span className={`text-xs font-medium truncate pr-6 ${isExpanded ? 'text-white' : 'text-neutral-400'}`} title={task.prompt}>
                                 {task.prompt}
                               </span>
                            </div>
                              <div className="flex-shrink-0 ml-4 flex items-center gap-3">
                                {task.aspectRatio && (
                                  <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                                    {task.aspectRatio}
                                  </span>
                                )}
                                {task.quality && (
                                  <span className="text-[8px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                                    {task.quality}
                                  </span>
                                )}
                                {task.status === 'processing' && (
                                  <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-widest bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Running
                                  </div>
                                )}
                                {task.status === 'pending' && <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800 shadow-sm">Queued</span>}
                                {task.status === 'failed' && <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest px-3 py-1.5 bg-red-500/10 rounded-lg border border-red-500/20">Failed</span>}
                              
                              <div className="flex items-center gap-1">
                                {(task.status === 'failed' || task.status === 'pending') && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); runJob(task.id); }}
                                    className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                    title="Retry Job"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setJobToDeleteId(task.id); }}
                                  className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="Delete Job"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className={`bg-neutral-900/30 border-x border-b rounded-b-xl p-4 space-y-4 animate-in slide-in-from-top-1 duration-200 ${task.status === 'failed' ? 'border-red-500/30' : 'border-blue-500/30'}`}>
                               <div className="space-y-2">
                                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">Full Prompt</label>
                                  <div className="text-xs text-neutral-300 leading-relaxed bg-neutral-950/50 p-3 rounded-lg border border-neutral-800 select-all whitespace-pre-wrap font-mono">
                                    {task.prompt}
                                  </div>
                               </div>
                               {task.imageContexts && task.imageContexts.length > 0 && (
                                 <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">Visual Contexts</label>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                                      {task.imageContexts.map((ctx, idx) => (
                                        <div key={idx} className="group/ctx relative aspect-square rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-sm transition-all hover:scale-110 hover:shadow-xl hover:z-10 hover:border-blue-500/50">
                                          <img 
                                            src={ctx} 
                                            alt={`Context ${idx + 1}`} 
                                            className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                                            loading="lazy"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setLightboxData({ images: task.imageContexts || [], index: idx });
                                            }}
                                          />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/ctx:opacity-100 transition-opacity flex items-end p-1.5 pointer-events-none">
                                            <span className="text-[8px] font-black text-white/70 uppercase tracking-widest truncate">C_{idx + 1}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                 </div>
                               )}
                               {task.status === 'failed' && (
                                  <div className="space-y-2">
                                     <label className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500/70">Error Details</label>
                                     <div className="text-[10px] font-mono text-red-400 bg-red-950/20 p-3 rounded-lg border border-red-500/20 break-all leading-tight">
                                       {task.error || 'Unknown error occurred'}
                                     </div>
                                  </div>
                               )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {queueJobs.length === 0 && (
                      <div className="py-24 text-center text-neutral-600">
                        <List className="w-12 h-12 mx-auto opacity-10 mb-4" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Queue is clear</div>
                        <div className="text-[9px] opacity-40 mt-2">Active jobs will appear here</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Album Section */}
          {activeTab === 'album' && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {completedJobs.length === 0 ? (
                <div className="bg-neutral-900/20 border-2 border-dashed border-neutral-800 rounded-3xl p-12 md:p-24 text-center text-neutral-500 flex flex-col items-center gap-6 transition-colors hover:border-neutral-700 shadow-inner">
                  <ImageIcon className="w-16 h-16 text-neutral-800 animate-pulse" />
                  <div>
                    <p className="text-sm font-bold text-neutral-400 tracking-wider uppercase">Gallery is empty</p>
                    <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">Start a generation to build your album</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {completedJobs.map(job => (
                    <div key={job.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col group hover:border-blue-500/50 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10 active:scale-100">
                      <div className="aspect-square bg-neutral-950 relative flex items-center justify-center overflow-hidden">
                        <img src={job.imageUrl} alt={job.prompt} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 shadow-lg cursor-pointer" referrerPolicy="no-referrer" onClick={(e) => {
                            e.stopPropagation();
                            const validJobs = completedJobs.filter(j => j.imageUrl);
                            const imgUrls = validJobs.map(j => j.imageUrl as string);
                            const idx = imgUrls.indexOf(job.imageUrl as string);
                            setLightboxData({ images: imgUrls, index: idx >= 0 ? idx : 0 });
                          }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                      </div>
                      <div className="p-4 bg-neutral-900/80 backdrop-blur-sm">
                        <p className="text-[10px] leading-relaxed text-neutral-400 line-clamp-3 font-medium mb-3" title={job.prompt}>
                          {job.prompt}
                        </p>
                        <div className="flex items-center gap-2">
                          {job.aspectRatio && (
                            <span className="text-[8px] font-bold text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                              {job.aspectRatio}
                            </span>
                          )}
                          {job.quality && (
                            <span className="text-[8px] font-bold text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                              {job.quality}
                            </span>
                          )}
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
        isOpen={showDeleteSelectedModal}
        onClose={() => setShowDeleteSelectedModal(false)}
        onConfirm={deleteSelectedDrafts}
        title="Delete Selected Drafts"
        message={`Are you sure you want to delete ${selectedDraftIds.size} selected drafts? This action cannot be undone.`}
        confirmText="Delete Selected"
        type="danger"
      />

      <ConfirmModal
        isOpen={showDeleteAllDraftsModal}
        onClose={() => setShowDeleteAllDraftsModal(false)}
        onConfirm={deleteAllDrafts}
        title="Delete All Drafts"
        message={`Are you sure you want to delete all ${draftJobs.length} draft tasks? This action cannot be undone.`}
        confirmText="Delete All"
        type="danger"
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

      <ConfirmModal
        isOpen={jobToDeleteId !== null}
        onClose={() => setJobToDeleteId(null)}
        onConfirm={() => {
          if (jobToDeleteId) {
            deleteJob(jobToDeleteId);
            setJobToDeleteId(null);
          }
        }}
        title="Delete Job"
        message="Are you sure you want to delete this job? This action cannot be undone."
        confirmText="Delete Job"
        type="danger"
      />

      <LibrarySelectionModal
        isOpen={showLibrarySelector}
        onClose={() => setShowLibrarySelector(false)}
        onSelect={handleLibrarySelect}
        libraries={libraries}
        selectedLibraryIds={(localProject.workflow || [])
          .filter(item => item.type === 'library')
          .map(item => item.value)}
      />

      <LibraryPreviewModal
        library={previewingLibrary}
        onClose={() => setPreviewingLibrary(null)}
      />

      {lightboxData && (
        <ImageLightbox 
          images={lightboxData.images}
          startIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  );
}

function LibrarySelectionModal({ isOpen, onClose, onSelect, libraries, selectedLibraryIds }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSelect: (id: string) => void; 
  libraries: Library[];
  selectedLibraryIds: string[];
}) {
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
              {libraries.map(lib => {
                const isSelected = selectedLibraryIds.includes(lib.id);
                return (
                  <button
                    key={lib.id}
                    onClick={() => !isSelected && onSelect(lib.id)}
                    disabled={isSelected}
                    className={`group flex items-start gap-4 p-5 border rounded-2xl text-left transition-all ${
                      isSelected 
                        ? 'bg-neutral-900/20 border-neutral-800 opacity-50 cursor-not-allowed' 
                        : 'bg-neutral-950/40 border-neutral-800 hover:bg-neutral-800 hover:border-emerald-500/30 hover:scale-[1.02] active:scale-100'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {lib.type === 'image' && lib.items[0]?.content ? (
                        <div className={`w-12 h-12 rounded-xl overflow-hidden border shadow-md ${isSelected ? 'border-neutral-800 grayscale' : 'border-neutral-800'}`}>
                          <img src={lib.items[0].content} alt={lib.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className={`p-3 bg-neutral-900 rounded-xl border transition-all ${isSelected ? 'border-neutral-800' : 'border-neutral-800 group-hover:bg-neutral-950 group-hover:border-emerald-500/20'}`}>
                          <LibraryIcon className={`w-6 h-6 ${isSelected ? 'text-neutral-600' : 'text-emerald-500'}`} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 pt-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-neutral-500' : 'text-neutral-100 group-hover:text-white'}`}>
                          {lib.name}
                        </div>
                        {isSelected && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            Added
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                          isSelected 
                            ? 'bg-neutral-900/50 border-neutral-800 text-neutral-600' 
                            : 'bg-neutral-900 border-neutral-800 text-neutral-500 group-hover:border-neutral-700'
                        }`}>
                          {lib.type}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelected ? 'text-neutral-700' : 'text-neutral-600'}`}>
                          {lib.items.length} items
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
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

function TextLibraryItem({ item }: { item: LibraryItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={`bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 cursor-pointer transition-all hover:border-emerald-500/30 hover:bg-neutral-800/50 group/text-item ${isExpanded ? 'shadow-xl border-emerald-500/20 ring-1 ring-emerald-500/10' : 'shadow-sm'}`}
    >
      <div className="flex justify-between gap-4">
        <div className="flex-1 min-w-0">
          {item.title && (
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2.5 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              {item.title}
            </div>
          )}
          <p className={`text-neutral-300 text-sm leading-relaxed transition-all whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-1'}`}>
            {item.content}
          </p>
        </div>
        <div className={`p-1.5 rounded-lg bg-neutral-950/50 border border-neutral-800/50 group-hover/text-item:bg-neutral-800 transition-all self-start ${isExpanded ? 'rotate-180 bg-emerald-500/10 border-emerald-500/20' : ''}`}>
           <ChevronDown className={`w-4 h-4 transition-colors ${isExpanded ? 'text-emerald-500' : 'text-neutral-600 group-hover/text-item:text-neutral-400'}`} />
        </div>
      </div>
    </div>
  );
}

function LibraryPreviewModal({ library, onClose }: { library: Library | null; onClose: () => void }) {
  const [previewLightbox, setPreviewLightbox] = useState<{images: string[], index: number} | null>(null);
  
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
          <div className={library.type === 'text' ? "max-w-4xl mx-auto space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
            {library.items.map(item => (
              library.type === 'text' ? (
                <TextLibraryItem key={item.id} item={item} />
              ) : (
                <div key={item.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                  {library.type === 'image' && (
                    <div className="aspect-video bg-black relative border-b border-neutral-800">
                      <img src={item.content} alt={item.content} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                        const imageItems = library.items.filter(i => i.content).map(i => i.content);
                        const idx = imageItems.indexOf(item.content);
                        setPreviewLightbox({ images: imageItems, index: idx >= 0 ? idx : 0 });
                      }} />
                    </div>
                  )}
                  <div className="p-4 flex-1">
                    {item.title && (
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2">{item.title}</div>
                    )}
                    <p className="text-neutral-400 text-[11px] line-clamp-4 leading-relaxed">
                      <span className="opacity-60 italic whitespace-nowrap overflow-hidden text-ellipsis block">{item.content}</span>
                    </p>
                  </div>
                </div>
              )
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
      {previewLightbox && (
        <ImageLightbox 
          images={previewLightbox.images}
          startIndex={previewLightbox.index}
          onClose={() => setPreviewLightbox(null)}
        />
      )}
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

export function ImageLightbox({ images, startIndex, onClose }: { images: string[], startIndex: number, onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = React.useState(startIndex);
  
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
      if (e.key === 'ArrowRight') setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  if (!images || images.length === 0) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
  };
  
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
        <X className="w-6 h-6" />
      </button>
      
      {images.length > 1 && (
        <button onClick={handlePrev} className="absolute left-2 md:left-8 p-3 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      
      <img 
        src={images[currentIndex]} 
        alt={`Preview ${currentIndex + 1}`} 
        className="max-w-[90vw] max-h-[90vh] object-contain select-none"
        onClick={(e) => e.stopPropagation()} 
      />
      
      {images.length > 1 && (
        <button onClick={handleNext} className="absolute right-2 md:right-8 p-3 text-white/50 hover:text-white transition-colors z-10 bg-black/50 hover:bg-black/80 rounded-full">
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
      
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/50 rounded-full text-white/80 text-xs font-bold tracking-widest backdrop-blur-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

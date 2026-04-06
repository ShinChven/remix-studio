import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Project, Job, Library, WorkflowItem as WorkflowItemType, WorkflowItemType as WorkflowItemTypeKind, Provider, AlbumItem } from '../types';
import { saveImage, fetchProviders, fetchProject as apiFetchProject, updateProject as apiUpdateProject, runProjectWorkflow as apiRunWorkflow, imageDisplayUrl as apiImageDisplayUrl, moveToTrash, moveToTrashBatch } from '../api';
import { CheckCircle2, List, Grid, ChevronLeft, Type, ImageIcon, Library as LibraryIcon, Plus, Settings, Trash2, Eraser, FileArchive } from 'lucide-react';
import { generateWorkflowCombinations, generateJobs } from '../lib/remixEngine';
import { ConfirmModal } from './ConfirmModal';

// Sub-components
import { ModelSelectorModal } from './ProjectViewer/ModelSelectorModal';
import { LibrarySelectionModal } from './ProjectViewer/LibrarySelectionModal';
import { LibraryPreviewModal } from './ProjectViewer/LibraryPreviewModal';
import { PromptModal } from './ProjectViewer/PromptModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';
import { WorkflowItem } from './ProjectViewer/WorkflowItem';
import { SettingsPanel } from './ProjectViewer/SettingsPanel';
import { DraftsTab } from './ProjectViewer/DraftsTab';
import { QueueTab } from './ProjectViewer/QueueTab';
import { CompletedTab } from './ProjectViewer/CompletedTab';
import { AlbumTab } from './ProjectViewer/AlbumTab';

interface Props {
  project: Project;
  libraries: Library[];
  onUpdate: (project: Project) => void;
  onDelete: () => void;
}

export function ProjectViewer({ project, libraries, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'draft' | 'queue' | 'completed' | 'album') || 'draft';
  const setActiveTab = (tab: 'draft' | 'queue' | 'completed' | 'album') => {
    setSearchParams({ tab }, { replace: true });
  };

  const [localProject, setLocalProject] = useState<Project>(project);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [itemToRemoveId, setItemToRemoveId] = useState<string | null>(null);
  const [jobToDeleteId, setJobToDeleteId] = useState<string | null>(null);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [showDeleteAllDraftsModal, setShowDeleteAllDraftsModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkflowItemType | null>(null);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [previewingLibrary, setPreviewingLibrary] = useState<Library | null>(null);
  const [previewingWorkflowItemId, setPreviewingWorkflowItemId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(project.providerId || '');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [hasManuallySetQueueCount, setHasManuallySetQueueCount] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [uploadingItemIds, setUploadingItemIds] = useState<Set<string>>(new Set());
  const [selectingLibraryForItemId, setSelectingLibraryForItemId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [lightboxData, setLightboxData] = useState<{ images: string[], index: number } | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'workflow' | 'jobs'>('workflow');
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set());
  const [lastSelectedAlbumId, setLastSelectedAlbumId] = useState<string | null>(null);
  const [showDeleteAlbumModal, setShowDeleteAlbumModal] = useState(false);
  const [showDeleteCompletedSelectedModal, setShowDeleteCompletedSelectedModal] = useState(false);
  const [albumItemsToDelete, setAlbumItemsToDelete] = useState<AlbumItem[] | null>(null);
  const [selectedCompletedIds, setSelectedCompletedIds] = useState<Set<string>>(new Set());

  const projectRef = useRef(localProject);
  const skipProjectSyncRef = useRef(false);
  const isProcessing = localProject.jobs.some(j => j.status === 'pending' || j.status === 'processing');

  useEffect(() => {
    if (skipProjectSyncRef.current) {
      skipProjectSyncRef.current = false;
      return;
    }
    setLocalProject(project);
  }, [project]);

  useEffect(() => {
    projectRef.current = localProject;
  }, [localProject]);

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      interval = setInterval(async () => {
        try {
          const updated = await apiFetchProject(localProject.id);
          const jobsChanged = JSON.stringify(updated.jobs) !== JSON.stringify(localProject.jobs);
          const albumChanged = JSON.stringify(updated.album) !== JSON.stringify(localProject.album);
          if (jobsChanged || albumChanged) {
            setLocalProject(updated);
          }
        } catch (e) {
          console.error('Polling for project updates failed:', e);
        }
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, localProject.id, localProject.jobs, localProject.album]);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProviders();
        setProviders(p);
        if (p.length > 0) {
          const defaultProv = p.find(prov => prov.id === project.providerId) || p[0];
          setSelectedProviderId(defaultProv.id);
          if (defaultProv.models.length > 0) {
            const savedModelId = project.modelConfigId;
            const modelExists = defaultProv.models.some(m => m.id === savedModelId);
            setSelectedModelId(modelExists ? savedModelId! : defaultProv.models[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to fetch providers:', e);
      }
    })();
  }, []);

  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const selectedModel = selectedProvider?.models.find(m => m.id === selectedModelId);

  const getProviderName = (id?: string) => id ? providers.find(p => p.id === id)?.name || id : 'Unknown Provider';
  const getModelName = (providerId?: string, modelId?: string) => {
    if (!modelId) return 'Unknown Model';
    return providers.find(p => p.id === providerId)?.models.find(m => m.id === modelId)?.name || modelId;
  };

  useEffect(() => {
    if (selectedModel) {
      let needsUpdate = false;
      const updated = { ...localProject };
      if (!selectedModel.options.aspectRatios.includes(localProject.aspectRatio || '')) {
        updated.aspectRatio = selectedModel.options.aspectRatios[0];
        needsUpdate = true;
      }
      if (!selectedModel.options.qualities.includes(localProject.quality || '')) {
        updated.quality = selectedModel.options.qualities[0];
        needsUpdate = true;
      }
      if (needsUpdate) {
        setLocalProject(updated);
        onUpdate(updated);
      }
    }
  }, [selectedModelId, selectedModel]);

  const combinations = generateWorkflowCombinations(localProject.workflow || [], libraries);

  useEffect(() => {
    if (!hasManuallySetQueueCount) {
      setQueueCount(combinations.length);
    }
  }, [combinations.length]);

  const addWorkflowItem = (type: WorkflowItemTypeKind) => {
    if (type === 'library') {
      setShowLibrarySelector(true);
      return;
    }
    const newItem: WorkflowItemType = { id: crypto.randomUUID(), type, value: '' };
    const updated = { ...localProject, workflow: [...(localProject.workflow || []), newItem] };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const handleLibrarySelect = (libraryId: string) => {
    if ((localProject.workflow || []).some(item => item.type === 'library' && item.value === libraryId)) {
      setShowLibrarySelector(false);
      return;
    }
    const newItem: WorkflowItemType = { id: crypto.randomUUID(), type: 'library', value: libraryId };
    const updated = { ...localProject, workflow: [...(localProject.workflow || []), newItem] };
    setLocalProject(updated);
    onUpdate(updated);
    setShowLibrarySelector(false);
  };

  const handleImageFromLibrarySelect = (libraryId: string, imageKey: string) => {
    if (!selectingLibraryForItemId) return;
    const item = localProject.workflow.find(i => i.id === selectingLibraryForItemId);
    if (!item) return;

    updateWorkflowItem(selectingLibraryForItemId, imageKey);
    setSelectingLibraryForItemId(null);
  };

  const updateWorkflowItem = (id: string, value: string, thumbnailUrl?: string, optimizedUrl?: string, size?: number) => {
    const updated = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, value, thumbnailUrl, optimizedUrl, size } : item) };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const updateWorkflowItemTags = (id: string, selectedTags: string[]) => {
    const updated = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, selectedTags } : item) };
    setLocalProject(updated);
    onUpdate(updated);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingItemIds(prev => new Set(prev).add(id));
      const reader = new FileReader();
      const base64Promise = new Promise<string>(resolve => {
        reader.onload = (e) => resolve(e.target?.result as string);
      });
      reader.readAsDataURL(file);
      try {
        const base64 = await base64Promise;
        const { key, url, thumbnailKey, thumbnailUrl, optimizedKey, optimizedUrl, size } = await saveImage(base64, localProject.id);
        // Persist bare keys to DB (server will presign on GET)
        const dbProject = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, value: key, thumbnailUrl: thumbnailKey, optimizedUrl: optimizedKey, size } : item) };
        skipProjectSyncRef.current = true;
        onUpdate(dbProject);
        // Display presigned URLs in local state for immediate rendering
        setLocalProject(prev => ({ ...prev, workflow: prev.workflow.map(item => item.id === id ? { ...item, value: url, thumbnailUrl, optimizedUrl, size } : item) }));
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
    const emptyItems = (localProject.workflow || []).filter(item => !item.value.trim());
    if (emptyItems.length > 0) {
      setWorkflowError(`Missing information in ${emptyItems.length} workflow ${emptyItems.length === 1 ? 'item' : 'items'}.`);
      setTimeout(() => setWorkflowError(null), 4000);
      return;
    }
    const selectedCombinations = generateJobs(localProject.workflow || [], libraries, queueCount, !!localProject.shuffle);
    if (selectedCombinations.length === 0) return;
    const newJobs: Job[] = selectedCombinations.map(combo => {
      const shortuuid = crypto.randomUUID().slice(0, 8);
      const parts = [
        localProject.prefix,
        ...combo.filenameParts,
        shortuuid
      ].filter(Boolean);
      // Sanitize filename: remove invalid characters and truncate to 200 chars
      const filename = parts.join('_').replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 200);

      return {
        id: crypto.randomUUID(),
        prompt: combo.prompt,
        imageContexts: combo.imageContexts,
        status: 'draft',
        providerId: selectedProviderId,
        modelConfigId: selectedModelId,
        aspectRatio: localProject.aspectRatio || (selectedModel?.options.aspectRatios[0] || '1:1'),
        quality: localProject.quality || (selectedModel?.options.qualities[0] || '1K'),
        format: localProject.format || 'png',
        filename: filename
      };
    });
    const updatedProject = { ...localProject, jobs: [...localProject.jobs, ...newJobs] };
    await apiUpdateProject(updatedProject.id, {
      jobs: updatedProject.jobs, workflow: updatedProject.workflow, providerId: selectedProviderId,
      aspectRatio: localProject.aspectRatio, quality: localProject.quality, format: localProject.format || 'png', shuffle: localProject.shuffle,
    });
    setLocalProject(updatedProject);
    setActiveTab('draft');
  };

  const toggleJobExpand = (jobId: string) => setExpandedJobId(prev => prev === jobId ? null : jobId);

  const runJob = async (jobId: string) => {
    const updatedJobs = localProject.jobs.map(j => j.id === jobId ? { ...j, status: 'pending' as const } : j);
    setLocalProject({ ...localProject, jobs: updatedJobs });
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try {
      await apiRunWorkflow(localProject.id);
      setActiveTab('queue');
    } catch (e) {
      console.error("Failed to run job:", e);
    }
  };

  const runAllDrafts = async () => {
    const updatedJobs = localProject.jobs.map(j => j.status === 'draft' ? { ...j, status: 'pending' as const } : j);
    setLocalProject({ ...localProject, jobs: updatedJobs });
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try {
      await apiRunWorkflow(localProject.id);
      setActiveTab('queue');
    } catch (e) {
      console.error("Failed to run all drafts:", e);
    }
  };

  const runSelectedDrafts = async () => {
    const updatedJobs = localProject.jobs.map(j => selectedDraftIds.has(j.id) ? { ...j, status: 'pending' as const } : j);
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedDraftIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try {
      await apiRunWorkflow(localProject.id);
      setActiveTab('queue');
    } catch (e) {
      console.error("Failed to run selected drafts:", e);
    }
  };

  const deleteJob = async (jobId: string) => {
    const updatedJobs = localProject.jobs.filter(j => j.id !== jobId);
    setLocalProject({ ...localProject, jobs: updatedJobs });
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const deleteSelectedDrafts = async () => {
    const updatedJobs = localProject.jobs.filter(j => !selectedDraftIds.has(j.id));
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedDraftIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const deleteAllDrafts = async () => {
    const updatedJobs = localProject.jobs.filter(j => j.status !== 'draft');
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedDraftIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const toggleDraftSelection = (jobId: string) => {
    setSelectedDraftIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAllDrafts = () => {
    const draftIds = localProject.jobs.filter(j => j.status === 'draft').map(j => j.id);
    setSelectedDraftIds(selectedDraftIds.size === draftIds.length ? new Set() : new Set(draftIds));
  };

  const toggleQueueSelection = (jobId: string) => {
    setSelectedQueueIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAllQueue = () => {
    const queueIds = localProject.jobs.filter(j => j.status === 'pending' || j.status === 'processing' || j.status === 'failed').map(j => j.id);
    setSelectedQueueIds(selectedQueueIds.size === queueIds.length ? new Set() : new Set(queueIds));
  };

  const retrySelectedQueue = async () => {
    const updatedJobs = localProject.jobs.map(j => (selectedQueueIds.has(j.id) && (j.status === 'failed' || j.status === 'pending')) ? { ...j, status: 'pending' as const, error: undefined } : j);
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedQueueIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
    try { await apiRunWorkflow(localProject.id); } catch (e) { console.error("Failed to retry selected:", e); }
  };

  const deleteSelectedQueue = async () => {
    const updatedJobs = localProject.jobs.filter(j => !selectedQueueIds.has(j.id));
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedQueueIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const clearAllFailed = async () => {
    const updatedJobs = localProject.jobs.filter(j => j.status !== 'failed');
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedQueueIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };
  
  const toggleCompletedSelection = (jobId: string) => {
    setSelectedCompletedIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAllCompleted = () => {
    const completedIds = localProject.jobs.filter(j => j.status === 'completed').map(j => j.id);
    setSelectedCompletedIds(selectedCompletedIds.size === completedIds.length ? new Set() : new Set(completedIds));
  };

  const deleteSelectedCompleted = async () => {
    const updatedJobs = localProject.jobs.filter(j => !selectedCompletedIds.has(j.id));
    setLocalProject({ ...localProject, jobs: updatedJobs });
    setSelectedCompletedIds(new Set());
    await apiUpdateProject(localProject.id, { jobs: updatedJobs });
  };

  const toggleAlbumSelection = (id: string, isShiftPressed: boolean) => {
    setSelectedAlbumIds(prev => {
      const next = new Set(prev);
      const album = localProject.album || [];
      if (isShiftPressed && lastSelectedAlbumId && next.has(lastSelectedAlbumId)) {
        const lastIndex = album.findIndex(item => item.id === lastSelectedAlbumId);
        const currentIndex = album.findIndex(item => item.id === id);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          for (let i = start; i <= end; i++) next.add(album[i].id);
        }
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
    setLastSelectedAlbumId(id);
  };

  const toggleSelectAllAlbum = () => {
    const albumIds = (localProject.album || []).map(item => item.id);
    setSelectedAlbumIds(selectedAlbumIds.size === albumIds.length ? new Set() : new Set(albumIds));
  };

  const deleteAlbumItems = async (items: AlbumItem[]) => {
    try {
      const itemIds = items.map(i => i.id);
      if (itemIds.length === 1) await moveToTrash(localProject.id, itemIds[0]); else await moveToTrashBatch(localProject.id, itemIds);
      const itemIdsSet = new Set(itemIds);
      const updatedAlbum = (localProject.album || []).filter(item => !itemIdsSet.has(item.id));
      setLocalProject({ ...localProject, album: updatedAlbum });
      setSelectedAlbumIds(prev => {
        const next = new Set(prev);
        itemIdsSet.forEach(id => next.delete(id));
        return next;
      });
    } catch (e) {
      console.error('Failed to move items to trash:', e);
      alert('Failed to move items to trash');
    }
  };

  const draftJobs = localProject.jobs.filter(j => j.status === 'draft');
  const queueJobs = localProject.jobs.filter(j => ['pending', 'processing', 'failed'].includes(j.status));
  const completedJobs = localProject.jobs.filter(j => j.status === 'completed');
  const albumItems = localProject.album || [];

  return (
    <div className="flex flex-col lg:flex-row h-full bg-neutral-950 overflow-hidden lg:overflow-visible">
      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        providers={providers}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        onSelect={(providerId, modelId) => {
          setSelectedProviderId(providerId); setSelectedModelId(modelId); setIsModelSelectorOpen(false);
          const updated = { ...localProject, providerId }; setLocalProject(updated); onUpdate(updated);
        }}
      />

      {document.getElementById('mobile-header-actions') && createPortal(
        <button
          onClick={() => setMobileView(mobileView === 'workflow' ? 'jobs' : 'workflow')}
          className="lg:hidden px-3 py-1.5 bg-blue-600/10 text-blue-500 rounded-xl hover:bg-blue-600/20 transition-all flex items-center gap-1.5 border border-blue-500/10 active:scale-95"
        >
          {mobileView === 'workflow' ? (<><List className="w-3.5 h-3.5" /><span className="text-[10px] font-black uppercase tracking-widest leading-none">Jobs</span></>) : (<><ChevronLeft className="w-3.5 h-3.5" /><span className="text-[10px] font-black uppercase tracking-widest leading-none">Back</span></>)}
        </button>,
        document.getElementById('mobile-header-actions')!
      )}

      {/* Left Pane: Workflow Builder */}
      <div className={`w-full lg:w-96 lg:h-full border-b lg:border-b-0 lg:border-r border-neutral-800 bg-neutral-900/30 flex-col flex-shrink-0 ${mobileView === 'workflow' ? 'flex h-full' : 'hidden lg:flex'}`}>
        <div className="p-4 border-b border-neutral-800 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center justify-between gap-2 flex-1 group">
              <h2 className="text-xl font-bold text-white truncate tracking-tight">{localProject.name}</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(`/project/${project.id}/edit`)}
                  className="p-1.5 text-neutral-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-green-400/10 rounded-lg"
                  title="Edit Project Information"
                ><Settings className="w-4 h-4" /></button>
                <button
                  onClick={() => navigate(`/project/${project.id}/orphans`)}
                  className="p-1.5 text-neutral-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-400/10 rounded-lg"
                  title="Manage Orphan Files (Cleanup)"
                ><Eraser className="w-4 h-4" /></button>
              </div>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar lg:max-h-none">
          {(localProject.workflow || []).map((item, index) => (
            <WorkflowItem
              key={item.id} item={item} index={index} draggedIndex={draggedIndex} dragOverIndex={dragOverIndex}
              onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
              onRemove={setItemToRemoveId} onEdit={setEditingItem} onPreviewLibrary={(lib) => {
                setPreviewingLibrary(lib);
                setPreviewingWorkflowItemId(item.id);
              }}
              onImageUpload={handleImageUpload} uploadingItemIds={uploadingItemIds} libraries={libraries}
              onLightbox={(images, index) => setLightboxData({ images, index })}
              onUpdateTags={updateWorkflowItemTags}
              onSelectFromLibrary={(id) => setSelectingLibraryForItemId(id)}
            />
          ))}
          {(localProject.workflow || []).length === 0 && (
            <div className="text-center text-neutral-600 text-[10px] font-bold uppercase tracking-widest py-12 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">Build your workflow</div>
          )}
        </div>

        <SettingsPanel
          localProject={localProject} setLocalProject={setLocalProject} onUpdate={onUpdate}
          providers={providers} selectedProviderId={selectedProviderId} selectedModelId={selectedModelId}
          isSettingsCollapsed={isSettingsCollapsed} setIsSettingsCollapsed={setIsSettingsCollapsed}
          queueCount={queueCount} setQueueCount={setQueueCount} setHasManuallySetQueueCount={setHasManuallySetQueueCount}
          combinations={combinations} setIsModelSelectorOpen={setIsModelSelectorOpen} isProcessing={isProcessing}
          workflowError={workflowError} uploadingItemIds={uploadingItemIds} onAddDraftsToQueue={addDraftsToQueue}
        />
      </div>

      <div className={`flex-1 flex-col overflow-hidden min-h-0 ${mobileView === 'jobs' ? 'flex h-full' : 'hidden lg:flex'}`}>
        <div className="p-3 border-b border-neutral-800 bg-neutral-900/20 backdrop-blur-md shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-center gap-4">
            <div className="flex bg-neutral-950 border border-neutral-800 rounded-xl p-1 flex-1 max-w-lg">
              <button onClick={() => setActiveTab('draft')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${activeTab === 'draft' ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/50' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'}`}>
                <div className="flex items-center gap-1.5">
                  <Plus className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Draft</span>
                </div>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({draftJobs.length})</span>
              </button>
              <button onClick={() => setActiveTab('queue')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${activeTab === 'queue' ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/50' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'}`}>
                <div className="flex items-center gap-1.5">
                  <List className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Queue</span>
                </div>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({queueJobs.length})</span>
              </button>
              <button onClick={() => setActiveTab('completed')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${activeTab === 'completed' ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/50' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'}`}>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Done</span>
                </div>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({completedJobs.length})</span>
              </button>
              <button onClick={() => setActiveTab('album')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${activeTab === 'album' ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/50' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 border border-transparent'}`}>
                <div className="flex items-center gap-1.5">
                  <Grid className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Album</span>
                </div>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({albumItems.length})</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 md:space-y-12 custom-scrollbar">
          {activeTab === 'draft' && (
            <DraftsTab
              draftJobs={draftJobs} selectedDraftIds={selectedDraftIds} toggleSelectAllDrafts={toggleSelectAllDrafts}
              setShowDeleteSelectedModal={setShowDeleteSelectedModal} runSelectedDrafts={runSelectedDrafts}
              setShowDeleteAllDraftsModal={setShowDeleteAllDraftsModal} runAllDrafts={runAllDrafts}
              expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand} toggleDraftSelection={toggleDraftSelection}
              getProviderName={getProviderName} getModelName={getModelName} runJob={runJob}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
            />
          )}
          {activeTab === 'queue' && (
            <QueueTab
              queueJobs={queueJobs} selectedQueueIds={selectedQueueIds} toggleSelectAllQueue={toggleSelectAllQueue}
              toggleQueueSelection={toggleQueueSelection} retrySelectedQueue={retrySelectedQueue} deleteSelectedQueue={deleteSelectedQueue}
              clearAllFailed={clearAllFailed} expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand}
              getProviderName={getProviderName} getModelName={getModelName} runJob={runJob}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
            />
          )}
          {activeTab === 'completed' && (
            <CompletedTab
              completedJobs={completedJobs} expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand}
              selectedCompletedIds={selectedCompletedIds} toggleCompletedSelection={toggleCompletedSelection}
              toggleSelectAllCompleted={toggleSelectAllCompleted} setShowDeleteSelectedModal={setShowDeleteCompletedSelectedModal}
              getProviderName={getProviderName} getModelName={getModelName}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
            />
          )}
          {activeTab === 'album' && (
            <AlbumTab
              projectId={localProject.id}
              projectName={localProject.name}
              albumItems={albumItems} selectedAlbumIds={selectedAlbumIds} toggleSelectAllAlbum={toggleSelectAllAlbum}
              toggleAlbumSelection={toggleAlbumSelection} setAlbumItemsToDelete={setAlbumItemsToDelete}
              setShowDeleteAlbumModal={setShowDeleteAlbumModal} getProviderName={getProviderName} getModelName={getModelName}
              setLightboxData={setLightboxData}
              onExportStarted={() => navigate('/exports')}
            />
          )}
        </div>
      </div>

      <ConfirmModal isOpen={itemToRemoveId !== null} onClose={() => setItemToRemoveId(null)} onConfirm={confirmRemoveWorkflowItem} title="Remove Workflow Item" message="Are you sure you want to remove this item from your workflow?" confirmText="Remove Item" type="danger" />
      <PromptModal item={editingItem} onClose={() => setEditingItem(null)} onSave={(value) => { if (editingItem) updateWorkflowItem(editingItem.id, value); setEditingItem(null); }} />
      <ConfirmModal isOpen={showDeleteSelectedModal} onClose={() => setShowDeleteSelectedModal(false)} onConfirm={deleteSelectedDrafts} title="Delete Selected Drafts" message={`Are you sure you want to delete ${selectedDraftIds.size} selected drafts?`} confirmText="Delete Selected" type="danger" />
      <ConfirmModal isOpen={showDeleteAllDraftsModal} onClose={() => setShowDeleteAllDraftsModal(false)} onConfirm={deleteAllDrafts} title="Delete All Drafts" message={`Are you sure you want to delete all ${draftJobs.length} draft tasks?`} confirmText="Delete All" type="danger" />
      <ConfirmModal isOpen={showDeleteProjectModal} onClose={() => setShowDeleteProjectModal(false)} onConfirm={onDelete} title="Delete Project" message={`Are you sure you want to delete "${localProject.name}"?`} confirmText="Delete Project" type="danger" />
      <ConfirmModal isOpen={jobToDeleteId !== null} onClose={() => setJobToDeleteId(null)} onConfirm={() => { if (jobToDeleteId) { deleteJob(jobToDeleteId); setJobToDeleteId(null); } }} title="Delete Job" message="Are you sure you want to delete this job?" confirmText="Delete Job" type="danger" />
      <LibrarySelectionModal
        isOpen={showLibrarySelector || !!selectingLibraryForItemId}
        onClose={() => {
          setShowLibrarySelector(false);
          setSelectingLibraryForItemId(null);
        }}
        onSelect={(libraryId) => {
          if (selectingLibraryForItemId) {
            const lib = libraries.find(l => l.id === libraryId);
            if (lib) {
              setPreviewingLibrary(lib);
              setPreviewingWorkflowItemId(selectingLibraryForItemId);
            }
          } else {
            handleLibrarySelect(libraryId);
          }
        }}
        libraries={(() => {
          if (!selectingLibraryForItemId) return libraries;
          const item = (localProject.workflow || []).find(i => i.id === selectingLibraryForItemId);
          if (!item) return libraries;
          return libraries.filter(l => l.type === item.type);
        })()}
        selectedLibraryIds={(localProject.workflow || []).filter(item => item.type === 'library').map(item => item.value)}
      />
      <LibraryPreviewModal
        library={previewingLibrary}
        selectedTags={localProject.workflow.find(i => i.id === previewingWorkflowItemId)?.selectedTags || []}
        onUpdateTags={(tags) => {
          if (previewingWorkflowItemId) updateWorkflowItemTags(previewingWorkflowItemId, tags);
        }}
        isSelectionMode={!!selectingLibraryForItemId}
        onSelectItem={(content) => {
          if (selectingLibraryForItemId) {
            updateWorkflowItem(selectingLibraryForItemId, content);
            setSelectingLibraryForItemId(null);
            setPreviewingLibrary(null);
            setPreviewingWorkflowItemId(null);
          }
        }}
        onClose={() => {
          setPreviewingLibrary(null);
          setPreviewingWorkflowItemId(null);
        }}
      />
      {lightboxData && <ImageLightbox images={lightboxData.images} startIndex={lightboxData.index} onClose={() => setLightboxData(null)} />}
      <ConfirmModal isOpen={showDeleteAlbumModal} onClose={() => { setShowDeleteAlbumModal(false); setAlbumItemsToDelete(null); }} onConfirm={async () => { if (albumItemsToDelete) { await deleteAlbumItems(albumItemsToDelete); setShowDeleteAlbumModal(false); setAlbumItemsToDelete(null); } }} title="Move to Recycle Bin" message={`Are you sure you want to move ${albumItemsToDelete?.length || 0} items to the Recycle Bin?`} confirmText="Move to Trash" type="danger" />
      <ConfirmModal isOpen={showDeleteCompletedSelectedModal} onClose={() => setShowDeleteCompletedSelectedModal(false)} onConfirm={deleteSelectedCompleted} title="Remove Selected Finished Records" message={`Are you sure you want to remove ${selectedCompletedIds.size} completed job records? (Album images will not be deleted)`} confirmText="Remove Selected" type="danger" />
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Project, Job, Library, WorkflowItem as WorkflowItemType, WorkflowItemType as WorkflowItemTypeKind, Provider, AlbumItem, estimatePromptLength, formatPromptLimit, isPromptOverLimit, truncatePromptToLimit } from '../types';
import { saveImage, saveVideo, saveAudio, fetchProviders, fetchProject as apiFetchProject, updateProject as apiUpdateProject, runProjectWorkflow as apiRunWorkflow, imageDisplayUrl as apiImageDisplayUrl, moveToTrash, moveToTrashBatch } from '../api';
import { CheckCircle2, List, Grid, ChevronLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { generateWorkflowCombinations, generateJobs } from '../lib/remixEngine';
import { ConfirmModal } from './ConfirmModal';

// Sub-components
import { ModelSelectorModal } from './ProjectViewer/ModelSelectorModal';
import { LibrarySelectionModal } from './ProjectViewer/LibrarySelectionModal';
import { LibraryPreviewModal } from './ProjectViewer/LibraryPreviewModal';
import { PromptModal } from './ProjectViewer/PromptModal';
import { PromptLimitModal } from './ProjectViewer/PromptLimitModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';
import { DraftsTab } from './ProjectViewer/DraftsTab';
import { QueueTab } from './ProjectViewer/QueueTab';
import { CompletedTab } from './ProjectViewer/CompletedTab';
import { AlbumTab } from './ProjectViewer/AlbumTab';
import { WorkflowPanel } from './ProjectViewer/WorkflowPanel';

interface Props {
  project: Project;
  libraries: Library[];
  onUpdate: (project: Project) => void;
  onDelete: () => void;
}

type PromptLimitDecision = 'truncate' | 'keep' | 'cancel';

interface PromptLimitDialogState {
  modelName: string;
  affectedCount: number;
  limitLabel: string;
  longestPromptLabel: string;
  resolve: (decision: PromptLimitDecision) => void;
}

export function ProjectViewer({ project, libraries, onUpdate, onDelete }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab as 'draft' | 'queue' | 'completed' | 'album') || 'draft';
  const setActiveTab = (tab: 'draft' | 'queue' | 'completed' | 'album') => {
    setSearchParams({ tab }, { replace: true });
    setMobileView('jobs');
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
  const [lightboxData, setLightboxData] = useState<{ images: string[], index: number, onDelete?: (index: number) => void } | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'workflow' | 'jobs'>('workflow');
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set());
  const [lastSelectedAlbumId, setLastSelectedAlbumId] = useState<string | null>(null);
  const [showDeleteAlbumModal, setShowDeleteAlbumModal] = useState(false);
  const [showDeleteCompletedSelectedModal, setShowDeleteCompletedSelectedModal] = useState(false);
  const [showDeleteQueueSelectedModal, setShowDeleteQueueSelectedModal] = useState(false);
  const [showClearAllFailedModal, setShowClearAllFailedModal] = useState(false);
  const [albumItemsToDelete, setAlbumItemsToDelete] = useState<AlbumItem[] | null>(null);
  const [selectedCompletedIds, setSelectedCompletedIds] = useState<Set<string>>(new Set());
  const [isAddingDrafts, setIsAddingDrafts] = useState(false);
  const [draftsProgress, setDraftsProgress] = useState<{ current: number; total: number; stage: 'composing' | 'saving' } | null>(null);
  const [promptLimitDialog, setPromptLimitDialog] = useState<PromptLimitDialogState | null>(null);

  const projectRef = useRef(localProject);
  const skipProjectSyncRef = useRef(false);
  const workflowListRef = useRef<HTMLDivElement | null>(null);
  const isProcessing = localProject.jobs.some(j => j.status === 'pending' || j.status === 'processing');

  const scrollWorkflowToBottom = () => {
    requestAnimationFrame(() => {
      const container = workflowListRef.current;
      if (!container) return;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });
  };

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
    if (rawTab) {
      setMobileView('jobs');
    }
  }, [rawTab]);

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
          const savedProvId = project.providerId;
          const provExists = p.some(prov => prov.id === savedProvId);
          if (provExists && savedProvId) {
            setSelectedProviderId(savedProvId);
            const prov = p.find(prov => prov.id === savedProvId)!;
            if (prov.models.length > 0) {
              const savedModelId = project.modelConfigId;
              const modelExists = prov.models.some(m => m.id === savedModelId);
              setSelectedModelId(modelExists ? savedModelId! : prov.models[0].id);
            }
          } else {
            setSelectedProviderId('');
            setSelectedModelId('');
          }
        }
      } catch (e) {
        console.error('Failed to fetch providers:', e);
      }
    })();
  }, []);

  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const selectedModel = selectedProvider?.models.find(m => m.id === selectedModelId);

  const getProviderName = (id?: string) => id ? providers.find(p => p.id === id)?.name || id : t('projectViewer.common.unknownProvider');
  const getModelName = (providerId?: string, modelId?: string) => {
    if (!modelId) return t('projectViewer.common.unknownModel');
    const providerModels = providerId
      ? providers.find(p => p.id === providerId)?.models
      : undefined;

    const matchedModel =
      providerModels?.find(m => m.id === modelId || m.modelId === modelId) ||
      providers.flatMap(p => p.models).find(m => m.id === modelId || m.modelId === modelId);

    return matchedModel?.name || modelId;
  };

  useEffect(() => {
    if (selectedModel) {
      let needsUpdate = false;
      const updated = { ...localProject };
      if (selectedModel.category === 'text') {
        // Sync text-specific defaults
        if (selectedModel.options.temperatures && localProject.temperature === undefined) {
          updated.temperature = 0.7;
          needsUpdate = true;
        }
        if (selectedModel.options.maxTokenOptions && localProject.maxTokens === undefined) {
          updated.maxTokens = 2048;
          needsUpdate = true;
        }
      } else {
        // Sync image-specific defaults
        if (selectedModel.options.aspectRatios && !selectedModel.options.aspectRatios.includes(localProject.aspectRatio || '')) {
          updated.aspectRatio = selectedModel.options.aspectRatios[0];
          needsUpdate = true;
        }
        if (selectedModel.options.qualities && !selectedModel.options.qualities.includes(localProject.quality || '')) {
          updated.quality = selectedModel.options.qualities[0];
          needsUpdate = true;
        }
        if (selectedModel.options.backgrounds && !selectedModel.options.backgrounds.includes(localProject.background || '')) {
          updated.background = selectedModel.options.backgrounds[0];
          needsUpdate = true;
        }
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
    scrollWorkflowToBottom();
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
    scrollWorkflowToBottom();
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
    const reorderedWorkflow = newWorkflow.map((item, idx) => ({ ...item, order: idx }));
    const updated = { ...localProject, workflow: reorderedWorkflow };
    setLocalProject(updated);
    onUpdate(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingItemIds(prev => new Set(prev).add(id));
      try {
        const base64 = await readFileAsDataUrl(file);
        const { key, url, thumbnailKey, thumbnailUrl, optimizedKey, optimizedUrl, size } = await saveImage(base64, localProject.id);
        // Persist bare keys to DB (server will presign on GET)
        const dbProject = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, value: key, thumbnailUrl: thumbnailKey, optimizedUrl: optimizedKey, size } : item) };
        skipProjectSyncRef.current = true;
        onUpdate(dbProject);
        // Display presigned URLs in local state for immediate rendering
        setLocalProject(prev => ({ ...prev, workflow: prev.workflow.map(item => item.id === id ? { ...item, value: url, thumbnailUrl, optimizedUrl, size } : item) }));
      } catch (err: any) {
        console.error('Failed to upload image:', err);
        toast.error(err.message || t('projectViewer.toasts.uploadImageFailed'));
      } finally {
        setUploadingItemIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingItemIds(prev => new Set(prev).add(id));
    try {
      const base64 = await readFileAsDataUrl(file);
      const { key, url, thumbnailKey, thumbnailUrl, optimizedKey, optimizedUrl, size } = await saveVideo(base64, localProject.id);
      const dbProject = {
        ...localProject,
        workflow: localProject.workflow.map((item) => item.id === id ? {
          ...item,
          value: key,
          thumbnailUrl: thumbnailKey,
          optimizedUrl: optimizedKey,
          size,
        } : item),
      };
      skipProjectSyncRef.current = true;
      onUpdate(dbProject);
      setLocalProject((prev) => ({
        ...prev,
        workflow: prev.workflow.map((item) => item.id === id ? {
          ...item,
          value: url,
          thumbnailUrl,
          optimizedUrl,
          size,
        } : item),
      }));
    } catch (err: any) {
      console.error('Failed to upload video:', err);
      toast.error(err.message || 'Failed to upload video');
    } finally {
      setUploadingItemIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingItemIds(prev => new Set(prev).add(id));
    try {
      const base64 = await readFileAsDataUrl(file);
      const { key, url, size } = await saveAudio(base64, localProject.id);
      const dbProject = {
        ...localProject,
        workflow: localProject.workflow.map((item) => item.id === id ? { ...item, value: key, size } : item),
      };
      skipProjectSyncRef.current = true;
      onUpdate(dbProject);
      setLocalProject((prev) => ({
        ...prev,
        workflow: prev.workflow.map((item) => item.id === id ? { ...item, value: url, size } : item),
      }));
    } catch (err: any) {
      console.error('Failed to upload audio:', err);
      toast.error(err.message || 'Failed to upload audio');
    } finally {
      setUploadingItemIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const addDraftsToQueue = async () => {
    const emptyItems = (localProject.workflow || []).filter(item => !item.value.trim());
    if (emptyItems.length > 0) {
      setWorkflowError(t('projectViewer.errors.missingWorkflowInfo', { count: emptyItems.length }));
      setTimeout(() => setWorkflowError(null), 4000);
      return;
    }
    setIsAddingDrafts(true);
    setDraftsProgress({ current: 0, total: queueCount, stage: 'composing' });

    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const selectedCombinations = generateJobs(localProject.workflow || [], libraries, queueCount, !!localProject.shuffle);
      if (selectedCombinations.length === 0) return;

      const newJobs: Job[] = [];
      const total = selectedCombinations.length;
      const chunkSize = 25;

      setDraftsProgress({ current: 0, total, stage: 'composing' });

      for (let index = 0; index < total; index += chunkSize) {
        const chunk = selectedCombinations.slice(index, index + chunkSize);

        for (const combo of chunk) {
          const shortuuid = crypto.randomUUID().slice(0, 8);
          const parts = [
            localProject.prefix,
            ...combo.filenameParts,
            shortuuid
          ].filter(Boolean);
          const filename = parts.join('_').replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 200);

          const isTextProject = localProject.type === 'text';
          newJobs.push({
            id: crypto.randomUUID(),
            prompt: combo.prompt,
            imageContexts: combo.imageContexts,
            videoContexts: combo.videoContexts,
            audioContexts: combo.audioContexts,
            status: 'draft',
            providerId: selectedProviderId,
            modelConfigId: selectedModelId,
            ...(isTextProject ? {} : {
              aspectRatio: localProject.aspectRatio || (selectedModel?.options.aspectRatios?.[0] || '1024x1024'),
              quality: localProject.quality || (selectedModel?.options.qualities?.[0] || 'standard'),
              background: localProject.background || (selectedModel?.options.backgrounds?.[0]),
              format: localProject.format || 'png',
            }),
            ...(localProject.type === 'video' ? {
              duration: localProject.duration || selectedModel?.options.durations?.[0] || 4,
              resolution: localProject.resolution || selectedModel?.options.resolutions?.[0] || '720p',
              sound: localProject.sound || 'on',
              format: 'mp4' as const,
            } : {}),
            filename
          });
        }

        setDraftsProgress({ current: Math.min(index + chunk.length, total), total, stage: 'composing' });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      const promptLimit = selectedModel?.promptLimit;
      let finalizedJobs = newJobs;

      if (promptLimit) {
        const overLimitJobs = newJobs.filter(job => isPromptOverLimit(job.prompt, promptLimit));

        if (overLimitJobs.length > 0) {
          const longestPromptLength = overLimitJobs.reduce((max, job) => {
            return Math.max(max, estimatePromptLength(job.prompt, promptLimit));
          }, 0);

          const decision = await new Promise<PromptLimitDecision>((resolve) => {
            setPromptLimitDialog({
              modelName: selectedModel?.name || t('projectViewer.settings.selectModel'),
              affectedCount: overLimitJobs.length,
              limitLabel: formatPromptLimit(promptLimit),
              longestPromptLabel: `${longestPromptLength.toLocaleString()} ${promptLimit.unit}`,
              resolve,
            });
          });

          if (decision === 'cancel') return;

          if (decision === 'truncate') {
            finalizedJobs = newJobs.map((job) => (
              isPromptOverLimit(job.prompt, promptLimit)
                ? { ...job, prompt: truncatePromptToLimit(job.prompt, promptLimit) }
                : job
            ));
          }
        }
      }

      const updatedProject = { ...localProject, jobs: [...localProject.jobs, ...finalizedJobs] };
      setDraftsProgress({ current: total, total, stage: 'saving' });

      await apiUpdateProject(updatedProject.id, {
        jobs: updatedProject.jobs, workflow: updatedProject.workflow, providerId: selectedProviderId,
        modelConfigId: selectedModelId,
        aspectRatio: localProject.aspectRatio, quality: localProject.quality, background: localProject.background, format: localProject.format || 'png', shuffle: localProject.shuffle,
        systemPrompt: localProject.systemPrompt, temperature: localProject.temperature, maxTokens: localProject.maxTokens,
        duration: localProject.duration, resolution: localProject.resolution, sound: localProject.sound,
      });

      setLocalProject(updatedProject);
      setActiveTab('draft');
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setMobileView('jobs');
      }
    } catch (error) {
      console.error('Failed to add drafts:', error);
      toast.error(t('projectViewer.toasts.addDraftsFailed'));
    } finally {
      setIsAddingDrafts(false);
      setDraftsProgress(null);
    }
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
    } catch (e: any) {
      console.error('Failed to move items to trash:', e);
      toast.error(`Failed to move items to trash: ${e.message}`);
    }
  };

  const draftJobs = localProject.jobs.filter(j => j.status === 'draft');
  const queueJobs = localProject.jobs.filter(j => ['pending', 'processing', 'failed'].includes(j.status));
  const completedJobs = localProject.jobs.filter(j => j.status === 'completed');
  const albumItems = localProject.album || [];

  return (
    <div className="flex flex-col lg:flex-row h-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden lg:overflow-visible">
      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        providers={providers}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        projectType={localProject.type || 'image'}
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
          {mobileView === 'workflow' ? (<><List className="w-3.5 h-3.5" /><span className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.main.mobileJobs')}</span></>) : (<><ChevronLeft className="w-3.5 h-3.5" /><span className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.common.back')}</span></>)}
        </button>,
        document.getElementById('mobile-header-actions')!
      )}

      <WorkflowPanel
        project={project}
        localProject={localProject}
        libraries={libraries}
        providers={providers}
        mobileView={mobileView}
        workflowListRef={workflowListRef}
        draggedIndex={draggedIndex}
        dragOverIndex={dragOverIndex}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        isSettingsCollapsed={isSettingsCollapsed}
        queueCount={queueCount}
        workflowError={workflowError}
        uploadingItemIds={uploadingItemIds}
        isAddingDrafts={isAddingDrafts}
        draftsProgress={draftsProgress}
        combinations={combinations}
        onNavigateToEdit={() => navigate(`/project/${project.id}/edit`)}
        onNavigateToOrphans={() => navigate(`/project/${project.id}/orphans`)}
        onShowDeleteProject={() => setShowDeleteProjectModal(true)}
        onAddWorkflowItem={addWorkflowItem}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDraggedIndex(null);
          setDragOverIndex(null);
        }}
        onRemoveItem={setItemToRemoveId}
        onEditItem={setEditingItem}
        onPreviewLibrary={(lib, workflowItemId) => {
          setPreviewingLibrary(lib);
          setPreviewingWorkflowItemId(workflowItemId);
        }}
        onImageUpload={handleImageUpload}
        onVideoUpload={handleVideoUpload}
        onAudioUpload={handleAudioUpload}
        onLightbox={(images, index) => setLightboxData({ images, index })}
        onUpdateTags={updateWorkflowItemTags}
        onSelectFromLibrary={setSelectingLibraryForItemId}
        setLocalProject={setLocalProject}
        onUpdate={onUpdate}
        setIsSettingsCollapsed={setIsSettingsCollapsed}
        setQueueCount={setQueueCount}
        setHasManuallySetQueueCount={setHasManuallySetQueueCount}
        setIsModelSelectorOpen={setIsModelSelectorOpen}
        onAddDraftsToQueue={addDraftsToQueue}
      />

      <div className={`flex-1 flex-col overflow-hidden min-h-0 ${mobileView === 'jobs' ? 'flex h-full' : 'hidden lg:flex'}`}>
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col gap-3 relative z-10">
          <div className="min-h-[40px] flex items-center justify-center gap-4">
            <div className="flex bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-1 flex-1 max-w-lg shadow-inner">
              <button onClick={() => setActiveTab('draft')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${activeTab === 'draft' ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-white shadow-sm border border-neutral-200 dark:border-neutral-700' : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 hover:bg-white/50 dark:hover:bg-neutral-900/50 border border-transparent'}`}>
                <Plus className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.tabs.draft')}</span>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({draftJobs.length})</span>
              </button>
              <button onClick={() => setActiveTab('queue')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${activeTab === 'queue' ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-white shadow-sm border border-neutral-200 dark:border-neutral-700' : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 hover:bg-white/50 dark:hover:bg-neutral-900/50 border border-transparent'}`}>
                <List className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.tabs.queue')}</span>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({queueJobs.length})</span>
              </button>
              <button onClick={() => setActiveTab('completed')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${activeTab === 'completed' ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-white shadow-sm border border-neutral-200 dark:border-neutral-700' : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 hover:bg-white/50 dark:hover:bg-neutral-900/50 border border-transparent'}`}>
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">{t('projectViewer.tabs.done')}</span>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({completedJobs.length})</span>
              </button>
              <button onClick={() => setActiveTab('album')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${activeTab === 'album' ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-white shadow-sm border border-neutral-200 dark:border-neutral-700' : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 hover:bg-white/50 dark:hover:bg-neutral-900/50 border border-transparent'}`}>
                <Grid className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">{localProject.type === 'text' ? t('projectViewer.tabs.texts') : t('projectViewer.tabs.album')}</span>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({albumItems.length})</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 space-y-0">
          {activeTab === 'draft' && (
            <DraftsTab
              draftJobs={draftJobs} selectedDraftIds={selectedDraftIds} toggleSelectAllDrafts={toggleSelectAllDrafts}
              setShowDeleteSelectedModal={setShowDeleteSelectedModal} runSelectedDrafts={runSelectedDrafts}
              setShowDeleteAllDraftsModal={setShowDeleteAllDraftsModal} runAllDrafts={runAllDrafts}
              expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand} toggleDraftSelection={toggleDraftSelection}
              getProviderName={getProviderName} getModelName={getModelName} runJob={runJob}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
              albumItems={albumItems}
              onSwitchToAlbum={() => setActiveTab('album')}
              projectType={localProject.type || 'image'}
              projectName={localProject.name}
            />
          )}
          {activeTab === 'queue' && (
            <QueueTab
              queueJobs={queueJobs} selectedQueueIds={selectedQueueIds} toggleSelectAllQueue={toggleSelectAllQueue}
              toggleQueueSelection={toggleQueueSelection} retrySelectedQueue={retrySelectedQueue} deleteSelectedQueue={() => setShowDeleteQueueSelectedModal(true)}
              clearAllFailed={() => setShowClearAllFailedModal(true)} expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand}
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
              projectType={localProject.type || 'image'}
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
              projectType={localProject.type || 'image'}
            />
          )}
        </div>
      </div>

      <ConfirmModal isOpen={itemToRemoveId !== null} onClose={() => setItemToRemoveId(null)} onConfirm={confirmRemoveWorkflowItem} title={t('projectViewer.confirm.removeWorkflowItem.title')} message={t('projectViewer.confirm.removeWorkflowItem.message')} confirmText={t('projectViewer.confirm.removeWorkflowItem.confirm')} type="danger" />
      <PromptModal item={editingItem} onClose={() => setEditingItem(null)} onSave={(value) => { if (editingItem) updateWorkflowItem(editingItem.id, value); setEditingItem(null); }} />
      <PromptLimitModal
        isOpen={promptLimitDialog !== null}
        modelName={promptLimitDialog?.modelName || ''}
        affectedCount={promptLimitDialog?.affectedCount || 0}
        limitLabel={promptLimitDialog?.limitLabel || ''}
        longestPromptLabel={promptLimitDialog?.longestPromptLabel || ''}
        onCancel={() => {
          promptLimitDialog?.resolve('cancel');
          setPromptLimitDialog(null);
        }}
        onKeep={() => {
          promptLimitDialog?.resolve('keep');
          setPromptLimitDialog(null);
        }}
        onTruncate={() => {
          promptLimitDialog?.resolve('truncate');
          setPromptLimitDialog(null);
        }}
      />
      <ConfirmModal isOpen={showDeleteSelectedModal} onClose={() => setShowDeleteSelectedModal(false)} onConfirm={deleteSelectedDrafts} title={t('projectViewer.confirm.deleteSelectedDrafts.title')} message={t('projectViewer.confirm.deleteSelectedDrafts.message', { count: selectedDraftIds.size })} confirmText={t('projectViewer.confirm.deleteSelectedDrafts.confirm')} type="danger" />
      <ConfirmModal isOpen={showDeleteAllDraftsModal} onClose={() => setShowDeleteAllDraftsModal(false)} onConfirm={deleteAllDrafts} title={t('projectViewer.confirm.deleteAllDrafts.title')} message={t('projectViewer.confirm.deleteAllDrafts.message', { count: draftJobs.length })} confirmText={t('projectViewer.confirm.deleteAllDrafts.confirm')} type="danger" />
      <ConfirmModal isOpen={showDeleteProjectModal} onClose={() => setShowDeleteProjectModal(false)} onConfirm={onDelete} title={t('projectViewer.confirm.deleteProject.title')} message={t('projectViewer.confirm.deleteProject.message', { name: localProject.name })} confirmText={t('projectViewer.confirm.deleteProject.confirm')} type="danger" />
      <ConfirmModal isOpen={jobToDeleteId !== null} onClose={() => setJobToDeleteId(null)} onConfirm={() => { if (jobToDeleteId) { deleteJob(jobToDeleteId); setJobToDeleteId(null); } }} title={t('projectViewer.confirm.deleteJob.title')} message={t('projectViewer.confirm.deleteJob.message')} confirmText={t('projectViewer.confirm.deleteJob.confirm')} type="danger" />
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
      {lightboxData && <ImageLightbox images={lightboxData.images} startIndex={lightboxData.index} onClose={() => setLightboxData(null)} onDelete={lightboxData.onDelete} />}
      <ConfirmModal 
        isOpen={showDeleteAlbumModal} 
        onClose={() => { setShowDeleteAlbumModal(false); setAlbumItemsToDelete(null); }} 
        onConfirm={async () => { 
          if (albumItemsToDelete) { 
            const urlsToRemove = albumItemsToDelete.map(i => apiImageDisplayUrl(i.optimizedUrl || i.imageUrl));
            await deleteAlbumItems(albumItemsToDelete); 
            if (lightboxData) {
              const newImages = lightboxData.images.filter(img => !urlsToRemove.includes(img));
              if (newImages.length === 0) setLightboxData(null);
              else setLightboxData({ ...lightboxData, images: newImages });
            }
            setShowDeleteAlbumModal(false); 
            setAlbumItemsToDelete(null); 
          } 
        }} 
        title={t('projectViewer.confirm.moveToRecycleBin.title')} 
        message={t('projectViewer.confirm.moveToRecycleBin.message', { count: albumItemsToDelete?.length || 0 })} 
        confirmText={t('projectViewer.confirm.moveToRecycleBin.confirm')} 
        type="danger" 
      />
      <ConfirmModal isOpen={showDeleteCompletedSelectedModal} onClose={() => setShowDeleteCompletedSelectedModal(false)} onConfirm={deleteSelectedCompleted} title={t('projectViewer.confirm.removeFinishedRecords.title')} message={t('projectViewer.confirm.removeFinishedRecords.message', { count: selectedCompletedIds.size })} confirmText={t('projectViewer.confirm.removeFinishedRecords.confirm')} type="danger" />
      <ConfirmModal isOpen={showDeleteQueueSelectedModal} onClose={() => setShowDeleteQueueSelectedModal(false)} onConfirm={deleteSelectedQueue} title={t('projectViewer.confirm.deleteSelectedJobs.title')} message={t('projectViewer.confirm.deleteSelectedJobs.message', { count: selectedQueueIds.size })} confirmText={t('projectViewer.confirm.deleteSelectedJobs.confirm')} type="danger" />
      <ConfirmModal isOpen={showClearAllFailedModal} onClose={() => setShowClearAllFailedModal(false)} onConfirm={clearAllFailed} title={t('projectViewer.confirm.clearFailedJobs.title')} message={t('projectViewer.confirm.clearFailedJobs.message')} confirmText={t('projectViewer.confirm.clearFailedJobs.confirm')} type="danger" />
    </div>
  );
}

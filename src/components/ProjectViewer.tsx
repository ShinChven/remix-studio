import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createDefaultAudioProjectConfig,
  DEFAULT_AUDIO_PROJECT_CONFIG,
  Project,
  Job,
  Library,
  WorkflowItem as WorkflowItemType,
  WorkflowItemType as WorkflowItemTypeKind,
  Provider,
  AlbumItem,
  AspectRatioCount,
  estimatePromptLength,
  formatPromptLimit,
  isPromptOverLimit,
  parseAudioProjectConfig,
  resolveAudioGenerationKind,
  serializeAudioProjectConfig,
  truncatePromptToLimit,
} from '../types';
import { saveImage, saveVideo, saveAudio, fetchProviders, fetchProjectWorkflow, fetchProjectJobs, fetchProjectCompletedJobs, fetchProjectAlbum, fetchProjectJobConfiguration, updateProject as apiUpdateProject, startProjectJobs as apiStartProjectJobs, imageDisplayUrl as apiImageDisplayUrl, moveToTrash, moveToTrashBatch, renameAlbumItem as apiRenameAlbumItem, fetchLibraries, fetchLibrary, clearFailedQueueJobs, deleteProjectJobs as apiDeleteProjectJobs, createLibraryItem } from '../api';
import { CheckCircle2, List, Grid, ChevronLeft, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { countWorkflowCombinations, generateJobs } from '../lib/remixEngine';
import { ConfirmModal } from './ConfirmModal';
import { UniversalMediaPicker, UniversalPickedItem } from './UniversalMediaPicker';

// Sub-components
import { ModelSelectorModal } from './ProjectViewer/ModelSelectorModal';
import { LibrarySelectionModal } from './ProjectViewer/LibrarySelectionModal';
import { LibraryPreviewModal } from './ProjectViewer/LibraryPreviewModal';
import { PromptModal } from './ProjectViewer/PromptModal';
import { PromptLimitModal } from './ProjectViewer/PromptLimitModal';
import { ImageLightbox } from './ProjectViewer/ImageLightbox';
import { ImageEditorModal } from './ImageEditorModal';
import { DraftsTab } from './ProjectViewer/DraftsTab';
import { QueueTab } from './ProjectViewer/QueueTab';
import { CompletedTab } from './ProjectViewer/CompletedTab';
import { AlbumTab } from './ProjectViewer/AlbumTab';
import { WorkflowPanel } from './ProjectViewer/WorkflowPanel';
import type { BoundContext } from './Assistant/AssistantComposer';

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

interface LightboxData {
  images: string[];
  index: number;
  albumItemIds?: string[];
  onDelete?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}

const WORKFLOW_LIBRARY_PAGE_SIZE = 500;
const MAX_JOB_FILENAME_LENGTH = 200;
const TAB_DATA_STALE_MS = 30_000;
const LIVE_REFRESH_DEBOUNCE_MS = 250;
const LIVE_REFRESH_MIN_INTERVAL_MS = 1_000;
const RIGHT_PANEL_REFRESH_EVENT_REASONS = new Set([
  'jobs.changed',
  'job.updated',
  'job.completed',
  'job.failed',
  'job.deleted',
  'queue.started',
  'queue.cleared',
  'album.changed',
  'album.deleted',
  'album.renamed',
  'album.restored',
]);

function buildJobFilename(filenameParts: string[], suffixId: string): string {
  const safeSuffixId = suffixId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const readableName = filenameParts
    .filter(Boolean)
    .join('_')
    .replace(/[^a-zA-Z0-9-_]/g, '_');
  const separator = readableName ? '_' : '';
  const maxReadableLength = Math.max(0, MAX_JOB_FILENAME_LENGTH - separator.length - safeSuffixId.length);
  const truncatedReadableName = readableName.substring(0, maxReadableLength);

  return `${truncatedReadableName}${separator}${safeSuffixId}`;
}

function stripJobWorkflowSnapshots(jobs: Job[]): Job[] {
  return jobs.map(({ workflowSnapshot, ...job }) => job);
}

async function fetchWorkflowLibraries(): Promise<Library[]> {
  const firstPage = await fetchLibraries(1, WORKFLOW_LIBRARY_PAGE_SIZE, undefined, true);
  if (firstPage.pages <= 1) return firstPage.items;

  const rest = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) =>
      fetchLibraries(index + 2, WORKFLOW_LIBRARY_PAGE_SIZE, undefined, true)
    )
  );

  return [firstPage, ...rest].flatMap((page) => page.items);
}

export function ProjectViewer({ project, libraries, onUpdate: onUpdateProp, onDelete }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = (rawTab as 'draft' | 'queue' | 'completed' | 'album') || 'draft';
  const setActiveTab = (tab: 'draft' | 'queue' | 'completed' | 'album') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
    setMobileView('jobs');
  };

  const [localProject, setLocalProject] = useState<Project>(project);
  const [localJobs, setLocalJobs] = useState<Job[]>((project.jobs || []).filter(j => j.status !== 'completed'));
  const [localAlbum, setLocalAlbum] = useState<AlbumItem[]>(project.album || []);
  const [albumTotal, setAlbumTotal] = useState<number>(0);
  const [albumPages, setAlbumPages] = useState<number>(1);
  const [albumTotalSize, setAlbumTotalSize] = useState<number>(0);
  const [albumAspectRatioCounts, setAlbumAspectRatioCounts] = useState<AspectRatioCount[]>([]);
  // Album view state is URL-driven (subscribes to the search params) so it is
  // shareable and survives back/forward, matching the `tab` param pattern.
  const albumPage = Math.max(1, Math.floor(Number(searchParams.get('albumPage')) || 1));
  const albumSizeParam = searchParams.get('albumSize');
  const albumPageSize: number | 'all' = albumSizeParam === 'all'
    ? 'all'
    : (Number(albumSizeParam) > 0 ? Math.floor(Number(albumSizeParam)) : 500);
  const albumSort: 'newest' | 'oldest' = searchParams.get('albumSort') === 'oldest' ? 'oldest' : 'newest';
  const albumRatiosParam = searchParams.get('albumRatios') || '';
  const albumSelectedRatios = React.useMemo(
    () => (albumRatiosParam ? albumRatiosParam.split(',').filter(Boolean) : []),
    [albumRatiosParam],
  );

  const updateAlbumParams = useCallback(
    (updates: { page?: number; pageSize?: number | 'all'; sort?: 'newest' | 'oldest'; ratios?: string[] }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        // Any change other than the page number itself returns to page 1.
        if (updates.pageSize !== undefined || updates.sort !== undefined || updates.ratios !== undefined) {
          next.delete('albumPage');
        }
        if (updates.page !== undefined) {
          if (updates.page > 1) next.set('albumPage', String(updates.page));
          else next.delete('albumPage');
        }
        if (updates.pageSize !== undefined) {
          if (updates.pageSize !== 500) next.set('albumSize', String(updates.pageSize));
          else next.delete('albumSize');
        }
        if (updates.sort !== undefined) {
          if (updates.sort !== 'newest') next.set('albumSort', updates.sort);
          else next.delete('albumSort');
        }
        if (updates.ratios !== undefined) {
          if (updates.ratios.length > 0) next.set('albumRatios', updates.ratios.join(','));
          else next.delete('albumRatios');
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [completedTotal, setCompletedTotal] = useState<number>(0);
  const [completedPages, setCompletedPages] = useState<number>(1);
  const [completedPage, setCompletedPage] = useState<number>(1);
  const [completedPageSize, setCompletedPageSize] = useState<number | 'all'>(500);
  const [completedSort, setCompletedSort] = useState<'newest' | 'oldest'>('newest');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [itemToRemoveId, setItemToRemoveId] = useState<string | null>(null);
  const [jobToDeleteId, setJobToDeleteId] = useState<string | null>(null);
  const [jobToReuse, setJobToReuse] = useState<Job | null>(null);



  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [showDeleteAllDraftsModal, setShowDeleteAllDraftsModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkflowItemType | null>(null);
  const [editingImageItem, setEditingImageItem] = useState<WorkflowItemType | null>(null);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [previewingLibrary, setPreviewingLibrary] = useState<Library | null>(null);
  const [previewingWorkflowItemId, setPreviewingWorkflowItemId] = useState<string | null>(null);
  const [reuseConfigJobId, setReuseConfigJobId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(project.providerId || '');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(true);
  const [queueCount, setQueueCount] = useState<number>(project.lastQueueCount ?? 1);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [uploadingItemIds, setUploadingItemIds] = useState<Set<string>>(new Set());
  const [selectingLibraryForItemId, setSelectingLibraryForItemId] = useState<string | null>(null);
  const [changingLibraryItemId, setChangingLibraryItemId] = useState<string | null>(null);
  const [savingLibraryItemId, setSavingLibraryItemId] = useState<string | null>(null);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [lightboxData, setLightboxData] = useState<LightboxData | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'workflow' | 'jobs'>('workflow');
  const [isWorkflowExpanded, setIsWorkflowExpanded] = useState(false);
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set());
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set());
  const [lastSelectedAlbumId, setLastSelectedAlbumId] = useState<string | null>(null);
  const [lastSelectedDraftId, setLastSelectedDraftId] = useState<string | null>(null);
  const [lastSelectedQueueId, setLastSelectedQueueId] = useState<string | null>(null);
  const [lastSelectedCompletedId, setLastSelectedCompletedId] = useState<string | null>(null);
  const [showDeleteAlbumModal, setShowDeleteAlbumModal] = useState(false);
  const [showDeleteCompletedSelectedModal, setShowDeleteCompletedSelectedModal] = useState(false);
  const [showDeleteQueueSelectedModal, setShowDeleteQueueSelectedModal] = useState(false);
  const [showClearAllFailedModal, setShowClearAllFailedModal] = useState(false);
  const [albumItemsToDelete, setAlbumItemsToDelete] = useState<AlbumItem[] | null>(null);
  const [selectedCompletedIds, setSelectedCompletedIds] = useState<Set<string>>(new Set());
  const [isAddingDrafts, setIsAddingDrafts] = useState(false);
  const [isStartingDraftBatch, setIsStartingDraftBatch] = useState(false);
  const [startingDraftJobIds, setStartingDraftJobIds] = useState<Set<string>>(new Set());
  const [isRetryingQueueBatch, setIsRetryingQueueBatch] = useState(false);
  const [retryingQueueJobIds, setRetryingQueueJobIds] = useState<Set<string>>(new Set());
  const [isTogglingArchive, setIsTogglingArchive] = useState(false);
  const [draftsProgress, setDraftsProgress] = useState<{ current: number; total: number; stage: 'composing' | 'saving' } | null>(null);
  const [promptLimitDialog, setPromptLimitDialog] = useState<PromptLimitDialogState | null>(null);
  const [liveLibraries, setLiveLibraries] = useState<Library[]>(libraries);
  const [isRefreshingLibraries, setIsRefreshingLibraries] = useState(false);
  const [libraryRefreshError, setLibraryRefreshError] = useState<string | null>(null);

  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(true);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(true);

  const tabContentRef = useRef<HTMLDivElement | null>(null);
  const scrollTabContentTop = useCallback(() => {
    const el = tabContentRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const albumFetchTokenRef = useRef(0);
  const jobsFetchTokenRef = useRef(0);
  const isClearingFailedJobsRef = useRef(false);
  const isStartingDraftJobsRef = useRef(false);
  const isMutatingJobsRef = useRef(false);
  const isDeletingAlbumItemsRef = useRef(false);
  const albumLoadedKeyRef = useRef<string | null>(null);
  const albumFetchedAtRef = useRef<number>(0);
  const prevAlbumProjectIdRef = useRef<string | null>(null);
  const completedFetchTokenRef = useRef(0);
  const completedLoadedKeyRef = useRef<string | null>(null);
  const completedFetchedAtRef = useRef<number>(0);
  const runProjectLiveRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const jobsFetchToken = ++jobsFetchTokenRef.current;
    isClearingFailedJobsRef.current = false;
    isStartingDraftJobsRef.current = false;
    isMutatingJobsRef.current = false;
    isDeletingAlbumItemsRef.current = false;
    setIsStartingDraftBatch(false);
    setStartingDraftJobIds(new Set());
    setIsRetryingQueueBatch(false);
    setRetryingQueueJobIds(new Set());
    albumFetchTokenRef.current += 1;
    albumLoadedKeyRef.current = null;
    albumFetchedAtRef.current = 0;
    completedFetchTokenRef.current += 1;
    completedLoadedKeyRef.current = null;
    completedFetchedAtRef.current = 0;
    setIsLoadingWorkflow(true);
    setIsLoadingJobs(true);
    setIsLoadingAlbum(true);
    setIsLoadingCompleted(true);
    setLocalAlbum([]);
    setAlbumTotal(0);
    setAlbumPages(1);
    setAlbumTotalSize(0);
    setAlbumAspectRatioCounts([]);
    // Reset the URL-driven album view when switching to a different project, but
    // preserve any deep-linked params on the initial mount.
    if (prevAlbumProjectIdRef.current !== null && prevAlbumProjectIdRef.current !== project.id) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('albumPage');
        next.delete('albumSize');
        next.delete('albumSort');
        next.delete('albumRatios');
        return next;
      }, { replace: true });
    }
    prevAlbumProjectIdRef.current = project.id;
    setCompletedJobs([]);
    setCompletedTotal(0);
    setCompletedPages(1);
    setCompletedPage(1);
    Promise.all([
      fetchProjectWorkflow(project.id).then(w => setLocalProject(prev => ({ ...prev, workflow: w }))).catch(console.error),
      fetchProjectJobs(project.id, { excludeStatus: ['completed'] }).then((jobs) => {
        if (jobsFetchTokenRef.current === jobsFetchToken) setLocalJobs(jobs);
      }).catch(console.error),
      // Fetch metadata only. Album rows are loaded at their real page size the
      // first time the Album tab is opened and then kept in memory across tabs.
      fetchProjectAlbum(project.id, { page: 1, limit: 1 }).then(res => {
        if (albumLoadedKeyRef.current) return;
        setAlbumTotal(res.total);
        setAlbumTotalSize(res.totalSize);
        setAlbumAspectRatioCounts(res.aspectRatioCounts);
      }).catch(console.error),
      fetchProjectCompletedJobs(project.id, { page: 1, limit: 1 }).then(res => {
        setCompletedTotal(res.total);
        setCompletedPages(res.pages);
      }).catch(console.error),
    ]).finally(() => {
      setIsLoadingWorkflow(false);
      setIsLoadingJobs(false);
    });
  }, [project.id]);

  const albumQueryKey = React.useMemo(() => JSON.stringify({
    projectId: project.id,
    page: albumPage,
    pageSize: albumPageSize,
    sort: albumSort,
    aspectRatios: albumSelectedRatios,
  }), [project.id, albumPage, albumPageSize, albumSort, albumSelectedRatios]);
  const loadAlbumPage = useCallback(async (signalToken: number, showLoading = true) => {
    if (showLoading) setIsLoadingAlbum(true);
    try {
      const res = await fetchProjectAlbum(project.id, {
        page: albumPage,
        limit: albumPageSize === 'all' ? 999999 : albumPageSize,
        sort: albumSort,
        aspectRatios: albumSelectedRatios.length > 0 ? albumSelectedRatios : undefined,
      });
      if (albumFetchTokenRef.current !== signalToken || isDeletingAlbumItemsRef.current) return;
      setLocalAlbum(res.items);
      setAlbumTotal(res.total);
      setAlbumPages(res.pages);
      setAlbumTotalSize(res.totalSize);
      setAlbumAspectRatioCounts(res.aspectRatioCounts);
      albumLoadedKeyRef.current = albumQueryKey;
      albumFetchedAtRef.current = Date.now();
    } catch (e) {
      console.error(e);
    } finally {
      if (albumFetchTokenRef.current === signalToken) setIsLoadingAlbum(false);
    }
  }, [project.id, albumPage, albumPageSize, albumSort, albumSelectedRatios, albumQueryKey]);

  useEffect(() => {
    if (activeTab !== 'album') return;
    const hasLoadedCurrentQuery = albumLoadedKeyRef.current === albumQueryKey;
    const isFresh = Date.now() - albumFetchedAtRef.current < TAB_DATA_STALE_MS;
    if (hasLoadedCurrentQuery && isFresh) {
      setIsLoadingAlbum(false);
      return;
    }
    const token = ++albumFetchTokenRef.current;
    void loadAlbumPage(token, !hasLoadedCurrentQuery);
  }, [activeTab, albumQueryKey, loadAlbumPage]);

  const completedQueryKey = React.useMemo(() => JSON.stringify({
    projectId: project.id,
    page: completedPage,
    pageSize: completedPageSize,
    sort: completedSort,
  }), [project.id, completedPage, completedPageSize, completedSort]);
  const loadCompletedPage = useCallback(async (signalToken: number, showLoading = true) => {
    if (showLoading) setIsLoadingCompleted(true);
    try {
      const res = await fetchProjectCompletedJobs(project.id, {
        page: completedPage,
        limit: completedPageSize === 'all' ? 999999 : completedPageSize,
        sort: completedSort,
      });
      if (completedFetchTokenRef.current !== signalToken) return;
      setCompletedJobs(res.items);
      setCompletedTotal(res.total);
      setCompletedPages(res.pages);
      completedLoadedKeyRef.current = completedQueryKey;
      completedFetchedAtRef.current = Date.now();
    } catch (e) {
      console.error(e);
    } finally {
      if (completedFetchTokenRef.current === signalToken) setIsLoadingCompleted(false);
    }
  }, [project.id, completedPage, completedPageSize, completedSort, completedQueryKey]);

  useEffect(() => {
    if (activeTab !== 'completed') return;
    const hasLoadedCurrentQuery = completedLoadedKeyRef.current === completedQueryKey;
    const isFresh = Date.now() - completedFetchedAtRef.current < TAB_DATA_STALE_MS;
    if (hasLoadedCurrentQuery && isFresh) {
      setIsLoadingCompleted(false);
      return;
    }
    const token = ++completedFetchTokenRef.current;
    void loadCompletedPage(token, !hasLoadedCurrentQuery);
  }, [activeTab, completedQueryKey, loadCompletedPage]);

  const handleAlbumPageChange = useCallback((p: number) => {
    updateAlbumParams({ page: p });
    scrollTabContentTop();
  }, [updateAlbumParams, scrollTabContentTop]);
  const handleAlbumPageSizeChange = useCallback((size: number | 'all') => {
    updateAlbumParams({ pageSize: size });
    scrollTabContentTop();
  }, [updateAlbumParams, scrollTabContentTop]);
  const handleAlbumSortChange = useCallback((sort: 'newest' | 'oldest') => {
    updateAlbumParams({ sort });
  }, [updateAlbumParams]);
  const handleAlbumSelectedRatiosChange = useCallback((ratios: string[]) => {
    updateAlbumParams({ ratios });
  }, [updateAlbumParams]);

  const handleCompletedPageChange = useCallback((p: number) => {
    setCompletedPage(p);
    scrollTabContentTop();
  }, [scrollTabContentTop]);
  const handleCompletedPageSizeChange = useCallback((size: number | 'all') => {
    setCompletedPageSize(size);
    setCompletedPage(1);
    scrollTabContentTop();
  }, [scrollTabContentTop]);
  const handleCompletedSortChange = useCallback((sort: 'newest' | 'oldest') => {
    setCompletedSort(sort);
    setCompletedPage(1);
  }, []);

  const handleReuseWorkflow = async (job: Job) => {
    if (reuseConfigJobId) return;

    setReuseConfigJobId(job.id);
    try {
      const config = await fetchProjectJobConfiguration(localProject.id, job.id);
      if (!config.workflowSnapshot || config.workflowSnapshot.length === 0) {
        toast.error(t('projectViewer.common.reuseConfigurationUnavailable'));
        return;
      }
      setJobToReuse({ ...job, ...config });
    } catch (e: any) {
      toast.error(e?.message || t('projectViewer.common.reuseConfigurationUnavailable'));
    } finally {
      setReuseConfigJobId(null);
    }
  };

  const confirmReuseWorkflow = () => {
    if (!jobToReuse || !jobToReuse.workflowSnapshot) return;

    const newProviderId = jobToReuse.providerId || localProject.providerId;
    const newModelConfigId = jobToReuse.modelConfigId || localProject.modelConfigId;

    const updated = {
      ...localProject,
      workflow: jobToReuse.workflowSnapshot,
      providerId: newProviderId,
      modelConfigId: newModelConfigId,
      aspectRatio: jobToReuse.aspectRatio || localProject.aspectRatio,
      quality: jobToReuse.quality || localProject.quality,
      format: jobToReuse.format || localProject.format,
      background: jobToReuse.background || localProject.background,
      duration: jobToReuse.duration || localProject.duration,
      resolution: jobToReuse.resolution || localProject.resolution,
      sound: jobToReuse.sound || localProject.sound,
    };

    setLocalProject(updated);
    if (newProviderId) setSelectedProviderId(newProviderId);
    if (newModelConfigId) setSelectedModelId(newModelConfigId);
    onUpdate(updated);
    setJobToReuse(null);
    toast.success(t('projectViewer.common.reuseConfiguration'));
    setMobileView('workflow');
  };

  const projectRef = useRef(localProject);
  const localJobsRef = useRef<Job[]>(localJobs);
  const localAlbumRef = useRef<AlbumItem[]>(localAlbum);
  const activeTabRef = useRef(activeTab);
  const liveQueryRef = useRef({
    albumPage,
    albumPageSize,
    albumSort,
    albumSelectedRatios,
    albumQueryKey,
    completedPage,
    completedPageSize,
    completedSort,
    completedQueryKey,
  });
  const liveRefreshTimerRef = useRef<number | null>(null);
  const liveRefreshDueAtRef = useRef<number>(0);
  const liveRefreshInFlightRef = useRef(false);
  const liveRefreshQueuedRef = useRef(false);
  const lastLiveRefreshAtRef = useRef(0);
  const libraryRefreshPromiseRef = useRef<Promise<Library[]> | null>(null);
  const skipProjectSyncRef = useRef(false);
  const workflowListRef = useRef<HTMLDivElement | null>(null);
  const [isProjectLiveConnected, setIsProjectLiveConnected] = useState(false);
  const isProcessing = localJobs.some(j => j.status === 'pending' || j.status === 'processing');

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    liveQueryRef.current = {
      albumPage,
      albumPageSize,
      albumSort,
      albumSelectedRatios,
      albumQueryKey,
      completedPage,
      completedPageSize,
      completedSort,
      completedQueryKey,
    };
  }, [
    albumPage,
    albumPageSize,
    albumSort,
    albumSelectedRatios,
    albumQueryKey,
    completedPage,
    completedPageSize,
    completedSort,
    completedQueryKey,
  ]);

  const onUpdate = useCallback((updated: Project) => {
    onUpdateProp(updated);
  }, [onUpdateProp]);

  const scrollWorkflowToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = workflowListRef.current;
      if (!container) return;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, []);

  const previousWorkflowLengthRef = useRef(localProject.workflow?.length || 0);

  useEffect(() => {
    const currentLength = localProject.workflow?.length || 0;
    if (currentLength > previousWorkflowLengthRef.current) {
      // Small timeout ensures the DOM has updated and rendered the new item
      setTimeout(() => {
        scrollWorkflowToBottom();
      }, 50);
    }
    previousWorkflowLengthRef.current = currentLength;
  }, [localProject.workflow?.length, scrollWorkflowToBottom]);

  useEffect(() => {
    if (skipProjectSyncRef.current) {
      skipProjectSyncRef.current = false;
      return;
    }
    setLocalProject(prev => ({
      ...project,
      workflow: project.workflow?.length ? project.workflow : prev.workflow,
    }));
  }, [project]);

  useEffect(() => {
    projectRef.current = localProject;
  }, [localProject]);

  useEffect(() => {
    localJobsRef.current = localJobs;
  }, [localJobs]);

  useEffect(() => {
    localAlbumRef.current = localAlbum;
  }, [localAlbum]);

  useEffect(() => {
    setLiveLibraries(libraries);
  }, [libraries]);

  const refreshWorkflowLibraries = useCallback(async () => {
    if (libraryRefreshPromiseRef.current) return libraryRefreshPromiseRef.current;

    setIsRefreshingLibraries(true);
    const promise = fetchWorkflowLibraries()
      .then((freshLibraries) => {
        setLiveLibraries(freshLibraries);
        setLibraryRefreshError(null);
        return freshLibraries;
      })
      .catch((error) => {
        console.error('Failed to refresh workflow libraries:', error);
        setLibraryRefreshError(error instanceof Error ? error.message : 'Failed to refresh libraries');
        throw error;
      })
      .finally(() => {
        setIsRefreshingLibraries(false);
        libraryRefreshPromiseRef.current = null;
      });

    libraryRefreshPromiseRef.current = promise;
    return promise;
  }, []);

  const upsertLiveLibrary = useCallback((library: Library) => {
    setLiveLibraries((current) => {
      const existingIndex = current.findIndex((item) => item.id === library.id);
      if (existingIndex === -1) return [library, ...current];
      const next = [...current];
      next[existingIndex] = library;
      return next;
    });
  }, []);

  useEffect(() => {
    void refreshWorkflowLibraries().catch(() => {
      // Keep the route-provided libraries as a fallback if the refresh fails.
    });
  }, [refreshWorkflowLibraries]);

  useEffect(() => {
    if (rawTab) {
      setMobileView('jobs');
    }
  }, [rawTab]);

  const refreshProjectLiveData = useCallback(async () => {
    try {
      const tab = activeTabRef.current;
      const query = liveQueryRef.current;
      const jobsFetchToken = ++jobsFetchTokenRef.current;
      const albumFetchToken = ++albumFetchTokenRef.current;
      const completedFetchToken = ++completedFetchTokenRef.current;
      const [updatedJobs, updatedAlbumRes, updatedCompletedRes] = await Promise.all([
        fetchProjectJobs(localProject.id, { excludeStatus: ['completed'] }).catch(() => null),
        tab === 'album'
          ? fetchProjectAlbum(localProject.id, {
              page: query.albumPage,
              limit: query.albumPageSize === 'all' ? 999999 : query.albumPageSize,
              sort: query.albumSort,
              aspectRatios: query.albumSelectedRatios.length > 0 ? query.albumSelectedRatios : undefined,
            }).catch(() => null)
          : fetchProjectAlbum(localProject.id, {
              page: 1,
              limit: 1,
              sort: query.albumSort,
              aspectRatios: query.albumSelectedRatios.length > 0 ? query.albumSelectedRatios : undefined,
            }).catch(() => null),
        tab === 'completed'
          ? fetchProjectCompletedJobs(localProject.id, {
              page: query.completedPage,
              limit: query.completedPageSize === 'all' ? 999999 : query.completedPageSize,
              sort: query.completedSort,
            }).catch(() => null)
          : fetchProjectCompletedJobs(localProject.id, { page: 1, limit: 1 }).catch(() => null),
      ]);

      if (
        updatedJobs
        && jobsFetchTokenRef.current === jobsFetchToken
        && !isClearingFailedJobsRef.current
        && !isStartingDraftJobsRef.current
        && !isMutatingJobsRef.current
      ) {
        if (JSON.stringify(updatedJobs) !== JSON.stringify(localJobsRef.current)) {
          setLocalJobs(updatedJobs);
        }
      }

      if (
        updatedAlbumRes
        && albumFetchTokenRef.current === albumFetchToken
        && !isDeletingAlbumItemsRef.current
      ) {
        setAlbumTotal(updatedAlbumRes.total);
        setAlbumTotalSize(updatedAlbumRes.totalSize);
        setAlbumAspectRatioCounts(updatedAlbumRes.aspectRatioCounts);
        if (tab === 'album') {
          if (JSON.stringify(updatedAlbumRes.items) !== JSON.stringify(localAlbumRef.current)) {
            setLocalAlbum(updatedAlbumRes.items);
          }
          setAlbumPages(updatedAlbumRes.pages);
          albumLoadedKeyRef.current = query.albumQueryKey;
          albumFetchedAtRef.current = Date.now();
        } else {
          // Keep the cached rows intact while the user is on another tab. Mark
          // them stale so returning to Album shows the cache immediately and
          // revalidates it in the background.
          albumFetchedAtRef.current = 0;
        }
      }

      if (
        updatedCompletedRes
        && completedFetchTokenRef.current === completedFetchToken
        && !isMutatingJobsRef.current
      ) {
        if (tab === 'completed') {
          setCompletedJobs(updatedCompletedRes.items);
          completedLoadedKeyRef.current = query.completedQueryKey;
          completedFetchedAtRef.current = Date.now();
        }
        setCompletedTotal(updatedCompletedRes.total);
        setCompletedPages(updatedCompletedRes.pages);
      }
    } catch (e) {
      console.error('Refreshing project updates failed:', e);
    }
  }, [localProject.id]);

  const scheduleProjectLiveRefresh = useCallback((delayMs = LIVE_REFRESH_DEBOUNCE_MS) => {
    const now = Date.now();
    const dueAt = Math.max(
      now + delayMs,
      lastLiveRefreshAtRef.current + LIVE_REFRESH_MIN_INTERVAL_MS
    );

    if (liveRefreshTimerRef.current !== null && liveRefreshDueAtRef.current <= dueAt) {
      return;
    }

    if (liveRefreshTimerRef.current !== null) {
      window.clearTimeout(liveRefreshTimerRef.current);
    }

    liveRefreshDueAtRef.current = dueAt;
    liveRefreshTimerRef.current = window.setTimeout(() => {
      liveRefreshTimerRef.current = null;
      liveRefreshDueAtRef.current = 0;
      runProjectLiveRefreshRef.current();
    }, Math.max(0, dueAt - now));
  }, []);

  const runProjectLiveRefresh = useCallback(async () => {
    if (liveRefreshInFlightRef.current) {
      liveRefreshQueuedRef.current = true;
      return;
    }

    liveRefreshInFlightRef.current = true;
    try {
      await refreshProjectLiveData();
      lastLiveRefreshAtRef.current = Date.now();
    } finally {
      liveRefreshInFlightRef.current = false;
      if (liveRefreshQueuedRef.current) {
        liveRefreshQueuedRef.current = false;
        scheduleProjectLiveRefresh();
      }
    }
  }, [refreshProjectLiveData, scheduleProjectLiveRefresh]);

  useEffect(() => {
    runProjectLiveRefreshRef.current = () => {
      void runProjectLiveRefresh();
    };
  }, [runProjectLiveRefresh]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let socket: WebSocket | null = null;
    setIsProjectLiveConnected(false);

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/projects/${encodeURIComponent(localProject.id)}/live`);
      socket = ws;

      ws.onopen = () => {
        if (disposed || socket !== ws) return;
        reconnectAttempt = 0;
        setIsProjectLiveConnected(true);
      };

      ws.onmessage = (event) => {
        if (disposed || socket !== ws) return;
        try {
          const data = JSON.parse(event.data);
          if (data?.type !== 'project.changed' || data.projectId !== localProject.id) return;
          if (!RIGHT_PANEL_REFRESH_EVENT_REASONS.has(data.reason)) return;
          scheduleProjectLiveRefresh();
        } catch (error) {
          console.error('Failed to parse project live update:', error);
        }
      };

      ws.onclose = () => {
        if (socket !== ws) return;
        setIsProjectLiveConnected(false);
        socket = null;
        if (disposed) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempt, 15_000);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (liveRefreshTimerRef.current !== null) {
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
      liveRefreshDueAtRef.current = 0;
      liveRefreshQueuedRef.current = false;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [localProject.id, scheduleProjectLiveRefresh]);

  useEffect(() => {
    if (!isProcessing || isProjectLiveConnected) return;
    const interval = window.setInterval(() => {
      void runProjectLiveRefresh();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [isProcessing, isProjectLiveConnected, runProjectLiveRefresh]);

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
  const isAudioProject = localProject.type === 'audio';

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
      } else if (selectedModel.category === 'audio') {
        const audioGenerationKind = resolveAudioGenerationKind(selectedModel);
        const allowedFormats = selectedModel.options.audioFormats
          || (audioGenerationKind === 'music' ? ['mp3'] : ['wav', 'mp3', 'aac']);
        const defaultFormat = allowedFormats[0];

        if (!localProject.format || !allowedFormats.includes(localProject.format as any)) {
          updated.format = defaultFormat as Project['format'];
          needsUpdate = true;
        }
        if (!localProject.systemPrompt) {
          updated.systemPrompt = serializeAudioProjectConfig(createDefaultAudioProjectConfig(audioGenerationKind));
          needsUpdate = true;
        } else if (
          audioGenerationKind !== (parseAudioProjectConfig(localProject.systemPrompt).kind === 'remix-audio-music' ? 'music' : 'tts')
        ) {
          updated.systemPrompt = serializeAudioProjectConfig(createDefaultAudioProjectConfig(audioGenerationKind));
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

  const combinationsCount = React.useMemo(
    () => countWorkflowCombinations(localProject.workflow || [], liveLibraries),
    [localProject.workflow, liveLibraries]
  );

  const addWorkflowItem = (type: WorkflowItemTypeKind, initialValue: string = '') => {
    if (isAudioProject && (type === 'video' || type === 'audio')) {
      return;
    }

    if (isAudioProject && type === 'image' && selectedModel?.options.supportsReferenceImages !== true) {
      return;
    }

    if (type === 'library') {
      setShowLibrarySelector(true);
      void refreshWorkflowLibraries().catch(() => {
        toast.error(t('projectViewer.toasts.refreshLibrariesFailed', { defaultValue: 'Failed to refresh libraries' }));
      });
      return;
    }
    const newItem: WorkflowItemType = { id: crypto.randomUUID(), type, value: initialValue };
    let dbProjectToSave: Project | undefined;
    setLocalProject(prev => {
      dbProjectToSave = { ...prev, workflow: [...(prev.workflow || []), newItem] };
      return dbProjectToSave;
    });
    if (dbProjectToSave) {
      skipProjectSyncRef.current = true;
      setTimeout(() => {
        onUpdate(dbProjectToSave!);
      }, 0);
    }
    scrollWorkflowToBottom();
  };

  const handleLibrarySelect = (libraryId: string) => {
    const library = liveLibraries.find((item) => item.id === libraryId);
    if (!library) {
      setShowLibrarySelector(false);
      return;
    }
    if (isAudioProject && library.type !== 'text') {
      setShowLibrarySelector(false);
      return;
    }
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

  const updateWorkflowItem = (id: string, value: string, thumbnailUrl?: string, optimizedUrl?: string, size?: number) => {
    const updated = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, value, thumbnailUrl, optimizedUrl, size } : item) };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const openWorkflowItemLibrarySelector = (workflowItemId: string) => {
    setSelectingLibraryForItemId(workflowItemId);
    void refreshWorkflowLibraries().catch(() => {
      toast.error(t('projectViewer.toasts.refreshLibrariesFailed', { defaultValue: 'Failed to refresh libraries' }));
    });
  };

  const openWorkflowLibraryChangeSelector = (workflowItemId: string) => {
    setChangingLibraryItemId(workflowItemId);
    void refreshWorkflowLibraries().catch(() => {
      toast.error(t('projectViewer.toasts.refreshLibrariesFailed', { defaultValue: 'Failed to refresh libraries' }));
    });
  };

  const handleWorkflowLibraryChange = (workflowItemId: string, libraryId: string) => {
    const library = liveLibraries.find((item) => item.id === libraryId);
    const workflow = localProject.workflow || [];
    const targetItem = workflow.find((item) => item.id === workflowItemId);

    if (!library || !targetItem || targetItem.type !== 'library') {
      setChangingLibraryItemId(null);
      return;
    }

    if (isAudioProject && library.type !== 'text') {
      setChangingLibraryItemId(null);
      return;
    }

    if (targetItem.value === libraryId || workflow.some((item) => item.id !== workflowItemId && item.type === 'library' && item.value === libraryId)) {
      setChangingLibraryItemId(null);
      return;
    }

    const updated = {
      ...localProject,
      workflow: workflow.map((item) => item.id === workflowItemId ? { ...item, value: libraryId, selectedTags: [] } : item),
    };
    setLocalProject(updated);
    onUpdate(updated);
    setChangingLibraryItemId(null);
  };

  const openSaveWorkflowItemToLibrary = (item: WorkflowItemType) => {
    setSavingLibraryItemId(item.id);
    void refreshWorkflowLibraries().catch(() => {
      toast.error(t('projectViewer.toasts.refreshLibrariesFailed', { defaultValue: 'Failed to refresh libraries' }));
    });
  };

  const handleSaveWorkflowItemToLibrary = async (libraryId: string) => {
    const item = (localProject.workflow || []).find((workflowItem) => workflowItem.id === savingLibraryItemId);
    if (!item) {
      setSavingLibraryItemId(null);
      return;
    }

    setIsSavingToLibrary(true);
    try {
      await createLibraryItem(libraryId, {
        id: crypto.randomUUID(),
        content: item.value,
        thumbnailUrl: item.thumbnailUrl,
        optimizedUrl: item.optimizedUrl,
        size: item.size,
      });
      toast.success(t('projectViewer.toasts.savedToLibrary', { defaultValue: 'Saved to library' }));
      setSavingLibraryItemId(null);
    } catch (error) {
      console.error('Failed to save workflow item to library:', error);
      toast.error(t('projectViewer.toasts.saveToLibraryFailed', { defaultValue: 'Failed to save to library' }));
    } finally {
      setIsSavingToLibrary(false);
    }
  };

  const openLibraryPreview = async (library: Library, workflowItemId: string) => {
    setPreviewingLibrary(library);
    setPreviewingWorkflowItemId(workflowItemId);

    try {
      const freshLibrary = await fetchLibrary(library.id);
      upsertLiveLibrary(freshLibrary);
      setPreviewingLibrary(freshLibrary);
    } catch (error) {
      console.error('Failed to refresh library preview:', error);
      toast.error(t('projectViewer.toasts.refreshLibraryFailed', { defaultValue: 'Failed to refresh library' }));
    }
  };

  const updateWorkflowItemTags = (id: string, selectedTags: string[]) => {
    const updated = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, selectedTags } : item) };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const updateWorkflowItemTagMatchMode = (id: string, tagMatchMode: 'and' | 'or') => {
    const updated = { ...localProject, workflow: localProject.workflow.map(item => item.id === id ? { ...item, tagMatchMode } : item) };
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

  const handleFilesDrop = (files: File[]) => {
    const newItems: import('../types').WorkflowItem[] = [];
    const filesToUpload: { type: 'image' | 'video' | 'audio', file: File, id: string }[] = [];

    files.forEach(file => {
      let type: 'image' | 'video' | 'audio' | undefined;
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      if (isAudioProject && (type === 'video' || type === 'audio')) return;
      if (isAudioProject && type === 'image' && selectedModel?.options.supportsReferenceImages !== true) return;

      if (type) {
        const id = crypto.randomUUID();
        let value = '';
        try {
          if (type === 'image' || type === 'video' || type === 'audio') {
            value = URL.createObjectURL(file);
          }
        } catch (e) {
          // ignore
        }
        newItems.push({ id, type, value });
        filesToUpload.push({ type, file, id });
      }
    });

    if (newItems.length > 0) {
      let dbProjectToSave: Project | undefined;
      setLocalProject(prev => {
        dbProjectToSave = { ...prev, workflow: [...(prev.workflow || []), ...newItems] };
        return dbProjectToSave;
      });
      if (dbProjectToSave) {
        skipProjectSyncRef.current = true;
        setTimeout(() => {
          onUpdate(dbProjectToSave!);
        }, 0);
      }
      scrollWorkflowToBottom();

      filesToUpload.forEach(({ type, file, id }) => {
        const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
        if (type === 'image') void handleImageUpload(fakeEvent, id);
        else if (type === 'video') void handleVideoUpload(fakeEvent, id);
        else if (type === 'audio') void handleAudioUpload(fakeEvent, id);
      });
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in an input/textarea
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement) {
        const tagName = activeElement.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || activeElement.isContentEditable) {
          return;
        }
      }

      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        handleFilesDrop(Array.from(e.clipboardData.files));
      } else {
        const text = e.clipboardData?.getData('text/plain');
        if (text) {
          e.preventDefault();
          addWorkflowItem('text', text);
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleFilesDrop, addWorkflowItem]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    if (e.dataTransfer.types.includes('Files')) return;
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
        // Calculate DB state and local display state using the latest 'prev' to avoid stale closure issues
        let dbProjectToSave: Project | undefined;
        setLocalProject(prev => {
          dbProjectToSave = { ...prev, workflow: prev.workflow.map(item => item.id === id ? { ...item, value: key, thumbnailUrl: thumbnailKey, optimizedUrl: optimizedKey, size } : item) };
          return { ...prev, workflow: prev.workflow.map(item => {
            if (item.id === id) {
              if (item.value.startsWith('blob:')) URL.revokeObjectURL(item.value);
              return { ...item, value: url, thumbnailUrl, optimizedUrl, size };
            }
            return item;
          }) };
        });
        if (dbProjectToSave) {
          setTimeout(() => {
            skipProjectSyncRef.current = true;
            onUpdate(dbProjectToSave as Project);
          }, 0);
        }
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
      let dbProjectToSave: Project | undefined;
      setLocalProject((prev) => {
        dbProjectToSave = {
          ...prev,
          workflow: prev.workflow.map((item) => item.id === id ? {
            ...item,
            value: key,
            thumbnailUrl: thumbnailKey,
            optimizedUrl: optimizedKey,
            size,
          } : item),
        };
        return {
          ...prev,
          workflow: prev.workflow.map((item) => {
            if (item.id === id) {
              if (item.value.startsWith('blob:')) URL.revokeObjectURL(item.value);
              return {
                ...item,
                value: url,
                thumbnailUrl,
                optimizedUrl,
                size,
              };
            }
            return item;
          }),
        };
      });
      if (dbProjectToSave) {
        setTimeout(() => {
          skipProjectSyncRef.current = true;
          onUpdate(dbProjectToSave as Project);
        }, 0);
      }
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
      let dbProjectToSave: Project | undefined;
      setLocalProject((prev) => {
        dbProjectToSave = {
          ...prev,
          workflow: prev.workflow.map((item) => item.id === id ? { ...item, value: key, size } : item),
        };
        return {
          ...prev,
          workflow: prev.workflow.map((item) => {
            if (item.id === id) {
              if (item.value.startsWith('blob:')) URL.revokeObjectURL(item.value);
              return { ...item, value: url, size };
            }
            return item;
          }),
        };
      });
      if (dbProjectToSave) {
        setTimeout(() => {
          skipProjectSyncRef.current = true;
          onUpdate(dbProjectToSave as Project);
        }, 0);
      }
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
      let librariesForGeneration: Library[];
      try {
        librariesForGeneration = await refreshWorkflowLibraries();
      } catch (error) {
        toast.error(t('projectViewer.toasts.refreshLibrariesFailed', { defaultValue: 'Failed to refresh libraries' }));
        return;
      }

      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const selectedCombinations = generateJobs(localProject.workflow || [], librariesForGeneration, queueCount, !!localProject.shuffle);
      if (selectedCombinations.length === 0) return;

      const newJobs: Job[] = [];
      const total = selectedCombinations.length;
      const chunkSize = 25;

      setDraftsProgress({ current: 0, total, stage: 'composing' });

      for (let index = 0; index < total; index += chunkSize) {
        const chunk = selectedCombinations.slice(index, index + chunkSize);

        for (const combo of chunk) {
          const shortuuid = crypto.randomUUID().slice(0, 8);
          const filename = buildJobFilename([
            localProject.prefix,
            ...combo.filenameParts,
          ], shortuuid);

          const isTextProject = localProject.type === 'text';
          const isAudioProject = localProject.type === 'audio';
          const audioConfig = isAudioProject ? parseAudioProjectConfig(localProject.systemPrompt) : DEFAULT_AUDIO_PROJECT_CONFIG;
          const audioFormat = (localProject.format
            || selectedModel?.options.audioFormats?.[0]
            || (audioConfig.kind === 'remix-audio-music' ? 'mp3' : 'wav')) as 'wav' | 'mp3' | 'aac';
          newJobs.push({
            id: crypto.randomUUID(),
            prompt: combo.prompt,
            imageContexts: combo.imageContexts,
            videoContexts: combo.videoContexts,
            audioContexts: combo.audioContexts,
            status: 'draft',
            providerId: selectedProviderId,
            modelConfigId: selectedModelId,
            ...(isTextProject || isAudioProject ? {} : {
              aspectRatio: localProject.aspectRatio || (selectedModel?.options.aspectRatios?.[0] || '1024x1024'),
              quality: localProject.quality || (selectedModel?.options.qualities?.[0] || 'standard'),
              background: localProject.background || (selectedModel?.options.backgrounds?.[0]),
              format: localProject.format || 'png',
            }),
            ...(isAudioProject ? {
              quality: audioConfig.kind === 'remix-audio-music'
                ? (audioConfig.mode === 'instrumental' ? 'instrumental' : 'with-lyrics')
                : audioConfig.speakers[0].voice,
              background: audioConfig.kind === 'remix-audio-music' ? 'music' : audioConfig.mode,
              format: audioFormat,
            } : {}),
            ...(localProject.type === 'video' ? {
              duration: localProject.duration || selectedModel?.options.durations?.[0] || 4,
              resolution: localProject.resolution || selectedModel?.options.resolutions?.[0] || '720p',
              sound: localProject.sound || 'on',
              format: 'mp4' as const,
            } : {}),
            filename,
            workflowSnapshot: localProject.workflow || []
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

      const nextJobs = [...localJobs, ...finalizedJobs];
      const updatedProject = { ...localProject, lastQueueCount: queueCount };
      setDraftsProgress({ current: total, total, stage: 'saving' });

      await apiUpdateProject(updatedProject.id, {
        jobs: nextJobs, workflow: updatedProject.workflow, providerId: selectedProviderId,
        modelConfigId: selectedModelId,
        aspectRatio: localProject.aspectRatio, quality: localProject.quality, background: localProject.background, format: localProject.format || 'png', shuffle: localProject.shuffle,
        systemPrompt: localProject.systemPrompt, temperature: localProject.temperature, maxTokens: localProject.maxTokens,
        duration: localProject.duration, resolution: localProject.resolution, sound: localProject.sound,
        lastQueueCount: queueCount,
      });

      setLocalProject(updatedProject);
      setLocalJobs(stripJobWorkflowSnapshots(nextJobs));
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

  const startDraftJobsAndOpenQueue = async (
    request: { mode: 'allDrafts' } | { mode: 'selected'; jobIds: string[] },
    expectedJobIds: string[],
    errorLabel: string,
  ) => {
    isStartingDraftJobsRef.current = true;
    try {
      await apiStartProjectJobs(localProject.id, request);

      // The start endpoint has committed the status transition and enqueued the
      // work. Read it back before changing tabs so Queue never renders guessed
      // client state.
      ++jobsFetchTokenRef.current;
      const confirmedJobs = await fetchProjectJobs(localProject.id, { excludeStatus: ['completed'] });
      ++jobsFetchTokenRef.current;

      const expectedJobIdSet = new Set(expectedJobIds);
      const confirmedQueueJobIds = new Set(
        confirmedJobs
          .filter((job) => expectedJobIdSet.has(job.id) && ['pending', 'processing', 'failed'].includes(job.status))
          .map((job) => job.id),
      );

      setLocalJobs(confirmedJobs);
      setSelectedDraftIds((current) => {
        const next = new Set(current);
        for (const jobId of confirmedQueueJobIds) next.delete(jobId);
        return next;
      });

      if (confirmedQueueJobIds.size !== expectedJobIdSet.size) {
        toast.error(t('projectViewer.toasts.startedJobsNotVisible', {
          defaultValue: 'Some submitted jobs are not visible in the queue yet.',
        }));
        return;
      }

      setActiveTab('queue');
    } catch (error) {
      console.error(errorLabel, error);
      toast.error(error instanceof Error
        ? error.message
        : t('projectViewer.toasts.startJobsFailed', { defaultValue: 'Failed to start jobs' }));
    } finally {
      isStartingDraftJobsRef.current = false;
    }
  };

  const runDraftJob = async (jobId: string) => {
    const targetJob = localJobsRef.current.find((job) => job.id === jobId);
    if (!targetJob || targetJob.status !== 'draft' || isStartingDraftJobsRef.current) return;

    setStartingDraftJobIds((current) => new Set(current).add(jobId));
    try {
      await startDraftJobsAndOpenQueue(
        { mode: 'selected', jobIds: [jobId] },
        [jobId],
        'Failed to run draft job:',
      );
    } finally {
      setStartingDraftJobIds((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
    }
  };

  const runJob = async (jobId: string) => {
    const targetJob = localJobsRef.current.find((job) => job.id === jobId);
    if (!targetJob || !['failed', 'pending'].includes(targetJob.status) || isMutatingJobsRef.current) return;

    isMutatingJobsRef.current = true;
    setRetryingQueueJobIds((current) => new Set(current).add(jobId));
    try {
      await apiStartProjectJobs(localProject.id, { mode: 'selected', jobIds: [jobId] });
      ++jobsFetchTokenRef.current;
      const confirmedJobs = await fetchProjectJobs(localProject.id, { excludeStatus: ['completed'] });
      ++jobsFetchTokenRef.current;
      setLocalJobs(confirmedJobs);
    } catch (e) {
      console.error('Failed to retry job:', e);
      toast.error(e instanceof Error ? e.message : t('projectViewer.toasts.startJobsFailed'));
    } finally {
      isMutatingJobsRef.current = false;
      setRetryingQueueJobIds((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
    }
  };

  const runAllDrafts = async () => {
    const previousJobs = localJobsRef.current;
    const draftJobIds = previousJobs.filter((job) => job.status === 'draft').map((job) => job.id);
    if (draftJobIds.length === 0 || isStartingDraftJobsRef.current) return;

    setIsStartingDraftBatch(true);
    try {
      await startDraftJobsAndOpenQueue(
        { mode: 'allDrafts' },
        draftJobIds,
        'Failed to run all drafts:',
      );
    } finally {
      setIsStartingDraftBatch(false);
    }
  };

  const runSelectedDrafts = async () => {
    const previousJobs = localJobsRef.current;
    const previousSelectedDraftIds = new Set(selectedDraftIds);
    const jobIds = previousJobs
      .filter(j => previousSelectedDraftIds.has(j.id) && j.status === 'draft')
      .map(j => j.id);
    if (jobIds.length === 0 || isStartingDraftJobsRef.current) return;

    setIsStartingDraftBatch(true);
    try {
      await startDraftJobsAndOpenQueue(
        { mode: 'selected', jobIds },
        jobIds,
        'Failed to run selected drafts:',
      );
    } finally {
      setIsStartingDraftBatch(false);
    }
  };

  const reconcileJobsAfterMutation = async (includeCompleted = false) => {
    ++jobsFetchTokenRef.current;
    if (includeCompleted) ++completedFetchTokenRef.current;

    const [confirmedJobs, confirmedCompleted] = await Promise.all([
      fetchProjectJobs(localProject.id, { excludeStatus: ['completed'] }),
      includeCompleted
        ? fetchProjectCompletedJobs(localProject.id, {
            page: completedPage,
            limit: completedPageSize === 'all' ? 999999 : completedPageSize,
            sort: completedSort,
          })
        : Promise.resolve(null),
    ]);

    ++jobsFetchTokenRef.current;
    setLocalJobs(confirmedJobs);

    if (confirmedCompleted) {
      ++completedFetchTokenRef.current;
      let completedResult = confirmedCompleted;
      if (completedPage > completedResult.pages) {
        completedResult = await fetchProjectCompletedJobs(localProject.id, {
          page: completedResult.pages,
          limit: completedPageSize === 'all' ? 999999 : completedPageSize,
          sort: completedSort,
        });
        setCompletedPage(completedResult.pages);
      }
      setCompletedJobs(completedResult.items);
      setCompletedTotal(completedResult.total);
      setCompletedPages(completedResult.pages);
      completedLoadedKeyRef.current = null;
      completedFetchedAtRef.current = Date.now();
    }
  };

  const deleteJobsAndReconcile = async (jobIds: string[], includeCompleted = false) => {
    if (jobIds.length === 0) return;
    if (isMutatingJobsRef.current) {
      const error = new Error(t('projectViewer.toasts.jobMutationInProgress', {
        defaultValue: 'Another job update is still in progress.',
      }));
      toast.error(error.message);
      throw error;
    }
    isMutatingJobsRef.current = true;
    try {
      await apiDeleteProjectJobs(localProject.id, jobIds);
      await reconcileJobsAfterMutation(includeCompleted);
    } catch (error) {
      console.error('Failed to delete jobs:', error);
      toast.error(error instanceof Error
        ? error.message
        : t('projectViewer.toasts.deleteJobsFailed', { defaultValue: 'Failed to delete jobs' }));
      throw error;
    } finally {
      isMutatingJobsRef.current = false;
    }
  };

  const deleteJob = async (jobId: string) => {
    await deleteJobsAndReconcile([jobId], completedJobs.some((job) => job.id === jobId));
  };

  const deleteSelectedDrafts = async () => {
    const jobIds = Array.from(selectedDraftIds);
    await deleteJobsAndReconcile(jobIds);
    setSelectedDraftIds(new Set());
  };

  const deleteAllDrafts = async () => {
    const jobIds = localJobsRef.current.filter((job) => job.status === 'draft').map((job) => job.id);
    await deleteJobsAndReconcile(jobIds);
    setSelectedDraftIds(new Set());
  };

  const toggleDraftSelection = (jobId: string, isShiftPressed: boolean, scopeIds: string[]) => {
    setSelectedDraftIds(prev => {
      const next = new Set(prev);
      if (isShiftPressed && lastSelectedDraftId !== null) {
        const lastIndex = scopeIds.indexOf(lastSelectedDraftId);
        const currentIndex = scopeIds.indexOf(jobId);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const shouldSelect = !prev.has(jobId);
          for (let i = start; i <= end; i++) {
            if (shouldSelect) next.add(scopeIds[i]);
            else next.delete(scopeIds[i]);
          }
        }
      } else {
        if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      }
      return next;
    });
    setLastSelectedDraftId(jobId);
  };

  const toggleSelectAllDrafts = () => {
    const draftIds = localJobs.filter(j => j.status === 'draft').map(j => j.id);
    setSelectedDraftIds(selectedDraftIds.size === draftIds.length ? new Set() : new Set(draftIds));
  };

  const toggleQueueSelection = (jobId: string, isShiftPressed: boolean, scopeIds: string[]) => {
    setSelectedQueueIds(prev => {
      const next = new Set(prev);
      if (isShiftPressed && lastSelectedQueueId !== null) {
        const lastIndex = scopeIds.indexOf(lastSelectedQueueId);
        const currentIndex = scopeIds.indexOf(jobId);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const shouldSelect = !prev.has(jobId);
          for (let i = start; i <= end; i++) {
            if (shouldSelect) next.add(scopeIds[i]);
            else next.delete(scopeIds[i]);
          }
        }
      } else {
        if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      }
      return next;
    });
    setLastSelectedQueueId(jobId);
  };

  const toggleSelectAllQueue = () => {
    const queueIds = localJobs.filter(j => j.status === 'pending' || j.status === 'processing' || j.status === 'failed').map(j => j.id);
    setSelectedQueueIds(selectedQueueIds.size === queueIds.length ? new Set() : new Set(queueIds));
  };

  const retrySelectedQueue = async () => {
    const jobIds = localJobsRef.current
      .filter(j => selectedQueueIds.has(j.id) && (j.status === 'failed' || j.status === 'pending'))
      .map(j => j.id);
    if (jobIds.length === 0 || isMutatingJobsRef.current) return;

    isMutatingJobsRef.current = true;
    setIsRetryingQueueBatch(true);
    try {
      await apiStartProjectJobs(localProject.id, { mode: 'selected', jobIds });
      ++jobsFetchTokenRef.current;
      const confirmedJobs = await fetchProjectJobs(localProject.id, { excludeStatus: ['completed'] });
      ++jobsFetchTokenRef.current;
      setLocalJobs(confirmedJobs);
      setSelectedQueueIds(new Set());
    } catch (e) {
      console.error('Failed to retry selected jobs:', e);
      toast.error(e instanceof Error ? e.message : t('projectViewer.toasts.startJobsFailed'));
    } finally {
      isMutatingJobsRef.current = false;
      setIsRetryingQueueBatch(false);
    }
  };

  const deleteSelectedQueue = async () => {
    const jobIds = Array.from(selectedQueueIds);
    await deleteJobsAndReconcile(jobIds);
    setSelectedQueueIds(new Set());
  };

  const clearAllFailed = async () => {
    // Route through the dedicated server endpoint instead of the bulk
    // PUT /api/projects/:id path. The bulk path forces saveJobs to consider
    // every other job in localJobs, which is dangerous when localJobs is
    // stale relative to in-flight jobs (it used to wipe taskId on
    // 'processing' rows and strand them forever). The server endpoint deletes
    // only failed rows and re-enqueues remaining pending jobs atomically.
    if (!localJobsRef.current.some((job) => job.status === 'failed')) return;

    isClearingFailedJobsRef.current = true;
    let deleteCompleted = false;
    try {
      await clearFailedQueueJobs({ projectId: localProject.id });
      deleteCompleted = true;

      // Do not change the visible list until both the deletion and the
      // authoritative follow-up read have completed. This intentionally favors
      // correctness over an optimistic response for a destructive bulk action.
      ++jobsFetchTokenRef.current;
      const updatedJobs = await fetchProjectJobs(localProject.id, { excludeStatus: ['completed'] });

      // Make this confirmed read authoritative over any concurrent live refresh.
      ++jobsFetchTokenRef.current;
      setLocalJobs(updatedJobs);
      setSelectedQueueIds(new Set());
    } catch (e) {
      if (deleteCompleted) {
        console.error('Failed to refresh jobs after clearing failed jobs:', e);
        toast.error(t('projectViewer.toasts.refreshAfterClearFailedJobsFailed', {
          defaultValue: 'Failed jobs were cleared, but the list could not be refreshed.',
        }));
      } else {
        console.error('Failed to clear failed jobs:', e);
        toast.error(t('projectViewer.toasts.clearFailedJobsFailed', {
          defaultValue: 'Failed to clear failed jobs. Please try again.',
        }));
      }
      throw e;
    } finally {
      isClearingFailedJobsRef.current = false;
    }
  };

  const toggleCompletedSelection = (jobId: string, isShiftPressed: boolean, scopeIds: string[]) => {
    setSelectedCompletedIds(prev => {
      const next = new Set(prev);
      if (isShiftPressed && lastSelectedCompletedId !== null) {
        const lastIndex = scopeIds.indexOf(lastSelectedCompletedId);
        const currentIndex = scopeIds.indexOf(jobId);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const shouldSelect = !prev.has(jobId);
          for (let i = start; i <= end; i++) {
            if (shouldSelect) next.add(scopeIds[i]);
            else next.delete(scopeIds[i]);
          }
        }
      } else {
        if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      }
      return next;
    });
    setLastSelectedCompletedId(jobId);
  };

  const toggleSelectAllCompleted = () => {
    const completedIds = completedJobs.map(j => j.id);
    setSelectedCompletedIds(selectedCompletedIds.size === completedIds.length ? new Set() : new Set(completedIds));
  };

  const deleteSelectedCompleted = async () => {
    const idsToDelete = Array.from(selectedCompletedIds);
    if (idsToDelete.length === 0) return;
    await deleteJobsAndReconcile(idsToDelete, true);
    setSelectedCompletedIds(new Set());
  };

  const toggleAlbumSelection = (id: string, isShiftPressed: boolean, scopeIds?: string[]) => {
    setSelectedAlbumIds(prev => {
      const next = new Set(prev);
      const scopedIds = scopeIds !== undefined ? scopeIds : localAlbum.map(item => item.id);
      if (isShiftPressed && lastSelectedAlbumId && next.has(lastSelectedAlbumId)) {
        const lastIndex = scopedIds.findIndex(itemId => itemId === lastSelectedAlbumId);
        const currentIndex = scopedIds.findIndex(itemId => itemId === id);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          for (let i = start; i <= end; i++) next.add(scopedIds[i]);
        }
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
    setLastSelectedAlbumId(id);
  };

  const toggleSelectAllAlbum = (scopeIds?: string[]) => {
    const albumIds = scopeIds !== undefined ? scopeIds : localAlbum.map(item => item.id);
    const allSelected = albumIds.length > 0 && albumIds.every(id => selectedAlbumIds.has(id));
    setSelectedAlbumIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        albumIds.forEach(id => next.delete(id));
      } else {
        albumIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const deleteAlbumItems = async (items: AlbumItem[]) => {
    if (items.length === 0) return;

    isDeletingAlbumItemsRef.current = true;
    try {
      const itemIds = items.map(i => i.id);
      if (itemIds.length === 1) await moveToTrash(localProject.id, itemIds[0]); else await moveToTrashBatch(localProject.id, itemIds);

      const query = liveQueryRef.current;
      const itemIdsSet = new Set(itemIds);

      // The delete endpoint has already committed the mutation. Update the
      // cached page immediately instead of blocking the UI on a full page
      // refetch (and a fresh round of signed image URLs).
      ++albumFetchTokenRef.current;
      setLocalAlbum((current) => current.filter((item) => !itemIdsSet.has(item.id)));

      const nextAlbumTotal = Math.max(0, albumTotal - itemIds.length);
      const pageSize = query.albumPageSize === 'all' ? Math.max(nextAlbumTotal, 1) : query.albumPageSize;
      const nextAlbumPages = Math.max(1, Math.ceil(nextAlbumTotal / pageSize));
      setAlbumTotal(nextAlbumTotal);
      setAlbumPages(nextAlbumPages);

      const removedSize = items.reduce((total, item) => total + Number(item.size || 0), 0);
      setAlbumTotalSize((current) => Math.max(0, current - removedSize));

      const removedAspectRatios = items.reduce<Record<string, number>>((counts, item) => {
        const ratio = item.aspectRatio?.trim();
        if (ratio) counts[ratio] = (counts[ratio] || 0) + 1;
        return counts;
      }, {});
      if (Object.keys(removedAspectRatios).length > 0) {
        setAlbumAspectRatioCounts((current) => current
          .map(({ ratio, count }) => ({
            ratio,
            count: Math.max(0, count - (removedAspectRatios[ratio] || 0)),
          }))
          .filter(({ count }) => count > 0));
      }

      albumLoadedKeyRef.current = query.albumQueryKey;
      albumFetchedAtRef.current = Date.now();

      setSelectedAlbumIds(prev => {
        const next = new Set(prev);
        itemIdsSet.forEach(id => next.delete(id));
        return next;
      });

      if (query.albumPage > nextAlbumPages) {
        albumLoadedKeyRef.current = null;
        updateAlbumParams({ page: nextAlbumPages });
      }
    } catch (e: any) {
      console.error('Failed to move items to trash:', e);
      toast.error(`Failed to move items to trash: ${e.message}`);
      throw e;
    } finally {
      isDeletingAlbumItemsRef.current = false;
    }
  };

  const updateLightboxAfterAlbumDelete = (deletedItems: AlbumItem[]) => {
    const deletedItemIds = new Set(deletedItems.map((item) => item.id));
    const deletedImageUrls = new Set(deletedItems.map((item) => apiImageDisplayUrl(item.optimizedUrl || item.imageUrl)));

    setLightboxData((current) => {
      if (!current) return current;

      const nextEntries = current.images
        .map((image, index) => ({ image, albumItemId: current.albumItemIds?.[index] }))
        .filter(({ image, albumItemId }) => (
          albumItemId
            ? !deletedItemIds.has(albumItemId)
            : !deletedImageUrls.has(image)
        ));

      if (nextEntries.length === current.images.length) return current;
      if (nextEntries.length === 0) return null;

      return {
        ...current,
        images: nextEntries.map((entry) => entry.image),
        albumItemIds: current.albumItemIds ? nextEntries.map((entry) => entry.albumItemId || '') : undefined,
        index: Math.min(current.index, nextEntries.length - 1),
      };
    });
  };

  const renameAlbumItem = async (itemId: string, filename: string) => {
    const updatedItem = await apiRenameAlbumItem(localProject.id, itemId, filename);
    setLocalAlbum((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...updatedItem } : item)));
    return updatedItem;
  };

  const draftJobs = localJobs.filter(j => j.status === 'draft');
  const queueJobs = localJobs.filter(j => ['pending', 'processing', 'failed'].includes(j.status));
  const albumItems = localAlbum;
  const isArchived = localProject.status === 'archived';

  const handleToggleArchive = async () => {
    const nextStatus: 'active' | 'archived' = isArchived ? 'active' : 'archived';
    const updated = { ...localProject, status: nextStatus };
    setIsTogglingArchive(true);
    try {
      await apiUpdateProject(localProject.id, { status: nextStatus });
      setLocalProject(updated);
      toast.success(
        nextStatus === 'archived'
          ? t('projectViewer.toasts.archived', { name: localProject.name })
          : t('projectViewer.toasts.unarchived', { name: localProject.name })
      );
      onUpdate(updated);
    } catch (e) {
      console.error('Failed to toggle archive status:', e);
      toast.error(t('projectViewer.toasts.archiveFailed'));
    } finally {
      setIsTogglingArchive(false);
    }
  };

  const handleToggleItemDisable = (id: string) => {
    const updated = {
      ...localProject,
      workflow: (localProject.workflow || []).map(item =>
        item.id === id ? { ...item, disabled: !item.disabled } : item
      )
    };
    setLocalProject(updated);
    onUpdate(updated);
  };

  const handleStartAssistantChat = () => {
    const projectContext: BoundContext = {
      id: localProject.id,
      name: localProject.name,
      type: 'project',
      subType: localProject.type || 'image',
    };

    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', {
      state: {
        draftBoundContexts: [projectContext],
      },
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-transparent overflow-hidden lg:overflow-visible">
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
        isLoading={isLoadingWorkflow}
        project={project}
        localProject={localProject}
        libraries={liveLibraries}
        providers={providers}
        mobileView={mobileView}
        workflowListRef={workflowListRef}
        draggedIndex={draggedIndex}
        dragOverIndex={dragOverIndex}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        isSettingsCollapsed={isSettingsCollapsed}
        isExpanded={isWorkflowExpanded}
        onToggleExpand={() => setIsWorkflowExpanded((prev) => !prev)}
        queueCount={queueCount}
        workflowError={workflowError}
        uploadingItemIds={uploadingItemIds}
        isAddingDrafts={isAddingDrafts}
        draftsProgress={draftsProgress}
        combinationsCount={combinationsCount}
        onNavigateToEdit={() => navigate(`/project/${project.id}/edit`)}
        onNavigateToOrphans={() => navigate(`/project/${project.id}/orphans`)}
        onNavigateToDuplicate={() => navigate(`/project/new`, { state: { copyFrom: project.id } })}
        onStartAssistantChat={handleStartAssistantChat}
        onShowDeleteProject={() => setShowDeleteProjectModal(true)}
        onToggleArchive={handleToggleArchive}
        isTogglingArchive={isTogglingArchive}
        isArchived={isArchived}
        onAddWorkflowItem={addWorkflowItem}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDraggedIndex(null);
          setDragOverIndex(null);
        }}
        onRemoveItem={(id) => setItemToRemoveId(id)}
        onEditItem={setEditingItem}
        onEditImage={setEditingImageItem}
        onPreviewLibrary={(lib, workflowItemId) => {
          void openLibraryPreview(lib, workflowItemId);
        }}
        onImageUpload={handleImageUpload}
        onVideoUpload={handleVideoUpload}
        onAudioUpload={handleAudioUpload}
        onLightbox={(images, index) => setLightboxData({ images, index })}
        onUpdateTags={updateWorkflowItemTags}
        onSelectFromLibrary={openWorkflowItemLibrarySelector}
        onChangeLibrary={openWorkflowLibraryChangeSelector}
        onSaveToLibrary={openSaveWorkflowItemToLibrary}
        setLocalProject={setLocalProject}
        onUpdate={onUpdate}
        setIsSettingsCollapsed={setIsSettingsCollapsed}
        setQueueCount={setQueueCount}
        setIsModelSelectorOpen={setIsModelSelectorOpen}
        onAddDraftsToQueue={addDraftsToQueue}
        onToggleDisable={handleToggleItemDisable}
        onFilesDrop={handleFilesDrop}
      />

      <div className={`flex-1 flex-col overflow-hidden min-h-0 ${mobileView === 'jobs' ? 'flex h-full' : 'hidden'} ${isWorkflowExpanded ? 'lg:hidden' : 'lg:flex'}`}>
        <div className="p-3 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-3xl shadow-sm flex flex-col gap-3 relative z-10">
          <div className="min-h-[40px] flex items-center justify-center gap-4">
            <div className="flex bg-neutral-100/30 dark:bg-black/40 border border-neutral-200/50 dark:border-white/5 rounded-xl p-1 flex-1 max-w-lg shadow-inner backdrop-blur-md">
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
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({completedTotal})</span>
              </button>
              <button onClick={() => setActiveTab('album')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${activeTab === 'album' ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-white shadow-sm border border-neutral-200 dark:border-neutral-700' : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 hover:bg-white/50 dark:hover:bg-neutral-900/50 border border-transparent'}`}>
                <Grid className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                  {localProject.type === 'text'
                    ? t('projectViewer.tabs.texts')
                    : localProject.type === 'audio'
                      ? t('projectViewer.tabs.audios')
                      : t('projectViewer.tabs.album')}
                </span>
                <span className="text-[9px] font-bold opacity-40 font-mono tracking-tighter">({albumTotal})</span>
              </button>
            </div>
          </div>
        </div>

        <div ref={tabContentRef} className="flex-1 overflow-y-auto custom-scrollbar p-0 space-y-0 relative">
          {activeTab === 'draft' && isLoadingJobs && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-20">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
            </div>
          )}
          {activeTab === 'draft' && !isLoadingJobs && (
            <DraftsTab
              draftJobs={draftJobs} selectedDraftIds={selectedDraftIds} toggleSelectAllDrafts={toggleSelectAllDrafts}
              setShowDeleteSelectedModal={setShowDeleteSelectedModal} runSelectedDrafts={runSelectedDrafts}
              setShowDeleteAllDraftsModal={setShowDeleteAllDraftsModal} runAllDrafts={runAllDrafts}
              isStartingDraftBatch={isStartingDraftBatch} startingDraftJobIds={startingDraftJobIds}
              expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand} toggleDraftSelection={toggleDraftSelection}
              getProviderName={getProviderName} getModelName={getModelName} runJob={runDraftJob}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
              albumItems={albumItems}
              onSwitchToAlbum={() => setActiveTab('album')}
              projectType={localProject.type || 'image'}
              projectName={localProject.name}
              onReuse={handleReuseWorkflow}
            />
          )}
          {activeTab === 'queue' && isLoadingJobs && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-20">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
            </div>
          )}
          {activeTab === 'queue' && !isLoadingJobs && (
            <QueueTab
              queueJobs={queueJobs} selectedQueueIds={selectedQueueIds} toggleSelectAllQueue={toggleSelectAllQueue}
              toggleQueueSelection={toggleQueueSelection} retrySelectedQueue={retrySelectedQueue} deleteSelectedQueue={() => setShowDeleteQueueSelectedModal(true)}
              isRetryingQueueBatch={isRetryingQueueBatch} retryingQueueJobIds={retryingQueueJobIds}
              clearAllFailed={() => setShowClearAllFailedModal(true)} expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand}
              getProviderName={getProviderName} getModelName={getModelName} runJob={runJob}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
              onReuse={handleReuseWorkflow}
            />
          )}
          {activeTab === 'completed' && isLoadingCompleted && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-20">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
            </div>
          )}
          {activeTab === 'completed' && !isLoadingCompleted && (
            <CompletedTab
              completedJobs={completedJobs} expandedJobId={expandedJobId} toggleJobExpand={toggleJobExpand}
              selectedCompletedIds={selectedCompletedIds} toggleCompletedSelection={toggleCompletedSelection}
              toggleSelectAllCompleted={toggleSelectAllCompleted} setShowDeleteSelectedModal={setShowDeleteCompletedSelectedModal}
              getProviderName={getProviderName} getModelName={getModelName}
              setJobToDeleteId={setJobToDeleteId} setLightboxData={setLightboxData}
              projectType={localProject.type || 'image'}
              onReuse={handleReuseWorkflow}
              page={completedPage}
              pageSize={completedPageSize}
              total={completedTotal}
              pages={completedPages}
              sort={completedSort}
              onPageChange={handleCompletedPageChange}
              onPageSizeChange={handleCompletedPageSizeChange}
              onSortChange={handleCompletedSortChange}
            />
          )}
          {activeTab === 'album' && isLoadingAlbum && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-20">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
            </div>
          )}
          {activeTab === 'album' && !isLoadingAlbum && (
            <AlbumTab
              projectId={localProject.id}
              projectName={localProject.name}
              albumItems={albumItems} selectedAlbumIds={selectedAlbumIds} toggleSelectAllAlbum={toggleSelectAllAlbum}
              toggleAlbumSelection={toggleAlbumSelection} setAlbumItemsToDelete={setAlbumItemsToDelete}
              setShowDeleteAlbumModal={setShowDeleteAlbumModal} getProviderName={getProviderName} getModelName={getModelName}
              setLightboxData={setLightboxData}
              onRenameAlbumItem={renameAlbumItem}
              onExportStarted={() => navigate('/exports')}
              projectType={localProject.type || 'image'}
              page={albumPage}
              pageSize={albumPageSize}
              total={albumTotal}
              pages={albumPages}
              totalSize={albumTotalSize}
              aspectRatioCounts={albumAspectRatioCounts}
              sort={albumSort}
              selectedAspectRatios={albumSelectedRatios}
              onPageChange={handleAlbumPageChange}
              onPageSizeChange={handleAlbumPageSizeChange}
              onSortChange={handleAlbumSortChange}
              onSelectedAspectRatiosChange={handleAlbumSelectedRatiosChange}
            />
          )}
        </div>
      </div>

      <ConfirmModal isOpen={jobToReuse !== null} onClose={() => setJobToReuse(null)} onConfirm={confirmReuseWorkflow} title={t('projectViewer.confirm.reuseConfiguration.title')} message={t('projectViewer.confirm.reuseConfiguration.message')} confirmText={t('projectViewer.confirm.reuseConfiguration.confirm')} type="info" />
      <ConfirmModal isOpen={itemToRemoveId !== null} onClose={() => setItemToRemoveId(null)} onConfirm={confirmRemoveWorkflowItem} title={t('projectViewer.confirm.removeWorkflowItem.title')} message={t('projectViewer.confirm.removeWorkflowItem.message')} confirmText={t('projectViewer.confirm.removeWorkflowItem.confirm')} type="danger" />
      <PromptModal item={editingItem} onClose={() => setEditingItem(null)} onSave={(value) => { if (editingItem) updateWorkflowItem(editingItem.id, value); setEditingItem(null); }} />
      {editingImageItem && editingImageItem.value && (
        <ImageEditorModal
          isOpen={true}
          onClose={() => setEditingImageItem(null)}
          imageUrl={apiImageDisplayUrl(editingImageItem.value)}
          onSave={async (base64) => {
            const { key, url, thumbnailKey, thumbnailUrl, optimizedKey, optimizedUrl, size } = await saveImage(base64, localProject.id);
            let dbProjectToSave: Project | undefined;
            setLocalProject(prev => {
              dbProjectToSave = { ...prev, workflow: prev.workflow.map(item => item.id === editingImageItem.id ? { ...item, value: key, thumbnailUrl: thumbnailKey, optimizedUrl: optimizedKey, size } : item) };
              return { ...prev, workflow: prev.workflow.map(item => {
                if (item.id === editingImageItem.id) {
                  return { ...item, value: url, thumbnailUrl, optimizedUrl, size };
                }
                return item;
              }) };
            });
            if (dbProjectToSave) {
              setTimeout(() => {
                skipProjectSyncRef.current = true;
                onUpdate(dbProjectToSave as Project);
              }, 0);
            }
            setEditingImageItem(null);
          }}
        />
      )}
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
      <ConfirmModal isOpen={jobToDeleteId !== null} onClose={() => setJobToDeleteId(null)} onConfirm={async () => { if (jobToDeleteId) { await deleteJob(jobToDeleteId); setJobToDeleteId(null); } }} title={t('projectViewer.confirm.deleteJob.title')} message={t('projectViewer.confirm.deleteJob.message')} confirmText={t('projectViewer.confirm.deleteJob.confirm')} type="danger" />
      <LibrarySelectionModal
        isOpen={showLibrarySelector || changingLibraryItemId !== null || savingLibraryItemId !== null}
        onClose={() => {
          setShowLibrarySelector(false);
          setChangingLibraryItemId(null);
          setSavingLibraryItemId(null);
        }}
        onSelect={(libraryId) => {
          if (changingLibraryItemId) {
            handleWorkflowLibraryChange(changingLibraryItemId, libraryId);
          } else if (savingLibraryItemId) {
            void handleSaveWorkflowItemToLibrary(libraryId);
          } else {
            handleLibrarySelect(libraryId);
          }
        }}
        libraries={(() => {
          if (savingLibraryItemId) {
            const item = (localProject.workflow || []).find((workflowItem) => workflowItem.id === savingLibraryItemId);
            const type = item?.type === 'image' ? 'image' : 'text';
            return liveLibraries.filter((library) => library.type === type);
          }
          return isAudioProject ? liveLibraries.filter((library) => library.type === 'text') : liveLibraries;
        })()}
        selectedLibraryIds={savingLibraryItemId ? [] : (localProject.workflow || []).filter(item => item.type === 'library').map(item => item.value)}
        isLoading={isRefreshingLibraries || isSavingToLibrary}
        error={libraryRefreshError}
        title={savingLibraryItemId ? t('projectViewer.saveToLibrarySelection.title', { defaultValue: 'Save to Library' }) : undefined}
        description={savingLibraryItemId ? t('projectViewer.saveToLibrarySelection.description', { defaultValue: 'Choose a library to save this item to' }) : undefined}
      />
      <UniversalMediaPicker
        isOpen={!!selectingLibraryForItemId}
        title="Pick Workflow Item"
        allowedTypes={(() => {
          const item = (localProject.workflow || []).find((workflowItem) => workflowItem.id === selectingLibraryForItemId);
          return item && item.type !== 'library' ? [item.type] : ['text'];
        })()}
        defaultSourceKind="library"
        multiple={false}
        enableImageVersionSelection
        onClose={() => setSelectingLibraryForItemId(null)}
        onConfirm={(items: UniversalPickedItem[]) => {
          const picked = items[0];
          if (!selectingLibraryForItemId || !picked) return;
          updateWorkflowItem(
            selectingLibraryForItemId,
            picked.value,
            picked.thumbnailUrl,
            picked.optimizedUrl,
            picked.size,
          );
          setSelectingLibraryForItemId(null);
        }}
      />
      <LibraryPreviewModal
        library={previewingLibrary}
        selectedTags={localProject.workflow.find(i => i.id === previewingWorkflowItemId)?.selectedTags || []}
        onUpdateTags={(tags) => {
          if (previewingWorkflowItemId) updateWorkflowItemTags(previewingWorkflowItemId, tags);
        }}
        tagMatchMode={localProject.workflow.find(i => i.id === previewingWorkflowItemId)?.tagMatchMode || 'or'}
        onUpdateTagMatchMode={(mode) => {
          if (previewingWorkflowItemId) updateWorkflowItemTagMatchMode(previewingWorkflowItemId, mode);
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
      {lightboxData && (
        <ImageLightbox
          images={lightboxData.images}
          startIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
          onDelete={lightboxData.albumItemIds ? (index) => {
            const albumItemId = lightboxData.albumItemIds?.[index];
            const itemToDelete = albumItemId ? localAlbumRef.current.find((item) => item.id === albumItemId) : undefined;
            if (itemToDelete) {
              setAlbumItemsToDelete([itemToDelete]);
              setShowDeleteAlbumModal(true);
            }
          } : lightboxData.onDelete}
          onIndexChange={(index) => {
            setLightboxData((current) => current && current.index !== index ? { ...current, index } : current);
            lightboxData.onIndexChange?.(index);
          }}
        />
      )}
      <ConfirmModal
        isOpen={showDeleteAlbumModal}
        onClose={() => { setShowDeleteAlbumModal(false); setAlbumItemsToDelete(null); }}
        onConfirm={async () => {
          if (albumItemsToDelete) {
            await deleteAlbumItems(albumItemsToDelete);
            updateLightboxAfterAlbumDelete(albumItemsToDelete);
            setShowDeleteAlbumModal(false);
            setAlbumItemsToDelete(null);
          }
        }}
        title={t('projectViewer.confirm.moveToRecycleBin.title')}
        message={t('projectViewer.confirm.moveToRecycleBin.message', { count: albumItemsToDelete?.length || 0 })}
        confirmText={t('projectViewer.confirm.moveToRecycleBin.confirm')}
        type="danger"
        dismissKeys={['d', 'D']}
      />
      <ConfirmModal isOpen={showDeleteCompletedSelectedModal} onClose={() => setShowDeleteCompletedSelectedModal(false)} onConfirm={deleteSelectedCompleted} title={t('projectViewer.confirm.removeFinishedRecords.title')} message={t('projectViewer.confirm.removeFinishedRecords.message', { count: selectedCompletedIds.size })} confirmText={t('projectViewer.confirm.removeFinishedRecords.confirm')} type="danger" />
      <ConfirmModal isOpen={showDeleteQueueSelectedModal} onClose={() => setShowDeleteQueueSelectedModal(false)} onConfirm={deleteSelectedQueue} title={t('projectViewer.confirm.deleteSelectedJobs.title')} message={t('projectViewer.confirm.deleteSelectedJobs.message', { count: selectedQueueIds.size })} confirmText={t('projectViewer.confirm.deleteSelectedJobs.confirm')} type="danger" />
      <ConfirmModal isOpen={showClearAllFailedModal} onClose={() => setShowClearAllFailedModal(false)} onConfirm={clearAllFailed} title={t('projectViewer.confirm.clearFailedJobs.title')} message={t('projectViewer.confirm.clearFailedJobs.message')} confirmText={t('projectViewer.confirm.clearFailedJobs.confirm')} type="danger" />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckSquare,
  FileText,
  FolderInput,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  Music,
  Search,
  Square,
  Video as VideoIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchProject,
  fetchProjectAlbum,
  fetchProjects,
  imageDisplayUrl,
  moveAlbumItemsToProject,
} from '../api';
import type { AlbumItem, Project, ProjectType } from '../types';
import { PageHeader } from '../components/PageHeader';

type MoveLocationState = { itemIds?: string[] };

/** How many projects the destination picker loads to choose from. */
const DESTINATION_PAGE_SIZE = 200;

/**
 * The selection arrives through `sessionStorage` (a batch of any size survives
 * the navigation and a reload), with the navigation state and an `ids` query
 * parameter as fallbacks.
 */
function readScopedItemIds(scopeKey: string | null, idsParam: string | null, stateItemIds?: string[]): string[] {
  if (scopeKey) {
    try {
      const stored = sessionStorage.getItem(scopeKey);
      const parsed = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
    } catch {
      // A cleared or unavailable store just falls through to the fallbacks.
    }
  }

  if (Array.isArray(stateItemIds) && stateItemIds.length > 0) return stateItemIds;
  if (idsParam) return idsParam.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function getAlbumFilename(item: AlbumItem) {
  const path = (item.imageUrl || '').split('?')[0];
  const decoded = decodeURIComponent(path.split('/').pop() || '');
  return decoded || item.id;
}

function formatSize(bytes: number) {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The confirmation step between picking album items and moving them.
 *
 * It is a page rather than a dialog because the move is not reversible from
 * the interface: it shows exactly which items travel, what goes with each one,
 * and where they land, and a phone gets the whole viewport to show that in.
 */
export function AlbumMoveToProject() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const locationState = location.state as MoveLocationState | null;
  const stateItemIds = locationState?.itemIds;
  const scopeKey = searchParams.get('scopeKey');
  const idsParam = searchParams.get('ids');
  // Memoised on the primitives behind the ids rather than on the router
  // objects, so the load effect below cannot re-run on an identity change.
  const scopedItemIds = useMemo(
    () => readScopedItemIds(scopeKey, idsParam, stateItemIds),
    [idsParam, scopeKey, stateItemIds?.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [destinationProjectId, setDestinationProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const projectType: ProjectType = (project?.type || 'image') as ProjectType;
  const isTextProject = projectType === 'text';
  const isVideoProject = projectType === 'video';
  const isAudioProject = projectType === 'audio';
  const TypeIcon = isTextProject ? FileText : isVideoProject ? VideoIcon : isAudioProject ? Music : ImageIcon;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadPage(projectId: string) {
      setIsLoading(true);
      try {
        const [projectData, albumData, projectList] = await Promise.all([
          fetchProject(projectId),
          fetchProjectAlbum(projectId, { limit: 999999, sort: 'newest' }),
          fetchProjects(1, DESTINATION_PAGE_SIZE, undefined, 'all'),
        ]);
        if (cancelled) return;
        setProject(projectData);
        const selected = new Set(scopedItemIds);
        setItems(albumData.items.filter((item) => selected.has(item.id)));
        const sourceType = projectData.type || 'image';
        const candidates = projectList.items.filter(
          (candidate) => candidate.id !== projectId && (candidate.type || 'image') === sourceType,
        );
        setProjects(candidates);
        setDestinationProjectId(candidates[0]?.id || '');
        setMode(candidates.length > 0 ? 'existing' : 'new');
        setNewProjectName((current) => current || `${projectData.name} ${t('projectViewer.moveToProject.newProjectSuffix')}`);
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || t('projectViewer.moveToProject.loadFailed'));
          navigate(`/project/${projectId}`);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPage(id);
    return () => { cancelled = true; };
    // `t` is stable enough here; re-running on a language switch would discard the typed name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, scopedItemIds]);

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0), 0),
    [items],
  );
  const jobCount = useMemo(
    () => new Set(items.map((item) => item.jobId).filter(Boolean)).size,
    [items],
  );
  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(
      (candidate) => candidate.name.toLowerCase().includes(needle) || candidate.id.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const canSubmit = items.length > 0 && (mode === 'existing' ? Boolean(destinationProjectId) : Boolean(newProjectName.trim()));

  const handleConfirm = async () => {
    if (!id || !canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await moveAlbumItemsToProject(id, {
        itemIds: items.map((item) => item.id),
        destinationProjectId: mode === 'existing' ? destinationProjectId : undefined,
        newProjectName: mode === 'new' ? newProjectName.trim() : undefined,
      });
      toast.success(t('projectViewer.moveToProject.moved', { count: result.movedItems }));
      navigate(`/project/${result.projectId}?tab=album`);
    } catch (error: any) {
      toast.error(error?.message || t('projectViewer.moveToProject.moveFailed'));
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
      <div className="w-full space-y-6 pb-12 md:space-y-8 md:pb-8">
        <PageHeader
          title={t('projectViewer.moveToProject.title')}
          description={t('projectViewer.moveToProject.description', { name: project?.name || id })}
          backLink={{ label: t('projectViewer.moveToProject.back'), onClick: () => navigate(-1) }}
        />

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-neutral-300 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/50 p-8 text-center">
            <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">{t('projectViewer.moveToProject.nothingSelected')}</p>
            <p className="mt-2 text-xs text-neutral-500">{t('projectViewer.moveToProject.nothingSelectedHint')}</p>
            <button
              onClick={() => navigate(`/project/${id}?tab=album`)}
              className="mt-6 w-full sm:w-auto rounded-xl bg-blue-600 px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-500"
            >
              {t('projectViewer.moveToProject.back')}
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* What is being moved */}
            <section className="space-y-4 rounded-card border border-neutral-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55 md:p-6">
              <header className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-blue-500">
                  <TypeIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black tracking-tight text-neutral-900 dark:text-white">
                    {t('projectViewer.moveToProject.itemsHeading', { count: items.length })}
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    {formatSize(totalSize)}
                  </p>
                </div>
              </header>

              <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                <li className="flex items-start gap-2">
                  <CheckSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                  <span>{t('projectViewer.moveToProject.includesItems', { count: items.length })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                  <span>{t('projectViewer.moveToProject.includesJobs', { count: jobCount })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                  <span>{t('projectViewer.moveToProject.includesReusable')}</span>
                </li>
              </ul>

              <div className="flex items-start gap-3 rounded-card border border-amber-500/20 bg-amber-500/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <p className="text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
                  {t('projectViewer.moveToProject.warning')}
                </p>
              </div>

              {isTextProject || isAudioProject ? (
                <div className="max-h-72 space-y-1.5 overflow-y-auto custom-scrollbar">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800/80 dark:bg-neutral-950/40 dark:text-neutral-300"
                    >
                      <p className="line-clamp-2 break-words">{item.textContent || item.prompt || getAlbumFilename(item)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto custom-scrollbar sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {items.map((item) => {
                    const preview = item.thumbnailUrl || item.optimizedUrl || item.imageUrl;
                    return (
                      <div
                        key={item.id}
                        className="relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
                        title={getAlbumFilename(item)}
                      >
                        {preview ? (
                          <img
                            src={imageDisplayUrl(preview)}
                            alt={getAlbumFilename(item)}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-neutral-400">
                            <TypeIcon className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Destination */}
            <section className="space-y-4 rounded-card border border-neutral-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55 md:p-6 lg:sticky lg:top-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                {t('projectViewer.moveToProject.destination')}
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={projects.length === 0}
                  onClick={() => setMode('existing')}
                  className={`flex flex-col items-center gap-2 rounded-card border p-3 transition-all ${
                    mode === 'existing'
                      ? 'border-blue-500/50 bg-blue-600/10 text-blue-500'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-200/50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <Layers className="h-6 w-6" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t('projectViewer.moveToProject.existingProject')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={`flex flex-col items-center gap-2 rounded-card border p-3 transition-all ${
                    mode === 'new'
                      ? 'border-blue-500/50 bg-blue-600/10 text-blue-500'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-200/50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <FolderPlus className="h-6 w-6" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t('projectViewer.moveToProject.newProject')}</span>
                </button>
              </div>

              {mode === 'existing' ? (
                <div className="space-y-3">
                  {projects.length === 0 ? (
                    <p className="rounded-card border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
                      {t('projectViewer.moveToProject.noCandidates')}
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={t('projectViewer.moveToProject.searchProjects')}
                          className="w-full rounded-card border border-neutral-200 bg-neutral-50 py-3 pl-9 pr-3 text-sm text-neutral-900 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                        />
                      </div>
                      <div className="max-h-72 space-y-1.5 overflow-y-auto custom-scrollbar">
                        {filteredProjects.map((candidate) => {
                          const selected = candidate.id === destinationProjectId;
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => setDestinationProjectId(candidate.id)}
                              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                                selected
                                  ? 'border-blue-500/50 bg-blue-500/10'
                                  : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-200/50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800/50'
                              }`}
                            >
                              {selected ? (
                                <CheckSquare className="h-4 w-4 flex-shrink-0 text-blue-500" />
                              ) : (
                                <Square className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-neutral-900 dark:text-white">{candidate.name}</span>
                                <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                                  {t('projectViewer.moveToProject.albumCount', { count: candidate.albumCount || 0 })}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                        {filteredProjects.length === 0 && (
                          <p className="px-3 py-6 text-center text-xs text-neutral-500">{t('projectViewer.moveToProject.noMatches')}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="move-new-project-name" className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    {t('projectViewer.moveToProject.newProjectName')}
                  </label>
                  <input
                    id="move-new-project-name"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    maxLength={256}
                    className="w-full rounded-card border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    placeholder={t('projectViewer.moveToProject.newProjectName')}
                  />
                  <p className="text-[11px] leading-snug text-neutral-500">
                    {t('projectViewer.moveToProject.newProjectHint')}
                  </p>
                </div>
              )}

              {/* Stacked and full-width on a phone, side by side once there is room. */}
              <div className="flex flex-col-reverse gap-2 border-t border-neutral-200/70 pt-4 dark:border-neutral-800/70 sm:flex-row sm:justify-end lg:flex-col-reverse">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-neutral-200/80 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-800/80 dark:text-neutral-400 dark:hover:text-white sm:w-auto lg:w-full"
                >
                  {t('projectViewer.common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={!canSubmit || isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto lg:w-full"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
                  {isSubmitting
                    ? t('projectViewer.moveToProject.moving')
                    : t('projectViewer.moveToProject.confirm', { count: items.length })}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

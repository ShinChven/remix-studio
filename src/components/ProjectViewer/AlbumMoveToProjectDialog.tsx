import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckSquare,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  Music,
  Search,
  Square,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchProjects, imageDisplayUrl, moveAlbumItemsToProject } from '../../api';
import type { AlbumItem, Project, ProjectType } from '../../types';

/** How many projects the destination picker loads to choose from. */
const DESTINATION_PAGE_SIZE = 200;

/** How many thumbnails the summary shows before it collapses the rest into a count. */
const PREVIEW_LIMIT = 12;

/**
 * Where the last move actually went, kept per project type. A second batch
 * almost always follows the first into the same project, and the picker
 * otherwise opened on whichever candidate happened to sort first. Only a
 * completed move is remembered, so browsing the list and backing out does not
 * change what the next one proposes.
 */
const LAST_DESTINATION_KEY_PREFIX = 'remix_studio_album_move_destination_';

function rememberDestination(type: string, projectId: string) {
  localStorage.setItem(`${LAST_DESTINATION_KEY_PREFIX}${type}`, projectId);
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

interface AlbumMoveToProjectDialogProps {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  /** The album items to move, already resolved by the caller. */
  items: AlbumItem[];
  onClose: () => void;
  /** Fired once the move succeeds, with the project the items landed in. */
  onMoved: (destinationProjectId: string, movedItems: number) => void;
}

/**
 * Picks a destination for a batch of album items. A dialog rather than a page:
 * the move starts from a selection in the album, and sending the user to a
 * route of its own meant leaving that selection behind with no way back to it.
 * Full screen on a phone, a centred dialog once there is room.
 */
export function AlbumMoveToProjectDialog({
  projectId,
  projectName,
  projectType,
  items,
  onClose,
  onMoved,
}: AlbumMoveToProjectDialogProps) {
  const { t } = useTranslation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [destinationProjectId, setDestinationProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTextProject = projectType === 'text';
  const isAudioProject = projectType === 'audio';
  const TypeIcon = isTextProject
    ? FileText
    : projectType === 'video'
      ? VideoIcon
      : isAudioProject
        ? Music
        : ImageIcon;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  useEffect(() => {
    let cancelled = false;

    async function loadCandidates() {
      setIsLoading(true);
      try {
        const projectList = await fetchProjects(1, DESTINATION_PAGE_SIZE, undefined, 'all');
        if (cancelled) return;
        const candidates = projectList.items.filter(
          (candidate) => candidate.id !== projectId && (candidate.type || 'image') === projectType,
        );
        setProjects(candidates);
        const remembered = localStorage.getItem(`${LAST_DESTINATION_KEY_PREFIX}${projectType}`);
        const preferred = candidates.find((candidate) => candidate.id === remembered);
        setDestinationProjectId(preferred?.id || candidates[0]?.id || '');
        setMode(candidates.length > 0 ? 'existing' : 'new');
        setNewProjectName((current) => current || `${projectName} ${t('projectViewer.moveToProject.newProjectSuffix')}`);
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || t('projectViewer.moveToProject.loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadCandidates();
    return () => { cancelled = true; };
    // `t` is stable enough here; re-running on a language switch would discard the typed name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectName, projectType]);

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

  // The remembered destination can sit well down a list that only shows a few
  // rows at a time, where a selection nobody can see reads as no selection at
  // all. Bring it into view once, after the candidates land.
  const listRef = useRef<HTMLDivElement>(null);
  const hasRevealedDestination = useRef(false);
  useEffect(() => {
    if (isLoading || hasRevealedDestination.current) return;
    if (mode !== 'existing' || !destinationProjectId) return;
    hasRevealedDestination.current = true;
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [isLoading, mode, destinationProjectId]);

  const canSubmit = items.length > 0 && (mode === 'existing' ? Boolean(destinationProjectId) : Boolean(newProjectName.trim()));

  const handleConfirm = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await moveAlbumItemsToProject(projectId, {
        itemIds: items.map((item) => item.id),
        destinationProjectId: mode === 'existing' ? destinationProjectId : undefined,
        newProjectName: mode === 'new' ? newProjectName.trim() : undefined,
      });
      // Covers a freshly created project too, so the next batch follows this one.
      rememberDestination(projectType, result.projectId);
      toast.success(t('projectViewer.moveToProject.moved', { count: result.movedItems }));
      onMoved(result.projectId, result.movedItems);
    } catch (error: any) {
      toast.error(error?.message || t('projectViewer.moveToProject.moveFailed'));
      setIsSubmitting(false);
    }
  };

  const previewItems = items.slice(0, PREVIEW_LIMIT);
  const hiddenCount = items.length - previewItems.length;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm animate-in fade-in duration-300 sm:p-6"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-move-title"
        className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border-0 border-neutral-200/50 bg-white shadow-2xl animate-in zoom-in-95 duration-300 dark:border-white/5 dark:bg-neutral-900 sm:h-auto sm:max-h-[90dvh] sm:rounded-card sm:border"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200/50 p-5 dark:border-white/5 sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex-shrink-0 rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-blue-500">
              <TypeIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="album-move-title" className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                {t('projectViewer.moveToProject.title')}
              </h3>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {t('projectViewer.moveToProject.itemsHeading', { count: items.length })} · {formatSize(totalSize)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl p-2 text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label={t('projectViewer.common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — the one scroller in the dialog, so nothing nests inside it. */}
        <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar p-5 sm:p-6">
          {/* What travels with the move */}
          <section className="space-y-3">
            {isTextProject || isAudioProject ? (
              <div className="space-y-1.5">
                {previewItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800/80 dark:bg-neutral-950/40 dark:text-neutral-300"
                  >
                    <p className="line-clamp-2 break-words">{item.textContent || item.prompt || getAlbumFilename(item)}</p>
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <p className="px-1 text-[11px] font-bold text-neutral-500">+{hiddenCount}</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {previewItems.map((item, index) => {
                  const preview = item.thumbnailUrl || item.optimizedUrl || item.imageUrl;
                  const isLastTile = hiddenCount > 0 && index === previewItems.length - 1;
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
                      {isLastTile && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-black text-white">
                          +{hiddenCount}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

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
          </section>

          {/* Destination */}
          <section className="space-y-3 border-t border-neutral-200/70 pt-5 dark:border-neutral-800/70">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
              {t('projectViewer.moveToProject.destination')}
            </h4>

            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
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
                        <div ref={listRef} className="space-y-1.5">
                          {filteredProjects.map((candidate) => {
                            const selected = candidate.id === destinationProjectId;
                            return (
                              <button
                                key={candidate.id}
                                type="button"
                                data-selected={selected}
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
              </>
            )}
          </section>
        </div>

        {/* Footer — stacked and full-width on a phone, side by side once there is room. */}
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-200/50 bg-neutral-50 px-5 py-4 dark:border-white/5 dark:bg-black/20 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full rounded-xl border border-neutral-200/80 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-800/80 dark:text-neutral-400 dark:hover:text-white sm:w-auto"
          >
            {t('projectViewer.common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canSubmit || isSubmitting || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('projectViewer.moveToProject.moving')}
              </>
            ) : (
              t('projectViewer.moveToProject.confirm', { count: items.length })
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

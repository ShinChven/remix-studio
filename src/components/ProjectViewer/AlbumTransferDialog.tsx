import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckSquare,
  Copy,
  ExternalLink,
  FileText,
  FolderInput,
  FolderPlus,
  Image as ImageIcon,
  Info,
  Layers,
  Library as LibraryIcon,
  Loader2,
  Music,
  Search,
  Square,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  copyAlbumItemsToProject,
  copyAlbumToLibrary,
  fetchLibraries,
  fetchProjects,
  imageDisplayUrl,
  moveAlbumItemsToProject,
} from '../../api';
import type { AlbumItem, Library, Project, ProjectType } from '../../types';
import type { ProjectMediaType } from '../../lib/project-media';

export type AlbumTransferAction = 'copy' | 'move';
export type AlbumTransferTarget = 'library' | 'project';

/** How many destinations the picker loads to choose from. */
const LIBRARY_PAGE_SIZE = 100;
const PROJECT_PAGE_SIZE = 200;

/** How many thumbnails the summary shows before it collapses the rest into a count. */
const PREVIEW_LIMIT = 12;

/**
 * What the last copy or move chose, so the next batch starts there: the kind of
 * destination per action, and the destination itself per kind and type. Only a
 * completed transfer is remembered, so browsing the list and backing out does
 * not change what the next one proposes. The project key predates copying and
 * is kept so a remembered destination survives the change.
 */
const TARGET_KEY_PREFIX = 'remix_studio_album_transfer_target_';
const PROJECT_DESTINATION_KEY_PREFIX = 'remix_studio_album_move_destination_';
const LIBRARY_DESTINATION_KEY_PREFIX = 'remix_studio_album_transfer_library_';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the next dialog just starts fresh.
  }
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

/** A finished copy or move, with a link to where the items landed — opened in a new tab so the album stays put. */
function toastTransferDone(message: string, link: { href: string; label: string }) {
  toast.success(message, {
    duration: 10_000,
    description: (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-bold text-blue-500 underline-offset-2 hover:underline"
      >
        {link.label}
        <ExternalLink className="h-3 w-3" />
      </a>
    ),
  });
}

interface DestinationOption {
  id: string;
  name: string;
  detail: string;
}

interface AlbumTransferDialogProps {
  projectId: string;
  projectName: string;
  /** What the album holds — decides the library type and how items preview. */
  mediaType: ProjectMediaType;
  /** The project's own type; a destination project has to share it. */
  projectType: ProjectType;
  initialAction: AlbumTransferAction;
  /** The items in scope, or a sample of them when `useAllAlbumScope` is set. */
  items: AlbumItem[];
  /** Copy everything in the album rather than `items`. Never applies to a move. */
  useAllAlbumScope?: boolean;
  /** How many items the transfer reaches. */
  itemCount: number;
  /** Total file size of the items in scope, when the caller knows it better than `items` do. */
  totalSize?: number;
  /** A move needs an explicit selection, so it is only offered with one. */
  canMove: boolean;
  onClose: () => void;
  /** Fired once the transfer succeeds, with the items that left this album. */
  onDone: (action: AlbumTransferAction, movedItems: AlbumItem[]) => void;
}

/**
 * Copy or move album items to a library or another project — one dialog for
 * all four, so they look and behave alike. Finishing keeps the user on the
 * album and offers the destination as a link in the success toast.
 * Full screen on a phone, a centred dialog once there is room.
 */
export function AlbumTransferDialog({
  projectId,
  projectName,
  mediaType,
  projectType,
  initialAction,
  items,
  useAllAlbumScope = false,
  itemCount,
  totalSize,
  canMove,
  onClose,
  onDone,
}: AlbumTransferDialogProps) {
  const { t } = useTranslation();

  const [action, setAction] = useState<AlbumTransferAction>(canMove ? initialAction : 'copy');
  const [target, setTarget] = useState<AlbumTransferTarget>(() => {
    const remembered = readStored(`${TARGET_KEY_PREFIX}${initialAction}`);
    if (remembered === 'library' || remembered === 'project') return remembered;
    return initialAction === 'move' ? 'project' : 'library';
  });
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [libraries, setLibraries] = useState<Library[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [destinationId, setDestinationId] = useState('');
  const [newName, setNewName] = useState('');
  const [isNameEdited, setIsNameEdited] = useState(false);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState<'raw' | 'optimized'>('optimized');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTextOrAudio = mediaType === 'text' || mediaType === 'audio';
  const TypeIcon = mediaType === 'text' ? FileText : mediaType === 'video' ? VideoIcon : mediaType === 'audio' ? Music : ImageIcon;
  const isMove = action === 'move';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  // Each kind of destination loads the first time it is shown, and once.
  useEffect(() => {
    if (target === 'library' && libraries !== null) return;
    if (target === 'project' && projects !== null) return;
    let cancelled = false;
    (async () => {
      try {
        if (target === 'library') {
          const result = await fetchLibraries(1, LIBRARY_PAGE_SIZE);
          if (!cancelled) setLibraries(result.items.filter((library) => library.type === mediaType));
        } else {
          const result = await fetchProjects(1, PROJECT_PAGE_SIZE, undefined, 'all', false, true);
          if (!cancelled) {
            setProjects(result.items.filter(
              (candidate) => candidate.id !== projectId && (candidate.type || 'image') === projectType,
            ));
          }
        }
      } catch (error: any) {
        if (cancelled) return;
        toast.error(t('projectViewer.transfer.loadFailed', { message: error?.message || '' }));
        if (target === 'library') setLibraries([]); else setProjects([]);
      }
    })();
    return () => { cancelled = true; };
    // `t` is left out: a language switch is no reason to refetch the lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, libraries, projects, mediaType, projectId, projectType]);

  const candidates = target === 'library' ? libraries : projects;
  const isLoading = candidates === null;

  const options: DestinationOption[] = useMemo(() => {
    if (target === 'library') {
      return (libraries || []).map((library) => ({
        id: library.id,
        name: library.name,
        detail: t('projectViewer.transfer.libraryItemCount', { count: library.itemCount ?? library.items?.length ?? 0 }),
      }));
    }
    return (projects || []).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      detail: t('projectViewer.transfer.projectAlbumCount', { count: candidate.albumCount || 0 }),
    }));
  }, [target, libraries, projects, t]);

  // On switching kind (or once its list lands), propose the remembered
  // destination, else the first one, and fall back to creating a new one when
  // there is nothing to pick.
  useEffect(() => {
    if (isLoading) return;
    const rememberedKey = target === 'library'
      ? `${LIBRARY_DESTINATION_KEY_PREFIX}${mediaType}`
      : `${PROJECT_DESTINATION_KEY_PREFIX}${projectType}`;
    const remembered = readStored(rememberedKey);
    const preferred = options.find((option) => option.id === remembered) || options[0];
    setDestinationId(preferred?.id || '');
    setMode(options.length > 0 ? 'existing' : 'new');
    setQuery('');
    // `options` follows `target` and the lists, which are what this tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, isLoading]);

  const defaultName = useMemo(() => {
    if (target === 'library') {
      const suffix = mediaType === 'text'
        ? t('projectViewer.copyToLibrary.texts')
        : mediaType === 'video'
          ? t('projectViewer.copyToLibrary.videos')
          : mediaType === 'audio'
            ? t('projectViewer.copyToLibrary.audios')
            : t('projectViewer.tabs.album');
      return `${projectName} ${suffix}`;
    }
    return `${projectName} ${isMove ? t('projectViewer.transfer.newProjectSuffixMove') : t('projectViewer.transfer.newProjectSuffixCopy')}`;
  }, [target, mediaType, projectName, isMove, t]);

  // The suggested name follows the destination kind and action until the
  // user types one of their own.
  useEffect(() => {
    if (!isNameEdited) setNewName(defaultName);
  }, [defaultName, isNameEdited]);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.name.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle));
  }, [options, query]);

  // The remembered destination can sit well down a list that only shows a few
  // rows at a time, where a selection nobody can see reads as no selection at
  // all. Bring it into view once its list lands.
  const listRef = useRef<HTMLDivElement>(null);
  const revealedTarget = useRef<AlbumTransferTarget | null>(null);
  useEffect(() => {
    if (isLoading || revealedTarget.current === target) return;
    if (mode !== 'existing' || !destinationId) return;
    revealedTarget.current = target;
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [isLoading, mode, destinationId, target]);

  const sizeInScope = useMemo(
    () => totalSize ?? items.reduce((sum, item) => sum + (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0), 0),
    [items, totalSize],
  );

  const canSubmit = itemCount > 0
    && !isLoading
    && (mode === 'existing' ? Boolean(destinationId) : Boolean(newName.trim()));

  const handleConfirm = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    const itemIds = items.map((item) => item.id);
    const scope = isMove || !useAllAlbumScope ? { itemIds } : { allAlbumItems: true };
    const existingId = mode === 'existing' ? destinationId : undefined;
    const createName = mode === 'new' ? newName.trim() : undefined;

    try {
      let destination: { id: string; name: string; href: string; linkLabel: string };
      let count: number;

      if (target === 'library') {
        const result = await copyAlbumToLibrary(projectId, {
          ...scope,
          version: isTextOrAudio ? undefined : version,
          destinationLibraryId: existingId,
          newLibraryName: createName,
          move: isMove || undefined,
        });
        destination = {
          id: result.libraryId,
          name: result.libraryName || createName || '',
          href: `/library/${encodeURIComponent(result.libraryId)}`,
          linkLabel: t('projectViewer.transfer.openLibrary'),
        };
        count = isMove ? result.movedItems : result.copiedItems;
        if (isMove && result.movedItems < result.copiedItems) {
          toast.warning(t('projectViewer.transfer.partialMove', { count: result.copiedItems - result.movedItems }));
        }
      } else if (isMove) {
        const result = await moveAlbumItemsToProject(projectId, {
          itemIds,
          destinationProjectId: existingId,
          newProjectName: createName,
        });
        destination = {
          id: result.projectId,
          name: result.projectName || createName || '',
          href: `/project/${encodeURIComponent(result.projectId)}?tab=album`,
          linkLabel: t('projectViewer.transfer.openProject'),
        };
        count = result.movedItems;
      } else {
        const result = await copyAlbumItemsToProject(projectId, {
          ...scope,
          destinationProjectId: existingId,
          newProjectName: createName,
        });
        destination = {
          id: result.projectId,
          name: result.projectName || createName || '',
          href: `/project/${encodeURIComponent(result.projectId)}?tab=album`,
          linkLabel: t('projectViewer.transfer.openProject'),
        };
        count = result.copiedItems;
      }

      // Covers a freshly created destination too, so the next batch follows this one.
      writeStored(`${TARGET_KEY_PREFIX}${action}`, target);
      writeStored(
        target === 'library' ? `${LIBRARY_DESTINATION_KEY_PREFIX}${mediaType}` : `${PROJECT_DESTINATION_KEY_PREFIX}${projectType}`,
        destination.id,
      );

      toastTransferDone(
        t(isMove ? 'projectViewer.transfer.moved' : 'projectViewer.transfer.copied', { count, name: destination.name }),
        { href: destination.href, label: destination.linkLabel },
      );
      onDone(action, isMove ? items : []);
    } catch (error: any) {
      toast.error(t(isMove ? 'projectViewer.transfer.moveFailed' : 'projectViewer.transfer.copyFailed', { message: error?.message || '' }));
      setIsSubmitting(false);
    }
  };

  const previewItems = items.slice(0, PREVIEW_LIMIT);
  const hiddenCount = itemCount - previewItems.length;

  const effectKey = `projectViewer.transfer.effect${isMove ? 'Move' : 'Copy'}${target === 'library' ? 'Library' : 'Project'}`;

  const choiceClass = (active: boolean) => `flex items-center justify-center gap-2 rounded-card border px-3 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
    active
      ? 'border-blue-500/50 bg-blue-600/10 text-blue-500'
      : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-200/50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800/50'
  }`;
  const segmentClass = (active: boolean) => `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
  }`;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm animate-in fade-in duration-300 sm:p-6"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-transfer-title"
        className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border-0 border-neutral-200/50 bg-white shadow-2xl animate-in zoom-in-95 duration-300 dark:border-white/5 dark:bg-neutral-900 sm:h-auto sm:max-h-[90dvh] sm:rounded-card sm:border"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200/50 p-5 dark:border-white/5 sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex-shrink-0 rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-blue-500">
              {isMove ? <FolderInput className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 id="album-transfer-title" className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                {isMove ? t('projectViewer.transfer.titleMove') : t('projectViewer.transfer.titleCopy')}
              </h3>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {t('projectViewer.transfer.itemsHeading', { count: itemCount })}
                {sizeInScope > 0 && !isTextOrAudio ? ` · ${formatSize(sizeInScope)}` : ''}
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
          {/* Copy or move */}
          <div
            role="radiogroup"
            aria-label={t('projectViewer.transfer.action')}
            className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!isMove}
              disabled={isSubmitting}
              onClick={() => setAction('copy')}
              className={segmentClass(!isMove)}
            >
              <Copy className="h-3.5 w-3.5" />
              {t('projectViewer.transfer.copy')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isMove}
              disabled={isSubmitting || !canMove}
              title={canMove ? undefined : t('projectViewer.transfer.moveNeedsSelection')}
              onClick={() => setAction('move')}
              className={segmentClass(isMove)}
            >
              <FolderInput className="h-3.5 w-3.5" />
              {t('projectViewer.transfer.move')}
            </button>
          </div>

          {/* What is being sent */}
          {previewItems.length > 0 && (
            isTextOrAudio ? (
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
                          +{hiddenCount + 1}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Destination */}
          <section className="space-y-3 border-t border-neutral-200/70 pt-5 dark:border-neutral-800/70">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
              {t('projectViewer.transfer.destination')}
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setTarget('library')} className={choiceClass(target === 'library')}>
                <LibraryIcon className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('projectViewer.transfer.library')}</span>
              </button>
              <button type="button" disabled={isSubmitting} onClick={() => setTarget('project')} className={choiceClass(target === 'project')}>
                <Layers className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t('projectViewer.transfer.project')}</span>
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950">
                  <button
                    type="button"
                    disabled={isSubmitting || options.length === 0}
                    onClick={() => setMode('existing')}
                    className={segmentClass(mode === 'existing')}
                  >
                    {target === 'library' ? <LibraryIcon className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                    {target === 'library' ? t('projectViewer.transfer.existingLibrary') : t('projectViewer.transfer.existingProject')}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setMode('new')}
                    className={segmentClass(mode === 'new')}
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    {target === 'library' ? t('projectViewer.transfer.newLibrary') : t('projectViewer.transfer.newProject')}
                  </button>
                </div>

                {mode === 'existing' ? (
                  options.length === 0 ? (
                    <p className="rounded-card border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
                      {target === 'library' ? t('projectViewer.transfer.noLibraries') : t('projectViewer.transfer.noProjects')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={target === 'library' ? t('projectViewer.transfer.searchLibraries') : t('projectViewer.transfer.searchProjects')}
                          aria-label={target === 'library' ? t('projectViewer.transfer.searchLibraries') : t('projectViewer.transfer.searchProjects')}
                          className="w-full rounded-card border border-neutral-200 bg-neutral-50 py-3 pl-9 pr-3 text-sm text-neutral-900 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                        />
                      </div>
                      <div ref={listRef} role="radiogroup" aria-label={t('projectViewer.transfer.destination')} className="space-y-1.5">
                        {filteredOptions.map((option) => {
                          const selected = option.id === destinationId;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              data-selected={selected}
                              disabled={isSubmitting}
                              onClick={() => setDestinationId(option.id)}
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
                                <span className="block truncate text-sm font-bold text-neutral-900 dark:text-white">{option.name}</span>
                                <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-neutral-500">{option.detail}</span>
                              </span>
                            </button>
                          );
                        })}
                        {filteredOptions.length === 0 && (
                          <p className="px-3 py-6 text-center text-xs text-neutral-500">{t('projectViewer.transfer.noMatches')}</p>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="album-transfer-new-name" className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      {target === 'library' ? t('projectViewer.transfer.newLibraryName') : t('projectViewer.transfer.newProjectName')}
                    </label>
                    <input
                      id="album-transfer-new-name"
                      type="text"
                      value={newName}
                      onChange={(e) => { setNewName(e.target.value); setIsNameEdited(true); }}
                      maxLength={256}
                      disabled={isSubmitting}
                      className="w-full rounded-card border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                    {target === 'project' && (
                      <p className="text-[11px] leading-snug text-neutral-500">{t('projectViewer.transfer.newProjectHint')}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Which file goes into the library */}
          {target === 'library' && !isTextOrAudio && (
            <section className="space-y-3 border-t border-neutral-200/70 pt-5 dark:border-neutral-800/70">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                {t('projectViewer.copyToLibrary.versionToCopy')}
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['optimized', 'raw'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setVersion(value)}
                    className={`flex items-center gap-3 rounded-card border p-3 text-left transition-all ${
                      version === value
                        ? 'border-blue-500/50 bg-blue-600/10 text-neutral-900 dark:text-white'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-200/50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    {version === value ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-blue-500" /> : <Square className="h-4 w-4 flex-shrink-0" />}
                    <span>
                      <span className="block text-[10px] font-black uppercase tracking-widest leading-none">{t(`projectViewer.copyToLibrary.${value}`)}</span>
                      <span className="mt-1 block text-[10px] text-neutral-500">{t(`projectViewer.copyToLibrary.${value}Hint`)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* What happens to the album */}
          <div className={`flex items-start gap-3 rounded-card border p-3 ${
            isMove ? 'border-amber-500/20 bg-amber-500/5' : 'border-neutral-200 bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-950/40'
          }`}>
            {isMove
              ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              : <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />}
            <p className="text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">{t(effectKey)}</p>
          </div>
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
            disabled={!canSubmit || isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isMove ? t('projectViewer.transfer.moving') : t('projectViewer.transfer.copying')}
              </>
            ) : (
              isMove
                ? t('projectViewer.transfer.confirmMove', { count: itemCount })
                : t('projectViewer.transfer.confirmCopy', { count: itemCount })
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

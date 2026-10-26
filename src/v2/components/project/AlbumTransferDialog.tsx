import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyAlbumItemsToProject, copyAlbumToLibrary, fetchLibraries, fetchProjects, imageDisplayUrl, moveAlbumItemsToProject } from '../../../api';
import type { ProjectMediaType } from '../../../lib/project-media';
import { Button, Dialog, Icon, LoadingIndicator, Ripple, Text, TextField, useSnackbar } from '../../../m3';
import type { AlbumItem, Library, Project, ProjectType } from '../../../types';
import { withBase } from '../../app/paths';
import { ChoiceTiles } from '../../ui/ChoiceTiles';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Toolbar';
import { useToast } from '../../ui/useToast';

export type AlbumTransferAction = 'copy' | 'move';
export type AlbumTransferTarget = 'library' | 'project';

const LIBRARY_PAGE_SIZE = 100;
const PROJECT_PAGE_SIZE = 200;
/** Thumbnails shown before the rest collapse into a count. */
const PREVIEW_LIMIT = 12;
/**
 * The last completed copy or move picks where the next one starts: the kind of
 * destination per action, and the destination itself per kind and type. The
 * keys are shared with the classic interface, so either remembers for both.
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
    // Private windows can refuse storage; the next dialog starts fresh.
  }
}

export function albumFilename(item: AlbumItem) {
  const path = (item.imageUrl || '').split('?')[0];
  return decodeURIComponent(path.split('/').pop() || '') || item.id;
}

function formatSize(bytes: number) {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface DestinationOption {
  id: string;
  name: string;
  detail: string;
}

export interface AlbumTransferDialogProps {
  projectId: string;
  projectName: string;
  mediaType: ProjectMediaType;
  /** A destination project has to share this type. */
  projectType: ProjectType;
  initialAction: AlbumTransferAction;
  /** The items in scope, or a sample of them with `useAllAlbumScope`. */
  items: AlbumItem[];
  /** Copy the whole album rather than `items`; never applies to a move. */
  useAllAlbumScope?: boolean;
  itemCount: number;
  totalSize?: number;
  /** A move needs an explicit selection. */
  canMove: boolean;
  onClose: () => void;
  /** After success, with the items that left this album. */
  onDone: (action: AlbumTransferAction, movedItems: AlbumItem[]) => void;
}

/** Copies or moves album items to a library or another project; the snackbar links to where they landed. */
export function AlbumTransferDialog({ projectId, projectName, mediaType, projectType, initialAction, items, useAllAlbumScope = false, itemCount, totalSize, canMove, onClose, onDone }: AlbumTransferDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const snackbar = useSnackbar();
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
  const [nameEdited, setNameEdited] = useState(false);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState<'raw' | 'optimized'>('optimized');
  const [submitting, setSubmitting] = useState(false);
  const isTextOrAudio = mediaType === 'text' || mediaType === 'audio';
  const typeIcon = mediaType === 'text' ? 'article' : mediaType === 'video' ? 'movie' : mediaType === 'audio' ? 'graphic_eq' : 'image';
  const isMove = action === 'move';

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
          if (!cancelled) setProjects(result.items.filter((candidate) => candidate.id !== projectId && (candidate.type || 'image') === projectType));
        }
      } catch (error) {
        if (cancelled) return;
        toast.error(t('projectViewer.transfer.loadFailed', { message: (error as Error)?.message || '' }));
        if (target === 'library') setLibraries([]);
        else setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, libraries, projects, mediaType, projectId, projectType]);

  const loading = (target === 'library' ? libraries : projects) === null;
  const options: DestinationOption[] = useMemo(
    () =>
      target === 'library'
        ? (libraries || []).map((l) => ({ id: l.id, name: l.name, detail: t('projectViewer.transfer.libraryItemCount', { count: l.itemCount ?? l.items?.length ?? 0 }) }))
        : (projects || []).map((p) => ({ id: p.id, name: p.name, detail: t('projectViewer.transfer.projectAlbumCount', { count: p.albumCount || 0 }) })),
    [target, libraries, projects, t],
  );

  // On switching kind, or once its list lands, propose the remembered destination, else the first, else a new one.
  useEffect(() => {
    if (loading) return;
    const remembered = readStored(target === 'library' ? `${LIBRARY_DESTINATION_KEY_PREFIX}${mediaType}` : `${PROJECT_DESTINATION_KEY_PREFIX}${projectType}`);
    const preferred = options.find((o) => o.id === remembered) || options[0];
    setDestinationId(preferred?.id || '');
    setMode(options.length > 0 ? 'existing' : 'new');
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, loading]);

  const defaultName = useMemo(() => {
    if (target === 'library') {
      const suffix = mediaType === 'text' ? t('projectViewer.copyToLibrary.texts') : mediaType === 'video' ? t('projectViewer.copyToLibrary.videos') : mediaType === 'audio' ? t('projectViewer.copyToLibrary.audios') : t('projectViewer.tabs.album');
      return `${projectName} ${suffix}`;
    }
    return `${projectName} ${isMove ? t('projectViewer.transfer.newProjectSuffixMove') : t('projectViewer.transfer.newProjectSuffixCopy')}`;
  }, [target, mediaType, projectName, isMove, t]);

  useEffect(() => {
    if (!nameEdited) setNewName(defaultName);
  }, [defaultName, nameEdited]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((o) => o.name.toLowerCase().includes(needle) || o.id.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  // Bring the remembered destination into view once its list lands.
  const listRef = useRef<HTMLDivElement>(null);
  const revealed = useRef<AlbumTransferTarget | null>(null);
  useEffect(() => {
    if (loading || revealed.current === target || mode !== 'existing' || !destinationId) return;
    revealed.current = target;
    listRef.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' });
  }, [loading, mode, destinationId, target]);

  const sizeInScope = useMemo(() => totalSize ?? items.reduce((sum, i) => sum + (i.size || 0) + (i.optimizedSize || 0) + (i.thumbnailSize || 0), 0), [items, totalSize]);
  const canSubmit = itemCount > 0 && !loading && (mode === 'existing' ? Boolean(destinationId) : Boolean(newName.trim()));

  const confirm = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const itemIds = items.map((item) => item.id);
    const scope = isMove || !useAllAlbumScope ? { itemIds } : { allAlbumItems: true };
    const existingId = mode === 'existing' ? destinationId : undefined;
    const createName = mode === 'new' ? newName.trim() : undefined;
    try {
      let destination: { id: string; name: string; href: string; linkLabel: string };
      let count: number;
      if (target === 'library') {
        const result = await copyAlbumToLibrary(projectId, { ...scope, version: isTextOrAudio ? undefined : version, destinationLibraryId: existingId, newLibraryName: createName, move: isMove || undefined });
        destination = { id: result.libraryId, name: result.libraryName || createName || '', href: `/library/${encodeURIComponent(result.libraryId)}`, linkLabel: t('projectViewer.transfer.openLibrary') };
        count = isMove ? result.movedItems : result.copiedItems;
        if (isMove && result.movedItems < result.copiedItems) toast.info(t('projectViewer.transfer.partialMove', { count: result.copiedItems - result.movedItems }));
      } else if (isMove) {
        const result = await moveAlbumItemsToProject(projectId, { itemIds, destinationProjectId: existingId, newProjectName: createName });
        destination = { id: result.projectId, name: result.projectName || createName || '', href: `/project/${encodeURIComponent(result.projectId)}?tab=album`, linkLabel: t('projectViewer.transfer.openProject') };
        count = result.movedItems;
      } else {
        const result = await copyAlbumItemsToProject(projectId, { ...scope, destinationProjectId: existingId, newProjectName: createName });
        destination = { id: result.projectId, name: result.projectName || createName || '', href: `/project/${encodeURIComponent(result.projectId)}?tab=album`, linkLabel: t('projectViewer.transfer.openProject') };
        count = result.copiedItems;
      }
      writeStored(`${TARGET_KEY_PREFIX}${action}`, target);
      writeStored(target === 'library' ? `${LIBRARY_DESTINATION_KEY_PREFIX}${mediaType}` : `${PROJECT_DESTINATION_KEY_PREFIX}${projectType}`, destination.id);
      // The destination opens in a new tab so the album stays put.
      snackbar.show({
        message: t(isMove ? 'projectViewer.transfer.moved' : 'projectViewer.transfer.copied', { count, name: destination.name }),
        action: { label: destination.linkLabel, onClick: () => window.open(withBase(destination.href), '_blank', 'noopener') },
        duration: 10_000,
        closable: true,
      });
      onDone(action, isMove ? items : []);
    } catch (error) {
      toast.error(t(isMove ? 'projectViewer.transfer.moveFailed' : 'projectViewer.transfer.copyFailed', { message: (error as Error)?.message || '' }));
      setSubmitting(false);
    }
  };

  const preview = items.slice(0, PREVIEW_LIMIT);
  const hidden = itemCount - preview.length;
  const effectKey = `projectViewer.transfer.effect${isMove ? 'Move' : 'Copy'}${target === 'library' ? 'Library' : 'Project'}`;

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      dismissible={!submitting}
      icon={isMove ? 'drive_file_move' : 'content_copy'}
      headline={isMove ? t('projectViewer.transfer.titleMove') : t('projectViewer.transfer.titleCopy')}
      fullScreen="compact"
      maxWidth={600}
      actions={
        <>
          <Button variant="text" disabled={submitting} onClick={onClose}>
            {t('projectViewer.common.cancel')}
          </Button>
          <Button variant="filled" loading={submitting} disabled={!canSubmit} onClick={() => void confirm()}>
            {submitting ? (isMove ? t('projectViewer.transfer.moving') : t('projectViewer.transfer.copying')) : isMove ? t('projectViewer.transfer.confirmMove', { count: itemCount }) : t('projectViewer.transfer.confirmCopy', { count: itemCount })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-density="compact">
        <Text variant="label-medium" className="uppercase tracking-widest text-on-surface-variant">
          {t('projectViewer.transfer.itemsHeading', { count: itemCount })}
          {sizeInScope > 0 && !isTextOrAudio ? ` · ${formatSize(sizeInScope)}` : ''}
        </Text>
        <Segmented<AlbumTransferAction>
          fullWidth
          size="sm"
          aria-label={t('projectViewer.transfer.action')}
          value={action}
          onChange={(next) => (next === 'move' && !canMove ? undefined : setAction(next))}
          options={[
            { value: 'copy', label: t('projectViewer.transfer.copy'), icon: 'content_copy' },
            { value: 'move', label: canMove ? t('projectViewer.transfer.move') : t('projectViewer.transfer.moveNeedsSelection'), icon: 'drive_file_move' },
          ]}
        />

        {preview.length > 0 &&
          (isTextOrAudio ? (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {preview.map((item) => (
                <Text key={item.id} variant="body-small" className="v2-transfer-text">
                  {item.textContent || item.prompt || albumFilename(item)}
                </Text>
              ))}
              {hidden > 0 && (
                <Text variant="label-small" className="text-on-surface-variant">
                  +{hidden}
                </Text>
              )}
            </div>
          ) : (
            <div className="v2-transfer-strip">
              {preview.map((item, index) => {
                const src = item.thumbnailUrl || item.optimizedUrl || item.imageUrl;
                return (
                  <span key={item.id} className="v2-transfer-strip__thumb" title={albumFilename(item)}>
                    {src ? <img src={imageDisplayUrl(src)} alt="" loading="lazy" /> : <Icon name={typeIcon} />}
                    {hidden > 0 && index === preview.length - 1 && <span className="v2-transfer-strip__more">+{hidden + 1}</span>}
                  </span>
                );
              })}
            </div>
          ))}

        <Text as="h4" variant="title-small" emphasized>
          {t('projectViewer.transfer.destination')}
        </Text>
        <ChoiceTiles<AlbumTransferTarget>
          size="compact"
          value={target}
          onChange={(next) => !submitting && setTarget(next)}
          options={[
            { value: 'library', label: t('projectViewer.transfer.library'), icon: 'library_books' },
            { value: 'project', label: t('projectViewer.transfer.project'), icon: 'stacks' },
          ]}
        />
        {loading ? (
          <div className="flex justify-center py-6">
            <LoadingIndicator />
          </div>
        ) : (
          <>
            <Segmented<'existing' | 'new'>
              fullWidth
              value={mode}
              onChange={(next) => (next === 'existing' && options.length === 0 ? undefined : setMode(next))}
              options={[
                { value: 'existing', label: target === 'library' ? t('projectViewer.transfer.existingLibrary') : t('projectViewer.transfer.existingProject'), icon: target === 'library' ? 'library_books' : 'stacks' },
                { value: 'new', label: target === 'library' ? t('projectViewer.transfer.newLibrary') : t('projectViewer.transfer.newProject'), icon: 'create_new_folder' },
              ]}
            />
            {mode === 'existing' ? (
              options.length === 0 ? (
                <Text variant="body-medium" className="v2-dashed-note">
                  {target === 'library' ? t('projectViewer.transfer.noLibraries') : t('projectViewer.transfer.noProjects')}
                </Text>
              ) : (
                <div className="flex flex-col gap-2">
                  <SearchField shape="field" value={query} onChange={setQuery} placeholder={target === 'library' ? t('projectViewer.transfer.searchLibraries') : t('projectViewer.transfer.searchProjects')} />
                  <div ref={listRef} role="radiogroup" aria-label={t('projectViewer.transfer.destination')} className="v2-destination-list">
                    {filtered.map((option) => {
                      const selected = option.id === destinationId;
                      return (
                        <button key={option.id} type="button" role="radio" aria-checked={selected} data-selected={selected ? '' : undefined} disabled={submitting} className="v2-destination m3-focus-ring" onClick={() => setDestinationId(option.id)}>
                          <Ripple />
                          <Icon name={selected ? 'radio_button_checked' : 'radio_button_unchecked'} className={selected ? 'text-primary' : 'text-on-surface-variant'} />
                          <span className="flex min-w-0 flex-col text-start">
                            <Text as="span" variant="label-large" className="truncate">
                              {option.name}
                            </Text>
                            <Text as="span" variant="label-small" className="text-on-surface-variant">
                              {option.detail}
                            </Text>
                          </span>
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <Text variant="body-small" className="py-4 text-center text-on-surface-variant">
                        {t('projectViewer.transfer.noMatches')}
                      </Text>
                    )}
                  </div>
                </div>
              )
            ) : (
              <TextField
                variant="outlined"
                label={target === 'library' ? t('projectViewer.transfer.newLibraryName') : t('projectViewer.transfer.newProjectName')}
                value={newName}
                onValueChange={(v) => {
                  setNewName(v);
                  setNameEdited(true);
                }}
                maxLength={256}
                disabled={submitting}
                supportingText={target === 'project' ? t('projectViewer.transfer.newProjectHint') : undefined}
                fullWidth
              />
            )}
          </>
        )}

        {target === 'library' && !isTextOrAudio && (
          <>
            <Text as="h4" variant="title-small" emphasized>
              {t('projectViewer.copyToLibrary.versionToCopy')}
            </Text>
            <ChoiceTiles<'optimized' | 'raw'>
              size="compact"
              value={version}
              onChange={setVersion}
              options={(['optimized', 'raw'] as const).map((value) => ({ value, label: t(`projectViewer.copyToLibrary.${value}`), supportingText: t(`projectViewer.copyToLibrary.${value}Hint`), icon: value === 'raw' ? 'image' : 'auto_awesome' }))}
            />
          </>
        )}

        <div className="v2-notice" data-tone={isMove ? 'warning' : undefined}>
          <Icon name={isMove ? 'warning' : 'info'} />
          <Text variant="body-small">{t(effectKey)}</Text>
        </div>
      </div>
    </Dialog>
  );
}

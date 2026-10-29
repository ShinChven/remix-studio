import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  copyLibraryItems,
  createLibraryItem,
  deleteLibrary,
  deleteLibraryItem,
  duplicateLibrary,
  exportMediaLibraryZip,
  fetchLibrary,
  fetchLibraryItems,
  fetchLibraryReferences,
  imageDisplayUrl,
  moveLibraryItems,
  saveAudio,
  saveImage,
  saveVideo,
  startAutoTag,
  updateLibraryItem,
} from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { copyText, resourceRef } from '../../lib/resource-ref';
import { Button, Dialog, Icon, IconButton, LinearProgress, LoadingIndicator, MenuDivider, MenuGroup, MenuItem, Shape, SubMenu, Text, useMediaQuery, useSnackbar } from '../../m3';
import type { Library, LibraryItem } from '../../types';
import { withBase } from '../app/paths';
import { AutoTagDialog } from '../components/AutoTagDialog';
import { AutoTagProgress } from '../components/AutoTagProgress';
import { CopyMoveItemsDialog } from '../components/library/CopyMoveItemsDialog';
import { LibraryAudioList } from '../components/library/LibraryAudioList';
import { LibraryHero } from '../components/library/LibraryHero';
import { LibraryMediaGrid, type MediaFit, type TileSize } from '../components/library/LibraryMediaGrid';
import { LibraryTextItems, type TextView } from '../components/library/LibraryTextItems';
import { Lightbox } from '../components/Lightbox';
import { DangerAction, ResultsBar } from '../components/project/ResultsBar';
import { TagDialog } from '../components/TagDialog';
import { useViewPref } from '../lib/viewPrefs';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HoverMenuButton } from '../ui/HoverMenuButton';
import { kindMeta } from '../ui/entityMeta';
import { EmptyState, LoadingState, Page } from '../ui/Page';
import { PagedFooter, PAGE_SIZE_OPTIONS } from '../ui/PagedFooter';
import { PromptDialog } from '../ui/PromptDialog';
import { FilterChip, ResultsSearch, TagLine } from '../ui/ResultFilters';
import { Row, RowList } from '../ui/Rows';

type PageSize = number | 'all';
const DEFAULT_PAGE_SIZE = 25;
/** What "All" asks the server for. */
const ALL_LIMIT = 999999;
type SortKey = 'time-desc' | 'time-asc' | 'name-asc' | 'name-desc';
const SORT_OPTIONS: { value: SortKey; icon: string; label: string }[] = [
  { value: 'time-desc', icon: 'arrow_downward', label: 'libraryEditor.sort.timeDesc' },
  { value: 'time-asc', icon: 'arrow_upward', label: 'libraryEditor.sort.timeAsc' },
  { value: 'name-asc', icon: 'sort_by_alpha', label: 'libraryEditor.sort.nameAsc' },
  { value: 'name-desc', icon: 'sort_by_alpha', label: 'libraryEditor.sort.nameDesc' },
];
const MEDIA_ACCEPT = { image: 'image/', video: 'video/', audio: 'audio/' } as const;
const TEXT_FILE = /\.(txt|md|markdown)$/i;

function parsePageSize(value: string | null): PageSize {
  if (value === 'all') return 'all';
  const size = parseInt(value || '', 10);
  return PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_PAGE_SIZE;
}

function defaultExportName(name: string): string {
  const raw = (name || '').trim() || 'Library';
  const withoutZip = raw.replace(/\.zip$/i, '').trim() || 'Library';
  const withoutAlbumSuffix = withoutZip.replace(/[\s_-]*album$/i, '').trim();
  const safe = (withoutAlbumSuffix || 'Library')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${safe || 'Library'}_Library.zip`;
}

function formatItemDateTime(value?: number): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.readAsDataURL(file);
  });

/** Loads the library for `/library/:id` and keeps it current with live updates. */
export function LibraryEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchLibrary(id)
      .then(setLibrary)
      .catch((e) => {
        console.error(e);
        setLibrary(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const reload = useCallback(async () => {
    const requested = idRef.current;
    if (!requested) return;
    const lib = await fetchLibrary(requested);
    if (idRef.current === requested) setLibrary(lib);
  }, []);

  // The library renamed, deleted or refilled elsewhere (another tab, an MCP agent).
  useLiveRefresh(
    (event) => event.resource === 'library' && (!event.id || event.id === id),
    async (events) => {
      if (events.some((event) => event.action === 'deleted' && event.id === idRef.current)) {
        setLibrary(null);
        return;
      }
      await reload();
    },
  );

  if (loading) return <LoadingState minHeight={400} />;
  if (!library) return <EmptyState icon="folder_off" title={t('libraryRoute.notFound')} />;
  return <LibraryEditor key={library.id} library={library} onChanged={reload} />;
}

function LibraryEditor({ library, onChanged }: { library: Library; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const wide = useMediaQuery('(min-width: 840px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const searchTerm = searchParams.get('q') || '';
  const pageSize = parsePageSize(searchParams.get('size'));
  const sortBy = (searchParams.get('sortBy') as 'time' | 'name') || 'time';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  const filterTags = searchParams.getAll('tag');
  const type = library.type || 'text';
  const isText = type === 'text';
  const isMedia = type === 'image' || type === 'video';
  const meta = kindMeta(type);

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [videoIndex, setVideoIndex] = useState<number | null>(null);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<LibraryItem | null>(null);
  const [tagItemId, setTagItemId] = useState<string | null>(null);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [autoTagTarget, setAutoTagTarget] = useState<'selected' | 'all' | null>(null);
  const [autoTagRunKey, setAutoTagRunKey] = useState(0);
  const [copyMove, setCopyMove] = useState<'copy' | 'move' | null>(null);
  const [removeItem, setRemoveItem] = useState<LibraryItem | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deleteLibraryOpen, setDeleteLibraryOpen] = useState(false);
  const [references, setReferences] = useState<{ id: string; name: string }[] | null>(null);
  const [checkingRefs, setCheckingRefs] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fit, setFit] = useViewPref<MediaFit>('v2.library.fit', 'cover', ['cover', 'contain']);
  const [tileSize, setTileSize] = useViewPref<TileSize>('v2.library.tileSize', 'm', ['s', 'm', 'l']);
  const [textView, setTextView] = useViewPref<TextView>('v2.library.textView', 'cards', ['cards', 'list']);
  const fileInput = useRef<HTMLInputElement>(null);
  const tagsKey = filterTags.join('\u0000');

  const updateParams = useCallback(
    (apply: (next: URLSearchParams) => void) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        apply(next);
        return next;
      }),
    [setSearchParams],
  );
  const setPage = (page: number) => updateParams((next) => next.set('page', String(Math.max(1, page))));
  const setPageSize = (size: PageSize) =>
    updateParams((next) => {
      if (size === DEFAULT_PAGE_SIZE) next.delete('size');
      else next.set('size', String(size));
      // A different page length invalidates the current offset.
      next.set('page', '1');
    });
  const setSearch = useCallback(
    (q: string) =>
      updateParams((next) => {
        if (q.trim()) next.set('q', q.trim());
        else next.delete('q');
        next.set('page', '1');
      }),
    [updateParams],
  );
  const setSort = (key: SortKey) =>
    updateParams((next) => {
      const [by, order] = key.split('-');
      next.set('sortBy', by);
      next.set('sortOrder', order);
      next.set('page', '1');
    });
  const setFilterTags = (tags: string[]) =>
    updateParams((next) => {
      next.delete('tag');
      tags.forEach((tag) => next.append('tag', tag));
      next.set('page', '1');
    });
  const toggleFilterTag = (tag: string) => setFilterTags(filterTags.includes(tag) ? filterTags.filter((x) => x !== tag) : [...filterTags, tag]);
  const clearFilters = () =>
    updateParams((next) => {
      next.delete('q');
      next.delete('tag');
      next.set('page', '1');
    });

  // Only the newest load may write the items, so a slow one can't overwrite a later page or filter.
  const loadSeq = useRef(0);
  const loadItems = useCallback(
    async (silent = false) => {
      const seq = ++loadSeq.current;
      if (!silent) setLoadingItems(true);
      try {
        const result = await fetchLibraryItems(library.id, currentPage, pageSize === 'all' ? ALL_LIMIT : pageSize, searchTerm || undefined, filterTags, sortBy, sortOrder);
        if (seq !== loadSeq.current) return;
        setItems(result.items);
        setTotalItems(result.total);
        setTotalPages(result.pages);
      } catch (e) {
        console.error('Failed to load items:', e);
      } finally {
        if (seq === loadSeq.current) setLoadingItems(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.id, currentPage, pageSize, searchTerm, tagsKey, sortBy, sortOrder],
  );

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // After a change made here: the items, and the hero's numbers and covers.
  const refresh = async () => {
    await Promise.all([loadItems(), onChanged().catch((e) => console.error('Failed to reload library:', e))]);
  };

  // Items added or edited elsewhere (another tab, an MCP agent).
  useLiveRefresh(
    (event) => event.resource === 'library' && (!event.id || event.id === library.id),
    () => loadItems(true),
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setLastIndex(null);
  }, []);

  // The selection only ever covers the items in view, so bulk actions never reach hidden ones.
  useEffect(clearSelection, [clearSelection, library.id, currentPage, pageSize, searchTerm, tagsKey, sortBy, sortOrder]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    library.items.forEach((item) => item.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    items.forEach((item) => item.tags?.forEach((tag) => !counts.has(tag) && counts.set(tag, 1)));
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [library.items, items]);

  const hasFilter = Boolean(searchTerm) || filterTags.length > 0;
  // Video and audio would need frames or a transcript first.
  const canAutoTag = type === 'image' || type === 'text';
  const pageOffset = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
  const libraryCount = !hasFilter && !loadingItems ? totalItems : (library.itemCount ?? library.items.length);
  const viewing = viewingIndex !== null ? items[viewingIndex] ?? null : null;
  const playingVideo = videoIndex !== null ? items[videoIndex] ?? null : null;
  const selectedItems = items.filter((item) => selected.has(item.id));

  const toggle = (item: LibraryItem, index: number, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastIndex !== null) {
        const select = !prev.has(item.id);
        items.slice(Math.min(lastIndex, index), Math.max(lastIndex, index) + 1).forEach((it) => (select ? next.add(it.id) : next.delete(it.id)));
      } else if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    setLastIndex(index);
  };

  const selectAll = () => setSelected(new Set(items.map((item) => item.id)));

  const accepts = (file: File) =>
    isText ? file.type.startsWith('text/') || TEXT_FILE.test(file.name) : file.type.startsWith(MEDIA_ACCEPT[type as keyof typeof MEDIA_ACCEPT]);

  const uploadFiles = async (files: File[]) => {
    const accepted = files.filter(accepts);
    const skipped = files.length - accepted.length;
    if (skipped > 0) snackbar.show(t('v2.library.skipped', { count: skipped }));
    if (accepted.length === 0) return;
    setUpload({ done: 0, total: accepted.length });
    try {
      // Newest first in the library means the first file should be saved last.
      for (const [index, file] of [...accepted].reverse().entries()) {
        if (isText) {
          await createLibraryItem(library.id, { id: crypto.randomUUID(), content: await file.text(), title: file.name.replace(TEXT_FILE, '') });
          setUpload({ done: index + 1, total: accepted.length });
          continue;
        }
        const base64 = await readFileAsDataUrl(file);
        let result: { key: string; size?: number; thumbnailKey?: string; optimizedKey?: string };
        if (type === 'image') result = await saveImage(base64, library.id);
        else if (type === 'video') result = await saveVideo(base64, library.id);
        else if (type === 'audio') result = await saveAudio(base64, library.id);
        else throw new Error('Unsupported library type for upload');
        await createLibraryItem(library.id, {
          id: crypto.randomUUID(),
          content: result.key,
          title: file.name,
          thumbnailUrl: result.thumbnailKey,
          optimizedUrl: result.optimizedKey,
          size: result.size,
        });
        setUpload({ done: index + 1, total: accepted.length });
      }
      await refresh();
    } catch (err) {
      console.error('Failed to upload files:', err);
      snackbar.show((err as Error).message || t('libraryEditor.toasts.uploadFailed'));
    } finally {
      setUpload(null);
    }
  };

  const uploadFromUrl = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || '') || 'pasted';
      await uploadFiles([new File([blob], name, { type: blob.type })]);
    } catch (err) {
      console.error('Failed to fetch pasted URL:', err);
      snackbar.show(t('v2.library.pasteFetchFailed'));
    }
  };

  const pasteText = async (text: string) => {
    try {
      await createLibraryItem(library.id, { id: crypto.randomUUID(), content: text, title: '' });
      await refresh();
      snackbar.show(t('v2.library.pastedText'));
    } catch (err) {
      snackbar.show((err as Error).message || t('libraryEditor.toasts.uploadFailed'));
    }
  };

  // Cmd/Ctrl+V anywhere on the page outside a text field: files (Finder, or an image copied in a
  // browser) upload; text becomes an item of a text library, or a media URL to fetch otherwise.
  const handlePaste = (e: ClipboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    if (e.defaultPrevented || upload || (active && (active.matches('input, textarea, select') || active.isContentEditable))) return;
    const data = e.clipboardData;
    if (!data) return;
    const files = Array.from(data.files);
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
      return;
    }
    const text = data.getData('text/plain').trim();
    if (isText) {
      if (!text) return;
      e.preventDefault();
      void pasteText(text);
      return;
    }
    const src = new DOMParser().parseFromString(data.getData('text/html'), 'text/html').querySelector('img, video, audio, source')?.getAttribute('src');
    const url = src || (/^(https?:|data:)\S+$/i.test(text) ? text : '');
    if (!url) return;
    e.preventDefault();
    void uploadFromUrl(url);
  };
  const pasteHandler = useRef(handlePaste);
  pasteHandler.current = handlePaste;
  useEffect(() => {
    const listener = (e: ClipboardEvent) => pasteHandler.current(e);
    document.addEventListener('paste', listener);
    return () => document.removeEventListener('paste', listener);
  }, []);

  const hasFiles = (e: DragEvent) => !isText && e.dataTransfer.types.includes('Files');
  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!upload) void uploadFiles(Array.from(e.dataTransfer.files));
    },
  };

  const startLibraryAutoTag = async ({ onlyUntagged }: { onlyUntagged: boolean }) => {
    try {
      const scope =
        autoTagTarget === 'selected'
          ? { itemIds: [...selected] }
          : { all: true as const, q: searchTerm || undefined, filterTags: filterTags.length > 0 ? filterTags : undefined };
      const { queued } = await startAutoTag({ kind: 'library', libraryId: library.id }, { ...scope, onlyUntagged, language: i18n.language });
      snackbar.show(queued === 0 ? t('autoTag.nothingToTag') : t('autoTag.started', { count: queued }));
      setAutoTagRunKey((key) => key + 1);
    } catch (err) {
      snackbar.show((err as Error).message || t('autoTag.startFailed'));
      throw err;
    }
  };

  const saveBatchTags = async (tagsToAdd: string[]) => {
    if (tagsToAdd.length === 0) return;
    for (const item of selectedItems) {
      await updateLibraryItem(library.id, item.id, { tags: Array.from(new Set([...(item.tags || []), ...tagsToAdd])) }).catch(console.error);
    }
    clearSelection();
    await refresh();
  };

  const saveItemTags = async (tags: string[]) => {
    if (!tagItemId) return;
    await updateLibraryItem(library.id, tagItemId, { tags }).catch(console.error);
    await refresh();
  };

  const confirmCopyMove = async (destination: string) => {
    const ids = [...selected];
    const action = copyMove ?? 'copy';
    try {
      if (action === 'copy') {
        await copyLibraryItems(library.id, ids, destination);
        snackbar.show(t('v2.library.copied', { count: ids.length }));
      } else {
        await moveLibraryItems(library.id, ids, destination);
        snackbar.show(t('v2.library.moved', { count: ids.length }));
      }
      clearSelection();
      await refresh();
    } catch (e) {
      console.error(`Failed to ${action} items:`, e);
      snackbar.show((e as Error).message || t(`libraryEditor.${action}Error`, `Failed to ${action} items`));
      throw e;
    }
  };

  const askDeleteLibrary = async () => {
    setCheckingRefs(true);
    try {
      const refs = await fetchLibraryReferences(library.id);
      if (refs.length > 0) setReferences(refs);
      else setDeleteLibraryOpen(true);
    } catch (e) {
      console.error('Failed to check references:', e);
      setDeleteLibraryOpen(true);
    } finally {
      setCheckingRefs(false);
    }
  };

  const copyContent = (content: string) => {
    void navigator.clipboard.writeText(content);
    snackbar.show(t('libraryEditor.copiedToClipboard', { defaultValue: 'Copied to clipboard' }));
  };

  const copyReference = async (item: LibraryItem) => {
    const reference = resourceRef.libraryItem(library.id, item.id);
    try {
      await copyText(reference);
      snackbar.show(`${t('resourceRef.copied')} · ${reference}`);
    } catch {
      snackbar.show(`${t('resourceRef.copyFailed')} · ${reference}`);
    }
  };

  const startAssistantChat = () => {
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', { state: { draftBoundContexts: [{ id: library.id, name: library.name, type: 'library', subType: type }] } });
  };

  const itemLabel = (item: LibraryItem, index: number) => {
    if (item.title) return item.title;
    const n = pageOffset + index + 1;
    return type === 'image' ? t('libraryEditor.imageLabel', { index: n }) : type === 'video' ? `Video ${n}` : `Audio ${n}`;
  };

  const promptHref = (item: LibraryItem) => `/library/${library.id}/prompt/${item.id}`;

  const itemMenu = (item: LibraryItem): ActionMenuItem[] => [
    { key: 'rename', hidden: isText, label: t('libraryEditor.renameItem'), icon: 'edit', onSelect: () => setRenaming(item) },
    { key: 'tags', label: t('libraryEditor.editTags'), icon: 'sell', onSelect: () => setTagItemId(item.id) },
    { key: 'ref', label: t('resourceRef.copy'), icon: 'tag', onSelect: () => void copyReference(item) },
    { key: 'original', hidden: isText, divider: true, label: t('projectViewer.album.openOriginal'), icon: 'open_in_new', href: isText ? undefined : imageDisplayUrl(item.content), target: '_blank' },
    { key: 'watermark', hidden: type !== 'image', label: t('libraryEditor.quickWatermark'), icon: 'approval', href: withBase(`/library/${library.id}/items/${item.id}/watermark`), target: '_blank' },
    { key: 'delete', divider: true, danger: true, label: t('libraryEditor.deleteItem'), icon: 'delete', onSelect: () => setRemoveItem(item) },
  ];

  const openMedia = (_item: LibraryItem, index: number) => {
    if (type === 'image') setLightboxIndex(index);
    else if (type === 'video') setVideoIndex(index);
  };

  const sortKey = `${sortBy}-${sortOrder}` as SortKey;
  const uploading = upload !== null;
  const actionSize = wide ? 'md' : 'sm';

  const primaryAction = isText ? (
    <Button variant="filled" size={actionSize} icon="add" href={`/library/${library.id}/prompt/new`}>
      {t('libraryEditor.addItem')}
    </Button>
  ) : (
    <>
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={`${MEDIA_ACCEPT[type as keyof typeof MEDIA_ACCEPT]}*`}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          void uploadFiles(files);
        }}
      />
      <Button variant="filled" size={actionSize} icon="upload" loading={uploading} onClick={() => fileInput.current?.click()}>
        {upload ? t('v2.library.uploadingCount', { done: upload.done, total: upload.total }) : t('libraryEditor.upload')}
      </Button>
    </>
  );

  const heroActions = (
    <>
      <IconButton icon="auto_awesome" variant="tonal" size={actionSize} label={t('v2.library.startChat')} tooltip onClick={startAssistantChat} />
      {canAutoTag && (
        <IconButton
          icon="wand_stars"
          variant="tonal"
          size={actionSize}
          label={hasFilter ? t('libraryEditor.autoTagResults') : t('libraryEditor.autoTagLibrary')}
          tooltip
          disabled={totalItems === 0}
          onClick={() => setAutoTagTarget('all')}
        />
      )}
      <IconButton icon="settings" variant="tonal" size={actionSize} label={t('libraryEditor.editLibrarySettings')} tooltip href={`/library/${library.id}/edit`} />
      <ActionMenu
        label={t('v2.common.more')}
        variant="tonal"
        size={actionSize}
        openOnHover
        items={[
          { key: 'duplicate', label: t('libraries.libraryCard.duplicate'), icon: 'content_copy', onSelect: () => setDuplicateOpen(true) },
          { key: 'import', label: t('libraryEditor.importOutput'), icon: 'swap_vert', href: `/library/${library.id}/import-export`, hidden: !isText },
          { key: 'export', label: t('libraryEditor.exportModal.trigger'), icon: 'folder_zip', onSelect: () => setExportOpen(true), hidden: isText },
          { key: 'delete', label: t('libraryEditor.deleteLibrary'), icon: 'delete', danger: true, divider: true, disabled: checkingRefs, onSelect: () => void askDeleteLibrary() },
        ]}
      />
    </>
  );

  const tools = (
    <>
      <ResultsSearch value={searchTerm} onChange={setSearch} label={t('libraryEditor.filterItems')} />
      {(tagCounts.length > 0 || filterTags.length > 0) && (
        <HoverMenuButton
          placement="bottom-end"
          aria-label={t('libraryEditor.filterByTag')}
          trigger={(p) => <IconButton {...p} icon="filter_list" size="sm" variant={filterTags.length > 0 ? 'tonal' : 'standard'} label={t('libraryEditor.filterByTag')} />}
        >
          <MenuItem type="checkbox" icon="select_all" checked={filterTags.length === 0} keepOpen onSelect={() => setFilterTags([])}>
            {t('libraryEditor.allItems')}
          </MenuItem>
          <MenuDivider />
          {tagCounts.map(({ tag, count }) => (
            <MenuItem key={tag} type="checkbox" checked={filterTags.includes(tag)} keepOpen onSelect={() => toggleFilterTag(tag)} trailingText={String(count)}>
              {tag}
            </MenuItem>
          ))}
        </HoverMenuButton>
      )}
      <HoverMenuButton placement="bottom-end" aria-label={t('v2.library.viewOptions')} trigger={(p) => <IconButton {...p} icon="tune" size="sm" label={t('v2.library.viewOptions')} />}>
        {isMedia && (
          <MenuGroup label={t('v2.library.layout')}>
            <MenuItem type="radio" icon="crop" checked={fit === 'cover'} keepOpen onSelect={() => setFit('cover')}>
              {t('v2.library.fitCover')}
            </MenuItem>
            <MenuItem type="radio" icon="fit_screen" checked={fit === 'contain'} keepOpen onSelect={() => setFit('contain')}>
              {t('v2.library.fitContain')}
            </MenuItem>
            <SubMenu icon="photo_size_select_large" label={t('v2.library.tileSize')}>
              {(['s', 'm', 'l'] as const).map((size) => (
                <MenuItem key={size} type="radio" checked={tileSize === size} keepOpen onSelect={() => setTileSize(size)}>
                  {t(`v2.library.size.${size}`)}
                </MenuItem>
              ))}
            </SubMenu>
          </MenuGroup>
        )}
        {isText && (
          <MenuGroup label={t('v2.library.layout')}>
            <MenuItem type="radio" icon="dashboard" checked={textView === 'cards'} keepOpen onSelect={() => setTextView('cards')}>
              {t('v2.library.cards')}
            </MenuItem>
            <MenuItem type="radio" icon="view_list" checked={textView === 'list'} keepOpen onSelect={() => setTextView('list')}>
              {t('v2.library.list')}
            </MenuItem>
          </MenuGroup>
        )}
        {type !== 'audio' && <MenuDivider />}
        <SubMenu icon="sort" label={t('v2.project.sort')}>
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} type="radio" icon={option.icon} checked={sortKey === option.value} onSelect={() => setSort(option.value)}>
              {t(option.label)}
            </MenuItem>
          ))}
        </SubMenu>
        <SubMenu icon="view_agenda" label={t('pagination.pageSize')}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <MenuItem key={String(size)} type="radio" checked={pageSize === size} onSelect={() => setPageSize(size)}>
              {size === 'all' ? t('pagination.all') : String(size)}
            </MenuItem>
          ))}
        </SubMenu>
      </HoverMenuButton>
    </>
  );

  const scopeActions: ActionMenuItem[] = [
    { key: 'autotag', hidden: !canAutoTag, label: hasFilter ? t('libraryEditor.autoTagResults') : t('libraryEditor.autoTagLibrary'), icon: 'wand_stars', onSelect: () => setAutoTagTarget('all') },
    { key: 'export', hidden: isText, label: t('libraryEditor.exportModal.trigger'), icon: 'folder_zip', onSelect: () => setExportOpen(true) },
  ].filter((item) => !item.hidden);

  const selectionActions = (
    <>
      <IconButton icon="sell" size="sm" label={t('libraryEditor.batchTag')} tooltip onClick={() => setBatchTagOpen(true)} />
      {canAutoTag && <IconButton icon="wand_stars" size="sm" label={t('libraryEditor.autoTag')} tooltip onClick={() => setAutoTagTarget('selected')} />}
      <IconButton icon="content_copy" size="sm" label={t('projectViewer.transfer.copyTo')} tooltip onClick={() => setCopyMove('copy')} />
      <IconButton icon="drive_file_move" size="sm" label={t('projectViewer.transfer.moveTo')} tooltip onClick={() => setCopyMove('move')} />
      <DangerAction label={t('libraryEditor.delete')} onClick={() => setDeleteSelectedOpen(true)} />
    </>
  );

  const filterRow = hasFilter && (
    <>
      {searchTerm && <FilterChip label={`“${searchTerm}”`} removeLabel={t('projectViewer.album.clearSearch')} onRemove={() => setSearch('')} />}
      {filterTags.map((tag) => (
        <FilterChip key={tag} label={`#${tag}`} removeLabel={t('projectViewer.album.tagRemove', { tag })} onRemove={() => toggleFilterTag(tag)} />
      ))}
      <button type="button" className="v2-filter-link" onClick={clearFilters}>
        {t('v2.project.clearFilters')}
      </button>
    </>
  );

  const countLabel = hasFilter ? t('v2.library.matches', { count: totalItems }) : t('v2.project.itemCount', { count: totalItems });

  let body: ReactNode;
  if (loadingItems && items.length === 0) {
    body = (
      <div className="v2-results-loading">
        <LoadingIndicator />
      </div>
    );
  } else if (items.length === 0 && !hasFilter) {
    body = (
      <EmptyState
        icon={isText ? 'edit_note' : 'upload'}
        shape={meta.shape}
        className="v2-pane-empty"
        title={t('v2.library.emptyTitle')}
        description={isText ? t('v2.library.emptyText') : t('v2.library.emptyMedia')}
        action={primaryAction}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon="filter_alt_off"
        className="v2-pane-empty"
        title={t('libraryEditor.noResultsFound')}
        description={t('libraryEditor.tryDifferentSearch')}
        action={
          <Button variant="tonal" icon="filter_alt_off" onClick={clearFilters}>
            {t('v2.project.clearFilters')}
          </Button>
        }
      />
    );
  } else if (isText) {
    body = (
      <LibraryTextItems
        view={textView}
        items={items}
        selectedIds={selected}
        firstIndex={pageOffset + 1}
        menuItems={itemMenu}
        editHref={promptHref}
        onOpen={(item) => setViewingIndex(items.indexOf(item))}
        onToggle={toggle}
        onCopy={(item) => copyContent(item.content)}
        onTagClick={toggleFilterTag}
      />
    );
  } else if (type === 'audio') {
    body = (
      <LibraryAudioList
        items={items}
        selectedIds={selected}
        label={itemLabel}
        menuItems={itemMenu}
        onToggle={toggle}
        onRename={setRenaming}
        onEditTags={(item) => setTagItemId(item.id)}
        onDelete={setRemoveItem}
        onTagClick={toggleFilterTag}
      />
    );
  } else {
    body = (
      <LibraryMediaGrid
        type={type}
        items={items}
        selectedIds={selected}
        fit={fit}
        size={tileSize}
        firstIndex={pageOffset + 1}
        label={itemLabel}
        menuItems={itemMenu}
        onOpen={openMedia}
        onToggle={toggle}
        onRename={setRenaming}
        onEditTags={(item) => setTagItemId(item.id)}
        onDelete={setRemoveItem}
        onTagClick={toggleFilterTag}
      />
    );
  }

  return (
    <Page className="v2-lib" data-kind={type} {...dropHandlers}>
      <LibraryHero library={library} itemCount={libraryCount} primary={primaryAction} actions={heroActions} />

      <section className="v2-lib-pane v2-pane" data-density="compact">
        <div className="v2-results-section">
          <ResultsBar
            nav={
              <Text as="span" variant="title-small" emphasized className="v2-lib-pane__count">
                {countLabel}
              </Text>
            }
            isLoading={loadingItems && items.length > 0}
            totalCount={items.length}
            selectedCount={selected.size}
            onToggleSelectAll={selectAll}
            onClearSelection={clearSelection}
            tools={tools}
            menuItems={totalItems > 0 ? scopeActions : []}
            selectionActions={selectionActions}
            below={filterRow}
          />

          {upload && <LinearProgress className="v2-pane-inset v2-lib-pane__upload" shape="wavy" value={upload.done} max={upload.total} aria-label={t('v2.library.uploadingCount', { done: upload.done, total: upload.total })} />}
          {canAutoTag && <AutoTagProgress scope={{ kind: 'library', libraryId: library.id }} runKey={autoTagRunKey} className="v2-pane-inset" />}

          {body}

          {totalItems > 0 && <PagedFooter className="v2-results-footer" page={currentPage} pageSize={pageSize} total={totalItems} pages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize} />}
        </div>

        {dragging && (
          <div className="v2-lib-drop" aria-hidden>
            <div className="v2-lib-drop__inner">
              <span className="v2-lib-drop__art">
                <Shape name={meta.shape} size={112} morph={false} className="v2-lib-drop__shape" />
                <Icon name="upload" size={40} className="v2-lib-drop__icon" />
              </span>
              <Text variant="title-large" emphasized>
                {t('v2.library.dropTitle', { name: library.name })}
              </Text>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteLibraryOpen}
        tone="danger"
        title={t('libraryEditor.confirm.deleteLibrary.title')}
        message={t('libraryEditor.confirm.deleteLibrary.message', { name: library.name })}
        confirmLabel={t('libraryEditor.confirm.deleteLibrary.confirm')}
        onClose={() => setDeleteLibraryOpen(false)}
        onConfirm={async () => {
          try {
            await deleteLibrary(library.id);
            navigate('/libraries');
          } catch (e) {
            console.error(e);
          }
        }}
      />

      <Dialog
        open={references !== null}
        onClose={() => setReferences(null)}
        icon="link"
        headline={t('libraryEditor.references.title')}
        maxWidth={480}
        actions={
          <>
            <Button variant="text" onClick={() => setReferences(null)}>
              {t('confirmModal.cancel')}
            </Button>
            <Button variant="filled" icon="link_off" onClick={() => navigate(`/library/${library.id}/cleanup`)}>
              {t('libraryEditor.references.resolve')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('libraryEditor.references.message', { name: library.name, count: references?.length ?? 0 })}
          </Text>
          <RowList className="max-h-48 overflow-y-auto">
            {references?.map((project) => <Row key={project.id} lead={<Icon name="play_circle" className="text-primary" />} title={project.name} to={`/project/${project.id}`} />)}
          </RowList>
        </div>
      </Dialog>

      <Dialog
        open={viewing !== null}
        onClose={() => setViewingIndex(null)}
        icon="notes"
        headline={viewing?.title || t('libraryEditor.fullSource')}
        maxWidth={720}
        actions={
          viewing &&
          viewingIndex !== null && (
            <>
              <IconButton icon="chevron_left" label={t('projectViewer.textDetail.previousItem')} tooltip disabled={viewingIndex <= 0} onClick={() => setViewingIndex(viewingIndex - 1)} />
              <IconButton icon="chevron_right" label={t('projectViewer.textDetail.nextItem')} tooltip disabled={viewingIndex >= items.length - 1} onClick={() => setViewingIndex(viewingIndex + 1)} />
              <span className="flex-1" />
              <Button variant="tonal" icon="content_copy" onClick={() => copyContent(viewing.content)}>
                {t('libraryEditor.copyContent')}
              </Button>
              <Button variant="filled" icon="edit_note" href={promptHref(viewing)}>
                {t('libraryEditor.refineInFullEditor')}
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col gap-3">
            {(viewing.createdAt || viewing.updatedAt) && (
              <Text variant="label-small" className="tabular-nums text-on-surface-variant">
                {viewing.createdAt ? `${t('libraryEditor.createdAt')} ${formatItemDateTime(viewing.createdAt)}` : ''}
                {viewing.updatedAt && viewing.updatedAt !== viewing.createdAt ? `${viewing.createdAt ? ' · ' : ''}${t('libraryEditor.updatedAt')} ${formatItemDateTime(viewing.updatedAt)}` : ''}
              </Text>
            )}
            <TagLine
              tags={viewing.tags}
              onTagClick={(tag) => {
                setViewingIndex(null);
                toggleFilterTag(tag);
              }}
            />
            <div className="v2-source-block">{viewing.content}</div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={playingVideo !== null}
        onClose={() => setVideoIndex(null)}
        maxWidth={1100}
        className="v2-video-dialog"
        headline={playingVideo && videoIndex !== null ? itemLabel(playingVideo, videoIndex) : undefined}
        actions={
          videoIndex !== null && (
            <>
              <IconButton icon="chevron_left" label={t('projectViewer.imageLightbox.previous')} tooltip disabled={videoIndex <= 0} onClick={() => setVideoIndex(videoIndex - 1)} />
              <IconButton icon="chevron_right" label={t('projectViewer.imageLightbox.next')} tooltip disabled={videoIndex >= items.length - 1} onClick={() => setVideoIndex(videoIndex + 1)} />
              <span className="flex-1" />
              {playingVideo && (
                <Button variant="text" icon="open_in_new" href={imageDisplayUrl(playingVideo.content)} target="_blank" rel="noreferrer">
                  {t('projectViewer.album.openOriginal')}
                </Button>
              )}
              <Button variant="filled" onClick={() => setVideoIndex(null)}>
                {t('projectViewer.common.close')}
              </Button>
            </>
          )
        }
      >
        {playingVideo && (
          <video
            key={playingVideo.id}
            src={imageDisplayUrl(playingVideo.content)}
            poster={playingVideo.thumbnailUrl ? imageDisplayUrl(playingVideo.thumbnailUrl) : undefined}
            controls
            autoPlay
            className="v2-media-player max-h-[75vh]"
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={removeItem !== null}
        tone="danger"
        title={t('libraryEditor.confirm.removeItem.title')}
        message={t('libraryEditor.confirm.removeItem.message')}
        confirmLabel={t('libraryEditor.confirm.removeItem.confirm')}
        onClose={() => setRemoveItem(null)}
        onConfirm={async () => {
          if (!removeItem) return;
          try {
            await deleteLibraryItem(library.id, removeItem.id);
            await refresh();
          } catch (e) {
            console.error('Failed to delete item:', e);
          }
        }}
      />

      <ConfirmDialog
        open={deleteSelectedOpen}
        tone="danger"
        title={t('libraryEditor.confirm.deleteSelected.title')}
        message={t('libraryEditor.confirm.deleteSelected.message', { count: selected.size })}
        confirmLabel={t('libraryEditor.confirm.deleteSelected.confirm')}
        onClose={() => setDeleteSelectedOpen(false)}
        onConfirm={async () => {
          for (const id of selected) await deleteLibraryItem(library.id, id);
          await refresh();
          clearSelection();
        }}
      />

      {lightboxIndex !== null && items[lightboxIndex] && (
        <Lightbox
          images={items.map((item) => imageDisplayUrl(item.optimizedUrl || item.content))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={(index) => items[index] && setRemoveItem(items[index])}
          onIndexChange={(index) => {
            setLightboxIndex(index);
            const next = items[index];
            if (next) document.getElementById(`library-item-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      )}

      <TagDialog
        open={batchTagOpen}
        onClose={() => setBatchTagOpen(false)}
        onSave={(tags) => void saveBatchTags(tags)}
        title={t('libraryEditor.tagModal.batchTitle')}
        description={t('libraryEditor.tagModal.batchDescription', { count: selected.size })}
        saveButtonText={t('libraryEditor.tagModal.addTags')}
      />
      <TagDialog
        open={tagItemId !== null}
        onClose={() => setTagItemId(null)}
        onSave={(tags) => void saveItemTags(tags)}
        initialTags={tagItemId ? items.find((i) => i.id === tagItemId)?.tags || [] : []}
        title={t('libraryEditor.tagModal.editTitle')}
      />

      <AutoTagDialog open={autoTagTarget !== null} itemCount={autoTagTarget === 'selected' ? selected.size : totalItems} onClose={() => setAutoTagTarget(null)} onStart={startLibraryAutoTag} />

      <PromptDialog
        open={renaming !== null}
        icon="edit"
        title={t('libraryEditor.renameItem')}
        label={t('libraryEditor.renameItem')}
        initialValue={renaming?.title || ''}
        allowEmpty
        confirmLabel={t('common.save', 'Save')}
        onClose={() => setRenaming(null)}
        onConfirm={async (title) => {
          if (!renaming) return;
          try {
            await updateLibraryItem(library.id, renaming.id, { title: title.trim() });
            await refresh();
          } catch (err) {
            console.error('Failed to update title', err);
            snackbar.show((err as Error).message || t('v2.library.renameFailed'));
          }
        }}
      />

      <PromptDialog
        open={duplicateOpen}
        icon="content_copy"
        title={t('libraries.duplicateDialog.title')}
        description={t('libraries.duplicateDialog.description')}
        label={t('libraries.duplicateDialog.placeholder')}
        initialValue={library.name}
        confirmLabel={t('libraries.duplicateDialog.confirm')}
        cancelLabel={t('libraries.duplicateDialog.cancel')}
        onClose={() => setDuplicateOpen(false)}
        onConfirm={async (name) => {
          try {
            const copy = await duplicateLibrary(library.id, name);
            snackbar.show(t('libraries.duplicateDialog.success', { name: library.name }));
            navigate(`/library/${copy.id}`);
          } catch (error) {
            snackbar.show((error as Error).message || t('libraries.duplicateDialog.error'));
            throw error;
          }
        }}
      />

      <PromptDialog
        open={exportOpen}
        icon="folder_zip"
        title={t('libraryEditor.exportModal.title')}
        description={t('libraryEditor.exportModal.description')}
        label={t('libraryEditor.exportModal.fileName')}
        placeholder={t('libraryEditor.exportModal.placeholder')}
        initialValue={defaultExportName(library.name)}
        confirmLabel={t('libraryEditor.exportModal.confirm')}
        cancelLabel={t('libraryEditor.exportModal.cancel')}
        onClose={() => setExportOpen(false)}
        onConfirm={async (fileName) => {
          try {
            await exportMediaLibraryZip(library.id, fileName);
            navigate('/exports');
            snackbar.show(t('libraryEditor.exportModal.success', 'Library export queued.'));
          } catch (error) {
            snackbar.show((error as Error)?.message || t('libraryEditor.exportModal.error'));
            throw error;
          }
        }}
      />

      <CopyMoveItemsDialog
        open={copyMove !== null}
        action={copyMove ?? 'copy'}
        sourceLibraryId={library.id}
        libraryType={type}
        itemCount={selected.size}
        onClose={() => setCopyMove(null)}
        onConfirm={confirmCopyMove}
      />
    </Page>
  );
}

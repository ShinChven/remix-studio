import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
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
import { resourceRef } from '../../lib/resource-ref';
import { Button, Checkbox, ChipSet, Dialog, Icon, IconButton, MenuButton, MenuDivider, MenuItem, Select, Text, useSnackbar } from '../../m3';
import type { Library, LibraryItem } from '../../types';
import { withBase } from '../app/paths';
import { AutoTagDialog } from '../components/AutoTagDialog';
import { AutoTagProgress } from '../components/AutoTagProgress';
import { CopyRefButton } from '../components/CopyRefButton';
import { CopyMoveItemsDialog } from '../components/library/CopyMoveItemsDialog';
import { Lightbox } from '../components/Lightbox';
import { TagDialog } from '../components/TagDialog';
import { ActionMenu } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { kindMeta } from '../ui/entityMeta';
import { MediaTile } from '../ui/MediaTile';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { PromptDialog } from '../ui/PromptDialog';
import { Row, RowList } from '../ui/Rows';
import { SearchField } from '../ui/SearchField';
import { SelectionBar } from '../ui/SelectionBar';
import { StatusPill } from '../ui/Stat';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
type SortKey = 'time-desc' | 'time-asc' | 'name-asc' | 'name-desc';

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

  // The library renamed, deleted or refilled elsewhere (another tab, an MCP agent).
  useLiveRefresh(
    (event) => event.resource === 'library' && (!event.id || event.id === id),
    async (events) => {
      const requested = idRef.current;
      if (!requested) return;
      if (events.some((event) => event.action === 'deleted' && event.id === requested)) {
        setLibrary(null);
        return;
      }
      const lib = await fetchLibrary(requested);
      if (idRef.current === requested) setLibrary(lib);
    },
  );

  if (loading) return <LoadingState minHeight={400} />;
  if (!library) return <EmptyState icon="folder_off" title={t('libraryRoute.notFound')} />;
  return <LibraryEditor key={library.id} library={library} />;
}

function LibraryEditor({ library }: { library: Library }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const searchTerm = searchParams.get('q') || '';
  const requestedSize = parseInt(searchParams.get('size') || '', 10);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const sortBy = (searchParams.get('sortBy') as 'time' | 'name') || 'time';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  const type = library.type || 'text';
  const isText = type === 'text';
  const meta = kindMeta(type);

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingItems, setLoadingItems] = useState(true);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
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
  const setPageSize = (size: number) =>
    updateParams((next) => {
      if (size === DEFAULT_PAGE_SIZE) next.delete('size');
      else next.set('size', String(size));
      // A different page length invalidates the current offset.
      next.set('page', '1');
    });
  const setSearch = (q: string) =>
    updateParams((next) => {
      if (q.trim()) next.set('q', q.trim());
      else next.delete('q');
      next.set('page', '1');
    });
  const setSort = (key: SortKey) =>
    updateParams((next) => {
      const [by, order] = key.split('-');
      next.set('sortBy', by);
      next.set('sortOrder', order);
      next.set('page', '1');
    });

  // Only the newest load may write the items, so a slow one can't overwrite a later page or filter.
  const loadSeq = useRef(0);
  const loadItems = useCallback(
    async (silent = false) => {
      const seq = ++loadSeq.current;
      if (!silent) setLoadingItems(true);
      try {
        const result = await fetchLibraryItems(library.id, currentPage, pageSize, searchTerm || undefined, filterTags, sortBy, sortOrder);
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

  // Items added or edited elsewhere (another tab, an MCP agent).
  useLiveRefresh(
    (event) => event.resource === 'library' && (!event.id || event.id === library.id),
    () => loadItems(true),
  );

  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    [...library.items, ...items].forEach((item) => item.tags?.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [library.items, items]);

  const hasFilter = Boolean(searchTerm) || filterTags.length > 0;
  // Video and audio would need frames or a transcript first.
  const canAutoTag = type === 'image' || type === 'text';
  const viewing = viewingId ? items.find((item) => item.id === viewingId) ?? null : null;
  const pageOffset = (currentPage - 1) * pageSize;

  const clearSelection = () => {
    setSelected(new Set());
    setLastIndex(null);
  };

  const toggle = (id: string, index: number, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastIndex !== null) {
        const select = !prev.has(id);
        items.slice(Math.min(lastIndex, index), Math.max(lastIndex, index) + 1).forEach((item) => (select ? next.add(item.id) : next.delete(item.id)));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastIndex(index);
  };

  const toggleAll = () => {
    if (selected.size === items.length && items.length > 0) setSelected(new Set());
    else setSelected(new Set(items.map((item) => item.id)));
  };

  const toggleFilterTag = (tag: string) => {
    setPage(1);
    setFilterTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of [...files].reverse()) {
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
      }
      await loadItems();
    } catch (err) {
      console.error('Failed to upload files:', err);
      snackbar.show((err as Error).message || t('libraryEditor.toasts.uploadFailed'));
    } finally {
      setUploading(false);
    }
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
    for (const id of selected) {
      const item = items.find((i) => i.id === id);
      if (item) await updateLibraryItem(library.id, id, { tags: Array.from(new Set([...(item.tags || []), ...tagsToAdd])) }).catch(console.error);
    }
    clearSelection();
    await loadItems();
  };

  const saveItemTags = async (tags: string[]) => {
    if (!tagItemId) return;
    await updateLibraryItem(library.id, tagItemId, { tags }).catch(console.error);
    await loadItems();
  };

  const confirmCopyMove = async (destination: string) => {
    const ids = [...selected];
    const action = copyMove ?? 'copy';
    try {
      if (action === 'copy') {
        await copyLibraryItems(library.id, ids, destination);
        snackbar.show(t('libraryEditor.copySuccess', { count: ids.length }));
      } else {
        await moveLibraryItems(library.id, ids, destination);
        snackbar.show(t('libraryEditor.moveSuccess', { count: ids.length }));
      }
      clearSelection();
      await loadItems();
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

  const startAssistantChat = () => {
    localStorage.removeItem('assistant_last_conversation');
    navigate('/assistant', { state: { draftBoundContexts: [{ id: library.id, name: library.name, type: 'library', subType: type }] } });
  };

  const itemLabel = (item: LibraryItem, index: number) => {
    if (item.title) return item.title;
    const n = pageOffset + index + 1;
    return type === 'image' ? t('libraryEditor.imageLabel', { index: n }) : type === 'video' ? `Video ${n}` : `Audio ${n}`;
  };

  const openItem = (item: LibraryItem, index: number, e: MouseEvent | KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) toggle(item.id, index, e.shiftKey);
    else if (isText) setViewingId(item.id);
    else if (type === 'image') setLightboxIndex(index);
  };

  const sortKey = `${sortBy}-${sortOrder}` as SortKey;
  const tagFilterLabel = filterTags.length === 0 ? t('libraryEditor.filterByTag') : filterTags.length === 1 ? filterTags[0] : t('libraryEditor.tagsSelected', { count: filterTags.length });

  return (
    <Page density="compact">
      <PageHeader
        backLink={{ to: '/libraries', label: t('nav.libraries', 'Libraries') }}
        title={library.name}
        description={
          <span className="flex flex-col gap-2">
            {library.description && <span>{library.description}</span>}
            <span className="flex flex-wrap items-center gap-2">
              <StatusPill tone="neutral" icon={meta.icon}>
                {t('libraryEditor.collectionType', { type })}
              </StatusPill>
              <StatusPill tone="primary" icon="stacks">
                {t('libraries.libraryCard.items', { count: totalItems })}
              </StatusPill>
            </span>
          </span>
        }
        actions={
          <>
            <SearchField value={searchInput} onChange={setSearchInput} onSubmit={setSearch} placeholder={t('libraryEditor.filterItems')} className="v2-header-search" />
            {isText ? (
              <Button variant="filled" icon="add" onClick={() => navigate(`/library/${library.id}/prompt/new`)}>
                {t('libraryEditor.addItem')}
              </Button>
            ) : (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    void upload(files);
                  }}
                />
                <Button variant="filled" icon="upload" loading={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? t('libraryEditor.uploading') : t('libraryEditor.upload')}
                </Button>
              </>
            )}
            <IconButton icon="auto_awesome" variant="tonal" label={t('libraryEditor.startAssistantChat', { defaultValue: 'Start assistant chat for this library' })} tooltip onClick={startAssistantChat} />
            {canAutoTag && (
              <IconButton
                icon="wand_stars"
                variant="tonal"
                label={hasFilter ? t('libraryEditor.autoTagResults') : t('libraryEditor.autoTagLibrary')}
                tooltip
                disabled={totalItems === 0}
                onClick={() => setAutoTagTarget('all')}
              />
            )}
            <IconButton icon="settings" variant="tonal" label={t('libraryEditor.editLibrarySettings')} tooltip href={`/library/${library.id}/edit`} />
            <ActionMenu
              label={t('v2.common.more')}
              variant="tonal"
              items={[
                { key: 'duplicate', label: t('libraries.libraryCard.duplicate'), icon: 'content_copy', onSelect: () => setDuplicateOpen(true) },
                { key: 'import', label: t('libraryEditor.importOutput'), icon: 'swap_vert', href: `/library/${library.id}/import-export`, hidden: !isText },
                { key: 'export', label: t('libraryEditor.exportModal.trigger', 'Export ZIP'), icon: 'folder_zip', onSelect: () => setExportOpen(true), hidden: isText },
                { key: 'delete', label: t('libraryEditor.deleteLibrary'), icon: 'delete', danger: true, divider: true, disabled: checkingRefs, onSelect: () => void askDeleteLibrary() },
              ]}
            />
          </>
        }
      />

      <SelectionBar
        selected={selected.size}
        total={items.length}
        onToggleAll={toggleAll}
        onClear={clearSelection}
        selectAllLabel={t('libraryEditor.selectAll')}
        selectedLabel={t('libraryEditor.selectedCount', { count: selected.size })}
        filters={
          <>
            <MenuButton
              aria-label={t('libraryEditor.filterByTag')}
              trigger={(props) => (
                <Button {...props} variant={filterTags.length > 0 ? 'tonal' : 'outlined'} size="xs" icon="sell" trailingIcon="arrow_drop_down">
                  <span className="v2-truncate-label">{tagFilterLabel}</span>
                </Button>
              )}
            >
              <MenuItem
                icon="select_all"
                type="checkbox"
                checked={filterTags.length === 0}
                onSelect={() => {
                  setFilterTags([]);
                  setPage(1);
                }}
              >
                {t('libraryEditor.allItems')}
              </MenuItem>
              {availableTags.length > 0 && <MenuDivider />}
              {availableTags.map((tag) => (
                <MenuItem key={tag} type="checkbox" checked={filterTags.includes(tag)} keepOpen onSelect={() => toggleFilterTag(tag)}>
                  {tag}
                </MenuItem>
              ))}
            </MenuButton>
            <Select<SortKey>
              variant="outlined"
              aria-label={t('libraryEditor.sort.timeDesc')}
              leadingIcon="sort"
              value={sortKey}
              onChange={setSort}
              options={[
                { value: 'time-desc', label: t('libraryEditor.sort.timeDesc') },
                { value: 'time-asc', label: t('libraryEditor.sort.timeAsc') },
                { value: 'name-asc', label: t('libraryEditor.sort.nameAsc') },
                { value: 'name-desc', label: t('libraryEditor.sort.nameDesc') },
              ]}
              className="v2-inline-select"
            />
            <Select
              variant="outlined"
              aria-label={t('pagination.pageSize')}
              leadingIcon="view_agenda"
              value={String(pageSize)}
              onChange={(v) => setPageSize(Number(v))}
              options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
              className="v2-inline-select v2-inline-select--narrow"
            />
          </>
        }
        actions={
          <>
            <Button variant="text" size="xs" icon="content_copy" onClick={() => setCopyMove('copy')}>
              {t('libraryEditor.copyTo', 'Copy To')}
            </Button>
            <Button variant="text" size="xs" icon="drive_file_move" onClick={() => setCopyMove('move')}>
              {t('libraryEditor.moveTo', 'Move To')}
            </Button>
            <Button variant="text" size="xs" icon="sell" onClick={() => setBatchTagOpen(true)}>
              {t('libraryEditor.batchTag')}
            </Button>
            {canAutoTag && (
              <Button variant="text" size="xs" icon="wand_stars" onClick={() => setAutoTagTarget('selected')}>
                {t('libraryEditor.autoTag')}
              </Button>
            )}
            <Button variant="filled" size="xs" icon="delete" className="v2-button-danger" onClick={() => setDeleteSelectedOpen(true)}>
              {t('libraryEditor.delete')}
            </Button>
          </>
        }
      />

      {canAutoTag && <AutoTagProgress scope={{ kind: 'library', libraryId: library.id }} runKey={autoTagRunKey} />}

      {loadingItems ? (
        <LoadingState minHeight={240} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={hasFilter ? 'search_off' : meta.icon}
          shape={hasFilter ? 'cookie-9' : 'sunny'}
          title={hasFilter ? t('libraryEditor.noResultsFound') : t('libraryEditor.emptyTitle')}
          description={hasFilter ? t('libraryEditor.tryDifferentSearch') : t('libraryEditor.emptyDescription')}
        />
      ) : isText ? (
        <RowList>
          {items.map((item, index) => {
            const isSelected = selected.has(item.id);
            const updated = formatItemDateTime(item.updatedAt);
            return (
              <Row
                key={item.id}
                selected={isSelected}
                onClick={(e) => openItem(item, index, e)}
                lead={
                  <span
                    className="v2-row__check"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(item.id, index, e.shiftKey);
                    }}
                  >
                    <Checkbox checked={isSelected} onChange={() => undefined} aria-label={t('libraryEditor.selectItem')} tabIndex={-1} />
                  </span>
                }
                title={item.title || item.content}
                meta={
                  <>
                    {item.title && <span className="v2-row__preview">{item.content}</span>}
                    {item.tags && item.tags.length > 0 && (
                      <span className="v2-tag-mini">
                        {item.tags[0]}
                        {item.tags.length > 1 && ` +${item.tags.length - 1}`}
                      </span>
                    )}
                    {updated && <span className="hidden tabular-nums md:inline">{updated}</span>}
                  </>
                }
                actions={
                  <>
                    <IconButton icon="content_copy" size="xs" label={t('libraryEditor.copyContent', { defaultValue: 'Copy Content' })} tooltip onClick={() => copyContent(item.content)} />
                    <CopyRefButton reference={resourceRef.libraryItem(library.id, item.id)} />
                    <IconButton icon="sell" size="xs" label={t('libraryEditor.editTags')} tooltip onClick={() => setTagItemId(item.id)} />
                    <IconButton icon="edit_note" size="xs" label={t('libraryEditor.refineInFullEditor')} tooltip href={`/library/${library.id}/prompt/${item.id}`} />
                    <IconButton icon="delete" size="xs" label={t('libraryEditor.deleteItem')} tooltip className="v2-icon-danger" onClick={() => setRemoveItem(item)} />
                  </>
                }
              />
            );
          })}
        </RowList>
      ) : (
        <div className="v2-tile-grid">
          {items.map((item, index) => (
            <MediaTile
              key={item.id}
              src={type === 'audio' ? null : item.thumbnailUrl || (type === 'image' ? item.content : null)}
              icon={meta.icon}
              overlayIcon={type === 'video' ? 'play_arrow' : undefined}
              title={itemLabel(item, index)}
              titleHint={t('libraryEditor.clickToRename', 'Click to rename')}
              onTitleClick={() => setRenaming(item)}
              kicker={type}
              selected={selected.has(item.id)}
              selectLabel={t('libraryEditor.selectItem')}
              onToggleSelect={(e) => toggle(item.id, index, e.shiftKey)}
              onOpen={(e) => openItem(item, index, e)}
              actions={
                <>
                  <CopyRefButton reference={resourceRef.libraryItem(library.id, item.id)} />
                  {type === 'image' && (
                    <IconButton icon="approval" size="xs" label={t('libraryEditor.quickWatermark')} tooltip href={withBase(`/library/${library.id}/items/${item.id}/watermark`)} target="_blank" rel="noreferrer" />
                  )}
                  <IconButton icon="sell" size="xs" label={t('libraryEditor.editTags')} tooltip onClick={() => setTagItemId(item.id)} />
                  <IconButton icon="delete" size="xs" label={t('libraryEditor.deleteItem')} tooltip onClick={() => setRemoveItem(item)} />
                </>
              }
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="v2-paged-footer">
          <Text variant="label-medium" className="text-on-surface-variant">
            {t('pagination.pageOf', { page: currentPage, pages: totalPages })}
          </Text>
          <Pagination page={currentPage} pages={totalPages} onPageChange={setPage} />
        </div>
      )}

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
        onClose={() => setViewingId(null)}
        icon="sticky_note_2"
        headline={viewing?.title || t('libraryEditor.fullSource')}
        maxWidth={720}
        actions={
          viewing && (
            <>
              <Button variant="text" onClick={() => setViewingId(null)}>
                {t('common.close', 'Close')}
              </Button>
              <Button variant="tonal" icon="content_copy" onClick={() => copyContent(viewing.content)}>
                {t('libraryEditor.copyContent', { defaultValue: 'Copy Content' })}
              </Button>
              <Button variant="filled" icon="edit_note" href={`/library/${library.id}/prompt/${viewing.id}`}>
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
                {viewing.createdAt ? `${t('libraryEditor.createdAt', { defaultValue: 'Created' })} ${formatItemDateTime(viewing.createdAt)}` : ''}
                {viewing.updatedAt && viewing.updatedAt !== viewing.createdAt
                  ? `${viewing.createdAt ? ' · ' : ''}${t('libraryEditor.updatedAt', { defaultValue: 'Updated' })} ${formatItemDateTime(viewing.updatedAt)}`
                  : ''}
              </Text>
            )}
            {viewing.tags && viewing.tags.length > 0 && (
              <ChipSet>
                {viewing.tags.map((tag) => (
                  <span key={tag} className="v2-tag-mini">
                    {tag}
                  </span>
                ))}
              </ChipSet>
            )}
            <div className="v2-source-block">{viewing.content}</div>
          </div>
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
            await loadItems();
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
          await loadItems();
          clearSelection();
        }}
      />

      {lightboxIndex !== null && items[lightboxIndex] && (
        <Lightbox images={items.map((item) => imageDisplayUrl(item.optimizedUrl || item.content))} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} />
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
        title={t('libraryEditor.renameItem', 'Rename Item')}
        label={t('libraryEditor.renameItem', 'Rename Item')}
        initialValue={renaming?.title || ''}
        allowEmpty
        confirmLabel={t('common.save', 'Save')}
        onClose={() => setRenaming(null)}
        onConfirm={async (title) => {
          if (!renaming) return;
          try {
            await updateLibraryItem(library.id, renaming.id, { title: title.trim() });
            await loadItems();
          } catch (err) {
            console.error('Failed to update title', err);
            snackbar.show('Failed to update title');
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
        title={t('libraryEditor.exportModal.title', 'Export Library')}
        description={t('libraryEditor.exportModal.description', 'Confirm the ZIP filename before downloading this library.')}
        label={t('libraryEditor.exportModal.fileName', 'File Name')}
        placeholder={t('libraryEditor.exportModal.placeholder', 'library_export.zip')}
        initialValue={defaultExportName(library.name)}
        confirmLabel={t('libraryEditor.exportModal.confirm', 'Export ZIP')}
        cancelLabel={t('libraryEditor.exportModal.cancel', 'Cancel')}
        onClose={() => setExportOpen(false)}
        onConfirm={async (fileName) => {
          try {
            await exportMediaLibraryZip(library.id, fileName);
            navigate('/exports');
            snackbar.show(t('libraryEditor.exportModal.success', 'Library export queued.'));
          } catch (error) {
            snackbar.show((error as Error)?.message || t('libraryEditor.exportModal.error', 'Failed to export library'));
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

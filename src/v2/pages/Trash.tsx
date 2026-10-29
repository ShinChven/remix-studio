import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { deleteTrashBatch, deleteTrashPermanently, emptyTrash, fetchTrash, imageDisplayUrl, moveToTrashBatch, restoreTrashBatch, restoreTrashItem } from '../../api';
import { Button, IconButton, MenuDivider, MenuGroup, MenuItem, usePrefersReducedMotion, useSnackbar } from '../../m3';
import type { TrashItem } from '../../types';
import { Lightbox } from '../components/Lightbox';
import { DangerAction, ResultsBar, SectionNav } from '../components/project/ResultsBar';
import { TrashGrid, type Leaving, type TileSize } from '../components/trash/TrashGrid';
import { TrashHero } from '../components/trash/TrashHero';
import { TrashItemDialog } from '../components/trash/TrashItemDialog';
import { groupItems, sortItems, TRASH_KINDS, TRASH_SORTS, trashBytes, trashFilename, trashKind, type TrashGroup, type TrashKind, type TrashSort } from '../components/trash/trashMeta';
import { formatBytes } from '../lib/format';
import { useRangeSelection } from '../lib/useRangeSelection';
import { useViewPref } from '../lib/viewPrefs';
import type { ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HoverMenuButton } from '../ui/HoverMenuButton';
import { EmptyState, ErrorState, LoadingState, Page } from '../ui/Page';
import { PagedFooter, PAGE_SIZE_OPTIONS } from '../ui/PagedFooter';
import { FilterChip, ResultsSearch } from '../ui/ResultFilters';

type View = 'all' | TrashKind;
const VIEWS: View[] = ['all', ...TRASH_KINDS];
const VIEW_ICONS: Record<View, string> = { all: 'delete', image: 'image', video: 'movie', audio: 'music_note', text: 'notes' };
const TILE_SIZES: TileSize[] = ['s', 'm', 'l'];
const DEFAULT_PAGE_SIZE = 100;
/** Long enough for the lift or the drop to read before the item is gone. */
const LEAVE_MS = 280;

type Pending = { kind: 'empty' } | { kind: 'restore-all' } | { kind: 'delete'; items: TrashItem[] };

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Prompt, text, project, tags and file name, against every word of the search. */
function matches(item: TrashItem, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [item.prompt, item.textContent, item.projectName, item.format, trashFilename(item), ...(item.tags ?? [])].filter(Boolean).join('\n').toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function Trash() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const snackbar = useSnackbar();
  const reducedMotion = usePrefersReducedMotion();
  const [params, setParams] = useSearchParams();

  // Filters, sort, paging and the open item live in the URL.
  const q = params.get('q') ?? '';
  const view = pick(params.get('kind'), VIEWS, 'all');
  const project = params.get('project');
  const sort = pick(params.get('sort'), Object.keys(TRASH_SORTS) as TrashSort[], 'recent');
  const sizeParam = params.get('size');
  const pageSize: number | 'all' = sizeParam === 'all' ? 'all' : PAGE_SIZE_OPTIONS.includes(Number(sizeParam)) ? Number(sizeParam) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const openId = params.get('item');
  const [tileSize, setTileSize] = useViewPref<TileSize>('v2.trash.tileSize', 'm', TILE_SIZES);

  const update = useCallback(
    (patch: Record<string, string | number | null>, { push = false }: { push?: boolean } = {}) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '' || (key === 'kind' && value === 'all')) next.delete(key);
            else next.set(key, String(value));
          }
          // Any change to what is listed starts again from the first page.
          if (!('page' in patch) && !('item' in patch)) next.delete('page');
          if (next.get('page') === '1') next.delete('page');
          if (next.get('sort') === 'recent') next.delete('sort');
          if (next.get('size') === String(DEFAULT_PAGE_SIZE)) next.delete('size');
          return next;
        },
        { replace: !push },
      );
    },
    [setParams],
  );
  const setSearch = useCallback((value: string) => update({ q: value.trim() }), [update]);

  // Everything in the bin; the page filters and pages it.
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrash()
      .then((result) => {
        if (cancelled) return;
        setItems(result);
        setError('');
      })
      .catch((err: Error) => !cancelled && setError(err.message || t('v2.trash.loadFailed')))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  const projects = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number; exists: boolean }>();
    for (const item of items) {
      const entry = byId.get(item.projectId) ?? { id: item.projectId, name: item.projectName, count: 0, exists: item.projectExists !== false };
      entry.count += 1;
      byId.set(item.projectId, entry);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, lang));
  }, [items, lang]);
  const projectEntry = project ? projects.find((entry) => entry.id === project) : undefined;

  // Counts on the kind switcher follow the search and project.
  const scoped = useMemo(() => items.filter((item) => (!project || item.projectId === project) && matches(item, q)), [items, project, q]);
  const counts = useMemo(() => {
    const result: Record<View, number> = { all: scoped.length, image: 0, video: 0, audio: 0, text: 0 };
    for (const item of scoped) result[trashKind(item)] += 1;
    return result;
  }, [scoped]);
  const sorted = useMemo(() => sortItems(view === 'all' ? scoped : scoped.filter((item) => trashKind(item) === view), sort, lang), [scoped, view, sort, lang]);
  const pages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageItems = useMemo(() => (pageSize === 'all' ? sorted : sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)), [sorted, pageSize, currentPage]);
  const groups = useMemo(() => groupItems(pageItems, sort, lang), [pageItems, sort, lang]);
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + trashBytes(item), 0), [items]);
  const shownBytes = useMemo(() => sorted.reduce((sum, item) => sum + trashBytes(item), 0), [sorted]);

  // Selection covers the items on the page; it clears whenever the list changes.
  const { selected, setSelected, toggle, selectAll, clear: clearSelection } = useRangeSelection(pageItems, (item) => item.id, [q, view, project, sort, currentPage, pageSize]);
  const selectedItems = useMemo(() => pageItems.filter((item) => selected.has(item.id)), [pageItems, selected]);

  const toggleGroup = (group: TrashGroup) =>
    setSelected((current) => {
      const next = new Set(current);
      const all = group.items.every((item) => next.has(item.id));
      for (const item of group.items) {
        if (all) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });

  // The open item, and the pictures in the lightbox.
  const openItem = openId ? (items.find((item) => item.id === openId) ?? null) : null;
  const openDetails = (item: TrashItem) => update({ item: item.id }, { push: !openId });
  const closeDetails = () => update({ item: null });
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null);
  const lightboxIndex = useRef(0);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const lightboxItems = lightbox ? lightbox.ids.map((id) => itemsById.get(id)).filter((item): item is TrashItem => item !== undefined) : [];

  const open = (item: TrashItem) => {
    if (trashKind(item) !== 'image') {
      openDetails(item);
      return;
    }
    const ids = sorted.filter((other) => trashKind(other) === 'image').map((other) => other.id);
    const index = Math.max(0, ids.indexOf(item.id));
    lightboxIndex.current = index;
    setLightbox({ ids, index });
  };

  // Restored items lift out of the grid and deleted ones drop, then they are gone.
  const [leaving, setLeaving] = useState<Map<string, Leaving>>(new Map());
  const leave = (ids: string[], how: Leaving) => {
    const gone = new Set(ids);
    // The open item steps to its neighbour; the lightbox keeps its place.
    if (openId && gone.has(openId)) {
      const at = sorted.findIndex((item) => item.id === openId);
      const neighbour = sorted.slice(at + 1).find((item) => !gone.has(item.id)) ?? sorted.slice(0, Math.max(0, at)).reverse().find((item) => !gone.has(item.id));
      update({ item: neighbour?.id ?? null });
    }
    setLightbox((current) => {
      if (!current || !current.ids.some((id) => gone.has(id))) return current;
      const before = current.ids.slice(0, lightboxIndex.current).filter((id) => gone.has(id)).length;
      const ids = current.ids.filter((id) => !gone.has(id));
      if (!ids.length) return null;
      const index = Math.min(ids.length - 1, lightboxIndex.current - before);
      lightboxIndex.current = index;
      return { ids, index };
    });
    setLeaving((current) => {
      const next = new Map(current);
      for (const id of ids) next.set(id, how);
      return next;
    });
    window.setTimeout(
      () => {
        setItems((current) => current.filter((item) => !gone.has(item.id)));
        setLeaving((current) => {
          const next = new Map(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        setSelected((current) => {
          if (![...current].some((id) => gone.has(id))) return current;
          return new Set([...current].filter((id) => !gone.has(id)));
        });
      },
      reducedMotion ? 0 : LEAVE_MS,
    );
  };

  const fail = (err: unknown, key: string) => snackbar.show({ message: (err as Error).message || t(key), closable: true });

  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => snackbar.show(t('v2.trash.copied')))
      .catch(() => snackbar.show(t('v2.trash.copyFailed')));
  };

  /** Puts restored items back in the bin, project by project. */
  const undoRestore = async (restored: TrashItem[]) => {
    const byProject = new Map<string, string[]>();
    for (const item of restored) byProject.set(item.projectId, [...(byProject.get(item.projectId) ?? []), item.id]);
    try {
      for (const [projectId, ids] of byProject) await moveToTrashBatch(projectId, ids);
      snackbar.show(t('v2.trash.undone', { count: restored.length }));
    } catch (err) {
      fail(err, 'v2.trash.undoFailed');
    }
    reload();
  };

  const restore = async (targets: TrashItem[]) => {
    const restorable = targets.filter((item) => item.projectExists !== false && !leaving.has(item.id));
    const skipped = targets.length - restorable.length;
    if (!restorable.length) {
      snackbar.show(t('v2.trash.cantRestore', { count: targets.length }));
      return;
    }
    try {
      if (restorable.length === 1) await restoreTrashItem(restorable[0].id);
      else await restoreTrashBatch(restorable.map((item) => item.id));
    } catch (err) {
      fail(err, 'v2.trash.restoreFailed');
      reload();
      return;
    }
    leave(
      restorable.map((item) => item.id),
      'restore',
    );
    const message = restorable.length === 1 ? t('v2.trash.restoredTo', { project: restorable[0].projectName }) : t('v2.trash.restored', { count: restorable.length });
    snackbar.show({
      message: skipped ? `${message} · ${t('v2.trash.skipped', { count: skipped })}` : message,
      action: { label: t('v2.trash.undo'), onClick: () => void undoRestore(restorable) },
    });
  };

  const deleteForever = async (targets: TrashItem[]) => {
    const ids = targets.map((item) => item.id);
    try {
      if (ids.length === 1) await deleteTrashPermanently(ids[0]);
      else await deleteTrashBatch(ids);
    } catch (err) {
      fail(err, 'v2.trash.deleteFailed');
      reload();
      return;
    }
    leave(ids, 'delete');
    snackbar.show(t('v2.trash.deleted', { count: ids.length, size: formatBytes(targets.reduce((sum, item) => sum + trashBytes(item), 0)) }));
  };

  const emptyAll = async () => {
    try {
      await emptyTrash();
    } catch (err) {
      fail(err, 'v2.trash.emptyFailed');
      reload();
      return;
    }
    leave(
      items.map((item) => item.id),
      'delete',
    );
    snackbar.show(t('v2.trash.emptied', { size: formatBytes(totalBytes) }));
  };

  const restorableCount = items.filter((item) => item.projectExists !== false).length;

  const itemMenu = (item: TrashItem): ActionMenuItem[] => {
    const orphan = item.projectExists === false;
    const kind = trashKind(item);
    return [
      { key: 'details', icon: 'info', label: t('v2.project.details'), onSelect: () => openDetails(item) },
      { key: 'select', icon: selected.has(item.id) ? 'check_box' : 'check_box_outline_blank', label: t('v2.project.select'), type: 'checkbox', checked: selected.has(item.id), onSelect: () => toggle(item.id, false) },
      { key: 'restore', icon: 'restore', label: orphan ? t('v2.trash.orphanShort') : t('v2.trash.restore'), disabled: orphan, divider: true, onSelect: () => void restore([item]) },
      { key: 'project', icon: 'folder_open', label: t('v2.trash.openProject'), hidden: orphan, href: `/project/${item.projectId}?tab=album` },
      { key: 'filter', icon: 'filter_list', label: t('v2.trash.onlyThisProject'), hidden: project === item.projectId, onSelect: () => update({ project: item.projectId }) },
      { key: 'original', icon: 'open_in_new', label: t('projectViewer.album.openOriginal'), hidden: kind === 'text', href: imageDisplayUrl(item.imageUrl), target: '_blank' },
      { key: 'copy', icon: 'content_copy', label: kind === 'text' ? t('v2.trash.copyText') : t('v2.trash.copyPrompt'), hidden: !(item.textContent || item.prompt), onSelect: () => copy(kind === 'text' ? item.textContent || item.prompt : item.prompt) },
      { key: 'delete', icon: 'delete_forever', label: t('v2.trash.deleteForever'), danger: true, divider: true, onSelect: () => setPending({ kind: 'delete', items: [item] }) },
    ];
  };

  const [pending, setPending] = useState<Pending | null>(null);
  const pendingCopy = (() => {
    if (!pending) return null;
    if (pending.kind === 'empty')
      return {
        tone: 'danger' as const,
        icon: 'delete_sweep',
        title: t('v2.trash.confirmEmptyTitle'),
        message: t('v2.trash.confirmEmptyMessage', { count: items.length, size: formatBytes(totalBytes) }),
        confirm: t('v2.trash.emptyBin'),
      };
    if (pending.kind === 'restore-all') {
      const skipped = items.length - restorableCount;
      return {
        tone: 'default' as const,
        icon: 'restore',
        title: t('v2.trash.confirmRestoreAllTitle'),
        message: [t('v2.trash.confirmRestoreAllMessage', { count: restorableCount }), skipped ? t('v2.trash.skipped', { count: skipped }) : ''].filter(Boolean).join(' · '),
        confirm: t('v2.trash.restoreAll'),
      };
    }
    const size = formatBytes(pending.items.reduce((sum, item) => sum + trashBytes(item), 0));
    return {
      tone: 'danger' as const,
      icon: 'delete_forever',
      title: t('v2.trash.confirmDeleteTitle', { count: pending.items.length }),
      message: t('v2.trash.confirmDeleteMessage', { count: pending.items.length, size }),
      confirm: t('v2.trash.deleteForever'),
    };
  })();
  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === 'empty') await emptyAll();
    else if (pending.kind === 'restore-all') await restore(items);
    else await deleteForever(pending.items);
  };

  const filtered = Boolean(q) || Boolean(project) || view !== 'all';
  const clearFilters = () => update({ q: null, project: null, kind: null });

  const nav = (
    <SectionNav<View>
      scope="trash"
      label={t('v2.trash.sections')}
      value={view}
      onChange={(next) => update({ kind: next })}
      items={VIEWS.filter((value) => value === 'all' || value === view || counts[value] > 0).map((value) => ({ value, label: t(`v2.trash.kinds.${value}`), icon: VIEW_ICONS[value], count: counts[value] }))}
    />
  );

  const tools = (
    <>
      <ResultsSearch value={q} onChange={setSearch} label={t('v2.trash.search')} />
      {projects.length > 1 && (
        <HoverMenuButton
          placement="bottom-end"
          aria-label={t('v2.trash.project')}
          trigger={(p) => <IconButton {...p} icon="folder" size="sm" variant={project ? 'tonal' : 'standard'} label={t('v2.trash.project')} />}
        >
          <MenuItem type="radio" icon="folder_copy" checked={!project} onSelect={() => update({ project: null })} trailingText={String(items.length)}>
            {t('v2.trash.allProjects')}
          </MenuItem>
          <MenuDivider />
          {projects.map((entry) => (
            <MenuItem key={entry.id} type="radio" icon={entry.exists ? 'folder' : 'folder_off'} checked={project === entry.id} onSelect={() => update({ project: entry.id })} trailingText={String(entry.count)}>
              {entry.name}
            </MenuItem>
          ))}
        </HoverMenuButton>
      )}
      <HoverMenuButton placement="bottom-end" aria-label={t('v2.trash.viewOptions')} trigger={(p) => <IconButton {...p} icon="tune" size="sm" label={t('v2.trash.viewOptions')} />}>
        <MenuGroup label={t('v2.project.sort')}>
          {(Object.keys(TRASH_SORTS) as TrashSort[]).map((value) => (
            <MenuItem key={value} type="radio" icon={TRASH_SORTS[value].icon} checked={sort === value} onSelect={() => update({ sort: value })}>
              {t(`v2.trash.sorts.${value}`)}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuDivider />
        <MenuGroup label={t('v2.library.tileSize')}>
          {TILE_SIZES.map((value) => (
            <MenuItem key={value} type="radio" checked={tileSize === value} onSelect={() => setTileSize(value)}>
              {t(`v2.library.size.${value}`)}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuDivider />
        <MenuGroup label={t('pagination.pageSize')}>
          {PAGE_SIZE_OPTIONS.map((value) => (
            <MenuItem key={String(value)} type="radio" checked={pageSize === value} onSelect={() => update({ size: value })}>
              {value === 'all' ? t('pagination.all') : String(value)}
            </MenuItem>
          ))}
        </MenuGroup>
      </HoverMenuButton>
    </>
  );

  const chips = (q || project) && (
    <>
      {q && <FilterChip label={`“${q}”`} removeLabel={t('v2.trash.clearSearch')} onRemove={() => update({ q: null })} />}
      {project && <FilterChip label={projectEntry?.name ?? project} removeLabel={t('v2.trash.allProjects')} onRemove={() => update({ project: null })} />}
      <button type="button" className="v2-filter-link" onClick={clearFilters}>
        {t('v2.project.clearFilters')}
      </button>
    </>
  );

  const selectedOrphans = selectedItems.filter((item) => item.projectExists === false).length;

  return (
    <Page className="v2-trash" density="compact">
      <TrashHero
        items={loaded ? items : null}
        actions={
          items.length > 0 && (
            <>
              <Button variant="filled" icon="restore" emphasized disabled={restorableCount === 0} onClick={() => setPending({ kind: 'restore-all' })}>
                {t('v2.trash.restoreAll')}
              </Button>
              <Button variant="tonal" icon="delete_sweep" className="v2-button-danger" onClick={() => setPending({ kind: 'empty' })}>
                {t('v2.trash.emptyBin')}
              </Button>
            </>
          )
        }
      />

      <section className="v2-trash-pane" aria-label={t('trash.title')}>
        <ResultsBar
          nav={nav}
          totalCount={pageItems.length}
          selectedCount={selectedItems.length}
          onToggleSelectAll={selectAll}
          onClearSelection={clearSelection}
          isLoading={loading && loaded}
          summary={sorted.length > 0 && `${t('v2.project.itemCount', { count: sorted.length })} · ${formatBytes(shownBytes)}`}
          tools={tools}
          below={chips || undefined}
          menuItems={[
            { key: 'restore-all', icon: 'restore', label: t('v2.trash.restoreAll'), disabled: restorableCount === 0, onSelect: () => setPending({ kind: 'restore-all' }) },
            { key: 'refresh', icon: 'refresh', label: t('v2.trash.refresh'), onSelect: reload },
            { key: 'empty', icon: 'delete_sweep', label: t('v2.trash.emptyBin'), danger: true, divider: true, disabled: items.length === 0, onSelect: () => setPending({ kind: 'empty' }) },
          ]}
          selectionActions={
            <>
              <IconButton
                icon="restore"
                size="sm"
                label={selectedOrphans ? `${t('v2.trash.restore')} · ${t('v2.trash.skipped', { count: selectedOrphans })}` : t('v2.trash.restore')}
                tooltip
                disabled={selectedOrphans === selectedItems.length}
                onClick={() => void restore(selectedItems)}
              />
              <DangerAction icon="delete_forever" label={t('v2.trash.deleteForever')} onClick={() => setPending({ kind: 'delete', items: selectedItems })} />
            </>
          }
        />

        {error && (
          <div className="v2-pane-inset">
            <ErrorState message={error} onRetry={reload} retryLabel={t('v2.trash.retry')} />
          </div>
        )}

        {!loaded ? (
          <LoadingState />
        ) : items.length === 0 && !error ? (
          <EmptyState className="v2-pane-empty v2-trash-empty" shape="ghostish" icon="delete" title={t('v2.trash.emptyTitle')} description={t('v2.trash.emptyDescription')} />
        ) : sorted.length === 0 && !error ? (
          <EmptyState
            className="v2-pane-empty"
            shape="puffy"
            icon="search_off"
            title={t('v2.trash.noMatches')}
            description={t('v2.trash.noMatchesHint')}
            action={
              filtered && (
                <Button variant="tonal" icon="filter_alt_off" onClick={clearFilters}>
                  {t('v2.project.clearFilters')}
                </Button>
              )
            }
          />
        ) : (
          <TrashGrid
            groups={groups}
            selectedIds={selected}
            size={tileSize}
            showProject={sort !== 'project'}
            leaving={leaving}
            menuItems={itemMenu}
            onOpen={open}
            onToggle={(item, range) => toggle(item.id, range)}
            onToggleGroup={toggleGroup}
            onRestore={(item) => void restore([item])}
            onDelete={(item) => setPending({ kind: 'delete', items: [item] })}
            onProjectClick={(projectId) => update({ project: projectId === project ? null : projectId })}
          />
        )}

        {sorted.length > 0 && <PagedFooter className="v2-results-footer" page={currentPage} pageSize={pageSize} total={sorted.length} pages={pages} onPageChange={(next) => update({ page: next })} onPageSizeChange={(next) => update({ size: next })} />}
      </section>

      <TrashItemDialog
        item={openItem}
        items={sorted}
        onNavigate={(item) => update({ item: item.id })}
        onClose={closeDetails}
        onRestore={(item) => void restore([item])}
        onDelete={(item) => setPending({ kind: 'delete', items: [item] })}
        onCopy={copy}
        onProjectClick={(projectId) => update({ project: projectId, item: null })}
      />

      {lightbox && lightboxItems.length > 0 && (
        <Lightbox
          images={lightboxItems.map((item) => imageDisplayUrl(item.optimizedUrl || item.imageUrl))}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(index) => {
            lightboxIndex.current = index;
            const item = lightboxItems[index];
            if (item) document.getElementById(`trash-item-${item.id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
          }}
          onReuse={(index) => lightboxItems[index] && void restore([lightboxItems[index]])}
          onDelete={(index) => lightboxItems[index] && setPending({ kind: 'delete', items: [lightboxItems[index]] })}
          reuseAction={{ icon: 'restore', label: t('v2.trash.restore') }}
          deleteAction={{ icon: 'delete_forever', label: t('v2.trash.deleteForever') }}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        tone={pendingCopy?.tone}
        icon={pendingCopy?.icon}
        title={pendingCopy?.title ?? ''}
        message={pendingCopy?.message}
        confirmLabel={pendingCopy?.confirm}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
      />
    </Page>
  );
}

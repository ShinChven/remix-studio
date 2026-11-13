import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteLibraryTrash, deleteTrashBatch, deleteTrashPermanently, emptyLibraryTrash, emptyTrash, fetchLibraryTrash, fetchTrash, imageDisplayUrl, moveLibraryItemsToTrash, moveToTrashBatch, restoreLibraryTrash, restoreTrashBatch, restoreTrashItem } from '../../api';
import { Button, IconButton, MenuDivider, MenuGroup, MenuItem, Tab, Tabs, usePrefersReducedMotion } from '../../m3';
import type { TrashItem } from '../../types';
import { Lightbox } from '../components/Lightbox';
import { TrashGrid, type Leaving } from '../components/trash/TrashGrid';
import { TrashHero } from '../components/trash/TrashHero';
import { TrashItemDialog } from '../components/trash/TrashItemDialog';
import { groupItems, sortItems, TRASH_KINDS, TRASH_SORTS, TRASH_SOURCES, trashBytes, trashFilename, trashKey, trashKind, trashParentHref, type TrashGroup, type TrashKind, type TrashSort, type TrashSource } from '../components/trash/trashMeta';
import { errorText } from '../lib/errors';
import { formatBytes } from '../lib/format';
import { useAsyncData } from '../lib/useAsyncData';
import { useCopy } from '../lib/useCopy';
import { pageOf, PAGE_SIZES, useListParams } from '../lib/useListParams';
import { useSelection } from '../lib/useSelection';
import { TILE_SIZES, useViewPref, type TileSize } from '../lib/viewPrefs';
import type { ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HoverMenuButton } from '../ui/HoverMenuButton';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { Page } from '../ui/Page';
import { FilterChip } from '../ui/ResultFilters';
import { useToast } from '../ui/useToast';

type View = 'all' | TrashKind;
const VIEWS: View[] = ['all', ...TRASH_KINDS];
const VIEW_ICONS: Record<View, string> = { all: 'delete', image: 'image', video: 'movie', audio: 'music_note', text: 'notes' };
const SOURCE_ICONS: Record<TrashSource, string> = { projects: 'folder', libraries: 'photo_library' };
/** Long enough for the lift or the drop to read before the item is gone. */
const LEAVE_MS = 280;

type Pending = { kind: 'empty' } | { kind: 'restore-all' } | { kind: 'delete'; items: TrashItem[] };

/** Prompt, text, project, tags and file name, against every word of the search. */
function matches(item: TrashItem, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [item.title, item.prompt, item.textContent, item.projectName, item.format, trashFilename(item), ...(item.tags ?? [])].filter(Boolean).join('\n').toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function Trash() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toast = useToast();
  const copyText = useCopy();
  const reducedMotion = usePrefersReducedMotion();

  // Filters, sort, paging and the open item live in the URL.
  const list = useListParams({ pageSize: 100, pageSizes: PAGE_SIZES, defaults: { kind: 'all', sort: 'recent' } });
  const { q, pageSize } = list;
  // Two bins: album items from projects, and items from libraries.
  const source = list.oneOf('from', TRASH_SOURCES);
  const fromLibraries = source === 'libraries';
  const k = (key: string) => trashKey(source, key);
  const view = list.oneOf('kind', VIEWS);
  const project = list.get('project') || null;
  const sort = list.oneOf('sort', Object.keys(TRASH_SORTS) as TrashSort[]);
  const openId = list.get('item') || null;
  const setProject = (id: string | null) => list.set({ project: id });
  const [tileSize, setTileSize] = useViewPref<TileSize>('v2.trash.tileSize', 'm', TILE_SIZES);

  // Everything in the bin; the page filters and pages it.
  const bin = useAsyncData(fromLibraries ? fetchLibraryTrash : fetchTrash, [source]);
  const items = useMemo(() => bin.data ?? [], [bin.data]);
  const reload = () => void bin.reload(true);

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
  const { items: pageItems, page: currentPage, pages } = useMemo(() => pageOf(sorted, list.page, pageSize), [sorted, list.page, pageSize]);
  const groups = useMemo(() => groupItems(pageItems, sort, lang), [pageItems, sort, lang]);
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + trashBytes(item), 0), [items]);
  const shownBytes = useMemo(() => sorted.reduce((sum, item) => sum + trashBytes(item), 0), [sorted]);

  // Selection covers the items on the page; it clears whenever the list changes.
  const selection = useSelection(pageItems, (item) => item.id, [q, view, project, sort, currentPage, pageSize]);
  const selectedItems = selection.items;

  const toggleGroup = (group: TrashGroup) => {
    const ids = group.items.map((item) => item.id);
    if (ids.every((id) => selection.isSelected(id))) selection.remove(ids);
    else selection.add(ids);
  };

  // The open item, and the pictures in the lightbox.
  const openItem = openId ? (items.find((item) => item.id === openId) ?? null) : null;
  const openDetails = (item: TrashItem) => list.set({ item: item.id }, { keepPage: true, replace: !!openId });
  const closeDetails = () => list.set({ item: null }, { keepPage: true, replace: true });
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
      list.set({ item: neighbour?.id ?? null }, { keepPage: true, replace: true });
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
        bin.setData((current) => current?.filter((item) => !gone.has(item.id)));
        setLeaving((current) => {
          const next = new Map(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        selection.remove(ids);
      },
      reducedMotion ? 0 : LEAVE_MS,
    );
  };

  const fail = (err: unknown, key: string) => toast.error(errorText(err, t(key)));

  const copy = (text: string) => void copyText(text, t('v2.trash.copied'));

  /** Puts restored items back in the bin, project by project. */
  const undoRestore = async (restored: TrashItem[]) => {
    const byProject = new Map<string, string[]>();
    for (const item of restored) byProject.set(item.projectId, [...(byProject.get(item.projectId) ?? []), item.id]);
    try {
      for (const [parentId, ids] of byProject) await (fromLibraries ? moveLibraryItemsToTrash(parentId, ids) : moveToTrashBatch(parentId, ids));
      toast.success(t('v2.trash.undone', { count: restored.length }));
    } catch (err) {
      fail(err, 'v2.trash.undoFailed');
    }
    reload();
  };

  const restore = async (targets: TrashItem[]) => {
    const restorable = targets.filter((item) => item.projectExists !== false && !leaving.has(item.id));
    const skipped = targets.length - restorable.length;
    if (!restorable.length) {
      toast.info(t(k('cantRestore'), { count: targets.length }));
      return;
    }
    try {
      if (fromLibraries) await restoreLibraryTrash(restorable.map((item) => item.id));
      else if (restorable.length === 1) await restoreTrashItem(restorable[0].id);
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
    toast.success(skipped ? `${message} · ${t(k('skipped'), { count: skipped })}` : message, { action: { label: t('v2.trash.undo'), onClick: () => void undoRestore(restorable) } });
  };

  const deleteForever = async (targets: TrashItem[]) => {
    const ids = targets.map((item) => item.id);
    try {
      if (fromLibraries) await deleteLibraryTrash(ids);
      else if (ids.length === 1) await deleteTrashPermanently(ids[0]);
      else await deleteTrashBatch(ids);
    } catch (err) {
      fail(err, 'v2.trash.deleteFailed');
      reload();
      return;
    }
    leave(ids, 'delete');
    toast.success(t('v2.trash.deleted', { count: ids.length, size: formatBytes(targets.reduce((sum, item) => sum + trashBytes(item), 0)) }));
  };

  const emptyAll = async () => {
    try {
      await (fromLibraries ? emptyLibraryTrash() : emptyTrash());
    } catch (err) {
      fail(err, 'v2.trash.emptyFailed');
      reload();
      return;
    }
    leave(
      items.map((item) => item.id),
      'delete',
    );
    toast.success(t(k('emptied'), { size: formatBytes(totalBytes) }));
  };

  const restorableCount = items.filter((item) => item.projectExists !== false).length;

  const itemMenu = (item: TrashItem): ActionMenuItem[] => {
    const orphan = item.projectExists === false;
    const kind = trashKind(item);
    return [
      { key: 'details', icon: 'info', label: t('v2.project.details'), onSelect: () => openDetails(item) },
      { key: 'select', icon: selection.isSelected(item.id) ? 'check_box' : 'check_box_outline_blank', label: t('v2.project.select'), type: 'checkbox', checked: selection.isSelected(item.id), onSelect: () => selection.toggle(item.id) },
      { key: 'restore', icon: 'restore', label: orphan ? t(k('orphanShort')) : t('v2.trash.restore'), disabled: orphan, divider: true, onSelect: () => void restore([item]) },
      { key: 'project', icon: fromLibraries ? 'photo_library' : 'folder_open', label: t(k('openProject')), hidden: orphan, href: trashParentHref(item) },
      { key: 'filter', icon: 'filter_list', label: t(k('onlyThisProject')), hidden: project === item.projectId, onSelect: () => setProject(item.projectId) },
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
        title: t(k('confirmEmptyTitle')),
        message: t('v2.trash.confirmEmptyMessage', { count: items.length, size: formatBytes(totalBytes) }),
        confirm: t('v2.trash.emptyBin'),
      };
    if (pending.kind === 'restore-all') {
      const skipped = items.length - restorableCount;
      return {
        tone: 'default' as const,
        icon: 'restore',
        title: t('v2.trash.confirmRestoreAllTitle'),
        message: [t(k('confirmRestoreAllMessage'), { count: restorableCount }), skipped ? t(k('skipped'), { count: skipped }) : ''].filter(Boolean).join(' · '),
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
  const clearFilters = () => list.set({ q: null, project: null, kind: null });

  const nav = (
    <SectionNav<View>
      scope="trash"
      label={t('v2.trash.sections')}
      value={view}
      onChange={(next) => list.set({ kind: next })}
      items={VIEWS.filter((value) => value === 'all' || value === view || counts[value] > 0).map((value) => ({ value, label: t(`v2.trash.kinds.${value}`), icon: VIEW_ICONS[value], count: counts[value] }))}
    />
  );

  const tools = (
    <>
      <ListSearch value={q} onChange={list.setQuery} label={t('v2.trash.search')} />
      {projects.length > 1 && (
        <HoverMenuButton
          placement="bottom-end"
          aria-label={t(k('project'))}
          trigger={(p) => <IconButton {...p} icon={SOURCE_ICONS[source]} size="sm" variant={project ? 'tonal' : 'standard'} label={t(k('project'))} />}
        >
          <MenuItem type="radio" icon="folder_copy" checked={!project} onSelect={() => setProject(null)} trailingText={String(items.length)}>
            {t(k('allProjects'))}
          </MenuItem>
          <MenuDivider />
          {projects.map((entry) => (
            <MenuItem key={entry.id} type="radio" icon={fromLibraries ? 'photo_library' : entry.exists ? 'folder' : 'folder_off'} checked={project === entry.id} onSelect={() => setProject(entry.id)} trailingText={String(entry.count)}>
              {entry.name}
            </MenuItem>
          ))}
        </HoverMenuButton>
      )}
      <HoverMenuButton placement="bottom-end" aria-label={t('v2.trash.viewOptions')} trigger={(p) => <IconButton {...p} icon="tune" size="sm" label={t('v2.trash.viewOptions')} />}>
        <MenuGroup label={t('v2.project.sort')}>
          {(Object.keys(TRASH_SORTS) as TrashSort[]).map((value) => (
            <MenuItem key={value} type="radio" icon={TRASH_SORTS[value].icon} checked={sort === value} onSelect={() => list.set({ sort: value })}>
              {t(k(`sorts.${value}`))}
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
      </HoverMenuButton>
    </>
  );

  const chips = (q || project) && (
    <>
      {q && <FilterChip label={`“${q}”`} removeLabel={t('v2.trash.clearSearch')} onRemove={() => list.setQuery('')} />}
      {project && <FilterChip label={projectEntry?.name ?? project} removeLabel={t(k('allProjects'))} onRemove={() => setProject(null)} />}
      <Button variant="text" size="xs" onClick={clearFilters}>
        {t('v2.common.clearFilters')}
      </Button>
    </>
  );

  const selectedOrphans = selectedItems.filter((item) => item.projectExists === false).length;

  return (
    <Page className="v2-trash" density="compact">
      <TrashHero
        items={bin.data ?? null}
        source={source}
        actions={
          items.length > 0 && (
            <>
              <Button variant="filled" icon="restore" emphasized disabled={restorableCount === 0} onClick={() => setPending({ kind: 'restore-all' })}>
                {t('v2.trash.restoreAll')}
              </Button>
              <Button variant="outlined" icon="delete_sweep" className="v2-button-danger" onClick={() => setPending({ kind: 'empty' })}>
                {t('v2.trash.emptyBin')}
              </Button>
            </>
          )
        }
      />

      <Tabs
        className="v2-trash__sources"
        scrollable
        aria-label={t('v2.trash.sourcesLabel')}
        value={source}
        onChange={(next) => list.set({ from: next === 'projects' ? null : next, project: null, item: null, kind: null })}
      >
        {TRASH_SOURCES.map((value) => (
          <Tab key={value} value={value} label={t(`v2.trash.sources.${value}`)} icon={SOURCE_ICONS[value]} inlineIcon />
        ))}
      </Tabs>

      <ListPane
        label={t('trash.title')}
        lead={nav}
        fitKey={view}
        summary={sorted.length > 0 && `${t('v2.project.itemCount', { count: sorted.length })} · ${formatBytes(shownBytes)}`}
        tools={tools}
        below={chips || undefined}
        menuItems={[
          { key: 'restore-all', icon: 'restore', label: t('v2.trash.restoreAll'), disabled: restorableCount === 0, onSelect: () => setPending({ kind: 'restore-all' }) },
          { key: 'refresh', icon: 'refresh', label: t('v2.trash.refresh'), onSelect: reload },
          { key: 'empty', icon: 'delete_sweep', label: t('v2.trash.emptyBin'), danger: true, divider: true, disabled: items.length === 0, onSelect: () => setPending({ kind: 'empty' }) },
        ]}
        loading={bin.loading}
        refreshing={bin.refreshing}
        error={bin.error ? errorText(bin.error, t('v2.trash.loadFailed')) : null}
        onRetry={() => void bin.reload()}
        count={pageItems.length}
        filtered={filtered && items.length > 0}
        onClearFilters={clearFilters}
        noMatches={{ title: t('v2.trash.noMatches'), description: t(k('noMatchesHint')) }}
        empty={{ shape: 'ghostish', icon: 'delete', title: t('v2.trash.emptyTitle'), description: t(k('emptyDescription')) }}
        selection={selection}
        selectionActions={[
          {
            key: 'restore',
            icon: 'restore',
            label: selectedOrphans ? `${t('v2.trash.restore')} · ${t(k('skipped'), { count: selectedOrphans })}` : t('v2.trash.restore'),
            disabled: selectedOrphans === selectedItems.length,
            onClick: () => void restore(selectedItems),
          },
          { key: 'delete', icon: 'delete_forever', label: t('v2.trash.deleteForever'), danger: true, onClick: () => setPending({ kind: 'delete', items: selectedItems }) },
        ]}
        paging={{ page: currentPage, pageSize, total: sorted.length, pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
      >
        <TrashGrid
          groups={groups}
          selectedIds={selection.selected}
          size={tileSize}
          showProject={sort !== 'project'}
          leaving={leaving}
          menuItems={itemMenu}
          onOpen={open}
          onToggle={(item, range) => selection.toggle(item.id, range)}
          onToggleGroup={toggleGroup}
          onRestore={(item) => void restore([item])}
          onDelete={(item) => setPending({ kind: 'delete', items: [item] })}
          onProjectClick={(projectId) => setProject(projectId === project ? null : projectId)}
        />
      </ListPane>

      <TrashItemDialog
        item={openItem}
        items={sorted}
        onNavigate={(item) => list.set({ item: item.id }, { keepPage: true, replace: true })}
        onClose={closeDetails}
        onRestore={(item) => void restore([item])}
        onDelete={(item) => setPending({ kind: 'delete', items: [item] })}
        onCopy={copy}
        onProjectClick={(projectId) => list.set({ project: projectId, item: null })}
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

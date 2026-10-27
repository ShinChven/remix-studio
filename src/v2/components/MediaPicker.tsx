import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLibraries, fetchLibrary, fetchLibraryItems, fetchProject, fetchProjectAlbum, fetchProjects, imageDisplayUrl } from '../../api';
import { getLastMediaPickerSource, setLastMediaPickerSource } from '../../lib/media-picker-memory';
import { projectMediaType } from '../../lib/project-media';
import { Button, Dialog, FilterChip, Icon, MenuButton, MenuItem, Select, Text, useMediaQuery } from '../../m3';
import type { AlbumItem, AlbumItemSort, AspectRatioCount, Library, LibraryItem, LibraryType, Project, ProjectType } from '../../types';
import { kindMeta } from '../ui/entityMeta';
import { KindBadge } from '../ui/KindBadge';
import { EmptyState, LoadingState } from '../ui/Page';
import { PagedFooter, PageSizeSelect } from '../ui/PagedFooter';
import { SearchField } from '../ui/SearchField';
import { Segmented } from '../ui/Toolbar';

export type PickerSourceKind = 'library' | 'album';
export type UniversalPickerSort = AlbumItemSort;

const DEFAULT_ITEM_PAGE_SIZE = 100;

export interface UniversalPickedItem {
  sourceKind: PickerSourceKind;
  sourceId: string;
  sourceName: string;
  itemId: string;
  type: LibraryType;
  title?: string;
  value: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  rawUrl?: string;
  size?: number;
  optimizedSize?: number;
  createdAt?: number;
}

interface PickerSource {
  id: string;
  kind: PickerSourceKind;
  name: string;
  description?: string;
  type: LibraryType;
  itemCount: number;
  createdAt?: number;
}

interface PickerItem extends UniversalPickedItem {
  id: string;
  sourceLabel: string;
  aspectRatio?: string;
  quality?: string;
  resolution?: string;
}

export interface MediaPickerProps {
  isOpen: boolean;
  title?: string;
  allowedTypes?: LibraryType[];
  /** Albums only: list just these project types (a project without one is an image project). */
  projectTypes?: ProjectType[];
  defaultSourceKind?: PickerSourceKind;
  fixedSourceId?: string;
  sourceKinds?: PickerSourceKind[];
  multiple?: boolean;
  enableImageVersionSelection?: boolean;
  memoryKey?: string;
  onClose: () => void;
  onConfirm: (items: UniversalPickedItem[]) => void;
}

const ALL_TYPES: LibraryType[] = ['text', 'image', 'video', 'audio'];
const DEFAULT_SOURCE_KINDS: PickerSourceKind[] = ['library', 'album'];
const typeLabel = (type: LibraryType) => (type === 'text' ? 'Text' : type === 'image' ? 'Image' : type === 'video' ? 'Video' : 'Audio');
const kindLabel = (kind: PickerSourceKind) => (kind === 'library' ? 'Library' : 'Album');
const SORTS: Array<{ value: UniversalPickerSort; label: string; icon: string }> = [
  { value: 'newest', label: 'Newest', icon: 'arrow_downward' },
  { value: 'oldest', label: 'Oldest', icon: 'arrow_upward' },
  { value: 'name-asc', label: 'Name A-Z', icon: 'sort_by_alpha' },
  { value: 'name-desc', label: 'Name Z-A', icon: 'sort_by_alpha' },
];

function cssAspectRatio(value?: string) {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return '1 / 1';
  const w = Number(match[1]);
  const h = Number(match[2]);
  return w && h ? `${w} / ${h}` : '1 / 1';
}

const itemLabel = (item: Pick<PickerItem, 'title' | 'rawUrl' | 'value' | 'itemId'>) => item.title || item.rawUrl || item.value || item.itemId;

function sortSources(items: PickerSource[], sort: UniversalPickerSort) {
  return [...items].sort((a, b) => {
    if (sort === 'name-asc' || sort === 'name-desc') {
      const diff = a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
      return sort === 'name-asc' ? diff : -diff;
    }
    const diff = (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id);
    return sort === 'newest' ? -diff : diff;
  });
}

function librarySortParams(sort: UniversalPickerSort): ['time' | 'name', 'asc' | 'desc'] {
  if (sort === 'oldest') return ['time', 'asc'];
  if (sort === 'name-asc') return ['name', 'asc'];
  if (sort === 'name-desc') return ['name', 'desc'];
  return ['time', 'desc'];
}

function fromLibraryItem(item: LibraryItem, source: PickerSource): PickerItem {
  return {
    sourceKind: 'library',
    sourceId: source.id,
    sourceName: source.name,
    sourceLabel: source.name,
    itemId: item.id,
    id: item.id,
    type: source.type,
    title: item.title,
    value: item.content,
    rawUrl: item.content,
    previewUrl: source.type === 'text' ? undefined : source.type === 'video' ? item.thumbnailUrl : item.thumbnailUrl || item.optimizedUrl || item.content,
    thumbnailUrl: item.thumbnailUrl,
    optimizedUrl: item.optimizedUrl,
    size: item.size,
    createdAt: item.createdAt,
  };
}

function fromAlbumItem(item: AlbumItem, source: PickerSource): PickerItem {
  const text = item.textContent || item.prompt || '';
  return {
    sourceKind: 'album',
    sourceId: source.id,
    sourceName: source.name,
    sourceLabel: source.name,
    itemId: item.id,
    id: item.id,
    type: source.type,
    title: item.prompt || item.textContent || undefined,
    value: source.type === 'text' ? text : item.imageUrl,
    rawUrl: source.type === 'text' ? text : item.imageUrl,
    previewUrl: source.type === 'text' ? undefined : source.type === 'video' ? item.thumbnailUrl : item.thumbnailUrl || item.optimizedUrl || item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    optimizedUrl: item.optimizedUrl,
    size: item.size,
    optimizedSize: item.optimizedSize,
    createdAt: item.createdAt,
    aspectRatio: item.aspectRatio,
    quality: item.quality,
    resolution: item.resolution,
  };
}

function SortMenu({ value, onChange, label }: { value: UniversalPickerSort; onChange: (v: UniversalPickerSort) => void; label: string }) {
  const current = SORTS.find((s) => s.value === value) ?? SORTS[0];
  return (
    <MenuButton
      aria-label={label}
      trigger={(props) => (
        <Button {...props} variant="outlined" size="xs" icon={current.icon} trailingIcon="arrow_drop_down">
          {current.label}
        </Button>
      )}
    >
      {SORTS.map((s) => (
        <MenuItem key={s.value} icon={s.icon} type="radio" checked={s.value === value} onSelect={() => onChange(s.value)}>
          {s.label}
        </MenuItem>
      ))}
    </MenuButton>
  );
}

/** Aspect ratio filter for album items, with the count of each ratio. */
export function AspectRatioMenu({ options, selected, onChange }: { options: AspectRatioCount[]; selected: string[]; onChange: (ratios: string[]) => void }) {
  const { t } = useTranslation();
  const active = selected.length > 0;
  return (
    <MenuButton
      aria-label={t('projectViewer.album.aspectRatioFilter')}
      trigger={(props) => (
        <Button {...props} variant={active ? 'tonal' : 'outlined'} size="xs" icon="filter_list" trailingIcon="arrow_drop_down">
          {active ? t('projectViewer.album.aspectRatioFilterCount', { count: selected.length }) : t('projectViewer.album.aspectRatioFilter')}
        </Button>
      )}
    >
      <MenuItem icon="select_all" selected={!active} onSelect={() => onChange([])}>
        {t('projectViewer.album.allAspectRatios')}
      </MenuItem>
      {options.map(({ ratio, count }) => (
        <MenuItem
          key={ratio}
          type="checkbox"
          keepOpen
          checked={selected.includes(ratio)}
          trailingText={String(count)}
          onSelect={() => onChange(selected.includes(ratio) ? selected.filter((r) => r !== ratio) : [...selected, ratio])}
        >
          {ratio}
        </MenuItem>
      ))}
    </MenuButton>
  );
}

/**
 * Picks items from libraries and project albums: sources on the side (a menu on phones), then a
 * paged, searchable grid. Single mode picks on click; multiple mode collects a selection.
 */
export function MediaPicker({
  isOpen,
  title = 'Media Picker',
  allowedTypes = ALL_TYPES,
  projectTypes,
  defaultSourceKind = 'library',
  fixedSourceId,
  sourceKinds = DEFAULT_SOURCE_KINDS,
  multiple = true,
  enableImageVersionSelection = false,
  memoryKey,
  onClose,
  onConfirm,
}: MediaPickerProps) {
  const { t } = useTranslation();
  const compact = useMediaQuery('(max-width: 839.98px)');
  const allowedKey = allowedTypes.join('|');
  const kindsKey = sourceKinds.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enabledTypes = useMemo(() => new Set(allowedTypes), [allowedKey]);
  const projectTypeKey = projectTypes?.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectTypeSet = useMemo(() => (projectTypes ? new Set<string>(projectTypes) : null), [projectTypeKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enabledKinds = useMemo(() => sourceKinds.filter((k) => DEFAULT_SOURCE_KINDS.includes(k)), [kindsKey]);
  const memoryEnabled = !!memoryKey && !fixedSourceId;
  const remembered = useMemo(() => (memoryEnabled && isOpen ? getLastMediaPickerSource(memoryKey!) : null), [memoryEnabled, memoryKey, isOpen]);
  const preferredKind = remembered && enabledKinds.includes(remembered.kind) ? remembered.kind : defaultSourceKind;
  const initialKind = enabledKinds.includes(preferredKind) ? preferredKind : enabledKinds[0] || 'library';
  const initialSourceId = fixedSourceId || (remembered && remembered.kind === initialKind ? remembered.sourceId : null);

  const [activeKind, setActiveKind] = useState<PickerSourceKind>(initialKind);
  const [selectedTypes, setSelectedTypes] = useState<Set<LibraryType>>(() => new Set(allowedTypes));
  const [sourceQuery, setSourceQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sourceSort, setSourceSort] = useState<UniversalPickerSort>('newest');
  const [itemSort, setItemSort] = useState<UniversalPickerSort>('newest');
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [ratioCounts, setRatioCounts] = useState<AspectRatioCount[]>([]);
  const [ratios, setRatios] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedMap, setSelectedMap] = useState<Record<string, PickerItem>>({});
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState<number | 'all'>(DEFAULT_ITEM_PAGE_SIZE);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemPages, setItemPages] = useState(1);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState<'raw' | 'optimized'>('optimized');

  useEffect(() => {
    if (!isOpen) return;
    setActiveKind(initialKind);
    setSelectedTypes(new Set(allowedTypes));
    setSourceQuery('');
    setItemQuery('');
    setDebouncedQuery('');
    setActiveSourceId(initialSourceId);
    setSelectedKeys(new Set());
    setSelectedMap({});
    setItems([]);
    setRatioCounts([]);
    setRatios([]);
    setImageVersion('optimized');
    setItemPage(1);
    setItemTotal(0);
    setItemPages(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKey, initialKind, initialSourceId, isOpen, fixedSourceId]);

  // Each tab loads its sources the first time it shows during an opening.
  const loadedKinds = useRef(new Set<PickerSourceKind>());
  useEffect(() => {
    if (!isOpen) {
      loadedKinds.current.clear();
      return;
    }
    const kind = fixedSourceId ? initialKind : activeKind;
    if (loadedKinds.current.has(kind)) {
      setLoadingSources(false);
      return;
    }
    loadedKinds.current.add(kind);
    let cancelled = false;
    let done = false;
    (async () => {
      setLoadingSources(true);
      try {
        if (fixedSourceId) {
          if (initialKind === 'library') {
            const lib = await fetchLibrary(fixedSourceId).catch(() => null);
            if (!cancelled && lib) setLibraries([lib]);
          } else {
            const [proj, albumPage] = await Promise.all([fetchProject(fixedSourceId).catch(() => null), fetchProjectAlbum(fixedSourceId, { limit: 1 }).catch(() => null)]);
            if (!cancelled && proj) setProjects([{ ...proj, album: albumPage?.items || [], albumCount: albumPage?.total ?? proj.albumCount }]);
          }
        } else if (kind === 'library') {
          const result = await fetchLibraries(1, 500, undefined, false);
          if (!cancelled) setLibraries(result.items || []);
        } else {
          const result = await fetchProjects(1, 500, undefined, 'all', false, true);
          if (!cancelled) setProjects(result.items || []);
        }
        done = true;
      } finally {
        if (!cancelled) setLoadingSources(false);
      }
    })();
    return () => {
      cancelled = true;
      if (!done) loadedKinds.current.delete(kind);
    };
  }, [activeKind, isOpen, fixedSourceId, initialKind]);

  const librarySources = useMemo<PickerSource[]>(
    () =>
      libraries
        .filter((l) => fixedSourceId === l.id || enabledTypes.has(l.type))
        .map((l) => ({ id: l.id, kind: 'library' as const, name: l.name, description: l.description, type: l.type, itemCount: l.itemCount ?? l.items?.length ?? 0, createdAt: l.createdAt })),
    [enabledTypes, libraries, fixedSourceId],
  );
  const albumSources = useMemo<PickerSource[]>(
    () =>
      projects
        .filter(
          (p) =>
            fixedSourceId === p.id ||
            (enabledTypes.has(projectMediaType(p) as LibraryType) && (!projectTypeSet || projectTypeSet.has(p.type || 'image')) && (p.albumCount ?? p.album?.length ?? 0) > 0),
        )
        .map((p) => ({
          id: p.id,
          kind: 'album' as const,
          name: p.name,
          description: p.description,
          type: projectMediaType(p) as LibraryType,
          itemCount: p.albumCount ?? p.album?.length ?? 0,
          createdAt: p.createdAt,
        })),
    [enabledTypes, projectTypeSet, projects, fixedSourceId],
  );

  const sources = activeKind === 'library' ? librarySources : albumSources;
  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    return sortSources(
      sources.filter((s) => fixedSourceId === s.id || (selectedTypes.has(s.type) && (!q || s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)))),
      sourceSort,
    );
  }, [sourceQuery, sourceSort, selectedTypes, sources, fixedSourceId]);

  const activeSource = useMemo(() => filteredSources.find((s) => s.id === activeSourceId) || filteredSources[0] || null, [activeSourceId, filteredSources]);

  useEffect(() => {
    setActiveSourceId((current) => {
      if (loadingSources && current) return current;
      if (current && filteredSources.some((s) => s.id === current)) return current;
      return filteredSources[0]?.id || null;
    });
  }, [filteredSources, loadingSources]);

  useEffect(() => {
    setRatios((current) => (current.length === 0 ? current : []));
    setRatioCounts([]);
  }, [activeSource?.id, activeSource?.kind]);

  useEffect(() => {
    if (!isOpen || !memoryEnabled || !activeSource) return;
    setLastMediaPickerSource(memoryKey!, { kind: activeSource.kind, sourceId: activeSource.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, memoryEnabled, memoryKey, activeSource?.id, activeSource?.kind]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(itemQuery.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [itemQuery]);

  useEffect(() => {
    setItemPage(1);
  }, [activeSource?.id, activeSource?.kind, debouncedQuery, itemSort, itemPageSize, ratios]);

  const typeAllowed = !!activeSource && selectedTypes.has(activeSource.type);
  const itemLimit = itemPageSize === 'all' ? 999999 : itemPageSize;

  useEffect(() => {
    if (!isOpen || !activeSource || !typeAllowed) {
      setItems([]);
      setItemTotal(0);
      setItemPages(1);
      if (!activeSource) setRatioCounts([]);
      return;
    }
    let cancelled = false;
    const source = activeSource;
    (async () => {
      setLoadingItems(true);
      try {
        if (source.kind === 'library') {
          const [sortBy, sortOrder] = librarySortParams(itemSort);
          const result = await fetchLibraryItems(source.id, itemPage, itemLimit, debouncedQuery || undefined, [], sortBy, sortOrder);
          if (cancelled) return;
          setItems((result.items || []).map((item) => fromLibraryItem(item, source)));
          setItemTotal(result.total ?? 0);
          setItemPages(Math.max(1, result.pages ?? 1));
          setRatioCounts([]);
        } else {
          const result = await fetchProjectAlbum(source.id, {
            page: itemPage,
            limit: itemLimit,
            sort: itemSort,
            aspectRatios: ratios.length > 0 ? ratios : undefined,
            q: debouncedQuery || undefined,
          });
          if (cancelled) return;
          setItems((result.items || []).filter((item) => (source.type === 'text' ? item.textContent || item.prompt : item.imageUrl)).map((item) => fromAlbumItem(item, source)));
          setItemTotal(result.total ?? 0);
          setItemPages(Math.max(1, result.pages ?? 1));
          setRatioCounts(result.aspectRatioCounts || []);
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource?.id, activeSource?.kind, activeSource?.type, isOpen, typeAllowed, itemPage, itemLimit, itemSort, debouncedQuery, ratios]);

  const keyOf = (item: PickerItem) => `${item.sourceKind}:${item.sourceId}:${item.itemId}`;
  const keys = useMemo(() => items.map(keyOf), [items]);
  const byKey = useMemo(() => new Map(items.map((item) => [keyOf(item), item])), [items]);
  const selectedItems = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0 }), []);
  const allSelected = keys.length > 0 && keys.every((k) => selectedKeys.has(k));
  const showVersion = enableImageVersionSelection && activeSource?.kind === 'album' && activeSource.type === 'image';
  const showRatios = activeSource?.kind === 'album' && (activeSource.type === 'image' || activeSource.type === 'video') && ratioCounts.length > 0;

  const resolve = (item: PickerItem): UniversalPickedItem => {
    if (!enableImageVersionSelection || item.sourceKind !== 'album' || item.type !== 'image') return item;
    if (imageVersion === 'optimized' && item.optimizedUrl) return { ...item, value: item.optimizedUrl, size: item.optimizedSize ?? item.size };
    return { ...item, value: item.rawUrl || item.value, size: item.size };
  };

  const resetSelection = () => {
    setSelectedKeys(new Set());
    setSelectedMap({});
  };

  const toggleType = (type: LibraryType) => {
    if (!enabledTypes.has(type)) return;
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type) && next.size > 1) next.delete(type);
      else next.add(type);
      return next;
    });
    resetSelection();
  };

  const switchKind = (kind: PickerSourceKind) => {
    setActiveKind(kind);
    setActiveSourceId(null);
    setItems([]);
    resetSelection();
  };

  const applyKeys = (next: Set<string>) => {
    setSelectedKeys(next);
    setSelectedMap((current) => {
      const map = { ...current };
      Object.keys(map).forEach((k) => {
        if (!next.has(k)) delete map[k];
      });
      next.forEach((k) => {
        const item = byKey.get(k);
        if (item) map[k] = item;
      });
      return map;
    });
  };

  const toggleItem = (key: string, shift: boolean) => {
    if (!multiple) {
      const item = byKey.get(key);
      if (!item) return;
      onConfirm([resolve(item)]);
      onClose();
      return;
    }
    const next = new Set(selectedKeys);
    if (shift && lastKey && lastKey !== key) {
      const a = keys.indexOf(lastKey);
      const b = keys.indexOf(key);
      if (a !== -1 && b !== -1) {
        const select = !next.has(key);
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
          if (select) next.add(keys[i]);
          else next.delete(keys[i]);
        }
      }
    } else if (next.has(key)) next.delete(key);
    else next.add(key);
    applyKeys(next);
    setLastKey(key);
  };

  const toggleAll = () => {
    if (!multiple) return;
    const next = new Set(selectedKeys);
    if (allSelected) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    applyKeys(next);
  };

  const submit = () => {
    if (selectedItems.length === 0) return;
    onConfirm(selectedItems.map(resolve));
    onClose();
  };

  const typeChips = enabledTypes.size > 1 && (
    <div className="flex flex-wrap gap-2">
      {ALL_TYPES.filter((type) => enabledTypes.has(type)).map((type) => (
        <FilterChip key={type} label={typeLabel(type)} icon={kindMeta(type).icon} selected={selectedTypes.has(type)} onClick={() => toggleType(type)} />
      ))}
    </div>
  );
  const kindSwitch = enabledKinds.length > 1 && (
    <Segmented<PickerSourceKind> value={activeKind} onChange={switchKind} options={enabledKinds.map((k) => ({ value: k, label: kindLabel(k) }))} fullWidth={!compact} />
  );

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullScreen="compact"
      headline={title}
      maxWidth={1280}
      className="v2-picker"
      confirmAction={
        multiple ? (
          <Button variant="filled" icon="check" disabled={selectedItems.length === 0} onClick={submit}>
            Add
          </Button>
        ) : undefined
      }
      actions={
        <div className="flex w-full items-center justify-between gap-3">
          <Text variant="body-medium" className="text-on-surface-variant">
            {multiple ? (
              <>
                <strong className="text-on-surface">{selectedItems.length}</strong> selected
              </>
            ) : (
              'Click any item above to select it.'
            )}
          </Text>
          <div className="flex gap-2">
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            {multiple && (
              <Button variant="filled" icon="check_circle" disabled={selectedItems.length === 0} onClick={submit}>
                Add Selected
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="v2-picker__body" data-density="compact">
        {!fixedSourceId && !compact && (
          <aside className="v2-picker__sources">
            {kindSwitch}
            {typeChips}
            <SearchField shape="field" value={sourceQuery} onChange={setSourceQuery} placeholder={`Search ${activeKind === 'library' ? 'libraries' : 'projects'}...`} />
            <SortMenu value={sourceSort} onChange={setSourceSort} label={`Sort ${activeKind}`} />
            <div className="v2-picker__source-list">
              {loadingSources ? (
                <LoadingState minHeight={160} />
              ) : filteredSources.length === 0 ? (
                <EmptyState size="inline" icon="search" title="No matches found" />
              ) : (
                filteredSources.map((source) => (
                  <button
                    key={`${source.kind}:${source.id}`}
                    type="button"
                    className="v2-picker__source m3-focus-ring"
                    data-active={source.id === activeSource?.id ? '' : undefined}
                    onClick={() => setActiveSourceId(source.id)}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <Text as="span" variant="label-large" emphasized className="truncate">
                        {source.name}
                      </Text>
                      <KindBadge kind={source.type} size={24} />
                    </span>
                    <Text as="span" variant="body-small" className="line-clamp-2 opacity-75">
                      {source.description || `${source.itemCount} items`}
                    </Text>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        <section className="v2-picker__main">
          <Text variant="label-small" className="truncate uppercase tracking-widest text-on-surface-variant">
            {activeSource ? `${kindLabel(activeSource.kind)} / ${activeSource.name} · ${activeSource.itemCount} items` : 'No source selected'}
          </Text>
          {!fixedSourceId && compact && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {kindSwitch}
                <Select
                  variant="outlined"
                  aria-label={`Select ${activeKind}`}
                  value={activeSource?.id ?? null}
                  placeholder="Select source..."
                  onChange={setActiveSourceId}
                  options={filteredSources.map((s) => ({ value: s.id, label: s.name }))}
                  className="min-w-0 flex-1"
                  fullWidth
                />
              </div>
              {typeChips}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <SearchField shape="field" value={itemQuery} onChange={setItemQuery} placeholder="Search items..." className="min-w-[8rem] flex-1" />
            {showVersion && (
              <Segmented<'raw' | 'optimized'>
                aria-label={t('projectViewer.copyToLibrary.versionToCopy')}
                value={imageVersion}
                onChange={setImageVersion}
                options={(['optimized', 'raw'] as const).map((v) => ({ value: v, label: t(`projectViewer.copyToLibrary.${v}`) }))}
              />
            )}
            {showRatios && <AspectRatioMenu options={ratioCounts} selected={ratios} onChange={setRatios} />}
            <SortMenu value={itemSort} onChange={setItemSort} label="Sort items" />
            <PageSizeSelect
              aria-label="Items per page"
              value={itemPageSize}
              onChange={(size) => {
                setItemPageSize(size);
                scrollTop();
              }}
            />
            {multiple && (
              <Button variant={allSelected ? 'tonal' : 'outlined'} size="xs" icon={allSelected ? 'deselect' : 'select_all'} onClick={toggleAll}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>

          <div ref={scrollRef} className="v2-picker__grid-scroll">
            {!activeSource ? (
              <EmptyState icon="layers" title="No source selected" description="Choose a library or album first." />
            ) : loadingItems ? (
              <LoadingState label="Loading items..." />
            ) : items.length === 0 ? (
              <EmptyState icon="search" title="No items found" description="Try a different filter or search." />
            ) : (
              <div className="v2-picker__grid">
                {items.map((item) => {
                  const key = keyOf(item);
                  const selected = selectedKeys.has(key);
                  return (
                    <button key={key} type="button" className="v2-pick m3-focus-ring" data-selected={selected ? '' : undefined} onClick={(e) => toggleItem(key, e.shiftKey)}>
                      {item.type === 'text' ? (
                        <span className="v2-pick__text">
                          <span className="flex items-center gap-1 text-on-surface-variant">
                            <Icon name="notes" size={14} />
                            <Text as="span" variant="label-small" className="uppercase">
                              Text
                            </Text>
                          </span>
                          <Text as="span" variant="body-small" className="line-clamp-5">
                            {item.value}
                          </Text>
                        </span>
                      ) : item.type === 'audio' ? (
                        <span className="v2-pick__media v2-pick__media--audio">
                          <Icon name="music_note" size={36} />
                        </span>
                      ) : (
                        <span className="v2-pick__media" style={{ aspectRatio: cssAspectRatio(item.aspectRatio) }}>
                          {item.previewUrl ? <img src={imageDisplayUrl(item.previewUrl)} alt={item.title || item.itemId} loading="lazy" /> : <KindBadge kind={item.type} size={48} />}
                        </span>
                      )}
                      <span className="v2-pick__caption">
                        <Text as="span" variant="label-medium" emphasized className="truncate">
                          {itemLabel(item)}
                        </Text>
                      </span>
                      {selected && (
                        <span className="v2-pick__check">
                          <Icon name="check" size={18} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {activeSource && (
            <PagedFooter
              page={itemPage}
              pageSize={itemPageSize}
              total={itemTotal}
              pages={itemPages}
              onPageChange={(p) => {
                setItemPage(p);
                scrollTop();
              }}
              onPageSizeChange={(size) => {
                setItemPageSize(size);
                scrollTop();
              }}
            />
          )}
        </section>
      </div>
    </Dialog>
  );
}

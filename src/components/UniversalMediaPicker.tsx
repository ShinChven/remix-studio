import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowUpAZ,
  ArrowUpNarrowWide,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Images,
  Layers,
  Loader2,
  Music,
  Search,
  Video,
  X,
} from 'lucide-react';
import { fetchLibraries, fetchLibraryItems, fetchProject, fetchProjects, imageDisplayUrl } from '../api';
import { AlbumItem, Library, LibraryItem, LibraryType, Project } from '../types';
import { cn } from '../lib/utils';

export type PickerSourceKind = 'library' | 'album';
export type UniversalPickerSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

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

interface UniversalMediaPickerProps {
  isOpen: boolean;
  title?: string;
  allowedTypes?: LibraryType[];
  defaultSourceKind?: PickerSourceKind;
  sourceKinds?: PickerSourceKind[];
  multiple?: boolean;
  onClose: () => void;
  onConfirm: (items: UniversalPickedItem[]) => void;
}

const ALL_TYPES: LibraryType[] = ['text', 'image', 'video', 'audio'];
const DEFAULT_SOURCE_KINDS: PickerSourceKind[] = ['library', 'album'];

function typeLabel(type: LibraryType) {
  if (type === 'text') return 'Text';
  if (type === 'image') return 'Image';
  if (type === 'video') return 'Video';
  return 'Audio';
}

function typeIcon(type: LibraryType) {
  if (type === 'text') return FileText;
  if (type === 'image') return ImageIcon;
  if (type === 'video') return Video;
  return Music;
}

function sourceKindLabel(kind: PickerSourceKind) {
  return kind === 'library' ? 'Library' : 'Album';
}

function getCssAspectRatio(value?: string) {
  const ratio = value?.trim();
  if (!ratio) return '1 / 1';
  const match = ratio.match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return '1 / 1';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return '1 / 1';
  return `${width} / ${height}`;
}

function itemLabel(item: Pick<PickerItem, 'title' | 'rawUrl' | 'value' | 'itemId'>) {
  return item.title || item.rawUrl || item.value || item.itemId;
}

function sortByChoice<T extends { id: string; name?: string; title?: string; rawUrl?: string; value?: string; createdAt?: number }>(
  items: T[],
  sort: UniversalPickerSort,
) {
  return [...items].sort((a, b) => {
    if (sort === 'name-asc' || sort === 'name-desc') {
      const aName = (a.name || a.title || a.rawUrl || a.value || a.id).trim();
      const bName = (b.name || b.title || b.rawUrl || b.value || b.id).trim();
      const diff = aName.localeCompare(bName, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
      return sort === 'name-asc' ? diff : -diff;
    }

    const diff = (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id);
    return sort === 'newest' ? -diff : diff;
  });
}

function libraryItemToPickerItem(item: LibraryItem, source: PickerSource): PickerItem {
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
    previewUrl: source.type === 'text' ? undefined : source.type === 'video' ? item.thumbnailUrl : (item.thumbnailUrl || item.optimizedUrl || item.content),
    thumbnailUrl: item.thumbnailUrl,
    optimizedUrl: item.optimizedUrl,
    size: item.size,
    createdAt: item.createdAt,
  };
}

function albumItemToPickerItem(item: AlbumItem, source: PickerSource): PickerItem {
  const textValue = item.textContent || item.prompt || '';
  return {
    sourceKind: 'album',
    sourceId: source.id,
    sourceName: source.name,
    sourceLabel: source.name,
    itemId: item.id,
    id: item.id,
    type: source.type,
    title: item.prompt || item.textContent || undefined,
    value: source.type === 'text' ? textValue : item.imageUrl,
    rawUrl: source.type === 'text' ? textValue : item.imageUrl,
    previewUrl: source.type === 'text' ? undefined : source.type === 'video' ? item.thumbnailUrl : (item.thumbnailUrl || item.optimizedUrl || item.imageUrl),
    thumbnailUrl: item.thumbnailUrl,
    optimizedUrl: item.optimizedUrl,
    size: item.size,
    createdAt: item.createdAt,
    aspectRatio: item.aspectRatio,
    quality: item.quality,
    resolution: item.resolution,
  };
}

export function UniversalMediaPicker({
  isOpen,
  title = 'Media Picker',
  allowedTypes = ALL_TYPES,
  defaultSourceKind = 'library',
  sourceKinds = DEFAULT_SOURCE_KINDS,
  multiple = true,
  onClose,
  onConfirm,
}: UniversalMediaPickerProps) {
  const enabledTypeSet = useMemo(() => new Set(allowedTypes), [allowedTypes]);
  const enabledKinds = useMemo(() => sourceKinds.filter((kind) => DEFAULT_SOURCE_KINDS.includes(kind)), [sourceKinds]);
  const initialKind = enabledKinds.includes(defaultSourceKind) ? defaultSourceKind : (enabledKinds[0] || 'library');

  const [activeKind, setActiveKind] = useState<PickerSourceKind>(initialKind);
  const [selectedTypes, setSelectedTypes] = useState<Set<LibraryType>>(() => new Set(allowedTypes));
  const [sourceQuery, setSourceQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [sourceSort, setSourceSort] = useState<UniversalPickerSort>('newest');
  const [itemSort, setItemSort] = useState<UniversalPickerSort>('newest');
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedItemMap, setSelectedItemMap] = useState<Record<string, PickerItem>>({});
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveKind(initialKind);
    setSelectedTypes(new Set(allowedTypes));
    setSourceQuery('');
    setItemQuery('');
    setActiveSourceId(null);
    setSelectedKeys(new Set());
    setSelectedItemMap({});
    setItems([]);
  }, [allowedTypes, initialKind, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function loadSources() {
      setLoadingSources(true);
      try {
        const tasks: Promise<void>[] = [];
        if (enabledKinds.includes('library')) {
          tasks.push(fetchLibraries(1, 500, undefined, false).then((result) => {
            if (!cancelled) setLibraries(result.items || []);
          }));
        }
        if (enabledKinds.includes('album')) {
          tasks.push(fetchProjects(1, 500, undefined, 'all').then((result) => {
            if (!cancelled) setProjects(result.items || []);
          }));
        }
        await Promise.all(tasks);
      } finally {
        if (!cancelled) setLoadingSources(false);
      }
    }

    void loadSources();
    return () => {
      cancelled = true;
    };
  }, [enabledKinds, isOpen]);

  const librarySources = useMemo<PickerSource[]>(() => (
    libraries
      .filter((library) => enabledTypeSet.has(library.type))
      .map((library) => ({
        id: library.id,
        kind: 'library' as const,
        name: library.name,
        description: library.description,
        type: library.type,
        itemCount: library.itemCount ?? library.items?.length ?? 0,
        createdAt: library.createdAt,
      }))
  ), [enabledTypeSet, libraries]);

  const albumSources = useMemo<PickerSource[]>(() => (
    projects
      .filter((project) => enabledTypeSet.has((project.type || 'image') as LibraryType) && ((project as any).albumCount ?? project.album?.length ?? 0) > 0)
      .map((project) => ({
        id: project.id,
        kind: 'album' as const,
        name: project.name,
        description: project.description,
        type: (project.type || 'image') as LibraryType,
        itemCount: (project as any).albumCount ?? project.album?.length ?? 0,
        createdAt: project.createdAt,
      }))
  ), [enabledTypeSet, projects]);

  const sources = activeKind === 'library' ? librarySources : albumSources;
  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    const visibleSources = sources.filter((source) => {
      if (!selectedTypes.has(source.type)) return false;
      return !q || source.name.toLowerCase().includes(q) || source.description?.toLowerCase().includes(q);
    });
    return sortByChoice(visibleSources, sourceSort);
  }, [sourceQuery, sourceSort, selectedTypes, sources]);

  const activeSource = useMemo(
    () => filteredSources.find((source) => source.id === activeSourceId) || filteredSources[0] || null,
    [activeSourceId, filteredSources],
  );

  useEffect(() => {
    setActiveSourceId((current) => {
      if (current && filteredSources.some((source) => source.id === current)) return current;
      return filteredSources[0]?.id || null;
    });
  }, [filteredSources]);

  useEffect(() => {
    if (!isOpen || !activeSource) {
      setItems([]);
      return;
    }

    let cancelled = false;
    async function loadItems() {
      setLoadingItems(true);
      try {
        if (activeSource.kind === 'library') {
          const result = await fetchLibraryItems(activeSource.id, 1, 500);
          if (!cancelled) setItems((result.items || []).map((item) => libraryItemToPickerItem(item, activeSource)));
        } else {
          const project = await fetchProject(activeSource.id);
          if (!cancelled) {
            setItems((project.album || [])
              .filter((item) => activeSource.type === 'text' ? (item.textContent || item.prompt) : item.imageUrl)
              .map((item) => albumItemToPickerItem(item, activeSource)));
          }
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }

    void loadItems();
    return () => {
      cancelled = true;
    };
  }, [activeSource?.id, activeSource?.kind, activeSource?.type, isOpen]);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    const visibleItems = items.filter((item) => {
      if (!selectedTypes.has(item.type)) return false;
      return !q || (
        item.title?.toLowerCase().includes(q) ||
        item.sourceLabel.toLowerCase().includes(q) ||
        item.rawUrl?.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q)
      );
    });
    return sortByChoice(visibleItems, itemSort);
  }, [itemQuery, itemSort, items, selectedTypes]);

  const filteredKeys = useMemo(
    () => filteredItems.map((item) => `${item.sourceKind}:${item.sourceId}:${item.itemId}`),
    [filteredItems],
  );
  const filteredItemByKey = useMemo(
    () => new Map(filteredItems.map((item) => [`${item.sourceKind}:${item.sourceId}:${item.itemId}`, item])),
    [filteredItems],
  );

  const selectedItems = useMemo(() => Object.values(selectedItemMap), [selectedItemMap]);

  const allFilteredSelected = filteredKeys.length > 0 && filteredKeys.every((key) => selectedKeys.has(key));

  const toggleType = (type: LibraryType) => {
    if (!enabledTypeSet.has(type)) return;
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type) && next.size > 1) next.delete(type);
      else next.add(type);
      return next;
    });
    setSelectedKeys(new Set());
    setSelectedItemMap({});
  };

  const toggleItem = (key: string, shiftKey: boolean) => {
    const nextKeys = new Set(selectedKeys);
    if (shiftKey && multiple && lastSelectedKey && lastSelectedKey !== key) {
      const lastIndex = filteredKeys.indexOf(lastSelectedKey);
      const currentIndex = filteredKeys.indexOf(key);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const shouldSelect = !nextKeys.has(key);
        for (let index = start; index <= end; index += 1) {
          if (shouldSelect) nextKeys.add(filteredKeys[index]);
          else nextKeys.delete(filteredKeys[index]);
        }
      }
    } else if (multiple) {
      if (nextKeys.has(key)) nextKeys.delete(key);
      else nextKeys.add(key);
    } else {
      nextKeys.clear();
      nextKeys.add(key);
    }

    setSelectedKeys(nextKeys);
    setSelectedItemMap((current) => {
      const nextMap = multiple ? { ...current } : {};
      Object.keys(nextMap).forEach((existingKey) => {
        if (!nextKeys.has(existingKey)) delete nextMap[existingKey];
      });
      nextKeys.forEach((selectedKey) => {
        const item = filteredItemByKey.get(selectedKey);
        if (item) nextMap[selectedKey] = item;
      });
      return nextMap;
    });
    setLastSelectedKey(key);
  };

  const toggleSelectAll = () => {
    if (!multiple) return;
    const nextKeys = new Set(selectedKeys);
    if (allFilteredSelected) filteredKeys.forEach((key) => nextKeys.delete(key));
    else filteredKeys.forEach((key) => nextKeys.add(key));
    setSelectedKeys(nextKeys);
    setSelectedItemMap((current) => {
      const nextMap = { ...current };
      if (allFilteredSelected) {
        filteredKeys.forEach((key) => delete nextMap[key]);
      } else {
        filteredKeys.forEach((key) => {
          const item = filteredItemByKey.get(key);
          if (item) nextMap[key] = item;
        });
      }
      return nextMap;
    });
  };

  const submit = () => {
    if (selectedItems.length === 0) return;
    onConfirm(selectedItems);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[650] flex items-center justify-center p-3 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative flex h-[88vh] w-full max-w-7xl overflow-hidden rounded-card border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80 p-5 dark:border-white/10 dark:bg-neutral-900/80 md:flex">
          <div className="mb-4 flex shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Images className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-950 dark:text-white">{title}</h3>
              <p className="text-xs text-neutral-500">Pick from libraries or albums</p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            {enabledKinds.map((kind) => (
              <button
                key={kind}
                onClick={() => {
                  setActiveKind(kind);
                  setActiveSourceId(null);
                  setItems([]);
                  setSelectedKeys(new Set());
                  setSelectedItemMap({});
                }}
                className={cn(
                  'h-9 rounded-lg border text-xs font-bold transition',
                  activeKind === kind
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:text-neutral-950 dark:border-white/10 dark:bg-neutral-950 dark:hover:text-white',
                )}
              >
                {sourceKindLabel(kind)}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {ALL_TYPES.filter((type) => enabledTypeSet.has(type)).map((type) => {
              const Icon = typeIcon(type);
              const selected = selectedTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-black uppercase tracking-widest transition',
                    selected
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                      : 'border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-neutral-950',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {typeLabel(type)}
                </button>
              );
            })}
          </div>

          <div className="mb-4 shrink-0">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                placeholder={`Search ${activeKind === 'library' ? 'libraries' : 'projects'}...`}
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
              />
            </div>
            <SortSelect value={sourceSort} onChange={setSourceSort} compact ariaLabel={`Sort ${activeKind}`} />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loadingSources ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
              </div>
            ) : filteredSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-10 text-center dark:border-white/10">
                <Search className="mb-3 h-8 w-8 text-neutral-300" />
                <p className="px-4 text-xs font-bold text-neutral-950 dark:text-white">No matches found</p>
              </div>
            ) : filteredSources.map((source) => {
              const Icon = typeIcon(source.type);
              const active = source.id === activeSource?.id;
              return (
                <button
                  key={`${source.kind}:${source.id}`}
                  className={cn(
                    'w-full rounded-card border p-4 text-left transition',
                    active
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-white/10 dark:bg-neutral-950 dark:hover:border-white/20',
                  )}
                  onClick={() => setActiveSourceId(source.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-bold text-neutral-950 dark:text-white">{source.name}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500 dark:bg-white/10">
                      <Icon className="h-3 w-3" /> {typeLabel(source.type)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{source.description || `${source.itemCount} items`}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-4 dark:border-white/10 md:p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                {activeSource ? `${sourceKindLabel(activeSource.kind)} / ${activeSource.name} · ${activeSource.itemCount} items` : 'No source selected'}
              </p>
              <h2 className="mt-1 text-lg font-bold text-neutral-950 dark:text-white md:text-xl">{title}</h2>
              <p className="mt-1 text-sm text-neutral-500">Use filters and sorting to find the item you need.</p>
            </div>
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-white/10 md:hidden">
            <div className="grid grid-cols-2 gap-2">
              {enabledKinds.map((kind) => (
                <button
                  key={kind}
                  onClick={() => {
                    setActiveKind(kind);
                    setActiveSourceId(null);
                    setItems([]);
                    setSelectedKeys(new Set());
                    setSelectedItemMap({});
                  }}
                  className={cn(
                    'h-10 rounded-xl border text-sm font-bold transition',
                    activeKind === kind
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-neutral-900',
                  )}
                >
                  {sourceKindLabel(kind)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_TYPES.filter((type) => enabledTypeSet.has(type)).map((type) => {
                const selected = selectedTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={cn(
                      'h-8 rounded-lg border px-2 text-[10px] font-black uppercase tracking-widest transition',
                      selected
                        ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                        : 'border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-neutral-900',
                    )}
                  >
                    {typeLabel(type)}
                  </button>
                );
              })}
            </div>
            <select
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-neutral-900 dark:text-white"
              value={activeSource?.id || ''}
              onChange={(event) => setActiveSourceId(event.target.value)}
            >
              {!activeSource && <option value="">Select source...</option>}
              {filteredSources.map((source) => (
                <option key={`${source.kind}:${source.id}`} value={source.id}>{source.name}</option>
              ))}
            </select>
            <SortSelect value={sourceSort} onChange={setSourceSort} ariaLabel="Sort sources" />
          </div>

          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 dark:border-white/10 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-900 dark:text-white"
                placeholder="Search items..."
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <SortSelect value={itemSort} onChange={setItemSort} ariaLabel="Sort items" />
              {multiple && (
                <button
                  onClick={toggleSelectAll}
                  className={cn(
                    'h-11 rounded-xl border px-4 text-sm font-bold transition whitespace-nowrap',
                    allFilteredSelected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-white/10',
                  )}
                >
                  {allFilteredSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
            {!activeSource ? (
              <EmptyPickerState icon={Layers} title="No source selected" description="Choose a library or album first." />
            ) : loadingItems ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                <p className="text-sm font-medium text-neutral-500">Loading items...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <EmptyPickerState icon={Search} title="No items found" description="Try a different filter or search." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => {
                  const key = `${item.sourceKind}:${item.sourceId}:${item.itemId}`;
                  const selected = selectedKeys.has(key);
                  const Icon = typeIcon(item.type);
                  const aspectRatio = item.type === 'image' || item.type === 'video' ? getCssAspectRatio(item.aspectRatio) : undefined;
                  return (
                    <button
                      key={key}
                      className={cn(
                        'group flex min-h-[130px] flex-col overflow-hidden rounded-card border bg-white text-left shadow-sm transition active:scale-[0.99] dark:bg-neutral-900',
                        selected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'border-neutral-200 hover:border-indigo-400/50 dark:border-white/10',
                      )}
                      onClick={(event) => toggleItem(key, event.shiftKey)}
                    >
                      {item.type === 'text' ? (
                        <div className="flex min-h-[120px] flex-1 flex-col justify-between bg-neutral-50 p-4 dark:bg-neutral-950">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:bg-white/10">
                              <FileText className="h-3 w-3" /> Text
                            </span>
                            {selected && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
                          </div>
                          <p className="mt-3 line-clamp-4 text-sm text-neutral-700 dark:text-neutral-300">{item.value}</p>
                        </div>
                      ) : item.type === 'audio' ? (
                        <div className="flex min-h-[120px] flex-1 items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                          <Music className="h-10 w-10 text-neutral-400" />
                          {selected && <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/25"><CheckCircle2 className="h-9 w-9 text-white" /></div>}
                        </div>
                      ) : (
                        <div className="relative w-full shrink-0 bg-neutral-100 dark:bg-neutral-800" style={{ aspectRatio }}>
                          {item.previewUrl ? (
                            <img src={imageDisplayUrl(item.previewUrl)} alt={item.title || item.itemId} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Icon className="h-8 w-8 text-neutral-400" />
                            </div>
                          )}
                          {selected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/30">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                                <CheckCircle2 className="h-6 w-6" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-auto w-full p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-lg bg-neutral-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:bg-white/10">
                            {sourceKindLabel(item.sourceKind)}
                          </span>
                          <span className="rounded-lg bg-neutral-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:bg-white/10">
                            {typeLabel(item.type)}
                          </span>
                        </div>
                        <p className="truncate text-sm font-bold text-neutral-950 dark:text-white">{itemLabel(item)}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-neutral-500">{item.rawUrl || item.sourceLabel}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-neutral-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between md:p-5">
            <p className="text-sm text-neutral-500">
              <span className="font-bold text-neutral-950 dark:text-white">{selectedItems.length}</span> selected
            </p>
            <div className="flex items-center gap-3">
              <button className="h-10 rounded-xl border border-neutral-200 px-4 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10" onClick={onClose}>
                Cancel
              </button>
              <button className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60" onClick={submit} disabled={selectedItems.length === 0}>
                <CheckCircle2 className="h-4 w-4" /> {multiple ? 'Add Selected' : 'Select Item'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>,
    document.body,
  );
}

function SortSelect({
  value,
  onChange,
  ariaLabel,
  compact = false,
}: {
  value: UniversalPickerSort;
  onChange: (value: UniversalPickerSort) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <select
        className={cn(
          'w-full appearance-none border border-neutral-200 bg-white font-semibold dark:border-white/10 dark:bg-neutral-900 dark:text-white',
          compact ? 'h-9 rounded-lg pl-3 pr-9 text-xs' : 'h-11 rounded-xl pl-3 pr-10 text-sm',
        )}
        value={value}
        onChange={(event) => onChange(event.target.value as UniversalPickerSort)}
        aria-label={ariaLabel}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name-asc">Name A-Z</option>
        <option value="name-desc">Name Z-A</option>
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
        {value === 'oldest' ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> :
         value === 'name-asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> :
         value === 'name-desc' ? <ArrowUpAZ className="h-3.5 w-3.5" /> :
         <ArrowDownNarrowWide className="h-3.5 w-3.5" />}
      </div>
    </div>
  );
}

function EmptyPickerState({ icon: Icon, title, description }: { icon: typeof Search; title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200 text-center dark:border-white/10">
      <Icon className="mb-4 h-12 w-12 text-neutral-300" />
      <p className="font-bold text-neutral-950 dark:text-white">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </div>
  );
}

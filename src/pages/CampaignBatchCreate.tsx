import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Images,
  Image as ImageIcon,
  Layers,
  Loader2,
  Search,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CampaignMediaImportSource,
  fetchCampaign,
  fetchLibraries,
  fetchLibraryItems,
  fetchProject,
  fetchProjects,
  imageDisplayUrl,
  importCampaignMediaPosts,
} from '../api';
import { PageHeader } from '../components/PageHeader';
import { AlbumItem, Library, LibraryItem, Project } from '../types';
import { cn } from '../lib/utils';

type PickerMode = 'library' | 'album';

interface PickerSource {
  id: string;
  name: string;
  description?: string;
  type: 'image' | 'video';
  itemCount: number;
}

interface PickerItem {
  id: string;
  title?: string;
  mediaType: 'image' | 'video';
  previewUrl?: string;
  rawUrl?: string;
  sourceLabel: string;
}

function importKey(mode: PickerMode, sourceId: string, itemId: string) {
  return JSON.stringify([mode, sourceId, itemId]);
}

function parseImportKey(key: string): CampaignMediaImportSource {
  const [mode, sourceId, itemId] = JSON.parse(key) as [PickerMode, string, string];
  if (mode === 'library') return { kind: 'library', libraryId: sourceId, itemId };
  return { kind: 'album', projectId: sourceId, itemId };
}

function libraryItemToPickerItem(item: LibraryItem, library: PickerSource): PickerItem {
  return {
    id: item.id,
    title: item.title,
    mediaType: library.type,
    previewUrl: library.type === 'video' ? item.thumbnailUrl : (item.thumbnailUrl || item.optimizedUrl || item.content),
    rawUrl: item.content,
    sourceLabel: library.name,
  };
}

function albumItemToPickerItem(item: AlbumItem, project: PickerSource): PickerItem {
  return {
    id: item.id,
    title: item.prompt || item.textContent || undefined,
    mediaType: project.type,
    previewUrl: project.type === 'video' ? item.thumbnailUrl : (item.thumbnailUrl || item.optimizedUrl || item.imageUrl),
    rawUrl: item.imageUrl,
    sourceLabel: project.name,
  };
}

function mediaSourceLabel(type: 'image' | 'video') {
  return type === 'video' ? 'Video' : 'Image';
}

interface MediaPickerModalProps {
  mode: PickerMode;
  sources: PickerSource[];
  activeSourceId: string | null;
  items: PickerItem[];
  selectedKeys: Set<string>;
  isLoadingItems: boolean;
  isImporting: boolean;
  onClose: () => void;
  onSelectSource: (sourceId: string) => void;
  onToggleItem: (key: string) => void;
  onCreateSelected: () => void;
}

function MediaPickerModal({
  mode,
  sources,
  activeSourceId,
  items,
  selectedKeys,
  isLoadingItems,
  isImporting,
  onClose,
  onSelectSource,
  onToggleItem,
  onCreateSelected,
}: MediaPickerModalProps) {
  const [query, setQuery] = useState('');
  const activeSource = sources.find((source) => source.id === activeSourceId);
  const selectedCount = selectedKeys.size;

  useEffect(() => {
    setQuery('');
  }, [activeSourceId]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return (
        item.title?.toLowerCase().includes(q) ||
        item.sourceLabel.toLowerCase().includes(q) ||
        item.rawUrl?.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={isImporting ? undefined : onClose} />
      <div className="relative flex h-[86vh] w-full max-w-7xl overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/80 p-5 dark:border-white/10 dark:bg-neutral-900/80 md:flex">
          <div className="mb-5 flex shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              {mode === 'library' ? <Images className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-bold text-neutral-950 dark:text-white">{mode === 'library' ? 'Pick from Library' : 'Pick from Album'}</h3>
              <p className="text-xs text-neutral-500">Select image/video media</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {sources.map((source) => {
              const active = source.id === activeSourceId;
              return (
                <button
                  key={source.id}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition',
                    active
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-white/10 dark:bg-neutral-950 dark:hover:border-white/20',
                  )}
                  onClick={() => onSelectSource(source.id)}
                  disabled={isImporting}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-bold text-neutral-950 dark:text-white">{source.name}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500 dark:bg-white/10">
                      {mediaSourceLabel(source.type)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{source.description || `${source.itemCount} items`}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-5 dark:border-white/10">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                {activeSource ? `${activeSource.name} · ${activeSource.itemCount} items` : 'No source selected'}
              </p>
              <h2 className="mt-1 text-xl font-bold text-neutral-950 dark:text-white">
                {mode === 'library' ? 'Library Media Picker' : 'Album Media Picker'}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Selection creates posts immediately: one selected media item becomes one draft post.
              </p>
            </div>
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onClose}
              disabled={isImporting}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-neutral-200 p-4 dark:border-white/10 md:hidden">
            <select
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-neutral-900 dark:text-white"
              value={activeSourceId || ''}
              onChange={(event) => onSelectSource(event.target.value)}
              disabled={isImporting}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </div>

          <div className="border-b border-neutral-200 p-4 dark:border-white/10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-900 dark:text-white"
                placeholder="Search selected source..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={isImporting}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {sources.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-neutral-200 text-center dark:border-white/10">
                <Images className="mb-4 h-12 w-12 text-neutral-300" />
                <p className="font-bold text-neutral-950 dark:text-white">No image or video sources found</p>
                <p className="mt-1 text-sm text-neutral-500">Create an image/video library or album first.</p>
              </div>
            ) : isLoadingItems ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                <p className="text-sm font-medium text-neutral-500">Loading media...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-neutral-200 text-center dark:border-white/10">
                <Search className="mb-4 h-12 w-12 text-neutral-300" />
                <p className="font-bold text-neutral-950 dark:text-white">No media found</p>
                <p className="mt-1 text-sm text-neutral-500">Try another source or search term.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((item) => {
                  const key = importKey(mode, activeSourceId || '', item.id);
                  const selected = selectedKeys.has(key);
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        'group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition active:scale-[0.99] dark:bg-neutral-900',
                        selected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'border-neutral-200 hover:border-indigo-400/50 dark:border-white/10',
                      )}
                      onClick={() => onToggleItem(key)}
                      disabled={isImporting}
                    >
                      <div className="relative aspect-video bg-neutral-100 dark:bg-neutral-800">
                        {item.previewUrl ? (
                          <img src={imageDisplayUrl(item.previewUrl)} alt={item.title || item.id} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {item.mediaType === 'video' ? <Video className="h-8 w-8 text-neutral-400" /> : <ImageIcon className="h-8 w-8 text-neutral-400" />}
                          </div>
                        )}
                        <div className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                          {mediaSourceLabel(item.mediaType)}
                        </div>
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/30">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                              <CheckCircle2 className="h-6 w-6" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-bold text-neutral-950 dark:text-white">{item.title || item.id}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-neutral-500">{item.rawUrl || 'No raw key'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-neutral-200 p-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-neutral-500">
              <span className="font-bold text-neutral-950 dark:text-white">{selectedCount}</span> selected
            </p>
            <div className="flex items-center gap-3">
              <button
                className="h-10 rounded-xl border border-neutral-200 px-4 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10"
                onClick={onClose}
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 min-w-[170px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60"
                onClick={onCreateSelected}
                disabled={isImporting || selectedCount === 0}
              >
                {isImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : <><CheckCircle2 className="h-4 w-4" /> Use Selected Now</>}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function CampaignBatchCreate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [albumItems, setAlbumItems] = useState<AlbumItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      if (!id) return;
      setIsLoading(true);
      try {
        const [campaignData, librariesData, projectsData] = await Promise.all([
          fetchCampaign(id),
          fetchLibraries(1, 100, undefined, false),
          fetchProjects(1, 100, undefined, 'all'),
        ]);

        if (cancelled) return;
        setCampaign(campaignData);
        setLibraries(librariesData.items || []);
        setProjects(projectsData.items || []);
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'Failed to load batch picker');
          navigate('/campaigns');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const librarySources = useMemo<PickerSource[]>(() => {
    return libraries
      .filter((library) => library.type === 'image' || library.type === 'video')
      .map((library) => ({
        id: library.id,
        name: library.name,
        description: library.description,
        type: library.type as 'image' | 'video',
        itemCount: library.itemCount ?? library.items?.length ?? 0,
      }));
  }, [libraries]);

  const albumSources = useMemo<PickerSource[]>(() => {
    return projects
      .filter((project) => (project.type === 'image' || project.type === 'video') && ((project as any).albumCount ?? 0) > 0)
      .map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        type: project.type as 'image' | 'video',
        itemCount: (project as any).albumCount ?? project.album?.length ?? 0,
      }));
  }, [projects]);

  const activeLibrarySource = useMemo(
    () => librarySources.find((source) => source.id === activeLibraryId) || null,
    [activeLibraryId, librarySources],
  );

  const activeAlbumSource = useMemo(
    () => albumSources.find((source) => source.id === activeProjectId) || null,
    [activeProjectId, albumSources],
  );

  useEffect(() => {
    if (pickerMode !== 'library' || activeLibraryId || librarySources.length === 0) return;
    setActiveLibraryId(librarySources[0].id);
  }, [activeLibraryId, librarySources, pickerMode]);

  useEffect(() => {
    if (pickerMode !== 'album' || activeProjectId || albumSources.length === 0) return;
    setActiveProjectId(albumSources[0].id);
  }, [activeProjectId, albumSources, pickerMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraryItems() {
      if (pickerMode !== 'library' || !activeLibraryId) {
        setLibraryItems([]);
        return;
      }

      setIsLoadingItems(true);
      try {
        const data = await fetchLibraryItems(activeLibraryId, 1, 500);
        if (!cancelled) setLibraryItems(data.items || []);
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Failed to load library items');
      } finally {
        if (!cancelled) setIsLoadingItems(false);
      }
    }

    void loadLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [activeLibraryId, pickerMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbumItems() {
      if (pickerMode !== 'album' || !activeProjectId) {
        setAlbumItems([]);
        return;
      }

      setIsLoadingItems(true);
      try {
        const project = await fetchProject(activeProjectId);
        if (!cancelled) setAlbumItems(project.album || []);
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Failed to load album items');
      } finally {
        if (!cancelled) setIsLoadingItems(false);
      }
    }

    void loadAlbumItems();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, pickerMode]);

  const pickerSources = pickerMode === 'library' ? librarySources : albumSources;
  const activeSourceId = pickerMode === 'library' ? activeLibraryId : activeProjectId;
  const activeSource = pickerMode === 'library' ? activeLibrarySource : activeAlbumSource;
  const pickerItems = useMemo<PickerItem[]>(() => {
    if (!activeSource) return [];
    if (pickerMode === 'library') {
      return libraryItems.map((item) => libraryItemToPickerItem(item, activeSource));
    }
    return albumItems
      .filter((item) => item.imageUrl)
      .map((item) => albumItemToPickerItem(item, activeSource));
  }, [activeSource, albumItems, libraryItems, pickerMode]);

  const openPicker = (mode: PickerMode) => {
    setSelectedKeys(new Set());
    setPickerMode(mode);
    if (mode === 'library' && !activeLibraryId && librarySources.length > 0) {
      setActiveLibraryId(librarySources[0].id);
    }
    if (mode === 'album' && !activeProjectId && albumSources.length > 0) {
      setActiveProjectId(albumSources[0].id);
    }
  };

  const closePicker = () => {
    if (isImporting) return;
    setPickerMode(null);
    setSelectedKeys(new Set());
  };

  const toggleItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const createSelectedPosts = async () => {
    if (!id || selectedKeys.size === 0) return;
    const sources = Array.from(selectedKeys).map(parseImportKey);

    setIsImporting(true);
    try {
      const result = await importCampaignMediaPosts(id, sources);
      toast.success(`Created ${result.count} post${result.count === 1 ? '' : 's'} for ${campaign?.name || 'campaign'}`);
      navigate(`/campaigns/${id}/batch`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create posts');
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-8 pb-32">
        <PageHeader
          title="Create Batch"
          description={<>Pick media for <span className="font-semibold text-neutral-950 dark:text-white">{campaign?.name}</span>. Each selected item becomes one draft post immediately.</>}
          backLink={{ to: `/campaigns/${id}/batch`, label: 'Back to Batch Actions' }}
          actions={(
            <button
              className="h-10 rounded-xl border border-neutral-200/50 bg-white/40 px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-white/10"
              onClick={() => navigate(`/campaigns/${id}/batch`)}
            >
              Cancel
            </button>
          )}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <button
            className="group relative overflow-hidden rounded-[2rem] border border-neutral-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400/50 hover:shadow-xl dark:border-white/10 dark:bg-neutral-900"
            onClick={() => openPicker('library')}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(79,70,229,0.18),transparent_45%)] opacity-0 transition group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                <Images className="h-7 w-7" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">{librarySources.length} media libraries</p>
              <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-white">Pick from Image/Video Library</h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-neutral-500">
                Select multiple image or video library items. Images are imported as 4K JPEG 90 raw plus opt and thumb; videos keep the original file.
              </p>
            </div>
          </button>

          <button
            className="group relative overflow-hidden rounded-[2rem] border border-neutral-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400/50 hover:shadow-xl dark:border-white/10 dark:bg-neutral-900"
            onClick={() => openPicker('album')}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_45%)] opacity-0 transition group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                <Layers className="h-7 w-7" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">{albumSources.length} media albums</p>
              <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-white">Pick from Album</h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-neutral-500">
                Select generated media from image or video project albums. The selected media is copied into post storage before posts are created.
              </p>
            </div>
          </button>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white/60 p-6 text-sm text-neutral-500 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-bold text-neutral-950 dark:text-white">Creation behavior</h3>
              <p className="mt-1">No staging list and no confirm step. After picker selection is submitted, processing starts and the page returns to batch actions.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-white/10 dark:text-neutral-300">1 media = 1 post</span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-white/10 dark:text-neutral-300">raw + opt + thumb</span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-white/10 dark:text-neutral-300">draft status</span>
            </div>
          </div>
        </div>
      </div>

      {pickerMode && (
        <MediaPickerModal
          mode={pickerMode}
          sources={pickerSources}
          activeSourceId={activeSourceId}
          items={pickerItems}
          selectedKeys={selectedKeys}
          isLoadingItems={isLoadingItems}
          isImporting={isImporting}
          onClose={closePicker}
          onSelectSource={pickerMode === 'library' ? setActiveLibraryId : setActiveProjectId}
          onToggleItem={toggleItem}
          onCreateSelected={() => void createSelectedPosts()}
        />
      )}
    </div>
  );
}

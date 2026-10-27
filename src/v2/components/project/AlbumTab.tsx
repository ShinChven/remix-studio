import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { imageDisplayUrl, startAlbumExport, startAutoTag, type AlbumExportVersion } from '../../../api';
import type { ProjectMediaType } from '../../../lib/project-media';
import { copyText, resourceRef } from '../../../lib/resource-ref';
import { Button, Checkbox, Dialog, Icon, IconButton, LoadingIndicator, MenuDivider, MenuGroup, MenuItem, SubMenu, Text, useSnackbar } from '../../../m3';
import type { AlbumItem, AlbumTagCount, AlbumTagMatch, AspectRatioCount, ProjectType } from '../../../types';
import { withBase } from '../../app/paths';
import { formatBytes } from '../../lib/format';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { HoverMenuButton } from '../../ui/HoverMenuButton';
import { kindMeta } from '../../ui/entityMeta';
import { EmptyState } from '../../ui/Page';
import { PagedFooter, PAGE_SIZE_OPTIONS } from '../../ui/PagedFooter';
import { PromptDialog } from '../../ui/PromptDialog';
import { FilterChip, ResultsSearch, TagLine } from '../../ui/ResultFilters';
import { useToast } from '../../ui/useToast';
import { AutoTagDialog } from '../AutoTagDialog';
import { AutoTagProgress } from '../AutoTagProgress';
import { TagDialog } from '../TagDialog';
import { AlbumBatchTagDialog, AlbumPromptDialog, ExportPackageDialog, TextAlbumCompareDialog, TextAlbumDetailDialog, type AlbumBatchTagMode } from './AlbumDialogs';
import { AlbumTransferDialog, albumFilename, type AlbumTransferAction } from './AlbumTransferDialog';
import { ParamTable } from './JobDetails';
import { shortDate } from './JobRow';
import { DangerAction, ResultsBar } from './ResultsBar';

export interface AlbumLightboxData {
  images: string[];
  index: number;
  albumItemIds?: string[];
  onDelete?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}

export interface AlbumTabProps {
  /** The section switcher, shown in the bar. */
  nav: ReactNode;
  projectId: string;
  projectName: string;
  albumItems: AlbumItem[];
  selectedAlbumIds: Set<string>;
  toggleSelectAllAlbum: (scopeIds?: string[]) => void;
  toggleAlbumSelection: (id: string, isShiftPressed: boolean, scopeIds?: string[]) => void;
  clearAlbumSelection: () => void;
  setAlbumItemsToDelete: (items: AlbumItem[]) => void;
  setShowDeleteAlbumModal: (show: boolean) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  setLightboxData: (data: AlbumLightboxData | null) => void;
  onRenameAlbumItem: (itemId: string, filename: string) => Promise<AlbumItem>;
  onReuseWorkflow?: (item: AlbumItem) => void;
  reusingAlbumItemId?: string | null;
  onExportStarted: () => void;
  onAlbumItemsMoved?: (items: AlbumItem[]) => void;
  projectType?: ProjectType;
  sourceProjectType?: ProjectType;
  page: number;
  pageSize: number | 'all';
  total: number;
  pages: number;
  totalSize: number;
  aspectRatioCounts: AspectRatioCount[];
  sort: 'newest' | 'oldest';
  selectedAspectRatios: string[];
  tagCounts: AlbumTagCount[];
  selectedTags: string[];
  tagMatch: AlbumTagMatch;
  search: string;
  isLoading: boolean;
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number | 'all') => void;
  onSortChange: (sort: 'newest' | 'oldest') => void;
  onSelectedAspectRatiosChange: (ratios: string[]) => void;
  onSelectedTagsChange: (tags: string[]) => void;
  onTagMatchChange: (match: AlbumTagMatch) => void;
  onUpdateAlbumItemTags: (itemId: string, tags: string[]) => Promise<AlbumItem>;
  onBatchUpdateAlbumTags: (options: { itemIds?: string[]; allAlbumItems?: boolean; add?: string[]; remove?: string[]; replace?: string[]; aspectRatios?: string[]; filterTags?: string[]; tagMatch?: AlbumTagMatch; q?: string }) => Promise<{ updated: number }>;
}

function cssAspectRatio(value?: string) {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return '1 / 1';
  const w = Number(match[1]);
  const h = Number(match[2]);
  return w && h ? `${w} / ${h}` : '1 / 1';
}

function sizeLabel(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/** The project's results: a filterable, paged grid (or list, for text and audio) with bulk actions. */
export function AlbumTab(props: AlbumTabProps) {
  const {
    projectId,
    projectName,
    albumItems,
    selectedAlbumIds,
    toggleSelectAllAlbum,
    toggleAlbumSelection,
    setAlbumItemsToDelete,
    setShowDeleteAlbumModal,
    getProviderName,
    getModelName,
    setLightboxData,
    onRenameAlbumItem,
    onReuseWorkflow,
    reusingAlbumItemId,
    onExportStarted,
    onAlbumItemsMoved,
    projectType = 'image',
    sourceProjectType,
    page,
    pageSize,
    total,
    pages,
    totalSize,
    aspectRatioCounts,
    sort,
    selectedAspectRatios,
    tagCounts,
    selectedTags,
    tagMatch,
    search,
    isLoading,
  } = props;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const isText = projectType === 'text';
  const isVideo = projectType === 'video';
  const isAudio = projectType === 'audio';
  const mediaType: ProjectMediaType = isText ? 'text' : isVideo ? 'video' : isAudio ? 'audio' : 'image';
  // Video and audio would need frames or a transcript first.
  const canAutoTag = mediaType === 'image' || mediaType === 'text';

  const [infoItem, setInfoItem] = useState<AlbumItem | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportItemIds, setExportItemIds] = useState<string[] | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [transferAction, setTransferAction] = useState<AlbumTransferAction | null>(null);
  const [videoItem, setVideoItem] = useState<AlbumItem | null>(null);
  const [expandedAudio, setExpandedAudio] = useState<Set<string>>(new Set());
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [renameItem, setRenameItem] = useState<AlbumItem | null>(null);
  const [tagItem, setTagItem] = useState<AlbumItem | null>(null);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [autoTagOpen, setAutoTagOpen] = useState(false);
  const [autoTagRunKey, setAutoTagRunKey] = useState(0);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const hasRatioFilter = selectedAspectRatios.length > 0;
  const showRatioFilter = !isText && !isAudio && aspectRatioCounts.length > 0;
  const hasTagFilter = selectedTags.length > 0;
  const hasSearch = search.trim().length > 0;
  const itemIds = useMemo(() => albumItems.map((item) => item.id), [albumItems]);
  const selectedIds = useMemo(() => itemIds.filter((id) => selectedAlbumIds.has(id)), [itemIds, selectedAlbumIds]);
  const hasSelection = selectedIds.length > 0;
  const bulkIds = hasSelection ? selectedIds : itemIds;
  const useAllScope = !hasSelection && !hasRatioFilter && !hasTagFilter && !hasSearch;
  const selectedItems = albumItems.filter((item) => selectedAlbumIds.has(item.id));

  const toggleRatio = useCallback(
    (ratio: string) => props.onSelectedAspectRatiosChange(selectedAspectRatios.includes(ratio) ? selectedAspectRatios.filter((r) => r !== ratio) : [...selectedAspectRatios, ratio]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedAspectRatios, props.onSelectedAspectRatiosChange],
  );
  const toggleTag = useCallback(
    (tag: string) => props.onSelectedTagsChange(selectedTags.includes(tag) ? selectedTags.filter((x) => x !== tag) : [...selectedTags, tag]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTags, props.onSelectedTagsChange],
  );

  const filterScope = () =>
    hasSelection
      ? { itemIds: selectedIds }
      : { allAlbumItems: true, aspectRatios: hasRatioFilter ? selectedAspectRatios : undefined, filterTags: hasTagFilter ? selectedTags : undefined, tagMatch, q: search };

  const applyBatchTags = async (mode: AlbumBatchTagMode, tags: string[]) => {
    try {
      // "Everything" means everything the filters select; the filters travel with the request.
      const { updated } = await props.onBatchUpdateAlbumTags({ ...filterScope(), add: mode === 'add' ? tags : undefined, remove: mode === 'remove' ? tags : undefined, replace: mode === 'replace' ? tags : undefined });
      toast.success(t('projectViewer.album.tagsBatchUpdated', { count: updated }));
    } catch (err) {
      toast.error((err as Error).message || t('projectViewer.album.tagsUpdateFailed'));
      throw err;
    }
  };

  const startAlbumAutoTag = async ({ onlyUntagged }: { onlyUntagged: boolean }) => {
    try {
      const { queued } = await startAutoTag({ kind: 'album', projectId }, { ...filterScope(), onlyUntagged, language: i18n.language });
      if (queued === 0) toast.info(t('autoTag.nothingToTag'));
      else toast.success(t('autoTag.started', { count: queued }));
      setAutoTagRunKey((key) => key + 1);
    } catch (err) {
      toast.error((err as Error).message || t('autoTag.startFailed'));
      throw err;
    }
  };

  const saveItemTags = async (tags: string[]) => {
    if (!tagItem) return;
    const item = tagItem;
    setTagItem(null);
    try {
      await props.onUpdateAlbumItemTags(item.id, tags);
      toast.success(t('projectViewer.album.tagsUpdated'));
    } catch (err) {
      toast.error((err as Error).message || t('projectViewer.album.tagsUpdateFailed'));
    }
  };

  const submitRename = async (value: string) => {
    if (!renameItem) return;
    const filename = value.trim();
    if (!filename) {
      toast.error(t('projectViewer.album.filenameRequired'));
      throw new Error('empty');
    }
    if (albumItems.some((item) => item.id !== renameItem.id && albumFilename(item).trim().toLowerCase() === filename.toLowerCase())) {
      toast.error(t('projectViewer.album.filenameDuplicate'));
      throw new Error('duplicate');
    }
    try {
      await onRenameAlbumItem(renameItem.id, filename);
      toast.success(t('projectViewer.album.filenameUpdated'));
    } catch (err) {
      toast.error((err as Error).message || t('projectViewer.album.filenameUpdateFailed'));
      throw err;
    }
  };

  const copyReference = async (item: AlbumItem) => {
    const reference = resourceRef.albumItem(projectId, item.id);
    try {
      await copyText(reference);
      snackbar.show(`${t('resourceRef.copied')} · ${reference}`);
    } catch {
      snackbar.show(`${t('resourceRef.copyFailed')} · ${reference}`);
    }
  };

  const toggleAudioPlayback = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (playingAudio && playingAudio !== id) audioRefs.current[playingAudio]?.pause();
    audio.play().catch(() => {});
  };

  const openExport = (isAll: boolean) => {
    setExportItemIds(isAll && useAllScope ? undefined : bulkIds);
    setExportOpen(true);
  };

  const handleExport = async (packageName: string, version: AlbumExportVersion) => {
    try {
      await startAlbumExport(projectId, exportItemIds, packageName, version);
      onExportStarted();
      navigate('/exports');
      toast.success(t('projectViewer.album.exportQueued'));
    } catch (err) {
      toast.error(t('projectViewer.album.exportFailed', { message: (err as Error).message }));
      throw err;
    }
  };

  const handleWatermarkExport = (packageName: string, version: AlbumExportVersion) => {
    const params = new URLSearchParams();
    if (exportItemIds && exportItemIds.length > 0) {
      const scopeKey = `watermark-export:${projectId}:${Date.now()}`;
      sessionStorage.setItem(scopeKey, JSON.stringify(exportItemIds));
      params.set('scopeKey', scopeKey);
      params.set('count', String(exportItemIds.length));
    }
    params.set('version', version);
    params.set('name', packageName);
    setExportOpen(false);
    navigate(`/project/${projectId}/export-watermark?${params.toString()}`, { state: { itemIds: exportItemIds, packageName, exportVersion: version } });
  };

  const deleteItems = (items: AlbumItem[]) => {
    setAlbumItemsToDelete(items);
    setShowDeleteAlbumModal(true);
  };

  const openLightbox = (item: AlbumItem) => {
    if (isVideo) {
      setVideoItem(item);
      return;
    }
    const valid = albumItems.filter((a) => a.imageUrl);
    const idx = valid.findIndex((a) => a.id === item.id);
    setLightboxData({
      images: valid.map((a) => imageDisplayUrl(a.optimizedUrl || a.imageUrl)),
      index: idx >= 0 ? idx : 0,
      albumItemIds: valid.map((a) => a.id),
      onDelete: (i) => valid[i] && deleteItems([valid[i]]),
      onIndexChange: (i) => {
        const next = valid[i];
        if (next) document.getElementById(`album-item-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });
  };

  // Everything at once, or what the filters show: the same actions the selection gets.
  const scopeActions: ActionMenuItem[] = [
    { key: 'export', label: useAllScope ? t('projectViewer.album.exportAll') : t('projectViewer.album.exportPage'), icon: 'folder_zip', onSelect: () => openExport(true) },
    { key: 'tag', label: useAllScope ? t('projectViewer.album.tagAll') : t('projectViewer.album.tagResults'), icon: 'sell', onSelect: () => setBatchTagOpen(true) },
    { key: 'autotag', hidden: !canAutoTag, label: useAllScope ? t('projectViewer.album.autoTagAll') : t('projectViewer.album.autoTagResults'), icon: 'wand_stars', onSelect: () => setAutoTagOpen(true) },
    { key: 'copy', label: useAllScope ? t('projectViewer.transfer.copyAllTo') : t('projectViewer.transfer.copyPageTo'), icon: 'content_copy', onSelect: () => setTransferAction('copy') },
  ];
  const selectionMore: ActionMenuItem[] = [
    { key: 'autotag', hidden: !canAutoTag, label: t('projectViewer.album.autoTagSelected'), icon: 'wand_stars', onSelect: () => setAutoTagOpen(true) },
    { key: 'copy', label: t('projectViewer.transfer.copyTo'), icon: 'content_copy', onSelect: () => setTransferAction('copy') },
    { key: 'move', label: t('projectViewer.transfer.moveTo'), icon: 'drive_file_move', onSelect: () => setTransferAction('move') },
    { key: 'compare', hidden: !(isText && selectedIds.length > 1), label: t('projectViewer.album.compareSelected'), icon: 'view_column', onSelect: () => setCompareOpen(true) },
  ];

  const itemMenu = (item: AlbumItem, opts: { media?: boolean; className?: string } = {}) => {
    const items: ActionMenuItem[] = [
      { key: 'info', label: t('v2.project.details'), icon: 'info', onSelect: () => setInfoItem(item) },
      { key: 'rename', hidden: !opts.media, label: t('projectViewer.album.editFilename'), icon: 'edit', onSelect: () => setRenameItem(item) },
      { key: 'tags', label: t('projectViewer.album.editTags'), icon: 'sell', onSelect: () => setTagItem(item) },
      { key: 'reuse', hidden: !onReuseWorkflow, disabled: Boolean(reusingAlbumItemId), label: t('projectViewer.album.reuseWorkflow'), icon: 'history', onSelect: () => onReuseWorkflow?.(item) },
      { key: 'ref', label: t('resourceRef.copy'), icon: 'tag', onSelect: () => void copyReference(item) },
      { key: 'original', hidden: !opts.media, divider: true, label: t('projectViewer.album.openOriginal'), icon: 'open_in_new', href: imageDisplayUrl(item.imageUrl), target: '_blank' },
      { key: 'watermark', hidden: !opts.media || isVideo, label: t('projectViewer.album.quickWatermark'), icon: 'approval', href: withBase(`/project/${projectId}/album/${item.id}/watermark`), target: '_blank' },
      { key: 'delete', divider: true, danger: true, label: t('projectViewer.common.delete'), icon: 'delete', onSelect: () => deleteItems([item]) },
    ];
    return <ActionMenu label={t('v2.project.moreActions')} items={items} size="xs" className={opts.className} />;
  };

  const activeFilterCount = selectedAspectRatios.length + selectedTags.length;
  const filtered = hasRatioFilter || hasTagFilter || hasSearch;

  const tools = (
    <>
      <ResultsSearch value={search} onChange={props.onSearchChange} label={t('projectViewer.album.searchPlaceholder')} />
      {(showRatioFilter || tagCounts.length > 0 || hasTagFilter || hasRatioFilter) && (
        <HoverMenuButton
          placement="bottom-end"
          aria-label={t('v2.project.filters')}
          trigger={(p) => <IconButton {...p} icon="filter_list" size="sm" variant={activeFilterCount > 0 ? 'tonal' : 'standard'} label={t('v2.project.filters')} />}
        >
          {showRatioFilter && (
            <SubMenu icon="aspect_ratio" label={hasRatioFilter ? t('projectViewer.album.aspectRatioFilterCount', { count: selectedAspectRatios.length }) : t('projectViewer.album.aspectRatioFilter')}>
              <MenuItem type="checkbox" checked={!hasRatioFilter} keepOpen onSelect={() => props.onSelectedAspectRatiosChange([])}>
                {t('projectViewer.album.allAspectRatios')}
              </MenuItem>
              <MenuDivider />
              {aspectRatioCounts.map(({ ratio, count }) => (
                <MenuItem key={ratio} type="checkbox" checked={selectedAspectRatios.includes(ratio)} keepOpen onSelect={() => toggleRatio(ratio)} trailingText={String(count)}>
                  {ratio}
                </MenuItem>
              ))}
            </SubMenu>
          )}
          {(tagCounts.length > 0 || hasTagFilter) && (
            <SubMenu icon="sell" label={hasTagFilter ? t('projectViewer.album.tagFilterCount', { count: selectedTags.length }) : t('projectViewer.album.tagFilter')}>
              <MenuItem type="radio" checked={tagMatch === 'all'} keepOpen onSelect={() => props.onTagMatchChange('all')}>
                {t('projectViewer.album.tagMatchAll')}
              </MenuItem>
              <MenuItem type="radio" checked={tagMatch === 'any'} keepOpen onSelect={() => props.onTagMatchChange('any')}>
                {t('projectViewer.album.tagMatchAny')}
              </MenuItem>
              <MenuDivider />
              <MenuItem type="checkbox" checked={!hasTagFilter} keepOpen onSelect={() => props.onSelectedTagsChange([])}>
                {t('projectViewer.album.allTags')}
              </MenuItem>
              {tagCounts.map(({ tag, count }) => (
                <MenuItem key={tag} type="checkbox" checked={selectedTags.includes(tag)} keepOpen onSelect={() => toggleTag(tag)} trailingText={String(count)}>
                  {tag}
                </MenuItem>
              ))}
            </SubMenu>
          )}
        </HoverMenuButton>
      )}
      <HoverMenuButton placement="bottom-end" aria-label={t('v2.project.viewOptions')} trigger={(p) => <IconButton {...p} icon="tune" size="sm" label={t('v2.project.viewOptions')} />}>
        <MenuGroup label={t('v2.project.sort')}>
          <MenuItem type="radio" icon="arrow_downward" checked={sort === 'newest'} onSelect={() => props.onSortChange('newest')}>
            {t('projectViewer.album.sortNewest')}
          </MenuItem>
          <MenuItem type="radio" icon="arrow_upward" checked={sort === 'oldest'} onSelect={() => props.onSortChange('oldest')}>
            {t('projectViewer.album.sortOldest')}
          </MenuItem>
        </MenuGroup>
        <MenuDivider />
        <MenuGroup label={t('pagination.pageSize')}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <MenuItem key={String(size)} type="radio" checked={pageSize === size} onSelect={() => props.onPageSizeChange(size)}>
              {size === 'all' ? t('pagination.all') : String(size)}
            </MenuItem>
          ))}
        </MenuGroup>
      </HoverMenuButton>
    </>
  );

  const selectionActions = (
    <>
      <IconButton icon="folder_zip" size="sm" label={t('projectViewer.album.exportSelected')} tooltip onClick={() => openExport(false)} />
      <IconButton icon="sell" size="sm" label={t('projectViewer.album.tagSelected')} tooltip onClick={() => setBatchTagOpen(true)} />
      <ActionMenu label={t('v2.project.moreActions')} items={selectionMore} size="sm" openOnHover />
      <DangerAction label={t('projectViewer.common.deleteSelected')} onClick={() => deleteItems(selectedItems)} />
    </>
  );

  const filterRow = filtered && (
    <>
      {hasSearch && <FilterChip label={`“${search}”`} removeLabel={t('projectViewer.album.clearSearch')} onRemove={() => props.onSearchChange('')} />}
      {selectedAspectRatios.map((ratio) => (
        <FilterChip key={`r:${ratio}`} label={ratio} removeLabel={ratio} onRemove={() => toggleRatio(ratio)} />
      ))}
      {selectedTags.map((tag) => (
        <FilterChip key={`t:${tag}`} label={`#${tag}`} removeLabel={t('projectViewer.album.tagRemove', { tag })} onRemove={() => toggleTag(tag)} />
      ))}
      {selectedTags.length > 1 && (
        <button type="button" className="v2-filter-link" onClick={() => props.onTagMatchChange(tagMatch === 'all' ? 'any' : 'all')}>
          {tagMatch === 'all' ? t('projectViewer.album.tagMatchAll') : t('projectViewer.album.tagMatchAny')}
        </button>
      )}
      <button
        type="button"
        className="v2-filter-link"
        onClick={() => {
          props.onSearchChange('');
          props.onSelectedAspectRatiosChange([]);
          props.onSelectedTagsChange([]);
        }}
      >
        {t('v2.project.clearFilters')}
      </button>
    </>
  );

  const emptyKind = kindMeta(mediaType);
  const target = isText ? t('projectViewer.album.collection') : isVideo ? t('projectViewer.album.reel') : isAudio ? t('projectViewer.album.audioCollection') : t('projectViewer.tabs.album').toLowerCase();
  const indexLabel = (index: number) => ((page - 1) * (pageSize === 'all' ? 0 : pageSize) + index + 1).toString().padStart(2, '0');

  const infoRows = (item: AlbumItem) =>
    [
      { label: t('v2.project.filename'), value: albumFilename(item) },
      { label: t('projectViewer.common.model'), value: `${getProviderName(item.providerId)} · ${getModelName(item.providerId, item.modelConfigId)}` },
      item.createdAt ? { label: t('v2.project.created'), value: new Date(item.createdAt).toLocaleString() } : null,
      item.aspectRatio ? { label: t('projectViewer.settings.aspectRatio'), value: item.aspectRatio } : null,
      item.resolution || item.quality ? { label: item.resolution ? t('projectViewer.settings.resolution') : t('projectViewer.settings.quality'), value: item.resolution || item.quality } : null,
      item.duration != null ? { label: t('v2.project.duration'), value: `${item.duration}s` } : null,
      item.format ? { label: t('projectViewer.settings.format'), value: item.format.toUpperCase() } : null,
      item.size || item.optimizedSize || item.thumbnailSize
        ? {
            label: t('v2.project.fileSizes'),
            value: [
              item.size ? `${t('projectViewer.album.raw')} ${sizeLabel(item.size)}` : null,
              item.optimizedSize ? `${t('projectViewer.album.optimized')} ${sizeLabel(item.optimizedSize)}` : null,
              item.thumbnailSize ? `${t('projectViewer.album.thumbnail')} ${sizeLabel(item.thumbnailSize)}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : null,
      item.tags && item.tags.length > 0 ? { label: t('projectViewer.album.tagFilter'), value: item.tags.map((tag) => `#${tag}`).join('  ') } : null,
    ].filter(Boolean) as Array<{ label: string; value: ReactNode }>;

  const selecting = hasSelection;
  const selectBox = (item: AlbumItem, label: string, className: string) => (
    <span
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        toggleAlbumSelection(item.id, e.shiftKey, itemIds);
      }}
    >
      <Checkbox checked={selectedAlbumIds.has(item.id)} onChange={() => undefined} tabIndex={-1} aria-label={label} />
    </span>
  );

  return (
    <section className="v2-results-section">
      <ResultsBar
        nav={props.nav}
        isLoading={isLoading && albumItems.length > 0}
        totalCount={albumItems.length}
        selectedCount={selectedIds.length}
        onToggleSelectAll={() => toggleSelectAllAlbum(itemIds)}
        onClearSelection={props.clearAlbumSelection}
        summary={total > 0 && (isText || isAudio ? t('v2.project.itemCount', { count: total }) : `${t('v2.project.itemCount', { count: total })} · ${formatBytes(totalSize)}`)}
        tools={tools}
        menuItems={total > 0 ? scopeActions : []}
        selectionActions={selectionActions}
        below={filterRow}
      />

      {canAutoTag && <AutoTagProgress scope={{ kind: 'album', projectId }} runKey={autoTagRunKey} className="v2-pane-inset" />}

      {isLoading && albumItems.length === 0 ? (
        <div className="v2-results-loading">
          <LoadingIndicator />
        </div>
      ) : total === 0 && !filtered ? (
        <EmptyState
          icon={emptyKind.icon}
          shape={emptyKind.shape}
          className="v2-pane-empty"
          title={isText ? t('projectViewer.album.noTexts') : isVideo ? t('projectViewer.album.noVideos') : isAudio ? t('projectViewer.album.noAudios') : t('projectViewer.album.galleryEmpty')}
          description={t('projectViewer.album.emptyDescription', { target })}
        />
      ) : albumItems.length === 0 ? (
        <EmptyState icon="filter_alt_off" className="v2-pane-empty" title={t('projectViewer.album.noFilterMatches')} description={t('projectViewer.album.noFilterMatchesDescription')} />
      ) : isText ? (
        <div className="v2-joblist" data-selecting={selecting ? '' : undefined}>
          {albumItems.map((item, index) => (
            <div key={item.id} className="v2-line" data-selected={selectedAlbumIds.has(item.id) ? '' : undefined}>
              {selectBox(item, `#${index + 1}`, 'v2-line__check')}
              <span className="v2-line__index">{indexLabel(index)}</span>
              <button type="button" className="v2-line__main m3-focus-ring" title={t('projectViewer.album.viewTextDetails')} onClick={() => setDetailIndex(index)}>
                <Text as="span" variant="body-medium" className="v2-line__title">
                  {item.textContent || item.prompt}
                </Text>
                <Text as="span" variant="body-small" className="v2-line__meta">
                  {[getModelName(item.providerId, item.modelConfigId), shortDate(item.createdAt), (item.imageContexts?.length || 0) > 0 ? t('projectViewer.album.imageContexts', { count: item.imageContexts?.length || 0 }) : null].filter(Boolean).join(' · ')}
                </Text>
              </button>
              <span className="v2-line__tags">
                <TagLine tags={item.tags} onTagClick={toggleTag} limit={3} />
              </span>
              <span className="v2-line__actions">{itemMenu(item)}</span>
            </div>
          ))}
        </div>
      ) : isAudio ? (
        <div className="v2-joblist" data-selecting={selecting ? '' : undefined}>
          {albumItems.map((item, index) => {
            const expanded = expandedAudio.has(item.id);
            const playing = playingAudio === item.id;
            const toggleExpand = () =>
              setExpandedAudio((prev) => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                return next;
              });
            return (
              <div key={item.id} className="v2-line v2-line--audio" data-selected={selectedAlbumIds.has(item.id) ? '' : undefined} data-playing={playing ? '' : undefined} data-expanded={expanded ? '' : undefined}>
                <div className="v2-line__row">
                  {selectBox(item, `#${index + 1}`, 'v2-line__check')}
                  <IconButton icon={playing ? 'pause' : 'play_arrow'} variant={playing ? 'filled' : 'tonal'} size="sm" className="v2-line__play" label={playing ? t('projectViewer.album.pauseAudio') : t('projectViewer.album.playAudio')} onClick={() => toggleAudioPlayback(item.id)} />
                  <button type="button" className="v2-line__main m3-focus-ring" aria-expanded={expanded} title={expanded ? t('projectViewer.album.collapse') : t('projectViewer.album.expand')} onClick={toggleExpand}>
                    <Text as="span" variant="body-medium" className="v2-line__title">
                      {item.prompt}
                    </Text>
                    <Text as="span" variant="body-small" className="v2-line__meta">
                      {[getModelName(item.providerId, item.modelConfigId), item.format?.toUpperCase(), item.size ? sizeLabel(item.size) : null, shortDate(item.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </button>
                  <span className="v2-line__tags">
                    <TagLine tags={item.tags} onTagClick={toggleTag} limit={3} />
                  </span>
                  <span className="v2-line__actions">{itemMenu(item)}</span>
                </div>
                <audio
                  ref={(el) => {
                    audioRefs.current[item.id] = el;
                  }}
                  src={imageDisplayUrl(item.imageUrl)}
                  controls={expanded}
                  preload={expanded ? undefined : 'none'}
                  className={expanded ? 'v2-line__player' : 'hidden'}
                  onPlay={() => setPlayingAudio(item.id)}
                  onPause={() => setPlayingAudio((cur) => (cur === item.id ? null : cur))}
                  onEnded={() => setPlayingAudio((cur) => (cur === item.id ? null : cur))}
                />
                {expanded && (
                  <div className="v2-line__details">
                    <Text variant="body-medium" className="whitespace-pre-wrap">
                      {item.prompt}
                    </Text>
                    {item.textContent && <div className="v2-code-block">{item.textContent}</div>}
                    <TagLine tags={item.tags} onTagClick={toggleTag} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="v2-shots" data-selecting={selecting ? '' : undefined}>
          {albumItems.map((item, index) => {
            const selected = selectedAlbumIds.has(item.id);
            const filename = albumFilename(item);
            return (
              <article key={item.id} id={`album-item-${item.id}`} className="v2-shot" data-selected={selected ? '' : undefined}>
                <div className="v2-shot__frame" style={{ aspectRatio: cssAspectRatio(item.aspectRatio) }}>
                  <button type="button" className="v2-shot__open" onClick={(e) => (selecting ? toggleAlbumSelection(item.id, e.shiftKey, itemIds) : openLightbox(item))} aria-label={isVideo ? t('projectViewer.album.playVideo') : filename}>
                    <img src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)} alt={item.prompt} referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                    {isVideo && (
                      <span className="v2-shot__play">
                        <Icon name="play_arrow" size={28} filled />
                      </span>
                    )}
                  </button>
                  {selectBox(item, filename, 'v2-shot__check')}
                  <div className="v2-shot__tools">
                    <IconButton icon="delete" size="xs" className="v2-shot__tool" label={t('projectViewer.common.delete')} tooltip onClick={() => deleteItems([item])} />
                    {onReuseWorkflow && (
                      <IconButton
                        icon={reusingAlbumItemId === item.id ? <LoadingIndicator size={16} aria-hidden /> : 'history'}
                        size="xs"
                        className="v2-shot__tool"
                        label={t('projectViewer.album.reuseWorkflow')}
                        tooltip
                        disabled={Boolean(reusingAlbumItemId)}
                        onClick={() => onReuseWorkflow(item)}
                      />
                    )}
                    {itemMenu(item, { media: true, className: 'v2-shot__tool' })}
                  </div>
                  <span className="v2-shot__index">
                    {item.aspectRatio && <span>{item.aspectRatio}</span>}
                    <span>#{indexLabel(index)}</span>
                  </span>
                </div>
                <div className="v2-shot__caption">
                  <button type="button" className="v2-shot__name" title={`${filename}\n${t('projectViewer.album.viewFullPrompt')}`} onClick={() => setInfoItem(item)}>
                    {filename}
                  </button>
                  <span className="v2-shot__sub">{[getModelName(item.providerId, item.modelConfigId), shortDate(item.createdAt)].filter(Boolean).join(' · ')}</span>
                  <TagLine tags={item.tags} onTagClick={toggleTag} limit={3} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {total > 0 && <PagedFooter className="v2-results-footer" page={page} pageSize={pageSize} total={total} pages={pages} onPageChange={props.onPageChange} onPageSizeChange={props.onPageSizeChange} />}
      {total > 0 && albumItems.length > 0 && <p className="v2-results-total">{isText ? t('v2.project.itemCount', { count: total }) : `${t('v2.project.itemCount', { count: total })} · ${formatBytes(totalSize)}`}</p>}

      <Dialog open={videoItem !== null} onClose={() => setVideoItem(null)} maxWidth={1100} className="v2-video-dialog" headline={videoItem ? albumFilename(videoItem) : undefined} actions={<Button variant="text" onClick={() => setVideoItem(null)}>{t('projectViewer.common.close')}</Button>}>
        {videoItem && (
          <video
            src={imageDisplayUrl(videoItem.imageUrl)}
            poster={videoItem.optimizedUrl || videoItem.thumbnailUrl ? imageDisplayUrl(videoItem.optimizedUrl || videoItem.thumbnailUrl) : undefined}
            controls
            autoPlay
            className="v2-media-player max-h-[75vh]"
          />
        )}
      </Dialog>
      <AlbumPromptDialog item={infoItem} headline={infoItem ? albumFilename(infoItem) : undefined} onClose={() => setInfoItem(null)}>
        {infoItem && <ParamTable label={t('v2.project.details')} rows={infoRows(infoItem)} />}
      </AlbumPromptDialog>
      <PromptDialog
        open={renameItem !== null}
        icon="edit"
        title={t('projectViewer.album.editFilename')}
        label={t('projectViewer.album.editFilename')}
        initialValue={renameItem ? albumFilename(renameItem) : ''}
        multiline
        confirmLabel={t('projectViewer.common.save')}
        cancelLabel={t('projectViewer.common.cancel')}
        onClose={() => setRenameItem(null)}
        onConfirm={submitRename}
      />
      {compareOpen && <TextAlbumCompareDialog items={selectedItems} setLightboxData={setLightboxData} onClose={() => setCompareOpen(false)} />}
      <TextAlbumDetailDialog items={albumItems} startIndex={detailIndex} setLightboxData={setLightboxData} onClose={() => setDetailIndex(null)} />
      <ExportPackageDialog
        open={exportOpen}
        defaultValue={`${(projectName || t('projectViewer.tabs.album')).replace(/[^a-zA-Z0-9-_]/g, '_')}_${t('projectViewer.tabs.album')}.zip`}
        itemCount={exportItemIds?.length ?? total}
        onClose={() => setExportOpen(false)}
        onSubmit={handleExport}
        onWatermark={!isText && !isVideo && !isAudio ? handleWatermarkExport : undefined}
      />
      {transferAction && (
        <AlbumTransferDialog
          projectId={projectId}
          projectName={projectName}
          mediaType={mediaType}
          projectType={sourceProjectType || projectType}
          initialAction={transferAction}
          items={hasSelection ? selectedItems : albumItems}
          useAllAlbumScope={!hasSelection && useAllScope}
          itemCount={hasSelection ? selectedItems.length : useAllScope ? total : albumItems.length}
          totalSize={!hasSelection && useAllScope ? totalSize : undefined}
          canMove={hasSelection}
          onClose={() => setTransferAction(null)}
          onDone={(_action, moved) => {
            setTransferAction(null);
            if (moved.length > 0) onAlbumItemsMoved?.(moved);
          }}
        />
      )}
      <TagDialog open={tagItem !== null} initialTags={tagItem?.tags || []} title={t('projectViewer.album.editTags')} description={tagItem ? albumFilename(tagItem) : undefined} onClose={() => setTagItem(null)} onSave={(tags) => void saveItemTags(tags)} />
      <AlbumBatchTagDialog open={batchTagOpen} targetCount={hasSelection ? selectedIds.length : total} isAllScope={!hasSelection} suggestions={tagCounts} onClose={() => setBatchTagOpen(false)} onApply={applyBatchTags} />
      <AutoTagDialog open={autoTagOpen} itemCount={hasSelection ? selectedIds.length : total} onClose={() => setAutoTagOpen(false)} onStart={startAlbumAutoTag} />
    </section>
  );
}

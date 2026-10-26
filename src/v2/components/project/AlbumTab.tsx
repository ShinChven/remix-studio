import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { imageDisplayUrl, startAlbumExport, startAutoTag, type AlbumExportVersion } from '../../../api';
import type { ProjectMediaType } from '../../../lib/project-media';
import { resourceRef } from '../../../lib/resource-ref';
import { Button, Checkbox, Dialog, Icon, IconButton, LoadingIndicator, MenuButton, MenuDivider, MenuItem, Select, Text, TextField } from '../../../m3';
import type { AlbumItem, AlbumTagCount, AlbumTagMatch, AspectRatioCount, ProjectType } from '../../../types';
import { withBase } from '../../app/paths';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { EmptyState } from '../../ui/Page';
import { PagedFooter, PAGE_SIZE_OPTIONS } from '../../ui/PagedFooter';
import { PromptDialog } from '../../ui/PromptDialog';
import { useToast } from '../../ui/useToast';
import { AutoTagDialog } from '../AutoTagDialog';
import { AutoTagProgress } from '../AutoTagProgress';
import { CopyRefButton } from '../CopyRefButton';
import { TagDialog } from '../TagDialog';
import { AlbumBatchTagDialog, AlbumPromptDialog, ExportPackageDialog, TextAlbumCompareDialog, TextAlbumDetailDialog, type AlbumBatchTagMode } from './AlbumDialogs';
import { AlbumTransferDialog, albumFilename, type AlbumTransferAction } from './AlbumTransferDialog';
import { PaneToolbar } from './PaneToolbar';

export interface AlbumLightboxData {
  images: string[];
  index: number;
  albumItemIds?: string[];
  onDelete?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}

export interface AlbumTabProps {
  projectId: string;
  projectName: string;
  albumItems: AlbumItem[];
  selectedAlbumIds: Set<string>;
  toggleSelectAllAlbum: (scopeIds?: string[]) => void;
  toggleAlbumSelection: (id: string, isShiftPressed: boolean, scopeIds?: string[]) => void;
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

// Date and time on a 24-hour clock, joined by a space, so the pill fits a narrow card.
function cardDate(ts: number, withYear: boolean) {
  const date = new Date(ts);
  const day = date.toLocaleDateString(undefined, { year: withYear ? '2-digit' : undefined, month: '2-digit', day: '2-digit' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${day} ${time}`;
}

function shortTimestamp(ts?: number) {
  return ts ? new Date(ts).toLocaleString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

function sizeLabel(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}M` : `${(bytes / 1024).toFixed(0)}K`;
}

/** Album search that waits for typing (and IME composition) to settle before filtering. */
function AlbumSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [composing, setComposing] = useState(false);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (composing || draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange, composing]);
  return (
    <TextField
      variant="outlined"
      type="search"
      leadingIcon="search"
      value={draft}
      onValueChange={setDraft}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
      onClear={
        draft
          ? () => {
              setDraft('');
              onChange('');
            }
          : undefined
      }
      placeholder={t('projectViewer.album.searchPlaceholder')}
      aria-label={t('projectViewer.album.searchPlaceholder')}
      className="v2-search-field v2-search-field--pill v2-album-search"
    />
  );
}

/** Checkbox menu for the aspect-ratio or tag filter. */
const FilterMenu = memo(function FilterMenu({
  icon,
  label,
  activeLabel,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
  header,
}: {
  icon: string;
  label: string;
  activeLabel: string;
  allLabel: string;
  options: { key: string; count: number }[];
  selected: string[];
  onToggle: (key: string) => void;
  onClear: () => void;
  header?: React.ReactNode;
}) {
  const active = selected.length > 0;
  return (
    <MenuButton
      placement="bottom-end"
      aria-label={label}
      trigger={(props) => (
        <Button {...props} variant={active ? 'tonal' : 'outlined'} size="xs" icon={icon} trailingIcon="arrow_drop_down" aria-label={label}>
          {active ? activeLabel : label}
        </Button>
      )}
    >
      <MenuItem icon="select_all" type="checkbox" checked={!active} onSelect={onClear}>
        {allLabel}
      </MenuItem>
      {header}
      <MenuDivider />
      {options.map(({ key, count }) => (
        <MenuItem key={key} type="checkbox" checked={selected.includes(key)} keepOpen onSelect={() => onToggle(key)} trailingText={String(count)}>
          {key}
        </MenuItem>
      ))}
    </MenuButton>
  );
});

/** Tag chips on an album card or row; clicking one filters by it. */
function TagChips({ tags, onTagClick, limit }: { tags?: string[]; onTagClick?: (tag: string) => void; limit?: number }) {
  if (!tags || tags.length === 0) return null;
  const shown = limit ? tags.slice(0, limit) : tags;
  const overflow = tags.length - shown.length;
  return (
    <span className="v2-tag-row">
      {shown.map((tag) => (
        <button
          key={tag}
          type="button"
          className="v2-tag-mini v2-tag-mini--button"
          title={tag}
          disabled={!onTagClick}
          onClick={(e) => {
            e.stopPropagation();
            onTagClick?.(tag);
          }}
        >
          {tag}
        </button>
      ))}
      {overflow > 0 && <span className="v2-tag-overflow">+{overflow}</span>}
    </span>
  );
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
  const navigate = useNavigate();
  const isText = projectType === 'text';
  const isVideo = projectType === 'video';
  const isAudio = projectType === 'audio';
  const mediaType: ProjectMediaType = isText ? 'text' : isVideo ? 'video' : isAudio ? 'audio' : 'image';
  // Video and audio would need frames or a transcript first.
  const canAutoTag = mediaType === 'image' || mediaType === 'text';

  const [promptItem, setPromptItem] = useState<AlbumItem | null>(null);
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

  const actions: ActionMenuItem[] = [
    { key: 'export', label: hasSelection ? t('projectViewer.album.exportSelected') : useAllScope ? t('projectViewer.album.exportAll') : t('projectViewer.album.exportPage'), icon: 'folder_zip', onSelect: () => openExport(!hasSelection) },
    { key: 'tag', label: hasSelection ? t('projectViewer.album.tagSelected') : useAllScope ? t('projectViewer.album.tagAll') : t('projectViewer.album.tagResults'), icon: 'sell', onSelect: () => setBatchTagOpen(true) },
    { key: 'autotag', hidden: !canAutoTag, label: hasSelection ? t('projectViewer.album.autoTagSelected') : useAllScope ? t('projectViewer.album.autoTagAll') : t('projectViewer.album.autoTagResults'), icon: 'wand_stars', onSelect: () => setAutoTagOpen(true) },
    { key: 'copy', label: hasSelection ? t('projectViewer.transfer.copyTo') : useAllScope ? t('projectViewer.transfer.copyAllTo') : t('projectViewer.transfer.copyPageTo'), icon: 'content_copy', onSelect: () => setTransferAction('copy') },
    { key: 'move', hidden: !hasSelection, label: t('projectViewer.transfer.moveTo'), icon: 'drive_file_move', onSelect: () => setTransferAction('move') },
    { key: 'compare', hidden: !(isText && selectedIds.length > 1), label: t('projectViewer.album.compareSelected'), icon: 'view_column', onSelect: () => setCompareOpen(true) },
    { key: 'delete', hidden: !hasSelection, divider: true, danger: true, label: t('projectViewer.common.deleteSelected'), icon: 'delete', onSelect: () => deleteItems(selectedItems) },
  ];
  const actionsMenu = (
    <ActionMenu
      label={t('projectViewer.album.actions')}
      items={actions}
      placement="bottom-start"
      trigger={(p) => (
        <Button {...p} variant="tonal" size="xs" trailingIcon="arrow_drop_down" disabled={isLoading || (!hasSelection && total === 0)}>
          {t('projectViewer.album.actions')}
        </Button>
      )}
    />
  );

  const itemButtons = (item: AlbumItem) => (
    <>
      <CopyRefButton reference={resourceRef.albumItem(projectId, item.id)} />
      <IconButton icon="sell" size="xs" label={t('projectViewer.album.editTags')} tooltip onClick={() => setTagItem(item)} />
      {onReuseWorkflow && (
        <IconButton
          icon={reusingAlbumItemId === item.id ? <LoadingIndicator size={18} aria-hidden /> : 'history'}
          size="xs"
          label={t('projectViewer.album.reuseWorkflow')}
          tooltip
          disabled={Boolean(reusingAlbumItemId)}
          onClick={() => onReuseWorkflow(item)}
        />
      )}
    </>
  );

  const emptyIcon = isText ? 'article' : isVideo ? 'movie' : isAudio ? 'music_note' : 'photo_library';
  const target = isText ? t('projectViewer.album.collection') : isVideo ? t('projectViewer.album.reel') : isAudio ? t('projectViewer.album.audioCollection') : t('projectViewer.tabs.album').toLowerCase();

  return (
    <section>
      <PaneToolbar
        totalCount={albumItems.length}
        selectedCount={selectedIds.length}
        isLoading={isLoading}
        onToggleSelectAll={() => toggleSelectAllAlbum(itemIds)}
        prefix={
          !isText && (
            <Text as="span" variant="label-medium" className="flex items-center gap-1 text-primary">
              <Icon name="stacks" size={16} />
              {(totalSize / (1024 * 1024)).toFixed(2)} MB
            </Text>
          )
        }
        selectionActions={actionsMenu}
        zeroSelectionActions={actionsMenu}
        rightActions={
          <>
            <AlbumSearch value={search} onChange={props.onSearchChange} />
            {showRatioFilter && (
              <FilterMenu
                icon="aspect_ratio"
                label={t('projectViewer.album.aspectRatioFilter')}
                activeLabel={t('projectViewer.album.aspectRatioFilterCount', { count: selectedAspectRatios.length })}
                allLabel={t('projectViewer.album.allAspectRatios')}
                options={aspectRatioCounts.map(({ ratio, count }) => ({ key: ratio, count }))}
                selected={selectedAspectRatios}
                onToggle={toggleRatio}
                onClear={() => props.onSelectedAspectRatiosChange([])}
              />
            )}
            {(tagCounts.length > 0 || hasTagFilter) && (
              <FilterMenu
                icon="sell"
                label={t('projectViewer.album.tagFilter')}
                activeLabel={t('projectViewer.album.tagFilterCount', { count: selectedTags.length })}
                allLabel={t('projectViewer.album.allTags')}
                options={tagCounts.map(({ tag, count }) => ({ key: tag, count }))}
                selected={selectedTags}
                onToggle={toggleTag}
                onClear={() => props.onSelectedTagsChange([])}
                header={
                  <>
                    <MenuDivider />
                    <MenuItem type="radio" checked={tagMatch === 'all'} keepOpen onSelect={() => props.onTagMatchChange('all')}>
                      {t('projectViewer.album.tagMatchAll')}
                    </MenuItem>
                    <MenuItem type="radio" checked={tagMatch === 'any'} keepOpen onSelect={() => props.onTagMatchChange('any')}>
                      {t('projectViewer.album.tagMatchAny')}
                    </MenuItem>
                  </>
                }
              />
            )}
            <Select
              variant="outlined"
              aria-label={t('pagination.pageSize')}
              leadingIcon="view_agenda"
              value={String(pageSize)}
              onChange={(v) => props.onPageSizeChange(v === 'all' ? 'all' : Number(v))}
              options={PAGE_SIZE_OPTIONS.map((o) => ({ value: String(o), label: o === 'all' ? t('pagination.all') : String(o) }))}
              className="v2-inline-select v2-inline-select--narrow"
            />
            <Button variant="outlined" size="xs" icon={sort === 'newest' ? 'arrow_downward' : 'arrow_upward'} onClick={() => props.onSortChange(sort === 'newest' ? 'oldest' : 'newest')}>
              {sort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
            </Button>
          </>
        }
      />

      {canAutoTag && <AutoTagProgress scope={{ kind: 'album', projectId }} runKey={autoTagRunKey} className="v2-pane-inset" />}

      {total === 0 && !hasRatioFilter && !hasTagFilter && !hasSearch ? (
        <EmptyState
          icon={emptyIcon}
          shape="sunny"
          className="v2-pane-empty"
          title={isText ? t('projectViewer.album.noTexts') : isVideo ? t('projectViewer.album.noVideos') : isAudio ? t('projectViewer.album.noAudios') : t('projectViewer.album.galleryEmpty')}
          description={t('projectViewer.album.emptyDescription', { target })}
        />
      ) : albumItems.length === 0 ? (
        <EmptyState icon="filter_alt_off" className="v2-pane-empty" title={t('projectViewer.album.noFilterMatches')} description={t('projectViewer.album.noFilterMatchesDescription')} />
      ) : isText ? (
        <div className="v2-job-list">
          {albumItems.map((item, index) => {
            const selected = selectedAlbumIds.has(item.id);
            return (
              <div key={item.id} className="v2-album-row" data-selected={selected ? '' : undefined}>
                <span
                  className="v2-job__check"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAlbumSelection(item.id, e.shiftKey, itemIds);
                  }}
                >
                  <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={`#${index + 1}`} />
                </span>
                <button type="button" className="v2-album-row__main m3-focus-ring" title={t('projectViewer.album.viewTextDetails')} onClick={() => setDetailIndex(index)}>
                  <span className="v2-album-row__index">#{(index + 1).toString().padStart(2, '0')}</span>
                  <Text as="span" variant="body-small" className="min-w-0 flex-1 truncate">
                    {item.textContent || item.prompt}
                  </Text>
                  {(item.imageContexts?.length || 0) > 0 && <span className="v2-info-chip v2-pane-wide">{t('projectViewer.album.imageContexts', { count: item.imageContexts?.length || 0 })}</span>}
                </button>
                <span className="v2-album-row__tags">
                  <TagChips tags={item.tags} onTagClick={toggleTag} limit={2} />
                </span>
                {itemButtons(item)}
                <IconButton icon="delete" size="xs" label={t('projectViewer.common.delete')} tooltip onClick={() => deleteItems([item])} />
              </div>
            );
          })}
        </div>
      ) : isAudio ? (
        <div className="flex flex-col gap-2 p-3">
          {albumItems.map((item, index) => {
            const selected = selectedAlbumIds.has(item.id);
            const expanded = expandedAudio.has(item.id);
            const playing = playingAudio === item.id;
            const toggleExpand = () =>
              setExpandedAudio((prev) => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                return next;
              });
            const audioEl = (controls: boolean) => (
              <audio
                ref={(el) => {
                  audioRefs.current[item.id] = el;
                }}
                src={imageDisplayUrl(item.imageUrl)}
                controls={controls}
                preload={controls ? undefined : 'none'}
                className={controls ? 'w-full' : 'hidden'}
                onPlay={() => setPlayingAudio(item.id)}
                onPause={() => setPlayingAudio((cur) => (cur === item.id ? null : cur))}
                onEnded={() => setPlayingAudio((cur) => (cur === item.id ? null : cur))}
              />
            );
            return (
              <div key={item.id} className="v2-audio-card" data-selected={selected ? '' : undefined} data-playing={playing ? '' : undefined}>
                <div className="v2-audio-card__head">
                  <span
                    className="v2-job__check"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAlbumSelection(item.id, e.shiftKey, itemIds);
                    }}
                  >
                    <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={`#${index + 1}`} />
                  </span>
                  <span className="v2-album-row__index">#{(index + 1).toString().padStart(2, '0')}</span>
                  <button type="button" className="v2-album-row__main m3-focus-ring" title={expanded ? t('projectViewer.album.collapse') : t('projectViewer.album.expand')} onClick={toggleExpand}>
                    <Text as="span" variant="body-medium" className="min-w-0 flex-1 truncate">
                      {item.prompt}
                    </Text>
                  </button>
                  {item.createdAt && (
                    <Text as="span" variant="label-small" className="v2-pane-wide whitespace-nowrap text-on-surface-variant">
                      {shortTimestamp(item.createdAt)}
                    </Text>
                  )}
                  <IconButton icon={playing ? 'pause' : 'play_arrow'} variant={playing ? 'filled' : 'tonal'} size="xs" label={playing ? t('projectViewer.album.pauseAudio') : t('projectViewer.album.playAudio')} onClick={() => toggleAudioPlayback(item.id)} />
                  {itemButtons(item)}
                  <IconButton icon="delete" size="xs" label={t('projectViewer.common.delete')} tooltip onClick={() => deleteItems([item])} />
                  <IconButton icon={expanded ? 'expand_less' : 'expand_more'} size="xs" label={expanded ? t('projectViewer.album.collapse') : t('projectViewer.album.expand')} onClick={toggleExpand} />
                </div>
                {expanded ? (
                  <div className="flex flex-col gap-3 pt-3">
                    <TagChips tags={item.tags} onTagClick={toggleTag} />
                    <Text variant="body-medium" className="whitespace-pre-wrap">
                      {item.prompt}
                    </Text>
                    {item.textContent && (
                      <div className="flex flex-col gap-1">
                        <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                          {t('projectViewer.common.generatedText')}
                        </Text>
                        <div className="v2-code-block">{item.textContent}</div>
                      </div>
                    )}
                    {audioEl(true)}
                    <div className="flex flex-wrap gap-1">
                      <span className="v2-info-chip">{getProviderName(item.providerId)}</span>
                      <span className="v2-info-chip" data-tone="primary">
                        {getModelName(item.providerId, item.modelConfigId)}
                      </span>
                      {item.format && <span className="v2-info-chip">{item.format}</span>}
                      {item.size && <span className="v2-info-chip">{(item.size / 1024).toFixed(1)} KB</span>}
                      {item.createdAt && <span className="v2-info-chip">{shortTimestamp(item.createdAt)}</span>}
                    </div>
                  </div>
                ) : (
                  audioEl(false)
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="v2-album-grid">
          {albumItems.map((item, index) => {
            const selected = selectedAlbumIds.has(item.id);
            const filename = albumFilename(item);
            return (
              <article key={item.id} id={`album-item-${item.id}`} className="v2-album-card" data-selected={selected ? '' : undefined}>
                <div className="v2-album-card__media" style={{ aspectRatio: cssAspectRatio(item.aspectRatio) }}>
                  <button type="button" className="v2-album-card__open" onClick={() => openLightbox(item)} aria-label={isVideo ? t('projectViewer.album.playVideo') : filename}>
                    <img src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)} alt={item.prompt} referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                    {isVideo && (
                      <span className="v2-tile__overlay">
                        <Icon name="play_arrow" size={32} filled />
                      </span>
                    )}
                  </button>
                  <span
                    className="v2-tile__check"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAlbumSelection(item.id, e.shiftKey, itemIds);
                    }}
                  >
                    <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={filename} />
                  </span>
                  <div className="v2-album-card__quick">
                    <IconButton icon="delete" size="xs" variant="filled" className="v2-button-danger" label={t('projectViewer.common.delete')} tooltip onClick={() => deleteItems([item])} />
                    <IconButton icon="open_in_new" size="xs" variant="tonal" label={t('projectViewer.album.openOriginal')} tooltip href={imageDisplayUrl(item.imageUrl)} target="_blank" rel="noreferrer" />
                    {!isVideo && <IconButton icon="approval" size="xs" variant="tonal" label={t('projectViewer.album.quickWatermark')} tooltip href={withBase(`/project/${projectId}/album/${item.id}/watermark`)} target="_blank" rel="noreferrer" />}
                  </div>
                  <div className="v2-album-card__pills">
                    {item.aspectRatio && <span className="v2-album-pill">{item.aspectRatio}</span>}
                    {item.createdAt && (
                      <>
                        <span className="v2-album-pill v2-card-narrow">{cardDate(item.createdAt, false)}</span>
                        <span className="v2-album-pill v2-card-wide">{cardDate(item.createdAt, true)}</span>
                      </>
                    )}
                  </div>
                  <span className="v2-album-card__index">#{(index + 1).toString().padStart(2, '0')}</span>
                </div>
                <div className="v2-album-card__body">
                  <div className="v2-album-card__title">
                    <Text as="h3" variant="title-small" emphasized className="min-w-0 flex-1 truncate" title={filename}>
                      {filename}
                    </Text>
                    <IconButton icon="edit" size="xs" label={t('projectViewer.album.editFilename')} tooltip onClick={() => setRenameItem(item)} />
                    {itemButtons(item)}
                  </div>
                  {/* Once anything is tagged the row stays on every card, so the rows below line up. */}
                  {tagCounts.length > 0 && (
                    <div className="v2-album-card__tags">
                      <TagChips tags={item.tags} onTagClick={toggleTag} limit={4} />
                    </div>
                  )}
                  <button type="button" className="v2-album-card__prompt" title={t('projectViewer.album.viewFullPrompt')} onClick={() => setPromptItem(item)}>
                    {item.prompt}
                  </button>
                  <div className="v2-album-card__meta">
                    <span className="v2-info-chip" title={getProviderName(item.providerId)}>
                      {getProviderName(item.providerId)}
                    </span>
                    <span className="v2-info-chip" data-tone="primary" title={getModelName(item.providerId, item.modelConfigId)}>
                      {getModelName(item.providerId, item.modelConfigId)}
                    </span>
                  </div>
                  <div className="v2-album-card__sizes">
                    {[
                      { label: t('projectViewer.album.raw'), size: item.size },
                      { label: t('projectViewer.album.optimized'), size: item.optimizedSize },
                      { label: t('projectViewer.album.thumbnail'), size: item.thumbnailSize },
                    ].map((s) =>
                      s.size ? (
                        <span key={s.label}>
                          <em>{s.label}</em> {sizeLabel(s.size)}
                        </span>
                      ) : null,
                    )}
                  </div>
                  <div className="v2-album-card__specs">
                    {item.resolution ? <span>{item.resolution}</span> : item.quality ? <span>{item.quality}</span> : null}
                    {item.duration != null && <span>{item.duration}s</span>}
                    {item.format && <span>{item.format}</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {total > 0 && <PagedFooter page={page} pageSize={pageSize} total={total} pages={pages} onPageChange={props.onPageChange} onPageSizeChange={props.onPageSizeChange} />}

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
      <AlbumPromptDialog item={promptItem} onClose={() => setPromptItem(null)} />
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

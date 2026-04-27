import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Layers, CheckSquare, Square, Trash2, ImageIcon, CheckCircle2, ExternalLink, FileArchive, FileText, Play, Pause, Video as VideoIcon, Music, Copy, ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronDown, Pencil, X, Filter } from 'lucide-react';
import { AlbumItem, ProjectType } from '../../types';
import { imageDisplayUrl, startAlbumExport } from '../../api';
import type { AlbumExportVersion } from '../../api';
import { AlbumPromptModal } from './AlbumPromptModal';
import { ExportPackageDialog } from './ExportPackageDialog';
import { TextAlbumCompareDialog } from './TextAlbumCompareDialog';
import { TextAlbumDetailDialog } from './TextAlbumDetailDialog';
import { CopyToLibraryDialog } from './CopyToLibraryDialog';
import { SelectionToolbar } from './SelectionToolbar';
import { EmptyState } from './EmptyState';

import { toast } from 'sonner';

interface AlbumTabProps {
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
  setLightboxData: (data: { images: string[], index: number, albumItemIds?: string[], onDelete?: (index: number) => void, onIndexChange?: (index: number) => void } | null) => void;
  onRenameAlbumItem: (itemId: string, filename: string) => Promise<AlbumItem>;
  onExportStarted: () => void;
  projectType?: ProjectType;
}

function normalizeAspectRatio(value?: string) {
  const ratio = value?.trim();
  if (!ratio) return '';

  const exactSizeMatch = ratio.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!exactSizeMatch) return ratio.replace(/\s+/g, '');

  const width = Number(exactSizeMatch[1]);
  const height = Number(exactSizeMatch[2]);
  if (!width || !height) return ratio;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
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

interface AspectRatioFilterControlProps {
  options: { ratio: string; count: number }[];
  selectedAspectRatios: string[];
  hasAspectRatioFilter: boolean;
  onToggle: (ratio: string) => void;
  onClear: () => void;
}

const AspectRatioFilterControl = memo(function AspectRatioFilterControl({
  options,
  selectedAspectRatios,
  hasAspectRatioFilter,
  onToggle,
  onClear,
}: AspectRatioFilterControlProps) {
  const { t } = useTranslation();
  const [showAspectRatioFilter, setShowAspectRatioFilter] = useState(false);

  useEffect(() => {
    if (!showAspectRatioFilter) return;
    const handleClick = () => setShowAspectRatioFilter(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showAspectRatioFilter]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setShowAspectRatioFilter((show) => !show)}
        title={t('projectViewer.album.aspectRatioFilter')}
        aria-label={t('projectViewer.album.aspectRatioFilter')}
        className={`flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-all ${
          hasAspectRatioFilter
            ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border-blue-500/30'
            : 'bg-white/5 hover:bg-white/10 text-neutral-200 border-neutral-700'
        }`}
      >
        <Filter className="w-3 h-3" />
        <span className="hidden sm:inline">
          {selectedAspectRatios.length === 0
            ? t('projectViewer.album.aspectRatioFilter')
            : t('projectViewer.album.aspectRatioFilterCount', { count: selectedAspectRatios.length })}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showAspectRatioFilter ? 'rotate-180' : ''}`} />
      </button>

      {showAspectRatioFilter && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] p-2 animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={onClear}
            className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors mb-1 ${
              !hasAspectRatioFilter ? 'bg-blue-600 text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            {t('projectViewer.album.allAspectRatios')}
          </button>
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {options.map(({ ratio, count }) => {
              const isChecked = selectedAspectRatios.includes(ratio);
              return (
                <label
                  key={ratio}
                  className={`w-full px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    isChecked ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  <span>{ratio}</span>
                  <span className="ml-auto rounded-md bg-neutral-100 px-1.5 py-0.5 text-[9px] font-black text-neutral-500 dark:bg-neutral-950 dark:text-neutral-500">
                    {count}
                  </span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(ratio)}
                    className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-950 text-blue-500 focus:ring-blue-500"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export function AlbumTab({
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
  onExportStarted,
  projectType = 'image',
}: AlbumTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const getDefaultExportPackageName = (name: string) => {
    const safeName = (name || t('projectViewer.tabs.album')).replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${safeName}_${t('projectViewer.tabs.album')}.zip`;
  };

  const isTextProject = projectType === 'text';
  const isVideoProject = projectType === 'video';
  const isAudioProject = projectType === 'audio';
  const [promptItem, setPromptItem] = useState<AlbumItem | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [pendingExportItemIds, setPendingExportItemIds] = useState<string[] | undefined>();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [videoPlayerItem, setVideoPlayerItem] = useState<AlbumItem | null>(null);
  const [expandedAudioIds, setExpandedAudioIds] = useState<Set<string>>(new Set());
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [albumSort, setAlbumSort] = useState<'newest' | 'oldest'>('newest');
  const [selectedAspectRatios, setSelectedAspectRatios] = useState<string[]>([]);
  const [renameItem, setRenameItem] = useState<AlbumItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const getAlbumFilename = (item: AlbumItem) => {
    const path = (item.imageUrl || '').split('?')[0];
    const decoded = decodeURIComponent(path.split('/').pop() || '');
    return decoded || item.id;
  };

  const openRenameModal = (item: AlbumItem) => {
    setRenameItem(item);
    setRenameValue(getAlbumFilename(item));
  };

  const submitRename = async () => {
    if (!renameItem) return;
    const filename = renameValue.trim();
    if (!filename) {
      toast.error(t('projectViewer.album.filenameRequired'));
      return;
    }
    const duplicate = albumItems.some((item) => item.id !== renameItem.id && getAlbumFilename(item).trim().toLowerCase() === filename.toLowerCase());
    if (duplicate) {
      toast.error(t('projectViewer.album.filenameDuplicate'));
      return;
    }
    try {
      setIsRenaming(true);
      await onRenameAlbumItem(renameItem.id, filename);
      toast.success(t('projectViewer.album.filenameUpdated'));
      setRenameItem(null);
    } catch (err: any) {
      toast.error(err.message || t('projectViewer.album.filenameUpdateFailed'));
    } finally {
      setIsRenaming(false);
    }
  };

  const aspectRatioOptions = useMemo(() => {
    const ratioCounts = new Map<string, number>();
    albumItems.forEach((item) => {
      const ratio = normalizeAspectRatio(item.aspectRatio);
      if (ratio) ratioCounts.set(ratio, (ratioCounts.get(ratio) || 0) + 1);
    });
    return Array.from(ratioCounts.entries()).map(([ratio, count]) => ({ ratio, count })).sort((a, b) => {
      const toNumber = (value: string) => {
        const [width, height] = value.split(':').map(Number);
        if (!width || !height) return Number.POSITIVE_INFINITY;
        return width / height;
      };
      const numericDiff = toNumber(a.ratio) - toNumber(b.ratio);
      return Number.isFinite(numericDiff) && numericDiff !== 0 ? numericDiff : a.ratio.localeCompare(b.ratio);
    });
  }, [albumItems]);

  useEffect(() => {
    const availableRatios = new Set(aspectRatioOptions.map((option) => option.ratio));
    setSelectedAspectRatios((current) => current.filter((ratio) => availableRatios.has(ratio)));
  }, [aspectRatioOptions]);

  const hasAspectRatioFilter = selectedAspectRatios.length > 0;
  const showAspectRatioFilterControl = !isTextProject && !isAudioProject && aspectRatioOptions.length > 0;

  const toggleAspectRatioFilter = useCallback((ratio: string) => {
    setSelectedAspectRatios((current) => (
      current.includes(ratio)
        ? current.filter((item) => item !== ratio)
        : [...current, ratio]
    ));
  }, []);

  const clearAspectRatioFilter = useCallback(() => {
    setSelectedAspectRatios([]);
  }, []);

  const displayItems = useMemo(() => {
    const filteredItems = hasAspectRatioFilter
      ? albumItems.filter((item) => {
          const ratio = normalizeAspectRatio(item.aspectRatio);
          return !!ratio && selectedAspectRatios.includes(ratio);
        })
      : albumItems;
    return [...filteredItems].sort((a, b) => {
      const aTs = a.createdAt ?? 0;
      const bTs = b.createdAt ?? 0;
      return albumSort === 'newest' ? bTs - aTs : aTs - bTs;
    });
  }, [albumItems, albumSort, hasAspectRatioFilter, selectedAspectRatios]);

  const displayItemIds = useMemo(() => displayItems.map((item) => item.id), [displayItems]);
  const selectedDisplayItemIds = useMemo(
    () => displayItemIds.filter((id) => selectedAlbumIds.has(id)),
    [displayItemIds, selectedAlbumIds]
  );
  const hasVisibleSelection = selectedDisplayItemIds.length > 0;
  const bulkItemIds = hasVisibleSelection
    ? selectedDisplayItemIds
    : hasAspectRatioFilter
      ? displayItemIds
      : albumItems.map((item) => item.id);

  const toggleAudioExpand = (id: string) => {
    setExpandedAudioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAudioPlayback = (id: string) => {
    const target = audioRefs.current[id];
    if (!target) return;
    if (!target.paused) {
      target.pause();
      return;
    }
    if (playingAudioId && playingAudioId !== id) {
      const prev = audioRefs.current[playingAudioId];
      if (prev) prev.pause();
    }
    target.play().catch(() => {});
  };

  const formatAudioTimestamp = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString(undefined, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const selectedTextItems = displayItems.filter((item) => selectedAlbumIds.has(item.id));
  const copyItemIds = bulkItemIds;

  const openExportDialog = (isAll: boolean) => {
    setPendingExportItemIds(isAll && !hasAspectRatioFilter ? undefined : bulkItemIds);
    setIsExportDialogOpen(true);
  };

  const handleExport = async (packageName: string, exportVersion: AlbumExportVersion) => {
    try {
      await startAlbumExport(projectId, pendingExportItemIds, packageName, exportVersion);
      onExportStarted();
      navigate('/exports');
      toast.success(t('projectViewer.album.exportQueued'));
    } catch (err: any) {
      toast.error(t('projectViewer.album.exportFailed', { message: err.message }));
      throw err;
    }
  };

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-0">
        {albumItems.length > 0 && (
          <SelectionToolbar
            totalCount={displayItems.length}
            selectedCount={selectedDisplayItemIds.length}
            onToggleSelectAll={() => toggleSelectAllAlbum(displayItemIds)}
            mobileSingleLine
            mobileActionsRight
            prefix={!isTextProject && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">
                <Layers className="w-4 h-4 text-blue-500" />
                <span className="text-blue-500/80">
                  {((albumItems || []).reduce((acc, item) => acc + (item.size || 0), 0) / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            )}
            rightActions={
              <>
                <button
                  onClick={() => openExportDialog(!hasVisibleSelection)}
                  title={hasVisibleSelection ? t('projectViewer.album.exportSelected') : t('projectViewer.album.exportAll')}
                  aria-label={hasVisibleSelection ? t('projectViewer.album.exportSelected') : t('projectViewer.album.exportAll')}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all disabled:opacity-50"
                >
                  <FileArchive className="w-3 h-3" />
                  <span className="hidden sm:inline">
                    {hasVisibleSelection ? t('projectViewer.album.exportSelected') : t('projectViewer.album.exportAll')}
                  </span>
                </button>
                <button
                  onClick={() => setShowCopyDialog(true)}
                  title={hasVisibleSelection ? t('projectViewer.common.copyToLibrary') : t('projectViewer.album.copyAllToLibrary')}
                  aria-label={hasVisibleSelection ? t('projectViewer.common.copyToLibrary') : t('projectViewer.album.copyAllToLibrary')}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-purple-500/20 transition-all"
                >
                  <Copy className="w-3 h-3" />
                  <span className="hidden sm:inline">
                    {hasVisibleSelection ? t('projectViewer.common.copyToLibrary') : t('projectViewer.album.copyAllToLibrary')}
                  </span>
                </button>
                {isTextProject && selectedDisplayItemIds.length > 1 && (
                  <button
                    onClick={() => setShowCompareDialog(true)}
                    title={t('projectViewer.album.compareSelected')}
                    aria-label={t('projectViewer.album.compareSelected')}
                    className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 text-[9px] font-black uppercase tracking-widest rounded-lg border border-neutral-700 transition-all"
                  >
                    <Layers className="w-3 h-3" />
                    <span className="hidden sm:inline">{t('projectViewer.album.compareSelected')}</span>
                  </button>
                )}
                {hasVisibleSelection && (
                  <button
                    onClick={() => {
                      const itemsToDelete = displayItems.filter(item => selectedAlbumIds.has(item.id));
                      setAlbumItemsToDelete(itemsToDelete);
                      setShowDeleteAlbumModal(true);
                    }}
                    title={t('projectViewer.common.deleteSelected')}
                    aria-label={t('projectViewer.common.deleteSelected')}
                    className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="hidden sm:inline">{t('projectViewer.common.deleteSelected')}</span>
                  </button>
                )}
                {showAspectRatioFilterControl && (
                  <AspectRatioFilterControl
                    options={aspectRatioOptions}
                    selectedAspectRatios={selectedAspectRatios}
                    hasAspectRatioFilter={hasAspectRatioFilter}
                    onToggle={toggleAspectRatioFilter}
                    onClear={clearAspectRatioFilter}
                  />
                )}
                <button
                  onClick={() => setAlbumSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
                  title={albumSort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
                  aria-label={albumSort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
                  className="flex items-center justify-center gap-1.5 min-h-8 min-w-8 px-2 sm:px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 text-[9px] font-black uppercase tracking-widest rounded-lg border border-neutral-700 transition-all"
                >
                  {albumSort === 'newest' ? (
                    <ArrowDownWideNarrow className="w-3 h-3" />
                  ) : (
                    <ArrowUpWideNarrow className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline">
                    {albumSort === 'newest' ? t('projectViewer.album.sortNewest') : t('projectViewer.album.sortOldest')}
                  </span>
                </button>
              </>
            }
          />
        )}

        {albumItems.length === 0 ? (
          <EmptyState
            Icon={isTextProject ? FileText : isVideoProject ? VideoIcon : isAudioProject ? Music : ImageIcon}
            title={isTextProject ? t('projectViewer.album.noTexts') : isVideoProject ? t('projectViewer.album.noVideos') : isAudioProject ? t('projectViewer.album.noAudios') : t('projectViewer.album.galleryEmpty')}
            description={t('projectViewer.album.emptyDescription', { target: isTextProject ? t('projectViewer.album.collection') : isVideoProject ? t('projectViewer.album.reel') : isAudioProject ? t('projectViewer.album.audioCollection') : t('projectViewer.tabs.album').toLowerCase() })}
            animateIcon={true}
          />
        ) : displayItems.length === 0 ? (
          <EmptyState
            Icon={Filter}
            title={t('projectViewer.album.noAspectRatioMatches')}
            description={t('projectViewer.album.noAspectRatioMatchesDescription')}
            animateIcon={false}
          />
        ) : isTextProject ? (
          <div className="overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/40 rounded-none border-x-0 border-t-0">
            {displayItems.map((item, index) => {
              const isSelected = selectedAlbumIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`group flex items-center gap-3 border-b border-neutral-200/80 dark:border-neutral-800/80 px-4 py-2.5 transition-colors last:border-b-0 ${isSelected ? 'bg-blue-500/10' : 'hover:bg-neutral-800/40'}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAlbumSelection(item.id, e.shiftKey, displayItemIds); }}
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${isSelected ? 'border-blue-500 text-blue-400' : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 hover:text-white hover:border-neutral-700'}`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailIndex(index)}
                    className="min-w-0 flex-1 flex items-center gap-3 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    title={t('projectViewer.album.viewTextDetails')}
                  >
                    <span className="flex-shrink-0 text-[10px] font-mono text-neutral-600">#{(index + 1).toString().padStart(2, '0')}</span>
                    <p className="min-w-0 flex-1 truncate text-[12px] leading-none text-neutral-200">
                      {item.textContent || item.prompt}
                    </p>
                    {(item.imageContexts?.length || 0) > 0 && (
                      <span className="hidden sm:block flex-shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-500">
                        {t('projectViewer.album.imageContexts', { count: item.imageContexts?.length || 0 })}
                      </span>
                    )}
                    <span className="hidden sm:block flex-shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-blue-400/80">{t('projectViewer.album.view')}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAlbumItemsToDelete([item]);
                      setShowDeleteAlbumModal(true);
                    }}
                    className="flex-shrink-0 p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title={t('projectViewer.common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : isAudioProject ? (
          <div className="space-y-3 p-4">
            {displayItems.map((item, index) => {
              const isSelected = selectedAlbumIds.has(item.id);
              const isExpanded = expandedAudioIds.has(item.id);
              const isPlaying = playingAudioId === item.id;
              return (
                <div
                  key={item.id}
                  className={`group rounded-2xl border px-4 py-3 transition-all backdrop-blur-xl ${isSelected ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10' : 'border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 hover:border-cyan-500/30'}`}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAlbumSelection(item.id, e.shiftKey, displayItemIds); }}
                      className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${isSelected ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 hover:text-white hover:border-neutral-700'}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <span className="flex-shrink-0 text-[10px] font-mono text-neutral-500 dark:text-neutral-500">#{(index + 1).toString().padStart(2, '0')}</span>

                    <button
                      type="button"
                      onClick={() => toggleAudioExpand(item.id)}
                      className="min-w-0 flex-1 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                      title={isExpanded ? t('projectViewer.album.collapse') : t('projectViewer.album.expand')}
                    >
                      <p className="truncate text-sm text-neutral-900 dark:text-white">{item.prompt}</p>
                    </button>

                    {item.createdAt && (
                      <span className="hidden sm:inline flex-shrink-0 text-[9px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500 whitespace-nowrap">
                        {formatAudioTimestamp(item.createdAt)}
                      </span>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAudioPlayback(item.id); }}
                      className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${isPlaying ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-white hover:border-neutral-700'}`}
                      title={isPlaying ? t('projectViewer.album.pauseAudio') : t('projectViewer.album.playAudio')}
                      aria-label={isPlaying ? t('projectViewer.album.pauseAudio') : t('projectViewer.album.playAudio')}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAlbumItemsToDelete([item]);
                        setShowDeleteAlbumModal(true);
                      }}
                      className="flex-shrink-0 p-1.5 text-neutral-500 dark:text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title={t('projectViewer.common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleAudioExpand(item.id)}
                      className="flex-shrink-0 p-1 text-neutral-500 dark:text-neutral-500 hover:text-white transition-colors"
                      title={isExpanded ? t('projectViewer.album.collapse') : t('projectViewer.album.expand')}
                      aria-label={isExpanded ? t('projectViewer.album.collapse') : t('projectViewer.album.expand')}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  <div className={isExpanded ? 'mt-3 space-y-3' : 'hidden'}>
                    <p className="text-sm text-neutral-900 dark:text-white whitespace-pre-wrap">{item.prompt}</p>
                    {item.textContent && (
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 px-1">
                          {t('projectViewer.common.generatedText')}
                        </label>
                        <div className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed bg-neutral-50/50 dark:bg-neutral-950/50 p-4 rounded-xl border border-neutral-200/50 dark:border-neutral-800/50 whitespace-pre-wrap">
                          {item.textContent}
                        </div>
                      </div>
                    )}
                    <div className="rounded-xl border border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-950/50 p-3">
                      <audio
                        ref={(el) => { audioRefs.current[item.id] = el; }}
                        src={imageDisplayUrl(item.imageUrl)}
                        controls
                        className="w-full"
                        onPlay={() => setPlayingAudioId(item.id)}
                        onPause={() => setPlayingAudioId((cur) => (cur === item.id ? null : cur))}
                        onEnded={() => setPlayingAudioId((cur) => (cur === item.id ? null : cur))}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                      <span className="px-2 py-1 rounded-md bg-white/50 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 text-neutral-600 dark:text-neutral-400">{getProviderName(item.providerId)}</span>
                      <span className="px-2 py-1 rounded-md bg-white/50 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 text-cyan-500/70">{getModelName(item.providerId, item.modelConfigId)}</span>
                      {item.format && (
                        <span className="px-2 py-1 rounded-md bg-white/50 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 text-neutral-600 dark:text-neutral-400">{item.format}</span>
                      )}
                      {item.size && (
                        <span className="px-2 py-1 rounded-md bg-white/50 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 text-neutral-600 dark:text-neutral-400">{(item.size / 1024).toFixed(1)} KB</span>
                      )}
                      {item.createdAt && (
                        <span className="px-2 py-1 rounded-md bg-white/50 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 text-neutral-600 dark:text-neutral-400">{formatAudioTimestamp(item.createdAt)}</span>
                      )}
                    </div>
                  </div>

                  {!isExpanded && (
                    <audio
                      ref={(el) => { audioRefs.current[item.id] = el; }}
                      src={imageDisplayUrl(item.imageUrl)}
                      preload="none"
                      className="hidden"
                      onPlay={() => setPlayingAudioId(item.id)}
                      onPause={() => setPlayingAudioId((cur) => (cur === item.id ? null : cur))}
                      onEnded={() => setPlayingAudioId((cur) => (cur === item.id ? null : cur))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {displayItems.map((item, index) => {
              const isSelected = selectedAlbumIds.has(item.id);
              const aspectRatioStr = getCssAspectRatio(item.aspectRatio);
              return (
                <div key={item.id} id={`album-item-${item.id}`} className={`bg-white/20 dark:bg-black/20 border overflow-hidden flex flex-col group transition-all duration-300 active:scale-100 rounded-xl border-neutral-200/20 dark:border-white/5 backdrop-blur-md ${isSelected ? 'ring-2 ring-inset ring-blue-500 shadow-xl shadow-blue-500/20 z-10 scale-[1.02]' : 'hover:shadow-2xl hover:z-10 hover:-translate-y-1'}`}>
                  <div className="bg-neutral-50 dark:bg-neutral-950 relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: aspectRatioStr }}>
                    {/* Selection Overlay */}
                    <div className={`absolute top-4 left-4 z-20 transition-all opacity-100`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAlbumSelection(item.id, e.shiftKey, displayItemIds); }}
                        className={`w-7 h-7 rounded-xl flex items-center justify-center border transition-all ${isSelected ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-black/40 backdrop-blur-md border-white/20 hover:border-white/40'}`}
                      >
                        {isSelected && <CheckSquare className="w-4 h-4 text-neutral-900 dark:text-white" />}
                        {!isSelected && <Square className="w-4 h-4 text-white/40" />}
                      </button>
                    </div>

                    {/* Actions Overlay */}
                    <div className="absolute top-4 right-4 z-20 opacity-100 transition-all flex flex-col gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAlbumItemsToDelete([item]);
                          setShowDeleteAlbumModal(true);
                        }}
                        className="w-7 h-7 rounded-xl bg-red-600/80 backdrop-blur-md border border-red-500/50 flex items-center justify-center text-neutral-900 dark:text-white hover:bg-red-600 transition-all shadow-lg"
                        title={t('projectViewer.common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <a
                        href={imageDisplayUrl(item.imageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-neutral-900 dark:text-white hover:bg-white/20 transition-all shadow-lg"
                        title={t('projectViewer.album.openOriginal')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <img
                      src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)}
                      alt={item.prompt}
                      className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 shadow-lg cursor-pointer ${isSelected ? 'opacity-40' : ''}`}
                      referrerPolicy="no-referrer"
                      onClick={() => {
                        if (isVideoProject) {
                          setVideoPlayerItem(item);
                          return;
                        }
                        const validItems = displayItems.filter(a => a.imageUrl);
                        const imgUrls = validItems.map(a => imageDisplayUrl(a.optimizedUrl || a.imageUrl));
                        const idx = validItems.findIndex(a => a.id === item.id);
                        setLightboxData({
                          images: imgUrls,
                          index: idx >= 0 ? idx : 0,
                          albumItemIds: validItems.map(a => a.id),
                          onDelete: (deletedIndex) => {
                             const itemToDelete = validItems[deletedIndex];
                             if (itemToDelete) {
                               setAlbumItemsToDelete([itemToDelete]);
                               setShowDeleteAlbumModal(true);
                             }
                          },
                          onIndexChange: (newIndex) => {
                            const newItem = validItems[newIndex];
                            if (newItem) {
                              const el = document.getElementById(`album-item-${newItem.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }
                          }
                        });
                      }}
                    />

                    {/* Play icon overlay for videos */}
                    {isVideoProject && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setVideoPlayerItem(item); }}
                        className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto group/play"
                        title={t('projectViewer.album.playVideo')}
                      >
                        <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl transition-all group-hover/play:scale-110 group-hover/play:bg-purple-600/70">
                          <Play className="w-6 h-6 text-neutral-900 dark:text-white fill-white ml-0.5" />
                        </div>
                      </button>
                    )}

                    {/* Sequential Identifier Overlay */}
                    <div className="absolute bottom-4 right-4 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-mono text-white/80 border border-white/10 opacity-100 transition-opacity pointer-events-none">
                      #{(index + 1).toString().padStart(2, '0')}
                    </div>

                    {/* Aspect Ratio + Date Pill */}
                    {(item.aspectRatio || item.createdAt) && (
                      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 opacity-100 transition-opacity duration-500 delay-75 pointer-events-none">
                        {item.aspectRatio && (
                          <span className="px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-full text-[9px] font-bold text-white/60 border border-white/5 uppercase tracking-widest leading-none">
                            {item.aspectRatio}
                          </span>
                        )}
                        {item.createdAt && (
                          <span className="px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-full text-[9px] font-bold text-white/60 border border-white/5 tracking-widest leading-none">
                            {new Date(item.createdAt).toLocaleString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-blue-500/10 backdrop-blur-[2px]">
                        <CheckCircle2 className="w-14 h-14 text-blue-500 animate-in zoom-in duration-300" />
                      </div>
                    )}
                  </div>
                  <div className="mt-auto min-h-[160px] flex flex-col bg-white/40 dark:bg-black/40 backdrop-blur-md relative border-t border-neutral-200/50 dark:border-white/5">
                    <div className="p-5 flex-1 flex flex-col justify-start">
                    <div className="mb-3 flex items-center gap-1.5">
                      <h3 className="min-w-0 flex-1 truncate text-[13px] font-black leading-5 text-neutral-900 dark:text-white" title={getAlbumFilename(item)}>
                        {getAlbumFilename(item)}
                      </h3>
                      <button
                        type="button"
                        onClick={() => openRenameModal(item)}
                        className="flex-shrink-0 inline-flex items-center justify-center rounded-sm text-[13px] leading-none text-neutral-500 hover:text-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                        title={t('projectViewer.album.editFilename')}
                        aria-label={t('projectViewer.album.editFilename')}
                      >
                        <Pencil className="w-[1em] h-[1em]" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPromptItem(item)}
                      className="mb-4 block w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 h-10"
                      title={t('projectViewer.album.viewFullPrompt')}
                    >
                      <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 line-clamp-2 font-medium group-hover:text-neutral-200 transition-colors cursor-pointer hover:text-white">
                        {item.prompt}
                      </p>
                    </button>
                    <div className="mt-auto flex flex-col items-start gap-2 w-full">
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-50/50 dark:bg-neutral-950/50 rounded-lg border border-neutral-200/50 dark:border-white/5 w-full">
                        <span className="text-[8px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest px-1.5 py-0.5 bg-white/50 dark:bg-neutral-900/50 rounded border border-neutral-200/50 dark:border-white/5 text-center truncate" title={getProviderName(item.providerId)}>
                          {getProviderName(item.providerId)}
                        </span>
                        <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest px-1.5 py-0.5 bg-white/50 dark:bg-neutral-900/50 rounded border border-neutral-200/50 dark:border-white/5 text-center truncate" title={getModelName(item.providerId, item.modelConfigId)}>
                          {getModelName(item.providerId, item.modelConfigId)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 px-1.5 py-1 bg-neutral-50/30 dark:bg-neutral-950/30 rounded-lg border border-neutral-200/30 dark:border-neutral-800/30 w-full">
                        {[
                          { label: t('projectViewer.album.raw'), size: item.size },
                          { label: t('projectViewer.album.optimized'), size: item.optimizedSize },
                          { label: t('projectViewer.album.thumbnail'), size: item.thumbnailSize }
                        ].map((s, i) => s.size ? (
                          <div key={s.label} className="flex items-center justify-center gap-1 min-w-0">
                            <span className="text-[7px] font-black text-neutral-600 uppercase tracking-tighter shrink-0">{s.label}</span>
                            <span className="text-[8px] font-mono font-bold text-neutral-600 dark:text-neutral-400 truncate">
                              {s.size > 1024 * 1024
                                ? `${(s.size / (1024 * 1024)).toFixed(1)}M`
                                : `${(s.size / 1024).toFixed(0)}K`}
                            </span>
                          </div>
                        ) : <div key={i} />)}
                      </div>

                      <div className="flex justify-between items-center gap-1.5 h-6 w-full">
                        {item.resolution && (
                          <span className="flex-1 flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-neutral-50/30 dark:bg-neutral-950/30 rounded-md border border-neutral-200/50 dark:border-white/5 uppercase tracking-widest truncate">
                            {item.resolution}
                          </span>
                        )}
                        {!item.resolution && item.quality && (
                          <span className="flex-1 flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-neutral-50/30 dark:bg-neutral-950/30 rounded-md border border-neutral-200/50 dark:border-white/5 uppercase tracking-widest truncate">
                            {item.quality}
                          </span>
                        )}
                        {item.duration != null && (
                          <span className="flex-1 flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-neutral-50/30 dark:bg-neutral-950/30 rounded-md border border-neutral-200/50 dark:border-white/5 uppercase tracking-widest truncate">
                            {item.duration}s
                          </span>
                        )}
                        {item.format && (
                          <span className="flex-1 flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-neutral-50/30 dark:bg-neutral-950/30 rounded-md border border-neutral-200/50 dark:border-white/5 uppercase tracking-widest truncate">
                            {item.format}
                          </span>
                        )}
                      </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {videoPlayerItem && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setVideoPlayerItem(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={imageDisplayUrl(videoPlayerItem.imageUrl)}
              poster={
                videoPlayerItem.optimizedUrl || videoPlayerItem.thumbnailUrl
                  ? imageDisplayUrl(videoPlayerItem.optimizedUrl || videoPlayerItem.thumbnailUrl)
                  : undefined
              }
              controls
              autoPlay
              className="w-full max-h-[85vh] rounded-2xl bg-black shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setVideoPlayerItem(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white dark:bg-neutral-900 border border-neutral-700 text-neutral-900 dark:text-white flex items-center justify-center hover:bg-neutral-800 transition-colors shadow-lg"
              title={t('projectViewer.common.close')}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <AlbumPromptModal item={promptItem} onClose={() => setPromptItem(null)} />
      {renameItem && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !isRenaming && setRenameItem(null)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-5 py-4">
              <h2 className="text-sm font-black text-neutral-900 dark:text-white">{t('projectViewer.album.editFilename')}</h2>
              <button
                type="button"
                onClick={() => setRenameItem(null)}
                disabled={isRenaming}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-50"
                aria-label={t('projectViewer.common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full min-h-28 resize-y rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameItem(null)}
                  disabled={isRenaming}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-50"
                >
                  {t('projectViewer.common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={submitRename}
                  disabled={isRenaming}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {isRenaming ? t('projectViewer.album.savingFilename') : t('projectViewer.common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showCompareDialog && <TextAlbumCompareDialog items={selectedTextItems} setLightboxData={setLightboxData} onClose={() => setShowCompareDialog(false)} />}
      <TextAlbumDetailDialog items={displayItems} startIndex={detailIndex} setLightboxData={setLightboxData} onClose={() => setDetailIndex(null)} />
      <ExportPackageDialog
        isOpen={isExportDialogOpen}
        defaultValue={getDefaultExportPackageName(projectName)}
        itemCount={pendingExportItemIds?.length ?? albumItems.length}
        onClose={() => setIsExportDialogOpen(false)}
        onSubmit={handleExport}
      />
      <CopyToLibraryDialog
        isOpen={showCopyDialog}
        projectId={projectId}
        projectName={projectName}
        projectType={projectType}
        itemIds={copyItemIds}
        onClose={() => setShowCopyDialog(false)}
        onSuccess={() => {}}
      />
    </section>
  );
}

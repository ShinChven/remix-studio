import React, { useState } from 'react';
import { Layers, CheckSquare, Square, Trash2, ImageIcon, CheckCircle2, ExternalLink, Download, FileText, Play, Video as VideoIcon } from 'lucide-react';
import { AlbumItem, ProjectType } from '../../types';
import { imageDisplayUrl, startAlbumExport } from '../../api';
import { AlbumPromptModal } from './AlbumPromptModal';
import { ExportPackageDialog } from './ExportPackageDialog';
import { TextAlbumCompareDialog } from './TextAlbumCompareDialog';
import { TextAlbumDetailDialog } from './TextAlbumDetailDialog';
import { CopyToLibraryDialog } from './CopyToLibraryDialog';
import { Copy } from 'lucide-react';

import { toast } from 'sonner';

interface AlbumTabProps {
  projectId: string;
  projectName: string;
  albumItems: AlbumItem[];
  selectedAlbumIds: Set<string>;
  toggleSelectAllAlbum: () => void;
  toggleAlbumSelection: (id: string, isShiftPressed: boolean) => void;
  setAlbumItemsToDelete: (items: AlbumItem[]) => void;
  setShowDeleteAlbumModal: (show: boolean) => void;
  getProviderName: (id?: string) => string;
  getModelName: (providerId?: string, modelId?: string) => string;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void } | null) => void;
  onExportStarted: () => void;
  projectType?: ProjectType;
}

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
  onExportStarted,
  projectType = 'image'
}: AlbumTabProps) {
  const getDefaultExportPackageName = (name: string) => {
    const safeName = (name || 'Album').replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${safeName}_Album.zip`;
  };

  const isTextProject = projectType === 'text';
  const isVideoProject = projectType === 'video';
  const [promptItem, setPromptItem] = useState<AlbumItem | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [pendingExportItemIds, setPendingExportItemIds] = useState<string[] | undefined>();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [videoPlayerItem, setVideoPlayerItem] = useState<AlbumItem | null>(null);
  const selectedTextItems = albumItems.filter((item) => selectedAlbumIds.has(item.id));

  const openExportDialog = (isAll: boolean) => {
    setPendingExportItemIds(isAll ? undefined : Array.from(selectedAlbumIds));
    setIsExportDialogOpen(true);
  };

  const handleExport = async (packageName: string) => {
    try {
      await startAlbumExport(projectId, pendingExportItemIds, packageName);
      onExportStarted();
      toast.success(
        <span>
          Export queued!{' '}
          <a href="/exports" className="underline font-bold">View progress in Archive →</a>
        </span>
      );
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
      throw err;
    }
  };

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-6">
        {albumItems.length > 0 && (
          <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-3 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest transition-colors mr-2">
                <Layers className="w-4 h-4 text-blue-500" />
                {albumItems.length} Items
                <span className="mx-1 text-neutral-800">·</span>
                <span className="text-blue-500/80">
                  {((albumItems || []).reduce((acc, item) => acc + (item.size || 0), 0) / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>

              <div className="h-4 w-px bg-neutral-800 mx-1" />

              <button
                onClick={toggleSelectAllAlbum}
                className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                {selectedAlbumIds.size === albumItems.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select All
              </button>

              {selectedAlbumIds.size > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    {selectedAlbumIds.size} Selected
                  </span>
                  <button
                    onClick={() => openExportDialog(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" /> Export Selected
                  </button>
                  {!isTextProject && (
                    <button
                      onClick={() => setShowCopyDialog(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-purple-500/20 transition-all"
                    >
                      <Copy className="w-3 h-3" /> Copy to Library
                    </button>
                  )}
                  {isTextProject && selectedAlbumIds.size > 1 && (
                    <button
                      onClick={() => setShowCompareDialog(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 text-[9px] font-black uppercase tracking-widest rounded-lg border border-neutral-700 transition-all"
                    >
                      <Layers className="w-3 h-3" /> Compare Selected
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const itemsToDelete = albumItems.filter(item => selectedAlbumIds.has(item.id));
                      setAlbumItemsToDelete(itemsToDelete);
                      setShowDeleteAlbumModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-500/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" /> Delete Selected
                  </button>
                </div>
              )}

              {selectedAlbumIds.size === 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-neutral-800">
                  <button
                    onClick={() => openExportDialog(true)}
                    className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" /> Export All
                  </button>
                  {!isTextProject && (
                    <button
                      onClick={() => {
                        setPendingExportItemIds(undefined);
                        setShowCopyDialog(true);
                      }}
                      className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors disabled:opacity-50"
                    >
                      <Copy className="w-4 h-4" /> Copy All to Library
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {albumItems.length === 0 ? (
          <div className="bg-neutral-900/20 border-2 border-dashed border-neutral-800 rounded-3xl p-12 md:p-24 text-center text-neutral-500 flex flex-col items-center gap-6 transition-colors hover:border-neutral-700 shadow-inner">
            {isTextProject ? <FileText className="w-16 h-16 text-neutral-800 animate-pulse" /> : isVideoProject ? <VideoIcon className="w-16 h-16 text-neutral-800 animate-pulse" /> : <ImageIcon className="w-16 h-16 text-neutral-800 animate-pulse" />}
            <div>
              <p className="text-sm font-bold text-neutral-400 tracking-wider uppercase">{isTextProject ? 'No texts yet' : isVideoProject ? 'No videos yet' : 'Gallery is empty'}</p>
              <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">Start a generation to build your {isTextProject ? 'collection' : isVideoProject ? 'reel' : 'album'}</p>
            </div>
          </div>
        ) : isTextProject ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
            {albumItems.map((item, index) => {
              const isSelected = selectedAlbumIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`group flex items-center gap-3 border-b border-neutral-800/80 px-4 py-2.5 transition-colors last:border-b-0 ${isSelected ? 'bg-blue-500/10' : 'hover:bg-neutral-800/40'}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAlbumSelection(item.id, e.shiftKey); }}
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${isSelected ? 'bg-blue-600 border-blue-500' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'}`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4 text-white" /> : <Square className="w-4 h-4 text-neutral-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailIndex(index)}
                    className="min-w-0 flex-1 flex items-center gap-3 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    title="Click to view text details"
                  >
                    <span className="flex-shrink-0 text-[10px] font-mono text-neutral-600">#{(index + 1).toString().padStart(2, '0')}</span>
                    <p className="min-w-0 flex-1 truncate text-[12px] leading-none text-neutral-200">
                      {item.textContent || item.prompt}
                    </p>
                    {(item.imageContexts?.length || 0) > 0 && (
                      <span className="hidden sm:block flex-shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">
                        +{item.imageContexts?.length} img
                      </span>
                    )}
                    <span className="hidden sm:block flex-shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-blue-400/80">View</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAlbumItemsToDelete([item]);
                      setShowDeleteAlbumModal(true);
                    }}
                    className="flex-shrink-0 p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {albumItems.map((item, index) => {
              const isSelected = selectedAlbumIds.has(item.id);
              const aspectRatioStr = item.aspectRatio?.replace(':', '/') || '1/1';
              return (
                <div key={item.id} className={`bg-neutral-900/50 border rounded-2xl overflow-hidden flex flex-col group transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 active:scale-100 ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/20' : 'border-neutral-800 hover:border-blue-500/40'}`}>
                  <div className="bg-neutral-950 relative flex items-center justify-center overflow-hidden" style={{ aspectRatio: aspectRatioStr }}>
                    {/* Selection Overlay */}
                    <div className={`absolute top-4 left-4 z-20 transition-all opacity-100`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAlbumSelection(item.id, e.shiftKey); }}
                        className={`w-7 h-7 rounded-xl flex items-center justify-center border transition-all ${isSelected ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-black/40 backdrop-blur-md border-white/20 hover:border-white/40'}`}
                      >
                        {isSelected && <CheckSquare className="w-4 h-4 text-white" />}
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
                        className="w-7 h-7 rounded-xl bg-red-600/80 backdrop-blur-md border border-red-500/50 flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <a
                        href={imageDisplayUrl(item.imageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-7 h-7 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-lg"
                        title="Open Original"
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
                        const validItems = albumItems.filter(a => a.imageUrl);
                        const imgUrls = validItems.map(a => imageDisplayUrl(a.optimizedUrl || a.imageUrl));
                        const idx = validItems.findIndex(a => a.id === item.id);
                        setLightboxData({
                          images: imgUrls,
                          index: idx >= 0 ? idx : 0,
                          onDelete: (deletedIndex) => {
                             const itemToDelete = validItems[deletedIndex];
                             if (itemToDelete) {
                               setAlbumItemsToDelete([itemToDelete]);
                               setShowDeleteAlbumModal(true);
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
                        title="Play video"
                      >
                        <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl transition-all group-hover/play:scale-110 group-hover/play:bg-purple-600/70">
                          <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                        </div>
                      </button>
                    )}

                    {/* Sequential Identifier Overlay */}
                    <div className="absolute bottom-4 right-4 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-mono text-white/80 border border-white/10 opacity-100 transition-opacity pointer-events-none">
                      #{(index + 1).toString().padStart(2, '0')}
                    </div>

                    {/* Aspect Ratio Pill */}
                    {item.aspectRatio && (
                      <div className="absolute bottom-4 left-4 z-10 opacity-100 transition-opacity duration-500 delay-75 pointer-events-none">
                        <span className="px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-full text-[9px] font-bold text-white/60 border border-white/5 uppercase tracking-widest leading-none">
                          {item.aspectRatio}
                        </span>
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-blue-500/10 backdrop-blur-[2px]">
                        <CheckCircle2 className="w-14 h-14 text-blue-500 animate-in zoom-in duration-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-5 bg-neutral-900/60 backdrop-blur-sm relative border-t border-neutral-800/50 flex-1 flex flex-col justify-between">
                    <button
                      type="button"
                      onClick={() => setPromptItem(item)}
                      className="mb-4 block w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      title="Click to view full prompt"
                    >
                      <p className="text-[11px] leading-relaxed text-neutral-400 line-clamp-3 font-medium group-hover:text-neutral-200 transition-colors cursor-pointer hover:text-white">
                        {item.prompt}
                      </p>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 p-1 bg-neutral-950/50 rounded-lg border border-neutral-800/50">
                        <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest px-1.5 py-0.5 bg-neutral-900 rounded border border-neutral-800">
                          {getProviderName(item.providerId)}
                        </span>
                        <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest px-1.5 py-0.5 bg-neutral-900 rounded border border-neutral-800">
                          {getModelName(item.providerId, item.modelConfigId)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 px-1.5 py-1 bg-neutral-950/30 rounded-lg border border-neutral-800/30">
                        {[
                          { label: 'RAW', size: item.size },
                          { label: 'OPT', size: item.optimizedSize },
                          { label: 'THMB', size: item.thumbnailSize }
                        ].map((s, i) => s.size ? (
                          <React.Fragment key={s.label}>
                            {i > 0 && <span className="text-[8px] text-neutral-800 font-bold mx-0.5">|</span>}
                            <div className="flex items-center gap-1">
                              <span className="text-[7px] font-black text-neutral-600 uppercase tracking-tighter">{s.label}</span>
                              <span className="text-[8px] font-mono font-bold text-neutral-400">
                                {s.size > 1024 * 1024
                                  ? `${(s.size / (1024 * 1024)).toFixed(1)}M`
                                  : `${(s.size / 1024).toFixed(0)}K`}
                              </span>
                            </div>
                          </React.Fragment>
                        ) : null)}
                      </div>

                      <div className="flex gap-1.5 h-6">
                        {item.resolution && (
                          <span className="flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 bg-neutral-950/30 rounded-md border border-neutral-800 uppercase tracking-widest">
                            {item.resolution}
                          </span>
                        )}
                        {!item.resolution && item.quality && (
                          <span className="flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 bg-neutral-950/30 rounded-md border border-neutral-800 uppercase tracking-widest">
                            {item.quality}
                          </span>
                        )}
                        {item.duration != null && (
                          <span className="flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 bg-neutral-950/30 rounded-md border border-neutral-800 uppercase tracking-widest">
                            {item.duration}s
                          </span>
                        )}
                        {item.format && (
                          <span className="flex items-center justify-center px-2 text-[9px] font-bold text-neutral-500 bg-neutral-950/30 rounded-md border border-neutral-800 uppercase tracking-widest">
                            {item.format}
                          </span>
                        )}
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
              poster={imageDisplayUrl(videoPlayerItem.optimizedUrl || videoPlayerItem.thumbnailUrl)}
              controls
              autoPlay
              className="w-full max-h-[85vh] rounded-2xl bg-black shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setVideoPlayerItem(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors shadow-lg"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <AlbumPromptModal item={promptItem} onClose={() => setPromptItem(null)} />
      {showCompareDialog && <TextAlbumCompareDialog items={selectedTextItems} setLightboxData={setLightboxData} onClose={() => setShowCompareDialog(false)} />}
      <TextAlbumDetailDialog items={albumItems} startIndex={detailIndex} setLightboxData={setLightboxData} onClose={() => setDetailIndex(null)} />
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
        itemIds={pendingExportItemIds ?? Array.from(selectedAlbumIds).length > 0 ? Array.from(selectedAlbumIds) : albumItems.map(i => i.id)}
        onClose={() => setShowCopyDialog(false)}
        onSuccess={() => {}}
      />
    </section>
  );
}

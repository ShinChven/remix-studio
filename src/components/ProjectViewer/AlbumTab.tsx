import React, { useState, useEffect } from 'react';
import { Layers, CheckSquare, Square, Trash2, ImageIcon, CheckCircle2, ExternalLink, Download, Loader2 } from 'lucide-react';
import { AlbumItem } from '../../types';
import { imageDisplayUrl, startAlbumExport, fetchExportStatus, ExportStatus } from '../../api';

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
  setLightboxData: (data: { images: string[], index: number } | null) => void;
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
  setLightboxData
}: AlbumTabProps) {
  const [exportTask, setExportTask] = useState<ExportStatus | null>(null);

  useEffect(() => {
    let interval: any;
    if (exportTask && (exportTask.status === 'pending' || exportTask.status === 'processing')) {
      interval = setInterval(async () => {
        try {
          const status = await fetchExportStatus(projectId, exportTask.id);
          setExportTask(status);
        } catch (err) {
          console.error('Failed to fetch export status:', err);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [exportTask?.id, exportTask?.status, projectId]);

  const handleExport = async (isAll: boolean) => {
    try {
      const itemIds = isAll ? undefined : Array.from(selectedAlbumIds);
      const { taskId } = await startAlbumExport(projectId, itemIds);
      setExportTask({ 
        id: taskId, 
        status: 'pending', 
        current: 0, 
        total: isAll ? albumItems.length : selectedAlbumIds.size 
      });
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
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
                    onClick={() => handleExport(false)}
                    disabled={exportTask?.status === 'processing' || exportTask?.status === 'pending'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20 transition-all disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" /> Export Selected
                  </button>
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
                    onClick={() => handleExport(true)}
                    disabled={exportTask?.status === 'processing' || exportTask?.status === 'pending'}
                    className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white uppercase tracking-widest transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" /> Export All
                  </button>
                </div>
              )}
            </div>

            {exportTask && (
              <div className="flex items-center gap-4 px-4 py-2 bg-blue-500/5 border border-blue-500/20 rounded-xl animate-in fade-in slide-in-from-right-4">
                {exportTask.status === 'completed' ? (
                  <>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                      <CheckCircle2 className="w-4 h-4" /> Ready
                    </div>
                    <a
                      href={exportTask.downloadUrl}
                      download={`${projectName}_Album.zip`}
                      className="px-3 py-1 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-400 transition-all"
                      onClick={() => setTimeout(() => setExportTask(null), 5000)}
                    >
                      Download ZIP
                    </a>
                  </>
                ) : exportTask.status === 'failed' ? (
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Export Failed</span>
                    <button 
                      onClick={() => setExportTask(null)}
                      className="text-[9px] text-neutral-500 hover:text-white uppercase font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                        {exportTask.status === 'pending' ? 'Starting...' : `Preparing... ${exportTask.current}/${exportTask.total}`}
                      </span>
                    </div>
                    <div className="w-32 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-500" 
                        style={{ width: `${(exportTask.current / exportTask.total) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {albumItems.length === 0 ? (
          <div className="bg-neutral-900/20 border-2 border-dashed border-neutral-800 rounded-3xl p-12 md:p-24 text-center text-neutral-500 flex flex-col items-center gap-6 transition-colors hover:border-neutral-700 shadow-inner">
            <ImageIcon className="w-16 h-16 text-neutral-800 animate-pulse" />
            <div>
              <p className="text-sm font-bold text-neutral-400 tracking-wider uppercase">Gallery is empty</p>
              <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">Start a generation to build your album</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {albumItems.map(item => {
              const isSelected = selectedAlbumIds.has(item.id);
              return (
                <div key={item.id} className={`bg-neutral-900/50 border rounded-2xl overflow-hidden flex flex-col group transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10 active:scale-100 ${isSelected ? 'border-blue-500 ring-1 ring-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/5' : 'border-neutral-800 hover:border-blue-500/30'}`}>
                  <div className="aspect-square bg-neutral-950 relative flex items-center justify-center overflow-hidden">
                    {/* Selection Overlay */}
                    <div className={`absolute top-3 left-3 z-10 transition-all ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAlbumSelection(item.id, e.shiftKey); }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${isSelected ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-black/40 backdrop-blur-md border-white/20 hover:border-white/40'}`}
                      >
                        {isSelected && <CheckSquare className="w-4 h-4 text-white" />}
                        {!isSelected && <Square className="w-4 h-4 text-white/40" />}
                      </button>
                    </div>

                    {/* Individual Delete Button */}
                    <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all flex flex-col gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAlbumItemsToDelete([item]);
                          setShowDeleteAlbumModal(true);
                        }}
                        className="w-6 h-6 rounded-lg bg-red-600/80 backdrop-blur-md border border-red-500/50 flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <a
                        href={imageDisplayUrl(item.imageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-6 h-6 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-lg"
                        title="Open Original"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <img
                      src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)}
                      alt={item.prompt}
                      className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 shadow-lg cursor-pointer ${isSelected ? 'opacity-40' : ''}`}
                      referrerPolicy="no-referrer"
                      onClick={() => {
                        const validItems = albumItems.filter(a => a.imageUrl);
                        const imgUrls = validItems.map(a => imageDisplayUrl(a.optimizedUrl || a.imageUrl));
                        const idx = validItems.findIndex(a => a.id === item.id);
                        setLightboxData({ images: imgUrls, index: idx >= 0 ? idx : 0 });
                      }}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <CheckCircle2 className="w-12 h-12 text-blue-500 animate-in zoom-in duration-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-neutral-900/80 backdrop-blur-sm relative">
                    <p className="text-[10px] leading-relaxed text-neutral-400 line-clamp-3 font-medium mb-3" title={item.prompt}>
                      {item.prompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-1 mr-1">
                        <span className="text-[7px] font-black text-neutral-500 uppercase tracking-widest bg-neutral-950 px-1 py-0.5 rounded border border-neutral-800">
                          {getProviderName(item.providerId)}
                        </span>
                        <span className="text-[7px] font-black text-blue-500/60 uppercase tracking-widest bg-neutral-950 px-1 py-0.5 rounded border border-neutral-800">
                          {getModelName(item.providerId, item.modelConfigId)}
                        </span>
                      </div>
                      {item.aspectRatio && (
                        <span className="text-[8px] font-bold text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                          {item.aspectRatio}
                        </span>
                      )}
                      {item.quality && (
                        <span className="text-[8px] font-bold text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                          {item.quality}
                        </span>
                      )}
                      {item.format && (
                        <span className="text-[8px] font-bold text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                          {item.format}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

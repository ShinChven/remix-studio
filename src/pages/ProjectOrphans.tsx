import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  fetchProjectOrphans, 
  deleteProjectOrphansBatch, 
  OrphanFile, 
  imageDisplayUrl,
  fetchProject
} from '../api';
import { Project } from '../types';
import { 
  ArrowLeft, 
  Loader2, 
  Trash2, 
  CheckSquare, 
  Square, 
  ImageIcon, 
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Layers
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ImageLightbox } from '../components/ProjectViewer/ImageLightbox';
import { toast } from 'sonner';

export function ProjectOrphans() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [orphans, setOrphans] = useState<OrphanFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [lightboxData, setLightboxData] = useState<{ images: string[], index: number } | null>(null);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [proj, orphanFiles] = await Promise.all([
        fetchProject(id),
        fetchProjectOrphans(id)
      ]);
      setProject(proj);
      setOrphans(orphanFiles);
      setSelectedKeys(new Set());
      setLastSelectedKey(null);
    } catch (e) {
      console.error('Failed to load orphan data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const toggleSelectAll = () => {
    if (selectedKeys.size === orphans.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(orphans.map(o => o.key)));
    }
    setLastSelectedKey(null);
  };

  const toggleSelection = (key: string, isShiftPressed: boolean) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (isShiftPressed && lastSelectedKey) {
        const currentIndex = orphans.findIndex(o => o.key === key);
        const lastIndex = orphans.findIndex(o => o.key === lastSelectedKey);
        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);
          for (let i = start; i <= end; i++) {
            next.add(orphans[i].key);
          }
        }
      } else {
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
    setLastSelectedKey(key);
  };

  const handleDeleteSelected = async () => {
    if (!id || selectedKeys.size === 0) return;
    setDeleting(true);
    try {
      await deleteProjectOrphansBatch(id, Array.from(selectedKeys));
      await loadData();
    } catch (e: any) {
      console.error('Failed to delete orphans:', e);
      toast.error(`Failed to delete some files: ${e.message}`);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return 'Unknown';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !project) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-neutral-500 text-sm font-medium uppercase tracking-widest">Scanning S3 for Orphans...</p>
        </div>
      </div>
    );
  }

  const totalSize = orphans.reduce((acc, current) => acc + (current.size || 0), 0);

  return (
    <div className="h-full flex flex-col bg-neutral-950 overflow-hidden">
      {/* Header */}
      <header className="p-4 md:p-6 border-b border-neutral-800 bg-neutral-900/20 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate(`/project/${id}`)}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-xl font-bold text-white truncate font-display">Orphan Files Management</h2>
                 <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">
                   Cleanup Tool
                 </span>
              </div>
              <p className="text-xs text-neutral-500 truncate">
                Project: <span className="text-neutral-300">{project?.name || id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-all disabled:opacity-50"
              title="Refresh scan"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            {orphans.length > 0 && (
              <button
                onClick={() => {
                  if (selectedKeys.size === 0) {
                     setSelectedKeys(new Set(orphans.map(o => o.key)));
                  }
                  setShowDeleteModal(true);
                }}
                disabled={deleting}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {selectedKeys.size > 0 ? `Delete (${selectedKeys.size})` : 'Clear All'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto w-full space-y-8">
          
          {/* Legend / Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-neutral-900/40 border border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                   <Layers className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Orphaned Files</p>
                   <p className="text-lg font-bold text-white">{orphans.length}</p>
                </div>
             </div>
             <div className="bg-neutral-900/40 border border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                   <ImageIcon className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Total Waste</p>
                   <p className="text-lg font-bold text-white">{formatSize(totalSize)}</p>
                </div>
             </div>
             <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                   <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1">
                   <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Warning</p>
                   <p className="text-[10px] text-neutral-400 font-medium leading-tight">These files are NOT referenced by any current component of this project and can be safely deleted.</p>
                </div>
             </div>
          </div>

          {orphans.length > 0 && (
            <div className="flex items-center justify-between">
              <button 
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-[10px] font-black text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                {selectedKeys.size === orphans.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select All
              </button>
              {selectedKeys.size > 0 && (
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                  {selectedKeys.size} Files Selected
                </span>
              )}
            </div>
          )}

          {orphans.length === 0 ? (
            <div className="py-24 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center gap-6 bg-neutral-900/10">
               <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center">
                  <CheckSquare className="w-10 h-10 text-emerald-500/40" />
               </div>
               <div>
                  <p className="text-sm font-bold text-neutral-300 tracking-wider uppercase">Project is Clean</p>
                  <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">No unreferenced files found in storage.</p>
               </div>
            </div>
          ) : (
            <div 
              className="w-full grid gap-2 md:gap-3" 
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}
            >
               {orphans.map((file, idx) => {
                 const isSelected = selectedKeys.has(file.key);
                 const fileName = file.key.split('/').pop() || 'file';
                 
                 return (
                   <div 
                    key={file.key} 
                    onClick={(e) => toggleSelection(file.key, e.shiftKey)}
                    className={`group relative aspect-square w-full rounded-xl overflow-hidden border transition-all cursor-pointer hover:scale-[1.02] ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-neutral-800 hover:border-neutral-700'}`}
                   >
                     {/* Overlay Actions */}
                     <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex flex-col justify-between p-1.5">
                        <div className="flex justify-between items-start">
                           <div 
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${isSelected ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-black/40 backdrop-blur-md border-white/20'}`}
                           >
                             {isSelected ? <CheckSquare className="w-3 h-3 text-white" /> : <Square className="w-3 h-3 text-white/40" />}
                           </div>
                           <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
                           >
                             <ExternalLink className="w-3 h-3" />
                           </a>
                        </div>
                        <div className="flex justify-center">
                           <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxData({ images: orphans.map(o => o.url), index: idx });
                            }}
                            className="px-2 py-0.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded text-[7px] font-black uppercase tracking-widest text-white transition-all whitespace-nowrap"
                           >
                             Preview
                           </button>
                        </div>
                     </div>

                     <img 
                      src={file.url} 
                      alt="" 
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isSelected ? 'opacity-40' : ''}`}
                      referrerPolicy="no-referrer"
                     />

                     {/* Info Bar */}
                     <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                        <p className="text-[8px] font-bold text-white truncate mb-0.5">{fileName}</p>
                        <p className="text-[7px] font-black text-neutral-400 uppercase tracking-tighter">{formatSize(file.size)}</p>
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </div>
      </main>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteSelected}
        title="Permanently Delete Files"
        message={`Are you sure you want to delete ${selectedKeys.size > 0 ? selectedKeys.size : orphans.length} orphan file(s)? This action will permanently remove them from S3 and cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Permanently Delete'}
        type="danger"
      />

      {lightboxData && (
        <ImageLightbox 
          images={lightboxData.images} 
          startIndex={lightboxData.index} 
          onClose={() => setLightboxData(null)} 
        />
      )}
    </div>
  );
}

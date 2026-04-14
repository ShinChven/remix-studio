import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { PageHeader } from '../components/PageHeader';

export function ProjectOrphans() {
  const { t } = useTranslation();
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
    if (bytes === undefined) return t('projectOrphans.unknownSize');
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !project) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-neutral-500 dark:text-neutral-500 text-sm font-medium uppercase tracking-widest">{t('projectOrphans.scanning')}</p>
        </div>
      </div>
    );
  }

  const totalSize = orphans.reduce((acc, current) => acc + (current.size || 0), 0);

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
      {/* Header */}
      <PageHeader
        title={t('projectOrphans.title')}
        description={(
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
               <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">
                 {t('projectOrphans.cleanupTool')}
               </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-500 truncate mt-1">
              {t('projectOrphans.projectLabel', { name: project?.name || id })}
            </p>
          </div>
        )}
        backLink={{ to: `/project/${id}`, label: t('projectOrphans.backToProject') }}
        actions={(
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 text-neutral-600 dark:text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-all disabled:opacity-50"
              title={t('projectOrphans.refresh')}
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
                className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-neutral-900 dark:text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {selectedKeys.size > 0 ? t('projectOrphans.deleteSelected', { count: selectedKeys.size }) : t('projectOrphans.clearAll')}
              </button>
            )}
          </div>
        )}
        className="px-4 md:px-6 pt-6"
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="w-full space-y-8">
          
          {/* Legend / Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-white/40 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                   <Layers className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">{t('projectOrphans.orphanedFiles')}</p>
                   <p className="text-lg font-bold text-neutral-900 dark:text-white">{orphans.length}</p>
                </div>
             </div>
             <div className="bg-white/40 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                   <ImageIcon className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-neutral-500 dark:text-neutral-500 uppercase tracking-widest">{t('projectOrphans.totalWaste')}</p>
                   <p className="text-lg font-bold text-neutral-900 dark:text-white">{formatSize(totalSize)}</p>
                </div>
             </div>
             <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                   <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1">
                   <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{t('projectOrphans.warning')}</p>
                   <p className="text-[10px] text-neutral-600 dark:text-neutral-400 font-medium leading-tight">{t('projectOrphans.warningDesc')}</p>
                </div>
             </div>
          </div>

          {orphans.length > 0 && (
            <div className="flex items-center justify-between">
              <button 
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-[10px] font-black text-neutral-600 dark:text-neutral-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                {selectedKeys.size === orphans.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {t('projectOrphans.selectAll')}
              </button>
              {selectedKeys.size > 0 && (
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                  {t('projectOrphans.filesSelected', { count: selectedKeys.size })}
                </span>
              )}
            </div>
          )}

          {orphans.length === 0 ? (
            <div className="py-24 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-3xl text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center gap-6 bg-white/10 dark:bg-neutral-900/10">
               <div className="w-20 h-20 rounded-full bg-white dark:bg-neutral-900 flex items-center justify-center">
                  <CheckSquare className="w-10 h-10 text-emerald-500/40" />
               </div>
               <div>
                  <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 tracking-wider uppercase">{t('projectOrphans.cleanTitle')}</p>
                  <p className="text-[10px] font-medium text-neutral-600 uppercase tracking-widest mt-2">{t('projectOrphans.cleanDesc')}</p>
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
                    className={`group relative aspect-square w-full rounded-xl overflow-hidden border transition-all cursor-pointer hover:scale-[1.02] ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-700'}`}
                   >
                     {/* Overlay Actions */}
                     <div className="absolute inset-0 bg-black/60 opacity-100 transition-opacity z-10 flex flex-col justify-between p-1.5">
                        <div className="flex justify-between items-start">
                           <div 
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${isSelected ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-black/40 backdrop-blur-md border-white/20'}`}
                           >
                             {isSelected ? <CheckSquare className="w-3 h-3 text-neutral-900 dark:text-white" /> : <Square className="w-3 h-3 text-white/40" />}
                           </div>
                           <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-neutral-900 dark:text-white hover:bg-white/20"
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
                            className="px-2 py-0.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded text-[7px] font-black uppercase tracking-widest text-neutral-900 dark:text-white transition-all whitespace-nowrap"
                           >
                             {t('projectOrphans.preview')}
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
                        <p className="text-[8px] font-bold text-neutral-900 dark:text-white truncate mb-0.5">{fileName}</p>
                        <p className="text-[7px] font-black text-neutral-600 dark:text-neutral-400 uppercase tracking-tighter">{formatSize(file.size)}</p>
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
        title={t('projectOrphans.confirm.title')}
        message={t('projectOrphans.confirm.message', { count: selectedKeys.size > 0 ? selectedKeys.size : orphans.length })}
        confirmText={deleting ? t('projectOrphans.confirm.deleting') : t('projectOrphans.confirm.confirmText')}
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

import React, { useState, useEffect } from 'react';
import { Download, Loader2, CheckCircle2, XCircle, Trash2, Clock, FileArchive, ArrowRight, List, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ExportTask } from '../types';
import { fetchAllExports, deleteProjectExport } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';

export function Exports() {
  const [exports, setExports] = useState<ExportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{ projectId: string, taskId: string } | null>(null);

  const loadExports = async (cursor?: string, append = false) => {
    try {
      if (append) setLoadingMore(true);
      const { items, nextCursor: newCursor } = await fetchAllExports(15, cursor);
      
      if (append) {
        setExports(prev => [...prev, ...items]);
      } else {
        // When polling or first load, we only update the top items
        // but this is tricky with pagination. For now, let's just update the list
        // and keep the same length if it's a refresh.
        setExports(items);
      }
      setNextCursor(newCursor || null);
    } catch (err) {
      console.error('Failed to load exports:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadExports();
    
    // Poll for updates if there are pending/processing tasks
    const hasActiveTasks = exports.some(t => t.status === 'pending' || t.status === 'processing');
    let interval: any;
    if (hasActiveTasks) {
      // For polling, we only refresh the current viewable items to see status changes
      // Simplest is to just call loadExports() without cursor to refresh the first page
      interval = setInterval(() => loadExports(undefined, false), 3000);
    }
    return () => clearInterval(interval);
  }, [exports.some(t => t.status === 'pending' || t.status === 'processing')]);

  const handleLoadMore = () => {
    if (nextCursor) loadExports(nextCursor, true);
  };

  const handleDelete = async (projectId: string, taskId: string) => {
    setTaskToDelete({ projectId, taskId });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteProjectExport(taskToDelete.projectId, taskToDelete.taskId);
      setExports(prev => prev.filter(t => t.id !== taskToDelete.taskId));
    } catch (err) {
      alert('Failed to delete export record');
    } finally {
      setTaskToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header - Matching style with ProjectViewer */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-900 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600/10 rounded-2xl flex items-center justify-center border border-blue-500/10 shadow-inner">
              <FileArchive className="w-6 h-6 text-blue-500" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Export Archive</h1>
          </div>
          <p className="text-neutral-500 text-[10px] font-black uppercase tracking-widest leading-none">
            Manage your generated ZIP archives across all projects
          </p>
        </div>
        <div className="bg-neutral-900/50 border border-neutral-800/50 px-4 py-2 rounded-xl flex items-center gap-3">
          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Database</p>
            <p className="text-xs font-bold text-white">{exports.length} Total Records</p>
          </div>
          <div className="w-px h-6 bg-neutral-800" />
          <div className="flex flex-col">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Active</p>
            <p className="text-xs font-bold text-white">
              {exports.filter(t => t.status === 'pending' || t.status === 'processing').length}
            </p>
          </div>
        </div>
      </div>

      {!loading && exports.length === 0 ? (
        <div className="py-32 text-center text-neutral-600 border border-dashed border-neutral-900 rounded-[32px] bg-neutral-950/20">
          <List className="w-12 h-12 mx-auto opacity-10 mb-4" />
          <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-2">Archive is empty</div>
          <div className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-8 max-w-[200px] mx-auto leading-relaxed">Generated project exports will appear here automatically</div>
          <Link to="/projects" className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-neutral-800 active:scale-95">
            View Projects
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {exports.map((task) => (
            <div 
              key={task.id} 
              className={`bg-neutral-950/50 p-4 rounded-xl border flex justify-between items-center transition-all group/task ${task.status === 'failed' ? 'border-red-900/30 bg-red-950/5' : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/50'}`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Status Indicator Bar (like Queue) */}
                <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                  task.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                  task.status === 'failed' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                  'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                }`} />

                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <Link 
                      to={`/project/${task.projectId}`}
                      className="text-[9px] font-black text-blue-500 hover:text-blue-400 transition-colors uppercase tracking-widest bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 flex items-center gap-1 group/project"
                    >
                      {task.projectName}
                      <ArrowRight className="w-2.5 h-2.5 group-hover/project:translate-x-0.5 transition-transform" />
                    </Link>
                    <span className="text-[10px] font-bold text-neutral-400 truncate tracking-tight">
                      Archive #{task.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Context Info */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 uppercase tracking-widest">
                      <Clock className="w-3 h-3" />
                      {new Date(task.createdAt).toLocaleString()}
                    </div>
                    {(task.status === 'processing' || task.status === 'pending') && (
                      <div className="flex items-center gap-2 group-hover/task:translate-x-1 transition-transform">
                        <div className="w-24 h-1 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800/50">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-500" 
                            style={{ width: `${(task.current / task.total) * 100}%` }} 
                          />
                        </div>
                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-tighter">
                          {task.current}/{task.total} Files
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status & Actions Column (Matching Queue design) */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center gap-3">
                  {task.status === 'completed' && (
                    <div className="flex items-center gap-2 text-emerald-500 text-[9px] font-black uppercase tracking-widest bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready
                    </div>
                  )}
                  {task.status === 'processing' && (
                    <div className="flex items-center gap-2 text-blue-400 text-[9px] font-black uppercase tracking-widest bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Archiving
                    </div>
                  )}
                  {task.status === 'pending' && (
                    <div className="flex items-center gap-2 text-neutral-500 text-[9px] font-black uppercase tracking-widest bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800">
                      Queued
                    </div>
                  )}
                  {task.status === 'failed' && (
                    <div className="flex items-center gap-2 text-red-500 text-[9px] font-black uppercase tracking-widest bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                      <XCircle className="w-3.5 h-3.5" />
                      Failed
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-4">
                  {task.status === 'completed' && task.downloadUrl && (
                    <a
                      href={task.downloadUrl}
                      download={`${task.projectName}_${task.id.slice(0,8)}.zip`}
                      className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90"
                      title="Download ZIP"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(task.projectId, task.id)}
                    className="p-1.5 text-neutral-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all active:scale-90"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex items-center justify-center py-12">
               <Loader2 className="w-6 h-6 text-neutral-800 animate-spin" />
             </div>
          )}
          {nextCursor && (
            <div className="flex justify-center pt-8">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="group flex items-center gap-3 px-8 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all border border-neutral-800 hover:border-neutral-700 active:scale-95 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                )}
                {loadingMore ? 'Loading...' : 'Load More Archives'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setTaskToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Export Record"
        message="Are you sure you want to delete this export record? This action cannot be undone."
        confirmText="Delete Record"
        type="danger"
      />
    </div>
  );
}

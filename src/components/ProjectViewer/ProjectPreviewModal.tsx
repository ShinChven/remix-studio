import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { X, Sparkles, Box, Settings, Layers, Type, ImageIcon, Library as LibraryIcon, Video as VideoIcon, Volume2, Bot, ExternalLink } from 'lucide-react';
import { Project, Library } from '../../types';
import { imageDisplayUrl } from '../../api';

interface ProjectPreviewModalProps {
  project: Project;
  libraries: Library[];
  onClose: () => void;
}

export function ProjectPreviewModal({ 
  project, 
  libraries, 
  onClose 
}: ProjectPreviewModalProps) {
  const { t } = useTranslation();

  const getLibraryName = (libraryId: string) => {
    return libraries.find(l => l.id === libraryId)?.name || 'Unknown Library';
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl h-[85vh] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-card shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/10 rounded-xl">
              <Sparkles className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{project.name}</h3>
              {project.description && (
                <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {project.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest bg-white/5 dark:bg-black/20 border border-neutral-200/50 dark:border-white/5 px-2 py-0.5 rounded leading-none backdrop-blur-md">
                  ID: {project.id}
                </span>
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded leading-none">
                  {project.type}
                </span>
                {project.status === 'archived' && (
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded leading-none">
                    Archived
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-neutral-50/10 dark:bg-neutral-950/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left: Configuration Summary */}
            <div className="space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-4 text-xs font-black uppercase tracking-widest text-neutral-400">
                   <Bot className="w-4 h-4" />
                   AI CONFIGURATION
                </div>
                <div className="space-y-3">
                  <div className="p-4 bg-white/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-card shadow-sm">
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Provider</div>
                    <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{project.providerId || 'Not set'}</div>
                  </div>
                  <div className="p-4 bg-white/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-card shadow-sm">
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Model</div>
                    <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 font-mono">{project.modelConfigId || 'Not set'}</div>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4 text-xs font-black uppercase tracking-widest text-neutral-400">
                   <Settings className="w-4 h-4" />
                   PROJECT SETTINGS
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {project.aspectRatio && (
                    <div className="p-3 bg-white/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl shadow-sm">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">Aspect Ratio</div>
                      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{project.aspectRatio}</div>
                    </div>
                  )}
                  {project.quality && (
                    <div className="p-3 bg-white/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl shadow-sm">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">Quality</div>
                      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{project.quality}</div>
                    </div>
                  )}
                   {project.resolution && (
                    <div className="p-3 bg-white/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl shadow-sm">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">Resolution</div>
                      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{project.resolution}</div>
                    </div>
                  )}
                   {project.duration && (
                    <div className="p-3 bg-white/50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-white/5 rounded-xl shadow-sm">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">Duration</div>
                      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{project.duration}s</div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Middle/Right: Workflow Steps */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2 mb-4 text-xs font-black uppercase tracking-widest text-neutral-400">
                <Layers className="w-4 h-4" />
                WORKFLOW STEPS ({(project.workflow || []).length})
              </div>
              <div className="space-y-3">
                {(project.workflow || []).map((item, index) => (
                  <div 
                    key={item.id}
                    className={`bg-white/70 dark:bg-neutral-800/60 border border-neutral-200/50 dark:border-white/5 rounded-card p-4 shadow-sm backdrop-blur-md ${item.disabled ? 'opacity-40 grayscale-[0.5]' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-200/20 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-neutral-400 w-4">{index + 1}</span>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                          {item.type === 'text' && <Type className="w-3.5 h-3.5" />}
                          {item.type === 'image' && <ImageIcon className="w-3.5 h-3.5" />}
                          {item.type === 'video' && <VideoIcon className="w-3.5 h-3.5" />}
                          {item.type === 'audio' && <Volume2 className="w-3.5 h-3.5" />}
                          {item.type === 'library' && <LibraryIcon className="w-3.5 h-3.5" />}
                          {item.type}
                        </div>
                      </div>
                      {item.disabled && (
                        <span className="text-[8px] font-black uppercase tracking-wider bg-neutral-500/10 px-1.5 py-0.5 rounded text-neutral-500 border border-neutral-500/20">
                          Disabled
                        </span>
                      )}
                    </div>

                    {item.type === 'text' && (
                       <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap line-clamp-3 italic">
                         "{item.value || 'No content'}"
                       </p>
                    )}

                    {item.type === 'library' && (
                       <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                          <LibraryIcon className="w-3.5 h-3.5 text-emerald-500" />
                          {getLibraryName(item.value)}
                       </div>
                    )}

                    {(item.type === 'image' || item.type === 'video' || item.type === 'audio') && (
                       <div className="flex items-center gap-4">
                         {item.value ? (
                           <div className="w-16 h-16 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm flex-shrink-0 bg-black/20">
                              {item.type === 'image' && <img src={imageDisplayUrl(item.thumbnailUrl || item.value)} className="w-full h-full object-cover" />}
                              {item.type === 'video' && item.thumbnailUrl && <img src={imageDisplayUrl(item.thumbnailUrl)} className="w-full h-full object-cover" />}
                              {item.type === 'video' && !item.thumbnailUrl && <div className="w-full h-full flex items-center justify-center"><VideoIcon className="w-4 h-4 text-neutral-500" /></div>}
                              {item.type === 'audio' && <div className="w-full h-full flex items-center justify-center"><Volume2 className="w-4 h-4 text-cyan-500" /></div>}
                           </div>
                         ) : (
                           <div className="w-16 h-16 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-500 text-[10px] italic">
                             Empty
                           </div>
                         )}
                         <div className="text-[10px] text-neutral-500 font-medium truncate max-w-xs">{item.value || 'No file uploaded'}</div>
                       </div>
                    )}
                  </div>
                ))}
                {(project.workflow || []).length === 0 && (
                   <div className="py-12 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card flex flex-col items-center justify-center opacity-40">
                      <Layers className="w-10 h-10 mb-2 stroke-1" />
                      <div className="text-[10px] font-black uppercase tracking-widest">No workflow steps</div>
                   </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex justify-end">
          <Link
            to={`/project/${project.id}`}
            onClick={onClose}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-indigo-500 shadow-lg shadow-indigo-500/20 flex items-center gap-2"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Full Project
          </Link>
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 border border-neutral-300 dark:border-neutral-700"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

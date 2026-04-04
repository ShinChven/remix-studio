import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Library } from '../types';
import { Save, ChevronLeft, StickyNote, Maximize2, Minimize2, Split, Eye, Edit3, Calendar, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchLibrary, createLibraryItem, updateLibraryItem } from '../api';

export function PromptEditor() {
  const { id, index } = useParams<{ id: string, index: string }>();
  const navigate = useNavigate();

  const isNew = index === 'new';
  const itemIndex = isNew ? -1 : parseInt(index || '0');

  const [library, setLibrary] = useState<Library | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchLibrary(id).then(lib => {
      setLibrary(lib);
      if (!isNew) {
        const item = lib.items[itemIndex];
        if (item === undefined) {
          navigate(`/library/${id}`);
        } else {
          setContent(item.content || '');
          setTitle(item.title || '');
        }
      }
    }).catch(() => navigate('/libraries'));
  }, [id, index]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!library || !id) return;

    setIsSubmitting(true);
    try {
      if (isNew) {
        const newItem = {
          id: crypto.randomUUID(),
          content,
          title: title.trim() || undefined,
        };
        await createLibraryItem(id, newItem);
      } else {
        const existingItem = library.items[itemIndex];
        await updateLibraryItem(id, existingItem.id, {
          content,
          title: title.trim() || undefined,
        });
      }

      navigate(`/library/${id}`);
    } catch (error) {
      console.error('Failed to save library prompt:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!library) return null;

  return (
    <div className={`h-full flex flex-col bg-neutral-950 transition-all ${isFullScreen ? 'fixed inset-0 z-[60] p-4 md:p-6' : 'p-4 md:p-8'}`}>
      <div className="w-full flex flex-col h-full gap-6 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 rounded-2xl md:rounded-3xl p-4 md:pl-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 md:gap-4 flex-1">
            <button
              onClick={() => navigate(`/library/${id}`)}
              className="p-2 md:p-3 text-neutral-500 hover:text-white hover:bg-neutral-800/80 rounded-xl md:rounded-2xl transition-all border border-neutral-800/50"
              title="Back to Library"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:block p-2.5 bg-blue-600/10 rounded-xl">
              <StickyNote className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isNew ? "Title..." : "Fragment Title"}
                className="bg-transparent border-none text-lg md:text-xl font-bold text-white tracking-tight focus:outline-none focus:ring-0 p-0 placeholder:text-neutral-700 w-full truncate"
              />
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-neutral-600 truncate">
                  {library.name} {isNew ? '' : `• #${itemIndex + 1}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 justify-between md:justify-end">
             <div className="flex items-center bg-neutral-950 p-1 rounded-xl md:rounded-2xl border border-neutral-800 mr-1 md:mr-2">
                <button
                  onClick={() => setViewMode('edit')}
                  className={`p-1.5 md:p-2 rounded-lg md:rounded-xl transition-all ${viewMode === 'edit' ? 'bg-neutral-800 text-blue-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  title="Editor Only"
                >
                  <Edit3 className="w-4 md:w-4.5 h-4 md:h-4.5" />
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={`p-1.5 md:p-2 rounded-lg md:rounded-xl transition-all ${viewMode === 'split' ? 'bg-neutral-800 text-blue-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  title="Split View"
                >
                  <Split className="w-4 md:w-4.5 h-4 md:h-4.5" />
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`p-1.5 md:p-2 rounded-lg md:rounded-xl transition-all ${viewMode === 'preview' ? 'bg-neutral-800 text-blue-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  title="Preview Only"
                >
                  <Eye className="w-4 md:w-4.5 h-4 md:h-4.5" />
                </button>
             </div>

             <button
               onClick={() => setIsFullScreen(!isFullScreen)}
               className="p-2 md:p-3 text-neutral-500 hover:text-white hover:bg-neutral-800/80 rounded-xl md:rounded-2xl transition-all border border-neutral-800/50"
               title="Toggle Fullscreen"
             >
               {isFullScreen ? <Minimize2 className="w-4 md:w-5 h-4 md:h-5" /> : <Maximize2 className="w-4 md:w-5 h-4 md:h-5" />}
             </button>

             <button
               onClick={() => handleSubmit()}
               disabled={isSubmitting || (content.trim() === '' && !isNew)}
               className="px-4 md:px-6 py-2 md:py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl md:rounded-2xl font-bold uppercase tracking-widest text-[10px] md:text-xs transition-all shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 md:gap-3"
             >
               <Save className="w-3.5 md:w-4 h-3.5 md:h-4" />
               <span className="hidden xs:inline">Save</span>
               <span className="xs:hidden">Save</span>
             </button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 min-h-0 bg-neutral-900 border border-neutral-800 rounded-3xl md:rounded-[40px] overflow-hidden flex shadow-2xl flex-col">
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {(viewMode === 'edit' || viewMode === 'split') && (
              <div className={`flex-1 flex flex-col h-full ${viewMode === 'split' ? 'border-r border-neutral-800' : ''}`}>
                <div className="px-6 py-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Source Content
                  </span>
                  <div className="text-[8px] font-bold text-neutral-700 uppercase tracking-widest">Supports GFM Markdown</div>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Draft your library fragment here using Markdown..."
                  className="flex-1 w-full bg-transparent border-none p-4 md:p-8 text-neutral-200 text-sm md:text-base font-mono leading-relaxed focus:outline-none focus:ring-0 resize-none placeholder:text-neutral-800 custom-scrollbar"
                />
              </div>
            )}

            {(viewMode === 'preview' || viewMode === 'split') && (
              <div className="flex-1 flex flex-col h-full bg-neutral-950/30">
                 <div className="px-6 py-3 border-b border-neutral-800 flex items-center bg-neutral-950/40">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Dynamic Preview
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8 prose prose-invert prose-neutral max-w-none prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800 custom-scrollbar">
                   {content.trim() === '' ? (
                     <div className="h-full flex items-center justify-center text-neutral-700 italic font-medium">
                        Write something to see the preview here...
                     </div>
                   ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                   )}
                </div>
              </div>
            )}

          </div>

          <div className="bg-neutral-950/50 border-t border-neutral-800 px-4 md:px-6 py-2 md:py-3 flex flex-wrap items-center justify-between gap-y-2 text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-neutral-600">
             <div className="flex items-center gap-4 md:gap-6">
               <span>Words: {content.trim() === '' ? 0 : content.trim().split(/\s+/).length}</span>
               <span>Chars: {content.length}</span>
             </div>
             <div className="flex items-center gap-3 md:gap-4">
               <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {new Date().toLocaleDateString()}</span>
               <span className="hidden sm:inline text-neutral-800">|</span>
               <span className="hidden sm:inline">Library: {library.id}</span>
             </div>
          </div>
        </div>
      </div>

      <style>{`
        .prose {
          color: #d4d4d4;
          line-height: 1.75;
        }
        .prose h1 { color: #ffffff; font-weight: 900; font-size: 2.25rem; margin-top: 2rem; margin-bottom: 1rem; border-bottom: 1px solid #262626; padding-bottom: 0.5rem; }
        .prose h2 { color: #ffffff; font-weight: 800; font-size: 1.5rem; margin-top: 1.5rem; margin-bottom: 0.75rem; }
        .prose h3 { color: #f5f5f5; font-weight: 700; font-size: 1.25rem; margin-top: 1.25rem; margin-bottom: 0.5rem; }
        .prose p { margin-bottom: 1.25rem; font-weight: 400; }
        .prose strong { color: #ffffff; font-weight: 700; }
        .prose code { color: #3b82f6; background-color: rgba(59, 130, 246, 0.1); padding: 0.2rem 0.4rem; border-radius: 0.4rem; font-size: 0.9em; }
        .prose pre { padding: 1rem; border-radius: 1rem; }
        .prose ul, .prose ol { margin-bottom: 1.25rem; padding-left: 1.5rem; }
        .prose li { margin-bottom: 0.5rem; }
        .prose blockquote { border-left: 4px solid #3b82f6; padding-left: 1.5rem; font-style: italic; color: #a3a3a3; margin: 1.5rem 0; }
        .prose a { color: #3b82f6; text-decoration: none; }
        .prose a:hover { text-decoration: underline; }
        .prose hr { border: 0; border-top: 1px solid #262626; margin: 2rem 0; }
      `}</style>
    </div>
  );
}

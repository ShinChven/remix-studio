import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Library, LibraryItem } from '../types';
import { fetchLibrary, createLibraryItemsBatch } from '../api';
import { 
  ChevronLeft, 
  UploadCloud, 
  Download, 
  FileText, 
  Trash2, 
  Check, 
  AlertCircle, 
  Loader2,
  Plus,
  ArrowRight,
  Tag
} from 'lucide-react';
import { toast } from 'sonner';

export function LibraryImportExport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [importText, setImportText] = useState('');
  const [previewItems, setPreviewItems] = useState<{ title?: string; content: string }[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    fetchLibrary(id)
      .then(lib => {
        if (lib.type !== 'text') {
          navigate(`/library/${id}`);
          return;
        }
        setLibrary(lib);
      })
      .catch(() => navigate('/libraries'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    // Parse import text into preview items
    const lines = importText.split('\n').filter(line => line.trim().startsWith('- '));
    const items = lines.map(line => {
      const contentWithTitle = line.trim().substring(2); // Remove "- "
      const colonIndex = contentWithTitle.indexOf(':');
      
      if (colonIndex !== -1) {
        const title = contentWithTitle.substring(0, colonIndex).trim();
        const content = contentWithTitle.substring(colonIndex + 1).trim();
        return { title: title || undefined, content };
      } else {
        return { content: contentWithTitle.trim() };
      }
    }).filter(item => item.content !== '');
    
    setPreviewItems(items);
  }, [importText]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    let combinedText = importText;
    for (const file of files) {
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsText(file);
      });
      combinedText = combinedText ? `${combinedText}\n${text}` : text;
    }
    setImportText(combinedText);
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    let combinedText = importText;
    for (const file of files) {
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsText(file);
        });
        combinedText = combinedText ? `${combinedText}\n${text}` : text;
      }
    }
    setImportText(combinedText);
  };

  const handleImport = async () => {
    if (!id || !library || previewItems.length === 0) return;
    
    setIsImporting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t !== '');

      const itemsToCreate: LibraryItem[] = previewItems.map((item, index) => ({
        id: crypto.randomUUID(),
        content: item.content,
        title: item.title,
        tags: tags.length > 0 ? tags : undefined,
        order: library.items.length + index,
      }));
      
      await createLibraryItemsBatch(id, itemsToCreate);
      navigate(`/library/${id}`);
    } catch (error: any) {
      console.error('Failed to import items:', error);
      toast.error(`Failed to import items: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = () => {
    if (!library) return;
    
    const content = library.items.map(item => {
      if (item.title) {
        return `- ${item.title}: ${item.content}`;
      }
      return `- ${item.content}`;
    }).join('\n');
    
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${library.name.replace(/\s+/g, '_')}_export.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!library) return null;

  return (
    <div className="h-full flex flex-col bg-neutral-950 p-4 md:p-8 animate-in fade-in duration-700">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full gap-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/library/${id}`)}
              className="p-3 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-2xl transition-all border border-neutral-800/50"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-500" />
                Import / Export
              </h2>
              <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest mt-1">
                Collection: {library.name}
              </p>
            </div>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white px-6 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all border border-neutral-800 active:scale-95 shadow-xl shadow-black/20"
          >
            <Download className="w-4 h-4 text-blue-400" />
            Export to .md
          </button>
        </div>

        {/* Content Tabs/Sections */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-hidden">
          
          {/* Left Side: Input */}
          <div className="flex flex-col gap-6 min-h-0">
             {/* Global Tags Input */}
             <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-[24px] p-4 group transition-all hover:border-neutral-700">
                <div className="flex items-center gap-3 mb-2 px-1">
                  <Tag className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                    Apply Tags to all items
                  </span>
                </div>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. nature, photography, portrait (comma separated)"
                  className="w-full bg-transparent border-none p-1 text-sm text-neutral-200 placeholder:text-neutral-700 focus:outline-none focus:ring-0"
                />
             </div>

             <div 
               className={`flex-1 flex flex-col bg-neutral-900/40 border-2 border-dashed rounded-[32px] p-6 transition-all relative group ${isDragOver ? 'border-blue-500 bg-blue-500/5 scale-[0.99]' : 'border-neutral-800/60 hover:border-neutral-700'}`}
               onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
               onDragLeave={() => setIsDragOver(false)}
               onDrop={handleDrop}
             >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-2">
                    <Plus className="w-3 h-3" />
                    Import Fragments
                  </span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setImportText('')}
                      className="p-2 text-neutral-600 hover:text-red-400 transition-colors"
                      title="Clear Input"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all border border-blue-600/20"
                      title="Upload File"
                    >
                      <UploadCloud className="w-4 h-4" />
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept=".txt,.md" 
                      multiple
                      onChange={handleFileUpload} 
                    />
                  </div>
                </div>

                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Paste content here using the format:\n- Title: Content fragment\n- Just content fragment...`}
                  className="flex-1 w-full bg-transparent border-none p-2 text-neutral-300 text-sm font-mono leading-relaxed focus:outline-none focus:ring-0 resize-none placeholder:text-neutral-700 custom-scrollbar"
                />

                {!importText && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity">
                    <UploadCloud className="w-12 h-12 text-neutral-700 mb-4" />
                    <p className="text-sm font-bold text-neutral-600">Drag & Drop .txt file or paste items</p>
                  </div>
                )}
             </div>

             <div className="bg-blue-600/5 border border-blue-600/10 rounded-2xl p-4 flex items-start gap-4">
                <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-[10px] leading-relaxed font-medium text-blue-400/80 uppercase tracking-wider">
                  <strong className="text-blue-400 block mb-1">Format Guide</strong>
                  Each item must start with "- ". Use a colon ":" to separate the title from the content. 
                  Multiple items can be imported at once.
                </div>
             </div>
          </div>

          {/* Right Side: Preview */}
          <div className="flex flex-col gap-6 min-h-0 bg-neutral-900/20 border border-neutral-800/40 rounded-[32px] p-6">
            <div className="flex items-center justify-between">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2">
                <Check className="w-3 h-3" />
                Live Preview ({previewItems.length} items)
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {previewItems.length > 0 ? (
                previewItems.map((item, idx) => (
                  <div key={idx} className="bg-neutral-950/50 border border-neutral-800/40 rounded-2xl p-4 animate-in slide-in-from-right-2 duration-300" style={{ animationDelay: `${idx * 20}ms` }}>
                    {item.title && (
                      <h4 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-1.5 truncate">
                        {item.title}
                      </h4>
                    )}
                    <p className="text-neutral-400 text-xs leading-relaxed line-clamp-2">
                      {item.content}
                    </p>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-neutral-700 italic font-medium gap-4">
                   <div className="w-12 h-12 rounded-2xl border-2 border-neutral-800/50 flex items-center justify-center">
                    <ArrowRight className="w-6 h-6 text-neutral-800" />
                   </div>
                   Items will appear here once parsed...
                </div>
              )}
            </div>

            <button
              onClick={handleImport}
              disabled={isImporting || previewItems.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-black uppercase tracking-[0.2em] text-xs py-4 rounded-2xl transition-all shadow-2xl shadow-blue-500/20 active:scale-[0.98] flex items-center justify-center gap-3"
            >
              {isImporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Confirm Import
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

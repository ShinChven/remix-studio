import React from 'react';
import { Copy, FileText, Sparkles, X } from 'lucide-react';
import { AlbumItem } from '../../types';
import { toast } from 'sonner';

interface TextAlbumDetailDialogProps {
  item: AlbumItem | null;
  onClose: () => void;
}

export function TextAlbumDetailDialog({ item, onClose }: TextAlbumDetailDialogProps) {
  if (!item) return null;

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />

      <div
        className="relative w-full max-w-5xl max-h-[85vh] bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Text album details"
      >
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 rounded-xl">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Text Details</h3>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">Prompt and generated content</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
            aria-label="Close text details dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6 bg-neutral-950/10">
          <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-neutral-300">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Prompt</span>
              </div>
              <button
                onClick={() => handleCopy(item.prompt, 'Prompt')}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
            <div className="p-5 md:p-6">
              <p className="whitespace-pre-wrap break-words text-sm md:text-base text-neutral-200 leading-relaxed">
                {item.prompt}
              </p>
            </div>
          </section>

          <section className="rounded-[24px] border border-neutral-800 bg-neutral-950/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-neutral-300">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">Generated Text</span>
              </div>
              <button
                onClick={() => handleCopy(item.textContent || '', 'Generated text')}
                disabled={!item.textContent}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
            <div className="p-5 md:p-6">
              <div className="whitespace-pre-wrap break-words text-sm md:text-base text-neutral-100 leading-relaxed">
                {item.textContent || 'No generated text.'}
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/40 flex items-center justify-between gap-4">
          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest pl-2">
            {(item.textContent || '').length} characters
          </div>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-blue-500/20 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

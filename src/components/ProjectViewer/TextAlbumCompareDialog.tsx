import React, { useEffect } from 'react';
import { Copy, Columns3, FileImage, X } from 'lucide-react';
import { AlbumItem } from '../../types';
import { imageDisplayUrl } from '../../api';
import { toast } from 'sonner';

interface TextAlbumCompareDialogProps {
  items: AlbumItem[];
  setLightboxData: (data: { images: string[], index: number } | null) => void;
  onClose: () => void;
}

export function TextAlbumCompareDialog({ items, setLightboxData, onClose }: TextAlbumCompareDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[210] bg-black/90 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="relative flex h-full w-full flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/30 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-blue-600/10 p-2.5">
              <Columns3 className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white tracking-tight">Compare Texts</h3>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {items.length} selected · esc close
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-neutral-500 transition-all hover:bg-white/10 hover:text-white"
            aria-label="Close compare view"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar px-4 py-4 md:px-6 md:py-6">
          <div className="flex h-full gap-4 md:gap-6">
            {items.map((item, index) => (
              <article
                key={item.id}
                className="flex h-full w-[min(40rem,calc(100vw-4rem))] shrink-0 flex-col overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900/90 shadow-2xl shadow-black/30 md:w-[min(42rem,calc(100vw-8rem))]"
              >
                <header className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950/60 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-neutral-600">#{(index + 1).toString().padStart(2, '0')}</div>
                    <div className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                      {item.providerId || 'Provider'} · {item.modelConfigId || 'Model'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(item.prompt, 'Prompt')}
                      className="flex items-center gap-1.5 rounded-xl bg-neutral-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-neutral-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Prompt
                    </button>
                    <button
                      onClick={() => handleCopy(item.textContent || '', 'Generated text')}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-300 transition-all hover:bg-blue-600/30"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Text
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 md:px-5 md:py-5">
                  {(item.imageContexts || []).length > 0 && (
                    <section className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <FileImage className="w-4 h-4 text-blue-400" />
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                          Reference Images ({item.imageContexts?.length || 0})
                        </div>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                        {(item.imageContexts || []).map((src, refIndex) => (
                          <button
                            key={`${item.id}-compare-ref-${refIndex}`}
                            type="button"
                            onClick={() => setLightboxData({ images: (item.imageContexts || []).map(imageDisplayUrl), index: refIndex })}
                            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900"
                          >
                            <img
                              src={imageDisplayUrl(src)}
                              alt={`Reference ${refIndex + 1}`}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Prompt</div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">
                      {item.prompt}
                    </p>
                  </section>

                  <section className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Generated Text</div>
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100">
                      {item.textContent || 'No generated text.'}
                    </div>
                  </section>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

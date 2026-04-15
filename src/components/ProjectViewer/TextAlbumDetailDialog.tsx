import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Copy, FileImage, FileText, Sparkles, X } from 'lucide-react';
import { AlbumItem } from '../../types';
import { imageDisplayUrl } from '../../api';
import { toast } from 'sonner';

interface TextAlbumDetailDialogProps {
  items: AlbumItem[];
  startIndex: number | null;
  setLightboxData: (data: { images: string[], index: number, onDelete?: (index: number) => void, onIndexChange?: (index: number) => void } | null) => void;
  onClose: () => void;
}

export function TextAlbumDetailDialog({ items, startIndex, setLightboxData, onClose }: TextAlbumDetailDialogProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(startIndex ?? 0);

  useEffect(() => {
    if (startIndex !== null) {
      setCurrentIndex(startIndex);
    }
  }, [startIndex]);

  useEffect(() => {
    if (startIndex === null || items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, onClose, startIndex]);

  if (startIndex === null || items.length === 0) return null;

  const item = items[currentIndex];
  const hasMultipleItems = items.length > 1;
  const referenceImages = item.imageContexts || [];

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('projectViewer.textDetail.copied', { label }));
    } catch {
      toast.error(t('projectViewer.textDetail.copyFailed', { label: label.toLowerCase() }));
    }
  };

  const showPrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const showNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      {hasMultipleItems && (
        <button
          onClick={showPrev}
          className="hidden md:block absolute left-3 top-1/2 z-10 -translate-y-1/2 p-3 text-white/50 hover:text-white transition-colors bg-black/40 hover:bg-black/70 rounded-full"
          aria-label={t('projectViewer.textDetail.previousItem')}
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      <div
        className="relative flex h-full w-full flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={t('projectViewer.textDetail.dialogAria')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-black/30 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 rounded-xl">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{t('projectViewer.textDetail.title')}</h3>
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5">
                {t('projectViewer.textDetail.itemIndex', { index: (currentIndex + 1).toString().padStart(2, '0') })}
                {hasMultipleItems ? ` / ${items.length.toString().padStart(2, '0')}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasMultipleItems && (
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  onClick={showPrev}
                  className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                  aria-label={t('projectViewer.textDetail.previousItem')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={showNext}
                  className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                  aria-label={t('projectViewer.textDetail.nextItem')}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              aria-label={t('projectViewer.textDetail.closeAria')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(280px,34vw)_1fr]">
          <section className="min-h-0 border-b border-white/10 bg-neutral-50/60 dark:bg-neutral-950/60 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="px-4 md:px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-500">{t('projectViewer.common.prompt')}</span>
                </div>
                <button
                  onClick={() => handleCopy(item.prompt, t('projectViewer.common.prompt'))}
                  className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center gap-2 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t('projectViewer.common.copy')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
                {referenceImages.length > 0 && (
                  <div className="mb-6">
                    <div className="mb-3 flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                      <FileImage className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-500">
                        {t('projectViewer.textDetail.referenceImages', { count: referenceImages.length })}
                      </span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                      {referenceImages.map((src, idx) => (
                        <button
                          key={`${item.id}-ref-${idx}`}
                          type="button"
                          onClick={() => setLightboxData({ images: referenceImages.map(imageDisplayUrl), index: idx })}
                          className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                        >
                          <img
                            src={imageDisplayUrl(src)}
                            alt={t('projectViewer.textDetail.referenceAlt', { index: idx + 1 })}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-left text-[9px] font-black uppercase tracking-[0.18em] text-white/80">
                            {t('projectViewer.textDetail.refShort', { index: idx + 1 })}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-sm md:text-base text-neutral-200 leading-relaxed">
                  {item.prompt}
                </p>
              </div>
            </div>
          </section>

          <section className="min-h-0 bg-black/20">
            <div className="flex h-full flex-col">
              <div className="px-4 md:px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-500">{t('projectViewer.common.generatedText')}</span>
                </div>
                <button
                  onClick={() => handleCopy(item.textContent || '', t('projectViewer.common.generatedText'))}
                  disabled={!item.textContent}
                  className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center gap-2 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t('projectViewer.common.copy')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
                <div className="mx-auto max-w-4xl whitespace-pre-wrap break-words text-base md:text-lg text-neutral-100 leading-relaxed">
                  {item.textContent || t('projectViewer.textDetail.noGeneratedText')}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/10 bg-black/30 px-4 py-3 md:px-6">
          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
            {t('projectViewer.textDetail.characterCount', { count: (item.textContent || '').length })}
          </div>
          <div className="hidden md:block text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
            {t('projectViewer.textDetail.keyboardHint')}
          </div>
        </div>
      </div>

      {hasMultipleItems && (
        <button
          onClick={showNext}
          className="hidden md:block absolute right-3 top-1/2 z-10 -translate-y-1/2 p-3 text-white/50 hover:text-white transition-colors bg-black/40 hover:bg-black/70 rounded-full"
          aria-label={t('projectViewer.textDetail.nextItem')}
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
}

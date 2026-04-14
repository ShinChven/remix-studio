import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Type, X } from 'lucide-react';
import { AlbumItem } from '../../types';
import { toast } from 'sonner';

interface AlbumPromptModalProps {
  item: AlbumItem | null;
  onClose: () => void;
}

export function AlbumPromptModal({ item, onClose }: AlbumPromptModalProps) {
  const { t } = useTranslation();
  if (!item) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      toast.success(t('projectViewer.albumPrompt.promptCopied'));
    } catch {
      toast.error(t('projectViewer.albumPrompt.copyFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[min(80vh,900px)] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[24px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-4 sm:p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 rounded-xl">
              <Type className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{t('projectViewer.albumPrompt.title')}</h3>
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5">{t('projectViewer.albumPrompt.description')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
            aria-label={t('projectViewer.albumPrompt.closeAria')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto custom-scrollbar">
          <div className="min-h-full rounded-[20px] sm:rounded-[24px] border border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 p-4 sm:p-6 md:p-8">
            <p className="whitespace-pre-wrap break-words text-neutral-200 text-base sm:text-lg md:text-xl font-medium leading-relaxed">
              {item.prompt}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest sm:pl-2">
            {t('projectViewer.albumPrompt.characterCount', { count: item.prompt.length })}
          </div>
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={handleCopy}
              className="w-full sm:w-auto px-6 py-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('projectViewer.common.copy')}
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-blue-500/20 active:scale-95"
            >
              {t('projectViewer.common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

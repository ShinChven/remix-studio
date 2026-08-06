import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileArchive, Loader2, X } from 'lucide-react';

interface ExportFileNameModalProps {
  isOpen: boolean;
  defaultName: string;
  exporting: boolean;
  onClose: () => void;
  onConfirm: (fileName: string) => Promise<void> | void;
}

export function ExportFileNameModal({
  isOpen,
  defaultName,
  exporting,
  onClose,
  onConfirm,
}: ExportFileNameModalProps) {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState(defaultName);

  useEffect(() => {
    if (!isOpen) return;
    setFileName(defaultName);
  }, [defaultName, isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const trimmed = fileName.trim();
    if (!trimmed || exporting) return;
    await onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => !exporting && onClose()}
    >
      <div
        className="bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 backdrop-blur-3xl rounded-card shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              <div className="p-3 sm:p-4 rounded-card bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">
                <FileArchive className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t('libraryEditor.exportModal.title', 'Export Library')}</h3>
                <p className="mt-2 sm:mt-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {t('libraryEditor.exportModal.description', 'Confirm the ZIP filename before downloading this library.')}
                </p>
              </div>
            </div>
            <button
              onClick={() => !exporting && onClose()}
              className="p-2 rounded-xl text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition-colors"
              aria-label={t('libraryEditor.exportModal.cancel', 'Cancel')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-6 sm:mt-8">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">{t('libraryEditor.exportModal.fileName', 'File Name')}</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
              autoFocus
              onFocus={(e) => e.target.select()}
              className="mt-2 w-full rounded-card border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-white outline-none transition-colors focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder={t('libraryEditor.exportModal.placeholder', 'library_export.zip')}
            />
          </div>
        </div>

        <div className="px-5 py-4 sm:px-8 sm:py-6 pb-[max(1rem,env(safe-area-inset-bottom))] bg-neutral-50/40 dark:bg-neutral-950/40 flex flex-wrap items-center justify-end gap-3 sm:gap-4 border-t border-neutral-200/50 dark:border-neutral-800/50">
          <button
            onClick={() => !exporting && onClose()}
            className="px-4 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
            disabled={exporting}
          >
            {t('libraryEditor.exportModal.cancel', 'Cancel')}
          </button>

          <button
            onClick={() => void handleConfirm()}
            disabled={exporting || !fileName.trim()}
            className="px-5 sm:px-8 py-3 rounded-card text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('libraryEditor.exportModal.exporting', 'Exporting...')}
              </span>
            ) : (
              t('libraryEditor.exportModal.confirm', 'Export ZIP')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

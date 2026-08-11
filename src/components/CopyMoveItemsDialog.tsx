import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, FolderInput, Copy } from 'lucide-react';
import { fetchLibraries } from '../api';
import { Library, LibraryType } from '../types';

interface CopyMoveItemsDialogProps {
  isOpen: boolean;
  action: 'copy' | 'move';
  sourceLibraryId: string;
  libraryType: LibraryType;
  itemCount: number;
  onClose: () => void;
  onConfirm: (destinationLibraryId: string) => Promise<void>;
}

export function CopyMoveItemsDialog({
  isOpen,
  action,
  sourceLibraryId,
  libraryType,
  itemCount,
  onClose,
  onConfirm,
}: CopyMoveItemsDialogProps) {
  const { t } = useTranslation();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitting(false);
    setSelectedLibraryId('');
    
    let isMounted = true;
    setLoading(true);
    fetchLibraries(1, 100)
      .then((res) => {
        if (!isMounted) return;
        const validLibraries = res.items.filter(
          (lib) => lib.id !== sourceLibraryId && lib.type === libraryType
        );
        setLibraries(validLibraries);
        if (validLibraries.length > 0) {
          setSelectedLibraryId(validLibraries[0].id);
        }
      })
      .catch((err) => console.error('Failed to load libraries', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sourceLibraryId, libraryType]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedLibraryId || submitting) return;

    setSubmitting(true);
    try {
      await onConfirm(selectedLibraryId);
      onClose();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

  const Icon = action === 'copy' ? Copy : FolderInput;
  const title = action === 'copy' ? t('libraryEditor.copyItemsTitle', 'Copy Items') : t('libraryEditor.moveItemsTitle', 'Move Items');
  const description = action === 'copy' 
    ? t('libraryEditor.copyItemsDescription', { defaultValue: 'Select a destination library to copy {{count}} items to.', count: itemCount })
    : t('libraryEditor.moveItemsDescription', { defaultValue: 'Select a destination library to move {{count}} items to.', count: itemCount });

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-white dark:bg-neutral-900/40 dark:backdrop-blur-3xl border border-neutral-200 dark:border-white/5 rounded-card shadow-2xl dark:shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              <div className="p-3 sm:p-4 rounded-card bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">
                <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{title}</h3>
                <p className="mt-2 sm:mt-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
            <button
              onClick={() => !submitting && onClose()}
              className="p-2 rounded-xl text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-6 sm:mt-8">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 ml-1">
              {t('libraryEditor.destinationLibrary', 'Destination Library')}
            </label>
            {loading ? (
              <div className="mt-2 flex items-center gap-2 p-3 border border-neutral-200 dark:border-neutral-800 rounded-card bg-neutral-50 dark:bg-neutral-950">
                <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                <span className="text-sm text-neutral-500">{t('common.loading', 'Loading...')}</span>
              </div>
            ) : libraries.length === 0 ? (
              <div className="mt-2 p-4 border border-neutral-200 dark:border-neutral-800 rounded-card bg-neutral-50 dark:bg-neutral-950 text-sm text-neutral-500 text-center">
                {t('libraryEditor.noCompatibleLibraries', 'No compatible libraries found.')}
              </div>
            ) : (
              <select
                value={selectedLibraryId}
                onChange={(e) => setSelectedLibraryId(e.target.value)}
                className="mt-2 w-full rounded-card border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-white outline-none transition-colors focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              >
                {libraries.map((lib) => (
                  <option key={lib.id} value={lib.id}>
                    {lib.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="px-5 py-4 sm:px-8 sm:py-6 pb-[max(1rem,env(safe-area-inset-bottom))] bg-neutral-50/40 dark:bg-neutral-950/40 flex flex-wrap items-center justify-end gap-3 sm:gap-4 border-t border-neutral-200/50 dark:border-neutral-800/50">
          <button
            onClick={() => !submitting && onClose()}
            className="px-4 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-300 dark:hover:border-neutral-800/80 active:scale-95"
            disabled={submitting}
          >
            {t('common.cancel', 'Cancel')}
          </button>

          <button
            onClick={handleConfirm}
            disabled={submitting || !selectedLibraryId}
            className="px-5 sm:px-8 py-3 rounded-card text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {action === 'copy' ? t('libraryEditor.confirmCopy', 'Copy') : t('libraryEditor.confirmMove', 'Move')}
          </button>
        </div>
      </div>
    </div>
  );
}

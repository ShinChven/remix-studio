import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit3 } from 'lucide-react';

interface RenameItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  initialName: string;
}

export function RenameItemModal({
  isOpen,
  onClose,
  onConfirm,
  initialName,
}: RenameItemModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-2xl rounded-[24px] sm:rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(720px,calc(100dvh-3rem))] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-8 overflow-y-auto">
          <div className="flex items-center gap-4 sm:gap-6 mb-6">
             <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl flex-shrink-0 bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Edit3 className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
              {t('libraryEditor.renameItem', 'Rename Item')}
            </h3>
          </div>
          
          <div className="space-y-2">
             <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onConfirm(name);
                    onClose();
                  }
                }}
                autoFocus
                onFocus={(e) => e.target.select()}
                placeholder={initialName}
                className="w-full bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm sm:text-base text-neutral-900 dark:text-white placeholder:text-neutral-500 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
              />
          </div>
        </div>

        <div className="px-5 py-4 sm:px-8 sm:py-6 bg-neutral-100/50 dark:bg-black/20 backdrop-blur-xl flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-4 border-t border-neutral-200/50 dark:border-white/5 shadow-sm">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent active:scale-95"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          
          <button
            onClick={() => {
              onConfirm(name);
              onClose();
            }}
            className="w-full sm:w-auto px-5 sm:px-8 py-3 rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] bg-blue-600 hover:bg-blue-500 text-neutral-900 dark:text-white shadow-blue-500/20"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}

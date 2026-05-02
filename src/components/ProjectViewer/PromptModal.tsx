import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Type, X, Save } from 'lucide-react';
import { WorkflowItem } from '../../types';

interface PromptModalProps {
  item: WorkflowItem | null;
  onClose: () => void;
  onSave: (val: string) => void;
}

export function PromptModal({ item, onClose, onSave }: PromptModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (item) setValue(item.value);
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-card shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 rounded-xl">
              <Type className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{t('projectViewer.promptModal.title')}</h3>
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5">{t('projectViewer.promptModal.description')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-6 md:p-8 flex flex-col">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('projectViewer.promptModal.placeholder')}
            className="flex-1 w-full bg-transparent border-none text-neutral-200 text-lg md:text-xl font-medium leading-relaxed focus:outline-none focus:ring-0 resize-none placeholder:text-neutral-800 custom-scrollbar"
          />
        </div>

        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex items-center justify-between gap-4">
          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest pl-2">
            {t('projectViewer.promptModal.characterCount', { count: value.length })}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 text-neutral-600 dark:text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] transition-all"
            >
              {t('projectViewer.common.cancel')}
            </button>
            <button 
              onClick={() => onSave(value)}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-neutral-900 dark:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              {t('projectViewer.promptModal.saveChanges')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

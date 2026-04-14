import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Library as LibraryIcon } from 'lucide-react';
import { Library } from '../../types';

interface LibrarySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  libraries: Library[];
  selectedLibraryIds: string[];
}

export function LibrarySelectionModal({
  isOpen,
  onClose,
  onSelect,
  libraries,
  selectedLibraryIds
}: LibrarySelectionModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl max-h-[80vh] bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/10 rounded-xl">
              <LibraryIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">{t('projectViewer.librarySelection.title')}</h3>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">{t('projectViewer.librarySelection.description')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {libraries.length === 0 ? (
            <div className="py-20 text-center">
              <LibraryIcon className="w-12 h-12 text-neutral-800 mx-auto mb-4" />
              <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">{t('projectViewer.librarySelection.noLibraries')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {libraries.map(lib => {
                const isSelected = selectedLibraryIds.includes(lib.id);
                return (
                  <button
                    key={lib.id}
                    onClick={() => !isSelected && onSelect(lib.id)}
                    disabled={isSelected}
                    className={`group flex items-start gap-4 p-5 border rounded-2xl text-left transition-all ${
                      isSelected 
                        ? 'bg-neutral-900/20 border-neutral-800 opacity-50 cursor-not-allowed' 
                        : 'bg-neutral-950/40 border-neutral-800 hover:bg-neutral-800 hover:border-emerald-500/30 hover:scale-[1.02] active:scale-100'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {(lib.type === 'image' || lib.type === 'video') && lib.items[0] ? (
                        <div className={`w-12 h-12 rounded-xl overflow-hidden border shadow-md ${isSelected ? 'border-neutral-800 grayscale' : 'border-neutral-800'}`}>
                          <img 
                            src={lib.type === 'image' 
                              ? (lib.items[0].thumbnailUrl || lib.items[0].content)
                              : (lib.items[0].thumbnailUrl || '')} 
                            alt={lib.name} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      ) : (
                        <div className={`p-3 bg-neutral-900 rounded-xl border transition-all ${isSelected ? 'border-neutral-800' : 'border-neutral-800 group-hover:bg-neutral-950 group-hover:border-emerald-500/20'}`}>
                          <LibraryIcon className={`w-6 h-6 ${isSelected ? 'text-neutral-600' : 'text-emerald-500'}`} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 pt-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-neutral-500' : 'text-neutral-100 group-hover:text-white'}`}>
                          {lib.name}
                        </div>
                        {isSelected && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            {t('projectViewer.librarySelection.added')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                          isSelected 
                            ? 'bg-neutral-900/50 border-neutral-800 text-neutral-600' 
                            : 'bg-neutral-950 border-neutral-800 text-neutral-500 group-hover:border-neutral-700'
                        }`}>
                          {lib.type === 'text' ? t('projectViewer.common.text') :
                           lib.type === 'image' ? t('projectViewer.common.imageShort') :
                           lib.type === 'video' ? t('projectViewer.common.video') :
                           lib.type === 'audio' ? t('projectViewer.common.audio') :
                           lib.type}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelected ? 'text-neutral-700' : 'text-neutral-600'}`}>
                          {t('projectViewer.workflow.itemsCount', { count: lib.items.length })}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950/40 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            {t('projectViewer.common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

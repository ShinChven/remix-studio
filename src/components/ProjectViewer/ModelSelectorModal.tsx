import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Layers, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { Provider, ProjectType } from '../../types';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Provider[];
  selectedProviderId: string;
  selectedModelId: string;
  onSelect: (providerId: string, modelId: string) => void;
  projectType?: ProjectType;
}

export function ModelSelectorModal({
  isOpen,
  onClose,
  providers,
  selectedProviderId,
  selectedModelId,
  onSelect,
  projectType = 'image',
}: ModelSelectorModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProviders = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return providers.map(provider => {
      const filteredModels = provider.models?.filter(m => {
        const matchesCategory = !m.category || m.category === projectType;
        const matchesSearch = query === '' 
          || m.name.toLowerCase().includes(query) 
          || m.generatorId.toLowerCase().includes(query) 
          || provider.name.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
      }) || [];
      return { ...provider, models: filteredModels };
    }).filter(provider => provider.models.length > 0);
  }, [providers, projectType, searchQuery]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 backdrop-blur-3xl rounded-card md:rounded-[40px] shadow-[0_50px_100px_rgba(0,0,0,0.9)] max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-neutral-200/50 dark:border-neutral-800/50 flex flex-col gap-5 bg-neutral-50/20 dark:bg-neutral-950/20 backdrop-blur-md">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-2xl md:text-3xl font-black text-neutral-900 dark:text-white tracking-tight leading-none mb-2">{t('projectViewer.modelSelector.title')}</h3>
              <p className="text-neutral-500 dark:text-neutral-500 text-xs md:text-sm font-medium">{t('projectViewer.modelSelector.description')}</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2.5 md:p-3 bg-neutral-200/50 dark:bg-neutral-800/50 hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-white rounded-xl md:rounded-card transition-all active:scale-90 border border-neutral-700/30 shrink-0"
            >
              <X className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-neutral-500 dark:text-neutral-500 group-focus-within:text-blue-500 transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('projectViewer.modelSelector.searchPlaceholder')}
              className="w-full bg-neutral-50/50 dark:bg-neutral-950/50 border border-neutral-200 dark:border-neutral-800 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 rounded-card py-3 pl-11 pr-4 text-sm text-neutral-900 dark:text-white placeholder-neutral-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
          {providers.length === 0 ? (
            <div className="text-center py-20 bg-neutral-50/30 dark:bg-neutral-950/30 rounded-card border border-dashed border-neutral-200 dark:border-neutral-800">
              <AlertCircle className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
              <p className="text-neutral-500 dark:text-neutral-500 font-bold uppercase tracking-widest text-xs">{t('projectViewer.modelSelector.noProviders')}</p>
              <p className="text-neutral-600 text-sm mt-2">{t('projectViewer.modelSelector.noProvidersHint')}</p>
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-neutral-500 dark:text-neutral-500 text-sm">{t('projectViewer.modelSelector.noModelsFound', { query: searchQuery })}</p>
            </div>
          ) : (
            filteredProviders.map((provider) => (
              <div key={provider.id} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <Layers className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-neutral-900 dark:text-white uppercase tracking-wider">{provider.name}</h4>
                    {provider.name.toLowerCase().replace(/\s/g, '') !== provider.type.toLowerCase().replace(/\s/g, '') && (
                      <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">{provider.type}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {provider.models.map((model) => {
                    const isSelected = provider.id === selectedProviderId && model.id === selectedModelId;
                    return (
                      <button
                        key={model.id}
                        onClick={() => onSelect(provider.id, model.id)}
                        className={`group relative p-3 rounded-xl text-left transition-all border active:scale-[0.98] overflow-hidden ${
                          isSelected
                            ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.15)] ring-1 ring-blue-500'
                            : 'bg-white/70 dark:bg-neutral-900/70 border-neutral-200/50 dark:border-white/5 hover:border-neutral-700 hover:bg-white/80 dark:hover:bg-neutral-900/80 shadow-sm backdrop-blur-xl'
                        }`}
                      >
                        <div className="relative z-10 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-bold leading-5 line-clamp-2 break-words tracking-tight transition-colors ${isSelected ? 'text-blue-50' : 'text-neutral-700 dark:text-neutral-300'}`}>
                              {model.name}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="shrink-0 p-1 bg-blue-500 rounded-full shadow-lg">
                              <CheckCircle2 className="w-3 h-3 text-neutral-900 dark:text-white" />
                            </div>
                          )}
                        </div>

                        
                        {/* Hover/Selected decorators */}
                        <div className={`absolute inset-0 bg-gradient-to-br transition-all duration-500 pointer-events-none ${
                          isSelected ? 'from-blue-500/5 to-transparent' : 'from-white/0 group-hover:from-white/[0.02]'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50/40 dark:bg-neutral-950/40 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-center">
           <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
             {t('projectViewer.modelSelector.footer')}
           </p>
        </div>
      </div>
    </div>
  );
}

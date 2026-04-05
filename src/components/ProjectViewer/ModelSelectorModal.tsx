import React from 'react';
import { X, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Provider } from '../../types';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Provider[];
  selectedProviderId: string;
  selectedModelId: string;
  onSelect: (providerId: string, modelId: string) => void;
}

export function ModelSelectorModal({
  isOpen,
  onClose,
  providers,
  selectedProviderId,
  selectedModelId,
  onSelect
}: ModelSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-neutral-900 border border-neutral-800/50 rounded-[40px] shadow-[0_50px_100px_rgba(0,0,0,0.9)] max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-neutral-800/50 flex items-center justify-between bg-neutral-950/20 backdrop-blur-md">
          <div>
            <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">Select Model</h3>
            <p className="text-neutral-500 text-sm font-medium">Choose an AI provider and a specific model for your workflow</p>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl transition-all active:scale-90 border border-neutral-700/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {providers.length === 0 ? (
            <div className="text-center py-20 bg-neutral-950/30 rounded-[32px] border border-dashed border-neutral-800">
              <AlertCircle className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
              <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs">No providers configured</p>
              <p className="text-neutral-600 text-sm mt-2">Go to settings to add your first AI provider</p>
            </div>
          ) : (
            providers.map((provider) => (
              <div key={provider.id} className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Layers className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-wider">{provider.name}</h4>
                    <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">{provider.type}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {provider.models?.map((model) => {
                    const isSelected = provider.id === selectedProviderId && model.id === selectedModelId;
                    return (
                      <button
                        key={model.id}
                        onClick={() => onSelect(provider.id, model.id)}
                        className={`group relative p-5 rounded-[24px] text-left transition-all border-2 active:scale-[0.98] overflow-hidden ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 shadow-[0_10px_30px_rgba(37,99,235,0.3)]'
                            : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 shadow-inner'
                        }`}
                      >
                        <div className="relative z-10 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className={`text-[10px] font-black uppercase tracking-widest mb-1 transition-colors ${isSelected ? 'text-blue-100' : 'text-neutral-500'}`}>
                              {model.generatorId}
                            </div>
                            <div className={`text-base font-black truncate tracking-tight transition-colors ${isSelected ? 'text-white' : 'text-neutral-200'}`}>
                              {model.name}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="p-1.5 bg-white/20 backdrop-blur-md rounded-lg">
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        
                        {/* Hover/Selected decorators */}
                        <div className={`absolute inset-0 bg-gradient-to-br from-white/0 to-white/0 transition-all duration-500 ${
                          isSelected ? 'from-white/10 to-transparent opacity-100' : 'group-hover:from-white/5 opacity-0 group-hover:opacity-100'
                        }`} />
                      </button>
                    );
                  })}
                  {(!provider.models || provider.models.length === 0) && (
                    <div className="col-span-full py-4 text-center text-neutral-600 text-xs font-bold uppercase tracking-widest italic opacity-40">
                      No models available for this provider
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-neutral-950/40 border-t border-neutral-800/50 flex items-center justify-center">
           <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
             Click a model card to select and continue
           </p>
        </div>
      </div>
    </div>
  );
}

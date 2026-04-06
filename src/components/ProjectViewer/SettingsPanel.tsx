import React from 'react';
import { ChevronDown, Layers, Shuffle, AlertCircle, Plus, Loader2 } from 'lucide-react';
import { Project, Provider } from '../../types';

interface SettingsPanelProps {
  localProject: Project;
  setLocalProject: (project: Project) => void;
  onUpdate: (project: Project) => void;
  providers: Provider[];
  selectedProviderId: string;
  selectedModelId: string;
  isSettingsCollapsed: boolean;
  setIsSettingsCollapsed: (collapsed: boolean) => void;
  queueCount: number;
  setQueueCount: (count: number) => void;
  setHasManuallySetQueueCount: (manual: boolean) => void;
  combinations: any[];
  setIsModelSelectorOpen: (open: boolean) => void;
  isProcessing: boolean;
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  onAddDraftsToQueue: () => void;
}

export function SettingsPanel({
  localProject,
  setLocalProject,
  onUpdate,
  providers,
  selectedProviderId,
  selectedModelId,
  isSettingsCollapsed,
  setIsSettingsCollapsed,
  queueCount,
  setQueueCount,
  setHasManuallySetQueueCount,
  combinations,
  setIsModelSelectorOpen,
  isProcessing,
  workflowError,
  uploadingItemIds,
  onAddDraftsToQueue
}: SettingsPanelProps) {
  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const selectedModel = selectedProvider?.models.find(m => m.id === selectedModelId);

  return (
    <div className="p-4 border-t border-neutral-800 bg-neutral-900 shadow-2xl">
      <button 
        onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
        className="w-full p-3 bg-neutral-950/50 border border-neutral-800 rounded-xl mb-3 hover:bg-neutral-900/50 transition-all group flex flex-col gap-2.5"
      >
        {/* Row 1: Provider Name + Chevron */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Provider:</span>
            <span className="text-[10px] font-bold text-neutral-300 truncate capitalize">
              {selectedProvider?.name || 'None'}
            </span>
          </div>
          <div className={`p-1 rounded-md bg-neutral-800/50 group-hover:bg-neutral-800 transition-all ${isSettingsCollapsed ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
          </div>
        </div>

        {/* Row 2: Options + Input */}
        <div className="w-full flex items-center justify-between pt-2 border-t border-neutral-800/50">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
              {localProject.aspectRatio || '1:1'}
            </span>
            <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
              {localProject.quality || '1K'}
            </span>
            <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
              {localProject.format || 'png'}
            </span>
            {localProject.shuffle && (
              <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase tracking-widest flex items-center gap-1">
                <Shuffle className="w-2.5 h-2.5" /> Shuffle
              </span>
            )}
          </div>

        </div>
      </button>

      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isSettingsCollapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-[600px] opacity-100 mb-4'}`}>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              AI Model
            </label>
            <button
              onClick={() => setIsModelSelectorOpen(true)}
              className={`w-full border rounded-2xl p-4 text-left transition-all group/model-btn relative overflow-hidden shadow-inner ${
                !selectedProviderId 
                  ? 'bg-amber-500/5 border-amber-500/50 hover:bg-amber-500/10' 
                  : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-900'
              }`}
              disabled={isProcessing}
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-1">
                    {selectedProvider?.name || 'Select Provider'}
                  </div>
                  <div className="text-sm font-black text-white truncate tracking-tight">
                    {selectedModel?.name || 'Select Model'}
                  </div>
                </div>
                <div className="p-2 bg-neutral-800 rounded-xl group-hover/model-btn:bg-blue-600 group-hover/model-btn:text-white transition-all">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover/model-btn:from-blue-500/5 group-hover/model-btn:to-transparent transition-all" />
            </button>
          </div>

          <div className="space-y-2.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(selectedModel?.options.aspectRatios || ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2']).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => {
                    const updated = { ...localProject, aspectRatio: ratio };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg border transition-all ${
                    (localProject.aspectRatio || (selectedModel?.options.aspectRatios[0] || '1024x1024')) === ratio
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                      : 'bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className={`border-2 rounded-[2px] ${
                    ratio === '1024x1024' || ratio === '1:1' ? 'w-3 h-3' :
                    ratio === '1792x1024' || ratio === '16:9' ? 'w-5 h-3' :
                    ratio === '1024x1792' || ratio === '9:16' ? 'w-3 h-5' : 'w-3 h-3'
                  } ${(localProject.aspectRatio || (selectedModel?.options.aspectRatios[0] || '1024x1024')) === ratio ? 'border-white' : 'border-neutral-700'}`} />
                  <span className="text-[8px] font-bold">{ratio}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              Quality
            </label>
            <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1">
              {(selectedModel?.options.qualities || ['standard', 'hd']).map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    const updated = { ...localProject, quality: q };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                    (localProject.quality || (selectedModel?.options.qualities[0] || 'standard')) === q
                      ? 'bg-neutral-800 text-blue-400 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-400'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {selectedModel?.options.backgrounds && selectedModel.options.backgrounds.length > 0 && (
            <div className="space-y-2.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                Background
              </label>
              <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1">
                {selectedModel.options.backgrounds.map((b) => (
                  <button
                    key={b}
                    onClick={() => {
                      const updated = { ...localProject, background: b };
                      setLocalProject(updated);
                      onUpdate(updated);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                      (localProject.background || selectedModel.options.backgrounds![0]) === b
                        ? 'bg-neutral-800 text-blue-400 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-400'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              Format
            </label>
            <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1">
              {['png', 'jpeg', 'webp'].map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    const updated = { ...localProject, format: f as any };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                    (localProject.format || 'png') === f
                      ? 'bg-neutral-800 text-blue-400 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              Workflow Options
            </label>
            <button
              onClick={() => {
                const updated = { ...localProject, shuffle: !localProject.shuffle };
                setLocalProject(updated);
                onUpdate(updated);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                localProject.shuffle
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${localProject.shuffle ? 'bg-blue-500 text-white' : 'bg-neutral-900 text-neutral-600'}`}>
                  <Shuffle className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${localProject.shuffle ? 'text-blue-400' : 'text-neutral-400'}`}>
                    Shuffle Workflow
                  </div>
                  <div className="text-[9px] opacity-60 font-medium">Randomize combinations order</div>
                </div>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-all duration-300 ${localProject.shuffle ? 'bg-blue-500' : 'bg-neutral-800'}`}>
                <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all duration-300 ${localProject.shuffle ? 'left-5' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 mb-3">
        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600">
          Job Quantity
        </label>
        <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800 shadow-inner">
          <input
            type="number"
            min="1"
            value={queueCount}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) {
                setQueueCount(val);
                setHasManuallySetQueueCount(true);
              }
            }}
            className="w-10 bg-transparent text-xs text-blue-400 font-black focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center"
          />
          <span className="text-[10px] text-neutral-600 font-bold tracking-tighter" title="Total unique combinations">
            OF {combinations.length}
          </span>
        </div>
      </div>

      <div className={`transition-all duration-300 overflow-hidden ${workflowError || !selectedProviderId ? 'max-h-16 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`}>
        <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-[10px] font-bold shadow-lg ${
          !selectedProviderId 
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-amber-500/5' 
            : 'bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/5'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="line-clamp-2">{!selectedProviderId ? 'Please select an AI provider and model to continue.' : workflowError}</span>
        </div>
      </div>

      <button
        onClick={onAddDraftsToQueue}
        disabled={localProject.workflow.length === 0 || uploadingItemIds.size > 0 || !selectedProviderId}
        className="w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:grayscale shadow-lg shadow-blue-500/20 active:scale-[0.98]"
      >
        {uploadingItemIds.size > 0 ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading Images...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Add to Draft
          </>
        )}
      </button>
    </div>
  );
}

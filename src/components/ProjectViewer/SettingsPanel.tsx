import React from 'react';
import { ChevronDown, Layers, Shuffle, AlertCircle, Plus, Loader2 } from 'lucide-react';
import { Project, Provider } from '../../types';

const getRatioDimensions = (ratioStr: string) => {
  let w = 1, h = 1;
  if (ratioStr.includes(':')) {
    [w, h] = ratioStr.split(':').map(Number);
  } else if (ratioStr.includes('x')) {
    [w, h] = ratioStr.split('x').map(Number);
  }
  if (!w || !h || isNaN(w) || isNaN(h)) return { width: 14, height: 14 };
  
  const MAX_DIM = 22;
  if (w === h) {
    return { width: 14, height: 14 };
  } else if (w > h) {
    return { width: MAX_DIM, height: Math.max(6, MAX_DIM * (h / w)) };
  } else {
    return { height: MAX_DIM, width: Math.max(6, MAX_DIM * (w / h)) };
  }
};

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
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  onAddDraftsToQueue: () => void;
  isAddingDrafts: boolean;
  draftsProgress: { current: number; total: number; stage: 'composing' | 'saving' } | null;
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
  workflowError,
  uploadingItemIds,
  onAddDraftsToQueue,
  isAddingDrafts,
  draftsProgress
}: SettingsPanelProps) {
  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const selectedModel = selectedProvider?.models.find(m => m.id === selectedModelId);
  const hasSelectedModel = Boolean(selectedProviderId && selectedModelId && selectedModel);
  const isTextProject = localProject.type === 'text';
  const isVideoProject = localProject.type === 'video';

  return (
    <div className="shrink overflow-hidden flex flex-col p-4 border-t border-neutral-800 bg-neutral-900 shadow-2xl min-h-0">
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

        {/* Row 2: Options */}
        <div className="w-full flex items-center justify-between pt-2 border-t border-neutral-800/50">
          <div className="flex items-center gap-2">
            {!hasSelectedModel ? (
              <span className="text-[9px] font-bold text-neutral-600 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                Select a model to configure options
              </span>
            ) : isTextProject ? (
              <>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  T={localProject.temperature ?? 0.7}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.maxTokens ?? 2048} tok
                </span>
              </>
            ) : isVideoProject ? (
              <>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.aspectRatio || '16:9'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.resolution || '720p'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.duration ?? 4}s
                </span>
                {selectedModel?.options.sounds && selectedModel.options.sounds.length > 0 && (
                  <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                    Sound {localProject.sound || 'on'}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.aspectRatio || '1:1'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.quality || '1K'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-widest">
                  {localProject.format || 'png'}
                </span>
              </>
            )}
            {localProject.shuffle && (
              <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase tracking-widest flex items-center gap-1">
                <Shuffle className="w-2.5 h-2.5" /> Shuffle
              </span>
            )}
          </div>
        </div>
      </button>

      <div className={`transition-all duration-300 ease-in-out flex flex-col ${isSettingsCollapsed ? 'max-h-0 opacity-0 mb-0 overflow-hidden' : 'max-h-[2000px] opacity-100 mb-4 min-h-0 shrink'}`}>
        <div className="space-y-4 pt-2 overflow-y-auto pr-1 min-h-0 shrink custom-scrollbar">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              AI Model
            </label>
            <button
              onClick={() => setIsModelSelectorOpen(true)}
              className={`w-full border rounded-2xl p-4 text-left transition-all group/model-btn relative overflow-hidden shadow-inner ${
                !hasSelectedModel
                  ? 'bg-amber-500/5 border-amber-500/50 hover:bg-amber-500/10'
                  : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-900'
              }`}

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

          {!hasSelectedModel ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-4 py-5 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Model Options Hidden
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                Choose a model to reveal provider-specific settings.
              </p>
            </div>
          ) : isVideoProject ? (
            <>
              {/* Aspect Ratio */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(selectedModel?.options.aspectRatios || ['16:9', '9:16', '1:1']).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => {
                        const updated = { ...localProject, aspectRatio: ratio };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg border transition-all ${
                        (localProject.aspectRatio || (selectedModel?.options.aspectRatios?.[0] || '16:9')) === ratio
                          ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="h-6 flex items-center justify-center">
                        <div 
                          className={`border-2 rounded-[2px] transition-colors ${(localProject.aspectRatio || (selectedModel?.options.aspectRatios?.[0] || '16:9')) === ratio ? 'border-white' : 'border-neutral-700'}`} 
                          style={getRatioDimensions(ratio)}
                        />
                      </div>
                      <span className="text-[8px] font-bold">{ratio}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Resolution
                </label>
                <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1 flex-wrap">
                  {(selectedModel?.options.resolutions || ['720p', '1080p']).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        const updated = { ...localProject, resolution: r };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex-1 min-w-[48px] py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        (localProject.resolution || (selectedModel?.options.resolutions?.[0] || '720p')) === r
                          ? 'bg-neutral-800 text-purple-400 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-400'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Duration (s)
                </label>
                <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1 flex-wrap">
                  {(selectedModel?.options.durations || [4, 6, 8]).map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        const updated = { ...localProject, duration: d };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex-1 min-w-[40px] py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        (localProject.duration ?? (selectedModel?.options.durations?.[0] || 4)) === d
                          ? 'bg-neutral-800 text-purple-400 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-400'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              {selectedModel?.options.sounds && selectedModel.options.sounds.length > 0 && (
                <div className="space-y-2.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                    Sound
                  </label>
                  <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1">
                    {selectedModel.options.sounds.map((sound) => (
                      <button
                        key={sound}
                        onClick={() => {
                          const updated = { ...localProject, sound };
                          setLocalProject(updated);
                          onUpdate(updated);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                          (localProject.sound || 'on') === sound
                            ? 'bg-neutral-800 text-purple-400 shadow-sm'
                            : 'text-neutral-600 hover:text-neutral-400'
                        }`}
                      >
                        {sound}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : isTextProject ? (
            <>
              {/* System Prompt */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  System Prompt
                </label>
                <textarea
                  value={localProject.systemPrompt || ''}
                  onChange={(e) => {
                    const updated = { ...localProject, systemPrompt: e.target.value };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  placeholder="Optional system instructions for the AI model..."
                  rows={3}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:ring-1 focus:ring-blue-500/30 resize-none placeholder:text-neutral-700"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Temperature
                </label>
                <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1 flex-wrap">
                  {(selectedModel?.options.temperatures || [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0]).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        const updated = { ...localProject, temperature: t };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex-1 min-w-[40px] py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        (localProject.temperature ?? 0.7) === t
                          ? 'bg-neutral-800 text-blue-400 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Tokens */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Max Tokens
                </label>
                <div className="flex bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1 flex-wrap">
                  {(selectedModel?.options.maxTokenOptions || [256, 512, 1024, 2048, 4096, 8192]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        const updated = { ...localProject, maxTokens: m };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex-1 min-w-[48px] py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        (localProject.maxTokens ?? 2048) === m
                          ? 'bg-neutral-800 text-blue-400 shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-400'
                      }`}
                    >
                      {m >= 1024 ? `${m/1024}K` : m}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Image-specific settings */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(selectedModel?.options.aspectRatios || ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2']).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => {
                        const updated = { ...localProject, aspectRatio: ratio };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg border transition-all ${
                        (localProject.aspectRatio || (selectedModel?.options.aspectRatios?.[0] || '1024x1024')) === ratio
                          ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="h-6 flex items-center justify-center">
                        <div 
                          className={`border-2 rounded-[2px] transition-colors ${(localProject.aspectRatio || (selectedModel?.options.aspectRatios?.[0] || '1024x1024')) === ratio ? 'border-white' : 'border-neutral-700'}`} 
                          style={getRatioDimensions(ratio)}
                        />
                      </div>
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
                        (localProject.quality || (selectedModel?.options.qualities?.[0] || 'standard')) === q
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
            </>
          )}

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

      <div className={`transition-all duration-300 overflow-hidden ${workflowError || !hasSelectedModel ? 'max-h-16 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`}>
        <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-[10px] font-bold shadow-lg ${
          !hasSelectedModel
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-amber-500/5'
            : 'bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/5'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="line-clamp-2">{!hasSelectedModel ? 'Please select an AI provider and model to continue.' : workflowError}</span>
        </div>
      </div>

      <button
        onClick={onAddDraftsToQueue}
        disabled={localProject.workflow.length === 0 || uploadingItemIds.size > 0 || !hasSelectedModel || isAddingDrafts}
        className="w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:grayscale shadow-lg shadow-blue-500/20 active:scale-[0.98]"
      >
        {uploadingItemIds.size > 0 ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading Images...
          </>
        ) : isAddingDrafts ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {draftsProgress?.stage === 'saving'
              ? 'Saving Drafts...'
              : `Composing ${draftsProgress?.current ?? 0}/${draftsProgress?.total ?? 0}`}
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

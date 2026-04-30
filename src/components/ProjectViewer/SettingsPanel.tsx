import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Layers, Shuffle, AlertCircle, Plus, Loader2 } from 'lucide-react';
import {
  AudioProjectConfig,
  DEFAULT_AUDIO_PROJECT_CONFIG,
  GEMINI_TTS_VOICES,
  Project,
  Provider,
  parseAudioProjectConfig,
  resolveAudioGenerationKind,
  serializeAudioProjectConfig,
} from '../../types';

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
  combinationsCount: number;
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
  combinationsCount,
  setIsModelSelectorOpen,
  workflowError,
  uploadingItemIds,
  onAddDraftsToQueue,
  isAddingDrafts,
  draftsProgress
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const selectedModel = selectedProvider?.models.find(m => m.id === selectedModelId);
  const hasSelectedModel = Boolean(selectedProviderId && selectedModelId && selectedModel);
  const isTextProject = localProject.type === 'text';
  const isVideoProject = localProject.type === 'video';
  const isAudioProject = localProject.type === 'audio';
  const audioGenerationKind = resolveAudioGenerationKind(selectedModel);
  const audioConfig = isAudioProject ? parseAudioProjectConfig(localProject.systemPrompt) : DEFAULT_AUDIO_PROJECT_CONFIG;
  const isMusicAudio = audioConfig.kind === 'remix-audio-music';
  const audioFormats = (selectedModel?.options.audioFormats
    || (audioGenerationKind === 'music' ? ['mp3'] : ['wav', 'mp3', 'aac'])) as Array<'wav' | 'mp3' | 'aac'>;
  const availableVoices = selectedModel?.options.voices || [...GEMINI_TTS_VOICES];
  type AudioVoiceName = typeof GEMINI_TTS_VOICES[number];
  const primarySpeaker = !isMusicAudio
    ? audioConfig.speakers[0]
    : { name: 'Narrator', voice: 'Kore' as AudioVoiceName };
  const secondarySpeaker = !isMusicAudio && audioConfig.speakers[1]
    ? audioConfig.speakers[1]
    : { name: 'Speaker 2', voice: 'Puck' as AudioVoiceName };

  const updateAudioConfig = (nextConfig: AudioProjectConfig) => {
    const updated = {
      ...localProject,
      systemPrompt: serializeAudioProjectConfig(nextConfig),
      format: localProject.format || audioFormats[0] || (audioGenerationKind === 'music' ? 'mp3' : 'wav'),
    };
    setLocalProject(updated);
    onUpdate(updated);
  };

  return (
    <div className="shrink overflow-hidden flex flex-col p-4 border-t border-neutral-200/50 dark:border-white/5 bg-white/60 dark:bg-black/60 backdrop-blur-2xl shadow-[0_-12px_48px_rgba(0,0,0,0.2)] min-h-0">
      <button
        onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
        className="w-full p-3 bg-white/40 dark:bg-black/40 backdrop-blur-md border border-neutral-200/50 dark:border-white/5 rounded-xl mb-3 hover:bg-white/60 dark:hover:bg-neutral-900/50 transition-all group flex flex-col gap-2.5 shadow-inner"
      >
        {/* Row 1: Provider Name + Chevron */}
        <div className="w-full flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1 text-left">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600 shrink-0">{selectedProvider?.name || t('projectViewer.settings.none')}</span>
            <div className="w-1 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
            <span className="min-w-0 text-[10px] font-bold leading-4 text-neutral-700 dark:text-neutral-300 line-clamp-2 break-words">
              {selectedModel?.name || t('projectViewer.settings.none')}
            </span>
          </div>
          <div className={`shrink-0 p-1 rounded-md bg-neutral-200/50 dark:bg-neutral-800/50 group-hover:bg-neutral-300 dark:group-hover:bg-neutral-800 transition-all ${isSettingsCollapsed ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-500" />
          </div>
        </div>

        {/* Row 2: Options */}
        <div className="w-full flex items-center justify-between pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            {!hasSelectedModel ? (
              <span className="text-[9px] font-bold text-neutral-600 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                {t('projectViewer.settings.selectModelToConfigure')}
              </span>
            ) : isAudioProject ? (
              <>
                {isMusicAudio ? (
                  <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                    {audioConfig.mode === 'instrumental'
                      ? t('projectViewer.settings.instrumentalOnly')
                      : t('projectViewer.settings.withLyrics')}
                  </span>
                ) : (
                  <>
                    <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                      {audioConfig.mode === 'multi' ? t('projectViewer.settings.multiSpeaker') : t('projectViewer.settings.singleSpeaker')}
                    </span>
                    <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                      {audioConfig.mode === 'multi'
                        ? `${primarySpeaker.voice}/${secondarySpeaker.voice}`
                        : primarySpeaker.voice}
                    </span>
                  </>
                )}
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.format || audioFormats[0] || 'wav'}
                </span>
              </>
            ) : isTextProject ? (
              <>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  T={localProject.temperature ?? 0.7}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.maxTokens ?? 2048} tok
                </span>
              </>
            ) : isVideoProject ? (
              <>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.aspectRatio || '16:9'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.resolution || '720p'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.duration ?? 4}s
                </span>
                {selectedModel?.options.sounds && selectedModel.options.sounds.length > 0 && (
                  <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                    {t('projectViewer.settings.soundValue', { value: localProject.sound || 'on' })}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.aspectRatio || '1:1'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.quality || '1K'}
                </span>
                <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                  {localProject.format || 'png'}
                </span>
                {selectedModel?.options.stepsOptions && (
                  <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                    S={localProject.steps ?? (selectedModel.options.stepsOptions[0] || 20)}
                  </span>
                )}
                {selectedModel?.options.guidanceOptions && (
                  <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest">
                    G={localProject.guidance ?? (selectedModel.options.guidanceOptions[0] || 3.5)}
                  </span>
                )}
              </>
            )}
            {localProject.shuffle && (
              <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase tracking-widest flex items-center gap-1">
                <Shuffle className="w-2.5 h-2.5" /> {t('projectViewer.settings.shuffle')}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className={`transition-all duration-300 ease-in-out flex flex-col ${isSettingsCollapsed ? 'max-h-0 opacity-0 mb-0 overflow-hidden' : 'max-h-[2000px] opacity-100 mb-4 min-h-0 shrink'}`}>
        <div className="space-y-4 pt-2 overflow-y-auto pr-1 min-h-0 shrink custom-scrollbar">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              {t('projectViewer.settings.aiModel')}
            </label>
            <button
              onClick={() => setIsModelSelectorOpen(true)}
              className={`w-full border rounded-2xl p-4 text-left transition-all group/model-btn relative overflow-hidden shadow-sm hover:shadow-md ${
                !hasSelectedModel
                  ? 'bg-amber-500/5 border-amber-500/50 hover:bg-amber-500/10'
                  : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 hover:border-blue-500/50'
              }`}

            >
              <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-1">
                    {selectedProvider?.name || t('projectViewer.settings.selectProvider')}
                  </div>
                  <div className="text-sm font-black text-neutral-900 dark:text-white leading-5 line-clamp-2 break-words tracking-tight">
                    {selectedModel?.name || t('projectViewer.settings.selectModel')}
                  </div>
                </div>
                <div className="shrink-0 p-2 bg-neutral-200 dark:bg-neutral-800 rounded-xl group-hover/model-btn:bg-blue-600 group-hover/model-btn:text-white transition-all">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover/model-btn:from-blue-500/5 group-hover/model-btn:to-transparent transition-all" />
            </button>
          </div>

          {!hasSelectedModel ? (
            <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-white/20 dark:bg-neutral-950/20 px-4 py-5 text-center shadow-inner backdrop-blur-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                {t('projectViewer.settings.modelOptionsHidden')}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {t('projectViewer.settings.chooseModelHint')}
              </p>
            </div>
          ) : isVideoProject ? (
            <>
              {/* Aspect Ratio */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  {t('projectViewer.settings.aspectRatio')}
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
                          : 'bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50'
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
                  {t('projectViewer.settings.resolution')}
                </label>
                <div className="flex bg-white/40 dark:bg-neutral-950/40 border border-neutral-200/50 dark:border-white/5 p-1 rounded-xl gap-1 flex-wrap shadow-inner backdrop-blur-sm">
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
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-purple-700 dark:text-purple-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
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
                  {t('projectViewer.settings.durationSeconds')}
                </label>
                <div className="flex bg-white/40 dark:bg-neutral-950/40 border border-neutral-200/50 dark:border-white/5 p-1 rounded-xl gap-1 flex-wrap shadow-inner backdrop-blur-sm">
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
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-purple-700 dark:text-purple-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
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
                    {t('projectViewer.settings.sound')}
                  </label>
                  <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1 shadow-inner">
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
                            ? 'bg-neutral-200 dark:bg-neutral-800 text-purple-400 shadow-sm'
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
          ) : isAudioProject ? (
            <>
              {isMusicAudio ? (
                <div className="space-y-2.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                    {t('projectViewer.settings.musicMode')}
                  </label>
                  <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1 shadow-inner">
                    <button
                      onClick={() => {
                        updateAudioConfig({
                          kind: 'remix-audio-music',
                          mode: 'with-lyrics',
                        });
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        audioConfig.mode === 'with-lyrics'
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
                      }`}
                    >
                      {t('projectViewer.settings.withLyrics')}
                    </button>
                    <button
                      onClick={() => {
                        updateAudioConfig({
                          kind: 'remix-audio-music',
                          mode: 'instrumental',
                        });
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                        audioConfig.mode === 'instrumental'
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
                      }`}
                    >
                      {t('projectViewer.settings.instrumentalOnly')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                      {t('projectViewer.settings.outputMode')}
                    </label>
                    <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1 shadow-inner">
                      <button
                        onClick={() => {
                          updateAudioConfig({
                            kind: 'remix-audio-tts',
                            mode: 'single',
                            speakers: [primarySpeaker],
                          });
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                          audioConfig.mode === 'single'
                            ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
                        }`}
                      >
                        {t('projectViewer.settings.singleSpeaker')}
                      </button>
                      {selectedModel?.options.supportsMultiSpeaker !== false && (
                        <button
                          onClick={() => {
                            updateAudioConfig({
                              kind: 'remix-audio-tts',
                              mode: 'multi',
                              speakers: [
                                primarySpeaker,
                                secondarySpeaker,
                              ],
                            });
                          }}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                            audioConfig.mode === 'multi'
                              ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
                          }`}
                        >
                          {t('projectViewer.settings.multiSpeaker')}
                        </button>
                      )}
                    </div>
                  </div>

                  {audioConfig.mode === 'multi' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                          {t('projectViewer.settings.speakerOneName')}
                        </label>
                        <input
                          type="text"
                          value={primarySpeaker.name}
                          onChange={(e) => {
                            updateAudioConfig({
                              kind: 'remix-audio-tts',
                              mode: 'multi',
                              speakers: [
                                { ...primarySpeaker, name: e.target.value || 'Speaker 1' },
                                secondarySpeaker,
                              ],
                            });
                          }}
                          className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 shadow-inner"
                        />
                      </div>
                      <div className="space-y-2.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                          {t('projectViewer.settings.speakerTwoName')}
                        </label>
                        <input
                          type="text"
                          value={secondarySpeaker.name}
                          onChange={(e) => {
                            updateAudioConfig({
                              kind: 'remix-audio-tts',
                              mode: 'multi',
                              speakers: [
                                primarySpeaker,
                                { ...secondarySpeaker, name: e.target.value || 'Speaker 2' },
                              ],
                            });
                          }}
                          className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 shadow-inner"
                        />
                      </div>
                    </div>
                  )}

                  <div className={`grid grid-cols-1 gap-3 ${audioConfig.mode === 'multi' ? 'md:grid-cols-2' : ''}`}>
                    <div className="space-y-2.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                        {audioConfig.mode === 'multi' ? t('projectViewer.settings.speakerOneVoice') : t('projectViewer.settings.voice')}
                      </label>
                      <select
                        value={primarySpeaker.voice}
                        onChange={(e) => {
                          const voice = e.target.value as AudioVoiceName;
                          updateAudioConfig({
                            kind: 'remix-audio-tts',
                            mode: audioConfig.mode,
                            speakers: [
                              { ...primarySpeaker, voice },
                              audioConfig.mode === 'multi' ? secondarySpeaker : undefined,
                            ],
                          });
                        }}
                        className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 shadow-inner"
                      >
                        {availableVoices.map((voice) => (
                          <option key={voice} value={voice}>{voice}</option>
                        ))}
                      </select>
                    </div>

                    {audioConfig.mode === 'multi' && (
                      <div className="space-y-2.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                          {t('projectViewer.settings.speakerTwoVoice')}
                        </label>
                        <select
                          value={secondarySpeaker.voice}
                          onChange={(e) => {
                            const voice = e.target.value as AudioVoiceName;
                            updateAudioConfig({
                              kind: 'remix-audio-tts',
                              mode: 'multi',
                              speakers: [
                                primarySpeaker,
                                { ...secondarySpeaker, voice },
                              ],
                            });
                          }}
                          className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 shadow-inner"
                        >
                          {availableVoices.map((voice) => (
                            <option key={voice} value={voice}>{voice}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  {t('projectViewer.settings.format')}
                </label>
                <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1 shadow-inner">
                  {audioFormats.map((format) => (
                    <button
                      key={format}
                      onClick={() => {
                        const updated = { ...localProject, format };
                        setLocalProject(updated);
                        onUpdate(updated);
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border transition-colors ${
                        (localProject.format || audioFormats[0] || 'wav') === format
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 dark:text-neutral-400 border-transparent hover:bg-neutral-100/70 dark:hover:bg-neutral-900'
                      }`}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : isTextProject ? (
            <>
              {/* System Prompt */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  {t('projectViewer.settings.systemPrompt')}
                </label>
                <textarea
                  value={localProject.systemPrompt || ''}
                  onChange={(e) => {
                    const updated = { ...localProject, systemPrompt: e.target.value };
                    setLocalProject(updated);
                    onUpdate(updated);
                  }}
                  placeholder={t('projectViewer.settings.systemPromptPlaceholder')}
                  rows={3}
                  className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 shadow-inner resize-none placeholder:text-neutral-500"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-2.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                  {t('projectViewer.settings.temperature')}
                </label>
                <div className="flex bg-white/40 dark:bg-neutral-950/40 border border-neutral-200/50 dark:border-white/5 p-1 rounded-xl gap-1 flex-wrap shadow-inner backdrop-blur-sm">
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
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
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
                  {t('projectViewer.settings.maxTokens')}
                </label>
                <div className="flex bg-white/40 dark:bg-neutral-950/40 border border-neutral-200/50 dark:border-white/5 p-1 rounded-xl gap-1 flex-wrap shadow-inner backdrop-blur-sm">
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
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
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
                  {t('projectViewer.settings.aspectRatio')}
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
                          : 'bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50'
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
                  {t('projectViewer.settings.quality')}
                </label>
                <div className="flex bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1">
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
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
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
                    {t('projectViewer.settings.background')}
                  </label>
                  <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1 shadow-inner">
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
                            ? 'bg-neutral-200 dark:bg-neutral-800 text-blue-400 shadow-sm'
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
                  {t('projectViewer.settings.format')}
                </label>
                <div className="flex bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl gap-1 shadow-inner">
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
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-400'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {selectedModel?.options.stepsOptions && selectedModel.options.stepsOptions.length > 0 && (
                <div className="space-y-2.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                    {t('projectViewer.settings.steps')}
                  </label>
                  <div className="flex bg-white/40 dark:bg-neutral-950/40 border border-neutral-200/50 dark:border-white/5 p-1 rounded-xl gap-1 flex-wrap shadow-inner backdrop-blur-sm">
                    {selectedModel.options.stepsOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          const updated = { ...localProject, steps: s };
                          setLocalProject(updated);
                          onUpdate(updated);
                        }}
                        className={`flex-1 min-w-[32px] py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                          (localProject.steps ?? (selectedModel.options.stepsOptions?.[0] || 20)) === s
                            ? 'bg-neutral-200 dark:bg-neutral-800 text-blue-400 shadow-sm'
                            : 'text-neutral-600 hover:text-neutral-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedModel?.options.guidanceOptions && selectedModel.options.guidanceOptions.length > 0 && (
                <div className="space-y-2.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
                    {t('projectViewer.settings.guidance')}
                  </label>
                  <div className="flex bg-white/40 dark:bg-neutral-950/40 border border-neutral-200/50 dark:border-white/5 p-1 rounded-xl gap-1 flex-wrap shadow-inner backdrop-blur-sm">
                    {selectedModel.options.guidanceOptions.map((g) => (
                      <button
                        key={g}
                        onClick={() => {
                          const updated = { ...localProject, guidance: g };
                          setLocalProject(updated);
                          onUpdate(updated);
                        }}
                        className={`flex-1 min-w-[32px] py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all ${
                          (localProject.guidance ?? (selectedModel.options.guidanceOptions?.[0] || 3.5)) === g
                            ? 'bg-neutral-200 dark:bg-neutral-800 text-blue-400 shadow-sm'
                            : 'text-neutral-600 hover:text-neutral-400'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-2.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 block px-1">
              {t('projectViewer.settings.workflowOptions')}
            </label>
            <button
              onClick={() => {
                const updated = { ...localProject, shuffle: !localProject.shuffle };
                setLocalProject(updated);
                onUpdate(updated);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                localProject.shuffle
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-700 dark:text-blue-400 shadow-lg shadow-blue-500/10'
                  : 'bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-500 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${localProject.shuffle ? 'bg-blue-500 text-neutral-900 dark:text-white' : 'bg-white dark:bg-neutral-900 text-neutral-600'}`}>
                  <Shuffle className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${localProject.shuffle ? 'text-blue-400' : 'text-neutral-600 dark:text-neutral-400'}`}>
                    {t('projectViewer.settings.shuffleWorkflow')}
                  </div>
                  <div className="text-[9px] opacity-60 font-medium">{t('projectViewer.settings.randomizeOrder')}</div>
                </div>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-all duration-300 ${localProject.shuffle ? 'bg-blue-500' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
                <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all duration-300 ${localProject.shuffle ? 'left-5' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 mb-3">
        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600">
          {t('projectViewer.settings.jobQuantity')}
        </label>
        <div className="flex items-center gap-2 bg-white/40 dark:bg-black/40 px-3 py-1.5 rounded-xl border border-neutral-200/50 dark:border-white/5 shadow-inner backdrop-blur-sm">
          <input
            type="number"
            min="1"
            value={queueCount}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) {
                setQueueCount(val);
              }
            }}
            className="w-10 bg-transparent text-xs text-blue-600 dark:text-blue-400 font-black focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center"
          />
          <button
            type="button"
            onClick={() => setQueueCount(Math.max(1, combinationsCount))}
            disabled={combinationsCount === 0}
            className="text-[10px] text-neutral-600 hover:text-blue-600 dark:hover:text-blue-400 font-bold tracking-tighter transition-colors disabled:hover:text-neutral-600 disabled:cursor-not-allowed"
            title={t('projectViewer.settings.setToMaxCombinations')}
          >
            {t('projectViewer.settings.ofTotal', { count: combinationsCount })}
          </button>
        </div>
      </div>

      <div className={`transition-all duration-300 overflow-hidden ${workflowError || !hasSelectedModel ? 'max-h-16 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`}>
        <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-[10px] font-bold shadow-lg ${
          !hasSelectedModel
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-amber-500/5'
            : 'bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/5'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="line-clamp-2">{!hasSelectedModel ? t('projectViewer.settings.selectProviderAndModel') : workflowError}</span>
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
            {t('projectViewer.settings.uploadingImages')}
          </>
        ) : isAddingDrafts ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {draftsProgress?.stage === 'saving'
              ? t('projectViewer.settings.savingDrafts')
              : t('projectViewer.settings.composingProgress', { current: draftsProgress?.current ?? 0, total: draftsProgress?.total ?? 0 })}
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            {t('projectViewer.settings.addToDraft')}
          </>
        )}
      </button>
    </div>
  );
}

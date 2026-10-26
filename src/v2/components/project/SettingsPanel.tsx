import { useTranslation } from 'react-i18next';
import { Icon, Ripple, Select, Switch, Text, TextField } from '../../../m3';
import { DEFAULT_AUDIO_PROJECT_CONFIG, GEMINI_TTS_VOICES, parseAudioProjectConfig, resolveAudioGenerationKind, serializeAudioProjectConfig, type AudioProjectConfig, type Project, type Provider } from '../../../types';
import { useModelDescriptions } from '../../lib/modelDescriptions';
import { ChoiceChips, RatioGlyph, SettingField } from '../../ui/ChoiceChips';
import { DockChip, RunDock, type DraftsProgress } from './RunDock';

export interface SettingsPanelProps {
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
  draftsProgress: DraftsProgress | null;
}

type Voice = (typeof GEMINI_TTS_VOICES)[number];

/** Model and generation settings for image, video, text and audio projects. */
export function SettingsPanel(props: SettingsPanelProps) {
  const { localProject, providers, selectedProviderId, selectedModelId } = props;
  const { t } = useTranslation();
  const provider = providers.find((p) => p.id === selectedProviderId);
  const model = provider?.models.find((m) => m.id === selectedModelId);
  const hasModel = Boolean(selectedProviderId && selectedModelId && model);
  const description = useModelDescriptions()[selectedModelId];
  const isText = localProject.type === 'text';
  const isVideo = localProject.type === 'video';
  const isAudio = localProject.type === 'audio';
  const audioKind = resolveAudioGenerationKind(model);
  const audioConfig = isAudio ? parseAudioProjectConfig(localProject.systemPrompt) : DEFAULT_AUDIO_PROJECT_CONFIG;
  const isMusic = audioConfig.kind === 'remix-audio-music';
  const audioFormats = (model?.options.audioFormats || (audioKind === 'music' ? ['mp3'] : ['wav', 'mp3', 'aac'])) as Array<'wav' | 'mp3' | 'aac'>;
  const voices = model?.options.voices || [...GEMINI_TTS_VOICES];
  const primary = !isMusic ? audioConfig.speakers[0] : { name: 'Narrator', voice: 'Kore' as Voice };
  const secondary = !isMusic && audioConfig.speakers[1] ? audioConfig.speakers[1] : { name: 'Speaker 2', voice: 'Puck' as Voice };

  const set = (patch: Partial<Project>) => {
    const updated = { ...localProject, ...patch };
    props.setLocalProject(updated);
    props.onUpdate(updated);
  };
  const setAudio = (next: AudioProjectConfig) => set({ systemPrompt: serializeAudioProjectConfig(next), format: localProject.format || audioFormats[0] || (audioKind === 'music' ? 'mp3' : 'wav') });

  const ratios = (fallback: string[]) => (model?.options.aspectRatios || fallback).map((ratio) => ({ value: ratio, label: ratio, visual: <RatioGlyph ratio={ratio} /> }));

  const chips = !hasModel ? (
    <DockChip tone="warning">{t('projectViewer.settings.selectModelToConfigure')}</DockChip>
  ) : isAudio ? (
    <>
      {isMusic ? (
        <DockChip>{audioConfig.mode === 'instrumental' ? t('projectViewer.settings.instrumentalOnly') : t('projectViewer.settings.withLyrics')}</DockChip>
      ) : (
        <>
          <DockChip>{audioConfig.mode === 'multi' ? t('projectViewer.settings.multiSpeaker') : t('projectViewer.settings.singleSpeaker')}</DockChip>
          <DockChip>{audioConfig.mode === 'multi' ? `${primary.voice}/${secondary.voice}` : primary.voice}</DockChip>
        </>
      )}
      <DockChip>{localProject.format || audioFormats[0] || 'wav'}</DockChip>
    </>
  ) : isText ? (
    <>
      <DockChip>T={localProject.temperature ?? 0.7}</DockChip>
      <DockChip>{localProject.maxTokens ?? 2048} tok</DockChip>
    </>
  ) : isVideo ? (
    <>
      <DockChip>{localProject.aspectRatio || '16:9'}</DockChip>
      <DockChip>{localProject.resolution || '720p'}</DockChip>
      <DockChip>{localProject.duration ?? 4}s</DockChip>
      {model?.options.sounds && model.options.sounds.length > 0 && <DockChip>{t('projectViewer.settings.soundValue', { value: localProject.sound || 'on' })}</DockChip>}
    </>
  ) : (
    <>
      <DockChip>{localProject.aspectRatio || '1:1'}</DockChip>
      <DockChip>{localProject.quality || '1K'}</DockChip>
      <DockChip>{localProject.format || 'png'}</DockChip>
      {model?.options.stepsOptions && <DockChip>S={localProject.steps ?? (model.options.stepsOptions[0] || 20)}</DockChip>}
      {model?.options.guidanceOptions && <DockChip>G={localProject.guidance ?? (model.options.guidanceOptions[0] || 3.5)}</DockChip>}
    </>
  );

  const settings = (
    <div className="flex flex-col gap-4">
      <SettingField label={t('projectViewer.settings.aiModel')} hint={hasModel && description}>
        <button type="button" className="v2-model-button m3-focus-ring" data-attention={!hasModel ? '' : undefined} onClick={() => props.setIsModelSelectorOpen(true)}>
          <Ripple />
          <span className="flex min-w-0 flex-1 flex-col text-start">
            <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
              {provider?.name || t('projectViewer.settings.selectProvider')}
            </Text>
            <Text as="span" variant="title-small" emphasized className="truncate">
              {model?.name || t('projectViewer.settings.selectModel')}
            </Text>
          </span>
          <Icon name="swap_horiz" />
        </button>
      </SettingField>

      {!hasModel ? (
        <div className="v2-notice" data-tone="warning">
          <Icon name="info" />
          <div className="flex flex-col gap-1">
            <Text variant="label-large">{t('projectViewer.settings.modelOptionsHidden')}</Text>
            <Text variant="body-small">{t('projectViewer.settings.chooseModelHint')}</Text>
          </div>
        </div>
      ) : isVideo ? (
        <>
          <SettingField label={t('projectViewer.settings.aspectRatio')}>
            <ChoiceChips stacked value={localProject.aspectRatio || model?.options.aspectRatios?.[0] || '16:9'} onChange={(aspectRatio) => set({ aspectRatio })} options={ratios(['16:9', '9:16', '1:1'])} />
          </SettingField>
          <SettingField label={t('projectViewer.settings.resolution')}>
            <ChoiceChips value={localProject.resolution || model?.options.resolutions?.[0] || '720p'} onChange={(resolution) => set({ resolution })} options={(model?.options.resolutions || ['720p', '1080p']).map((value) => ({ value }))} />
          </SettingField>
          <SettingField label={t('projectViewer.settings.durationSeconds')}>
            <ChoiceChips value={localProject.duration ?? (model?.options.durations?.[0] || 4)} onChange={(duration) => set({ duration })} options={(model?.options.durations || [4, 6, 8]).map((value) => ({ value, label: `${value}s` }))} />
          </SettingField>
          {model?.options.sounds && model.options.sounds.length > 0 && (
            <SettingField label={t('projectViewer.settings.sound')}>
              <ChoiceChips value={localProject.sound || 'on'} onChange={(sound) => set({ sound })} options={model.options.sounds.map((value) => ({ value }))} />
            </SettingField>
          )}
        </>
      ) : isAudio ? (
        <>
          {isMusic ? (
            <SettingField label={t('projectViewer.settings.musicMode')}>
              <ChoiceChips
                value={audioConfig.mode}
                onChange={(mode) => setAudio({ kind: 'remix-audio-music', mode: mode as 'with-lyrics' | 'instrumental' })}
                options={[
                  { value: 'with-lyrics', label: t('projectViewer.settings.withLyrics') },
                  { value: 'instrumental', label: t('projectViewer.settings.instrumentalOnly') },
                ]}
              />
            </SettingField>
          ) : (
            <>
              <SettingField label={t('projectViewer.settings.outputMode')}>
                <ChoiceChips
                  value={audioConfig.mode}
                  onChange={(mode) => setAudio(mode === 'multi' ? { kind: 'remix-audio-tts', mode: 'multi', speakers: [primary, secondary] } : { kind: 'remix-audio-tts', mode: 'single', speakers: [primary] })}
                  options={[
                    { value: 'single', label: t('projectViewer.settings.singleSpeaker') },
                    ...(model?.options.supportsMultiSpeaker !== false ? [{ value: 'multi', label: t('projectViewer.settings.multiSpeaker') }] : []),
                  ]}
                />
              </SettingField>
              {audioConfig.mode === 'multi' && (
                <div className="grid grid-cols-2 gap-2">
                  <TextField variant="outlined" label={t('projectViewer.settings.speakerOneName')} value={primary.name} onValueChange={(v) => setAudio({ kind: 'remix-audio-tts', mode: 'multi', speakers: [{ ...primary, name: v || 'Speaker 1' }, secondary] })} />
                  <TextField variant="outlined" label={t('projectViewer.settings.speakerTwoName')} value={secondary.name} onValueChange={(v) => setAudio({ kind: 'remix-audio-tts', mode: 'multi', speakers: [primary, { ...secondary, name: v || 'Speaker 2' }] })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Select
                  variant="outlined"
                  label={audioConfig.mode === 'multi' ? t('projectViewer.settings.speakerOneVoice') : t('projectViewer.settings.voice')}
                  value={primary.voice}
                  onChange={(v) => setAudio({ kind: 'remix-audio-tts', mode: audioConfig.mode, speakers: [{ ...primary, voice: v as Voice }, audioConfig.mode === 'multi' ? secondary : undefined] } as AudioProjectConfig)}
                  options={voices.map((v) => ({ value: v, label: v }))}
                />
                {audioConfig.mode === 'multi' && (
                  <Select
                    variant="outlined"
                    label={t('projectViewer.settings.speakerTwoVoice')}
                    value={secondary.voice}
                    onChange={(v) => setAudio({ kind: 'remix-audio-tts', mode: 'multi', speakers: [primary, { ...secondary, voice: v as Voice }] })}
                    options={voices.map((v) => ({ value: v, label: v }))}
                  />
                )}
              </div>
            </>
          )}
          <SettingField label={t('projectViewer.settings.format')}>
            <ChoiceChips value={localProject.format || audioFormats[0] || 'wav'} onChange={(format) => set({ format })} options={audioFormats.map((value) => ({ value }))} />
          </SettingField>
        </>
      ) : isText ? (
        <>
          <TextField
            variant="outlined"
            multiline
            rows={3}
            maxRows={10}
            label={t('projectViewer.settings.systemPrompt')}
            placeholder={t('projectViewer.settings.systemPromptPlaceholder')}
            value={localProject.systemPrompt || ''}
            onValueChange={(systemPrompt) => set({ systemPrompt })}
            fullWidth
          />
          <SettingField label={t('projectViewer.settings.temperature')}>
            <ChoiceChips value={localProject.temperature ?? 0.7} onChange={(temperature) => set({ temperature })} options={(model?.options.temperatures || [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0]).map((value) => ({ value }))} />
          </SettingField>
          <SettingField label={t('projectViewer.settings.maxTokens')}>
            <ChoiceChips value={localProject.maxTokens ?? 2048} onChange={(maxTokens) => set({ maxTokens })} options={(model?.options.maxTokenOptions || [256, 512, 1024, 2048, 4096, 8192]).map((value) => ({ value, label: value >= 1024 ? `${value / 1024}K` : String(value) }))} />
          </SettingField>
        </>
      ) : (
        <>
          <SettingField label={t('projectViewer.settings.aspectRatio')}>
            <ChoiceChips stacked value={localProject.aspectRatio || model?.options.aspectRatios?.[0] || '1024x1024'} onChange={(aspectRatio) => set({ aspectRatio })} options={ratios(['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2'])} />
          </SettingField>
          <SettingField label={t('projectViewer.settings.quality')}>
            <ChoiceChips value={localProject.quality || model?.options.qualities?.[0] || 'standard'} onChange={(quality) => set({ quality })} options={(model?.options.qualities || ['standard', 'hd']).map((value) => ({ value }))} />
          </SettingField>
          {model?.options.backgrounds && model.options.backgrounds.length > 0 && (
            <SettingField label={t('projectViewer.settings.background')}>
              <ChoiceChips value={localProject.background || model.options.backgrounds[0]} onChange={(background) => set({ background })} options={model.options.backgrounds.map((value) => ({ value }))} />
            </SettingField>
          )}
          <SettingField label={t('projectViewer.settings.format')}>
            <ChoiceChips value={localProject.format || 'png'} onChange={(format) => set({ format: format as Project['format'] })} options={['png', 'jpeg', 'webp'].map((value) => ({ value }))} />
          </SettingField>
          {model?.options.stepsOptions && model.options.stepsOptions.length > 0 && (
            <SettingField label={t('projectViewer.settings.steps')}>
              <ChoiceChips value={localProject.steps ?? (model.options.stepsOptions[0] || 20)} onChange={(steps) => set({ steps })} options={model.options.stepsOptions.map((value) => ({ value }))} />
            </SettingField>
          )}
          {model?.options.guidanceOptions && model.options.guidanceOptions.length > 0 && (
            <SettingField label={t('projectViewer.settings.guidance')}>
              <ChoiceChips value={localProject.guidance ?? (model.options.guidanceOptions[0] || 3.5)} onChange={(guidance) => set({ guidance })} options={model.options.guidanceOptions.map((value) => ({ value }))} />
            </SettingField>
          )}
        </>
      )}

      <SettingField label={t('projectViewer.settings.workflowOptions')}>
        <Switch label={t('projectViewer.settings.shuffleWorkflow')} supportingText={t('projectViewer.settings.randomizeOrder')} checked={!!localProject.shuffle} onChange={() => set({ shuffle: !localProject.shuffle })} />
      </SettingField>
    </div>
  );

  return (
    <RunDock
      title={
        <>
          {provider?.name || t('projectViewer.settings.none')} <span className="text-primary">· {model?.name || t('projectViewer.settings.none')}</span>
        </>
      }
      chips={
        <>
          {chips}
          {localProject.shuffle && (
            <DockChip tone="tertiary">
              <Icon name="shuffle" size={12} /> {t('projectViewer.settings.shuffle')}
            </DockChip>
          )}
        </>
      }
      attention={!hasModel}
      collapsed={props.isSettingsCollapsed}
      onToggle={() => props.setIsSettingsCollapsed(!props.isSettingsCollapsed)}
      settings={settings}
      queueCount={props.queueCount}
      setQueueCount={props.setQueueCount}
      combinationsCount={props.combinationsCount}
      notice={!hasModel ? { tone: 'warning', text: t('projectViewer.settings.selectProviderAndModel') } : props.workflowError ? { tone: 'error', text: props.workflowError } : null}
      onAdd={props.onAddDraftsToQueue}
      addDisabled={localProject.workflow.length === 0 || props.uploadingItemIds.size > 0 || !hasModel || props.isAddingDrafts}
      uploading={props.uploadingItemIds.size > 0}
      isAddingDrafts={props.isAddingDrafts}
      draftsProgress={props.draftsProgress}
    />
  );
}

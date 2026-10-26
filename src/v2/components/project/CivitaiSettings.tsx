import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CIVITAI_DEFAULTS,
  CIVITAI_LIMITS,
  CIVITAI_MAX_ROLLED_SEED,
  CIVITAI_SCHEDULERS,
  CIVITAI_VIDEO_ENGINES,
  civitaiModelItems,
  civitaiModelItemValue,
  civitaiResourceLabel,
  civitaiSchedulerLabel,
  civitaiSizePresets,
  civitaiVideoEngine,
  isCivitaiVideo,
  resolveCivitaiVideoSettings,
  snapCivitaiSize,
} from '../../../lib/civitai';
import { Button, Icon, Select, Slider, Switch, Text } from '../../../m3';
import type { CivitaiGenerationConfig, CivitaiMediaType, CivitaiVideoSettings as VideoSettings, Library, Project, Provider, WorkflowItem } from '../../../types';
import { ChoiceChips, SettingField } from '../../ui/ChoiceChips';
import { NumberField } from '../../ui/NumberField';
import { DockChip, RunDock, type DraftsProgress } from './RunDock';

function NumberRow({ label, value, onChange, min, max, step, integer }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; integer?: boolean }) {
  return <NumberField label={label} value={value} onValueChange={onChange} min={min} max={max} step={step} integer={integer} fullWidth />;
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Text variant="body-small" className="flex items-start gap-1 text-on-surface-variant">
      <Icon name="info" size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </Text>
  );
}

/** Random per job, or one fixed seed every job uses. */
function SeedRow({ seed, onChange, roll, max }: { seed: number | undefined; onChange: (seed: number | undefined) => void; roll: () => number; max: number }) {
  const { t } = useTranslation();
  return (
    <SettingField label={t('projectViewer.civitai.seed')}>
      <div className="flex items-center gap-2">
        <Button variant={seed === undefined ? 'tonal' : 'outlined'} size="xs" icon={seed === undefined ? 'check' : undefined} title={t('projectViewer.civitai.randomSeedHint')} onClick={() => onChange(undefined)}>
          {t('projectViewer.civitai.randomSeed')}
        </Button>
        {seed !== undefined ? (
          <NumberField aria-label={t('projectViewer.civitai.seed')} value={seed} onValueChange={onChange} min={CIVITAI_LIMITS.seed.min} max={max} integer className="flex-1" fullWidth />
        ) : (
          <Button variant="outlined" size="xs" icon="casino" title={t('projectViewer.civitai.fixSeedHint')} onClick={() => onChange(roll())}>
            {t('projectViewer.civitai.fixedSeed')}
          </Button>
        )}
      </div>
    </SettingField>
  );
}

/** Settings saved before checkpoints, LoRAs and the negative prompt moved into the workflow, as workflow items. */
function migrateLegacyConfig(project: Project): Project | null {
  const config = project.civitaiConfig;
  if (!config || (!config.model && !config.resources?.length && !config.negativePrompt)) return null;
  const workflow = project.workflow || [];
  const items: WorkflowItem[] = [];
  if (config.model && civitaiModelItems(workflow, 'checkpoint').length === 0) {
    items.push({ id: crypto.randomUUID(), type: 'model', value: civitaiModelItemValue([config.model]), civitai: { slot: 'checkpoint', options: [config.model] } });
  }
  for (const resource of config.resources || []) items.push({ id: crypto.randomUUID(), type: 'model', value: resource.air, civitai: { slot: 'lora', options: [resource] } });
  if (config.negativePrompt?.trim()) items.push({ id: crypto.randomUUID(), type: 'text', value: config.negativePrompt, civitai: { slot: 'negative' } });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { model, resources, negativePrompt, ...rest } = config;
  return { ...project, workflow: [...workflow, ...items].map((item, order) => ({ ...item, order })), civitaiConfig: rest };
}

/** Engine and the choices it takes, with notes on what the workflow feeds it. */
function CivitaiVideoSettings({ video, onChange, imageCount, loraCount, hasNegative }: { video: VideoSettings | undefined; onChange: (video: VideoSettings) => void; imageCount: number; loraCount: number; hasNegative: boolean }) {
  const { t } = useTranslation();
  const engine = civitaiVideoEngine(video?.engine);
  const settings = resolveCivitaiVideoSettings(video);
  // Only what the user picked is stored, so switching engines picks up the new engine's defaults.
  const update = (patch: Partial<VideoSettings>) => onChange({ ...video, engine: engine.value, ...patch });
  const fromImage = imageCount > 0 && engine.imageToVideo;
  return (
    <>
      <SettingField label={t('projectViewer.civitai.video.engine')}>
        <Select
          variant="outlined"
          aria-label={t('projectViewer.civitai.video.engine')}
          value={engine.value}
          onChange={(v) => onChange({ ...video, engine: v as VideoSettings['engine'] })}
          options={CIVITAI_VIDEO_ENGINES.map((o) => ({ value: o.value, label: o.label, supportingText: t(`projectViewer.civitai.video.engineHints.${o.value.replace(/[.-]/g, '_')}`) }))}
          fullWidth
        />
        {fromImage && <Note>{imageCount > 1 && engine.endFrame ? t('projectViewer.civitai.video.firstLastFrameHint') : t('projectViewer.civitai.video.imageToVideoHint')}</Note>}
        {imageCount > 0 && !engine.imageToVideo && <Note>{t('projectViewer.civitai.video.textOnlyHint', { engine: engine.label })}</Note>}
        {imageCount > 1 && engine.imageToVideo && !engine.endFrame && <Note>{t('projectViewer.civitai.video.onlyFirstImage')}</Note>}
        {loraCount > 0 && engine.loras === 0 && <Note>{t('projectViewer.civitai.video.noLorasHint', { engine: engine.label })}</Note>}
        {loraCount > engine.loras && engine.loras > 0 && <Note>{t('projectViewer.civitai.video.loraLimitHint', { engine: engine.label, count: engine.loras })}</Note>}
        {hasNegative && !engine.negativePrompt && <Note>{t('projectViewer.civitai.video.noNegativeHint', { engine: engine.label })}</Note>}
      </SettingField>
      <SettingField label={t('projectViewer.civitai.video.resolution')}>
        <ChoiceChips value={settings.resolution || ''} onChange={(resolution) => update({ resolution })} options={engine.resolutions.map((value) => ({ value }))} />
      </SettingField>
      <SettingField label={t('projectViewer.civitai.video.aspectRatio')} hint={fromImage ? t('projectViewer.civitai.video.aspectFromImageHint') : settings.width && settings.height ? `${settings.width} × ${settings.height}` : undefined}>
        <ChoiceChips value={settings.aspectRatio || ''} onChange={(aspectRatio) => update({ aspectRatio })} options={engine.aspectRatios.map((value) => ({ value }))} />
      </SettingField>
      {engine.durations && (
        <SettingField label={t('projectViewer.civitai.video.duration')}>
          <ChoiceChips value={settings.duration ?? -1} onChange={(duration) => update({ duration })} options={engine.durations.map((value) => ({ value, label: t('projectViewer.civitai.video.seconds', { count: value }) }))} />
        </SettingField>
      )}
      {engine.durationRange && <NumberRow label={t('projectViewer.civitai.video.durationSeconds')} value={settings.duration ?? engine.defaults.duration ?? engine.durationRange.min} onChange={(duration) => update({ duration })} {...engine.durationRange} integer />}
      {!engine.durations && !engine.durationRange && <Note>{t('projectViewer.civitai.video.fixedLengthHint', { engine: engine.label })}</Note>}
      {(engine.cfg || engine.steps || engine.shift || engine.interpolator) && (
        <SettingField label={t('projectViewer.civitai.sampling')}>
          <div className="grid grid-cols-2 gap-2">
            {engine.cfg && <NumberRow label={t('projectViewer.civitai.cfgScale')} value={settings.cfgScale ?? engine.cfg.default} onChange={(cfgScale) => update({ cfgScale })} min={engine.cfg.min} max={engine.cfg.max} step={engine.cfg.step} />}
            {engine.steps && <NumberRow label={t('projectViewer.civitai.steps')} value={settings.steps ?? engine.steps.default} onChange={(steps) => update({ steps })} min={engine.steps.min} max={engine.steps.max} integer />}
            {engine.shift && <NumberRow label={t('projectViewer.civitai.video.shift')} value={settings.shift ?? engine.shift.default} onChange={(shift) => update({ shift })} min={engine.shift.min} max={engine.shift.max} step={0.5} />}
          </div>
          {engine.interpolator && (
            <ChoiceChips
              aria-label={t('projectViewer.civitai.video.interpolator')}
              value={settings.interpolator || 'none'}
              onChange={(interpolator) => update({ interpolator })}
              options={(['none', 'film', 'rife'] as const).map((value) => ({ value, label: value === 'none' ? t('projectViewer.civitai.video.interpolatorNone') : value.toUpperCase() }))}
            />
          )}
        </SettingField>
      )}
      {(engine.promptExpansion || engine.usePrime) && (
        <SettingField label={t('projectViewer.civitai.video.options')}>
          {engine.promptExpansion && <Switch label={t('projectViewer.civitai.video.promptExpansion')} supportingText={t('projectViewer.civitai.video.promptExpansionHint')} checked={!!settings.promptExpansion} onChange={() => update({ promptExpansion: !settings.promptExpansion })} />}
          {engine.usePrime && <Switch label={t('projectViewer.civitai.video.usePrime')} supportingText={t('projectViewer.civitai.video.usePrimeHint')} checked={!!settings.usePrime} onChange={() => update({ usePrime: !settings.usePrime })} />}
        </SettingField>
      )}
    </>
  );
}

export interface CivitaiSettingsPanelProps {
  localProject: Project;
  /** Nothing is saved on the panel's own initiative before the workflow loads, or it would be replaced with an empty one. */
  isWorkflowLoaded: boolean;
  /** Jobs or results fix whether the project makes images or videos. */
  hasHistory: boolean;
  providers: Provider[];
  libraries: Library[];
  onSaveProject: (project: Project) => void;
  isSettingsCollapsed: boolean;
  setIsSettingsCollapsed: (collapsed: boolean) => void;
  queueCount: number;
  setQueueCount: (count: number) => void;
  combinationsCount: number;
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  onAddDraftsToQueue: () => void;
  isAddingDrafts: boolean;
  draftsProgress: DraftsProgress | null;
}

/** The settings of a Civitai project: account, images or videos, and the parameters every job shares. */
export function CivitaiSettingsPanel({ localProject, isWorkflowLoaded, hasHistory, providers, libraries, onSaveProject, isSettingsCollapsed, setIsSettingsCollapsed, queueCount, setQueueCount, combinationsCount, workflowError, uploadingItemIds, onAddDraftsToQueue, isAddingDrafts, draftsProgress }: CivitaiSettingsPanelProps) {
  const { t } = useTranslation();
  const accounts = providers.filter((provider) => provider.type === 'Civitai');
  const account = accounts.find((provider) => provider.id === localProject.providerId);
  const config: CivitaiGenerationConfig = localProject.civitaiConfig || {};
  const workflow = localProject.workflow || [];
  const checkpoints = civitaiModelItems(workflow, 'checkpoint')
    .filter((item) => !item.disabled)
    .flatMap((item) => item.civitai?.options || []);
  const loraCount = civitaiModelItems(workflow, 'lora').filter((item) => !item.disabled && item.civitai?.options?.length).length;
  const imageItems = workflow.filter((item) => !item.disabled && item.type === 'image');
  const imageLibraryCount = workflow.filter((item) => !item.disabled && item.type === 'library' && libraries.find((library) => library.id === item.value)?.type === 'image').length;
  const hasSourceImage = imageItems.length > 0 || imageLibraryCount > 0;
  const isVideo = isCivitaiVideo(config);
  const engine = civitaiVideoEngine(config.video?.engine);
  const videoSettings = resolveCivitaiVideoSettings(config.video);
  const hasNegative = workflow.some((item) => !item.disabled && item.civitai?.slot === 'negative');
  // Defaults follow the first checkpoint; each job's own checkpoint decides its default size.
  const presets = civitaiSizePresets(checkpoints[0]);
  const portrait = presets.find((preset) => preset.key === 'portrait')!;
  const width = config.width ?? portrait.width;
  const height = config.height ?? portrait.height;
  const steps = config.steps ?? CIVITAI_DEFAULTS.steps;
  const cfgScale = config.cfgScale ?? CIVITAI_DEFAULTS.cfgScale;
  const scheduler = config.scheduler || CIVITAI_DEFAULTS.scheduler;
  const clipSkip = config.clipSkip ?? CIVITAI_DEFAULTS.clipSkip;
  const denoise = config.denoise ?? CIVITAI_DEFAULTS.denoise;
  const format = localProject.format && ['png', 'jpeg', 'webp'].includes(localProject.format) ? localProject.format : 'png';

  // Once the workflow is in: open the settings when an account or checkpoint is missing, and migrate old settings.
  const settledRef = useRef(false);
  useEffect(() => {
    if (!isWorkflowLoaded || settledRef.current) return;
    settledRef.current = true;
    const migrated = migrateLegacyConfig(localProject);
    const hasCheckpoint = checkpoints.length > 0 || !!localProject.civitaiConfig?.model;
    if (!localProject.providerId || (!hasCheckpoint && !isCivitaiVideo(localProject.civitaiConfig))) setIsSettingsCollapsed(false);
    if (migrated) onSaveProject(migrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkflowLoaded]);

  // A single Civitai account is the obvious one; pick it.
  useEffect(() => {
    if (isWorkflowLoaded && !localProject.providerId && accounts.length === 1) onSaveProject({ ...localProject, providerId: accounts[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkflowLoaded, accounts.length, localProject.providerId]);

  const updateConfig = (patch: Partial<CivitaiGenerationConfig>) => onSaveProject({ ...localProject, civitaiConfig: { ...config, ...patch } });
  // A video engine brings its own model; an image needs a checkpoint; a text-only engine can't start from images.
  const textOnlyWithImages = isVideo && hasSourceImage && !engine.imageToVideo;
  const isReady = Boolean(account && (isVideo ? !textOnlyWithImages : checkpoints.length > 0));
  const notice = workflowError
    ? { tone: 'error' as const, text: workflowError }
    : !account
      ? { tone: 'warning' as const, text: t('projectViewer.civitai.chooseAccountFirst') }
      : textOnlyWithImages
        ? { tone: 'warning' as const, text: t('projectViewer.civitai.video.textOnlyHint', { engine: engine.label }) }
        : !isVideo && checkpoints.length === 0
          ? { tone: 'warning' as const, text: t('projectViewer.civitai.chooseCheckpointFirst') }
          : null;
  const checkpointSummary = isVideo ? engine.label : checkpoints.length === 0 ? t('projectViewer.civitai.noCheckpoint') : checkpoints.length === 1 ? civitaiResourceLabel(checkpoints[0]) : t('projectViewer.civitai.checkpointsCount', { count: checkpoints.length });
  const setMediaType = (mediaType: CivitaiMediaType) => {
    if (hasHistory || mediaType === (config.mediaType || 'image')) return;
    onSaveProject({ ...localProject, civitaiConfig: { ...config, mediaType }, format: mediaType === 'video' ? 'mp4' : 'png' });
  };
  const randomSeed = () => Math.floor(Math.random() * CIVITAI_MAX_ROLLED_SEED);

  const settings = (
    <div className="flex flex-col gap-4">
      <SettingField label={t('projectViewer.civitai.account')} hint={t(isVideo ? 'projectViewer.civitai.video.workflowHint' : 'projectViewer.civitai.workflowHint')}>
        {accounts.length === 0 ? (
          <div className="v2-notice" data-tone="warning">
            <Icon name="key" />
            <div className="flex flex-col gap-2">
              <Text variant="body-small">{t('projectViewer.civitai.noAccountHint')}</Text>
              <Link to="/provider/new?type=Civitai" className="v2-link self-start">
                {t('projectViewer.civitai.addAccount')}
              </Link>
            </div>
          </div>
        ) : (
          <Select
            variant="outlined"
            aria-label={t('projectViewer.civitai.account')}
            placeholder={t('projectViewer.civitai.chooseAccount')}
            value={account?.id || null}
            onChange={(id) => onSaveProject({ ...localProject, providerId: id || undefined })}
            options={accounts.map((p) => ({ value: p.id, label: p.name }))}
            fullWidth
          />
        )}
      </SettingField>
      <SettingField label={t('projectViewer.civitai.makes')} hint={hasHistory ? t('projectViewer.civitai.mediaTypeLocked') : undefined}>
        <ChoiceChips
          value={config.mediaType || 'image'}
          onChange={setMediaType}
          options={(['image', 'video'] as const).map((value) => ({ value, disabled: hasHistory && (config.mediaType || 'image') !== value, label: t(value === 'video' ? 'projectViewer.civitai.videos' : 'projectViewer.civitai.images'), visual: <Icon name={value === 'video' ? 'movie' : 'image'} size={16} /> }))}
        />
      </SettingField>
      {isVideo ? (
        <CivitaiVideoSettings video={config.video} onChange={(video) => updateConfig({ video })} imageCount={imageItems.length + imageLibraryCount} loraCount={loraCount} hasNegative={hasNegative} />
      ) : (
        <>
          <SettingField label={t('projectViewer.civitai.size')} hint={hasSourceImage ? t('projectViewer.civitai.sizeWithImageHint') : undefined}>
            <ChoiceChips
              value={presets.find((p) => p.width === width && p.height === height)?.key ?? ''}
              onChange={(key) => {
                const preset = presets.find((p) => p.key === key);
                if (preset) updateConfig({ width: preset.width, height: preset.height });
              }}
              options={presets.map((preset) => ({ value: preset.key, label: t(`projectViewer.civitai.sizePresets.${preset.key}`) }))}
            />
            <div className="flex items-center gap-2">
              <NumberField aria-label={t('projectViewer.civitai.width')} value={width} onValueChange={(v) => updateConfig({ width: snapCivitaiSize(v) })} min={CIVITAI_LIMITS.size.min} max={CIVITAI_LIMITS.size.max} step={8} integer className="flex-1" fullWidth />
              <span className="text-on-surface-variant">×</span>
              <NumberField aria-label={t('projectViewer.civitai.height')} value={height} onValueChange={(v) => updateConfig({ height: snapCivitaiSize(v) })} min={CIVITAI_LIMITS.size.min} max={CIVITAI_LIMITS.size.max} step={8} integer className="flex-1" fullWidth />
            </div>
          </SettingField>
          <SettingField label={t('projectViewer.civitai.sampling')}>
            <Select variant="outlined" label={t('projectViewer.civitai.sampler')} value={scheduler} onChange={(v) => updateConfig({ scheduler: v as CivitaiGenerationConfig['scheduler'] })} options={CIVITAI_SCHEDULERS.map((o) => ({ value: o.value, label: o.label }))} fullWidth />
            <div className="grid grid-cols-3 gap-2">
              <NumberRow label={t('projectViewer.civitai.steps')} value={steps} onChange={(v) => updateConfig({ steps: v })} {...CIVITAI_LIMITS.steps} integer />
              <NumberRow label={t('projectViewer.civitai.cfgScale')} value={cfgScale} onChange={(v) => updateConfig({ cfgScale: v })} {...CIVITAI_LIMITS.cfgScale} step={0.5} />
              <NumberRow label={t('projectViewer.civitai.clipSkip')} value={clipSkip} onChange={(v) => updateConfig({ clipSkip: v })} {...CIVITAI_LIMITS.clipSkip} integer />
            </div>
          </SettingField>
          <SeedRow seed={config.seed} onChange={(seed) => updateConfig({ seed })} roll={randomSeed} max={CIVITAI_LIMITS.seed.max} />
          <SettingField label={t('projectViewer.civitai.imageToImage')} hint={hasSourceImage ? (imageItems.length > 1 ? t('projectViewer.civitai.onlyFirstImage') : t('projectViewer.civitai.denoiseHint')) : t('projectViewer.civitai.noSourceImageHint')}>
            <div className="flex items-center gap-3">
              <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                {t('projectViewer.civitai.denoise')}
              </Text>
              <Slider className="flex-1" min={CIVITAI_LIMITS.denoise.min} max={CIVITAI_LIMITS.denoise.max} step={0.05} value={denoise} onChange={(v) => updateConfig({ denoise: Math.round(v * 100) / 100 })} aria-label={t('projectViewer.civitai.denoise')} />
              <NumberField aria-label={t('projectViewer.civitai.denoise')} value={denoise} onValueChange={(v) => updateConfig({ denoise: Math.round(v * 100) / 100 })} min={CIVITAI_LIMITS.denoise.min} max={CIVITAI_LIMITS.denoise.max} step={0.05} className="v2-scalar-field" />
            </div>
          </SettingField>
        </>
      )}
      <SettingField label={t('projectViewer.civitai.output')}>
        {!isVideo && <ChoiceChips aria-label={t('projectViewer.civitai.format')} value={format} onChange={(f) => onSaveProject({ ...localProject, format: f })} options={(['png', 'jpeg', 'webp'] as const).map((value) => ({ value }))} />}
        <Switch label={t('projectViewer.civitai.allowMature')} supportingText={t('projectViewer.civitai.allowMatureHint')} checked={!!config.allowMatureContent} onChange={() => updateConfig({ allowMatureContent: !config.allowMatureContent || undefined })} />
      </SettingField>
      {isVideo && <SeedRow seed={config.seed} onChange={(seed) => updateConfig({ seed })} roll={randomSeed} max={CIVITAI_MAX_ROLLED_SEED} />}
    </div>
  );

  return (
    <RunDock
      title={
        <>
          {account?.name || t('projectViewer.settings.none')} <span className="text-primary">· {checkpointSummary}</span>
        </>
      }
      chips={
        <>
          {isVideo ? (
            <>
              <DockChip>
                <Icon name="movie" size={12} /> {videoSettings.resolution} {hasSourceImage && engine.imageToVideo ? '' : videoSettings.aspectRatio}
              </DockChip>
              {videoSettings.duration !== undefined && <DockChip>{videoSettings.duration}s</DockChip>}
              {videoSettings.cfgScale !== undefined && <DockChip>CFG={videoSettings.cfgScale}</DockChip>}
            </>
          ) : (
            <>
              <DockChip>
                {width}×{height}
              </DockChip>
              <DockChip>S={steps}</DockChip>
              <DockChip>CFG={cfgScale}</DockChip>
              <DockChip>{civitaiSchedulerLabel(scheduler)}</DockChip>
              {hasSourceImage && <DockChip>D={denoise}</DockChip>}
            </>
          )}
          {loraCount > 0 && (
            <DockChip tone="tertiary">
              <Icon name="layers" size={12} /> +{loraCount}
            </DockChip>
          )}
          {localProject.shuffle && (
            <DockChip tone="tertiary">
              <Icon name="shuffle" size={12} /> {t('projectViewer.settings.shuffle')}
            </DockChip>
          )}
        </>
      }
      attention={!isReady}
      collapsed={isSettingsCollapsed}
      onToggle={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
      settings={settings}
      inline={<Switch label={t('projectViewer.settings.shuffle')} supportingText={t('projectViewer.settings.randomizeOrder')} checked={!!localProject.shuffle} onChange={() => onSaveProject({ ...localProject, shuffle: !localProject.shuffle })} />}
      queueCount={queueCount}
      setQueueCount={setQueueCount}
      combinationsCount={combinationsCount}
      notice={notice}
      onAdd={onAddDraftsToQueue}
      addDisabled={!isReady || workflow.length === 0 || uploadingItemIds.size > 0 || isAddingDrafts}
      uploading={uploadingItemIds.size > 0}
      isAddingDrafts={isAddingDrafts}
      draftsProgress={draftsProgress}
    />
  );
}

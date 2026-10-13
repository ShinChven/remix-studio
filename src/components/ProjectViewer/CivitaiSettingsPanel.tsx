import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, Dices, Film, Image as ImageIcon, Layers, Loader2, Lock, Plus, Shuffle } from 'lucide-react';
import type { CivitaiGenerationConfig, CivitaiMediaType, Library, Project, Provider, WorkflowItem } from '../../types';
import {
  CIVITAI_DEFAULTS,
  CIVITAI_LIMITS,
  CIVITAI_MAX_ROLLED_SEED,
  CIVITAI_SCHEDULERS,
  civitaiModelItems,
  civitaiModelItemValue,
  civitaiResourceLabel,
  civitaiSchedulerLabel,
  civitaiSizePresets,
  civitaiVideoEngine,
  isCivitaiVideo,
  resolveCivitaiVideoSettings,
  snapCivitaiSize,
} from '../../lib/civitai';
import { NumberInput } from '../NumberInput';
import { civitaiChipBaseClass, civitaiChipClass, civitaiFieldClass, civitaiNumberClass } from './CivitaiResourceParts';
import { CivitaiToggleRow, CivitaiVideoSettings } from './CivitaiVideoSettings';

const sectionLabelClass = 'text-[9px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-500 block px-1';

function NumberRow({ label, value, onChange, min, max, step, integer }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{label}</span>
      <NumberInput value={value} onValueChange={onChange} min={min} max={max} step={step} integer={integer} className={`${civitaiNumberClass} !w-24 !py-1.5`} />
    </label>
  );
}

/** Random per job, or one fixed seed every job uses. */
function SeedRow({ seed, onChange, roll, max }: {
  seed: number | undefined;
  onChange: (seed: number | undefined) => void;
  roll: () => number;
  max: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.seed')}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={civitaiChipClass(seed === undefined)}
          onClick={() => onChange(undefined)}
          title={t('projectViewer.civitai.randomSeedHint')}
        >
          {t('projectViewer.civitai.randomSeed')}
        </button>
        {seed !== undefined ? (
          <NumberInput
            value={seed}
            onValueChange={onChange}
            min={CIVITAI_LIMITS.seed.min}
            max={max}
            integer
            aria-label={t('projectViewer.civitai.seed')}
            className={`${civitaiNumberClass} !w-28 !py-1`}
          />
        ) : (
          <button
            type="button"
            className={`flex items-center gap-1 ${civitaiChipClass(false)}`}
            onClick={() => onChange(roll())}
            title={t('projectViewer.civitai.fixSeedHint')}
          >
            <Dices className="w-3 h-3" /> {t('projectViewer.civitai.fixedSeed')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Settings saved before checkpoints, LoRAs and the negative prompt moved into
 * the workflow, turned into workflow items: a checkpoint item, one LoRA item
 * per resource and a negative text item.
 */
function migrateLegacyConfig(project: Project): Project | null {
  const config = project.civitaiConfig;
  if (!config || (!config.model && !config.resources?.length && !config.negativePrompt)) return null;
  const workflow = project.workflow || [];
  const items: WorkflowItem[] = [];
  if (config.model && civitaiModelItems(workflow, 'checkpoint').length === 0) {
    items.push({ id: crypto.randomUUID(), type: 'model', value: civitaiModelItemValue([config.model]), civitai: { slot: 'checkpoint', options: [config.model] } });
  }
  for (const resource of config.resources || []) {
    items.push({ id: crypto.randomUUID(), type: 'model', value: resource.air, civitai: { slot: 'lora', options: [resource] } });
  }
  if (config.negativePrompt?.trim()) {
    items.push({ id: crypto.randomUUID(), type: 'text', value: config.negativePrompt, civitai: { slot: 'negative' } });
  }
  const { model, resources, negativePrompt, ...rest } = config;
  return {
    ...project,
    workflow: [...workflow, ...items].map((item, order) => ({ ...item, order })),
    civitaiConfig: rest,
  };
}

interface CivitaiSettingsPanelProps {
  localProject: Project;
  /**
   * Whether the workflow has loaded. A save sends the whole workflow, so
   * nothing is saved on the panel's own initiative before then — it would
   * replace the real workflow with an empty one.
   */
  isWorkflowLoaded: boolean;
  /** Whether the project has jobs or results, which fixes whether it makes images or videos. */
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
  draftsProgress: { current: number; total: number; stage: 'composing' | 'saving' } | null;
}

/**
 * The settings of a Civitai project: which Civitai account pays for the
 * generations, whether it makes images or videos, and the parameters every
 * job shares — an image project's sampling, a video project's engine and its
 * choices. The checkpoint, LoRAs, prompt, negative prompt and source images
 * are workflow items, so they combine and shuffle like any other workflow step.
 */
export function CivitaiSettingsPanel({
  localProject,
  isWorkflowLoaded,
  hasHistory,
  providers,
  libraries,
  onSaveProject,
  isSettingsCollapsed,
  setIsSettingsCollapsed,
  queueCount,
  setQueueCount,
  combinationsCount,
  workflowError,
  uploadingItemIds,
  onAddDraftsToQueue,
  isAddingDrafts,
  draftsProgress,
}: CivitaiSettingsPanelProps) {
  const { t } = useTranslation();
  const accounts = providers.filter((provider) => provider.type === 'Civitai');
  const account = accounts.find((provider) => provider.id === localProject.providerId);
  const config: CivitaiGenerationConfig = localProject.civitaiConfig || {};
  const workflow = localProject.workflow || [];
  const checkpointItems = civitaiModelItems(workflow, 'checkpoint').filter((item) => !item.disabled);
  const checkpoints = checkpointItems.flatMap((item) => item.civitai?.options || []);
  const loraCount = civitaiModelItems(workflow, 'lora').filter((item) => !item.disabled && item.civitai?.options?.length).length;
  const imageItems = workflow.filter((item) => !item.disabled && item.type === 'image');
  const imageLibraryCount = workflow.filter((item) => (
    !item.disabled && item.type === 'library' && libraries.find((library) => library.id === item.value)?.type === 'image'
  )).length;
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

  // Once the workflow is in: nothing can be drafted until an account and a
  // checkpoint are set, so a project that lacks either opens with its
  // settings showing; and settings saved by an earlier build move into
  // workflow items.
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

  // A single Civitai account is the obvious one; pick it so the user does not have to.
  useEffect(() => {
    if (isWorkflowLoaded && !localProject.providerId && accounts.length === 1) {
      onSaveProject({ ...localProject, providerId: accounts[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkflowLoaded, accounts.length, localProject.providerId]);

  const updateConfig = (patch: Partial<CivitaiGenerationConfig>) => {
    onSaveProject({ ...localProject, civitaiConfig: { ...config, ...patch } });
  };

  // A video engine brings its own model; an image needs a checkpoint, and an
  // engine that only takes text cannot start from the workflow's images.
  const textOnlyWithImages = isVideo && hasSourceImage && !engine.imageToVideo;
  const isReady = Boolean(account && (isVideo ? !textOnlyWithImages : checkpoints.length > 0));
  const notice = workflowError
    ? { tone: 'error' as const, text: workflowError }
    : !account
      ? { tone: 'warn' as const, text: t('projectViewer.civitai.chooseAccountFirst') }
      : textOnlyWithImages
        ? { tone: 'warn' as const, text: t('projectViewer.civitai.video.textOnlyHint', { engine: engine.label }) }
        : !isVideo && checkpoints.length === 0
          ? { tone: 'warn' as const, text: t('projectViewer.civitai.chooseCheckpointFirst') }
          : null;
  const checkpointSummary = isVideo
    ? engine.label
    : checkpoints.length === 0
      ? t('projectViewer.civitai.noCheckpoint')
      : checkpoints.length === 1
        ? civitaiResourceLabel(checkpoints[0])
        : t('projectViewer.civitai.checkpointsCount', { count: checkpoints.length });
  const setMediaType = (mediaType: CivitaiMediaType) => {
    if (hasHistory || mediaType === (config.mediaType || 'image')) return;
    onSaveProject({
      ...localProject,
      civitaiConfig: { ...config, mediaType },
      format: mediaType === 'video' ? 'mp4' : 'png',
    });
  };
  const randomSeed = () => Math.floor(Math.random() * CIVITAI_MAX_ROLLED_SEED);

  return (
    <div className="shrink overflow-hidden flex flex-col p-4 border-t border-neutral-200/50 dark:border-white/5 bg-white/60 dark:bg-black/60 backdrop-blur-2xl shadow-[0_-12px_48px_rgba(0,0,0,0.2)] min-h-0">
      <button
        type="button"
        onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
        className="w-full p-3 bg-white/40 dark:bg-black/40 backdrop-blur-md border border-neutral-200/50 dark:border-white/5 rounded-xl mb-3 hover:bg-white/60 dark:hover:bg-neutral-900/50 transition-ui group flex flex-col gap-2.5 shadow-inner"
      >
        <div className="w-full flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1 text-left">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600 shrink-0">{account?.name || t('projectViewer.settings.none')}</span>
            <div className="w-1 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
            <span className="min-w-0 text-[10px] font-bold leading-4 text-neutral-700 dark:text-neutral-300 line-clamp-2 break-words">{checkpointSummary}</span>
          </div>
          <div className={`shrink-0 p-1 rounded-md bg-neutral-200/50 dark:bg-neutral-800/50 group-hover:bg-neutral-300 dark:group-hover:bg-neutral-800 transition-all ${isSettingsCollapsed ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-500" />
          </div>
        </div>
        <div className="w-full flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50">
          {isVideo ? (
            <>
              <span className={`${civitaiChipBaseClass} flex items-center gap-1`}><Film className="w-2.5 h-2.5" />{videoSettings.resolution} {hasSourceImage && engine.imageToVideo ? '' : videoSettings.aspectRatio}</span>
              {videoSettings.duration !== undefined && <span className={civitaiChipBaseClass}>{videoSettings.duration}s</span>}
              {videoSettings.cfgScale !== undefined && <span className={civitaiChipBaseClass}>CFG={videoSettings.cfgScale}</span>}
            </>
          ) : (
            <>
              <span className={civitaiChipBaseClass}>{width}×{height}</span>
              <span className={civitaiChipBaseClass}>S={steps}</span>
              <span className={civitaiChipBaseClass}>CFG={cfgScale}</span>
              <span className={civitaiChipBaseClass}>{civitaiSchedulerLabel(scheduler)}</span>
              {hasSourceImage && <span className={civitaiChipBaseClass}>D={denoise}</span>}
            </>
          )}
          {loraCount > 0 && (
            <span className="text-[9px] font-bold text-sky-500 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/30 uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" /> +{loraCount}
            </span>
          )}
          {localProject.shuffle && (
            <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase tracking-widest flex items-center gap-1">
              <Shuffle className="w-2.5 h-2.5" /> {t('projectViewer.settings.shuffle')}
            </span>
          )}
        </div>
      </button>

      <div className={`transition-all duration-300 ease-in-out flex flex-col ${isSettingsCollapsed ? 'max-h-0 opacity-0 mb-0 overflow-hidden' : 'max-h-[2000px] opacity-100 mb-4 min-h-0 shrink'}`}>
        <div className="space-y-5 pt-2 overflow-y-auto pr-1 min-h-0 shrink custom-scrollbar">
          <div className="space-y-1.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.account')}</span>
            {accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sky-500/40 bg-sky-500/5 p-3 space-y-2">
                <p className="text-xs leading-5 text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.noAccountHint')}</p>
                <Link
                  to="/provider/new?type=Civitai"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('projectViewer.civitai.addAccount')}
                </Link>
              </div>
            ) : (
              <select
                value={account?.id || ''}
                onChange={(e) => onSaveProject({ ...localProject, providerId: e.target.value || undefined })}
                className={civitaiFieldClass}
              >
                {!account && <option value="">{t('projectViewer.civitai.chooseAccount')}</option>}
                {accounts.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            )}
            <p className="px-1 text-[10px] leading-4 text-neutral-500">{t(isVideo ? 'projectViewer.civitai.video.workflowHint' : 'projectViewer.civitai.workflowHint')}</p>
          </div>

          <div className="space-y-1.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.makes')}</span>
            <div className="flex gap-1.5">
              {(['image', 'video'] as const).map((mediaType) => {
                const active = (config.mediaType || 'image') === mediaType;
                const Icon = mediaType === 'video' ? Film : ImageIcon;
                return (
                  <button
                    key={mediaType}
                    type="button"
                    className={`flex items-center gap-1.5 ${civitaiChipClass(active)} ${hasHistory && !active ? 'opacity-40 cursor-not-allowed' : ''}`}
                    onClick={() => setMediaType(mediaType)}
                    disabled={hasHistory && !active}
                    aria-pressed={active}
                  >
                    <Icon className="w-3 h-3" /> {t(mediaType === 'video' ? 'projectViewer.civitai.videos' : 'projectViewer.civitai.images')}
                  </button>
                );
              })}
            </div>
            {hasHistory && (
              <p className="flex gap-1.5 px-1 text-[10px] leading-4 text-neutral-500">
                <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{t('projectViewer.civitai.mediaTypeLocked')}</span>
              </p>
            )}
          </div>

          {isVideo && (
            <CivitaiVideoSettings
              video={config.video}
              onChange={(video) => updateConfig({ video })}
              imageCount={imageItems.length + imageLibraryCount}
              loraCount={loraCount}
              hasNegative={hasNegative}
            />
          )}

          {!isVideo && (<>

          <div className="space-y-2">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.size')}</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={civitaiChipClass(width === preset.width && height === preset.height)}
                  onClick={() => updateConfig({ width: preset.width, height: preset.height })}
                  title={`${preset.width} × ${preset.height}`}
                >
                  {t(`projectViewer.civitai.sizePresets.${preset.key}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <NumberInput
                value={width}
                onValueChange={(value) => updateConfig({ width: snapCivitaiSize(value) })}
                min={CIVITAI_LIMITS.size.min}
                max={CIVITAI_LIMITS.size.max}
                step={8}
                integer
                aria-label={t('projectViewer.civitai.width')}
                className={`${civitaiNumberClass} !py-1.5`}
              />
              <span className="text-neutral-400 text-xs">×</span>
              <NumberInput
                value={height}
                onValueChange={(value) => updateConfig({ height: snapCivitaiSize(value) })}
                min={CIVITAI_LIMITS.size.min}
                max={CIVITAI_LIMITS.size.max}
                step={8}
                integer
                aria-label={t('projectViewer.civitai.height')}
                className={`${civitaiNumberClass} !py-1.5`}
              />
            </div>
            {hasSourceImage && <p className="px-1 text-[10px] leading-4 text-neutral-500">{t('projectViewer.civitai.sizeWithImageHint')}</p>}
          </div>

          <div className="space-y-2.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.sampling')}</span>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.sampler')}</span>
              <select
                value={scheduler}
                onChange={(e) => updateConfig({ scheduler: e.target.value as CivitaiGenerationConfig['scheduler'] })}
                className={`${civitaiFieldClass} !w-44 !py-1.5`}
              >
                {CIVITAI_SCHEDULERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <NumberRow label={t('projectViewer.civitai.steps')} value={steps} onChange={(value) => updateConfig({ steps: value })} {...CIVITAI_LIMITS.steps} integer />
            <NumberRow label={t('projectViewer.civitai.cfgScale')} value={cfgScale} onChange={(value) => updateConfig({ cfgScale: value })} {...CIVITAI_LIMITS.cfgScale} step={0.5} />
            <NumberRow label={t('projectViewer.civitai.clipSkip')} value={clipSkip} onChange={(value) => updateConfig({ clipSkip: value })} {...CIVITAI_LIMITS.clipSkip} integer />
            <SeedRow seed={config.seed} onChange={(seed) => updateConfig({ seed })} roll={randomSeed} max={CIVITAI_LIMITS.seed.max} />
          </div>

          <div className="space-y-2">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.imageToImage')}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 shrink-0">{t('projectViewer.civitai.denoise')}</span>
              <input
                type="range"
                min={CIVITAI_LIMITS.denoise.min}
                max={CIVITAI_LIMITS.denoise.max}
                step={0.05}
                value={denoise}
                onChange={(e) => updateConfig({ denoise: Math.round(Number(e.target.value) * 100) / 100 })}
                className="min-w-0 flex-1 accent-sky-500"
                aria-label={t('projectViewer.civitai.denoise')}
              />
              <NumberInput
                value={denoise}
                onValueChange={(value) => updateConfig({ denoise: Math.round(value * 100) / 100 })}
                min={CIVITAI_LIMITS.denoise.min}
                max={CIVITAI_LIMITS.denoise.max}
                step={0.05}
                className={`${civitaiNumberClass} !w-16 !py-1`}
              />
            </div>
            <p className="px-1 text-[10px] leading-4 text-neutral-500">
              {hasSourceImage
                ? imageItems.length > 1 ? t('projectViewer.civitai.onlyFirstImage') : t('projectViewer.civitai.denoiseHint')
                : t('projectViewer.civitai.noSourceImageHint')}
            </p>
          </div>

          </>)}

          <div className="space-y-2.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.output')}</span>
            {!isVideo && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.format')}</span>
                <div className="flex gap-1.5">
                  {(['png', 'jpeg', 'webp'] as const).map((option) => (
                    <button key={option} type="button" className={civitaiChipClass(format === option)} onClick={() => onSaveProject({ ...localProject, format: option })}>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isVideo && <SeedRow seed={config.seed} onChange={(seed) => updateConfig({ seed })} roll={randomSeed} max={CIVITAI_MAX_ROLLED_SEED} />}
            <CivitaiToggleRow
              label={t('projectViewer.civitai.allowMature')}
              hint={t('projectViewer.civitai.allowMatureHint')}
              checked={!!config.allowMatureContent}
              onChange={(allow) => updateConfig({ allowMatureContent: allow || undefined })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1 mb-3">
        <button
          type="button"
          onClick={() => onSaveProject({ ...localProject, shuffle: !localProject.shuffle })}
          className={`flex items-center gap-1.5 ${civitaiChipClass(!!localProject.shuffle)}`}
          aria-pressed={!!localProject.shuffle}
          title={t('projectViewer.settings.randomizeOrder')}
        >
          <Shuffle className="w-3 h-3" /> {t('projectViewer.settings.shuffle')}
        </button>
        <div className="flex items-center gap-2 bg-white/40 dark:bg-black/40 px-3 py-1.5 rounded-xl border border-neutral-200/50 dark:border-white/5 shadow-inner backdrop-blur-sm">
          <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">{t('projectViewer.settings.jobQuantity')}</span>
          <NumberInput
            min={1}
            integer
            value={queueCount}
            onValueChange={setQueueCount}
            className="w-10 bg-transparent text-xs text-sky-600 dark:text-sky-400 font-black focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => setQueueCount(Math.max(1, combinationsCount))}
            disabled={combinationsCount === 0}
            className="text-[10px] text-neutral-600 hover:text-sky-600 dark:hover:text-sky-400 font-bold tracking-tighter transition-colors disabled:hover:text-neutral-600 disabled:cursor-not-allowed"
            title={t('projectViewer.settings.setToMaxCombinations')}
          >
            {t('projectViewer.settings.ofTotal', { count: combinationsCount })}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-2 px-3 py-2 mb-3 border rounded-xl text-[10px] font-bold ${
          notice.tone === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="line-clamp-2">{notice.text}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onAddDraftsToQueue}
        disabled={!isReady || workflow.length === 0 || uploadingItemIds.size > 0 || isAddingDrafts}
        className="w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-30 disabled:grayscale shadow-lg shadow-sky-500/20 active:scale-[0.98]"
      >
        {uploadingItemIds.size > 0 ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{t('projectViewer.settings.uploadingImages')}</>
        ) : isAddingDrafts ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {draftsProgress?.stage === 'saving'
              ? t('projectViewer.settings.savingDrafts')
              : t('projectViewer.settings.composingProgress', { current: draftsProgress?.current ?? 0, total: draftsProgress?.total ?? 0 })}
          </>
        ) : (
          <><Plus className="w-4 h-4" />{t('projectViewer.settings.addToDraft')}</>
        )}
      </button>
    </div>
  );
}

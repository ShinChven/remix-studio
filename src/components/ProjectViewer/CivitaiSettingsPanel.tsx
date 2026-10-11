import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertCircle,
  ChevronDown,
  Dices,
  ExternalLink,
  Hexagon,
  Layers,
  Loader2,
  Plus,
  Shuffle,
  X,
} from 'lucide-react';
import { resolveCivitaiResource } from '../../api';
import type { CivitaiGenerationConfig, CivitaiResource, Project, Provider } from '../../types';
import {
  CIVITAI_LIMITS,
  CIVITAI_SCHEDULERS,
  civitaiModelPageUrl,
  civitaiResourceLabel,
  civitaiSchedulerLabel,
  civitaiSizePresets,
  isCivitaiEmbedding,
  parseCivitaiAir,
  resolveCivitaiParams,
  snapCivitaiSize,
} from '../../lib/civitai';
import { NumberInput } from '../NumberInput';

const sectionLabelClass = 'text-[9px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-500 block px-1';
const fieldClass = 'w-full rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white/70 dark:bg-black/40 px-3 py-2 text-base sm:text-xs text-neutral-900 dark:text-neutral-200 shadow-inner focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 transition-all';
const numberClass = `${fieldClass} font-mono text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;
const chipBaseClass = 'text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest';

const CHECKPOINT_TYPES = new Set(['Checkpoint']);
const NETWORK_TYPES = new Set(['LORA', 'LoCon', 'DoRA', 'TextualInversion', 'Hypernetwork']);

/** SD 1.x and 2.x checkpoints work at their own sizes; every newer family around a megapixel. */
function sizeFamily(model?: CivitaiResource): string {
  const ecosystem = model ? parseCivitaiAir(model.air)?.ecosystem : undefined;
  return ecosystem === 'sd1' || ecosystem === 'sd2' ? ecosystem : 'xl';
}

function chipClass(selected: boolean) {
  return `px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
    selected
      ? 'border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-300'
      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
  }`;
}

/** A text field that saves when it loses focus rather than on every keystroke. */
function CommitTextarea({ value, onCommit, placeholder }: { value: string; onCommit: (value: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      value={draft}
      rows={2}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      className={`${fieldClass} resize-y min-h-[56px] leading-relaxed custom-scrollbar`}
    />
  );
}

/**
 * Paste a Civitai model link or AIR, look it up with the project's Civitai
 * account and hand back the resource once it is the kind this slot takes.
 */
function ResourceLookup({ providerId, placeholder, accept, onResolved }: {
  providerId?: string;
  placeholder: string;
  /** An error message when the resource does not belong here, otherwise null. */
  accept: (resource: CivitaiResource) => string | null;
  onResolved: (resource: CivitaiResource) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const input = value.trim();
    if (!input || !providerId || isResolving) return;
    setIsResolving(true);
    setError(null);
    try {
      const resource = await resolveCivitaiResource(providerId, input);
      const rejection = accept(resource);
      if (rejection) {
        setError(rejection);
        return;
      }
      onResolved(resource);
      setValue('');
    } catch (e: any) {
      setError(e?.message || t('projectViewer.civitai.lookupFailed'));
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          disabled={!providerId || isResolving}
          placeholder={providerId ? placeholder : t('projectViewer.civitai.chooseAccountFirst')}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          className={`${fieldClass} min-w-0 flex-1 disabled:opacity-60`}
          spellCheck={false}
          autoCapitalize="none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!providerId || !value.trim() || isResolving}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {t('projectViewer.civitai.add')}
        </button>
      </div>
      {error && <p className="px-1 text-[11px] leading-4 text-red-500">{error}</p>}
    </div>
  );
}

/** Trigger words a resource was trained on; clicking one copies it. */
function TriggerWords({ words }: { words?: string[] }) {
  const { t } = useTranslation();
  if (!words || words.length === 0) return null;
  const copy = async (word: string) => {
    try {
      await navigator.clipboard.writeText(word);
      toast.success(t('projectViewer.civitai.triggerWordCopied'));
    } catch {
      toast.error(t('projectViewer.civitai.copyFailed'));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{t('projectViewer.civitai.triggerWords')}</span>
      {words.map((word) => (
        <button
          key={word}
          type="button"
          onClick={() => void copy(word)}
          title={t('projectViewer.civitai.copyTriggerWord')}
          className="max-w-full truncate rounded-md border border-sky-500/30 bg-sky-500/5 px-1.5 py-0.5 text-[10px] font-mono text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 transition-colors"
        >
          {word}
        </button>
      ))}
    </div>
  );
}

function ResourceCard({ resource, onRemove, children }: {
  resource: CivitaiResource;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const href = civitaiModelPageUrl(resource.air);
  // Example images are served by Civitai and can disappear; fall back to the mark.
  const [previewFailed, setPreviewFailed] = useState(false);
  return (
    <div className="rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-950 p-2.5 shadow-sm space-y-2">
      <div className="flex items-start gap-2.5">
        {resource.previewUrl && !previewFailed ? (
          <img src={resource.previewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setPreviewFailed(true)} className="w-11 h-11 shrink-0 rounded-lg object-cover bg-neutral-100 dark:bg-neutral-900" />
        ) : (
          <div className="w-11 h-11 shrink-0 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Hexagon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-neutral-900 dark:text-white leading-4 line-clamp-2 break-words" title={resource.air}>
            {civitaiResourceLabel(resource)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {resource.type && <span className={chipBaseClass}>{resource.type}</span>}
            {resource.baseModel && <span className={chipBaseClass}>{resource.baseModel}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
              title={t('projectViewer.civitai.openOnCivitai')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title={t('projectViewer.civitai.remove')}
            aria-label={t('projectViewer.civitai.remove')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {children}
      <TriggerWords words={resource.trainedWords} />
    </div>
  );
}

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
      <NumberInput value={value} onValueChange={onChange} min={min} max={max} step={step} integer={integer} className={`${numberClass} !w-24 !py-1.5`} />
    </label>
  );
}

interface CivitaiSettingsPanelProps {
  localProject: Project;
  providers: Provider[];
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
 * generations, the checkpoint and the LoRAs or embeddings layered on it, and
 * the sampling parameters. The workflow above composes each job's prompt the
 * way a regular image project's does.
 */
export function CivitaiSettingsPanel({
  localProject,
  providers,
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
  const params = resolveCivitaiParams(config);
  const resources = config.resources || [];
  const presets = civitaiSizePresets(config.model);
  const format = localProject.format && ['png', 'jpeg', 'webp'].includes(localProject.format) ? localProject.format : 'png';

  // A single Civitai account is the obvious one; pick it so the user does not have to.
  useEffect(() => {
    if (!localProject.providerId && accounts.length === 1) {
      onSaveProject({ ...localProject, providerId: accounts[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, localProject.providerId]);

  // Nothing can be drafted until an account and a checkpoint are set, so a
  // project that lacks either opens with its settings showing.
  useEffect(() => {
    if (!localProject.providerId || !config.model) setIsSettingsCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConfig = (patch: Partial<CivitaiGenerationConfig>) => {
    onSaveProject({ ...localProject, civitaiConfig: { ...config, ...patch } });
  };

  const setCheckpoint = (model: CivitaiResource | undefined) => {
    // A checkpoint from another family (SD 1.5 after SDXL, say) wants other sizes.
    const resetSize = sizeFamily(model) !== sizeFamily(config.model);
    updateConfig({
      model,
      resources: model ? resources.filter((resource) => resource.air !== model.air) : resources,
      ...(resetSize ? { width: undefined, height: undefined } : {}),
    });
  };

  const updateResource = (air: string, patch: Partial<CivitaiResource>) => {
    updateConfig({ resources: resources.map((resource) => (resource.air === air ? { ...resource, ...patch } : resource)) });
  };

  const acceptCheckpoint = (resource: CivitaiResource) => (
    resource.type && !CHECKPOINT_TYPES.has(resource.type)
      ? t('projectViewer.civitai.notACheckpoint', { type: resource.type })
      : null
  );
  const acceptNetwork = (resource: CivitaiResource) => {
    if (resource.type && !NETWORK_TYPES.has(resource.type)) return t('projectViewer.civitai.notANetwork', { type: resource.type });
    if (resource.air === config.model?.air || resources.some((existing) => existing.air === resource.air)) {
      return t('projectViewer.civitai.alreadyAdded');
    }
    if (resources.length >= CIVITAI_LIMITS.resources) return t('projectViewer.civitai.tooManyResources', { count: CIVITAI_LIMITS.resources });
    return null;
  };

  const isReady = Boolean(account && config.model);
  const notice = workflowError
    ? { tone: 'error' as const, text: workflowError }
    : !account
      ? { tone: 'warn' as const, text: t('projectViewer.civitai.chooseAccountFirst') }
      : !config.model
        ? { tone: 'warn' as const, text: t('projectViewer.civitai.chooseCheckpointFirst') }
        : null;

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
            <span className="min-w-0 text-[10px] font-bold leading-4 text-neutral-700 dark:text-neutral-300 line-clamp-2 break-words">
              {config.model ? civitaiResourceLabel(config.model) : t('projectViewer.civitai.noCheckpoint')}
            </span>
          </div>
          <div className={`shrink-0 p-1 rounded-md bg-neutral-200/50 dark:bg-neutral-800/50 group-hover:bg-neutral-300 dark:group-hover:bg-neutral-800 transition-all ${isSettingsCollapsed ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-500" />
          </div>
        </div>
        <div className="w-full flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50">
          <span className={chipBaseClass}>{params.width}×{params.height}</span>
          <span className={chipBaseClass}>S={params.steps}</span>
          <span className={chipBaseClass}>CFG={params.cfgScale}</span>
          <span className={chipBaseClass}>{civitaiSchedulerLabel(params.scheduler)}</span>
          {resources.length > 0 && (
            <span className="text-[9px] font-bold text-sky-500 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/30 uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" /> +{resources.length}
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
                className={fieldClass}
              >
                {!account && <option value="">{t('projectViewer.civitai.chooseAccount')}</option>}
                {accounts.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.checkpoint')}</span>
            {config.model ? (
              <ResourceCard resource={config.model} onRemove={() => setCheckpoint(undefined)} />
            ) : (
              <ResourceLookup
                providerId={account?.id}
                placeholder={t('projectViewer.civitai.checkpointPlaceholder')}
                accept={acceptCheckpoint}
                onResolved={setCheckpoint}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.resources')}</span>
            {resources.map((resource) => (
              <ResourceCard
                key={resource.air}
                resource={resource}
                onRemove={() => updateConfig({ resources: resources.filter((entry) => entry.air !== resource.air) })}
              >
                {!isCivitaiEmbedding(resource) && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">{t('projectViewer.civitai.strength')}</span>
                    <input
                      type="range"
                      min={-1}
                      max={2}
                      step={0.05}
                      value={resource.strength ?? 1}
                      onChange={(e) => updateResource(resource.air, { strength: Number(e.target.value) })}
                      className="min-w-0 flex-1 accent-sky-500"
                      aria-label={t('projectViewer.civitai.strength')}
                    />
                    <NumberInput
                      value={resource.strength ?? 1}
                      onValueChange={(strength) => updateResource(resource.air, { strength: Math.round(strength * 100) / 100 })}
                      min={CIVITAI_LIMITS.strength.min}
                      max={CIVITAI_LIMITS.strength.max}
                      step={0.05}
                      className={`${numberClass} !w-16 !py-1`}
                    />
                  </div>
                )}
              </ResourceCard>
            ))}
            <ResourceLookup
              providerId={account?.id}
              placeholder={t('projectViewer.civitai.resourcePlaceholder')}
              accept={acceptNetwork}
              onResolved={(resource) => updateConfig({ resources: [...resources, { ...resource, ...(isCivitaiEmbedding(resource) ? {} : { strength: 1 }) }] })}
            />
          </div>

          <div className="space-y-1.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.negativePrompt')}</span>
            <CommitTextarea
              value={config.negativePrompt || ''}
              placeholder={t('projectViewer.civitai.negativePromptPlaceholder')}
              onCommit={(negativePrompt) => updateConfig({ negativePrompt: negativePrompt.trim() ? negativePrompt : undefined })}
            />
          </div>

          <div className="space-y-2">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.size')}</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={chipClass(params.width === preset.width && params.height === preset.height)}
                  onClick={() => updateConfig({ width: preset.width, height: preset.height })}
                  title={`${preset.width} × ${preset.height}`}
                >
                  {t(`projectViewer.civitai.sizePresets.${preset.key}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <NumberInput
                value={params.width!}
                onValueChange={(width) => updateConfig({ width: snapCivitaiSize(width) })}
                min={CIVITAI_LIMITS.size.min}
                max={CIVITAI_LIMITS.size.max}
                step={8}
                integer
                aria-label={t('projectViewer.civitai.width')}
                className={`${numberClass} !py-1.5`}
              />
              <span className="text-neutral-400 text-xs">×</span>
              <NumberInput
                value={params.height!}
                onValueChange={(height) => updateConfig({ height: snapCivitaiSize(height) })}
                min={CIVITAI_LIMITS.size.min}
                max={CIVITAI_LIMITS.size.max}
                step={8}
                integer
                aria-label={t('projectViewer.civitai.height')}
                className={`${numberClass} !py-1.5`}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.sampling')}</span>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.sampler')}</span>
              <select
                value={params.scheduler}
                onChange={(e) => updateConfig({ scheduler: e.target.value as CivitaiGenerationConfig['scheduler'] })}
                className={`${fieldClass} !w-44 !py-1.5`}
              >
                {CIVITAI_SCHEDULERS.map((scheduler) => (
                  <option key={scheduler.value} value={scheduler.value}>{scheduler.label}</option>
                ))}
              </select>
            </label>
            <NumberRow label={t('projectViewer.civitai.steps')} value={params.steps!} onChange={(steps) => updateConfig({ steps })} {...CIVITAI_LIMITS.steps} integer />
            <NumberRow label={t('projectViewer.civitai.cfgScale')} value={params.cfgScale!} onChange={(cfgScale) => updateConfig({ cfgScale })} {...CIVITAI_LIMITS.cfgScale} step={0.5} />
            <NumberRow label={t('projectViewer.civitai.clipSkip')} value={params.clipSkip!} onChange={(clipSkip) => updateConfig({ clipSkip })} {...CIVITAI_LIMITS.clipSkip} integer />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.seed')}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={chipClass(config.seed === undefined)}
                  onClick={() => updateConfig({ seed: undefined })}
                  title={t('projectViewer.civitai.randomSeedHint')}
                >
                  {t('projectViewer.civitai.randomSeed')}
                </button>
                {config.seed !== undefined ? (
                  <NumberInput
                    value={config.seed}
                    onValueChange={(seed) => updateConfig({ seed })}
                    {...CIVITAI_LIMITS.seed}
                    integer
                    aria-label={t('projectViewer.civitai.seed')}
                    className={`${numberClass} !w-28 !py-1`}
                  />
                ) : (
                  <button
                    type="button"
                    className={`flex items-center gap-1 ${chipClass(false)}`}
                    onClick={() => updateConfig({ seed: Math.floor(Math.random() * 2 ** 32) })}
                    title={t('projectViewer.civitai.fixSeedHint')}
                  >
                    <Dices className="w-3 h-3" /> {t('projectViewer.civitai.fixedSeed')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <span className={sectionLabelClass}>{t('projectViewer.civitai.output')}</span>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.format')}</span>
              <div className="flex gap-1.5">
                {(['png', 'jpeg', 'webp'] as const).map((option) => (
                  <button key={option} type="button" className={chipClass(format === option)} onClick={() => onSaveProject({ ...localProject, format: option })}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateConfig({ allowMatureContent: !config.allowMatureContent || undefined })}
              aria-pressed={!!config.allowMatureContent}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">{t('projectViewer.civitai.allowMature')}</span>
                <span className="block text-[10px] leading-4 text-neutral-500">{t('projectViewer.civitai.allowMatureHint')}</span>
              </span>
              <span className={`shrink-0 w-8 h-4 rounded-full relative transition-all duration-300 ${config.allowMatureContent ? 'bg-sky-500' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
                <span className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all duration-300 ${config.allowMatureContent ? 'left-5' : 'left-1'}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1 mb-3">
        <button
          type="button"
          onClick={() => onSaveProject({ ...localProject, shuffle: !localProject.shuffle })}
          className={`flex items-center gap-1.5 ${chipClass(!!localProject.shuffle)}`}
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
        disabled={!isReady || localProject.workflow.length === 0 || uploadingItemIds.size > 0 || isAddingDrafts}
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

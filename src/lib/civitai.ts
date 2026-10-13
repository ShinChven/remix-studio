import type { CivitaiBinding, CivitaiGenerationConfig, CivitaiResource, CivitaiScheduler, WorkflowItem } from '../types';

/**
 * Helpers for Civitai projects, shared by the project viewer (to edit the
 * settings and draft jobs) and the server (to validate them and build the
 * generation request).
 *
 * Civitai names every model by an AIR — `urn:air:<ecosystem>:<type>:<source>:<id>@<version>`,
 * e.g. `urn:air:sdxl:checkpoint:civitai:101055@128078` — and its generation API
 * takes the checkpoint and any LoRAs by AIR.
 */

export const CIVITAI_WEB_URL = 'https://civitai.com';

/** Samplers in the order and with the names Civitai's own generator uses. */
export const CIVITAI_SCHEDULERS: Array<{ value: CivitaiScheduler; label: string }> = [
  { value: 'eulerA', label: 'Euler a' },
  { value: 'euler', label: 'Euler' },
  { value: 'lms', label: 'LMS' },
  { value: 'heun', label: 'Heun' },
  { value: 'dpM2', label: 'DPM2' },
  { value: 'dpM2A', label: 'DPM2 a' },
  { value: 'dpM2SA', label: 'DPM++ 2S a' },
  { value: 'dpM2M', label: 'DPM++ 2M' },
  { value: 'dpmsde', label: 'DPM++ SDE' },
  { value: 'dpmFast', label: 'DPM fast' },
  { value: 'dpmAdaptive', label: 'DPM adaptive' },
  { value: 'lmsKarras', label: 'LMS Karras' },
  { value: 'dpM2Karras', label: 'DPM2 Karras' },
  { value: 'dpM2AKarras', label: 'DPM2 a Karras' },
  { value: 'dpM2SAKarras', label: 'DPM++ 2S a Karras' },
  { value: 'dpM2MKarras', label: 'DPM++ 2M Karras' },
  { value: 'dpmsdeKarras', label: 'DPM++ SDE Karras' },
  { value: 'dpM3MSDE', label: 'DPM++ 3M SDE' },
  { value: 'ddim', label: 'DDIM' },
  { value: 'plms', label: 'PLMS' },
  { value: 'uniPC', label: 'UniPC' },
  { value: 'lcm', label: 'LCM' },
  { value: 'ddpm', label: 'DDPM' },
  { value: 'deis', label: 'DEIS' },
];

export const CIVITAI_DEFAULTS = {
  scheduler: 'eulerA' as CivitaiScheduler,
  steps: 25,
  cfgScale: 7,
  clipSkip: 2,
  strength: 1,
  denoise: 0.7,
};

export const CIVITAI_LIMITS = {
  steps: { min: 1, max: 100 },
  cfgScale: { min: 1, max: 30 },
  size: { min: 64, max: 2048 },
  clipSkip: { min: 1, max: 12 },
  seed: { min: 0, max: 4_294_967_295 },
  strength: { min: -5, max: 5 },
  denoise: { min: 0.05, max: 1 },
  resources: 20,
  /** Options one checkpoint or LoRA slot may hold. */
  options: 20,
  negativePrompt: 10_000,
};

export function civitaiSchedulerLabel(value: string | undefined): string {
  return CIVITAI_SCHEDULERS.find((s) => s.value === value)?.label || value || '';
}

export interface CivitaiAir {
  ecosystem: string;
  type: string;
  source: string;
  id: string;
  version?: string;
}

const AIR_PATTERN = /^(?:urn:)?air:([a-z0-9_\-/]+):([a-z0-9_\-/]+):([a-z0-9_\-/]+):([a-z0-9_\-/.]+?)(?:@([a-z0-9_\-/.]+?))?(?:\+(\d+))?(?:\.([a-z0-9_-]+))?$/i;

/**
 * Parse an AIR. Only the full form is accepted (`urn:air:` or `air:` followed
 * by ecosystem, type, source and id), which is what Civitai shows on a model
 * page; anything else returns null.
 */
export function parseCivitaiAir(value: string): CivitaiAir | null {
  const match = AIR_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, ecosystem, type, source, id, version] = match;
  return { ecosystem: ecosystem.toLowerCase(), type: type.toLowerCase(), source: source.toLowerCase(), id, ...(version ? { version } : {}) };
}

/** The AIR in its canonical `urn:air:` form, or null when the value is not one. */
export function normalizeCivitaiAir(value: string): string | null {
  const trimmed = value.trim();
  if (!parseCivitaiAir(trimmed)) return null;
  return trimmed.toLowerCase().startsWith('urn:') ? trimmed : `urn:${trimmed}`;
}

const CIVITAI_HOSTS = /^(www\.)?civitai\.(com|green|red)$/i;

/**
 * Read a Civitai model page or download link: `/models/<id>[/<slug>][?modelVersionId=<v>]`
 * or `/api/download/models/<versionId>`. Returns null for anything else.
 */
export function parseCivitaiModelUrl(value: string): { modelId?: number; versionId?: number } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !CIVITAI_HOSTS.test(url.hostname)) return null;

  const download = url.pathname.match(/^\/api\/download\/models\/(\d+)/);
  if (download) return { versionId: Number(download[1]) };

  const model = url.pathname.match(/^\/models\/(\d+)/);
  if (!model) return null;
  const version = url.searchParams.get('modelVersionId');
  return {
    modelId: Number(model[1]),
    ...(version && /^\d+$/.test(version) ? { versionId: Number(version) } : {}),
  };
}

/** The Civitai page of a resource, when its AIR names a Civitai model version. */
export function civitaiModelPageUrl(air: string): string | null {
  const parsed = parseCivitaiAir(air);
  if (!parsed || parsed.source !== 'civitai' || !/^\d+$/.test(parsed.id)) return null;
  const version = parsed.version && /^\d+$/.test(parsed.version) ? `?modelVersionId=${parsed.version}` : '';
  return `${CIVITAI_WEB_URL}/models/${parsed.id}${version}`;
}

/** Name and version of a resource for display, falling back to its AIR. */
export function civitaiResourceLabel(resource: CivitaiResource): string {
  if (!resource.name) return resource.air;
  return resource.versionName ? `${resource.name} · ${resource.versionName}` : resource.name;
}

/** Embeddings take a trigger word rather than a strength. */
export function isCivitaiEmbedding(resource: CivitaiResource): boolean {
  return resource.type === 'TextualInversion' || parseCivitaiAir(resource.air)?.type === 'embedding';
}

export interface CivitaiSizePreset {
  key: 'square' | 'portrait' | 'landscape' | 'tall' | 'wide';
  width: number;
  height: number;
}

/**
 * Sizes the checkpoint was trained around: SD 1.x and 2.x work at 512–768 px,
 * every newer family (SDXL, Pony, Illustrious, Flux…) around one megapixel.
 */
export function civitaiSizePresets(model?: CivitaiResource): CivitaiSizePreset[] {
  const ecosystem = model ? parseCivitaiAir(model.air)?.ecosystem : undefined;
  if (ecosystem === 'sd1' || ecosystem === 'sd2') {
    const base = ecosystem === 'sd2' ? 768 : 512;
    const long = Math.round((base * 1.5) / 8) * 8;
    return [
      { key: 'square', width: base, height: base },
      { key: 'portrait', width: base, height: long },
      { key: 'landscape', width: long, height: base },
    ];
  }
  return [
    { key: 'square', width: 1024, height: 1024 },
    { key: 'portrait', width: 832, height: 1216 },
    { key: 'landscape', width: 1216, height: 832 },
    { key: 'tall', width: 768, height: 1344 },
    { key: 'wide', width: 1344, height: 768 },
  ];
}

function clamp(value: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, value));
}

/** Image sides snap to a multiple of 8, which diffusion models need. */
export function snapCivitaiSize(value: number): number {
  return clamp(Math.round(value / 8) * 8, CIVITAI_LIMITS.size);
}

/** What a job's combination picked from the workflow's Civitai items. */
export interface CivitaiPicks {
  model?: CivitaiResource;
  resources?: CivitaiResource[];
  negativePrompt?: string;
}

/**
 * The settings a job is drafted with: the project's sampling settings with
 * every parameter it left unset filled in, and the checkpoint, LoRAs and
 * negative prompt its combination picked. The default size follows that
 * job's checkpoint. The seed stays unset unless the project fixed one; the
 * server rolls it when the job runs.
 */
export function resolveCivitaiParams(config: CivitaiGenerationConfig | undefined, picks?: CivitaiPicks): CivitaiGenerationConfig {
  const base = config || {};
  const model = picks ? picks.model : base.model;
  const resources = picks ? picks.resources : base.resources;
  const negativePrompt = picks ? picks.negativePrompt : base.negativePrompt;
  const portrait = civitaiSizePresets(model).find((preset) => preset.key === 'portrait')!;
  return {
    ...(model ? { model } : {}),
    resources: (resources || []).map((resource) => (
      isCivitaiEmbedding(resource) ? resource : { ...resource, strength: resource.strength ?? CIVITAI_DEFAULTS.strength }
    )),
    negativePrompt: negativePrompt?.trim() || undefined,
    scheduler: base.scheduler || CIVITAI_DEFAULTS.scheduler,
    steps: base.steps ?? CIVITAI_DEFAULTS.steps,
    cfgScale: base.cfgScale ?? CIVITAI_DEFAULTS.cfgScale,
    width: base.width ?? portrait.width,
    height: base.height ?? portrait.height,
    clipSkip: base.clipSkip ?? CIVITAI_DEFAULTS.clipSkip,
    ...(base.seed !== undefined ? { seed: base.seed } : {}),
    allowMatureContent: !!base.allowMatureContent,
    denoise: base.denoise ?? CIVITAI_DEFAULTS.denoise,
  };
}

/**
 * Image-to-image output size: the source image's shape at the area the job's
 * size asks for, so a landscape photo stays landscape and a 4000 px phone
 * picture does not ask Civitai for a 4000 px render.
 */
export function civitaiImageToImageSize(source: { width: number; height: number }, target: { width: number; height: number }) {
  const area = target.width * target.height;
  const ratio = source.width / source.height;
  let width = Math.sqrt(area * ratio);
  let height = width / ratio;
  const scale = Math.min(1, CIVITAI_LIMITS.size.max / Math.max(width, height));
  width *= scale;
  height *= scale;
  return { width: snapCivitaiSize(width), height: snapCivitaiSize(height) };
}

function readString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readNumber(value: unknown, limits: { min: number; max: number }, integer = false): number | undefined {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return undefined;
  return clamp(integer ? Math.round(parsed) : parsed, limits);
}

function sanitizeResource(raw: unknown, withStrength: boolean): CivitaiResource | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const air = typeof value.air === 'string' ? normalizeCivitaiAir(value.air) : null;
  if (!air) return undefined;

  const resource: CivitaiResource = { air };
  const name = readString(value.name, 300);
  const versionName = readString(value.versionName, 300);
  const type = readString(value.type, 60);
  const baseModel = readString(value.baseModel, 100);
  const previewUrl = readString(value.previewUrl, 2000);
  if (name) resource.name = name;
  if (versionName) resource.versionName = versionName;
  if (type) resource.type = type;
  if (baseModel) resource.baseModel = baseModel;
  if (previewUrl && /^https:\/\//i.test(previewUrl)) resource.previewUrl = previewUrl;
  if (Array.isArray(value.trainedWords)) {
    const words = value.trainedWords
      .map((word) => readString(word, 500))
      .filter((word): word is string => !!word)
      .slice(0, 50);
    if (words.length > 0) resource.trainedWords = words;
  }
  if (withStrength) {
    const strength = readNumber(value.strength, CIVITAI_LIMITS.strength);
    if (strength !== undefined) resource.strength = Math.round(strength * 100) / 100;
  }
  return resource;
}

/**
 * Keep only the known, well-formed parts of a Civitai config sent by a client
 * or read from a bundle. Out-of-range numbers are clamped and unknown values
 * dropped rather than rejected, so a stale client never loses a whole save.
 */
export function sanitizeCivitaiConfig(raw: unknown): CivitaiGenerationConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const config: CivitaiGenerationConfig = {};

  const model = sanitizeResource(value.model, false);
  if (model) config.model = model;

  if (Array.isArray(value.resources)) {
    const seen = new Set<string>();
    const resources: CivitaiResource[] = [];
    for (const entry of value.resources) {
      const resource = sanitizeResource(entry, true);
      if (!resource || seen.has(resource.air) || resource.air === model?.air) continue;
      seen.add(resource.air);
      resources.push(resource);
      if (resources.length >= CIVITAI_LIMITS.resources) break;
    }
    if (resources.length > 0) config.resources = resources;
  }

  if (typeof value.negativePrompt === 'string' && value.negativePrompt.trim()) {
    config.negativePrompt = value.negativePrompt.slice(0, CIVITAI_LIMITS.negativePrompt);
  }
  if (typeof value.scheduler === 'string' && CIVITAI_SCHEDULERS.some((s) => s.value === value.scheduler)) {
    config.scheduler = value.scheduler as CivitaiScheduler;
  }

  const steps = readNumber(value.steps, CIVITAI_LIMITS.steps, true);
  const cfgScale = readNumber(value.cfgScale, CIVITAI_LIMITS.cfgScale);
  const width = readNumber(value.width, CIVITAI_LIMITS.size);
  const height = readNumber(value.height, CIVITAI_LIMITS.size);
  const clipSkip = readNumber(value.clipSkip, CIVITAI_LIMITS.clipSkip, true);
  const seed = readNumber(value.seed, CIVITAI_LIMITS.seed, true);
  if (steps !== undefined) config.steps = steps;
  if (cfgScale !== undefined) config.cfgScale = Math.round(cfgScale * 10) / 10;
  if (width !== undefined) config.width = snapCivitaiSize(width);
  if (height !== undefined) config.height = snapCivitaiSize(height);
  if (clipSkip !== undefined) config.clipSkip = clipSkip;
  if (seed !== undefined) config.seed = seed;
  if (value.allowMatureContent === true) config.allowMatureContent = true;
  const denoise = readNumber(value.denoise, CIVITAI_LIMITS.denoise);
  if (denoise !== undefined) config.denoise = Math.round(denoise * 100) / 100;

  return config;
}

function sameOption(a: CivitaiResource, b: CivitaiResource): boolean {
  return a.air === b.air && (a.strength ?? 1) === (b.strength ?? 1);
}

/**
 * Keep a workflow item's Civitai binding only when it fits the item: the
 * negative slot on text and library items, checkpoint and LoRA slots on model
 * items, whose options are sanitized and deduplicated (a LoRA may appear more
 * than once at different strengths).
 */
export function sanitizeCivitaiBinding(raw: unknown, itemType: WorkflowItem['type']): CivitaiBinding | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (value.slot === 'negative') {
    return itemType === 'text' || itemType === 'library' ? { slot: 'negative' } : undefined;
  }
  if ((value.slot !== 'checkpoint' && value.slot !== 'lora') || itemType !== 'model') return undefined;

  const options: CivitaiResource[] = [];
  for (const entry of Array.isArray(value.options) ? value.options : []) {
    const resource = sanitizeResource(entry, value.slot === 'lora');
    if (!resource || options.some((option) => value.slot === 'lora' ? sameOption(option, resource) : option.air === resource.air)) continue;
    options.push(resource);
    if (options.length >= CIVITAI_LIMITS.options) break;
  }
  return { slot: value.slot, options };
}

/** The value a model item stores: its options' AIRs, one per line. */
export function civitaiModelItemValue(options: CivitaiResource[] | undefined): string {
  return (options || []).map((option) => option.air).join('\n');
}

/** How an option is named in a job's filename and lists: name, plus strength for a LoRA. */
export function civitaiOptionLabel(resource: CivitaiResource, slot: CivitaiBinding['slot']): string {
  const name = resource.name || resource.air;
  return slot === 'lora' && !isCivitaiEmbedding(resource) ? `${name} ${resource.strength ?? 1}` : name;
}

/** The workflow's checkpoint and LoRA items. */
export function civitaiModelItems(workflow: WorkflowItem[], slot?: 'checkpoint' | 'lora'): WorkflowItem[] {
  return workflow.filter((item) => item.type === 'model' && item.civitai && (!slot || item.civitai.slot === slot));
}

/**
 * The parameters a job shows as chips: size, steps, CFG, sampler and how many
 * resources it layers on the checkpoint.
 */
export function summarizeCivitaiParams(params: CivitaiGenerationConfig | undefined): string[] {
  if (!params) return [];
  const parts: string[] = [];
  if (params.width && params.height) parts.push(`${params.width}×${params.height}`);
  if (params.steps !== undefined) parts.push(`S=${params.steps}`);
  if (params.cfgScale !== undefined) parts.push(`CFG=${params.cfgScale}`);
  if (params.scheduler) parts.push(civitaiSchedulerLabel(params.scheduler));
  if (params.seed !== undefined) parts.push(`#${params.seed}`);
  return parts;
}

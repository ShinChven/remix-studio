import type {
  CivitaiBinding,
  CivitaiGenerationConfig,
  CivitaiResource,
  CivitaiScheduler,
  CivitaiVideoEngine,
  CivitaiVideoSettings,
  Job,
  WorkflowItem,
} from '../types';

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

type Range = { min: number; max: number };

/**
 * A Civitai video engine as Civitai's own generator offers it: which inputs it
 * takes and the choices for each. Mirrors the Wan and Hunyuan forms and
 * handlers in Civitai's source (`wan.graph.ts`, `wan.handler.ts`,
 * `hunyuan.graph.ts`, `hunyuan.handler.ts`).
 */
export interface CivitaiVideoEngineSpec {
  value: CivitaiVideoEngine;
  label: string;
  /** How many LoRAs a job may layer on it; 0 for engines that take none. */
  loras: number;
  /** Civitai base models whose LoRAs are made for it. */
  baseModels: string[];
  negativePrompt: boolean;
  textToVideo: boolean;
  /** Starts from the workflow's first image. */
  imageToVideo: boolean;
  /** Also takes the second image as the last frame. */
  endFrame: boolean;
  resolutions: string[];
  /** Text-to-video shapes; image-to-video takes the closest one to the image, or the image's own. */
  aspectRatios: string[];
  /** Sent as a frame size in pixels rather than as a resolution and ratio. */
  frameSize: boolean;
  /** Fixed lengths to choose from, or a range; neither means the engine picks. */
  durations?: number[];
  durationRange?: Range;
  cfg?: Range & { step: number; default: number };
  steps?: Range & { default: number };
  shift?: Range & { default: number };
  interpolator?: boolean;
  promptExpansion?: boolean;
  usePrime?: boolean;
  defaults: { resolution: string; aspectRatio: string; duration?: number };
}

const WAN_CFG = { min: 1, max: 10, step: 0.5, default: 3.5 };
const WAN_SHIFT = { min: 1, max: 20, default: 8 };
/** Civitai's per-job resource cap for its top membership tier. */
const VIDEO_MAX_LORAS = 9;

export const CIVITAI_VIDEO_ENGINES: CivitaiVideoEngineSpec[] = [
  {
    value: 'wan-2.2', label: 'Wan 2.2', loras: 2,
    baseModels: ['Wan Video 2.2 T2V-A14B', 'Wan Video 2.2 I2V-A14B'],
    negativePrompt: true, textToVideo: true, imageToVideo: true, endFrame: false,
    resolutions: ['480p', '720p'], aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '5:4', '4:5'], frameSize: true,
    durations: [3, 5], cfg: WAN_CFG, shift: WAN_SHIFT,
    defaults: { resolution: '480p', aspectRatio: '1:1', duration: 5 },
  },
  {
    value: 'wan-2.1', label: 'Wan 2.1', loras: VIDEO_MAX_LORAS,
    baseModels: ['Wan Video 14B t2v', 'Wan Video 14B i2v 480p', 'Wan Video 14B i2v 720p'],
    negativePrompt: false, textToVideo: true, imageToVideo: true, endFrame: false,
    resolutions: ['480p', '720p'], aspectRatios: ['16:9', '3:2', '1:1', '2:3', '9:16'], frameSize: true,
    durations: [3, 5], cfg: WAN_CFG,
    defaults: { resolution: '480p', aspectRatio: '1:1', duration: 5 },
  },
  {
    value: 'wan-2.2-5b', label: 'Wan 2.2 5B', loras: 2,
    baseModels: ['Wan Video 2.2 TI2V-5B'],
    negativePrompt: true, textToVideo: true, imageToVideo: true, endFrame: false,
    resolutions: ['580p', '720p'], aspectRatios: ['16:9', '1:1', '9:16'], frameSize: false,
    cfg: WAN_CFG, steps: { min: 20, max: 60, default: 40 }, shift: WAN_SHIFT, interpolator: true,
    defaults: { resolution: '580p', aspectRatio: '1:1' },
  },
  {
    value: 'wan-2.5', label: 'Wan 2.5', loras: 0, baseModels: [],
    negativePrompt: true, textToVideo: true, imageToVideo: true, endFrame: false,
    resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '1:1', '9:16'], frameSize: false,
    durations: [5, 10], cfg: WAN_CFG,
    defaults: { resolution: '480p', aspectRatio: '1:1', duration: 5 },
  },
  {
    value: 'wan-2.7', label: 'Wan 2.7', loras: 0, baseModels: [],
    negativePrompt: true, textToVideo: true, imageToVideo: true, endFrame: true,
    resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'], frameSize: false,
    durationRange: { min: 2, max: 15 }, promptExpansion: true,
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    value: 'wan-3.0', label: 'Wan 3.0', loras: 0, baseModels: [],
    negativePrompt: true, textToVideo: true, imageToVideo: true, endFrame: true,
    resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'], frameSize: false,
    durationRange: { min: 2, max: 30 }, promptExpansion: true, usePrime: true,
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    value: 'hunyuan', label: 'Hunyuan', loras: VIDEO_MAX_LORAS,
    baseModels: ['Hunyuan Video'],
    negativePrompt: false, textToVideo: true, imageToVideo: false, endFrame: false,
    resolutions: ['480p'], aspectRatios: ['16:9', '3:2', '1:1', '2:3', '9:16'], frameSize: true,
    durations: [3, 5], cfg: { min: 1, max: 10, step: 0.5, default: 6 }, steps: { min: 10, max: 30, default: 20 },
    defaults: { resolution: '480p', aspectRatio: '1:1', duration: 5 },
  },
];

export const CIVITAI_DEFAULT_VIDEO_ENGINE: CivitaiVideoEngine = 'wan-2.2';

export function civitaiVideoEngine(value: string | undefined): CivitaiVideoEngineSpec {
  return CIVITAI_VIDEO_ENGINES.find((engine) => engine.value === value)
    || CIVITAI_VIDEO_ENGINES.find((engine) => engine.value === CIVITAI_DEFAULT_VIDEO_ENGINE)!;
}

/** A video engine's name, or undefined when the value is not one. */
export function civitaiVideoEngineLabel(value: string | undefined): string | undefined {
  return CIVITAI_VIDEO_ENGINES.find((engine) => engine.value === value)?.label;
}

/** Frame sizes per resolution tier and ratio, as Civitai's generator sizes them. */
const VIDEO_FRAME_SIZES: Record<string, Record<string, { width: number; height: number }>> = {
  '480p': {
    '16:9': { width: 848, height: 480 }, '3:2': { width: 720, height: 480 }, '5:4': { width: 608, height: 480 },
    '4:3': { width: 640, height: 480 }, '1:1': { width: 480, height: 480 }, '3:4': { width: 480, height: 640 },
    '4:5': { width: 384, height: 480 }, '2:3': { width: 480, height: 720 }, '9:16': { width: 480, height: 848 },
  },
  '720p': {
    '16:9': { width: 1280, height: 720 }, '3:2': { width: 1080, height: 720 }, '5:4': { width: 912, height: 720 },
    '4:3': { width: 960, height: 720 }, '1:1': { width: 720, height: 720 }, '3:4': { width: 720, height: 960 },
    '4:5': { width: 576, height: 720 }, '2:3': { width: 720, height: 1080 }, '9:16': { width: 720, height: 1280 },
  },
};

/** The frame size an engine that takes one renders a resolution and ratio at. */
export function civitaiVideoFrameSize(resolution: string, aspectRatio: string): { width: number; height: number } | undefined {
  return VIDEO_FRAME_SIZES[resolution]?.[aspectRatio];
}

function ratioValue(aspectRatio: string): number {
  const [w, h] = aspectRatio.split(':').map(Number);
  return w && h ? w / h : 1;
}

/** Of the given ratios, the one closest to an image's shape. */
export function closestCivitaiAspectRatio(source: { width: number; height: number }, ratios: string[]): string {
  const target = Math.log(source.width / source.height);
  let best = ratios[0];
  for (const ratio of ratios) {
    if (Math.abs(Math.log(ratioValue(ratio)) - target) < Math.abs(Math.log(ratioValue(best)) - target)) best = ratio;
  }
  return best;
}

/** Whether a LoRA was made for a video engine, when its base model is known. */
export function civitaiResourceFitsEngine(resource: CivitaiResource, engine: CivitaiVideoEngineSpec): boolean | undefined {
  if (!resource.baseModel) return undefined;
  return engine.baseModels.some((base) => base.toLowerCase() === resource.baseModel!.toLowerCase());
}

/** Whether a config makes videos. */
export function isCivitaiVideo(config: CivitaiGenerationConfig | undefined): boolean {
  return config?.mediaType === 'video';
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
  if (isCivitaiVideo(base)) return resolveCivitaiVideoParams(base, picks);
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
 * A video engine's settings with every unset or no-longer-offered choice
 * replaced by the engine's default, and for engines that take one, the frame
 * size those choices come to.
 */
export function resolveCivitaiVideoSettings(video: CivitaiVideoSettings | undefined): CivitaiVideoSettings {
  const engine = civitaiVideoEngine(video?.engine);
  const value = video || {};
  const resolution = value.resolution && engine.resolutions.includes(value.resolution) ? value.resolution : engine.defaults.resolution;
  const aspectRatio = value.aspectRatio && engine.aspectRatios.includes(value.aspectRatio) ? value.aspectRatio : engine.defaults.aspectRatio;
  const settings: CivitaiVideoSettings = { engine: engine.value, resolution, aspectRatio };
  if (engine.durations) {
    settings.duration = value.duration !== undefined && engine.durations.includes(value.duration) ? value.duration : engine.defaults.duration;
  } else if (engine.durationRange) {
    settings.duration = value.duration !== undefined ? clamp(Math.round(value.duration), engine.durationRange) : engine.defaults.duration;
  }
  if (engine.cfg) settings.cfgScale = value.cfgScale !== undefined ? clamp(value.cfgScale, engine.cfg) : engine.cfg.default;
  if (engine.steps) settings.steps = value.steps !== undefined ? clamp(Math.round(value.steps), engine.steps) : engine.steps.default;
  if (engine.shift) settings.shift = value.shift !== undefined ? clamp(value.shift, engine.shift) : engine.shift.default;
  if (engine.interpolator) settings.interpolator = value.interpolator || 'none';
  if (engine.promptExpansion) settings.promptExpansion = !!value.promptExpansion;
  if (engine.usePrime) settings.usePrime = !!value.usePrime;
  if (engine.frameSize) Object.assign(settings, civitaiVideoFrameSize(resolution, aspectRatio));
  return settings;
}

/**
 * A video job's settings: the engine's, the LoRAs and negative prompt its
 * combination picked when the engine takes them, and the shared seed and
 * mature-content choice. LoRAs past the engine's limit are left out, as are
 * embeddings, which only image checkpoints use.
 */
function resolveCivitaiVideoParams(base: CivitaiGenerationConfig, picks?: CivitaiPicks): CivitaiGenerationConfig {
  const engine = civitaiVideoEngine(base.video?.engine);
  const resources = (picks ? picks.resources : base.resources) || [];
  const negativePrompt = picks ? picks.negativePrompt : base.negativePrompt;
  const loras = engine.loras > 0
    ? resources.filter((resource) => !isCivitaiEmbedding(resource)).slice(0, engine.loras)
    : [];
  return {
    mediaType: 'video',
    video: resolveCivitaiVideoSettings(base.video),
    resources: loras.map((resource) => ({ ...resource, strength: resource.strength ?? CIVITAI_DEFAULTS.strength })),
    ...(engine.negativePrompt && negativePrompt?.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
    ...(base.seed !== undefined ? { seed: Math.min(base.seed, CIVITAI_MAX_ROLLED_SEED) } : {}),
    allowMatureContent: !!base.allowMatureContent,
  };
}

/**
 * The largest seed a job rolls for itself. Some Civitai engines read the seed
 * as a signed 32-bit number, so Civitai's own generator stays below 2^31.
 */
export const CIVITAI_MAX_ROLLED_SEED = 2 ** 31 - 1;

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

  if (value.mediaType === 'video' || value.mediaType === 'image') config.mediaType = value.mediaType;
  const video = sanitizeVideoSettings(value.video);
  if (video) config.video = video;

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

/**
 * Keep a video settings object's well-formed parts. A choice the engine does
 * not offer is dropped, so the engine's default takes its place.
 */
function sanitizeVideoSettings(raw: unknown): CivitaiVideoSettings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const known = CIVITAI_VIDEO_ENGINES.find((engine) => engine.value === value.engine);
  const engine = known || civitaiVideoEngine(undefined);
  const settings: CivitaiVideoSettings = {};
  if (known) settings.engine = known.value;
  if (typeof value.resolution === 'string' && engine.resolutions.includes(value.resolution)) settings.resolution = value.resolution;
  if (typeof value.aspectRatio === 'string' && engine.aspectRatios.includes(value.aspectRatio)) settings.aspectRatio = value.aspectRatio;
  const duration = readNumber(value.duration, { min: 1, max: 60 }, true);
  if (duration !== undefined) settings.duration = duration;
  const cfgScale = readNumber(value.cfgScale, { min: 1, max: 30 });
  if (cfgScale !== undefined) settings.cfgScale = Math.round(cfgScale * 10) / 10;
  const steps = readNumber(value.steps, CIVITAI_LIMITS.steps, true);
  if (steps !== undefined) settings.steps = steps;
  const shift = readNumber(value.shift, { min: 1, max: 20 });
  if (shift !== undefined) settings.shift = Math.round(shift * 10) / 10;
  if (value.interpolator === 'none' || value.interpolator === 'film' || value.interpolator === 'rife') settings.interpolator = value.interpolator;
  if (typeof value.promptExpansion === 'boolean') settings.promptExpansion = value.promptExpansion;
  if (typeof value.usePrime === 'boolean') settings.usePrime = value.usePrime;
  const width = readNumber(value.width, CIVITAI_LIMITS.size, true);
  const height = readNumber(value.height, CIVITAI_LIMITS.size, true);
  if (width !== undefined && height !== undefined) {
    settings.width = width;
    settings.height = height;
  }
  return Object.keys(settings).length > 0 ? settings : undefined;
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
  if (isCivitaiVideo(params)) {
    const video = params.video || {};
    if (video.width && video.height) parts.push(`${video.width}×${video.height}`);
    else if (video.resolution) parts.push([video.resolution, video.aspectRatio].filter(Boolean).join(' '));
    if (video.duration !== undefined) parts.push(`${video.duration}s`);
    if (video.cfgScale !== undefined) parts.push(`CFG=${video.cfgScale}`);
    if (params.seed !== undefined) parts.push(`#${params.seed}`);
    return parts;
  }
  if (params.width && params.height) parts.push(`${params.width}×${params.height}`);
  if (params.steps !== undefined) parts.push(`S=${params.steps}`);
  if (params.cfgScale !== undefined) parts.push(`CFG=${params.cfgScale}`);
  if (params.scheduler) parts.push(civitaiSchedulerLabel(params.scheduler));
  if (params.seed !== undefined) parts.push(`#${params.seed}`);
  return parts;
}

/**
 * The id a Civitai job and its result keep as their model: the checkpoint's
 * AIR for an image, the engine for a video.
 */
export function civitaiJobModelId(params: CivitaiGenerationConfig | undefined): string | undefined {
  if (!params) return undefined;
  return isCivitaiVideo(params) ? civitaiVideoEngine(params.video?.engine).value : params.model?.air;
}

/** What a job ran with, for a list: its checkpoint, or its video engine. */
export function civitaiParamsModelLabel(params: CivitaiGenerationConfig | undefined): string | undefined {
  if (!params) return undefined;
  if (isCivitaiVideo(params)) return civitaiVideoEngine(params.video?.engine).label;
  return params.model ? civitaiResourceLabel(params.model) : undefined;
}

/**
 * Workflow items that bring back what a result was generated with — its
 * checkpoint, each LoRA in a slot of its own so all of them apply, and the
 * negative prompt — for reusing a result whose job is gone.
 */
export function civitaiWorkflowItemsFromParams(params: CivitaiGenerationConfig | undefined): Array<Pick<WorkflowItem, 'type' | 'value' | 'civitai'>> {
  if (!params) return [];
  const items: Array<Pick<WorkflowItem, 'type' | 'value' | 'civitai'>> = [];
  if (params.model && !isCivitaiVideo(params)) {
    items.push({ type: 'model', value: civitaiModelItemValue([params.model]), civitai: { slot: 'checkpoint', options: [params.model] } });
  }
  for (const resource of params.resources || []) {
    items.push({ type: 'model', value: civitaiModelItemValue([resource]), civitai: { slot: 'lora', options: [resource] } });
  }
  if (params.negativePrompt) {
    items.push({ type: 'text', value: params.negativePrompt, civitai: { slot: 'negative' } });
  }
  return items;
}

/**
 * A Civitai draft's settings from one workflow combination, the same from the
 * project viewer and from MCP: the resolved parameters, the source images (an
 * image starts from the first; a video from the first, and ends on the second
 * with an engine that takes a last frame), and the job fields lists show.
 */
export function civitaiDraftFields(
  config: CivitaiGenerationConfig | undefined,
  combo: { imageContexts?: string[]; civitai?: CivitaiPicks },
  imageFormat?: string,
): Pick<Job, 'imageContexts' | 'modelConfigId' | 'aspectRatio' | 'resolution' | 'duration' | 'format' | 'civitaiParams'> {
  const params = resolveCivitaiParams(config, combo.civitai || {});
  const video = isCivitaiVideo(params);
  const engine = civitaiVideoEngine(params.video?.engine);
  const sources = (combo.imageContexts || []).slice(0, video && engine.endFrame ? 2 : 1);
  return {
    imageContexts: sources.length > 0 ? sources : undefined,
    modelConfigId: civitaiJobModelId(params),
    aspectRatio: video ? params.video?.aspectRatio : `${params.width}x${params.height}`,
    ...(video ? { resolution: params.video?.resolution, duration: params.video?.duration } : {}),
    format: video ? 'mp4' : imageFormat === 'jpeg' || imageFormat === 'webp' ? imageFormat : 'png',
    civitaiParams: params,
  };
}

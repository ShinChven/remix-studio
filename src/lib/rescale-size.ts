/**
 * Size matching for rescaling an album image with an image model.
 *
 * Models describe output size in several shapes: ratios (`3:2`), pixel sizes
 * carried in the ratio list (`1536x1024`), free ratios (`auto`, `adaptive`,
 * `match_input_image`), and resolution tiers in the quality list — `2K`,
 * `2 MP`, `768sq`, a tier with a quality word (`2K High`, `low/1k`), or a
 * quality word alone (`high`). Everything here reduces those to a ratio and a
 * pixel area so a source image, or a choice made for another model, can be
 * carried to the closest option a model offers.
 */

/** Stands for "follow the source image" in the ratio and format pickers. */
export const RESCALE_SOURCE = 'source';

export const RESCALE_IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type RescaleImageFormat = (typeof RESCALE_IMAGE_FORMATS)[number];

/** The prompt a rescale starts with; the dialog lets it be edited. Models follow English prompts best, so it is not translated. */
export const DEFAULT_RESCALE_PROMPT =
  'Recreate this exact image at the requested size. Keep the composition, subjects, colors, lighting and style exactly the same. Render fine details and textures crisply, and remove noise, blur and compression artifacts. Do not add, remove or change any content.';

/** Two ratios this close (about 3%) count as the same shape. */
const RATIO_TOLERANCE = 0.03;

const FLEXIBLE_RATIOS = new Set(['auto', 'adaptive', 'match_input_image', 'match_input', 'original']);

export interface RatioOption {
  /** Width over height; undefined for free ratios. */
  ratio?: number;
  /** Pixel area in megapixels, when the option is a pixel size. */
  megapixels?: number;
  /** `auto` and the like: the model picks, usually following the input. */
  flexible: boolean;
}

export interface QualityOption {
  /** Pixel area in megapixels, when the option names a resolution tier. */
  megapixels?: number;
  /** What is left once the tier is taken out, lower-cased: `high`, `flare`, `auto`, or `''`. */
  qualifier: string;
}

export function isFlexibleRatio(value: string): boolean {
  return FLEXIBLE_RATIOS.has(value.trim().toLowerCase());
}

export function parseRatioOption(value: string): RatioOption {
  if (isFlexibleRatio(value)) return { flexible: true };
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([:x*×])\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return { flexible: false };
  const width = Number(match[1]);
  const height = Number(match[3]);
  if (!width || !height) return { flexible: false };
  const pixels = match[2] !== ':' && width >= 64 && height >= 64;
  return { ratio: width / height, megapixels: pixels ? (width * height) / 1e6 : undefined, flexible: false };
}

export function parseQualityOption(value: string): QualityOption {
  let rest = value.trim().toLowerCase();
  let megapixels: number | undefined;
  const take = (pattern: RegExp, toMegapixels: (n: number) => number) => {
    if (megapixels !== undefined) return;
    const match = rest.match(pattern);
    if (!match) return;
    megapixels = toMegapixels(Number(match[1]));
    rest = rest.replace(match[0], ' ');
  };
  take(/(\d+(?:\.\d+)?)\s*mp\b/, (n) => n);
  take(/(\d+(?:\.\d+)?)\s*k\b/, (n) => (n * 1024) ** 2 / 1e6);
  take(/(\d+)\s*sq\b/, (n) => (n * n) / 1e6);
  const qualifier = rest.replace(/[/_,-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { megapixels, qualifier };
}

const ratioDistance = (a: number, b: number) => Math.abs(Math.log(a / b));
const areaDistance = (a: number, b: number) => Math.abs(Math.log(a / b));

/**
 * The ratio option closest to `sourceRatio`. A free ratio wins when nothing
 * fixed is within tolerance, since it lets the model follow the input. Among
 * pixel sizes of the same shape, the smallest one above `targetMegapixels`
 * wins (or the largest, when none is above it).
 */
export function matchRatio(sourceRatio: number | undefined, options: string[] | undefined, targetMegapixels?: number): string | undefined {
  if (!options || options.length === 0) return undefined;
  const flexible = options.find(isFlexibleRatio);
  if (!sourceRatio || !Number.isFinite(sourceRatio)) return flexible ?? options[0];

  const shaped = options
    .map((value) => ({ value, ...parseRatioOption(value) }))
    .filter((option): option is { value: string; ratio: number; megapixels?: number; flexible: boolean } => option.ratio !== undefined);
  if (shaped.length === 0) return flexible ?? options[0];

  const best = Math.min(...shaped.map((option) => ratioDistance(option.ratio, sourceRatio)));
  if (best > RATIO_TOLERANCE && flexible) return flexible;
  const closest = shaped.filter((option) => ratioDistance(option.ratio, sourceRatio) <= best + 0.01);
  const sized = closest.filter((option) => option.megapixels !== undefined) as Array<{ value: string; megapixels: number }>;
  if (sized.length < 2 || targetMegapixels === undefined) return closest[0].value;
  return pickBySize(sized, targetMegapixels).value;
}

/** The smallest entry at or above the target, else the largest. */
function pickBySize<T extends { megapixels: number }>(entries: T[], target: number): T {
  const sorted = [...entries].sort((a, b) => a.megapixels - b.megapixels);
  return sorted.find((entry) => entry.megapixels >= target * 0.95) ?? sorted[sorted.length - 1];
}

/** Carries a ratio chosen for one model to the closest one another model offers. */
export function carryRatio(previous: string, options: string[] | undefined): string | undefined {
  if (!options || options.length === 0) return undefined;
  const exact = options.find((option) => option.toLowerCase() === previous.toLowerCase());
  if (exact) return exact;
  if (isFlexibleRatio(previous)) return options.find(isFlexibleRatio) ?? options[0];
  const parsed = parseRatioOption(previous);
  return matchRatio(parsed.ratio, options, parsed.megapixels);
}

function sameQualifier(options: Array<{ value: string } & QualityOption>, qualifier: string) {
  return options.find((option) => option.qualifier === qualifier)
    ?? options.find((option) => option.qualifier === 'auto' || option.qualifier === '')
    ?? options[0];
}

/**
 * The quality option closest to `previous`: the same string when offered, else
 * the nearest resolution tier, keeping its quality word where it can.
 */
export function carryQuality(previous: string | undefined, options: string[] | undefined): string | undefined {
  if (!options || options.length === 0) return undefined;
  if (!previous) return options[0];
  const exact = options.find((option) => option.toLowerCase() === previous.toLowerCase());
  if (exact) return exact;

  const want = parseQualityOption(previous);
  const parsed = options.map((value) => ({ value, ...parseQualityOption(value) }));
  const tiered = parsed.filter((option) => option.megapixels !== undefined) as Array<{ value: string; megapixels: number; qualifier: string }>;
  if (want.megapixels !== undefined && tiered.length > 0) {
    const nearest = Math.min(...tiered.map((option) => areaDistance(option.megapixels, want.megapixels!)));
    const tier = tiered.filter((option) => areaDistance(option.megapixels, want.megapixels!) <= nearest + 1e-6);
    return sameQualifier(tier, want.qualifier).value;
  }
  return parsed.find((option) => option.qualifier === want.qualifier)?.value ?? options[0];
}

/**
 * The quality to start a rescale with: one tier above the largest source
 * (or the top tier when the source is already that large), keeping the quality
 * word of `preferred` — usually the project's own setting. Models without
 * tiers keep `preferred` when it is offered.
 */
export function pickRescaleQuality(options: string[] | undefined, sourceMegapixels: number | undefined, preferred?: string): string | undefined {
  if (!options || options.length === 0) return undefined;
  const parsed = options.map((value) => ({ value, ...parseQualityOption(value) }));
  const tiered = parsed.filter((option) => option.megapixels !== undefined) as Array<{ value: string; megapixels: number; qualifier: string }>;
  if (tiered.length === 0 || sourceMegapixels === undefined) return carryQuality(preferred, options);
  const sizes = [...new Set(tiered.map((option) => option.megapixels))].sort((a, b) => a - b);
  const size = sizes.find((megapixels) => megapixels > sourceMegapixels * 1.1) ?? sizes[sizes.length - 1];
  const qualifier = preferred ? parseQualityOption(preferred).qualifier : '';
  return sameQualifier(tiered.filter((option) => option.megapixels === size), qualifier).value;
}

/**
 * The output size a ratio and quality should come out at, or undefined when the
 * options do not say. Tiers are read as pixel areas, so this is an estimate.
 */
export function estimateOutputSize(sourceRatio: number | undefined, ratio: string | undefined, quality: string | undefined): { width: number; height: number } | undefined {
  const shape = ratio ? parseRatioOption(ratio) : { flexible: true };
  if (shape.ratio && shape.megapixels) {
    const [w, h] = ratio!.split(/[x*×]/i).map(Number);
    return { width: w, height: h };
  }
  const r = shape.ratio ?? sourceRatio;
  const megapixels = quality ? parseQualityOption(quality).megapixels : undefined;
  if (!r || !megapixels) return undefined;
  const width = Math.round(Math.sqrt(megapixels * 1e6 * r));
  return { width, height: Math.round(width / r) };
}

const COMMON_RATIOS: Array<[number, number]> = [[1, 1], [4, 3], [3, 2], [16, 9], [5, 4], [21, 9], [2, 1], [3, 1], [4, 1], [9, 19.5], [9, 20]];

/**
 * `3:2` for 3000×2000. Models round their sizes (1376×768 is a 16:9), so a
 * shape within 1% of a common ratio is named by it; anything else is the
 * reduced fraction when small, else the decimal ratio.
 */
export function describeRatio(width: number, height: number): string {
  const actual = width / height;
  for (const [a, b] of COMMON_RATIOS) {
    for (const [w, h] of a === b ? [[a, b]] : [[a, b], [b, a]]) {
      if (ratioDistance(w / h, actual) <= 0.01) return `${w}:${h}`;
    }
  }
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(width, height);
  const w = width / d;
  const h = height / d;
  return w <= 32 && h <= 32 ? `${w}:${h}` : `${actual.toFixed(2)}:1`;
}

/** Whether `chosen` is the source shape, within tolerance. */
export function ratioMatchesSource(sourceRatio: number | undefined, chosen: string | undefined): boolean {
  if (!sourceRatio || !chosen) return false;
  if (isFlexibleRatio(chosen)) return true;
  const parsed = parseRatioOption(chosen).ratio;
  return parsed !== undefined && ratioDistance(parsed, sourceRatio) <= RATIO_TOLERANCE;
}

export function normalizeImageFormat(value: string | undefined): RescaleImageFormat | undefined {
  const format = value?.toLowerCase();
  if (format === 'jpg') return 'jpeg';
  return (RESCALE_IMAGE_FORMATS as readonly string[]).includes(format || '') ? (format as RescaleImageFormat) : undefined;
}

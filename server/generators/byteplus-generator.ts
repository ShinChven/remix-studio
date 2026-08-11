import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

type BytePlusImageResponse = {
  model?: string;
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
    size?: string;
    output_format?: string;
    error?: { code?: string; message?: string };
  }>;
  usage?: {
    generated_images?: number;
    input_images?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

/**
 * Recommended pixel dimensions keyed by "quality|aspectRatio", shared by
 * seedream 5.0 lite, 4.5, 4.0 and 3.0 (3.0 only reaches the 1K tier).
 */
const SIZE_MAP: Record<string, Record<string, string>> = {
  // seedream-5-0-lite supports 2K, 3K and 4K
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2848x1600',
    '9:16': '1600x2848',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
  },
  '3K': {
    '1:1': '3072x3072',
    '4:3': '3456x2592',
    '3:4': '2592x3456',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
    '3:2': '3744x2496',
    '2:3': '2496x3744',
    '21:9': '4704x2016',
  },
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1512x648',
  },
  '4K': {
    '1:1': '4096x4096',
    '4:3': '4704x3520',
    '3:4': '3520x4704',
    '16:9': '5504x3040',
    '9:16': '3040x5504',
    '3:2': '4992x3328',
    '2:3': '3328x4992',
    '21:9': '6240x2656',
  },
};

/**
 * seedream-5-0-pro has its own table: it tops out at 4,624,220 total pixels
 * (so no 3K/4K tier) and its 1K and 2K dimensions differ from the ones the
 * other models use — 16:9 is 1424x800 rather than 1280x720, for instance.
 * The 1.5K tier is billed at the 1K rate.
 */
const SIZE_MAP_5_PRO: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1424x800',
    '9:16': '800x1424',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1568x672',
  },
  '1.5K': {
    '1:1': '1536x1536',
    '4:3': '1792x1344',
    '3:4': '1344x1792',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '3:2': '1872x1248',
    '2:3': '1248x1872',
    '21:9': '2352x1008',
  },
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2368x1776',
    '3:4': '1776x2368',
    '16:9': '2816x1584',
    '9:16': '1584x2816',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
  },
};

/** Which request fields a model accepts. Sending an unsupported one errors. */
type ModelTraits = {
  /** Resolution tiers the model accepts, as offered by the project settings. */
  qualities: string[];
  /** Tier used when the project carries a quality another model defined. */
  defaultQuality: string;
  /** Pixel table the quality + aspect ratio pair is resolved against. */
  sizeMap: Record<string, Record<string, string>>;
  /** Model derives its own dimensions from the input image; send `adaptive`. */
  adaptiveSize?: boolean;
  /** Reference images accepted in one request; 0 means text-to-image only. */
  maxRefImages: number;
  /** `output_format` is only accepted by the 5.0 models. */
  supportsOutputFormat: boolean;
  /** `sequential_image_generation` errors on 5.0 pro and the 3.0 models. */
  supportsSequentialGeneration: boolean;
  /** Only seedream-3-0-t2i takes a seed. */
  supportsSeed: boolean;
  /** Fixed `guidance_scale` for the 3.0 models that accept one. */
  guidanceScale?: number;
};

const ALL_QUALITIES = ['1K', '2K', '3K', '4K'];

/**
 * Model IDs are matched by pattern rather than by exact string so that dated
 * releases, the `dola-` prefix BytePlus puts on its international listings and
 * custom endpoint IDs all land on the right traits.
 */
function resolveTraits(model: string): ModelTraits {
  const id = model.toLowerCase();

  if (/seedream-5[-.]0-pro/.test(id)) {
    return {
      qualities: ['1K', '1.5K', '2K'],
      defaultQuality: '2K',
      sizeMap: SIZE_MAP_5_PRO,
      maxRefImages: 10,
      supportsOutputFormat: true,
      supportsSequentialGeneration: false,
      supportsSeed: false,
    };
  }

  if (/seedream-5[-.]0/.test(id)) {
    return {
      qualities: ['2K', '3K', '4K'],
      defaultQuality: '2K',
      sizeMap: SIZE_MAP,
      maxRefImages: 14,
      supportsOutputFormat: true,
      supportsSequentialGeneration: true,
      supportsSeed: false,
    };
  }

  if (/seedream-4[-.]5/.test(id)) {
    return {
      qualities: ['2K', '4K'],
      defaultQuality: '2K',
      sizeMap: SIZE_MAP,
      maxRefImages: 14,
      supportsOutputFormat: false,
      supportsSequentialGeneration: true,
      supportsSeed: false,
    };
  }

  if (/seedream-4[-.]0/.test(id)) {
    return {
      qualities: ['1K', '2K', '4K'],
      defaultQuality: '2K',
      sizeMap: SIZE_MAP,
      maxRefImages: 14,
      supportsOutputFormat: false,
      supportsSequentialGeneration: true,
      supportsSeed: false,
    };
  }

  // seedream-3-0-t2i is text-to-image only and never leaves the 1K tier
  // (2048x2048 total pixels is its ceiling).
  if (/seedream-3[-.]0/.test(id)) {
    return {
      qualities: ['1K'],
      defaultQuality: '1K',
      sizeMap: SIZE_MAP,
      maxRefImages: 0,
      supportsOutputFormat: false,
      supportsSequentialGeneration: false,
      supportsSeed: true,
      guidanceScale: 2.5,
    };
  }

  if (/seededit/.test(id)) {
    return {
      qualities: [],
      defaultQuality: '1K',
      sizeMap: SIZE_MAP,
      adaptiveSize: true,
      maxRefImages: 1,
      supportsOutputFormat: false,
      supportsSequentialGeneration: false,
      supportsSeed: false,
      guidanceScale: 5.5,
    };
  }

  // Unknown model (a custom endpoint ID): send only the fields every Ark
  // image model accepts.
  return {
    qualities: ALL_QUALITIES,
    defaultQuality: '2K',
    sizeMap: SIZE_MAP,
    maxRefImages: 14,
    supportsOutputFormat: false,
    supportsSequentialGeneration: false,
    supportsSeed: false,
  };
}

/**
 * Reference images are sent as `data:image/<format>;base64,...` and the format
 * has to match the bytes, which reach us as PNG, JPEG or WebP depending on how
 * the referenced item was stored.
 */
function detectImageMimeType(base64: string): string {
  const header = Buffer.from(base64.slice(0, 24), 'base64');
  if (header.length < 12) return 'image/png';

  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg';
  if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (header.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (header.subarray(0, 2).toString('ascii') === 'BM') return 'image/bmp';

  return 'image/png';
}

const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_MODEL = 'seedream-5-0-260128';

export class BytePlusGenerator extends ImageGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    const parsed = new URL(apiUrl);
    let pathname = parsed.pathname.replace(/\/$/, '');

    // Strip known API paths so we're left with the base
    if (pathname.endsWith('/images/generations')) {
      pathname = pathname.slice(0, -'/images/generations'.length);
    }

    // Ensure the /api/v3 suffix is present
    if (!pathname.endsWith('/api/v3')) {
      pathname = pathname.replace(/\/$/, '') + '/api/v3';
    }

    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;
    const traits = resolveTraits(model);

    try {
      const payload: Record<string, unknown> = {
        model,
        prompt: req.prompt,
        response_format: 'b64_json',
        watermark: false,
      };

      // Resolve size from quality + aspect ratio
      const size = this.resolveSize(traits, req.aspectRatio, req.imageSize);
      if (size) {
        payload.size = size;
      }

      // Reference images for img2img (seedream 5.0/4.5/4.0 and seededit-3-0-i2i)
      const refImages = this.resolveReferenceImages(traits, req);
      if (refImages) {
        payload.image = refImages.length === 1 ? refImages[0] : refImages;
      }

      // A job holds exactly one image, so batch output stays off. The models
      // that reject the field entirely (5.0 pro, the 3.0 pair) never see it.
      if (traits.supportsSequentialGeneration) {
        payload.sequential_image_generation = 'disabled';
      }

      if (traits.supportsOutputFormat) {
        const outputFormat = this.resolveOutputFormat(req.format);
        if (outputFormat) payload.output_format = outputFormat;
      }

      if (traits.supportsSeed && Number.isInteger(req.seed)) {
        payload.seed = req.seed;
      }

      if (traits.guidanceScale !== undefined) {
        payload.guidance_scale = traits.guidanceScale;
      }

      const response = await this.callApi('/images/generations', payload);

      if (response.error) {
        return {
          ok: false,
          error: response.error.message || `BytePlus error: ${response.error.code}`,
        };
      }

      return this.extractImage(response);
    } catch (e: any) {
      console.error('[BytePlusGenerator] Error:', e);
      return { ok: false, error: e?.message || 'BytePlus image generation failed' };
    }
  }

  private resolveSize(
    traits: ModelTraits,
    aspectRatio?: string,
    quality?: string,
  ): string | undefined {
    // seededit-3-0-i2i sizes the output from the input image
    if (traits.adaptiveSize) return 'adaptive';

    const ratio = aspectRatio || '1:1';
    const requested = (quality || '').trim().toUpperCase();
    const tier = traits.qualities.includes(requested) ? requested : traits.defaultQuality;

    // Send explicit pixel dimensions rather than the tier name so the aspect
    // ratio picked in the project is the one the model renders.
    const table = traits.sizeMap[tier] || traits.sizeMap[traits.defaultQuality];
    return table?.[ratio] || table?.['1:1'] || tier;
  }

  private resolveReferenceImages(
    traits: ModelTraits,
    req: GenerateRequest,
  ): string[] | undefined {
    if (traits.maxRefImages === 0) return undefined;

    let refs: string[] | undefined;
    if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
      refs = req.refImagesBase64.map(
        (b64) => `data:${detectImageMimeType(b64)};base64,${b64}`,
      );
    } else if (req.refImageUrls && req.refImageUrls.length > 0) {
      refs = req.refImageUrls;
    }

    if (!refs || refs.length === 0) return undefined;

    // Past the per-model limit the request is rejected outright, so drop the
    // extras and generate from the ones the model can take.
    return refs.slice(0, traits.maxRefImages);
  }

  private resolveOutputFormat(format?: string): 'png' | 'jpeg' | undefined {
    switch (format) {
      case 'jpeg':
        return 'jpeg';
      case 'png':
        return 'png';
      // WebP is not an Ark output format. PNG is the lossless source for the
      // WebP the image processor re-encodes, where JPEG would bake in artifacts.
      case 'webp':
        return 'png';
      default:
        return undefined;
    }
  }

  private async callApi(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<BytePlusImageResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.json() as Promise<BytePlusImageResponse>;
  }

  private async extractImage(
    response: BytePlusImageResponse,
  ): Promise<GenerateResult> {
    if (!response.data || response.data.length === 0) {
      return { ok: false, error: 'No image data in BytePlus response' };
    }

    // Entries can carry a per-image error instead of an image; take the first
    // one that produced something and only fail if none did.
    const item = response.data.find((d) => d.b64_json || d.url);

    if (!item) {
      const failed = response.data.find((d) => d.error);
      return {
        ok: false,
        error:
          failed?.error?.message ||
          (failed?.error?.code
            ? `BytePlus image error: ${failed.error.code}`
            : 'No image URL or base64 data in BytePlus response'),
      };
    }

    if (item.b64_json) {
      return { ok: true, imageBytes: Buffer.from(item.b64_json, 'base64') };
    }

    try {
      const res = await fetch(item.url!);
      if (!res.ok) {
        return {
          ok: false,
          error: `Failed to download BytePlus image: HTTP ${res.status}`,
        };
      }
      const arrayBuffer = await res.arrayBuffer();
      return { ok: true, imageBytes: Buffer.from(arrayBuffer) };
    } catch (e: any) {
      return { ok: false, error: `Download failed: ${e.message}` };
    }
  }
}

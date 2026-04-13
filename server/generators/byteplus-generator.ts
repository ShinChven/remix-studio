import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

type BytePlusImageResponse = {
  model?: string;
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
    size?: string;
    error?: { code?: string; message?: string };
  }>;
  usage?: {
    generated_images?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

/** Recommended pixel dimensions keyed by "quality|aspectRatio" for each model tier. */
const SIZE_MAP: Record<string, Record<string, string>> = {
  // seedream-5-0-lite supports 2K and 3K
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

/** Size map for seedream-3-0-t2i (only supports up to 2048x2048 total pixels). */
const SIZE_MAP_T2I: Record<string, string> = {
  '1:1': '1024x1024',
  '4:3': '1152x864',
  '3:4': '864x1152',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '3:2': '1248x832',
  '2:3': '832x1248',
  '21:9': '1512x648',
};

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

    try {
      const payload: Record<string, unknown> = {
        model,
        prompt: req.prompt,
        response_format: 'b64_json',
        watermark: false,
      };

      // Resolve size from quality + aspect ratio
      const size = this.resolveSize(model, req.aspectRatio, req.imageSize);
      if (size) {
        payload.size = size;
      }

      // Reference images for img2img (seedream 4.0/4.5/5.0-lite and seededit-3-0-i2i)
      if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
        if (req.refImagesBase64.length === 1) {
          payload.image = `data:image/png;base64,${req.refImagesBase64[0]}`;
        } else {
          payload.image = req.refImagesBase64.map(
            (b64) => `data:image/png;base64,${b64}`,
          );
        }
      } else if (req.refImageUrls && req.refImageUrls.length > 0) {
        if (req.refImageUrls.length === 1) {
          payload.image = req.refImageUrls[0];
        } else {
          payload.image = req.refImageUrls;
        }
      }

      // seedream-3-0-t2i and seededit-3-0-i2i support guidance_scale
      if (model === 'seedream-3-0-t2i-250415') {
        payload.guidance_scale = 2.5;
      } else if (model === 'seededit-3-0-i2i-250628') {
        payload.guidance_scale = 5.5;
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
    model: string,
    aspectRatio?: string,
    quality?: string,
  ): string | undefined {
    const ratio = aspectRatio || '1:1';

    // seedream-3-0-t2i has its own fixed size table
    if (model === 'seedream-3-0-t2i-250415') {
      return SIZE_MAP_T2I[ratio] || '1024x1024';
    }

    // seededit-3-0-i2i uses adaptive sizing (server-side), so don't send size
    if (model === 'seededit-3-0-i2i-250628') {
      return 'adaptive';
    }

    // For seedream 4.0/4.5/5.0-lite, use the quality-based resolution name
    // if it's a recognized quality tier (the API accepts "2K", "3K", "4K", "1K" directly)
    const normalizedQuality = (quality || '').toUpperCase();
    if (['1K', '2K', '3K', '4K'].includes(normalizedQuality)) {
      // Check if the model supports this quality tier
      if (model === 'seedream-5-0-260128' && ['2K', '3K'].includes(normalizedQuality)) {
        return SIZE_MAP[normalizedQuality]?.[ratio] || normalizedQuality;
      }
      if (model === 'seedream-4-5-251128' && ['2K', '4K'].includes(normalizedQuality)) {
        return SIZE_MAP[normalizedQuality]?.[ratio] || normalizedQuality;
      }
      if (model === 'seedream-4-0-250828' && ['1K', '2K', '4K'].includes(normalizedQuality)) {
        return SIZE_MAP[normalizedQuality]?.[ratio] || normalizedQuality;
      }
    }

    // Default: use 2K resolution with pixel dimensions
    const defaultMap = SIZE_MAP['2K'];
    return defaultMap?.[ratio] || '2048x2048';
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

    const item = response.data[0];

    // Check for per-image error
    if (item.error) {
      return {
        ok: false,
        error: item.error.message || `BytePlus image error: ${item.error.code}`,
      };
    }

    if (item.b64_json) {
      return { ok: true, imageBytes: Buffer.from(item.b64_json, 'base64') };
    }

    if (item.url) {
      try {
        const res = await fetch(item.url);
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

    return { ok: false, error: 'No image URL or base64 data in BytePlus response' };
  }
}

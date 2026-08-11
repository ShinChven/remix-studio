import sharp from 'sharp';
import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';
import {
  MINIMAX_DEFAULT_BASE_URL,
  miniMaxApiRoot,
  miniMaxBaseRespError,
  normalizeMiniMaxBaseUrl,
  type MiniMaxBaseResp,
} from '../utils/minimax';

type MiniMaxImageResponse = {
  id?: string;
  data?: {
    image_urls?: string[];
    image_base64?: string[];
  };
  metadata?: {
    success_count?: number | string;
    failed_count?: number | string;
  };
  base_resp?: MiniMaxBaseResp;
};

const DEFAULT_MODEL = 'image-01';

/**
 * image-01 renders from either `aspect_ratio` or an explicit `width`/`height`
 * pair, and `aspect_ratio` wins when both are sent. Explicit dimensions are the
 * only way to reach the larger tier, so the quality picker is resolved against
 * this table and the ratio field is left off. Every value sits inside the
 * documented [512, 2048] range and is divisible by 8.
 *
 * The 1K row is exactly what the API renders for each named `aspect_ratio`.
 */
const SIZE_MAP: Record<string, Record<string, [number, number]>> = {
  '1K': {
    '1:1': [1024, 1024],
    '16:9': [1280, 720],
    '4:3': [1152, 864],
    '3:2': [1248, 832],
    '2:3': [832, 1248],
    '3:4': [864, 1152],
    '9:16': [720, 1280],
    '21:9': [1344, 576],
  },
  '2K': {
    '1:1': [2048, 2048],
    '16:9': [2048, 1152],
    '4:3': [2048, 1536],
    '3:2': [2048, 1360],
    '2:3': [1360, 2048],
    '3:4': [1536, 2048],
    '9:16': [1152, 2048],
    '21:9': [2048, 880],
  },
};

const DEFAULT_QUALITY = '1K';
const DEFAULT_RATIO = '1:1';

/** Subject references must be JPG, JPEG or PNG; anything else is re-encoded. */
const SUBJECT_REFERENCE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

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

  return 'image/png';
}

export class MiniMaxGenerator extends ImageGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = apiUrl
      ? miniMaxApiRoot(normalizeMiniMaxBaseUrl(apiUrl), 'v1')
      : MINIMAX_DEFAULT_BASE_URL;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    try {
      const payload: Record<string, unknown> = {
        model,
        prompt: req.prompt,
        response_format: 'base64',
        n: 1,
        // The prompt is already composed by the workflow; rewriting it here
        // would make identical drafts render differently.
        prompt_optimizer: false,
      };

      const size = this.resolveSize(req.aspectRatio, req.imageSize);
      if (Array.isArray(size)) {
        payload.width = size[0];
        payload.height = size[1];
      } else {
        payload.aspect_ratio = size;
      }

      if (Number.isInteger(req.seed)) payload.seed = req.seed;

      const subjectReference = await this.resolveSubjectReference(req);
      if (subjectReference) payload.subject_reference = [subjectReference];

      const res = await fetch(`${this.baseUrl}/image_generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result = (await res.json()) as MiniMaxImageResponse;

      const baseRespError = miniMaxBaseRespError(result.base_resp);
      if (baseRespError) return { ok: false, error: baseRespError };

      return this.extractImage(result);
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  /**
   * Returns explicit dimensions when the ratio is one this model publishes, and
   * falls back to the named ratio otherwise (a custom model alias may accept a
   * ratio this table does not carry).
   */
  private resolveSize(aspectRatio?: string, quality?: string): [number, number] | string {
    const ratio = aspectRatio || DEFAULT_RATIO;
    const requested = (quality || '').trim().toUpperCase();
    const tier = SIZE_MAP[requested] ? requested : DEFAULT_QUALITY;

    return SIZE_MAP[tier][ratio] || ratio;
  }

  /**
   * image-01 takes a single `character` reference — a front-facing portrait —
   * rather than general image-to-image input, so only the first reference is
   * sent and the rest are dropped.
   */
  private async resolveSubjectReference(
    req: GenerateRequest,
  ): Promise<{ type: 'character'; image_file: string } | undefined> {
    const base64 = req.refImagesBase64?.[0];
    if (base64) {
      const mimeType = detectImageMimeType(base64);
      if (SUBJECT_REFERENCE_MIME_TYPES.has(mimeType)) {
        return { type: 'character', image_file: `data:${mimeType};base64,${base64}` };
      }

      // WebP and friends are rejected outright, so re-encode to PNG.
      const png = await sharp(Buffer.from(base64, 'base64')).png().toBuffer();
      return { type: 'character', image_file: `data:image/png;base64,${png.toString('base64')}` };
    }

    const url = req.refImageUrls?.[0];
    if (url && !url.startsWith('data:')) {
      return { type: 'character', image_file: url };
    }

    return undefined;
  }

  private async extractImage(result: MiniMaxImageResponse): Promise<GenerateResult> {
    const base64 = result.data?.image_base64?.[0];
    if (base64) {
      return { ok: true, imageBytes: Buffer.from(base64, 'base64') };
    }

    const url = result.data?.image_urls?.[0];
    if (!url) {
      const failed = Number(result.metadata?.failed_count || 0);
      return {
        ok: false,
        error: failed > 0
          ? 'MiniMax blocked the image for content safety'
          : 'No image data in MiniMax response',
      };
    }

    const imageRes = await fetch(url);
    if (!imageRes.ok) {
      return { ok: false, error: `Failed to download MiniMax image: HTTP ${imageRes.status}` };
    }

    return { ok: true, imageBytes: Buffer.from(await imageRes.arrayBuffer()) };
  }
}

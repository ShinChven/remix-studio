import {
  CheckStatusResult,
  GenerateRequest,
  GenerateResult,
  ImageGenerator,
} from './image-generator';

const DEFAULT_BASE_URL = 'https://api.bfl.ai';
const DEFAULT_MODEL = 'flux-2-pro-preview';
const MAX_INPUT_IMAGES = 8;

type BflSubmitResponse = {
  id?: string;
  polling_url?: string;
  cost?: number;
  input_mp?: number;
  output_mp?: number;
  detail?: unknown;
  error?: string;
};

type BflPollResponse = {
  id?: string;
  status?: 'Pending' | 'Processing' | 'Ready' | 'Error' | 'Failed' | 'Task not found' | string;
  result?: {
    sample?: string;
    [key: string]: unknown;
  } | null;
  error?: string;
  details?: unknown;
};

/**
 * Black Forest Labs FLUX API generator.
 * Docs: https://docs.bfl.ai/
 *
 * Async flow: POST /v1/{model} -> { id, polling_url }, then GET polling_url until
 * status === "Ready". The returned `result.sample` is a signed delivery URL that
 * must be downloaded within 10 minutes.
 */
export class BlackForestLabsGenerator extends ImageGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    try {
      const payload = this.buildPayload(req, model);
      const response = await fetch(`${this.baseUrl}/v1/${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: {
          'x-key': this.apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `HTTP ${response.status}: ${text}` };
      }

      const data = (await response.json()) as BflSubmitResponse;
      if (!data.polling_url) {
        return { ok: false, error: 'BFL API did not return a polling_url' };
      }

      return { ok: true, status: 'processing', taskId: data.polling_url };
    } catch (e: any) {
      console.error('[BlackForestLabsGenerator] Error:', e);
      return { ok: false, error: e?.message || 'BFL image generation failed' };
    }
  }

  async checkStatus(taskId: string): Promise<CheckStatusResult> {
    try {
      const pollingUrl = taskId.startsWith('http') ? taskId : `${this.baseUrl}/v1/get_result?id=${encodeURIComponent(taskId)}`;
      const response = await fetch(pollingUrl, {
        method: 'GET',
        headers: {
          'x-key': this.apiKey,
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'failed', error: `BFL task not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const data = (await response.json()) as BflPollResponse;
      const status = (data.status || '').toLowerCase();

      if (status === 'pending' || status === 'processing' || status === 'request moderated' || status === 'content moderated') {
        if (status.includes('moderated')) {
          return { status: 'failed', error: `BFL moderation: ${data.status}` };
        }
        return { status: 'processing' };
      }

      if (status === 'error' || status === 'failed' || status === 'task not found') {
        const details = typeof data.details === 'string' ? data.details : JSON.stringify(data.details || {});
        return { status: 'failed', error: data.error || details || `BFL task ${data.status}` };
      }

      if (status === 'ready') {
        const sampleUrl = data.result?.sample;
        if (!sampleUrl) {
          return { status: 'failed', error: 'BFL task Ready but no result.sample URL' };
        }

        const imgRes = await fetch(sampleUrl);
        if (!imgRes.ok) {
          return { status: 'failed', error: `Failed to download BFL image: HTTP ${imgRes.status}` };
        }
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        return { status: 'completed', imageBytes: buffer };
      }

      return { status: 'processing' };
    } catch (e: any) {
      console.error('[BlackForestLabsGenerator] checkStatus error:', e);
      return { status: 'processing' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');
      if (pathname.endsWith('/v1')) {
        pathname = pathname.slice(0, -3);
      }
      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private buildPayload(req: GenerateRequest, model: string): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: req.prompt,
      output_format: 'jpeg',
    };

    const dims = this.resolveDimensions(req.aspectRatio, req.imageSize);
    if (dims) {
      payload.width = dims.width;
      payload.height = dims.height;
    }

    if (typeof req.seed === 'number') payload.seed = req.seed;
    if (typeof req.promptUpsampling === 'boolean') payload.prompt_upsampling = req.promptUpsampling;

    // Flex-only parameters
    if (model === 'flux-2-flex') {
      if (typeof req.steps === 'number') payload.steps = req.steps;
      if (typeof req.guidance === 'number') payload.guidance = req.guidance;
    }

    const refs = this.resolveInputImages(req);
    if (refs.length > 0) {
      payload.input_image = refs[0];
      for (let i = 1; i < refs.length; i++) {
        payload[`input_image_${i + 1}`] = refs[i];
      }
    }

    return payload;
  }

  private resolveInputImages(req: GenerateRequest): string[] {
    const base64 = (req.refImagesBase64 || []).filter((b) => typeof b === 'string' && b.length > 0);
    if (base64.length > 0) {
      // Prefer inline image data over URLs because BFL fetches URL inputs from their
      // own infrastructure, which breaks on local/private/presigned storage hosts.
      return base64
        .slice(0, MAX_INPUT_IMAGES)
        .map((b) => (b.startsWith('data:') ? b : `data:image/png;base64,${b}`));
    }

    const urls = (req.refImageUrls || []).filter((u) => typeof u === 'string' && u.length > 0);
    return urls.slice(0, MAX_INPUT_IMAGES);
  }

  /**
   * Convert (aspectRatio, quality) -> pixel dims aligned to multiples of 16.
   * quality values look like "0.25 MP", "1 MP", "2 MP", "4 MP".
   * aspectRatio "match_input_image" means leave dims unset so BFL matches the input.
   */
  private resolveDimensions(aspectRatio?: string, quality?: string): { width: number; height: number } | null {
    const ratio = aspectRatio && aspectRatio !== 'match_input_image' ? aspectRatio : null;
    if (!ratio) return null;

    const mp = this.parseMegapixels(quality);
    const [wRatio, hRatio] = this.parseAspectRatio(ratio);
    if (!wRatio || !hRatio) return null;

    const area = mp * 1_000_000;
    const hExact = Math.sqrt((area * hRatio) / wRatio);
    const wExact = (area / hExact);

    const width = Math.max(64, this.roundTo16(wExact));
    const height = Math.max(64, this.roundTo16(hExact));
    return { width, height };
  }

  private parseMegapixels(quality?: string): number {
    if (!quality) return 1;
    const match = quality.match(/([0-9]*\.?[0-9]+)/);
    if (!match) return 1;
    const mp = parseFloat(match[1]);
    if (!Number.isFinite(mp) || mp <= 0) return 1;
    // Clamp to BFL's 4MP ceiling
    return Math.min(mp, 4);
  }

  private parseAspectRatio(ratio: string): [number, number] {
    const parts = ratio.split(':');
    if (parts.length !== 2) return [0, 0];
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return [0, 0];
    return [w, h];
  }

  private roundTo16(value: number): number {
    return Math.max(16, Math.round(value / 16) * 16);
  }
}

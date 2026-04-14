import {
  ImageGenerator,
  GenerateRequest,
  GenerateResult,
  CheckStatusResult,
} from './image-generator';

const DEFAULT_BASE = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'black-forest-labs/flux-1.1-pro';

type ReplicatePrediction = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: string | null;
};

export class ReplicateGenerator extends ImageGenerator {
  private apiKey: string;
  private base: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.base = this.normalizeBase(apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    try {
      const bodyInput = await this.buildInput(req);
      const response = await fetch(`${this.base}/predictions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: model,
          input: bodyInput,
        }),
        // @ts-ignore
        timeout: 180_000,
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `HTTP ${response.status}: ${text}` };
      }

      const prediction = await response.json() as ReplicatePrediction;
      if (!prediction.id) {
        return { ok: false, error: 'No prediction id in Replicate response' };
      }

      if (this.isSucceeded(prediction.status)) {
        const completed = await this.toCompletedResult(prediction.output);
        if (completed.ok) return completed;
      }

      if (this.isFailed(prediction.status)) {
        return { ok: false, error: prediction.error || 'Replicate prediction failed' };
      }

      return { ok: true, status: 'processing', taskId: prediction.id };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<CheckStatusResult> {
    try {
      const response = await fetch(`${this.base}/predictions/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        // @ts-ignore
        timeout: 60_000,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'failed', error: `Replicate prediction not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const prediction = await response.json() as ReplicatePrediction;

      if (this.isFailed(prediction.status)) {
        return { status: 'failed', error: prediction.error || 'Replicate prediction failed' };
      }

      if (!this.isSucceeded(prediction.status)) {
        return { status: 'processing' };
      }

      const completed = await this.toCompletedResult(prediction.output);
      if (completed.ok && completed.imageBytes) {
        return {
          status: 'completed',
          imageBytes: completed.imageBytes,
        };
      }

      if (!completed.ok) {
        return { status: 'failed', error: 'error' in completed ? completed.error : 'Replicate prediction failed' };
      }

      return { status: 'failed', error: 'Replicate prediction succeeded but returned no image bytes' };
    } catch {
      return { status: 'processing' };
    }
  }

  private normalizeBase(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');

      if (!pathname || pathname === '/') {
        pathname = '/v1';
      } else if (!pathname.endsWith('/v1')) {
        pathname = `${pathname}/v1`.replace(/\/+/g, '/');
      }

      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE;
    }
  }

  private async buildInput(req: GenerateRequest) {
    const input: Record<string, unknown> = {
      prompt: req.prompt,
    };

    if (req.aspectRatio) input.aspect_ratio = req.aspectRatio;
    if (req.imageSize) input.resolution = req.imageSize;
    if (typeof req.seed === 'number') input.seed = req.seed;
    if (typeof req.steps === 'number') input.steps = req.steps;
    if (typeof req.guidance === 'number') input.guidance = req.guidance;
    if (typeof req.promptUpsampling === 'boolean') input.prompt_upsampling = req.promptUpsampling;

    const imageRefs = await this.resolveImageReferences(req);
    if (imageRefs.length > 0) {
      // Flux 2 Pro supports up to 8, Flex supports up to 10
      input.input_images = imageRefs.slice(0, 10);
    }

    // Default settings
    input.output_format = 'webp';
    input.output_quality = 80;

    return input;
  }

  private async resolveImageReferences(req: GenerateRequest): Promise<string[]> {
    if (req.refImageUrls && req.refImageUrls.length > 0) {
      const resolved = await Promise.all(
        req.refImageUrls.map((url) => this.ensurePublicUrl(url))
      );
      return resolved;
    }

    if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
      return req.refImagesBase64.map((item) => `data:image/png;base64,${item}`);
    }

    return [];
  }

  private async ensurePublicUrl(url: string): Promise<string> {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const mimeType = response.headers.get('content-type') || 'image/jpeg';
          return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
        }
      }
    } catch {
      // Fallback to original URL
    }
    return url;
  }

  private isSucceeded(status?: string) {
    return status === 'succeeded';
  }

  private isFailed(status?: string) {
    return status === 'failed' || status === 'canceled';
  }

  private extractOutputUrl(output: unknown): string | null {
    if (typeof output === 'string' && output) return output;
    if (Array.isArray(output)) {
      const firstString = output.find((item) => typeof item === 'string');
      return typeof firstString === 'string' ? firstString : null;
    }
    if (output && typeof output === 'object') {
      const candidate = (output as Record<string, unknown>).url;
      return typeof candidate === 'string' ? candidate : null;
    }
    return null;
  }

  private async toCompletedResult(output: unknown): Promise<GenerateResult> {
    const url = this.extractOutputUrl(output);
    if (!url) {
      return { ok: false, error: 'Replicate prediction succeeded but no image URL was returned' };
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      // @ts-ignore
      timeout: 300_000,
    } as any);

    if (!response.ok) {
      return { ok: false, error: `Failed to download Replicate image: HTTP ${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      ok: true,
      status: 'completed',
      imageBytes: Buffer.from(arrayBuffer),
    };
  }
}

import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'bytedance/seedance-2.0-fast';

type ReplicatePrediction = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: string | null;
};

export class ReplicateVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private base: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.base = this.normalizeBase(apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
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

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
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
      if (completed.ok && completed.videoBytes) {
        return {
          status: 'completed',
          videoBytes: completed.videoBytes,
          mimeType: completed.mimeType,
        };
      }

      if (!completed.ok) {
        return { status: 'failed', error: 'error' in completed ? completed.error : 'Replicate prediction failed' };
      }

      return { status: 'failed', error: 'Replicate prediction succeeded but returned no video bytes' };
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

  private async buildInput(req: VideoGenerateRequest) {
    const input: Record<string, unknown> = {
      prompt: req.prompt,
      generate_audio: (req.sound || 'on') === 'on',
    };

    if (typeof req.duration === 'number') input.duration = req.duration;
    if (req.resolution) input.resolution = req.resolution;
    if (req.aspectRatio) input.aspect_ratio = req.aspectRatio;
    if (typeof req.seed === 'number') input.seed = req.seed;

    const imageRefs = await this.resolveImageReferences(req);
    if (imageRefs.length === 1) {
      input.image = imageRefs[0];
    } else if (imageRefs.length > 1) {
      input.reference_images = imageRefs.slice(0, 9);
    }

    if (req.refVideoUrls && req.refVideoUrls.length > 0) {
      input.reference_videos = req.refVideoUrls.slice(0, 3);
    }

    if (req.refAudioUrls && req.refAudioUrls.length > 0) {
      if (imageRefs.length === 0 && (!req.refVideoUrls || req.refVideoUrls.length === 0)) {
        throw new Error('Seedance reference audio requires at least one reference image or video');
      }
      input.reference_audios = req.refAudioUrls.slice(0, 3);
    }

    return input;
  }

  private async resolveImageReferences(req: VideoGenerateRequest): Promise<string[]> {
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

  private async toCompletedResult(output: unknown): Promise<VideoGenerateResult> {
    const url = this.extractOutputUrl(output);
    if (!url) {
      return { ok: false, error: 'Replicate prediction succeeded but no video URL was returned' };
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      // @ts-ignore
      timeout: 300_000,
    } as any);

    if (!response.ok) {
      return { ok: false, error: `Failed to download Replicate video: HTTP ${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      ok: true,
      status: 'completed',
      videoBytes: Buffer.from(arrayBuffer),
      mimeType: response.headers.get('content-type') || 'video/mp4',
    };
  }
}

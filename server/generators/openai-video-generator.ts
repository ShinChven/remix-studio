import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'sora-2';

/**
 * OpenAI Sora 2 video generator.
 *
 * Flow:
 *   1. POST {base}/videos
 *        - text-only:   JSON { model, prompt, size, seconds }
 *        - image-input: multipart with input_reference file + prompt + model + size + seconds
 *      → returns { id, status }
 *   2. GET  {base}/videos/{id}                → status: queued/in_progress/completed/failed
 *   3. GET  {base}/videos/{id}/content        → binary mp4 bytes
 */
export class OpenAIVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private base: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.base = this.normalizeBase(apiUrl);
  }

  private normalizeBase(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE;
    const trimmed = apiUrl.replace(/\/$/, '');
    if (trimmed.endsWith('/v1')) return trimmed;
    // If user just provided a host, append /v1.
    try {
      const u = new URL(trimmed);
      if (!u.pathname || u.pathname === '/' || u.pathname === '') {
        return `${u.protocol}//${u.host}/v1`;
      }
      return trimmed;
    } catch {
      return DEFAULT_BASE;
    }
  }

  /** Convert our aspectRatio + resolution into the `size` string Sora expects. */
  private deriveSize(aspectRatio?: string, resolution?: string): string | undefined {
    if (!aspectRatio && !resolution) return undefined;
    const res = (resolution || '720p').toLowerCase();
    const ar = aspectRatio || '16:9';

    // Resolution → pixel dimensions
    const dims: Record<string, { long: number; short: number }> = {
      '720p': { long: 1280, short: 720 },
      '1080p': { long: 1920, short: 1080 },
    };
    const d = dims[res] || dims['720p'];

    if (ar === '16:9') return `${d.long}x${d.short}`;
    if (ar === '9:16') return `${d.short}x${d.long}`;
    if (ar === '1:1') return `${d.short}x${d.short}`;
    return `${d.long}x${d.short}`;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;
    const size = this.deriveSize(req.aspectRatio, req.resolution);
    const seconds = req.duration ? String(req.duration) : undefined;

    try {
      let res: Response;

      if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
        // Multipart with input_reference.
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', req.prompt);
        if (size) form.append('size', size);
        if (seconds) form.append('seconds', seconds);

        const refBuf = Buffer.from(req.refImagesBase64[0], 'base64');
        const blob = new Blob([new Uint8Array(refBuf)], { type: 'image/png' });
        form.append('input_reference', blob, 'input_reference.png');

        res = await fetch(`${this.base}/videos`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: form as any,
          // @ts-ignore
          timeout: 180_000,
        });
      } else {
        const payload: Record<string, unknown> = {
          model,
          prompt: req.prompt,
        };
        if (size) payload.size = size;
        if (seconds) payload.seconds = seconds;

        res = await fetch(`${this.base}/videos`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          // @ts-ignore
          timeout: 180_000,
        });
      }

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result: any = await res.json();
      const id: string | undefined = result.id;
      if (!id) return { ok: false, error: 'No video id in OpenAI response' };

      return { ok: true, status: 'processing', taskId: id };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const statusRes = await fetch(`${this.base}/videos/${taskId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        // @ts-ignore
        timeout: 60_000,
      });

      if (!statusRes.ok) {
        if (statusRes.status === 404) {
          return { status: 'failed', error: `Video job not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result: any = await statusRes.json();
      const status: string = result.status || '';

      if (status === 'failed') {
        const err = result.error?.message || result.error || 'OpenAI video generation failed';
        return { status: 'failed', error: typeof err === 'string' ? err : JSON.stringify(err) };
      }

      if (status !== 'completed') {
        // queued, in_progress, etc.
        return { status: 'processing' };
      }

      // Download mp4 bytes.
      const contentRes = await fetch(`${this.base}/videos/${taskId}/content`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        // @ts-ignore
        timeout: 300_000,
      });

      if (!contentRes.ok) {
        return {
          status: 'failed',
          error: `Failed to download generated video: HTTP ${contentRes.status}`,
        };
      }

      const arrayBuffer = await contentRes.arrayBuffer();
      return {
        status: 'completed',
        videoBytes: Buffer.from(arrayBuffer),
        mimeType: 'video/mp4',
      };
    } catch (e: any) {
      return { status: 'processing' };
    }
  }
}

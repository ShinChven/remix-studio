import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

type BytePlusTaskResponse = {
  id?: string;
  model?: string;
  status?: string;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type BytePlusContentItem =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
      role?: 'first_frame' | 'last_frame' | 'reference_image';
    };

const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_MODEL = 'seedance-1-5-pro-251215';

export class BytePlusVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    try {
      const content = this.buildContent(model, req);
      const payload: Record<string, unknown> = {
        model,
        content,
      };

      if (req.aspectRatio) payload.ratio = req.aspectRatio;
      if (req.resolution) payload.resolution = req.resolution;
      if (typeof req.duration === 'number') payload.duration = req.duration;
      if (model === 'seedance-1-5-pro-251215') payload.generate_audio = true;

      const res = await fetch(`${this.baseUrl}/contents/generations/tasks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // @ts-ignore
        timeout: 180_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result = await res.json() as BytePlusTaskResponse;
      if (result.error) {
        return {
          ok: false,
          error: result.error.message || `BytePlus error: ${result.error.code || 'unknown_error'}`,
        };
      }

      if (!result.id) {
        return { ok: false, error: 'No task id in BytePlus video response' };
      }

      return { ok: true, status: 'processing', taskId: result.id };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const res = await fetch(`${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        // @ts-ignore
        timeout: 60_000,
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { status: 'failed', error: `BytePlus video task not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result = await res.json() as BytePlusTaskResponse;
      const status = (result.status || '').toLowerCase();

      if (result.error || ['failed', 'expired', 'cancelled', 'canceled'].includes(status)) {
        const err = result.error?.message || `BytePlus video generation ${status || 'failed'}`;
        return { status: 'failed', error: err };
      }

      if (!['succeeded', 'completed', 'done'].includes(status)) {
        return { status: 'processing' };
      }

      const videoUrl = result.content?.video_url;
      if (!videoUrl) {
        return { status: 'failed', error: 'BytePlus task succeeded but no video URL was returned' };
      }

      const videoRes = await fetch(videoUrl, {
        // @ts-ignore
        timeout: 300_000,
      } as any);
      if (!videoRes.ok) {
        return {
          status: 'failed',
          error: `Failed to download BytePlus video: HTTP ${videoRes.status}`,
        };
      }

      const arrayBuffer = await videoRes.arrayBuffer();
      return {
        status: 'completed',
        videoBytes: Buffer.from(arrayBuffer),
        mimeType: 'video/mp4',
      };
    } catch {
      return { status: 'processing' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');

      if (pathname.endsWith('/contents/generations/tasks')) {
        pathname = pathname.slice(0, -'/contents/generations/tasks'.length);
      }

      if (!pathname.endsWith('/api/v3')) {
        pathname = pathname.replace(/\/$/, '') + '/api/v3';
      }

      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private buildContent(model: string, req: VideoGenerateRequest): BytePlusContentItem[] {
    const content: BytePlusContentItem[] = [];
    const prompt = (req.prompt || '').trim();
    if (prompt) {
      content.push({ type: 'text', text: prompt });
    }

    const imageUrls = this.resolveImageUrls(req);
    if (imageUrls.length === 0) {
      if (!prompt) throw new Error('BytePlus video generation requires a prompt or at least one reference image');
      return content;
    }

    if (imageUrls.length === 1) {
      content.push(this.createImageItem(imageUrls[0], 'first_frame'));
      return content;
    }

    if (imageUrls.length === 2 && model !== 'seedance-1-0-pro-fast-251015') {
      content.push(this.createImageItem(imageUrls[0], 'first_frame'));
      content.push(this.createImageItem(imageUrls[1], 'last_frame'));
      return content;
    }

    if (model !== 'seedance-1-0-lite-i2v-250428') {
      throw new Error(`${model} does not support more than two input images`);
    }

    for (const url of imageUrls.slice(0, 4)) {
      content.push(this.createImageItem(url, 'reference_image'));
    }

    return content;
  }

  private createImageItem(
    url: string,
    role: 'first_frame' | 'last_frame' | 'reference_image',
  ): BytePlusContentItem {
    return {
      type: 'image_url',
      image_url: { url },
      role,
    };
  }

  private resolveImageUrls(req: VideoGenerateRequest): string[] {
    if (req.refImageUrls && req.refImageUrls.length > 0) {
      return req.refImageUrls;
    }

    if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
      return req.refImagesBase64.map((b64) => `data:image/png;base64,${b64}`);
    }

    return [];
  }
}

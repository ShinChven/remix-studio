import jwt from 'jsonwebtoken';
import {
  VideoCheckStatusResult,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoGenerator,
} from './video-generator';

type KlingVideoTaskResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{
        id?: string;
        url?: string;
        watermark_url?: string;
        duration?: string;
      }>;
    };
  };
};

const DEFAULT_BASE_URL = 'https://api-singapore.klingai.com';
const DEFAULT_MODEL = 'kling-video-o1';

export class KlingAIVideoGenerator extends VideoGenerator {
  private accessKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(accessKey: string, secretKey: string, apiUrl?: string) {
    super();
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    try {
      const payload = this.buildPayload(req);
      const response = await this.request('/v1/videos/omni-video', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const taskId = response.data?.task_id;
      if (!taskId) {
        return { ok: false, error: 'Kling AI did not return a task_id' };
      }

      return { ok: true, status: 'processing', taskId };
    } catch (e: any) {
      console.error('[KlingAIVideoGenerator] Error:', e);
      return { ok: false, error: e?.message || 'Kling AI video generation failed' };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const response = await this.request(`/v1/videos/omni-video/${encodeURIComponent(taskId)}`, {
        method: 'GET',
      });

      const status = response.data?.task_status;
      if (status === 'submitted' || status === 'processing') {
        return { status: 'processing' };
      }

      if (status === 'failed') {
        return {
          status: 'failed',
          error: response.data?.task_status_msg || response.message || 'Kling AI video task failed',
        };
      }

      if (status === 'succeed') {
        const url = response.data?.task_result?.videos?.[0]?.url;
        if (!url) {
          return { status: 'failed', error: 'Kling AI task succeeded but returned no video URL' };
        }

        const videoRes = await fetch(url);
        if (!videoRes.ok) {
          return {
            status: 'failed',
            error: `Failed to download Kling AI video: HTTP ${videoRes.status}`,
          };
        }

        const arrayBuffer = await videoRes.arrayBuffer();
        return {
          status: 'completed',
          videoBytes: Buffer.from(arrayBuffer),
          mimeType: 'video/mp4',
        };
      }

      return { status: 'processing' };
    } catch {
      return { status: 'processing' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');
      pathname = pathname.replace(/\/v1\/videos\/omni-video$/, '');
      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private buildPayload(req: VideoGenerateRequest) {
    const prompt = (req.prompt || '').trim();
    const images = this.normalizeReferenceImages(req);

    if (!prompt) {
      throw new Error('Kling AI video generation requires a prompt');
    }

    const payload: Record<string, unknown> = {
      model_name: req.modelId || DEFAULT_MODEL,
      prompt,
      mode: 'pro',
      sound: req.sound || 'on',
    };

    if (req.aspectRatio) {
      payload.aspect_ratio = req.aspectRatio;
    }

    if (typeof req.duration === 'number') {
      payload.duration = String(req.duration);
    }

    if (images.length > 0) {
      payload.image_list = images.map((imageUrl) => ({ image_url: imageUrl }));
    }

    return payload;
  }

  private normalizeReferenceImages(req: VideoGenerateRequest): string[] {
    const result: string[] = [];

    for (const base64 of req.refImagesBase64 || []) {
      const normalized = this.normalizeImageBase64Value(base64);
      if (normalized) {
        result.push(normalized);
      }
    }

    // Prefer inline base64 for Kling video. Queue preparation already downloads
    // remote/storage references, which avoids provider-side URL fetching issues.
    if (result.length > 0) {
      return result.slice(0, 4);
    }

    for (const url of req.refImageUrls || []) {
      const normalized = this.normalizeImageUrlValue(url);
      if (normalized) {
        result.push(normalized);
      }
    }

    return result.slice(0, 4);
  }

  private normalizeImageUrlValue(value: string | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('data:')) {
      return trimmed.replace(/\s+/g, '');
    }

    return trimmed;
  }

  // Kling omni-video accepts either a URL or base64 in image_url. For the
  // inline branch we must send raw base64 bytes, not a data URI wrapper.
  private normalizeImageBase64Value(value: string | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('data:')) {
      return trimmed.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    }

    return trimmed.replace(/\s+/g, '');
  }

  private async request(path: string, init: RequestInit): Promise<KlingVideoTaskResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.createApiToken()}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    let json: KlingVideoTaskResponse;

    try {
      json = text ? (JSON.parse(text) as KlingVideoTaskResponse) : {};
    } catch {
      throw new Error(`Kling AI returned non-JSON response: HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(
        json.message
          ? `HTTP ${response.status}: ${json.message}`
          : `HTTP ${response.status}: ${text}`,
      );
    }

    if ((json.code ?? 0) !== 0) {
      throw new Error(json.message || `Kling AI error code ${json.code}`);
    }

    return json;
  }

  private createApiToken() {
    if (!this.accessKey || !this.secretKey) {
      throw new Error('Kling AI requires both access key and secret key');
    }

    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: this.accessKey,
        exp: now + 1800,
        nbf: now - 5,
      },
      this.secretKey,
      {
        algorithm: 'HS256',
        header: {
          alg: 'HS256',
          typ: 'JWT',
        },
      },
    );
  }
}

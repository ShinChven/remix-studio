import {
  CheckStatusResult,
  GenerateRequest,
  GenerateResult,
  ImageGenerator,
} from './image-generator';
import jwt from 'jsonwebtoken';

type KlingTaskResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    task_result?: {
      result_type?: 'single' | 'series';
      images?: Array<{ index?: number; url?: string; watermark_url?: string }>;
      series_images?: Array<{ index?: number; url?: string; watermark_url?: string }>;
    };
  };
};

const DEFAULT_BASE_URL = 'https://api-singapore.klingai.com';
const DEFAULT_MODEL = 'kling-image-o1';

export class KlingAIGenerator extends ImageGenerator {
  private accessKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(accessKey: string, secretKey: string, apiUrl?: string) {
    super();
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const isOmni = this.isOmniModel(req.modelId);
      const urlPath = isOmni ? '/v1/images/omni-image' : '/v1/images/generations';
      const payload = this.buildPayload(req, isOmni);
      
      const response = await this.request(urlPath, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const taskId = response.data?.task_id;
      if (!taskId) {
        return { ok: false, error: 'Kling AI did not return a task_id' };
      }

      // Add a transport-layer prefix so checkStatus knows which endpoint to pole
      const prefixedTaskId = `${isOmni ? 'omni:' : 'std:'}${taskId}`;

      return { ok: true, status: 'processing', taskId: prefixedTaskId };
    } catch (e: any) {
      console.error('[KlingAIGenerator] Error:', e);
      return { ok: false, error: e?.message || 'Kling AI image generation failed' };
    }
  }

  async checkStatus(taskId: string): Promise<CheckStatusResult> {
    try {
      const isOmni = taskId.startsWith('omni:');
      const isStd = taskId.startsWith('std:');
      let actualTaskId = taskId;
      let urlPath = '/v1/images/omni-image/';
      
      if (isOmni) {
         actualTaskId = taskId.slice(5);
         urlPath = '/v1/images/omni-image/';
      } else if (isStd) {
         actualTaskId = taskId.slice(4);
         urlPath = '/v1/images/generations/';
      } else {
         // Fallback for older existing tasks without prefixes
         urlPath = '/v1/images/omni-image/';
      }
      
      const response = await this.request(`${urlPath}${encodeURIComponent(actualTaskId)}`, {
        method: 'GET',
      });

      const status = response.data?.task_status;
      if (status === 'submitted' || status === 'processing') {
        return { status: 'processing' };
      }

      if (status === 'failed') {
        return {
          status: 'failed',
          error: response.data?.task_status_msg || response.message || 'Kling AI task failed',
        };
      }

      if (status === 'succeed') {
        const result = response.data?.task_result;
        const url =
          result?.images?.[0]?.url ||
          result?.series_images?.[0]?.url;

        if (!url) {
          return { status: 'failed', error: 'Kling AI task succeeded but returned no image URL' };
        }

        const imageRes = await fetch(url);
        if (!imageRes.ok) {
          return {
            status: 'failed',
            error: `Failed to download Kling AI image: HTTP ${imageRes.status}`,
          };
        }

        const arrayBuffer = await imageRes.arrayBuffer();
        return { status: 'completed', imageBytes: Buffer.from(arrayBuffer) };
      }

      return { status: 'processing' };
    } catch (e: any) {
      return { status: 'processing' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    const parsed = new URL(apiUrl);
    let pathname = parsed.pathname.replace(/\/$/, '');
    pathname = pathname.replace(/\/v1\/images\/omni-image$/, '');
    pathname = pathname.replace(/\/v1\/images\/generations$/, '');
    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  private isOmniModel(modelId?: string): boolean {
    if (!modelId) return true; // Default DEFAULT_MODEL is kling-image-o1
    return modelId.includes('omni') || modelId === 'kling-image-o1';
  }

  private buildPayload(req: GenerateRequest, isOmni: boolean) {
    const payload: Record<string, unknown> = {
      model_name: req.modelId || DEFAULT_MODEL,
      prompt: req.prompt,
      n: 1,
    };

    if (req.imageSize) {
      payload.resolution = this.normalizeResolution(req.imageSize);
    }
    
    if (req.aspectRatio) {
      payload.aspect_ratio = req.aspectRatio;
    }

    if (isOmni) {
      payload.result_type = 'single';
      if (!payload.aspect_ratio) {
        payload.aspect_ratio = 'auto'; // omni default
      }
    } else {
      if (!payload.aspect_ratio) {
        payload.aspect_ratio = '16:9'; // standard default fallback
      }
    }

    const images = this.normalizeReferenceImages(req);
    if (images.length > 0) {
      if (isOmni) {
        payload.image_list = images.map((image) => ({ image }));
      } else {
        payload.image = images[0]; // standard takes a single image
      }
    }

    return payload;
  }

  private normalizeResolution(imageSize?: string) {
    const normalized = (imageSize || '1K').toLowerCase();
    if (normalized === '2k' || normalized === '4k') return normalized;
    return '1k';
  }

  private normalizeReferenceImages(req: GenerateRequest): string[] {
    const result: string[] = [];

    for (const base64 of req.refImagesBase64 || []) {
      const normalized = this.normalizeImageValue(base64);
      if (normalized) {
        result.push(normalized);
      }
    }

    // Prefer inline base64 for Kling. In this app, queue preparation already
    // downloads storage/remote references and gives us stable base64 strings,
    // which avoids failures from provider-side URL fetching.
    if (result.length > 0) {
      return result;
    }

    for (const url of req.refImageUrls || []) {
      const normalized = this.normalizeImageValue(url);
      if (normalized) {
        result.push(normalized);
      }
    }

    return result;
  }

  private normalizeImageValue(value: string | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('data:')) {
      return trimmed.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    }

    return trimmed.replace(/\s+/g, '');
  }

  private async request(path: string, init: RequestInit): Promise<KlingTaskResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.createApiToken()}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    let json: KlingTaskResponse;

    try {
      json = text ? (JSON.parse(text) as KlingTaskResponse) : {};
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

import {
  CheckStatusResult,
  GenerateRequest,
  GenerateResult,
  ImageGenerator,
} from './image-generator';

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
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const payload = this.buildPayload(req);
      const response = await this.request('/v1/images/omni-image', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const taskId = response.data?.task_id;
      if (!taskId) {
        return { ok: false, error: 'Kling AI did not return a task_id' };
      }

      return { ok: true, status: 'processing', taskId };
    } catch (e: any) {
      console.error('[KlingAIGenerator] Error:', e);
      return { ok: false, error: e?.message || 'Kling AI image generation failed' };
    }
  }

  async checkStatus(taskId: string): Promise<CheckStatusResult> {
    try {
      const response = await this.request(`/v1/images/omni-image/${encodeURIComponent(taskId)}`, {
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
    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  private buildPayload(req: GenerateRequest) {
    const payload: Record<string, unknown> = {
      model_name: req.modelId || DEFAULT_MODEL,
      prompt: req.prompt,
      resolution: this.normalizeResolution(req.imageSize),
      aspect_ratio: req.aspectRatio || 'auto',
      n: 1,
      result_type: 'single',
    };

    const images = this.normalizeReferenceImages(req);
    if (images.length > 0) {
      payload.image_list = images.map((image) => ({ image }));
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

    for (const url of req.refImageUrls || []) {
      if (url.startsWith('data:')) {
        result.push(url.replace(/^data:image\/\w+;base64,/, ''));
      } else {
        result.push(url);
      }
    }

    if (result.length > 0) {
      return result;
    }

    for (const base64 of req.refImagesBase64 || []) {
      result.push(base64);
    }

    return result;
  }

  private async request(path: string, init: RequestInit): Promise<KlingTaskResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
}

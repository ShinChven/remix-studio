import {
  CheckStatusContext,
  CheckStatusResult,
  GenerateRequest,
  GenerateResult,
  ImageGenerator,
} from './image-generator';

const DEFAULT_BASE_URL = 'https://api.apimart.ai/v1';
const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';

const GPT_IMAGE_RESOLUTIONS = ['1k', '2k', '4k'];
const GPT_IMAGE_25_QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];
const GPT_IMAGE_2_QUALITIES = ['low', 'medium', 'high'];

type APIMartSubmitResponse = {
  code?: number;
  message?: string;
  error?: { code?: string | number; message?: string } | string;
  task_id?: string;
  data?:
    | Array<{
        status?: string;
        task_id?: string;
        url?: string;
        b64_json?: string;
      }>
    | {
        status?: string;
        task_id?: string;
        id?: string;
        url?: string;
        b64_json?: string;
      };
};

type APIMartTaskResponse = {
  code?: number;
  message?: string;
  error?: { code?: string | number; message?: string } | string;
  id?: string;
  task_id?: string;
  status?: string;
  result?: {
    url?: string | string[];
    images?: Array<string | { url?: string | string[] }>;
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  data?: {
    id?: string;
    task_id?: string;
    status?: string;
    error?: { code?: string | number; message?: string } | string;
    url?: string | string[];
    result?: {
      url?: string | string[];
      images?: Array<string | { url?: string | string[] }>;
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    data?: Array<{ url?: string; b64_json?: string }>;
  };
};

function resolveTieredSize(
  imageSize: string | undefined,
  qualities: string[],
  defaultQuality: string,
): { resolution: string; quality: string } {
  const parts = (imageSize || '').toLowerCase().split(/[\s_/-]+/).filter(Boolean);
  return {
    resolution: parts.find((p) => GPT_IMAGE_RESOLUTIONS.includes(p)) || '1k',
    quality: parts.find((p) => qualities.includes(p)) || defaultQuality,
  };
}

function isGptImage25(model: string): boolean {
  return model.toLowerCase().includes('gpt-image-2.5');
}

function isGptImage2Official(model: string): boolean {
  return model.toLowerCase().includes('gpt-image-2-official');
}

function isGptImage2(model: string): boolean {
  const lower = model.toLowerCase();
  return lower === 'gpt-image-2' || lower.startsWith('gpt-image-2-');
}

function omitsResolution(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower === 'gpt-4o-image' ||
    lower.startsWith('flux-kontext') ||
    lower.startsWith('gemini-2.5-flash-image') ||
    lower === 'nano-banana' ||
    lower === 'nano-banana-ext'
  );
}

export class APIMartGenerator extends ImageGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      pathname = pathname
        .replace(/\/v1\/images\/generations$/i, '/v1')
        .replace(/\/images\/generations$/i, '')
        .replace(/\/v1\/tasks$/i, '/v1')
        .replace(/\/tasks$/i, '');

      if (!pathname || pathname === '/') {
        pathname = '/v1';
      } else if (!pathname.endsWith('/v1')) {
        pathname = `${pathname}/v1`.replace(/\/+/g, '/');
      }

      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  /** Upload a base64 image to APIMart `/v1/uploads/images` and return its hosted URL. */
  private async uploadImage(base64Data: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    try {
      const cleaned = base64Data.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
      const imageBuffer = Buffer.from(cleaned, 'base64');
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const form = new FormData();
      form.append('file', blob, 'input.png');

      const res = await fetch(`${this.baseUrl}/uploads/images`, {
        method: 'POST',
        headers: { ...this.authHeaders },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `APIMart image upload HTTP ${res.status}: ${text}` };
      }

      const json: any = await res.json();
      const url: string | undefined = json?.url || json?.data?.url;
      if (!url) {
        return { ok: false, error: `No URL in APIMart upload response: ${JSON.stringify(json)}` };
      }
      return { ok: true, url };
    } catch (e: any) {
      return { ok: false, error: `APIMart upload error: ${e?.message || e}` };
    }
  }

  private async resolveImageUrls(req: GenerateRequest): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
    const urls: string[] = [];

    if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
      for (const base64 of req.refImagesBase64) {
        const up = await this.uploadImage(base64);
        if (up.ok === false) return up;
        urls.push(up.url);
      }
      return { ok: true, urls };
    }

    if (req.refImageUrls && req.refImageUrls.length > 0) {
      for (const rawUrl of req.refImageUrls) {
        const trimmed = rawUrl.trim();
        if (!trimmed) continue;
        urls.push(trimmed);
      }
    }

    return { ok: true, urls };
  }

  private buildPayload(req: GenerateRequest, imageUrls: string[]): Record<string, unknown> {
    const model = req.modelId || DEFAULT_MODEL;
    const payload: Record<string, unknown> = {
      model,
      prompt: req.prompt,
      n: 1,
    };

    const aspectRatio = req.aspectRatio;
    if (aspectRatio && (aspectRatio !== 'auto' || isGptImage25(model))) {
      payload.size = aspectRatio;
    }

    if (isGptImage25(model)) {
      const { resolution, quality } = resolveTieredSize(req.imageSize, GPT_IMAGE_25_QUALITIES, 'auto');
      payload.resolution = resolution;
      payload.quality = quality;
    } else if (isGptImage2Official(model)) {
      const { resolution, quality } = resolveTieredSize(req.imageSize, GPT_IMAGE_2_QUALITIES, 'medium');
      payload.resolution = resolution;
      payload.quality = quality;
    } else if (isGptImage2(model)) {
      if (req.imageSize) {
        payload.resolution = req.imageSize.toLowerCase();
      }
    } else if (!omitsResolution(model) && req.imageSize) {
      payload.resolution = req.imageSize.toUpperCase();
    }

    if (imageUrls.length > 0) {
      payload.image_urls = imageUrls;
    }

    return payload;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const resolvedRefs = await this.resolveImageUrls(req);
      if (resolvedRefs.ok === false) {
        return { ok: false, error: resolvedRefs.error };
      }

      const payload = this.buildPayload(req, resolvedRefs.urls);
      const submitUrl = req.apiUrl
        ? `${this.normalizeBaseUrl(req.apiUrl)}/images/generations`
        : `${this.baseUrl}/images/generations`;

      const res = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          ...this.authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // @ts-ignore — node-fetch timeout
        timeout: 180_000,
      });

      const text = await res.text();
      let json: APIMartSubmitResponse;
      try {
        json = text ? (JSON.parse(text) as APIMartSubmitResponse) : {};
      } catch {
        return { ok: false, error: `APIMart returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}` };
      }

      if (!res.ok) {
        const errMsg = this.extractErrorMessage(json) || text || `HTTP ${res.status}`;
        return { ok: false, error: `APIMart HTTP ${res.status}: ${errMsg}` };
      }

      if (typeof json.code === 'number' && json.code !== 200 && json.code !== 0) {
        const errMsg = this.extractErrorMessage(json) || `API code ${json.code}`;
        return { ok: false, error: `APIMart error: ${errMsg}` };
      }

      const taskId = this.extractTaskId(json);
      if (taskId) {
        return { ok: true, status: 'processing', taskId };
      }

      // Fallback if the endpoint returned synchronous image data directly
      const directImage = await this.extractDirectImage(json);
      if (directImage) {
        return { ok: true, status: 'completed', imageBytes: directImage };
      }

      return { ok: false, error: `No task_id or image in APIMart response: ${text.slice(0, 300)}` };
    } catch (e: any) {
      console.error('[APIMartGenerator] Error:', e);
      return { ok: false, error: e?.message || 'APIMart image generation failed' };
    }
  }

  async checkStatus(taskId: string, context?: CheckStatusContext): Promise<CheckStatusResult> {
    try {
      const base = context?.apiUrl ? this.normalizeBaseUrl(context.apiUrl) : this.baseUrl;
      const res = await fetch(`${base}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: {
          ...this.authHeaders,
        },
        // @ts-ignore — node-fetch timeout
        timeout: 60_000,
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { status: 'failed', error: `APIMart task not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const json = (await res.json()) as APIMartTaskResponse;
      const taskData = json.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : json;
      const rawStatus = String(taskData?.status || json?.status || '').toLowerCase();

      if (
        rawStatus === 'failed' ||
        rawStatus === 'error' ||
        rawStatus === 'cancelled' ||
        rawStatus === 'canceled' ||
        rawStatus === 'expired'
      ) {
        const errMsg =
          this.extractErrorMessage(taskData) ||
          this.extractErrorMessage(json) ||
          `APIMart task ${rawStatus}`;
        return { status: 'failed', error: errMsg };
      }

      if (
        rawStatus === 'completed' ||
        rawStatus === 'succeeded' ||
        rawStatus === 'succeed' ||
        rawStatus === 'success' ||
        rawStatus === 'done'
      ) {
        const urls = this.extractTaskImageUrls(json);
        if (urls.length === 0) {
          const b64 = this.extractTaskBase64(json);
          if (b64) {
            return {
              status: 'completed',
              imageBytes: Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64'),
            };
          }
          return { status: 'failed', error: 'APIMart task completed but returned no image URL' };
        }

        const buffers: Buffer[] = [];
        for (const url of urls) {
          const downloaded = await this.downloadImage(url);
          if (downloaded.ok === false) {
            return { status: 'failed', error: downloaded.error };
          }
          buffers.push(downloaded.bytes);
        }

        return {
          status: 'completed',
          imageBytes: buffers[0],
          ...(buffers.length > 1 ? { additionalImages: buffers.slice(1) } : {}),
        };
      }

      return { status: 'processing' };
    } catch {
      return { status: 'processing' };
    }
  }

  private extractTaskId(json: APIMartSubmitResponse): string | undefined {
    if (typeof json.task_id === 'string' && json.task_id) return json.task_id;
    if (Array.isArray(json.data)) {
      const first = json.data[0];
      if (first && typeof first.task_id === 'string' && first.task_id) return first.task_id;
    } else if (json.data && typeof json.data === 'object') {
      if (typeof json.data.task_id === 'string' && json.data.task_id) return json.data.task_id;
      if (typeof json.data.id === 'string' && json.data.id) return json.data.id;
    }
    return undefined;
  }

  private async extractDirectImage(json: APIMartSubmitResponse): Promise<Buffer | null> {
    const item = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!item) return null;

    if (typeof item.b64_json === 'string' && item.b64_json) {
      return Buffer.from(item.b64_json.replace(/^data:[^;]+;base64,/, ''), 'base64');
    }
    if (typeof item.url === 'string' && item.url) {
      const downloaded = await this.downloadImage(item.url);
      if (downloaded.ok) return downloaded.bytes;
    }
    return null;
  }

  private extractTaskImageUrls(json: APIMartTaskResponse): string[] {
    const urls: string[] = [];
    const pushUrl = (u: unknown) => {
      if (typeof u === 'string' && u.trim()) {
        urls.push(u.trim());
      } else if (Array.isArray(u)) {
        for (const nested of u) pushUrl(nested);
      }
    };

    const resultBlocks = [json.data?.result, json.result];
    for (const resBlock of resultBlocks) {
      if (!resBlock) continue;
      if (Array.isArray(resBlock.images)) {
        for (const img of resBlock.images) {
          if (typeof img === 'string') pushUrl(img);
          else if (img && typeof img === 'object') pushUrl(img.url);
        }
      }
      if (resBlock.url) pushUrl(resBlock.url);
      if (Array.isArray(resBlock.data)) {
        for (const item of resBlock.data) {
          if (item?.url) pushUrl(item.url);
        }
      }
    }

    if (urls.length === 0) {
      if (json.data?.url) pushUrl(json.data.url);
      if (Array.isArray(json.data?.data)) {
        for (const item of json.data.data) {
          if (item?.url) pushUrl(item.url);
        }
      }
    }

    return Array.from(new Set(urls));
  }

  private extractTaskBase64(json: APIMartTaskResponse): string | undefined {
    const candidates = [
      ...(json.data?.result?.data || []),
      ...(json.result?.data || []),
      ...(json.data?.data || []),
    ];
    for (const item of candidates) {
      if (typeof item?.b64_json === 'string' && item.b64_json) {
        return item.b64_json;
      }
    }
    return undefined;
  }

  private extractErrorMessage(obj: any): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
    if (obj.error && typeof obj.error === 'object') {
      if (typeof obj.error.message === 'string' && obj.error.message.trim()) {
        return obj.error.message.trim();
      }
      if (obj.error.code) return `Error code ${obj.error.code}`;
    }
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
    return undefined;
  }

  private async downloadImage(url: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
    try {
      const res = await fetch(url, {
        // @ts-ignore — node-fetch timeout
        timeout: 120_000,
      });
      if (!res.ok) {
        return { ok: false, error: `Failed to download APIMart image: HTTP ${res.status}` };
      }
      const arrayBuffer = await res.arrayBuffer();
      return { ok: true, bytes: Buffer.from(arrayBuffer) };
    } catch (e: any) {
      return { ok: false, error: `Failed to download APIMart image: ${e?.message || e}` };
    }
  }
}

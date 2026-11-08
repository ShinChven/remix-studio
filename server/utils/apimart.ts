import { base64ImageBytes, cachedUpload, type UploadCache } from '../generators/upload-cache';
/** Shared APIMart transport; a configured proxy path is preserved for every endpoint. */
export function apimartBaseUrl(apiUrl?: string | null): string {
  const url = new URL(apiUrl || 'https://api.apimart.ai/v1');
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/(?:images|videos|music|midjourney)\/generations$/i, '')
    .replace(/\/chat\/completions$/i, '').replace(/\/audio\/speech$/i, '')
    .replace(/\/(?:music\/)?tasks(?:\/[^/]+)?$/i, '').replace(/\/models$/i, '');
  if (!path.endsWith('/v1')) path += '/v1';
  url.pathname = path;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function apimartError(json: any): string | undefined {
  const error = json?.error;
  if (typeof error === 'string' && error) return error;
  return error?.message || json?.message;
}

export function apimartTaskId(json: any): string | undefined {
  const item = Array.isArray(json?.data) ? json.data[0] : json?.data;
  return json?.task_id || item?.task_id || item?.id;
}

export class APIMartClient {
  readonly baseUrl: string;
  constructor(private apiKey: string, apiUrl?: string | null) {
    this.baseUrl = apimartBaseUrl(apiUrl);
  }

  async request(path: string, payload?: Record<string, unknown>): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const body = await response.text();
      let message = body;
      try { message = apimartError(JSON.parse(body)) || body; } catch { /* plain-text error */ }
      throw new Error(`APIMart HTTP ${response.status}: ${message.slice(0, 500)}`);
    }
    return response;
  }

  async json(path: string, payload?: Record<string, unknown>): Promise<any> {
    const response = await this.request(path, payload);
    const json = await response.json();
    if (json.error || json.success === false || (typeof json.code === 'number' && ![0, 200, 202].includes(json.code))) {
      throw new Error(apimartError(json) || `APIMart API code ${json.code}`);
    }
    return json;
  }

  /** Upload a reference image, reusing an earlier upload of the same bytes when a cache is given. */
  uploadImage(base64: string, cache?: UploadCache): Promise<string> {
    return cachedUpload(cache, `${this.baseUrl}/uploads/images`, base64ImageBytes(base64), () => this.sendImage(base64));
  }

  private async sendImage(base64: string): Promise<string> {
    const clean = base64.replace(/^data:[^;]+;base64,/, '');
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(clean, 'base64')], { type: 'image/png' }), 'reference.png');
    const res = await fetch(`${this.baseUrl}/uploads/images`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const json = await res.json();
    const url = json?.data?.url || json?.url;
    if (!res.ok || !url) throw new Error(apimartError(json) || 'APIMart image upload failed');
    return url;
  }
}

export function apimartTaskState(json: any): 'processing' | 'completed' | 'failed' {
  const status = String(json?.data?.status || json?.status || '').toLowerCase();
  if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(status)) return 'failed';
  if (['completed', 'succeeded', 'succeed', 'success', 'done'].includes(status)) return 'completed';
  return 'processing';
}

export async function downloadAPIMartMedia(url: string): Promise<{ bytes: Buffer; mimeType?: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`APIMart media download HTTP ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type')?.split(';')[0] };
}

export function apimartMediaUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value)) return value.map(apimartMediaUrl).find(Boolean);
  return undefined;
}

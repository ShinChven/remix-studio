import { GenerateRequest, GenerateResult, ImageGenerator } from './image-generator';

type GrokImageResponse = {
  data?: Array<{
    b64_json?: string | null;
    mime_type?: string | null;
    revised_prompt?: string;
    url?: string | null;
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-imagine-image';
const PRIVATE_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];

export class GrokGenerator extends ImageGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;
    const { quality, resolution } = this.parseQualityPreset(req.imageSize);

    try {
      const payload: Record<string, unknown> = {
        model,
        prompt: req.prompt,
        n: 1,
        response_format: 'b64_json',
      };

      if (req.aspectRatio) payload.aspect_ratio = req.aspectRatio;
      if (quality) payload.quality = quality;
      if (resolution) payload.resolution = resolution;

      if (req.refImageUrls && req.refImageUrls.length > 0) {
        this.assertPubliclyReachableImageUrls(req.refImageUrls);

        if (req.refImageUrls.length === 1) {
          payload.image = {
            url: req.refImageUrls[0],
            type: 'image_url',
          };
        } else {
          payload.images = req.refImageUrls.map((url) => ({
            url,
            type: 'image_url',
          }));
        }

        const response = await this.callApi('/images/edits', payload);
        return this.extractImage(response);
      }

      const response = await this.callApi('/images/generations', payload);
      return this.extractImage(response);
    } catch (e: any) {
      console.error('[GrokGenerator] Error:', e);
      return { ok: false, error: e?.message || 'Grok image generation failed' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string) {
    if (!apiUrl) return DEFAULT_BASE_URL;

    const parsed = new URL(apiUrl);
    let pathname = parsed.pathname.replace(/\/$/, '');

    if (pathname.endsWith('/images/generations')) {
      pathname = pathname.slice(0, -'/images/generations'.length);
    } else if (pathname.endsWith('/images/edits')) {
      pathname = pathname.slice(0, -'/images/edits'.length);
    }

    if (!pathname || pathname === '/') {
      pathname = '/v1';
    }

    parsed.pathname = pathname;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  private assertPubliclyReachableImageUrls(urls: string[]) {
    for (const value of urls) {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(`Grok image edit requires a public HTTP(S) image URL. Invalid reference image URL: ${value}`);
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Grok image edit requires a public HTTP(S) image URL. Unsupported reference image scheme: ${parsed.protocol}`);
      }

      const hostname = parsed.hostname.toLowerCase();
      if (!hostname) {
        throw new Error('Grok image edit requires a public HTTP(S) image URL. Reference image host is missing.');
      }

      if (
        hostname === 'localhost' ||
        hostname === '0.0.0.0' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname === 'host.docker.internal'
      ) {
        throw new Error(`Grok image edit cannot use local-only reference images: ${value}`);
      }

      if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
        throw new Error(`Grok image edit cannot use non-public reference image host "${hostname}".`);
      }

      if (!hostname.includes('.') && !this.isIpAddress(hostname)) {
        throw new Error(`Grok image edit cannot use non-public reference image host "${hostname}".`);
      }

      if (this.isPrivateIpv4(hostname) || this.isPrivateIpv6(hostname)) {
        throw new Error(`Grok image edit cannot use private reference image address "${hostname}".`);
      }
    }
  }

  private parseQualityPreset(value?: string): {
    quality?: 'low' | 'medium' | 'high';
    resolution?: '1k' | '2k';
  } {
    const normalized = value?.toLowerCase().trim() || '';
    const quality = normalized.match(/\b(low|medium|high)\b/)?.[1] as 'low' | 'medium' | 'high' | undefined;
    const resolution = normalized.match(/\b(1k|2k)\b/)?.[1] as '1k' | '2k' | undefined;

    return {
      quality: quality || 'medium',
      resolution: resolution || '2k',
    };
  }

  private async callApi(path: string, payload: Record<string, unknown>): Promise<GrokImageResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // @ts-ignore node fetch timeout
      timeout: 300_000,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.json() as Promise<GrokImageResponse>;
  }

  private isIpAddress(hostname: string) {
    return this.isIpv4(hostname) || this.isBracketedIpv6(hostname) || this.isPlainIpv6(hostname);
  }

  private isIpv4(hostname: string) {
    const parts = hostname.split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
  }

  private isPrivateIpv4(hostname: string) {
    if (!this.isIpv4(hostname)) return false;
    const [a, b] = hostname.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  private isBracketedIpv6(hostname: string) {
    return /^\[[0-9a-f:]+\]$/i.test(hostname);
  }

  private isPlainIpv6(hostname: string) {
    return hostname.includes(':') && /^[0-9a-f:]+$/i.test(hostname);
  }

  private isPrivateIpv6(hostname: string) {
    const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!this.isPlainIpv6(normalized)) return false;
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }

  private async extractImage(response: GrokImageResponse): Promise<GenerateResult> {
    const data = response.data?.[0];
    if (!data) {
      return { ok: false, error: response.error?.message || 'No image data in Grok response' };
    }

    if (data.b64_json) {
      return { ok: true, imageBytes: Buffer.from(data.b64_json, 'base64') };
    }

    if (data.url) {
      const imageResponse = await fetch(data.url, {
        // @ts-ignore node fetch timeout
        timeout: 300_000,
      } as any);

      if (!imageResponse.ok) {
        return { ok: false, error: `Failed to download Grok image: HTTP ${imageResponse.status}` };
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      return { ok: true, imageBytes: Buffer.from(arrayBuffer) };
    }

    return { ok: false, error: 'No image URL or base64 payload in Grok response' };
  }
}

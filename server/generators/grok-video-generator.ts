import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-imagine-video';
const PRIVATE_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];

/**
 * xAI Grok Imagine video generator.
 *
 * Flow:
 *   1. POST {base}/videos/generations  → { request_id, status }
 *   2. GET  {base}/videos/{request_id} → { status: pending|done|expired|failed, video: { url } }
 *   3. GET video.url                   → mp4 bytes
 *
 * Reference images for Grok must be publicly reachable HTTP(S) URLs — we reuse
 * the same assertion pattern as GrokGenerator (image edits).
 */
export class GrokVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    const payload: Record<string, unknown> = {
      model,
      prompt: req.prompt,
    };

    if (req.aspectRatio) payload.aspect_ratio = req.aspectRatio;
    if (req.resolution) payload.resolution = req.resolution;
    if (req.duration) payload.duration = req.duration;

    if (req.refImageUrls && req.refImageUrls.length > 0) {
      this.assertPubliclyReachableImageUrls(req.refImageUrls);
      if (req.refImageUrls.length === 1) {
        payload.image = req.refImageUrls[0];
      } else {
        payload.reference_images = req.refImageUrls.map((url) => ({ url }));
      }
    }

    try {
      const res = await fetch(`${this.baseUrl}/videos/generations`, {
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

      const result: any = await res.json();
      const requestId: string | undefined = result.request_id || result.id;
      if (!requestId) return { ok: false, error: 'No request_id in Grok video response' };

      return { ok: true, status: 'processing', taskId: requestId };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const res = await fetch(`${this.baseUrl}/videos/${taskId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        // @ts-ignore
        timeout: 60_000,
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { status: 'failed', error: `Grok video request not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result: any = await res.json();
      const status: string = (result.status || '').toLowerCase();

      if (status === 'failed' || status === 'expired') {
        const err = result.error?.message || result.error || result.reason || 'Grok video generation failed';
        return { status: 'failed', error: typeof err === 'string' ? err : JSON.stringify(err) };
      }

      if (status !== 'done' && status !== 'completed') {
        return { status: 'processing' };
      }

      const videoUrl: string | undefined = result.video?.url || result.url;
      if (!videoUrl) {
        return { status: 'failed', error: 'Grok video done but no URL in response' };
      }

      const videoRes = await fetch(videoUrl, {
        // @ts-ignore
        timeout: 300_000,
      } as any);
      if (!videoRes.ok) {
        return {
          status: 'failed',
          error: `Failed to download Grok video: HTTP ${videoRes.status}`,
        };
      }

      const arrayBuffer = await videoRes.arrayBuffer();
      return {
        status: 'completed',
        videoBytes: Buffer.from(arrayBuffer),
        mimeType: 'video/mp4',
      };
    } catch (e: any) {
      return { status: 'processing' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string) {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');
      if (pathname.endsWith('/videos/generations')) {
        pathname = pathname.slice(0, -'/videos/generations'.length);
      }
      if (!pathname || pathname === '/') pathname = '/v1';
      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private assertPubliclyReachableImageUrls(urls: string[]) {
    for (const value of urls) {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(`Grok video generation requires a public HTTP(S) image URL. Invalid reference image URL: ${value}`);
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Grok video generation requires a public HTTP(S) image URL. Unsupported reference image scheme: ${parsed.protocol}`);
      }

      const hostname = parsed.hostname.toLowerCase();
      if (!hostname) {
        throw new Error('Grok video generation requires a public HTTP(S) image URL. Reference image host is missing.');
      }

      if (
        hostname === 'localhost' ||
        hostname === '0.0.0.0' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname === 'host.docker.internal'
      ) {
        throw new Error(`Grok video generation cannot use local-only reference images: ${value}`);
      }

      if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
        throw new Error(`Grok video generation cannot use non-public reference image host "${hostname}".`);
      }
    }
  }
}

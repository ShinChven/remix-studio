import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE_URL = 'https://www.runninghub.ai/openapi/v2';
const API_ROOT_PATH = '/openapi/v2';
const DEFAULT_MODEL = 'bytedance/seedance-2.0-global';
// Seedance names its reference endpoint `multimodal-video`; Hailuo H3 names its
// own `multimodal-to-video`. Both are model routes, so both are parsed off a
// model ID.
type RunningHubVideoEndpoint = 'text-to-video' | 'image-to-video' | 'multimodal-video' | 'multimodal-to-video';
const VIDEO_ENDPOINTS: RunningHubVideoEndpoint[] = [
  'text-to-video',
  'image-to-video',
  'multimodal-video',
  'multimodal-to-video',
];
const MULTIMODAL_ENDPOINTS: RunningHubVideoEndpoint[] = ['multimodal-video', 'multimodal-to-video'];

// MiniMax Hailuo H3 takes a far smaller parameter set than Seedance:
// `image-to-video` accepts a prompt, optional first/last frame, resolution and
// duration, and `multimodal-to-video` swaps the frames for reference lists plus
// a ratio. The Seedance extras (audio generation, real-person mode, conversion
// slots) are not part of either, so Hailuo gets its own payload shape.
const HAILUO_RESOLUTIONS = ['2K', '768P'];
const HAILUO_RATIOS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const HAILUO_MIN_DURATION = 5;
const HAILUO_MAX_DURATION = 15;

// Seedance and Hailuo cap multimodal references identically.
const MAX_REF_IMAGES = 9;
const MAX_REF_VIDEOS = 3;
const MAX_REF_AUDIOS = 3;

type RunningHubTaskResponse = {
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  failedReason?: unknown;
  results?: Array<{
    url?: string;
    outputType?: string;
    text?: string | null;
  }> | null;
};

export class RunningHubVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const { model, endpoint: configuredEndpoint } = this.resolveModelAndEndpoint(req.modelId);
    const imageRefs = this.resolveImageReferences(req);
    const endpoint = configuredEndpoint || (imageRefs.length > 0 ? 'image-to-video' : 'text-to-video');
    const prompt = (req.prompt || '').trim();

    // Seedance only needs a prompt when it has no frame to animate; Hailuo H3
    // requires one on every request.
    if ((endpoint !== 'image-to-video' || this.isHailuoH3(req.modelId)) && !prompt) {
      return { ok: false, error: 'RunningHub video generation requires a prompt' };
    }

    try {
      const payload = this.buildPayload({ ...req, prompt }, endpoint, imageRefs);
      const res = await fetch(`${this.baseUrl}/${model}/${endpoint}`, {
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
        return { ok: false, error: `Submit HTTP ${res.status}: ${text}` };
      }

      const result = await res.json() as RunningHubTaskResponse;
      if (this.hasApiError(result)) {
        return { ok: false, error: this.formatApiError('Submit', result) };
      }

      if (!result.taskId) {
        return { ok: false, error: `No taskId in RunningHub response: ${JSON.stringify(result)}` };
      }

      if (this.isSucceeded(result.status)) {
        const completed = await this.downloadCompletedVideo(result);
        if (completed.status === 'completed') {
          return {
            ok: true,
            status: 'completed',
            videoBytes: completed.videoBytes,
            mimeType: completed.mimeType,
          };
        }
      }

      if (this.isFailed(result.status)) {
        return { ok: false, error: this.formatApiError('Submit', result) };
      }

      return { ok: true, status: 'processing', taskId: result.taskId };
    } catch (e: any) {
      return { ok: false, error: `Submit exception: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const res = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
        // @ts-ignore
        timeout: 60_000,
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { status: 'failed', error: `RunningHub task not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result = await res.json() as RunningHubTaskResponse;

      if (this.hasApiError(result) || this.isFailed(result.status)) {
        return { status: 'failed', error: this.formatApiError('Query', result) };
      }

      if (!this.isSucceeded(result.status)) {
        return { status: 'processing' };
      }

      return await this.downloadCompletedVideo(result);
    } catch {
      return { status: 'processing' };
    }
  }

  private buildPayload(req: VideoGenerateRequest, endpoint: RunningHubVideoEndpoint, imageRefs: string[]): Record<string, unknown> {
    if (this.isHailuoH3(req.modelId)) {
      return this.buildHailuoPayload(req, endpoint, imageRefs);
    }

    const payload: Record<string, unknown> = {
      prompt: req.prompt || '',
      resolution: req.resolution || '720p',
      duration: String(req.duration || 5),
      generateAudio: (req.sound || 'on') === 'on',
      ratio: req.aspectRatio || 'adaptive',
      returnLastFrame: false,
    };

    if (endpoint === 'multimodal-video') {
      const videoUrls = (req.refVideoUrls || []).slice(0, MAX_REF_VIDEOS);
      payload.imageUrls = imageRefs.slice(0, MAX_REF_IMAGES);
      payload.videoUrls = videoUrls;
      payload.audioUrls = (req.refAudioUrls || []).slice(0, MAX_REF_AUDIOS);
      if (imageRefs.length > 0 || videoUrls.length > 0) {
        payload.realPersonMode = true;
        payload.conversionSlots = ['all'];
      }
      return payload;
    }

    if (imageRefs.length === 0) {
      payload.webSearch = false;
      return payload;
    }

    payload.firstFrameUrl = imageRefs[0];
    payload.lastFrameUrl = imageRefs[1] || null;
    payload.realPersonMode = true;
    payload.conversionSlots = imageRefs[1] ? ['all'] : ['firstFrameUrl'];
    return payload;
  }

  private buildHailuoPayload(req: VideoGenerateRequest, endpoint: RunningHubVideoEndpoint, imageRefs: string[]): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt: req.prompt || '',
      resolution: this.resolveHailuoResolution(req.resolution),
      duration: String(this.resolveHailuoDuration(req.duration)),
    };

    if (endpoint === 'multimodal-to-video') {
      payload.imageUrls = imageRefs.slice(0, MAX_REF_IMAGES);
      payload.videoUrls = (req.refVideoUrls || []).slice(0, MAX_REF_VIDEOS);
      payload.audioUrls = (req.refAudioUrls || []).slice(0, MAX_REF_AUDIOS);
      payload.ratio = this.resolveHailuoRatio(req.aspectRatio);
      return payload;
    }

    payload.firstFrameUrl = imageRefs[0] || null;
    payload.lastFrameUrl = imageRefs[1] || null;
    return payload;
  }

  /**
   * Hailuo H3 accepts only `2K` or `768P`. A project switched over from another
   * video model still carries that model's resolution, so map it onto the
   * closest supported tier instead of letting the API reject the request.
   */
  private resolveHailuoResolution(resolution?: string): string {
    const value = (resolution || '').trim().toUpperCase();
    if (HAILUO_RESOLUTIONS.includes(value)) return value;

    if (value.includes('K')) return '2K';
    const height = Number(value.match(/\d+/)?.[0]);
    return Number.isFinite(height) && height >= 1080 ? '2K' : '768P';
  }

  /** Only `multimodal-to-video` takes a ratio, and only from a fixed enum. */
  private resolveHailuoRatio(aspectRatio?: string): string {
    const value = (aspectRatio || '').trim().toLowerCase();
    return HAILUO_RATIOS.includes(value) ? value : 'adaptive';
  }

  private resolveHailuoDuration(duration?: number): number {
    const value = Math.round(Number(duration));
    if (!Number.isFinite(value)) return HAILUO_MIN_DURATION;
    return Math.min(HAILUO_MAX_DURATION, Math.max(HAILUO_MIN_DURATION, value));
  }

  private isHailuoH3(modelId?: string): boolean {
    return (modelId || '').toLowerCase().includes('hailuo-h3');
  }

  private resolveImageReferences(req: VideoGenerateRequest): string[] {
    const refs: string[] = [];
    const maxImages = this.isMultimodalModel(req.modelId) ? MAX_REF_IMAGES : 2;

    for (let i = 0; i < maxImages; i++) {
      const url = req.refImageUrls?.[i];
      const b64 = req.refImagesBase64?.[i];

      if (url && url.startsWith('data:')) {
        refs.push(url);
      } else if (url && !this.isLocalUrl(url)) {
        refs.push(url);
      } else if (b64) {
        refs.push(`data:image/png;base64,${b64}`);
      } else if (url) {
        refs.push(url);
      }
    }

    if (refs.length > 0) return refs;

    return (req.refImagesBase64 || [])
      .slice(0, maxImages)
      .map((b64) => `data:image/png;base64,${b64}`);
  }

  private isLocalUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');

      // The configured URL may point at a model route (`/<vendor>/<model>/<endpoint>`)
      // or at `/query`; trim back to the API root so any model can be addressed.
      const apiRootIndex = pathname.lastIndexOf(API_ROOT_PATH);
      if (apiRootIndex >= 0) {
        pathname = pathname.slice(0, apiRootIndex + API_ROOT_PATH.length);
      } else {
        pathname = `${pathname}${API_ROOT_PATH}`.replace(/\/+/g, '/');
      }

      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private resolveModelAndEndpoint(modelId?: string): { model: string; endpoint?: RunningHubVideoEndpoint } {
    const rawModel = modelId || DEFAULT_MODEL;
    const endpoint = VIDEO_ENDPOINTS.find((candidate) => rawModel.endsWith(`/${candidate}`));
    if (!endpoint) return { model: rawModel };

    return {
      model: rawModel.slice(0, -(endpoint.length + 1)),
      endpoint,
    };
  }

  private isMultimodalModel(modelId?: string): boolean {
    const { endpoint } = this.resolveModelAndEndpoint(modelId);
    return endpoint !== undefined && MULTIMODAL_ENDPOINTS.includes(endpoint);
  }

  private hasApiError(result: RunningHubTaskResponse): boolean {
    return Boolean(result.errorCode && result.errorCode !== '0');
  }

  private isSucceeded(status?: string): boolean {
    return (status || '').toUpperCase() === 'SUCCESS';
  }

  private isFailed(status?: string): boolean {
    return (status || '').toUpperCase() === 'FAILED';
  }

  private formatApiError(prefix: string, result: RunningHubTaskResponse): string {
    const message = result.errorMessage || this.stringifyFailedReason(result.failedReason) || 'Unknown failure';
    return `${prefix} API error ${result.errorCode || result.status || 'unknown'}: ${message}`;
  }

  private stringifyFailedReason(reason: unknown): string | undefined {
    if (!reason) return undefined;
    if (typeof reason === 'string') return reason;
    try {
      return JSON.stringify(reason);
    } catch {
      return undefined;
    }
  }

  private async downloadCompletedVideo(result: RunningHubTaskResponse): Promise<VideoCheckStatusResult> {
    const output = this.selectVideoOutput(result.results || []);
    if (!output?.url) {
      return { status: 'failed', error: 'RunningHub task succeeded but no result video URL was returned' };
    }

    const res = await fetch(output.url, {
      // @ts-ignore
      timeout: 300_000,
    } as any);

    if (!res.ok) {
      return { status: 'failed', error: `Failed to download RunningHub video: HTTP ${res.status}` };
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      status: 'completed',
      videoBytes: Buffer.from(arrayBuffer),
      mimeType: res.headers.get('content-type') || this.mimeTypeFromOutputType(output.outputType),
    };
  }

  private selectVideoOutput(results: NonNullable<RunningHubTaskResponse['results']>) {
    return (
      results.find((item) => item.url && (item.outputType || '').toLowerCase() === 'mp4') ||
      results.find((item) => item.url && ['mp4', 'mov', 'webm'].includes((item.outputType || '').toLowerCase())) ||
      results.find((item) => item.url)
    );
  }

  private mimeTypeFromOutputType(outputType?: string): string {
    switch ((outputType || '').toLowerCase()) {
      case 'webm':
        return 'video/webm';
      case 'mov':
        return 'video/quicktime';
      case 'mp4':
      default:
        return 'video/mp4';
    }
  }
}

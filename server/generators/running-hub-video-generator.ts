import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE_URL = 'https://www.runninghub.ai/openapi/v2';
const DEFAULT_MODEL = 'bytedance/seedance-2.0-global';
type RunningHubVideoEndpoint = 'text-to-video' | 'image-to-video' | 'multimodal-video';

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

    if ((endpoint === 'text-to-video' || endpoint === 'multimodal-video') && !prompt) {
      return { ok: false, error: 'RunningHub Seedance video generation requires a prompt' };
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
    const payload: Record<string, unknown> = {
      prompt: req.prompt || '',
      resolution: req.resolution || '720p',
      duration: String(req.duration || 5),
      generateAudio: (req.sound || 'on') === 'on',
      ratio: req.aspectRatio || 'adaptive',
      returnLastFrame: false,
    };

    if (endpoint === 'multimodal-video') {
      const videoUrls = (req.refVideoUrls || []).slice(0, 3);
      payload.imageUrls = imageRefs.slice(0, 9);
      payload.videoUrls = videoUrls;
      payload.audioUrls = (req.refAudioUrls || []).slice(0, 3);
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

  private resolveImageReferences(req: VideoGenerateRequest): string[] {
    const refs: string[] = [];
    const maxImages = this.isMultimodalModel(req.modelId) ? 9 : 2;

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

      pathname = pathname
        .replace(/\/bytedance\/seedance-2\.0-global\/(?:text-to-video|image-to-video|multimodal-video)$/, '')
        .replace(/\/query$/, '');

      if (!pathname.endsWith('/openapi/v2')) {
        pathname = `${pathname}/openapi/v2`.replace(/\/+/g, '/');
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
    const endpointMatch = rawModel.match(/\/(text-to-video|image-to-video|multimodal-video)$/);
    if (!endpointMatch) return { model: rawModel };

    return {
      model: rawModel.slice(0, -endpointMatch[0].length),
      endpoint: endpointMatch[1] as RunningHubVideoEndpoint,
    };
  }

  private isMultimodalModel(modelId?: string): boolean {
    return this.resolveModelAndEndpoint(modelId).endpoint === 'multimodal-video';
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

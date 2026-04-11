import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'veo-3.1-generate-preview';

/**
 * Google AI Veo video generator.
 *
 * Flow:
 *   1. POST {base}/v1beta/models/{model}:predictLongRunning → returns { name: 'operations/...' }
 *   2. GET  {base}/v1beta/{name}                             → { done: bool, response?, error? }
 *   3. Download response.generateVideoResponse.generatedSamples[0].video.uri (auth'd).
 */
export class GoogleAIVideoGenerator extends VideoGenerator {
  protected apiKey: string;
  protected base: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.base = this.normalizeBase(apiUrl);
  }

  protected normalizeBase(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE;
    // If the user stored a full /v1beta/models/... URL, strip down to the origin.
    try {
      const u = new URL(apiUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return DEFAULT_BASE;
    }
  }

  protected buildGenerateUrl(model: string): string {
    return `${this.base}/v1beta/models/${model}:predictLongRunning`;
  }

  protected buildOperationUrl(operationName: string): string {
    // operationName looks like 'models/veo-3.1-generate-preview/operations/abc123'
    // or just 'operations/abc123'. We append directly under /v1beta/.
    const trimmed = operationName.startsWith('/') ? operationName.slice(1) : operationName;
    return `${this.base}/v1beta/${trimmed}`;
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;
    const url = this.buildGenerateUrl(model);

    const instance: any = { prompt: req.prompt };
    if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
      instance.image = {
        inlineData: {
          mimeType: 'image/png',
          data: req.refImagesBase64[0],
        },
      };
    }

    const parameters: any = {};
    if (req.aspectRatio) parameters.aspectRatio = req.aspectRatio;
    if (req.duration) parameters.durationSeconds = String(req.duration);
    if (req.resolution) parameters.resolution = req.resolution;
    parameters.personGeneration = 'allow_all';

    const payload = {
      instances: [instance],
      parameters,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
        // @ts-ignore — node-fetch timeout
        timeout: 180_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result: any = await res.json();
      const operationName: string | undefined = result.name;
      if (!operationName) {
        return { ok: false, error: 'No operation name in predictLongRunning response' };
      }

      return { ok: true, status: 'processing', taskId: operationName };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    const url = this.buildOperationUrl(taskId);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': this.apiKey },
        // @ts-ignore
        timeout: 60_000,
      });

      if (!res.ok) {
        // Transient error → keep polling unless it's a 404 (operation gone)
        if (res.status === 404) {
          return { status: 'failed', error: `Operation not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result: any = await res.json();

      if (result.error) {
        const msg = result.error.message || JSON.stringify(result.error);
        return { status: 'failed', error: `Operation failed: ${msg}` };
      }

      if (!result.done) {
        return { status: 'processing' };
      }

      // done === true
      const samples =
        result.response?.generateVideoResponse?.generatedSamples ||
        result.response?.generatedSamples ||
        [];
      const sample = samples[0];
      const videoUri: string | undefined = sample?.video?.uri || sample?.uri;
      const inlineData = sample?.video?.inlineData || sample?.inlineData;

      if (inlineData?.data) {
        return {
          status: 'completed',
          videoBytes: Buffer.from(inlineData.data, 'base64'),
          mimeType: inlineData.mimeType || 'video/mp4',
        };
      }

      if (!videoUri) {
        return { status: 'failed', error: 'Operation completed but no video URI/bytes found' };
      }

      // Download the video bytes (Gemini download URLs require the API key header).
      const downloadUrl = videoUri.includes('key=')
        ? videoUri
        : `${videoUri}${videoUri.includes('?') ? '&' : '?'}alt=media`;

      const videoRes = await fetch(downloadUrl, {
        headers: { 'x-goog-api-key': this.apiKey },
        // @ts-ignore
        timeout: 300_000,
      } as any);

      if (!videoRes.ok) {
        return {
          status: 'failed',
          error: `Failed to download generated video: HTTP ${videoRes.status}`,
        };
      }

      const arrayBuffer = await videoRes.arrayBuffer();
      return {
        status: 'completed',
        videoBytes: Buffer.from(arrayBuffer),
        mimeType: 'video/mp4',
      };
    } catch (e: any) {
      // Transient network error, keep polling
      return { status: 'processing' };
    }
  }
}

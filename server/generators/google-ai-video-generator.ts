import { GoogleInteractionsClient } from '../utils/google-interactions';
import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'gemini-omni-1.2-flash';

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
    if (model.startsWith('gemini-omni') || /^veo-3\.1-.*generate-preview$/.test(model)) {
      return this.generateOmni(req, model.startsWith('gemini-omni') ? model : DEFAULT_MODEL);
    }
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

  private async generateOmni(req: VideoGenerateRequest, model: string): Promise<VideoGenerateResult> {
    try {
      const refs = req.refImagesBase64 || [];
      const urls = refs.length ? [] : req.refImageUrls || [];
      const videos = req.refVideoUrls || [];
      if (refs.length + urls.length > 6 || videos.length > 1) {
        throw new Error('Gemini Omni accepts up to six reference images and one source video');
      }
      const input = [
        ...refs.map((data) => ({ type: 'image', data, mime_type: 'image/png' })),
        ...urls.map((uri) => ({ type: 'image', uri, mime_type: 'image/png' })),
        ...videos.map((uri) => ({ type: 'video', uri, mime_type: 'video/mp4' })),
        { type: 'text', text: req.prompt },
      ];
      const requestedDuration = req.duration ?? 10;
      const duration = Math.max(3, Math.min(videos.length ? 10 : 15, Math.round(requestedDuration)));
      const result = await new GoogleInteractionsClient(this.apiKey, this.base).create({
        model,
        input,
        response_format: {
          type: 'video',
          aspect_ratio: req.aspectRatio === '9:16' ? '9:16' : '16:9',
          resolution: req.resolution || '720p',
          duration: `${duration}s`,
        },
        ...(req.seed !== undefined ? { generation_config: { seed: req.seed } } : {}),
      });
      if (!result.id) throw new Error(result.error?.message || 'Google Omni did not return an interaction ID');
      return { ok: true, status: 'processing', taskId: `omni:${result.id}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    if (taskId.startsWith('omni:')) {
      const result = await new GoogleInteractionsClient(this.apiKey, this.base).check(taskId.slice('omni:'.length));
      if (result.status !== 'completed') return result;
      const video = result.content.find((part) => part.type === 'video' && part.data);
      return video?.data
        ? { status: 'completed', videoBytes: Buffer.from(video.data, 'base64'), mimeType: video.mime_type || 'video/mp4' }
        : { status: 'failed', error: 'Google Omni completed without video data' };
    }

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

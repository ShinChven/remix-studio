import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';

type BytePlusTaskResponse = {
  id?: string;
  model?: string;
  status?: string;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type BytePlusMediaRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

type BytePlusContentItem =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
      role?: BytePlusMediaRole;
    }
  | {
      type: 'video_url';
      video_url: {
        url: string;
      };
      role?: BytePlusMediaRole;
    }
  | {
      type: 'audio_url';
      audio_url: {
        url: string;
      };
      role?: BytePlusMediaRole;
    };

const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_MODEL = 'dreamina-seedance-2-5-260628';

/** Dreamina Seedance 2.x accepts video/audio references on top of the 1.x image roles. */
const SEEDANCE_2_PATTERN = /seedance-2[-.]/;

/** Per-request reference caps published for each Seedance 2.x tier. */
const SEEDANCE_2_5_LIMITS = { images: 30, videos: 10, audios: 10 };
const SEEDANCE_2_0_LIMITS = { images: 9, videos: 3, audios: 3 };

export class BytePlusVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = this.normalizeBaseUrl(apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    try {
      const content = this.buildContent(model, req);
      const payload: Record<string, unknown> = {
        model,
        content,
      };

      if (req.aspectRatio) payload.ratio = req.aspectRatio;
      if (req.resolution) payload.resolution = req.resolution;
      if (typeof req.duration === 'number') payload.duration = req.duration;
      if (this.supportsGeneratedAudio(model)) payload.generate_audio = req.sound !== 'off';

      if (this.isSeedance2(model)) {
        payload.watermark = false;
        if (typeof req.seed === 'number') payload.seed = req.seed;
      }

      const res = await fetch(`${this.baseUrl}/contents/generations/tasks`, {
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

      const result = await res.json() as BytePlusTaskResponse;
      if (result.error) {
        return {
          ok: false,
          error: result.error.message || `BytePlus error: ${result.error.code || 'unknown_error'}`,
        };
      }

      if (!result.id) {
        return { ok: false, error: 'No task id in BytePlus video response' };
      }

      return { ok: true, status: 'processing', taskId: result.id };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const res = await fetch(`${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        // @ts-ignore
        timeout: 60_000,
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { status: 'failed', error: `BytePlus video task not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result = await res.json() as BytePlusTaskResponse;
      const status = (result.status || '').toLowerCase();

      if (result.error || ['failed', 'expired', 'cancelled', 'canceled'].includes(status)) {
        const err = result.error?.message || `BytePlus video generation ${status || 'failed'}`;
        return { status: 'failed', error: err };
      }

      if (!['succeeded', 'completed', 'done'].includes(status)) {
        return { status: 'processing' };
      }

      const videoUrl = result.content?.video_url;
      if (!videoUrl) {
        return { status: 'failed', error: 'BytePlus task succeeded but no video URL was returned' };
      }

      const videoRes = await fetch(videoUrl, {
        // @ts-ignore
        timeout: 300_000,
      } as any);
      if (!videoRes.ok) {
        return {
          status: 'failed',
          error: `Failed to download BytePlus video: HTTP ${videoRes.status}`,
        };
      }

      const arrayBuffer = await videoRes.arrayBuffer();
      return {
        status: 'completed',
        videoBytes: Buffer.from(arrayBuffer),
        mimeType: 'video/mp4',
      };
    } catch {
      return { status: 'processing' };
    }
  }

  private normalizeBaseUrl(apiUrl?: string): string {
    if (!apiUrl) return DEFAULT_BASE_URL;

    try {
      const parsed = new URL(apiUrl);
      let pathname = parsed.pathname.replace(/\/$/, '');

      if (pathname.endsWith('/contents/generations/tasks')) {
        pathname = pathname.slice(0, -'/contents/generations/tasks'.length);
      }

      if (!pathname.endsWith('/api/v3')) {
        pathname = pathname.replace(/\/$/, '') + '/api/v3';
      }

      parsed.pathname = pathname;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private isSeedance2(model: string): boolean {
    return SEEDANCE_2_PATTERN.test(model);
  }

  private supportsGeneratedAudio(model: string): boolean {
    return this.isSeedance2(model) || model.startsWith('seedance-1-5-pro');
  }

  private buildContent(model: string, req: VideoGenerateRequest): BytePlusContentItem[] {
    if (this.isSeedance2(model)) {
      return this.buildSeedance2Content(model, req);
    }

    const content: BytePlusContentItem[] = [];
    const prompt = (req.prompt || '').trim();
    if (prompt) {
      content.push({ type: 'text', text: prompt });
    }

    const imageUrls = this.resolveImageUrls(req);
    if (imageUrls.length === 0) {
      if (!prompt) throw new Error('BytePlus video generation requires a prompt or at least one reference image');
      return content;
    }

    if (imageUrls.length === 1) {
      content.push(this.createImageItem(imageUrls[0], 'first_frame'));
      return content;
    }

    if (imageUrls.length === 2 && model !== 'seedance-1-0-pro-fast-251015') {
      content.push(this.createImageItem(imageUrls[0], 'first_frame'));
      content.push(this.createImageItem(imageUrls[1], 'last_frame'));
      return content;
    }

    if (model !== 'seedance-1-0-lite-i2v-250428') {
      throw new Error(`${model} does not support more than two input images`);
    }

    for (const url of imageUrls.slice(0, 4)) {
      content.push(this.createImageItem(url, 'reference_image'));
    }

    return content;
  }

  /**
   * Seedance 2.x is a single multimodal endpoint: images keep the 1.x frame roles for
   * text/image-to-video, and any video or audio reference switches the request into
   * omni-reference mode where every image is a `reference_image`.
   */
  private buildSeedance2Content(model: string, req: VideoGenerateRequest): BytePlusContentItem[] {
    const limits = model.includes('seedance-2-5') ? SEEDANCE_2_5_LIMITS : SEEDANCE_2_0_LIMITS;
    const content: BytePlusContentItem[] = [];

    const prompt = (req.prompt || '').trim();
    if (prompt) {
      content.push({ type: 'text', text: prompt });
    }

    const imageUrls = this.resolveImageUrls(req).slice(0, limits.images);
    const videoUrls = (req.refVideoUrls || []).slice(0, limits.videos);
    const audioUrls = (req.refAudioUrls || []).slice(0, limits.audios);

    if (!prompt && imageUrls.length === 0 && videoUrls.length === 0) {
      throw new Error('BytePlus video generation requires a prompt or at least one reference image or video');
    }

    if (audioUrls.length > 0 && imageUrls.length === 0 && videoUrls.length === 0) {
      throw new Error('Seedance reference audio requires at least one reference image or video');
    }

    const omniReference = videoUrls.length > 0 || audioUrls.length > 0 || imageUrls.length > 2;
    if (omniReference) {
      for (const url of imageUrls) {
        content.push(this.createImageItem(url, 'reference_image'));
      }
    } else if (imageUrls.length === 1) {
      content.push(this.createImageItem(imageUrls[0], 'first_frame'));
    } else if (imageUrls.length === 2) {
      content.push(this.createImageItem(imageUrls[0], 'first_frame'));
      content.push(this.createImageItem(imageUrls[1], 'last_frame'));
    }

    for (const url of videoUrls) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
    }

    for (const url of audioUrls) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
    }

    return content;
  }

  private createImageItem(
    url: string,
    role: 'first_frame' | 'last_frame' | 'reference_image',
  ): BytePlusContentItem {
    return {
      type: 'image_url',
      image_url: { url },
      role,
    };
  }

  private resolveImageUrls(req: VideoGenerateRequest): string[] {
    if (req.refImageUrls && req.refImageUrls.length > 0) {
      return req.refImageUrls;
    }

    if (req.refImagesBase64 && req.refImagesBase64.length > 0) {
      return req.refImagesBase64.map((b64) => `data:image/png;base64,${b64}`);
    }

    return [];
  }
}

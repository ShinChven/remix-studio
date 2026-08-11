import {
  VideoGenerator,
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoCheckStatusResult,
} from './video-generator';
import {
  MINIMAX_DEFAULT_BASE_URL,
  miniMaxApiRoot,
  normalizeMiniMaxBaseUrl,
} from '../utils/minimax';

type MiniMaxVideoRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

type MiniMaxContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role?: MiniMaxVideoRole }
  | { type: 'video_url'; video_url: { url: string }; role?: MiniMaxVideoRole }
  | { type: 'audio_url'; audio_url: { url: string }; role?: MiniMaxVideoRole };

type MiniMaxTaskResponse = {
  task_id?: string;
  task?: {
    id?: string;
    status?: string;
    error?: { code?: string; message?: string };
    content?: { url?: string };
  };
  error?: { type?: string; message?: string; http_code?: string };
};

const DEFAULT_MODEL = 'MiniMax-H3';

/** Published per-request reference caps for MiniMax-H3. */
const REFERENCE_LIMITS = { images: 9, videos: 3, audios: 3 };

/** Text-to-video rejects `adaptive`, so a text-only job falls back to this. */
const DEFAULT_TEXT_TO_VIDEO_RATIO = '16:9';

export class MiniMaxVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    const normalized = apiUrl ? normalizeMiniMaxBaseUrl(apiUrl) : MINIMAX_DEFAULT_BASE_URL;
    // Video generation is the one MiniMax API served from /v2.
    this.baseUrl = miniMaxApiRoot(normalized, 'v2');
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;

    try {
      const content = this.buildContent(req);
      const payload: Record<string, unknown> = {
        model,
        content,
        resolution: this.resolveResolution(req.resolution),
        duration: this.resolveDuration(req.duration),
      };

      const ratio = this.resolveRatio(req, content);
      if (ratio) payload.ratio = ratio;

      const res = await fetch(`${this.baseUrl}/video_generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = (await res.json().catch(() => ({}))) as MiniMaxTaskResponse;

      if (!res.ok || result.error) {
        return {
          ok: false,
          error: result.error?.message || `HTTP ${res.status}: MiniMax video generation failed`,
        };
      }

      if (!result.task_id) {
        return { ok: false, error: 'No task_id in MiniMax video response' };
      }

      return { ok: true, status: 'processing', taskId: result.task_id };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/query/video_generation/${encodeURIComponent(taskId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      );

      if (!res.ok) {
        // Tasks age out of the query window after 7 days; everything else here
        // is transient and worth another poll.
        if (res.status === 404) {
          return { status: 'failed', error: `MiniMax video task not found (${taskId})` };
        }
        return { status: 'processing' };
      }

      const result = (await res.json()) as MiniMaxTaskResponse;
      const task = result.task;
      const status = (task?.status || '').toLowerCase();

      if (status === 'failed' || status === 'cancelled' || task?.error) {
        const code = task?.error?.code ? ` (${task.error.code})` : '';
        return {
          status: 'failed',
          error: `${task?.error?.message || `MiniMax video generation ${status || 'failed'}`}${code}`,
        };
      }

      if (status !== 'succeeded') {
        return { status: 'processing' };
      }

      const url = task?.content?.url;
      if (!url) {
        return { status: 'failed', error: 'MiniMax task succeeded but no video URL was returned' };
      }

      const videoRes = await fetch(url);
      if (!videoRes.ok) {
        return {
          status: 'failed',
          error: `Failed to download MiniMax video: HTTP ${videoRes.status}`,
        };
      }

      return {
        status: 'completed',
        videoBytes: Buffer.from(await videoRes.arrayBuffer()),
        mimeType: 'video/mp4',
      };
    } catch {
      return { status: 'processing' };
    }
  }

  /**
   * Every request carries a non-empty text item. Images either pin the first and
   * last frame or act as references — the two modes are mutually exclusive, so a
   * job that brings a reference video or audio (or more images than the two frame
   * slots) switches every image to `reference_image`.
   */
  private buildContent(req: VideoGenerateRequest): MiniMaxContentItem[] {
    const prompt = (req.prompt || '').trim();
    if (!prompt) {
      throw new Error('MiniMax video generation requires a prompt');
    }

    const content: MiniMaxContentItem[] = [{ type: 'text', text: prompt }];

    const imageUrls = this.resolveImageUrls(req).slice(0, REFERENCE_LIMITS.images);
    const videoUrls = (req.refVideoUrls || []).slice(0, REFERENCE_LIMITS.videos);
    const audioUrls = (req.refAudioUrls || []).slice(0, REFERENCE_LIMITS.audios);

    const referenceMode = videoUrls.length > 0 || audioUrls.length > 0 || imageUrls.length > 2;

    if (referenceMode) {
      for (const url of imageUrls) {
        content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
      }
    } else if (imageUrls.length === 1) {
      content.push({ type: 'image_url', image_url: { url: imageUrls[0] }, role: 'first_frame' });
    } else if (imageUrls.length === 2) {
      content.push({ type: 'image_url', image_url: { url: imageUrls[0] }, role: 'first_frame' });
      content.push({ type: 'image_url', image_url: { url: imageUrls[1] }, role: 'last_frame' });
    }

    for (const url of videoUrls) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
    }

    for (const url of audioUrls) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
    }

    return content;
  }

  /**
   * Image-to-video derives the ratio from the input frame and rejects nothing,
   * text-to-video rejects `adaptive`, and reference-to-video takes either.
   */
  private resolveRatio(req: VideoGenerateRequest, content: MiniMaxContentItem[]): string | undefined {
    const framed = content.some(
      (item) => 'role' in item && (item.role === 'first_frame' || item.role === 'last_frame'),
    );
    if (framed) return undefined;

    const textOnly = content.length === 1;
    const ratio = req.aspectRatio;

    if (!ratio || ratio === 'adaptive') {
      return textOnly ? DEFAULT_TEXT_TO_VIDEO_RATIO : 'adaptive';
    }

    return ratio;
  }

  private resolveResolution(resolution?: string): string {
    const normalized = (resolution || '').trim().toUpperCase();
    return normalized === '2K' || normalized === '768P' ? normalized : '768P';
  }

  private resolveDuration(duration?: number): number {
    if (!Number.isFinite(duration)) return 5;
    return Math.min(15, Math.max(4, Math.round(duration as number)));
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

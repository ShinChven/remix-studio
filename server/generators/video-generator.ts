export interface VideoGenerateRequest {
  prompt: string;
  modelId?: string;         // The actual API model string (e.g. 'veo-3.1-generate-preview', 'sora-2')
  apiUrl?: string;          // Optional override URL
  aspectRatio?: string;     // e.g. '16:9', '9:16', '1:1'
  resolution?: string;      // e.g. '720p', '1080p', '4k'
  duration?: number;        // seconds
  sound?: 'on' | 'off';
  refImagesBase64?: string[]; // base64-encoded PNGs (for providers that accept inline image input)
  refImageUrls?: string[];    // public/presigned URLs (for providers that require URL refs, e.g. Grok)
  refVideoUrls?: string[];
  refAudioUrls?: string[];
}

export type VideoGenerateResult =
  | {
      ok: true;
      videoBytes?: Buffer;
      mimeType?: string;
      status?: 'processing' | 'completed';
      taskId?: string;
    }
  | { ok: false; error: string };

export interface VideoCheckStatusResult {
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  videoBytes?: Buffer;
  mimeType?: string;
}

/**
 * Base class for video generators. All video APIs we support are asynchronous
 * (return a task/operation id on `generate()`, then we poll via `checkStatus()`).
 */
export abstract class VideoGenerator {
  abstract generate(req: VideoGenerateRequest): Promise<VideoGenerateResult>;
  abstract checkStatus(taskId: string): Promise<VideoCheckStatusResult>;
}

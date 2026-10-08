export interface GenerateRequest {
  prompt: string;
  modelId?: string;       // The actual API model string
  apiUrl?: string;        // Optional override URL
  aspectRatio?: string;   // e.g. "2:3", "1:1", "16:9"
  imageSize?: string;     // e.g. "1K", "4K"
  format?: string;        // e.g. "png", "jpeg", "webp"
  refImagesBase64?: string[]; // base64-encoded PNGs for img2img sequentially
  refImageUrls?: string[]; // remote or presigned URLs for providers that require URL references
  targetPath?: string;    // hint for async generators (RunningHub)
  background?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  promptUpsampling?: boolean;
}

export type GenerateResult =
  | { 
      ok: true;  
      imageBytes?: Buffer; 
      status?: 'processing' | 'completed'; 
      taskId?: string; 
    }
  | { ok: false; error: string };

export interface CheckStatusResult {
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  imageBytes?: Buffer;
  // Further images the same task produced, each saved as its own album item
  // next to `imageBytes` (e.g. the PNG layers of a layer decomposition).
  additionalImages?: Buffer[];
}

/** The job's model, for generators whose result shape depends on it. */
export interface CheckStatusContext {
  modelId?: string;
  apiUrl?: string;
}

export abstract class ImageGenerator {
  abstract generate(req: GenerateRequest): Promise<GenerateResult>;
  checkStatus?(taskId: string, context?: CheckStatusContext): Promise<CheckStatusResult>;
}

export interface GenerateRequest {
  prompt: string;
  modelId?: string;       // The actual API model string
  apiUrl?: string;        // Optional override URL
  aspectRatio?: string;   // e.g. "2:3", "1:1", "16:9"
  imageSize?: string;     // e.g. "1K", "4K"
  refImagesBase64?: string[]; // base64-encoded PNGs for img2img sequentially
  targetPath?: string;    // hint for async generators (RunningHub)
}

export type GenerateResult =
  | { ok: true;  imageBytes: Buffer }
  | { ok: false; error: string };

export abstract class ImageGenerator {
  abstract generate(req: GenerateRequest): Promise<GenerateResult>;
}

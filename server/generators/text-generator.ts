export interface TextGenerateRequest {
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  apiUrl?: string;
  temperature?: number;
  maxTokens?: number;
  refImagesBase64?: string[]; // For multimodal input (images as context)
}

export type TextGenerateResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export abstract class TextGenerator {
  abstract generate(req: TextGenerateRequest): Promise<TextGenerateResult>;
}

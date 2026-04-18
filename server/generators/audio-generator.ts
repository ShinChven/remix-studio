import type { AudioProjectConfig } from '../../src/types';

export interface AudioGenerateRequest {
  prompt: string;
  modelId?: string;
  apiUrl?: string;
  audioConfig: AudioProjectConfig;
}

export type AudioGenerateResult =
  | { ok: true; audioBytes: Buffer; mimeType?: string }
  | { ok: false; error: string };

export abstract class AudioGenerator {
  abstract generate(req: AudioGenerateRequest): Promise<AudioGenerateResult>;
}

import type { AudioProjectConfig } from '../../src/types';

export interface AudioReferenceImage {
  data: string;
  mimeType: string;
}

export interface AudioGenerateRequest {
  prompt: string;
  modelId?: string;
  apiUrl?: string;
  audioConfig: AudioProjectConfig;
  outputFormat?: 'wav' | 'mp3' | 'aac';
  refImages?: AudioReferenceImage[];
}

export type AudioGenerateResult =
  | { ok: true; audioBytes: Buffer; mimeType?: string; text?: string }
  | { ok: false; error: string };

export abstract class AudioGenerator {
  abstract generate(req: AudioGenerateRequest): Promise<AudioGenerateResult>;
}

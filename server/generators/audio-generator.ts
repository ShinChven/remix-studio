import type { AudioProjectConfig } from '../../src/types';

export interface AudioReferenceImage {
  data: string;
  mimeType: string;
}

export interface AudioGenerateRequest {
  prompt: string;
  modelId?: string;
  modelVariant?: string;
  apiUrl?: string;
  audioConfig: AudioProjectConfig;
  outputFormat?: 'wav' | 'mp3' | 'aac';
  refImages?: AudioReferenceImage[];
}

export type AudioGenerateResult =
  | { ok: true; audioBytes: Buffer; mimeType?: string; text?: string }
  | { ok: true; status: 'processing'; taskId: string }
  | { ok: false; error: string };

export type AudioCheckStatusResult = {
  status: 'processing' | 'completed' | 'failed';
  audioBytes?: Buffer;
  mimeType?: string;
  text?: string;
  error?: string;
};

export abstract class AudioGenerator {
  abstract generate(req: AudioGenerateRequest): Promise<AudioGenerateResult>;
  checkStatus?(taskId: string): Promise<AudioCheckStatusResult>;
}

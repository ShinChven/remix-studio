import {
  createDefaultAudioProjectConfig,
  type AudioMusicProjectConfig,
  type AudioTtsProjectConfig,
} from '../../src/types';
import { AudioGenerator, AudioGenerateRequest, AudioGenerateResult } from './audio-generator';
import { ensureWavBuffer } from '../utils/audio-utils';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

export class GoogleAIAudioGenerator extends AudioGenerator {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || DEFAULT_BASE;
  }

  async generate(req: AudioGenerateRequest): Promise<AudioGenerateResult> {
    const model = req.modelId || DEFAULT_TTS_MODEL;
    return this.isLyriaModel(model)
      ? this.generateMusic(req, model)
      : this.generateTts(req, model);
  }

  private isLyriaModel(model: string): boolean {
    return model.startsWith('lyria-3-');
  }

  private buildGenerateContentUrl(model: string, reqApiUrl?: string): string {
    if (reqApiUrl) return reqApiUrl;

    if (this.apiUrl.includes('/models/')) {
      return this.apiUrl.replace(/\/models\/[^:/]+/, `/models/${model}`);
    }

    const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    return `${base}/v1beta/models/${model}:generateContent`;
  }

  private async postGenerateContent(url: string, payload: unknown): Promise<any> {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // @ts-ignore -- node-fetch timeout
      timeout: 180_000,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return res.json();
  }

  private collectTextParts(parts: any[] | undefined): string | undefined {
    const texts = (parts || [])
      .map((part) => (typeof part?.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean);

    return texts.length > 0 ? texts.join('\n\n') : undefined;
  }

  private extractInlineAudio(parts: any[] | undefined): { data: string; mimeType?: string } | null {
    for (const part of parts || []) {
      const inlineData = part?.inlineData || part?.inline_data;
      const data = inlineData?.data;
      if (typeof data === 'string' && data) {
        return {
          data,
          mimeType: inlineData?.mimeType || inlineData?.mime_type,
        };
      }
    }

    return null;
  }

  private async generateTts(req: AudioGenerateRequest, model: string): Promise<AudioGenerateResult> {
    const audioConfig: AudioTtsProjectConfig = req.audioConfig.kind === 'remix-audio-tts'
      ? req.audioConfig
      : createDefaultAudioProjectConfig('tts') as AudioTtsProjectConfig;

    const speechConfig = audioConfig.mode === 'multi' && audioConfig.speakers[1]
      ? {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: audioConfig.speakers.map((speaker) => ({
              speaker: speaker!.name,
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: speaker!.voice,
                },
              },
            })),
          },
        }
      : {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: audioConfig.speakers[0].voice,
            },
          },
        };

    const payload = {
      contents: [{ parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig,
      },
    };

    try {
      const result = await this.postGenerateContent(this.buildGenerateContentUrl(model, req.apiUrl), payload);

      if (result.promptFeedback?.blockReason) {
        return { ok: false, error: `Prompt blocked: ${result.promptFeedback.blockReason}` };
      }

      const candidate = result.candidates?.[0];
      if (!candidate) return { ok: false, error: 'No candidates in response' };

      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return { ok: false, error: `Finish reason: ${finishReason}` };
      }

      const audioPart = this.extractInlineAudio(candidate.content?.parts);
      if (!audioPart?.data) return { ok: false, error: 'No audio data in response' };

      const pcm = Buffer.from(audioPart.data, 'base64');
      return {
        ok: true,
        audioBytes: ensureWavBuffer(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 }),
        mimeType: 'audio/wav',
        text: this.collectTextParts(candidate.content?.parts),
      };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  private async generateMusic(req: AudioGenerateRequest, model: string): Promise<AudioGenerateResult> {
    const audioConfig: AudioMusicProjectConfig = req.audioConfig.kind === 'remix-audio-music'
      ? req.audioConfig
      : createDefaultAudioProjectConfig('music') as AudioMusicProjectConfig;

    const prompt = audioConfig.mode === 'instrumental'
      ? `${req.prompt}\n\nInstrumental only, no vocals.`
      : req.prompt;

    const parts: any[] = [{ text: prompt }];

    for (const image of req.refImages?.slice(0, 10) || []) {
      parts.push({
        inline_data: {
          mime_type: image.mimeType,
          data: image.data,
        },
      });
    }

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['AUDIO', 'TEXT'],
    };

    if (model === 'lyria-3-pro-preview' && req.outputFormat === 'wav') {
      generationConfig.responseMimeType = 'audio/wav';
    }

    const payload = {
      contents: [{ role: 'user', parts }],
      generationConfig,
    };

    try {
      const result = await this.postGenerateContent(this.buildGenerateContentUrl(model, req.apiUrl), payload);

      if (result.promptFeedback?.blockReason) {
        return { ok: false, error: `Prompt blocked: ${result.promptFeedback.blockReason}` };
      }

      const candidate = result.candidates?.[0];
      if (!candidate) return { ok: false, error: 'No candidates in response' };

      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return { ok: false, error: `Finish reason: ${finishReason}` };
      }

      const audioPart = this.extractInlineAudio(candidate.content?.parts);
      if (!audioPart?.data) return { ok: false, error: 'No audio data in response' };

      return {
        ok: true,
        audioBytes: Buffer.from(audioPart.data, 'base64'),
        mimeType: audioPart.mimeType || 'audio/mpeg',
        text: this.collectTextParts(candidate.content?.parts),
      };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }
}

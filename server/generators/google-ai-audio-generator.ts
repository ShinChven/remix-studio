import {
  createDefaultAudioProjectConfig,
  type AudioMusicProjectConfig,
  type AudioTtsProjectConfig,
} from '../../src/types';
import { AudioGenerator, AudioGenerateRequest, AudioGenerateResult, AudioCheckStatusResult } from './audio-generator';
import { GoogleInteractionsClient } from '../utils/google-interactions';
import { ensureWavBuffer } from '../utils/audio-utils';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-tts';

export class GoogleAIAudioGenerator extends AudioGenerator {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || DEFAULT_BASE;
  }

  async generate(req: AudioGenerateRequest): Promise<AudioGenerateResult> {
    const model = req.modelId === 'gemini-3.1-flash-tts-preview'
      ? 'gemini-3.8-flash-lite-tts'
      : req.modelId || DEFAULT_TTS_MODEL;
    if (model === 'lyria-3.5') return this.generateLyria35(req);
    return this.isLyriaModel(model)
      ? this.generateMusic(req, model)
      : this.generateTts(req, model);
  }

  private async generateLyria35(req: AudioGenerateRequest): Promise<AudioGenerateResult> {
    try {
      const instrumental = req.audioConfig.kind === 'remix-audio-music' && req.audioConfig.mode === 'instrumental';
      const input = [
        { type: 'text', text: instrumental ? `${req.prompt}\n\nInstrumental only, no vocals.` : req.prompt },
        ...(req.refImages || []).slice(0, 10).map((image) => ({ type: 'image', data: image.data, mime_type: image.mimeType })),
      ];
      const result = await new GoogleInteractionsClient(this.apiKey, this.apiUrl).create({
        model: 'lyria-3.5',
        input,
        response_format: { type: 'audio', ...(req.outputFormat === 'wav' ? { mime_type: 'audio/wav' } : {}) },
      });
      if (!result.id) throw new Error(result.error?.message || 'Lyria did not return an interaction ID');
      return { ok: true, status: 'processing', taskId: result.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async checkStatus(taskId: string): Promise<AudioCheckStatusResult> {
    const result = await new GoogleInteractionsClient(this.apiKey, this.apiUrl).check(taskId);
    if (result.status !== 'completed') return result;
    const audio = result.content.find((part) => part.type === 'audio' && part.data);
    if (!audio?.data) return { status: 'failed', error: 'Lyria completed without audio data' };
    const text = result.content.filter((part) => part.type === 'text' && part.text).map((part) => part.text).join('\n\n');
    return { status: 'completed', audioBytes: Buffer.from(audio.data, 'base64'), mimeType: audio.mime_type || 'audio/mpeg', text: text || undefined };
  }

  private isLyriaModel(model: string): boolean {
    return model.startsWith('lyria-3-');
  }

  protected buildGenerateContentUrl(model: string, reqApiUrl?: string): string {
    if (reqApiUrl) return reqApiUrl;

    if (this.apiUrl.includes('/models/')) {
      return this.apiUrl.replace(/\/models\/[^:/]+/, `/models/${model}`);
    }

    const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    return `${base}/v1beta/models/${model}:generateContent`;
  }

  protected async postGenerateContent(url: string, payload: unknown): Promise<any> {
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

    const modern = /^gemini-3\.8-(?:flash|flash-lite)-tts/.test(model);
    const [primary, secondary] = audioConfig.speakers;
    const voiceConfig = (voice: string) => modern ? { voice } : { prebuiltVoiceConfig: { voiceName: voice } };
    const multiSpeaker = audioConfig.mode === 'multi' && secondary && primary.name !== secondary.name;
    const speechConfig = multiSpeaker
      ? {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [primary, secondary].map((speaker) => ({
              speaker: speaker.name,
              voiceConfig: voiceConfig(speaker.voice),
            })),
          },
        }
      : { voiceConfig: voiceConfig(primary.voice) };

    const parts = modern && multiSpeaker
      ? this.speechTurns(req.prompt, [primary.name, secondary.name])
      : [{ text: req.prompt }];
    const payload = {
      contents: [{ parts }],
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

  private speechTurns(prompt: string, speakers: [string, string]) {
    const turns: { text: string; speechMetadata: { speaker: string; style?: string } }[] = [];
    let stageDirection = '';
    for (const line of prompt.split(/\r?\n/)) {
      const label = line.match(/^\s*([^:：]+)[:：]\s*(.*)$/);
      const speaker = label && speakers.find((name) => name.toLowerCase() === label[1].trim().toLowerCase());
      if (speaker) {
        turns.push({ text: label[2], speechMetadata: { speaker } });
      } else if (turns.length) {
        turns[turns.length - 1].text += `\n${line}`;
      } else {
        stageDirection += `\n${line}`;
      }
    }

    const dialogue = turns.filter((turn) => turn.text.trim());
    if (!dialogue.length) return [{ text: prompt, speechMetadata: { speaker: speakers[0] } }];
    if (stageDirection.trim()) dialogue[0].speechMetadata.style = stageDirection.trim();
    return dialogue;
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

import { APIMART_TTS_VOICES } from '../../src/types';
import {
  APIMartClient, apimartError, apimartMediaUrl, apimartTaskId, apimartTaskState, downloadAPIMartMedia,
} from '../utils/apimart';
import { AudioGenerator, type AudioGenerateRequest, type AudioGenerateResult, type AudioCheckStatusResult } from './audio-generator';

export class APIMartAudioGenerator extends AudioGenerator {
  private client: APIMartClient;
  constructor(private apiKey: string, private apiUrl?: string) {
    super();
    this.client = new APIMartClient(apiKey, apiUrl);
  }

  async generate(req: AudioGenerateRequest): Promise<AudioGenerateResult> {
    try {
      const client = new APIMartClient(this.apiKey, req.apiUrl || this.apiUrl);
      const model = req.modelId || 'suno';
      if (model === 'gpt-4o-mini-tts') {
        const voice = req.audioConfig.kind === 'remix-audio-tts' ? req.audioConfig.speakers[0]?.voice : undefined;
        const responseFormat = req.outputFormat === 'aac' ? 'aac' : 'wav';
        const res = await client.request('audio/speech', {
          model, input: req.prompt,
          voice: APIMART_TTS_VOICES.includes(voice as any) ? voice : 'alloy',
          response_format: responseFormat,
        });
        return { ok: true, audioBytes: Buffer.from(await res.arrayBuffer()), mimeType: responseFormat === 'aac' ? 'audio/aac' : 'audio/wav' };
      }
      if (!['suno', 'flowmusic'].includes(model)) throw new Error(`Unsupported APIMart audio model: ${model}`);
      const instrumental = req.audioConfig.kind === 'remix-audio-music' && req.audioConfig.mode === 'instrumental';
      // Structure tags distinguish explicit lyrics from a music/style description.
      const lyrics = !instrumental && /^\s*\[(?:verse|chorus|intro|bridge|outro|hook)\b/im.test(req.prompt);
      const payload: Record<string, unknown> = model === 'suno' ? {
        model, version: req.modelVariant || 'v6', prompt: req.prompt,
        custom: lyrics, instrumental,
        audio_format: req.outputFormat === 'mp3' ? 'mp3' : 'wav',
      } : {
        model, ...(req.modelVariant ? { version: req.modelVariant } : {}),
        ...(lyrics ? { lyrics: req.prompt } : { sound_prompt: `${instrumental ? 'Instrumental, no vocals. ' : ''}${req.prompt}` }),
      };
      if (model === 'suno' && !lyrics && Array.from(req.prompt).length > 3000) {
        throw new Error('Suno inspiration prompts support at most 3000 characters; use lyric structure tags for custom lyrics (up to 5000).');
      }
      const json = await client.json('music/generations', payload);
      const taskId = apimartTaskId(json);
      if (!taskId) throw new Error('No task_id in APIMart music response');
      return { ok: true, status: 'processing', taskId };
    } catch (e: any) {
      return { ok: false, error: e.message || 'APIMart audio generation failed' };
    }
  }

  async checkStatus(taskId: string): Promise<AudioCheckStatusResult> {
    try {
      const json = await this.client.json(`music/tasks/${encodeURIComponent(taskId)}`);
      const status = apimartTaskState(json);
      if (status === 'failed') return { status, error: apimartError(json.data) || apimartError(json) || 'APIMart music task failed' };
      if (status !== 'completed') return { status };
      const track = (json.data?.result || json.result)?.music?.[0];
      const url = apimartMediaUrl(track?.wav_url) || apimartMediaUrl(track?.audio_url);
      if (!url) return { status: 'failed', error: 'APIMart music completed without an audio URL' };
      const media = await downloadAPIMartMedia(url);
      return { status: 'completed', audioBytes: media.bytes, mimeType: media.mimeType, text: track?.lyrics };
    } catch {
      return { status: 'processing' };
    }
  }
}

import {
  createDefaultAudioProjectConfig,
  type AudioMusicProjectConfig,
} from '../../src/types';
import { AudioGenerator, AudioGenerateRequest, AudioGenerateResult } from './audio-generator';
import {
  MINIMAX_DEFAULT_BASE_URL,
  miniMaxApiRoot,
  miniMaxBaseRespError,
  normalizeMiniMaxBaseUrl,
  type MiniMaxBaseResp,
} from '../utils/minimax';

type MiniMaxMusicResponse = {
  data?: {
    audio?: string;
    status?: number;
  };
  base_resp?: MiniMaxBaseResp;
};

const DEFAULT_MODEL = 'music-3.0';

/** Published field limits; exceeding either is a 2013 parameter error. */
const PROMPT_LIMIT = 2000;
const LYRICS_LIMIT = 3500;

/**
 * Song-structure tags the music models understand. A prompt that uses them is
 * read as lyrics rather than as a style description.
 */
const STRUCTURE_TAG = /^[ \t]*\[(intro|verse|pre.?chorus|chorus|post.?chorus|interlude|bridge|outro|transition|break|hook|build.?up|inst|solo)\b[^\]]*\][ \t]*$/im;

export class MiniMaxAudioGenerator extends AudioGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = apiUrl
      ? miniMaxApiRoot(normalizeMiniMaxBaseUrl(apiUrl), 'v1')
      : MINIMAX_DEFAULT_BASE_URL;
  }

  async generate(req: AudioGenerateRequest): Promise<AudioGenerateResult> {
    const model = req.modelId || DEFAULT_MODEL;
    const audioConfig: AudioMusicProjectConfig = req.audioConfig.kind === 'remix-audio-music'
      ? req.audioConfig
      : (createDefaultAudioProjectConfig('music') as AudioMusicProjectConfig);

    const prompt = (req.prompt || '').trim();
    if (!prompt) {
      return { ok: false, error: 'MiniMax music generation requires a prompt' };
    }

    const format = this.resolveFormat(req.outputFormat);

    const payload: Record<string, unknown> = {
      model,
      output_format: 'hex',
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format,
      },
      ...this.resolveComposition(prompt, audioConfig.mode),
    };

    try {
      const res = await fetch(`${this.baseUrl}/music_generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result = (await res.json()) as MiniMaxMusicResponse;

      const baseRespError = miniMaxBaseRespError(result.base_resp);
      if (baseRespError) return { ok: false, error: baseRespError };

      const hex = result.data?.audio;
      if (!hex) return { ok: false, error: 'No audio data in MiniMax response' };

      return {
        ok: true,
        audioBytes: Buffer.from(hex, 'hex'),
        mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }

  /**
   * The API splits a song into a style `prompt` and `lyrics`, while a project
   * carries one composed prompt. Instrumental jobs send it as the style
   * description. For a vocal job, a prompt that uses the documented structure
   * tags (`[Verse]`, `[Chorus]`, …) is taken as the lyrics — with any text ahead
   * of the first tag kept as the style description — and a prompt without them
   * stays a style description that the lyrics optimizer turns into lyrics.
   */
  private resolveComposition(prompt: string, mode: AudioMusicProjectConfig['mode']): Record<string, unknown> {
    if (mode === 'instrumental') {
      return {
        prompt: prompt.slice(0, PROMPT_LIMIT),
        is_instrumental: true,
      };
    }

    const match = STRUCTURE_TAG.exec(prompt);
    if (!match) {
      return {
        prompt: prompt.slice(0, PROMPT_LIMIT),
        lyrics_optimizer: true,
      };
    }

    const style = prompt.slice(0, match.index).trim();
    const lyrics = prompt.slice(match.index).trim();

    return {
      ...(style ? { prompt: style.slice(0, PROMPT_LIMIT) } : {}),
      lyrics: lyrics.slice(0, LYRICS_LIMIT),
    };
  }

  private resolveFormat(outputFormat?: string): 'mp3' | 'wav' {
    // AAC is not a MiniMax output format; MP3 is the closest lossy match.
    return outputFormat === 'wav' ? 'wav' : 'mp3';
  }
}

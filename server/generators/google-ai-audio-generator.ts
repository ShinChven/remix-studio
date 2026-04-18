import { AudioGenerator, AudioGenerateRequest, AudioGenerateResult } from './audio-generator';
import { ensureWavBuffer } from '../utils/audio-utils';

export class GoogleAIAudioGenerator extends AudioGenerator {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://generativelanguage.googleapis.com';
  }

  async generate(req: AudioGenerateRequest): Promise<AudioGenerateResult> {
    const { prompt, audioConfig, modelId, apiUrl: reqApiUrl } = req;
    const model = modelId || 'gemini-3.1-flash-tts-preview';

    const actualApiUrl = reqApiUrl
      ? reqApiUrl
      : `${this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl}/v1beta/models/${model}:generateContent`;

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
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig,
      },
    };

    try {
      const res = await fetch(`${actualApiUrl}${actualApiUrl.includes('?') ? '&' : '?'}key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // @ts-ignore -- node-fetch timeout
        timeout: 180_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${text}` };
      }

      const result: any = await res.json();

      if (result.promptFeedback?.blockReason) {
        return { ok: false, error: `Prompt blocked: ${result.promptFeedback.blockReason}` };
      }

      const candidate = result.candidates?.[0];
      if (!candidate) return { ok: false, error: 'No candidates in response' };

      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        return { ok: false, error: `Finish reason: ${finishReason}` };
      }

      const audioPart = candidate.content?.parts?.find((part: any) => part.inlineData?.data || part.inline_data?.data);
      const base64Data = audioPart?.inlineData?.data || audioPart?.inline_data?.data;
      if (!base64Data) return { ok: false, error: 'No audio data in response' };

      const pcm = Buffer.from(base64Data, 'base64');
      return {
        ok: true,
        audioBytes: ensureWavBuffer(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 }),
        mimeType: 'audio/wav',
      };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }
}

import OpenAI from 'openai';
import { TextGenerator, TextGenerateRequest, TextGenerateResult } from './text-generator';
import {
  MINIMAX_DEFAULT_BASE_URL,
  miniMaxApiRoot,
  normalizeMiniMaxBaseUrl,
  stripThinkTags,
} from '../utils/minimax';

const DEFAULT_MODEL = 'MiniMax-M3';

/**
 * MiniMax text generator. The platform exposes an OpenAI Chat Completions
 * compatible endpoint, so the OpenAI SDK is pointed at api.minimax.io.
 *
 * Two MiniMax-only fields ride along with the request: `reasoning_split` moves
 * the model's thinking out of `content` and into `reasoning_details`, and
 * `max_completion_tokens` replaces the deprecated `max_tokens`.
 */
export class MiniMaxTextGenerator extends TextGenerator {
  private client: OpenAI;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.client = new OpenAI({
      apiKey,
      baseURL: apiUrl
        ? miniMaxApiRoot(normalizeMiniMaxBaseUrl(apiUrl), 'v1')
        : MINIMAX_DEFAULT_BASE_URL,
    });
  }

  async generate(req: TextGenerateRequest): Promise<TextGenerateResult> {
    try {
      const { prompt, systemPrompt, modelId, temperature = 0.7, maxTokens = 2048, refImagesBase64 } = req;
      const model = modelId || DEFAULT_MODEL;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      if (refImagesBase64 && refImagesBase64.length > 0) {
        const content: OpenAI.Chat.ChatCompletionContentPart[] = [];
        for (const base64 of refImagesBase64) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${base64}` },
          });
        }
        content.push({ type: 'text', text: prompt });
        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
      };

      const response = await this.client.chat.completions.create({
        ...params,
        reasoning_split: true,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

      const choice = response.choices[0];
      if (!choice) return { ok: false, error: 'No choices in response' };

      const text = stripThinkTags(choice.message.content || '');
      if (!text) {
        return choice.finish_reason === 'length'
          ? { ok: false, error: 'MiniMax returned only reasoning before hitting the max tokens limit — raise max tokens' }
          : { ok: false, error: 'No text content in response' };
      }

      return { ok: true, text };
    } catch (e: any) {
      return { ok: false, error: `${e?.name || 'Error'}: ${e?.message}` };
    }
  }
}

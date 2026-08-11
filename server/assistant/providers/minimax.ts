import { OpenAIChatProvider } from './openai';
import type { ChatRequest, ChatResponse } from './types';
import {
  MINIMAX_DEFAULT_BASE_URL,
  miniMaxApiRoot,
  normalizeMiniMaxBaseUrl,
  stripThinkTags,
} from '../../utils/minimax';

/**
 * MiniMax chat adapter. The platform speaks the OpenAI Chat Completions
 * protocol — including tool calls — so the OpenAI adapter is pointed at
 * api.minimax.io. Users can override the URL when registering the provider to
 * target the mainland China endpoint (api.minimaxi.com).
 *
 * The M-series models always reason first. `reasoning_split` moves that
 * reasoning into `reasoning_details`, and the `<think>` strip covers a model
 * that ignores the flag and inlines its reasoning instead.
 */
export class MiniMaxChatProvider extends OpenAIChatProvider {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl ? miniMaxApiRoot(normalizeMiniMaxBaseUrl(apiUrl), 'v1') : MINIMAX_DEFAULT_BASE_URL);
  }

  protected extraBody(): Record<string, unknown> {
    return { reasoning_split: true };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const response = await super.chat(req);
    return { ...response, text: stripThinkTags(response.text) };
  }
}

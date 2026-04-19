import { OpenAIChatProvider } from './openai';

const DEFAULT_GROK_BASE_URL = 'https://api.x.ai/v1';

/**
 * Grok (xAI) chat adapter. xAI's API is OpenAI-compatible, so we just wrap
 * the OpenAI adapter with xAI's default base URL when the user didn't
 * configure a custom one.
 */
export class GrokChatProvider extends OpenAIChatProvider {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl ?? DEFAULT_GROK_BASE_URL);
  }
}

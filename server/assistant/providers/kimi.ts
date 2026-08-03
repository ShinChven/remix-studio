import { OpenAIChatProvider } from './openai';

const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.ai/v1';

/**
 * Moonshot AI (Kimi) chat adapter. The Kimi platform speaks the OpenAI Chat
 * Completions protocol, so we point the OpenAI adapter at the Moonshot base
 * URL by default. Users can override the URL when registering the provider to
 * target the mainland China endpoint (api.moonshot.cn).
 */
export class KimiChatProvider extends OpenAIChatProvider {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl ?? DEFAULT_KIMI_BASE_URL);
  }
}

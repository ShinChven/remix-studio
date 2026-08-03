import { OpenAITextGenerator } from './openai-text-generator';

const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.ai/v1';

/**
 * Moonshot AI (Kimi) text generator. The Kimi platform exposes an OpenAI
 * Chat Completions-compatible endpoint, so we reuse the OpenAI generator with
 * the Moonshot base URL. Users can override the URL when registering the
 * provider to target the mainland China endpoint (api.moonshot.cn).
 */
export class KimiTextGenerator extends OpenAITextGenerator {
  constructor(apiKey: string, apiUrl?: string) {
    super(apiKey, apiUrl ?? DEFAULT_KIMI_BASE_URL);
  }
}

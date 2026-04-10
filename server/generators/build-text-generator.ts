import type { ProviderType } from '../../src/types';
import { TextGenerator } from './text-generator';
import { GoogleAITextGenerator } from './google-ai-text-generator';
import { VertexAITextGenerator } from './vertex-ai-text-generator';
import { OpenAITextGenerator } from './openai-text-generator';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

/**
 * Instantiate the correct text generator for a given provider type and credentials.
 * Throws if the provider type does not support text generation.
 */
export function buildTextGenerator(
  type: ProviderType,
  apiKey: string,
  apiUrl?: string | null
): TextGenerator {
  const safeApiUrl = assertSafeProviderApiUrl(type, apiUrl);

  switch (type) {
    case 'GoogleAI':
      return new GoogleAITextGenerator(apiKey, safeApiUrl);
    case 'VertexAI':
      return new VertexAITextGenerator(apiKey, safeApiUrl);
    case 'OpenAI':
      return new OpenAITextGenerator(apiKey, safeApiUrl);
    default:
      throw new Error(`Provider type '${type}' does not support text generation`);
  }
}

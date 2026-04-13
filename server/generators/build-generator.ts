import type { ProviderType } from '../../src/types';
import { ImageGenerator } from './image-generator';
import { GoogleAIGenerator } from './google-ai-generator';
import { VertexAIGenerator } from './vertex-ai-generator';
import { RunningHubGenerator } from './running-hub-generator';
import { KlingAIGenerator } from './kling-ai-generator';
import { OpenAIGenerator } from './openai-generator';
import { GrokGenerator } from './grok-generator';
import { BytePlusGenerator } from './byteplus-generator';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

/**
 * Instantiate the correct generator for a given provider type and credentials.
 * All classNames are kept in a discriminated union so TypeScript can catch
 * unknown provider types at compile time.
 */
export function buildGenerator(
  type: ProviderType,
  apiKey: string,
  apiUrl?: string | null
): ImageGenerator {
  const safeApiUrl = assertSafeProviderApiUrl(type, apiUrl);

  switch (type) {
    case 'GoogleAI':
      return new GoogleAIGenerator(apiKey, safeApiUrl);
    case 'VertexAI':
      return new VertexAIGenerator(apiKey, safeApiUrl);
    case 'RunningHub':
      return new RunningHubGenerator(apiKey, safeApiUrl);
    case 'KlingAI':
      return new KlingAIGenerator(apiKey, safeApiUrl);
    case 'OpenAI':
      return new OpenAIGenerator(apiKey, safeApiUrl);
    case 'Grok':
      return new GrokGenerator(apiKey, safeApiUrl);
    case 'BytePlus':
      return new BytePlusGenerator(apiKey, safeApiUrl);
    case 'Claude':
      throw new Error(`Provider type 'Claude' does not support image generation`);
    default: {
      // Exhaustiveness check — TypeScript will error here if a new ProviderType is added
      const _never: never = type;
      throw new Error(`Unknown provider type: ${_never}`);
    }
  }
}

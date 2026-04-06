import type { ProviderType } from '../../src/types';
import { ImageGenerator } from './image-generator';
import { GoogleAIGenerator } from './google-ai-generator';
import { VertexAIGenerator } from './vertex-ai-generator';
import { RunningHubGenerator } from './running-hub-generator';
import { OpenAIGenerator } from './openai-generator';

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
  switch (type) {
    case 'GoogleAI':
      return new GoogleAIGenerator(apiKey, apiUrl ?? undefined);
    case 'VertexAI':
      return new VertexAIGenerator(apiKey, apiUrl ?? undefined);
    case 'RunningHub':
      return new RunningHubGenerator(apiKey, apiUrl ?? undefined);
    case 'OpenAI':
      return new OpenAIGenerator(apiKey, apiUrl ?? undefined);
    default: {
      // Exhaustiveness check — TypeScript will error here if a new ProviderType is added
      const _never: never = type;
      throw new Error(`Unknown provider type: ${_never}`);
    }
  }
}

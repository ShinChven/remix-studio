import type { ProviderType } from '../../src/types';
import { VideoGenerator } from './video-generator';
import { GoogleAIVideoGenerator } from './google-ai-video-generator';
import { OpenAIVideoGenerator } from './openai-video-generator';
import { GrokVideoGenerator } from './grok-video-generator';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

/**
 * Instantiate the correct video generator for a given provider type and credentials.
 * Only GoogleAI, OpenAI, and Grok support first-party video generation.
 */
export function buildVideoGenerator(
  type: ProviderType,
  apiKey: string,
  apiUrl?: string | null
): VideoGenerator {
  const safeApiUrl = assertSafeProviderApiUrl(type, apiUrl);

  switch (type) {
    case 'GoogleAI':
      return new GoogleAIVideoGenerator(apiKey, safeApiUrl);
    case 'VertexAI':
      throw new Error(`Provider type 'VertexAI' does not support video generation`);
    case 'OpenAI':
      return new OpenAIVideoGenerator(apiKey, safeApiUrl);
    case 'Grok':
      return new GrokVideoGenerator(apiKey, safeApiUrl);
    case 'RunningHub':
      throw new Error(`Provider type 'RunningHub' does not support video generation`);
    case 'Claude':
      throw new Error(`Provider type 'Claude' does not support video generation`);
    case 'BytePlus':
      throw new Error(`Provider type 'BytePlus' does not support video generation`);
    default: {
      const _never: never = type;
      throw new Error(`Unknown provider type: ${_never}`);
    }
  }
}

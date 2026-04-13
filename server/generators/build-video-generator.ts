import type { ProviderType } from '../../src/types';
import { VideoGenerator } from './video-generator';
import { GoogleAIVideoGenerator } from './google-ai-video-generator';
import { OpenAIVideoGenerator } from './openai-video-generator';
import { GrokVideoGenerator } from './grok-video-generator';
import { BytePlusVideoGenerator } from './byteplus-video-generator';
import { KlingAIVideoGenerator } from './kling-ai-video-generator';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

/**
 * Instantiate the correct video generator for a given provider type and credentials.
 * Only GoogleAI, OpenAI, and Grok support first-party video generation.
 */
export function buildVideoGenerator(
  type: ProviderType,
  apiKey: string,
  apiUrl?: string | null,
  apiSecret?: string | null
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
    case 'KlingAI':
      return new KlingAIVideoGenerator(apiKey, apiSecret || '', safeApiUrl);
    case 'Claude':
      throw new Error(`Provider type 'Claude' does not support video generation`);
    case 'BytePlus':
      return new BytePlusVideoGenerator(apiKey, safeApiUrl);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

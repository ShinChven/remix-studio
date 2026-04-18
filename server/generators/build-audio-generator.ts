import type { ProviderType } from '../../src/types';
import { AudioGenerator } from './audio-generator';
import { GoogleAIAudioGenerator } from './google-ai-audio-generator';
import { VertexAIAudioGenerator } from './vertex-ai-audio-generator';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

export function buildAudioGenerator(
  type: ProviderType,
  apiKey: string,
  apiUrl?: string | null
): AudioGenerator {
  const safeApiUrl = assertSafeProviderApiUrl(type, apiUrl);

  switch (type) {
    case 'GoogleAI':
      return new GoogleAIAudioGenerator(apiKey, safeApiUrl);
    case 'VertexAI':
      return new VertexAIAudioGenerator(apiKey, safeApiUrl);
    case 'RunningHub':
    case 'KlingAI':
    case 'OpenAI':
    case 'Grok':
    case 'Claude':
    case 'BytePlus':
    case 'Replicate':
    case 'BlackForestLabs':
      throw new Error(`Provider type '${type}' does not support audio generation`);
    default:
      throw new Error(`Provider type '${type}' does not support audio generation`);
  }
}

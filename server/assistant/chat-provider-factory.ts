import type { ProviderType } from '../../src/types';
import { ChatProvider } from './providers/types';
import { OpenAIChatProvider } from './providers/openai';
import { ClaudeChatProvider } from './providers/anthropic';
import { GoogleAIChatProvider } from './providers/google';
import { GrokChatProvider } from './providers/grok';
import type { ProviderRepository } from '../db/provider-repository';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

export const ASSISTANT_SUPPORTED_PROVIDER_TYPES: ProviderType[] = [
  'OpenAI',
  'Claude',
  'GoogleAI',
  'Grok',
];

export function isAssistantCapableProviderType(type: ProviderType): boolean {
  return ASSISTANT_SUPPORTED_PROVIDER_TYPES.includes(type);
}

export function buildChatProvider(type: ProviderType, apiKey: string, apiUrl?: string | null): ChatProvider {
  const safeApiUrl = assertSafeProviderApiUrl(type, apiUrl ?? undefined);
  switch (type) {
    case 'OpenAI':
      return new OpenAIChatProvider(apiKey, safeApiUrl);
    case 'Claude':
      return new ClaudeChatProvider(apiKey, safeApiUrl);
    case 'GoogleAI':
      return new GoogleAIChatProvider(apiKey, safeApiUrl);
    case 'Grok':
      return new GrokChatProvider(apiKey, safeApiUrl);
    default:
      throw new Error(`Provider type '${type}' is not supported by the assistant chat runtime`);
  }
}

/**
 * Resolves a provider record from persistence and instantiates the matching
 * chat adapter. Throws if the provider is missing, doesn't belong to the
 * user, lacks credentials, or isn't assistant-capable.
 */
export async function resolveChatProvider(
  providerRepository: ProviderRepository,
  userId: string,
  providerId: string,
): Promise<{ provider: ChatProvider; type: ProviderType }> {
  const record = await providerRepository.getProvider(userId, providerId);
  if (!record) {
    throw new Error('Provider not found');
  }

  const type = record.type as ProviderType;
  if (!isAssistantCapableProviderType(type)) {
    throw new Error(`Provider type '${type}' is not supported by the assistant chat runtime`);
  }

  const apiKey = await providerRepository.getDecryptedApiKey(userId, providerId);
  if (!apiKey) {
    throw new Error('Provider is missing an API key');
  }

  return {
    provider: buildChatProvider(type, apiKey, record.apiUrl),
    type,
  };
}

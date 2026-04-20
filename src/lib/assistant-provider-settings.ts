import type { Provider } from '../types';
import { getTextModelsForProvider } from '../types';

export const ASSISTANT_ENABLED_PROVIDERS_STORAGE_KEY = 'assistant_enabled_provider_ids';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getStoredEnabledAssistantProviderIds(): string[] | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(ASSISTANT_ENABLED_PROVIDERS_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  } catch {
    return null;
  }
}

export function setStoredEnabledAssistantProviderIds(providerIds: string[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    ASSISTANT_ENABLED_PROVIDERS_STORAGE_KEY,
    JSON.stringify([...new Set(providerIds)]),
  );
}

export function resolveEnabledAssistantProviderIds(providers: Provider[]): string[] {
  const availableIds = providers
    .filter((provider) => getTextModelsForProvider(provider.type).length > 0)
    .map((provider) => provider.id);

  if (availableIds.length === 0) return [];

  const storedIds = getStoredEnabledAssistantProviderIds();
  if (!storedIds || storedIds.length === 0) {
    return availableIds;
  }

  const normalized = storedIds.filter((providerId) => availableIds.includes(providerId));
  return normalized.length > 0 ? normalized : availableIds;
}

export function filterEnabledAssistantProviders(providers: Provider[]) {
  const enabledIds = resolveEnabledAssistantProviderIds(providers);
  return providers.filter((provider) => enabledIds.includes(provider.id));
}

export function normalizeAssistantProviderSelection(
  providers: Provider[],
  preferredProviderId: string,
  preferredModelId: string,
) {
  const selectedProvider = providers.find((provider) => provider.id === preferredProviderId)
    || providers.find((provider) => getTextModelsForProvider(provider.type).length > 0)
    || null;

  if (!selectedProvider) {
    return { providerId: '', modelId: '' };
  }

  const models = getTextModelsForProvider(selectedProvider.type);
  const selectedModelId = models.find((model) => model.id === preferredModelId)?.id
    || models[0]?.id
    || '';

  return {
    providerId: selectedProvider.id,
    modelId: selectedModelId,
  };
}

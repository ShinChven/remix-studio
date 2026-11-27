import { fetchAssistantSettings, updateAssistantSettings, type AssistantSettings } from '../api';
import type { Provider } from '../types';
import { getTextModelsForProvider } from '../types';

/** Keys these preferences used to live under in the browser, imported once into the account. */
const LEGACY_ENABLED_PROVIDERS_KEY = 'assistant_enabled_provider_ids';
const LEGACY_PROVIDER_KEY = 'assistant_last_provider';
const LEGACY_MODEL_KEY = 'assistant_last_model';

const EMPTY_SETTINGS: AssistantSettings = { enabledProviderIds: [], lastProviderId: null, lastModelId: null };

let cached: AssistantSettings | null = null;
let loading: Promise<AssistantSettings> | null = null;

function readLegacy(): Partial<AssistantSettings> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const storage = window.localStorage;
    const patch: Partial<AssistantSettings> = {};
    const raw = storage.getItem(LEGACY_ENABLED_PROVIDERS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
          if (ids.length > 0) patch.enabledProviderIds = ids;
        }
      } catch {
        // Ignore a malformed value.
      }
    }
    const providerId = storage.getItem(LEGACY_PROVIDER_KEY);
    const modelId = storage.getItem(LEGACY_MODEL_KEY);
    if (providerId) patch.lastProviderId = providerId;
    if (modelId) patch.lastModelId = modelId;
    return Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
}

function clearLegacy() {
  try {
    window.localStorage.removeItem(LEGACY_ENABLED_PROVIDERS_KEY);
    window.localStorage.removeItem(LEGACY_PROVIDER_KEY);
    window.localStorage.removeItem(LEGACY_MODEL_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

function isEmpty(settings: AssistantSettings) {
  return settings.enabledProviderIds.length === 0 && !settings.lastProviderId && !settings.lastModelId;
}

/** Settings already loaded in this tab, or null before the first load. */
export function getCachedAssistantSettings(): AssistantSettings | null {
  return cached;
}

/**
 * Load the account's chat preferences. The first load moves preferences an older version
 * kept in this browser into the account, when the account has none yet.
 */
export function loadAssistantSettings(): Promise<AssistantSettings> {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  loading = (async () => {
    let settings = await fetchAssistantSettings();
    const legacy = readLegacy();
    if (legacy && isEmpty(settings)) {
      settings = await updateAssistantSettings(legacy);
    }
    if (legacy) clearLegacy();
    cached = settings;
    return settings;
  })()
    .catch((error) => {
      console.error('Failed to load assistant settings:', error);
      return cached ?? EMPTY_SETTINGS;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Save part of the chat preferences. Unchanged values are not sent. */
export async function saveAssistantSettings(patch: Partial<AssistantSettings>): Promise<AssistantSettings> {
  const current = cached ?? EMPTY_SETTINGS;
  const changed: Partial<AssistantSettings> = {};
  if (patch.enabledProviderIds !== undefined && patch.enabledProviderIds.join('\n') !== current.enabledProviderIds.join('\n')) {
    changed.enabledProviderIds = [...new Set(patch.enabledProviderIds)];
  }
  if (patch.lastProviderId !== undefined && (patch.lastProviderId || null) !== current.lastProviderId) {
    changed.lastProviderId = patch.lastProviderId || null;
  }
  if (patch.lastModelId !== undefined && (patch.lastModelId || null) !== current.lastModelId) {
    changed.lastModelId = patch.lastModelId || null;
  }
  if (Object.keys(changed).length === 0) return current;
  // Update the cache first so quick successive picks compare against the latest choice.
  cached = { ...current, ...changed };
  const saved = await updateAssistantSettings(changed);
  cached = saved;
  return saved;
}

/** Remember the provider and model last picked in the composer. Failures are logged, not thrown. */
export function rememberAssistantModel(providerId: string, modelId: string) {
  if (!providerId || !cached) return;
  saveAssistantSettings({ lastProviderId: providerId, lastModelId: modelId || null }).catch((error) => {
    console.error('Failed to save assistant model preference:', error);
  });
}

export function resolveEnabledAssistantProviderIds(providers: Provider[], storedIds: string[] = cached?.enabledProviderIds ?? []): string[] {
  const availableIds = providers
    .filter((provider) => getTextModelsForProvider(provider.type).length > 0)
    .map((provider) => provider.id);

  if (availableIds.length === 0) return [];
  if (storedIds.length === 0) return availableIds;

  const normalized = storedIds.filter((providerId) => availableIds.includes(providerId));
  return normalized.length > 0 ? normalized : availableIds;
}

export function filterEnabledAssistantProviders(providers: Provider[], storedIds?: string[]) {
  const enabledIds = resolveEnabledAssistantProviderIds(providers, storedIds);
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

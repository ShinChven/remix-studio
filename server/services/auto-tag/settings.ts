import type { PrismaClient, Provider } from '@prisma/client';
import {
  AUTO_TAG_CONCURRENCY_LIMIT,
  AutoTagSettings,
  ModelConfig,
  ProviderType,
  getProviderRecordModels,
  providerAcceptsImageInput,
} from '../../../src/types';

/** The provider's text models when it can read images, or null when it cannot tag. */
export function taggingModels(provider: { type: string; models: unknown }): ModelConfig[] | null {
  if (!providerAcceptsImageInput(provider.type as ProviderType)) return null;
  return getProviderRecordModels(provider).filter((m) => m.category === 'text');
}

export interface ResolvedAutoTagSettings {
  settings: AutoTagSettings;
  /** The provider and model that tag, or null when auto-tagging is off. */
  target: { provider: Provider; model: ModelConfig } | null;
}

/**
 * A user's auto-tagging settings as they can run now. The provider may have
 * been deleted since they were saved, or the custom model removed from it; a
 * choice that no longer resolves reads back as unset rather than dangling.
 */
export async function resolveAutoTagSettings(prisma: PrismaClient, userId: string): Promise<ResolvedAutoTagSettings> {
  const setting = await prisma.autoTagSetting.findUnique({
    where: { userId },
    include: { provider: true },
  });
  if (!setting) {
    return {
      settings: { providerId: null, modelConfigId: null, concurrencyLimit: AUTO_TAG_CONCURRENCY_LIMIT.default },
      target: null,
    };
  }

  const models = setting.provider ? taggingModels(setting.provider) : null;
  const model = models?.find((m) => m.id === setting.modelConfigId) ?? null;
  return {
    settings: {
      providerId: models ? setting.providerId : null,
      modelConfigId: model ? model.id : null,
      concurrencyLimit: setting.concurrencyLimit,
    },
    target: setting.provider && model ? { provider: setting.provider, model } : null,
  };
}

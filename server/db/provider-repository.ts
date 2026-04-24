import { PrismaClient } from '@prisma/client';
import type { Provider, ProviderType, ProviderUsageSummary, CustomModelAlias } from '../../src/types';
import { PROVIDER_MODELS_MAP, resolveCustomModels } from '../../src/types';
import { encrypt, decrypt } from '../utils/crypto';

function toPublic(record: any, usage?: ProviderUsageSummary): Provider {
  const providerType = record.type as ProviderType;
  const baseModels = PROVIDER_MODELS_MAP[providerType] || [];
  const customAliases: CustomModelAlias[] = Array.isArray(record.models) ? record.models : [];
  const resolved = resolveCustomModels(providerType, customAliases);

  return {
    id: record.id,
    name: record.name,
    type: providerType,
    apiUrl: record.apiUrl ?? undefined,
    concurrency: record.concurrency ?? 1,
    hasKey: !!record.apiKeyEncrypted,
    hasSecret: !!record.apiSecretEncrypted,
    createdAt: record.createdAt instanceof Date ? record.createdAt.getTime() : record.createdAt,
    models: [...baseModels, ...resolved],
    customModels: customAliases.length > 0 ? customAliases : undefined,
    usage,
  };
}

export class ProviderRepository {
  constructor(private prisma: PrismaClient) {}

  async listProviders(userId: string): Promise<Provider[]> {
    const records = await this.prisma.provider.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const usageEntries = await Promise.all(
      records.map(async (record) => [record.id, await this.getProviderUsage(userId, record.id)] as const)
    );
    const usageByProviderId = new Map(usageEntries);
    return records.map((r) => toPublic(r, usageByProviderId.get(r.id)));
  }

  async getProvider(userId: string, providerId: string): Promise<any | null> {
    return this.prisma.provider.findFirst({ where: { id: providerId, userId } });
  }

  async getPublicProvider(userId: string, providerId: string): Promise<Provider | null> {
    const record = await this.getProvider(userId, providerId);
    if (!record) return null;
    const usage = await this.getProviderUsage(userId, providerId);
    return toPublic(record, usage);
  }

  async getProviderUsage(userId: string, providerId: string): Promise<ProviderUsageSummary> {
    const [projectCount, activeJobCount] = await Promise.all([
      this.prisma.project.count({ where: { userId, providerId } }),
      this.prisma.job.count({
        where: {
          userId,
          providerId,
          status: { in: ['pending', 'processing'] },
        },
      }),
    ]);

    return { projectCount, activeJobCount };
  }

  async createProvider(
    userId: string,
    data: { id: string; name: string; type: ProviderType; apiKey: string; apiSecret?: string; apiUrl?: string; concurrency?: number; customModels?: CustomModelAlias[] }
  ): Promise<void> {
    await this.prisma.provider.create({
      data: {
        id: data.id,
        userId,
        name: data.name,
        type: data.type,
        apiKeyEncrypted: encrypt(data.apiKey),
        apiSecretEncrypted: data.apiSecret ? encrypt(data.apiSecret) : null,
        apiUrl: data.apiUrl ?? null,
        concurrency: data.concurrency ?? 1,
        models: data.customModels && data.customModels.length > 0 ? data.customModels as any : undefined,
      } as any,
    });
  }

  async updateProvider(
    userId: string,
    providerId: string,
    updates: { name?: string; type?: ProviderType; apiKey?: string; apiSecret?: string; apiUrl?: string | null; concurrency?: number; customModels?: CustomModelAlias[] }
  ): Promise<void> {
    const data: any = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.type !== undefined) data.type = updates.type;
    if (updates.apiKey) data.apiKeyEncrypted = encrypt(updates.apiKey);
    if (updates.apiSecret) data.apiSecretEncrypted = encrypt(updates.apiSecret);
    if (updates.apiUrl !== undefined) data.apiUrl = updates.apiUrl;
    if (updates.concurrency !== undefined) data.concurrency = updates.concurrency;
    if (updates.customModels !== undefined) data.models = updates.customModels;

    const result = await this.prisma.provider.updateMany({ where: { id: providerId, userId }, data: data as any });
    if (result.count === 0) {
      throw new Error('Provider not found');
    }
  }

  async deleteProvider(userId: string, providerId: string): Promise<void> {
    const result = await this.prisma.provider.deleteMany({ where: { id: providerId, userId } });
    if (result.count === 0) {
      throw new Error('Provider not found');
    }
  }

  /** Returns the decrypted API key — only for internal server-side use. */
  async getDecryptedApiKey(userId: string, providerId: string): Promise<string | null> {
    const record = await this.getProvider(userId, providerId);
    if (!record?.apiKeyEncrypted) return null;
    return decrypt(record.apiKeyEncrypted);
  }

  async getDecryptedApiSecret(userId: string, providerId: string): Promise<string | null> {
    const record = await this.getProvider(userId, providerId);
    if (!record?.apiSecretEncrypted) return null;
    return decrypt(record.apiSecretEncrypted);
  }
}

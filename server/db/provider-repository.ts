import { PrismaClient } from '@prisma/client';
import type { Provider, ProviderType, ProviderUsageSummary } from '../../src/types';
import { PROVIDER_MODELS_MAP } from '../../src/types';
import { encrypt, decrypt } from '../utils/crypto';

function toPublic(record: any, usage?: ProviderUsageSummary): Provider {
  return {
    id: record.id,
    name: record.name,
    type: record.type as ProviderType,
    apiUrl: record.apiUrl ?? undefined,
    concurrency: record.concurrency ?? 1,
    hasKey: !!record.apiKeyEncrypted,
    createdAt: record.createdAt instanceof Date ? record.createdAt.getTime() : record.createdAt,
    models: PROVIDER_MODELS_MAP[record.type as ProviderType] || [],
    usage,
  };
}

export class ProviderRepository {
  constructor(private prisma: PrismaClient) {}

  async listProviders(userId: string): Promise<Provider[]> {
    const records = await this.prisma.provider.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
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
    data: { id: string; name: string; type: ProviderType; apiKey: string; apiUrl?: string; concurrency?: number }
  ): Promise<void> {
    await this.prisma.provider.create({
      data: {
        id: data.id,
        userId,
        name: data.name,
        type: data.type,
        apiKeyEncrypted: encrypt(data.apiKey),
        apiUrl: data.apiUrl ?? null,
        concurrency: data.concurrency ?? 1,
      },
    });
  }

  async updateProvider(
    userId: string,
    providerId: string,
    updates: { name?: string; type?: ProviderType; apiKey?: string; apiUrl?: string | null; concurrency?: number }
  ): Promise<void> {
    const data: any = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.type !== undefined) data.type = updates.type;
    if (updates.apiKey) data.apiKeyEncrypted = encrypt(updates.apiKey);
    if (updates.apiUrl !== undefined) data.apiUrl = updates.apiUrl;
    if (updates.concurrency !== undefined) data.concurrency = updates.concurrency;

    const result = await this.prisma.provider.updateMany({ where: { id: providerId, userId }, data });
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
}

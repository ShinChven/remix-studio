import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Provider, ProviderType, ModelConfig } from '../../src/types';
import { PROVIDER_MODELS_MAP } from '../../src/types';
import { encrypt, decrypt } from '../utils/crypto';

const TABLE_NAME = 'remix-studio';
const PK = 'PROVIDER';

interface ProviderRecord {
  pk: string;
  sk: string;             // "<userId>#<providerId>"
  userId: string;
  providerId: string;
  name: string;
  type: ProviderType;
  apiKeyEncrypted?: string;
  apiUrl?: string;
  concurrency?: number;
  createdAt: number;
  models?: any[];
}

function toPublic(record: ProviderRecord): Provider {
  return {
    id: record.providerId,
    name: record.name,
    type: record.type,
    apiUrl: record.apiUrl,
    concurrency: record.concurrency ?? 1,
    hasKey: !!record.apiKeyEncrypted,
    createdAt: record.createdAt,
    models: PROVIDER_MODELS_MAP[record.type] || [],
  };
}

export class ProviderRepository {
  constructor(private client: DynamoDBDocumentClient) {}

  async listProviders(userId: string): Promise<Provider[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': PK,
          ':prefix': `${userId}#`,
        },
      })
    );
    return (result.Items || []).map((item) => toPublic(item as ProviderRecord));
  }

  async getProvider(userId: string, providerId: string): Promise<ProviderRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: PK, sk: `${userId}#${providerId}` },
      })
    );
    return (result.Item as ProviderRecord) || null;
  }

  async createProvider(
    userId: string,
    data: { id: string; name: string; type: ProviderType; apiKey: string; apiUrl?: string; concurrency?: number }
  ): Promise<void> {
    const item: ProviderRecord = {
      pk: PK,
      sk: `${userId}#${data.id}`,
      userId,
      providerId: data.id,
      name: data.name,
      type: data.type,
      apiKeyEncrypted: encrypt(data.apiKey),
      ...(data.apiUrl ? { apiUrl: data.apiUrl } : {}),
      ...(data.concurrency !== undefined ? { concurrency: data.concurrency } : {}),
      createdAt: Date.now(),
    };
    await this.client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  async updateProvider(
    userId: string,
    providerId: string,
    updates: { name?: string; type?: ProviderType; apiKey?: string; apiUrl?: string | null; concurrency?: number }
  ): Promise<void> {
    const existing = await this.getProvider(userId, providerId);
    if (!existing) throw new Error('Provider not found');

    const merged: ProviderRecord = {
      ...existing,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.type !== undefined ? { type: updates.type } : {}),
      // Only re-encrypt if a new key was provided
      ...(updates.apiKey ? { apiKeyEncrypted: encrypt(updates.apiKey) } : {}),
      // apiUrl: null means clear it; undefined means leave unchanged
      ...(updates.apiUrl === null
        ? { apiUrl: undefined }
        : updates.apiUrl !== undefined
        ? { apiUrl: updates.apiUrl }
        : {}),
      ...(updates.concurrency !== undefined ? { concurrency: updates.concurrency } : {}),
    };

    await this.client.send(new PutCommand({ TableName: TABLE_NAME, Item: merged }));
  }

  async deleteProvider(userId: string, providerId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: PK, sk: `${userId}#${providerId}` },
      })
    );
  }

  /** Returns the decrypted API key — only for internal server-side use. */
  async getDecryptedApiKey(userId: string, providerId: string): Promise<string | null> {
    const record = await this.getProvider(userId, providerId);
    if (!record?.apiKeyEncrypted) return null;
    return decrypt(record.apiKeyEncrypted);
  }
}

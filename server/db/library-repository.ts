import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Library, LibraryItem } from '../../src/types';

const TABLE_NAME = 'remix-studio';
const BATCH_LIMIT = 25;

export class LibraryRepository {
  constructor(private client: DynamoDBDocumentClient) { }

  async getUserLibraries(userId: string): Promise<Library[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': 'LIBRARY#' },
      })
    );

    const records = result.Items || [];
    const libraries: Record<string, Library> = {};

    // First pass, extract library metadata
    for (const record of records) {
      if (!record.sk.includes('#ITEM#')) {
        const id = record.sk.replace('LIBRARY#', '');
        libraries[id] = {
          id,
          name: record.name,
          type: record.type,
          items: [],
        };
      }
    }

    // Second pass, append items
    for (const record of records) {
      if (record.sk.includes('#ITEM#')) {
        const parts = record.sk.split('#'); // ['LIBRARY', '<libId>', 'ITEM', '<itemId>']
        if (parts.length >= 4) {
          const libId = parts[1];
          const itemId = parts[3];
          if (libraries[libId]) {
            libraries[libId].items.push({
              id: itemId,
              content: record.content,
              title: record.title,
              order: record.order,
            });
          }
        }
      }
    }

    // Convert to array and sort items
    const libsArray = Object.values(libraries);
    for (const lib of libsArray) {
      lib.items.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.id.localeCompare(b.id);
      });
    }

    return libsArray;
  }

  async getLibrary(userId: string, libraryId: string): Promise<Library | null> {
    const pk = `USER_DATA#${userId}`;
    const sk = `LIBRARY#${libraryId}`;

    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': sk },
      })
    );

    const records = result.Items || [];
    const metaRecord = records.find((r) => r.sk === sk);
    if (!metaRecord) return null;

    const items: LibraryItem[] = records
      .filter((r) => r.sk.includes('#ITEM#'))
      .map((r) => ({
        id: r.sk.split('#ITEM#')[1],
        content: r.content,
        title: r.title,
        order: r.order,
      }))
      .sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.id.localeCompare(b.id);
      });

    return { id: libraryId, name: metaRecord.name, type: metaRecord.type, items };
  }

  async createLibrary(userId: string, library: Omit<Library, 'items'>): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `USER_DATA#${userId}`,
          sk: `LIBRARY#${library.id}`,
          name: library.name,
          type: library.type,
        },
      })
    );
  }

  async updateLibrary(userId: string, libraryId: string, updates: { name?: string; type?: string }): Promise<void> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    if (updates.name !== undefined) { expressions.push('#n = :n'); names['#n'] = 'name'; values[':n'] = updates.name; }
    if (updates.type !== undefined) { expressions.push('#t = :t'); names['#t'] = 'type'; values[':t'] = updates.type; }
    if (expressions.length === 0) return;

    await this.client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER_DATA#${userId}`, sk: `LIBRARY#${libraryId}` },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
  }

  async deleteLibrary(userId: string, libraryId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `LIBRARY#${libraryId}`;

    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
        ProjectionExpression: 'pk, sk',
      })
    );

    const items = result.Items || [];
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
      const batch = items.slice(i, i + BATCH_LIMIT).map((item) => ({
        DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
      }));
      await this.client.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch } }));
    }
  }

  // === Library Item CRUD ===

  async getLibraryItems(userId: string, libraryId: string): Promise<LibraryItem[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': `LIBRARY#${libraryId}#ITEM#` },
      })
    );

    return (result.Items || [])
      .map((r) => ({
        id: r.sk.split('#ITEM#')[1],
        content: r.content,
        title: r.title,
        order: r.order,
      }))
      .sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.id.localeCompare(b.id);
      });
  }

  async createLibraryItem(userId: string, libraryId: string, item: LibraryItem): Promise<void> {
    const record: Record<string, unknown> = {
      pk: `USER_DATA#${userId}`,
      sk: `LIBRARY#${libraryId}#ITEM#${item.id}`,
      content: item.content,
    };
    if (item.title !== undefined) record.title = item.title;
    if (item.order !== undefined) record.order = item.order;
    await this.client.send(new PutCommand({ TableName: TABLE_NAME, Item: record }));
  }

  async updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    if (updates.content !== undefined) { expressions.push('#c = :c'); names['#c'] = 'content'; values[':c'] = updates.content; }
    if (updates.title !== undefined) { expressions.push('#t = :t'); names['#t'] = 'title'; values[':t'] = updates.title; }
    if (updates.order !== undefined) { expressions.push('#o = :o'); names['#o'] = 'order'; values[':o'] = updates.order; }
    if (expressions.length === 0) return;

    await this.client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER_DATA#${userId}`, sk: `LIBRARY#${libraryId}#ITEM#${itemId}` },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
  }

  async deleteLibraryItem(userId: string, libraryId: string, itemId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER_DATA#${userId}`, sk: `LIBRARY#${libraryId}#ITEM#${itemId}` },
      })
    );
  }

  async reorderLibraryItems(userId: string, libraryId: string, updates: { id: string; order: number }[]): Promise<void> {
    await Promise.all(
      updates.map((update) => this.updateLibraryItem(userId, libraryId, update.id, { order: update.order }))
    );
  }
}

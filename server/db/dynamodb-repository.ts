import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import { AppData, Library, LibraryItem, Project } from '../../src/types';
import { IRepository } from './repository';

const TABLE_NAME = 'remix-studio';
const BATCH_LIMIT = 25;

export class DynamoDBRepository implements IRepository {
  constructor(private client: DynamoDBDocumentClient) {}

  // === Library CRUD ===

  async getUserLibraries(userId: string): Promise<Library[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': 'LIBRARY#' },
      })
    );

    // Filter out ITEM records, only get library metadata
    return (result.Items || [])
      .filter((item) => !item.sk.includes('#ITEM#'))
      .map((item) => ({
        id: item.sk.replace('LIBRARY#', ''),
        name: item.name,
        type: item.type,
        items: [], // items are fetched separately
      }));
  }

  async getLibrary(userId: string, libraryId: string): Promise<Library | null> {
    const pk = `USER_DATA#${userId}`;
    const sk = `LIBRARY#${libraryId}`;

    // Query library metadata and all its items in one query
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
      }));

    return {
      id: libraryId,
      name: metaRecord.name,
      type: metaRecord.type,
      items,
    };
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

    if (updates.name !== undefined) {
      expressions.push('#n = :n');
      names['#n'] = 'name';
      values[':n'] = updates.name;
    }
    if (updates.type !== undefined) {
      expressions.push('#t = :t');
      names['#t'] = 'type';
      values[':t'] = updates.type;
    }

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

    // Query all records for this library (metadata + items)
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
      await this.client.send(
        new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch } })
      );
    }
  }

  // === Library Item CRUD ===

  async getLibraryItems(userId: string, libraryId: string): Promise<LibraryItem[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':prefix': `LIBRARY#${libraryId}#ITEM#`,
        },
      })
    );

    return (result.Items || []).map((r) => ({
      id: r.sk.split('#ITEM#')[1],
      content: r.content,
      title: r.title,
    }));
  }

  async createLibraryItem(userId: string, libraryId: string, item: LibraryItem): Promise<void> {
    const record: Record<string, unknown> = {
      pk: `USER_DATA#${userId}`,
      sk: `LIBRARY#${libraryId}#ITEM#${item.id}`,
      content: item.content,
    };
    if (item.title) record.title = item.title;

    await this.client.send(
      new PutCommand({ TableName: TABLE_NAME, Item: record })
    );
  }

  async updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    if (updates.content !== undefined) {
      expressions.push('#c = :c');
      names['#c'] = 'content';
      values[':c'] = updates.content;
    }
    if (updates.title !== undefined) {
      expressions.push('#t = :t');
      names['#t'] = 'title';
      values[':t'] = updates.title;
    }

    if (expressions.length === 0) return;

    await this.client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `USER_DATA#${userId}`,
          sk: `LIBRARY#${libraryId}#ITEM#${itemId}`,
        },
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
        Key: {
          pk: `USER_DATA#${userId}`,
          sk: `LIBRARY#${libraryId}#ITEM#${itemId}`,
        },
      })
    );
  }

  // === Project CRUD ===

  async getUserProjects(userId: string): Promise<Project[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': 'PROJECT#' },
      })
    );

    return (result.Items || []).map((item) => ({
      id: item.sk.replace('PROJECT#', ''),
      name: item.name,
      createdAt: item.createdAt,
      workflow: item.workflow || [],
      jobs: item.jobs || [],
    }));
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const pk = `USER_DATA#${userId}`;
    const sk = `PROJECT#${projectId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND sk = :sk',
        ExpressionAttributeValues: { ':pk': pk, ':sk': sk },
      })
    );

    const item = result.Items?.[0];
    if (!item) return null;

    return {
      id: projectId,
      name: item.name,
      createdAt: item.createdAt,
      workflow: item.workflow || [],
      jobs: item.jobs || [],
    };
  }

  async createProject(userId: string, project: Project): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `USER_DATA#${userId}`,
          sk: `PROJECT#${project.id}`,
          name: project.name,
          createdAt: project.createdAt,
          workflow: project.workflow,
          jobs: project.jobs,
        },
      })
    );
  }

  async updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    if (updates.name !== undefined) {
      expressions.push('#n = :n');
      names['#n'] = 'name';
      values[':n'] = updates.name;
    }
    if (updates.workflow !== undefined) {
      expressions.push('#w = :w');
      names['#w'] = 'workflow';
      values[':w'] = updates.workflow;
    }
    if (updates.jobs !== undefined) {
      expressions.push('#j = :j');
      names['#j'] = 'jobs';
      values[':j'] = updates.jobs;
    }

    if (expressions.length === 0) return;

    await this.client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER_DATA#${userId}`, sk: `PROJECT#${projectId}` },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER_DATA#${userId}`, sk: `PROJECT#${projectId}` },
      })
    );
  }

  // === Legacy / Migration ===

  async getUserData(userId: string): Promise<AppData> {
    const [libraries, projects] = await Promise.all([
      this.getUserLibraries(userId),
      this.getUserProjects(userId),
    ]);

    // Populate items for each library
    const fullLibraries = await Promise.all(
      libraries.map(async (lib) => {
        const items = await this.getLibraryItems(userId, lib.id);
        return { ...lib, items };
      })
    );

    return { libraries: fullLibraries, projects };
  }

  async saveAllData(data: AppData): Promise<void> {
    // Used only for migration/import — deletes everything first
    await this.deleteAllItems();

    const putRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

    for (const lib of data.libraries || []) {
      putRequests.push({
        PutRequest: {
          Item: {
            pk: 'LIBRARY',
            sk: lib.id,
            name: lib.name,
            type: lib.type,
          },
        },
      });
      for (const item of lib.items || []) {
        putRequests.push({
          PutRequest: {
            Item: {
              pk: 'LIBRARY',
              sk: `${lib.id}#ITEM#${item.id}`,
              content: item.content,
              ...(item.title ? { title: item.title } : {}),
            },
          },
        });
      }
    }

    for (const proj of data.projects || []) {
      putRequests.push({
        PutRequest: {
          Item: {
            pk: 'PROJECT',
            sk: proj.id,
            name: proj.name,
            createdAt: proj.createdAt,
            workflow: proj.workflow,
            jobs: proj.jobs,
          },
        },
      });
    }

    for (let i = 0; i < putRequests.length; i += BATCH_LIMIT) {
      const batch = putRequests.slice(i, i + BATCH_LIMIT);
      await this.client.send(
        new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch } })
      );
    }
  }

  async autoImportJson(dataDir: string): Promise<void> {
    // Check if there is any user data at all
    const result = await this.client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 1,
        FilterExpression: 'begins_with(pk, :prefix)',
        ExpressionAttributeValues: { ':prefix': 'USER_DATA#' },
      })
    );
    if ((result.Items || []).length > 0) return;

    const jsonPath = path.join(dataDir, 'db.json');
    if (!fs.existsSync(jsonPath)) return;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const data: AppData = JSON.parse(raw);

      if ((data as any).batches && !data.projects) {
        data.projects = (data as any).batches;
      }

      await this.saveAllData(data);
      console.log('Auto-imported data from db.json into DynamoDB');
    } catch (e) {
      console.error('Failed to auto-import db.json:', e);
    }
  }

  private async deleteAllItems(): Promise<void> {
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ProjectionExpression: 'pk, sk',
          ExclusiveStartKey: lastKey,
        })
      );

      const items = result.Items || [];
      if (items.length === 0) break;

      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = items.slice(i, i + BATCH_LIMIT).map((item) => ({
          DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
        }));
        await this.client.send(
          new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch } })
        );
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }
}

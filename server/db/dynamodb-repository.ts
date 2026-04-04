import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import { AppData, Library, Project } from '../../src/types';
import { IRepository } from './repository';

const TABLE_NAME = 'remix-studio';
const BATCH_LIMIT = 25; // DynamoDB BatchWrite limit

export class DynamoDBRepository implements IRepository {
  constructor(private client: DynamoDBDocumentClient) {}

  async getUserData(userId: string): Promise<AppData> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `USER_DATA#${userId}` },
      })
    );

    const libraries: Library[] = [];
    const projects: Project[] = [];

    for (const item of result.Items || []) {
      if (item.sk.startsWith('LIBRARY#')) {
        libraries.push({
          id: item.sk.replace('LIBRARY#', ''),
          name: item.name,
          type: item.type,
          items: item.items || [],
        });
      } else if (item.sk.startsWith('PROJECT#')) {
        projects.push({
          id: item.sk.replace('PROJECT#', ''),
          name: item.name,
          createdAt: item.createdAt,
          workflow: item.workflow || [],
          jobs: item.jobs || [],
        });
      }
    }

    return { libraries, projects };
  }

  async saveUserData(userId: string, data: AppData): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    
    // First, delete all existing items for this user
    await this.deleteUserItems(userId);

    // Then batch write
    const putRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

    for (const lib of data.libraries || []) {
      putRequests.push({
        PutRequest: {
          Item: {
            pk,
            sk: `LIBRARY#${lib.id}`,
            name: lib.name,
            type: lib.type,
            items: lib.items,
          },
        },
      });
    }

    for (const proj of data.projects || []) {
      putRequests.push({
        PutRequest: {
          Item: {
            pk,
            sk: `PROJECT#${proj.id}`,
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
        new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: batch },
        })
      );
    }
  }

  private async deleteUserItems(userId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
      })
    );
    
    const items = result.Items || [];
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
      const batch = items.slice(i, i + BATCH_LIMIT).map((item) => ({
        DeleteRequest: { Key: { pk, sk: item.sk } },
      }));
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: batch },
        })
      );
    }
  }

  async getAllData(): Promise<AppData> {
    const [libraryResult, projectResult] = await Promise.all([
      this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': 'LIBRARY' },
        })
      ),
      this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': 'PROJECT' },
        })
      ),
    ]);

    const libraries: Library[] = (libraryResult.Items || []).map((item) => ({
      id: item.sk,
      name: item.name,
      type: item.type,
      items: item.items || [],
    }));

    const projects: Project[] = (projectResult.Items || []).map((item) => ({
      id: item.sk,
      name: item.name,
      createdAt: item.createdAt,
      workflow: item.workflow || [],
      jobs: item.jobs || [],
    }));

    return { libraries, projects };
  }

  async saveAllData(data: AppData): Promise<void> {
    // Step 1: Scan and delete all existing items
    await this.deleteAllItems();

    // Step 2: Batch write all new items
    const putRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

    for (const lib of data.libraries || []) {
      putRequests.push({
        PutRequest: {
          Item: {
            pk: 'LIBRARY',
            sk: lib.id,
            name: lib.name,
            type: lib.type,
            items: lib.items,
          },
        },
      });
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

    // BatchWrite in chunks of 25
    for (let i = 0; i < putRequests.length; i += BATCH_LIMIT) {
      const batch = putRequests.slice(i, i + BATCH_LIMIT);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: batch },
        })
      );
    }
  }

  async autoImportJson(dataDir: string): Promise<void> {
    const result = await this.getAllData();
    if (result.libraries.length > 0 || result.projects.length > 0) return;

    const jsonPath = path.join(dataDir, 'db.json');
    if (!fs.existsSync(jsonPath)) return;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const data: AppData = JSON.parse(raw);

      // Migrate old 'batches' to 'projects'
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

      // BatchWrite delete in chunks of 25
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = items.slice(i, i + BATCH_LIMIT).map((item) => ({
          DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
        }));
        await this.client.send(
          new BatchWriteCommand({
            RequestItems: { [TABLE_NAME]: batch },
          })
        );
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }
}

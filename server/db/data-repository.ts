import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import { AppData } from '../../src/types';
import { LibraryRepository } from './library-repository';
import { ProjectRepository } from './project-repository';

const TABLE_NAME = 'remix-studio';
const BATCH_LIMIT = 25;

export class DataRepository {
  private libraryRepo: LibraryRepository;
  private projectRepo: ProjectRepository;

  constructor(private client: DynamoDBDocumentClient) {
    this.libraryRepo = new LibraryRepository(client);
    this.projectRepo = new ProjectRepository(client);
  }

  async getUserData(userId: string): Promise<AppData> {
    const [libraries, projects] = await Promise.all([
      this.libraryRepo.getUserLibraries(userId),
      this.projectRepo.getUserProjects(userId),
    ]);

    const fullLibraries = await Promise.all(
      libraries.map(async (lib) => {
        const items = await this.libraryRepo.getLibraryItems(userId, lib.id);
        return { ...lib, items };
      })
    );

    return { libraries: fullLibraries, projects };
  }

  async saveAllData(data: AppData): Promise<void> {
    await this.deleteAllItems();

    const putRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

    for (const lib of data.libraries || []) {
      putRequests.push({
        PutRequest: {
          Item: { pk: 'LIBRARY', sk: lib.id, name: lib.name, type: lib.type },
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
      await this.client.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch } }));
    }
  }

  async autoImportJson(dataDir: string): Promise<void> {
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
        await this.client.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch } }));
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }
}

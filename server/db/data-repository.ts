import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import { AppData, Project } from '../../src/types';
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
    const [libraries, allProjectItems] = await Promise.all([
      this.libraryRepo.getUserLibraries(userId),
      (await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(#sk, :prefix)',
          ExpressionAttributeNames: { '#sk': 'sk' },
          ExpressionAttributeValues: { ':pk': `USER_DATA#${userId}`, ':prefix': 'PROJECT#' },
        })
      )) as any,
    ]);

    // Aggregate library items (current implementation uses separate calls)
    const fullLibraries = await Promise.all(
      libraries.map(async (lib) => {
        const items = await this.libraryRepo.getLibraryItems(userId, lib.id);
        return { ...lib, items };
      })
    );

    // Group allProjectItems into Project objects
    const projectsMap: Record<string, Project> = {};
    const projectItems = allProjectItems.Items || [];

    // First pass: Metadata items
    for (const item of projectItems) {
      if (item.sk.startsWith('PROJECT#') && !item.sk.includes('#JOB#') && !item.sk.includes('#WF#')) {
        const id = item.sk.replace('PROJECT#', '');
        projectsMap[id] = {
          id,
          name: item.name,
          createdAt: item.createdAt,
          workflow: [],
          jobs: [],
          providerId: item.providerId,
          aspectRatio: item.aspectRatio,
          quality: item.quality,
        };
      }
    }

    // Second pass: Split Jobs and Workflow Items (Append to legacy)
    for (const item of projectItems) {
      if (item.sk.includes('#JOB#')) {
        const [projPart, jobPart] = item.sk.split('#JOB#');
        const projId = projPart.replace('PROJECT#', '');
        if (projectsMap[projId]) {
          projectsMap[projId].jobs.push({
            id: jobPart,
            prompt: item.prompt,
            status: item.status,
            imageContexts: item.imageContexts,
            imageUrl: item.imageUrl,
            error: item.error,
            createdAt: item.createdAt,
          });
        }
      } else if (item.sk.includes('#WF#')) {
        const [projPart, wfPart] = item.sk.split('#WF#');
        const projId = projPart.replace('PROJECT#', '');
        if (projectsMap[projId]) {
          projectsMap[projId].workflow.push({
            id: wfPart,
            type: item.type,
            value: item.value,
            order: item.order,
          });
        }
      }
    }

    // Final sorting
    const projects = Object.values(projectsMap).map((proj) => {
      proj.jobs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      proj.workflow.sort((a, b) => (a.order || 0) - (b.order || 0));
      return proj;
    });

    return { libraries: fullLibraries, projects };
  }

  async saveAllData(data: AppData): Promise<void> {
    // WARNING: Wipe all data for a fresh restore. 
    // This is currently a global action. We should ideally take a userId.
    const userId = 'default_user';
    const pk = `USER_DATA#${userId}`;

    await this.deleteAllItems();

    const putRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

    // Libraries split
    for (const lib of data.libraries || []) {
      putRequests.push({
        PutRequest: {
          Item: { pk, sk: `LIBRARY#${lib.id}`, name: lib.name, type: lib.type },
        },
      });
      for (const item of lib.items || []) {
        putRequests.push({
          PutRequest: {
            Item: {
              pk,
              sk: `LIBRARY#${lib.id}#ITEM#${item.id}`,
              content: item.content,
              title: item.title,
              order: item.order,
            },
          },
        });
      }
    }

    // Projects split
    for (const proj of data.projects || []) {
      putRequests.push({
        PutRequest: {
          Item: {
            pk,
            sk: `PROJECT#${proj.id}`,
            name: proj.name,
            createdAt: proj.createdAt,
            providerId: proj.providerId,
            aspectRatio: proj.aspectRatio,
            quality: proj.quality,
          },
        },
      });

      // Split Jobs
      for (const job of proj.jobs || []) {
        putRequests.push({
          PutRequest: {
            Item: {
              pk,
              sk: `PROJECT#${proj.id}#JOB#${job.id}`,
              ...job,
              createdAt: job.createdAt || Date.now()
            },
          },
        });
      }

      // Split Workflow
      for (const [idx, item] of (proj.workflow || []).entries()) {
        putRequests.push({
          PutRequest: {
            Item: {
              pk,
              sk: `PROJECT#${proj.id}#WF#${item.id}`,
              ...item,
              order: item.order ?? idx
            },
          },
        });
      }
    }

    // Chunks of 25 for BatchWriteItem
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

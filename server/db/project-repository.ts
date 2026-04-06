import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Project, Job, WorkflowItem, AlbumItem, TrashItem } from '../../src/types';

const TABLE_NAME = 'remix-studio';

export class ProjectRepository {
  constructor(private client: DynamoDBDocumentClient) {}

  async getUserProjects(userId: string): Promise<Project[]> {
    const pk = `USER_DATA#${userId}`;
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI_ProjectList',
          KeyConditionExpression: 'pk = :pk AND projectType = :pType',
          ExpressionAttributeValues: { 
            ':pk': pk, 
            ':pType': 'PROJECT'
          },
        })
      );

      return await Promise.all((result.Items || []).map(async (item) => {
        const id = item.sk.replace('PROJECT#', '');
        
        // Fetch counts for jobs and album items
        const [jobRes, albumRes] = await Promise.all([
          this.client.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: { ':pk': pk, ':prefix': `PROJECT#${id}#JOB#` },
            Select: 'COUNT'
          })),
          this.client.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: { ':pk': pk, ':prefix': `PROJECT#${id}#ALBUM#` },
            Select: 'COUNT'
          }))
        ]);

        return {
          id,
          name: item.name,
          createdAt: item.createdAt,
          workflow: [],
          jobs: [],
          album: [],
          jobCount: jobRes.Count || 0,
          albumCount: albumRes.Count || 0,
          providerId: item.providerId,
          aspectRatio: item.aspectRatio,
          quality: item.quality,
          format: item.format,
          shuffle: item.shuffle,
          modelConfigId: item.modelConfigId,
          prefix: item.prefix,
        };
      }));
    } catch (e) {
      console.error('[ProjectRepository.getUserProjects] ERROR:', e);
      throw e;
    }
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}`;
    
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#sk': 'sk' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      })
    ) as any;

    if (!result.Items || result.Items.length === 0) return null;

    const projectItem = result.Items.find((item: any) => item.sk === prefix);
    if (!projectItem) return null;

    const jobItems = result.Items.filter((item: any) => item.sk.includes('#JOB#'));
    const wfItems = result.Items.filter((item: any) => item.sk.includes('#WF#'));
    const albumItems = result.Items.filter((item: any) => item.sk.includes('#ALBUM#'));
    
    const jobs: Job[] = jobItems.map((item: any) => ({
      id: item.sk.split('#JOB#')[1],
      prompt: item.prompt,
      status: item.status,
      imageContexts: item.imageContexts,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      optimizedUrl: item.optimizedUrl,
      error: item.error,
      createdAt: item.createdAt,
      providerId: item.providerId,
      modelConfigId: item.modelConfigId,
      aspectRatio: item.aspectRatio,
      quality: item.quality,
      format: item.format,
      taskId: item.taskId,
      filename: item.filename,
    }));
    jobs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const workflow: WorkflowItem[] = wfItems.map((item: any) => ({
      id: item.sk.split('#WF#')[1],
      type: item.type,
      value: item.value,
      order: item.order,
      thumbnailUrl: item.thumbnailUrl,
      optimizedUrl: item.optimizedUrl,
    }));
    workflow.sort((a, b) => (a.order || 0) - (b.order || 0));

    const album: AlbumItem[] = albumItems.map((item: any) => ({
      id: item.sk.split('#ALBUM#')[1],
      jobId: item.jobId,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      optimizedUrl: item.optimizedUrl,
      providerId: item.providerId,
      modelConfigId: item.modelConfigId,
      aspectRatio: item.aspectRatio,
      quality: item.quality,
      format: item.format,
      size: item.size,
      createdAt: item.createdAt,
    }));
    album.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    return {
      id: projectId,
      name: projectItem.name,
      createdAt: projectItem.createdAt,
      workflow: workflow,
      jobs: jobs,
      album: album,
      providerId: projectItem.providerId,
      aspectRatio: projectItem.aspectRatio,
      quality: projectItem.quality,
      format: projectItem.format,
      shuffle: projectItem.shuffle,
      modelConfigId: projectItem.modelConfigId,
      prefix: projectItem.prefix,
    };
  }

  async createProject(userId: string, project: Project): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const projectSk = `PROJECT#${project.id}`;
    const { jobs, workflow, ...metadata } = project;
    
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { 
          pk, 
          sk: projectSk, 
          projectType: 'PROJECT', // Sparse Index Marker
          ...metadata 
        },
      })
    );

    if (jobs && jobs.length > 0) await this.saveJobs(userId, project.id, jobs);
    if (workflow && workflow.length > 0) await this.saveWorkflow(userId, project.id, workflow);
  }

  async updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const projectSk = `PROJECT#${projectId}`;

    const expressions: string[] = ['#pt = :pt']; // Ensure projectType is always present
    const names: Record<string, string> = { '#pt': 'projectType' };
    const values: Record<string, unknown> = { ':pt': 'PROJECT' };

    if (updates.name !== undefined) { expressions.push('#n = :n'); names['#n'] = 'name'; values[':n'] = updates.name; }
    if (updates.providerId !== undefined) { expressions.push('#p = :p'); names['#p'] = 'providerId'; values[':p'] = updates.providerId; }
    if (updates.aspectRatio !== undefined) { expressions.push('#ar = :ar'); names['#ar'] = 'aspectRatio'; values[':ar'] = updates.aspectRatio; }
    if (updates.quality !== undefined) { expressions.push('#q = :q'); names['#q'] = 'quality'; values[':q'] = updates.quality; }
    if (updates.format !== undefined) { expressions.push('#f = :f'); names['#f'] = 'format'; values[':f'] = updates.format; }
    if (updates.shuffle !== undefined) { expressions.push('#sh = :sh'); names['#sh'] = 'shuffle'; values[':sh'] = updates.shuffle; }
    if (updates.modelConfigId !== undefined) { expressions.push('#mc = :mc'); names['#mc'] = 'modelConfigId'; values[':mc'] = updates.modelConfigId; }
    if (updates.prefix !== undefined) { expressions.push('#pref = :pref'); names['#pref'] = 'prefix'; values[':pref'] = updates.prefix; }

    const removeExprs: string[] = [];
    if (updates.jobs !== undefined) {
      await this.saveJobs(userId, projectId, updates.jobs);
      removeExprs.push('jobs');
    }
    if (updates.workflow !== undefined) {
      await this.saveWorkflow(userId, projectId, updates.workflow);
      removeExprs.push('workflow');
    }

    let updateExpression = `SET ${expressions.join(', ')}`;
    if (removeExprs.length > 0) {
      updateExpression += ` REMOVE ${removeExprs.join(', ')}`;
    }

    if (updates.jobs !== undefined) {
      // Find items in DB that are NO LONGER in updates.jobs and delete them
      const prefix = `PROJECT#${projectId}#JOB#`;
      const result = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(#sk, :prefix)',
          ExpressionAttributeNames: { '#sk': 'sk' },
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
        })
      );

      const dbJobIds = new Set((result.Items || []).map(item => item.sk.split('#JOB#')[1]));
      const newJobIds = new Set(updates.jobs.map(j => j.id));

      for (const id of dbJobIds) {
        if (!newJobIds.has(id)) {
          const sk = `PROJECT#${projectId}#JOB#${id}`;
          await this.client.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { pk, sk }
          }));
        }
      }
    }

    await this.client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk: projectSk },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
  }

  async getJob(userId: string, projectId: string, jobId: string): Promise<Job | null> {
    const pk = `USER_DATA#${userId}`;
    const sk = `PROJECT#${projectId}#JOB#${jobId}`;

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
      id: jobId,
      prompt: item.prompt,
      status: item.status,
      imageContexts: item.imageContexts,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      optimizedUrl: item.optimizedUrl,
      error: item.error,
      createdAt: item.createdAt,
      providerId: item.providerId,
      modelConfigId: item.modelConfigId,
      aspectRatio: item.aspectRatio,
      quality: item.quality,
      format: item.format,
      taskId: item.taskId,
      filename: item.filename,
    };
  }

  async updateJob(userId: string, projectId: string, jobId: string, updates: Partial<Job>): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const sk = `PROJECT#${projectId}#JOB#${jobId}`;

    const setExprs: string[] = [];
    const removeExprs: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let idx = 0;

    for (const [key, value] of Object.entries(updates)) {
      const nameKey = `#n${idx}`;
      names[nameKey] = key;
      if (value === undefined) {
        // REMOVE the attribute from DynamoDB
        removeExprs.push(nameKey);
      } else {
        const valKey = `:v${idx}`;
        setExprs.push(`${nameKey} = ${valKey}`);
        values[valKey] = value;
      }
      idx++;
    }

    if (setExprs.length === 0 && removeExprs.length === 0) return;

    let updateExpression = '';
    if (setExprs.length > 0) updateExpression += `SET ${setExprs.join(', ')}`;
    if (removeExprs.length > 0) updateExpression += ` REMOVE ${removeExprs.join(', ')}`;

    await this.client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
        UpdateExpression: updateExpression.trim(),
        ExpressionAttributeNames: names,
        ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
      })
    );
  }

  private async saveJobs(userId: string, projectId: string, jobs: Job[]): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    // const prefix = `PROJECT#${projectId}#JOB#`;
    // await this.cleanupItems(pk, prefix); 
    // ^ DANGEROUS: Deleting all jobs before saving the project list leads to data loss 
    // when multiple jobs update the project status simultaneously.
    // Moving to an incremental update model (PutCommand only).

    const CHUNK_SIZE = 25;
    for (let i = 0; i < jobs.length; i += CHUNK_SIZE) {
      const chunk = jobs.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(job => {
        return this.client.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk,
            sk: `PROJECT#${projectId}#JOB#${job.id}`,
            ...job,
            projectId,
            createdAt: job.createdAt || Date.now()
          }
        }));
      }));
    }
  }

  private async saveWorkflow(userId: string, projectId: string, workflow: WorkflowItem[]): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}#WF#`;
    await this.cleanupItems(pk, prefix);

    const CHUNK_SIZE = 25;
    for (let i = 0; i < workflow.length; i += CHUNK_SIZE) {
      const chunk = workflow.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map((item, idx) => {
        return this.client.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk,
            sk: `PROJECT#${projectId}#WF#${item.id}`,
            ...item,
            projectId,
            order: (i + idx) // Preserve array order
          }
        }));
      }));
    }
  }

  /** Helper to delete all items matching a specific prefix under a PK */
  private async cleanupItems(pk: string, prefix: string): Promise<void> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#sk': 'sk' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      })
    );

    if (result.Items && result.Items.length > 0) {
      const CHUNK_SIZE = 25;
      for (let i = 0; i < result.Items.length; i += CHUNK_SIZE) {
        const chunk = result.Items.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(item => {
          return this.client.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { pk, sk: item.sk }
          }));
        }));
      }
    }
  }

  async addAlbumItem(userId: string, projectId: string, item: AlbumItem): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    await this.client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk,
        sk: `PROJECT#${projectId}#ALBUM#${item.id}`,
        ...item,
        projectId,
      }
    }));
  }

  async deleteAlbumItem(userId: string, projectId: string, itemId: string): Promise<AlbumItem | null> {
    const pk = `USER_DATA#${userId}`;
    const sk = `PROJECT#${projectId}#ALBUM#${itemId}`;
    
    // Get item first to return it
    const result = await this.client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: { ':pk': pk, ':sk': sk }
    }));
    
    const item = result.Items?.[0];
    if (!item) return null;

    await this.client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk }
    }));

    return {
      id: item.sk.split('#ALBUM#')[1],
      jobId: item.jobId,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      optimizedUrl: item.optimizedUrl,
      providerId: item.providerId,
      modelConfigId: item.modelConfigId,
      aspectRatio: item.aspectRatio,
      quality: item.quality,
      format: item.format,
      size: item.size,
      createdAt: item.createdAt,
    };
  }

  async moveToTrash(userId: string, projectId: string, itemId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const project = await this.getProject(userId, projectId);
    if (!project) throw new Error('Project not found');
    
    const item = await this.deleteAlbumItem(userId, projectId, itemId);
    if (!item) throw new Error('Album item not found');

    const trashItem: TrashItem = {
      ...item,
      projectId,
      projectName: project.name,
      deletedAt: Date.now()
    };

    await this.client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk,
        sk: `TRASH#${item.id}`,
        ...trashItem
      }
    }));
  }

  async getTrashItems(userId: string): Promise<TrashItem[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': 'TRASH#' }
    }));

    return (result.Items || []).map(item => ({
      id: item.sk.replace('TRASH#', ''),
      jobId: item.jobId,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      optimizedUrl: item.optimizedUrl,
      providerId: item.providerId,
      modelConfigId: item.modelConfigId,
      aspectRatio: item.aspectRatio,
      quality: item.quality,
      format: item.format,
      size: item.size,
      createdAt: item.createdAt,
      projectId: item.projectId,
      projectName: item.projectName,
      deletedAt: item.deletedAt
    }));
  }

  async restoreTrashItem(userId: string, itemId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const sk = `TRASH#${itemId}`;
    
    const result = await this.client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: { ':pk': pk, ':sk': sk }
    }));
    
    const trashItem = result.Items?.[0] as TrashItem | undefined;
    if (!trashItem) throw new Error('Trash item not found');

    // Restore to project album
    const { projectId, projectName, deletedAt, ...albumItem } = trashItem;
    await this.addAlbumItem(userId, projectId, albumItem);

    // Remove from trash
    await this.client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk }
    }));
  }

  async deleteTrashPermanently(userId: string, itemId: string): Promise<string[]> {
    const pk = `USER_DATA#${userId}`;
    const sk = `TRASH#${itemId}`;
    
    const result = await this.client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: { ':pk': pk, ':sk': sk }
    }));
    
    const item = result.Items?.[0];
    if (!item) return [];

    const keys: string[] = [];
    if (item.imageUrl) keys.push(item.imageUrl);
    if (item.thumbnailUrl) keys.push(item.thumbnailUrl);
    if (item.optimizedUrl) keys.push(item.optimizedUrl);

    await this.client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk }
    }));

    return keys;
  }

  async emptyTrash(userId: string): Promise<string[]> {
    const items = await this.getTrashItems(userId);
    const allKeys: string[] = [];
    
    for (const item of items) {
      const keys = await this.deleteTrashPermanently(userId, item.id);
      allKeys.push(...keys);
    }
    
    return allKeys;
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}`;
    await this.cleanupItems(pk, prefix);
  }

  // === Export CRUD ===
  async getExportTasks(userId: string, projectId: string): Promise<any[]> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}#EXPORT#`;
    
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#sk': 'sk' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      })
    );

    const exports = (result.Items || []).map(item => ({
      ...item,
      id: item.sk.split('#EXPORT#')[1],
    })) as any[];
    
    // Sort by createdAt descending (newest first)
    return exports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async getAllExportTasks(userId: string, limit: number = 20, exclusiveStartKey?: any): Promise<{ items: any[]; nextCursor?: any }> {
    const pk = `USER_DATA#${userId}`;
    let items: any[] = [];
    let lastEvaluatedKey = exclusiveStartKey;

    // Use SK contains '#EXPORT#' — same logic as getAllUserItems, avoids relying
    // on the `itemType` field which may be missing from older records.
    while (items.length < limit) {
      const params: any = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: 'contains(#sk, :exportMarker)',
        ExpressionAttributeNames: { '#sk': 'sk' },
        ExpressionAttributeValues: {
          ':pk': pk,
          ':exportMarker': '#EXPORT#',
        },
      };
      if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey;

      const result = await this.client.send(new QueryCommand(params));

      const found = (result.Items || []).map(item => ({
        ...item,
        id: item.sk.split('#EXPORT#')[1],
      }));

      items.push(...found);
      lastEvaluatedKey = result.LastEvaluatedKey;

      // No more data in partition
      if (!lastEvaluatedKey) break;
    }

    // Trim to requested limit
    let nextCursor: any;
    if (items.length > limit) {
      items = items.slice(0, limit);
      nextCursor = lastEvaluatedKey;
    } else {
      nextCursor = lastEvaluatedKey;
    }

    return {
      items: items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      nextCursor
    };
  }

  async saveExportTask(userId: string, projectId: string, task: any): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const sk = `PROJECT#${projectId}#EXPORT#${task.id}`;
    
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk,
          sk,
          projectId,
          ...task,
          itemType: 'export',
          createdAt: task.createdAt || Date.now()
        }
      })
    );
  }

  async deleteExportTask(userId: string, projectId: string, taskId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const sk = `PROJECT#${projectId}#EXPORT#${taskId}`;
    
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk }
      })
    );
  }

  async getAllUserItems(userId: string): Promise<any[]> {
    const pk = `USER_DATA#${userId}`;
    const items: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (result.Items) {
        items.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  }
}

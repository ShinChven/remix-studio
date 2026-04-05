import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Project, Job, WorkflowItem } from '../../src/types';

const TABLE_NAME = 'remix-studio';

export class ProjectRepository {
  constructor(private client: DynamoDBDocumentClient) {}

  async getUserProjects(userId: string): Promise<Project[]> {
    const pk = `USER_DATA#${userId}`;
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        FilterExpression: 'NOT contains(sk, :jobMarker) AND NOT contains(sk, :wfMarker)',
        ExpressionAttributeValues: { 
          ':pk': pk, 
          ':prefix': 'PROJECT#',
          ':jobMarker': '#JOB#',
          ':wfMarker': '#WF#'
        },
      })
    );

    return (result.Items || []).map((item) => ({
      id: item.sk.replace('PROJECT#', ''),
      name: item.name,
      createdAt: item.createdAt,
      workflow: item.workflow || [], // May contain legacy workflow
      jobs: item.jobs || [], // May contain legacy jobs
      providerId: item.providerId,
      aspectRatio: item.aspectRatio,
      quality: item.quality,
    }));
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}`;
    
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      })
    ) as any;

    if (!result.Items || result.Items.length === 0) return null;

    const projectItem = result.Items.find((item: any) => item.sk === prefix);
    if (!projectItem) return null;

    const jobItems = result.Items.filter((item: any) => item.sk.includes('#JOB#'));
    const wfItems = result.Items.filter((item: any) => item.sk.includes('#WF#'));
    
    const jobs: Job[] = jobItems.map((item: any) => ({
      id: item.sk.split('#JOB#')[1],
      prompt: item.prompt,
      status: item.status,
      imageContexts: item.imageContexts,
      imageUrl: item.imageUrl,
      error: item.error,
      createdAt: item.createdAt,
    }));
    jobs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const workflow: WorkflowItem[] = wfItems.map((item: any) => ({
      id: item.sk.split('#WF#')[1],
      type: item.type,
      value: item.value,
      order: item.order,
    }));
    workflow.sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      id: projectId,
      name: projectItem.name,
      createdAt: projectItem.createdAt,
      workflow: workflow,
      jobs: jobs,
      providerId: projectItem.providerId,
      aspectRatio: projectItem.aspectRatio,
      quality: projectItem.quality,
    };
  }

  async createProject(userId: string, project: Project): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const projectSk = `PROJECT#${project.id}`;
    const { jobs, workflow, ...metadata } = project;
    
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { pk, sk: projectSk, ...metadata },
      })
    );

    if (jobs && jobs.length > 0) await this.saveJobs(userId, project.id, jobs);
    if (workflow && workflow.length > 0) await this.saveWorkflow(userId, project.id, workflow);
  }

  async updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const projectSk = `PROJECT#${projectId}`;

    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    if (updates.name !== undefined) { expressions.push('#n = :n'); names['#n'] = 'name'; values[':n'] = updates.name; }
    if (updates.providerId !== undefined) { expressions.push('#p = :p'); names['#p'] = 'providerId'; values[':p'] = updates.providerId; }
    if (updates.aspectRatio !== undefined) { expressions.push('#ar = :ar'); names['#ar'] = 'aspectRatio'; values[':ar'] = updates.aspectRatio; }
    if (updates.quality !== undefined) { expressions.push('#q = :q'); names['#q'] = 'quality'; values[':q'] = updates.quality; }

    if (updates.jobs !== undefined) await this.saveJobs(userId, projectId, updates.jobs);
    if (updates.workflow !== undefined) await this.saveWorkflow(userId, projectId, updates.workflow);

    if (expressions.length > 0) {
      const updateParams: any = {
        TableName: TABLE_NAME,
        Key: { pk, sk: projectSk },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      };
      await this.client.send(new UpdateCommand(updateParams));
    }
  }

  private async saveJobs(userId: string, projectId: string, jobs: Job[]): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}#JOB#`;
    await this.cleanupItems(pk, prefix);

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
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
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

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const pk = `USER_DATA#${userId}`;
    const prefix = `PROJECT#${projectId}`;
    await this.cleanupItems(pk, prefix);
  }
}

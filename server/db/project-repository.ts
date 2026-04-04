import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Project } from '../../src/types';

const TABLE_NAME = 'remix-studio';

export class ProjectRepository {
  constructor(private client: DynamoDBDocumentClient) {}

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

    if (updates.name !== undefined) { expressions.push('#n = :n'); names['#n'] = 'name'; values[':n'] = updates.name; }
    if (updates.workflow !== undefined) { expressions.push('#w = :w'); names['#w'] = 'workflow'; values[':w'] = updates.workflow; }
    if (updates.jobs !== undefined) { expressions.push('#j = :j'); names['#j'] = 'jobs'; values[':j'] = updates.jobs; }
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
}

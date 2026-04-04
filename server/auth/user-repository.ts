import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserRole } from '../../src/types';
import type { UserRecord } from './auth';

const TABLE_NAME = 'remix-studio';

export class UserRepository {
  constructor(private client: DynamoDBDocumentClient) {}

  async createUser(user: UserRecord): Promise<void> {
    // Check email uniqueness
    const existing = await this.findByEmail(user.email);
    if (existing) {
      throw new Error('Email already exists');
    }

    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: user,
      })
    );
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: 'USER', sk: userId },
      })
    );
    return (result.Item as UserRecord) || null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    // Scan with filter since email is not a key
    const result = await this.client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'pk = :pk AND email = :email',
        ExpressionAttributeValues: {
          ':pk': 'USER',
          ':email': email,
        },
      })
    );
    return (result.Items?.[0] as UserRecord) || null;
  }

  async listUsers(): Promise<UserRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'USER' },
      })
    );
    return (result.Items || []).map((item) => {
      const { passwordHash: _omit, ...safeUser } = item as UserRecord;
      return safeUser as UserRecord;
    });
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...user, role },
      })
    );
  }

  async deleteUser(userId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: 'USER', sk: userId },
      })
    );
  }

  async hasAnyUsers(): Promise<boolean> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'USER' },
        Limit: 1,
      })
    );
    return (result.Items?.length || 0) > 0;
  }
}

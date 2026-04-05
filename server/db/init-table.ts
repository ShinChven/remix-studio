import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'remix-studio';

export async function ensureTable(client: DynamoDBClient): Promise<void> {
  try {
    const table = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    const hasGsi = table.Table?.GlobalSecondaryIndexes?.some(gsi => gsi.IndexName === 'GSI_ProjectList');
    
    if (!hasGsi) {
      console.log(`Adding GSI_ProjectList to existing table: ${TABLE_NAME}`);
      try {
        const { UpdateTableCommand } = await import('@aws-sdk/client-dynamodb');
        await client.send(
          new UpdateTableCommand({
            TableName: TABLE_NAME,
            AttributeDefinitions: [
              { AttributeName: 'pk', AttributeType: 'S' },
              { AttributeName: 'projectType', AttributeType: 'S' },
            ],
            GlobalSecondaryIndexUpdates: [
              {
                Create: {
                  IndexName: 'GSI_ProjectList',
                  KeySchema: [
                    { AttributeName: 'pk', KeyType: 'HASH' },
                    { AttributeName: 'projectType', KeyType: 'RANGE' },
                  ],
                  Projection: { ProjectionType: 'ALL' },
                },
              },
            ],
          })
        );
      } catch (e: any) {
        console.warn(`\n[WARNING] Failed to add GSI automatically: ${e.message}`);
        console.warn(`Since you are using DynamoDB Local, please run:`);
        console.warn(`aws dynamodb delete-table --table-name ${TABLE_NAME} --endpoint-url ${process.env.DYNAMODB_ENDPOINT || 'http://localhost:18000'}`);
        console.warn(`Then restart the server to recreate the table with the correct index.\n`);
      }
    }
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      await client.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [
            { AttributeName: 'pk', KeyType: 'HASH' },
            { AttributeName: 'sk', KeyType: 'RANGE' },
          ],
          AttributeDefinitions: [
            { AttributeName: 'pk', AttributeType: 'S' },
            { AttributeName: 'sk', AttributeType: 'S' },
            { AttributeName: 'projectType', AttributeType: 'S' },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: 'GSI_ProjectList',
              KeySchema: [
                { AttributeName: 'pk', KeyType: 'HASH' },
                { AttributeName: 'projectType', KeyType: 'RANGE' },
              ],
              Projection: { ProjectionType: 'ALL' },
            },
          ],
          BillingMode: 'PAY_PER_REQUEST',
        })
      );
      console.log(`Created DynamoDB table with GSI: ${TABLE_NAME}`);
    } else {
      throw err;
    }
  }
}

import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, CreateQueueCommand } from '@aws-sdk/client-sqs';

export class SqsClient {
  private client: SQSClient;

  constructor(opts: {
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    const isProd = process.env.NODE_ENV === 'production';
    this.client = new SQSClient({
      endpoint: isProd ? undefined : opts.endpoint,
      region: opts.region,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
  }

  getClient(): SQSClient {
    return this.client;
  }

  async ensureQueue(queueName: string): Promise<string> {
    try {
      const response = await this.client.send(
        new CreateQueueCommand({
          QueueName: queueName,
          Attributes: {
            VisibilityTimeout: '300', // 5 minutes
          },
        })
      );
      if (!response.QueueUrl) {
        throw new Error('No QueueUrl returned from CreateQueueCommand');
      }
      return response.QueueUrl;
    } catch (e: any) {
      console.error(`[SqsClient] Failed to create queue ${queueName}:`, e);
      throw e;
    }
  }

  async sendMessage(queueUrl: string, payload: any): Promise<void> {
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(payload),
        })
      );
    } catch (e: any) {
      console.error(`[SqsClient] Failed to send message to ${queueUrl}:`, e);
    }
  }

  async receiveMessages(queueUrl: string, maxNumberOfMessages = 1, waitTimeSeconds = 20) {
    try {
      const response = await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: maxNumberOfMessages,
          WaitTimeSeconds: waitTimeSeconds,
        })
      );
      return response.Messages || [];
    } catch (e: any) {
      console.error(`[SqsClient] Error receiving messages from ${queueUrl}:`, e.message);
      return [];
    }
  }

  async deleteMessage(queueUrl: string, receiptHandle: string) {
    try {
      await this.client.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        })
      );
    } catch (e: any) {
      console.error(`[SqsClient] Failed to delete message from ${queueUrl}:`, e);
    }
  }
}

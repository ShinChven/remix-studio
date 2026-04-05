import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorage } from './storage';

export class S3Storage implements IStorage {
  private client: S3Client;
  private publicClient: S3Client;
  private bucket: string;

  constructor(opts: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicEndpoint?: string;
  }) {
    this.bucket = opts.bucket;
    const credentials = {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    };
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      credentials,
      forcePathStyle: true, // required for MinIO
    });
    this.publicClient = new S3Client({
      endpoint: opts.publicEndpoint || opts.endpoint,
      region: opts.region,
      credentials,
      forcePathStyle: true,
    });
  }

  async ensureBucket(): Promise<void> {
    const { CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async save(key: string, data: Buffer, contentType = 'application/octet-stream'): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getSize(key: string): Promise<number | undefined> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return result.ContentLength;
    } catch {
      return undefined;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.publicClient, command, { expiresIn });
  }

  async rename(oldPrefix: string, newPrefix: string): Promise<void> {
    const listed = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: oldPrefix,
      })
    );

    for (const obj of listed.Contents || []) {
      const newKey = obj.Key!.replace(oldPrefix, newPrefix);
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${obj.Key}`,
          Key: newKey,
        })
      );
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key! })
      );
    }
  }
}

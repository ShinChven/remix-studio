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
    endpoint?: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket: string;
    publicEndpoint?: string;
  }) {
    this.bucket = opts.bucket;
    const credentials = opts.accessKeyId && opts.secretAccessKey
      ? {
          accessKeyId: opts.accessKeyId,
          secretAccessKey: opts.secretAccessKey,
        }
      : undefined;
    const endpoint = opts.endpoint?.trim() || undefined;
    const publicEndpoint = opts.publicEndpoint?.trim() || endpoint;
    const usePathStyle = Boolean(endpoint);

    this.client = new S3Client({
      endpoint,
      region: opts.region,
      credentials,
      forcePathStyle: usePathStyle, // true for MinIO/custom S3 endpoints, false for AWS S3
    });
    this.publicClient = new S3Client({
      endpoint: publicEndpoint,
      region: opts.region,
      credentials,
      forcePathStyle: usePathStyle,
    });
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucketName(): string {
    return this.bucket;
  }

  async ensureBucket(autoCreate = true): Promise<void> {
    const { CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      if (!autoCreate) {
        throw new Error(`S3 bucket "${this.bucket}" does not exist or is not accessible`);
      }
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

  async listObjects(prefix: string): Promise<string[]> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );
    return (result.Contents || []).map((obj) => obj.Key!).filter(Boolean);
  }
  
  async listObjectsWithMetadata(prefix: string): Promise<{ key: string; size: number | undefined }[]> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );
    return (result.Contents || []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size
    })).filter((obj) => Boolean(obj.key));
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

  async getReadStream(key: string): Promise<any> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    return result.Body;
  }
}

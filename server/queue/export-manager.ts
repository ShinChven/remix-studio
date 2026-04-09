import archiver from 'archiver';
import { S3Storage } from '../storage/s3-storage';
import { AlbumItem } from '../../src/types';
import crypto from 'crypto';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { getUserStorageUsage } from '../utils/storage-check';

// TTL helpers (Unix seconds)
const TTL_24H  = () => Math.floor(Date.now() / 1000) + 86400;
const TTL_30D  = () => Math.floor(Date.now() / 1000) + 30 * 86400;

export interface ExportTask {
  id: string;
  projectId: string;
  projectName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current: number;
  total: number;
  size?: number;
  /** S3 key in the export bucket — presigned URL is generated on read */
  s3Key?: string;
  /** Presigned download URL — only populated when returned to the client */
  downloadUrl?: string;
  error?: string;
  createdAt: number;
  ttl?: number;
}


export class ExportManager {
  constructor(
    private repository: IRepository,
    private imageStorage: S3Storage,
    private exportStorage: S3Storage,
    private userRepository: UserRepository
  ) {}

  async startExport(userId: string, projectId: string, projectName: string, items: AlbumItem[]): Promise<string> {
    const taskId = crypto.randomUUID();
    const now = Date.now();
    const taskData = {
      id: taskId,
      projectId,
      projectName,
      status: 'pending' as const,
      current: 0,
      total: items.length,
      createdAt: now,
    };

    await this.repository.saveExportTask(userId, taskId, taskData);

    this.runExportTask(userId, projectId, taskId, projectName, items).catch(e => {
      console.error(`[ExportManager] Task ${taskId} fatal:`, e);
      this.updateTask(userId, taskId, { status: 'failed', error: e.message, ttl: TTL_24H() });
    });

    return taskId;
  }

  private async updateTask(userId: string, taskId: string, updates: Partial<ExportTask>) {
    try {
      const existing = await this.repository.getExportTask(userId, taskId);
      if (existing) {
        await this.repository.saveExportTask(userId, taskId, { ...existing, ...updates });
      }
    } catch (e) {
      console.error(`[ExportManager] Failed to update task ${taskId}:`, e);
    }
  }

  private async runExportTask(userId: string, projectId: string, taskId: string, projectName: string, items: AlbumItem[]) {
    await this.updateTask(userId, taskId, { status: 'processing', current: 0 });

    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    // S3 key includes userId for user isolation, taskId as folder for uniqueness
    const s3Key = `${userId}/exports/${taskId}/${safeProjectName}_Album.zip`;

    try {
      // --- Phase 1: Download each image sequentially ---
      const entries: { name: string; buffer: Buffer }[] = [];
      const seenNames = new Set<string>();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[ExportManager] ${taskId}: Downloading ${i + 1}/${items.length} — ${item.imageUrl}`);

        try {
          const buffer = await Promise.race<Buffer>([
            this.imageStorage.read(item.imageUrl),
            new Promise<Buffer>((_, rej) => setTimeout(() => rej(new Error(`Timeout reading ${item.imageUrl}`)), 30000)),
          ]);

          let name = (item.imageUrl.split('/').pop() || `file_${i + 1}.png`);
          if (seenNames.has(name)) name = `${i + 1}_${name}`;
          seenNames.add(name);
          entries.push({ name, buffer });
        } catch (err: any) {
          console.error(`[ExportManager] ${taskId}: Skipping ${item.imageUrl}: ${err.message}`);
        }

        await this.updateTask(userId, taskId, { status: 'processing', current: i + 1 });
      }

      if (entries.length === 0) throw new Error('No files could be downloaded');

      console.log(`[ExportManager] ${taskId}: Downloaded ${entries.length} files. Building ZIP...`);

      // --- Phase 2: Build ZIP in memory ---
      const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 0 } });
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        for (const entry of entries) {
          archive.append(entry.buffer, { name: entry.name });
        }
        archive.finalize();
      });

      console.log(`[ExportManager] ${taskId}: ZIP built (${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB). Uploading...`);

      // --- Runtime quota check ---
      const totalNewSize = zipBuffer.length;
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.imageStorage, this.exportStorage, this.repository);
      if (currentUsage + totalNewSize > limit) {
        throw new Error(`Storage quota exceeded (${((currentUsage + totalNewSize - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Export aborted.`);
      }

      // --- Phase 3: Upload ZIP to export bucket ---
      await this.exportStorage.save(s3Key, zipBuffer, 'application/zip');
      console.log(`[ExportManager] ${taskId}: Uploaded to export bucket at ${s3Key}`);

      // Store the S3 key (not a presigned URL) — presign on read
      await this.updateTask(userId, taskId, {
        status: 'completed',
        current: items.length,
        size: zipBuffer.length,
        s3Key,
        ttl: TTL_30D(),  // auto-expire in 30 days
      });

    } catch (err: any) {
      console.error(`[ExportManager] ${taskId} error:`, err);
      await this.updateTask(userId, taskId, {
        status: 'failed',
        current: 0,
        error: err.message,
        ttl: TTL_24H(),  // auto-expire failed tasks in 24 hours
      });
    }
  }

  /** Fetch a single task and attach a fresh presigned URL if completed */
  async getTask(userId: string, taskId: string): Promise<ExportTask | undefined> {
    const task = await this.repository.getExportTask(userId, taskId);
    if (!task) return undefined;
    return this.presignTask(task);
  }

  /** Attach a fresh presigned URL to any completed task that has an s3Key */
  async presignTask(task: any): Promise<ExportTask> {
    if (task.status === 'completed' && task.s3Key) {
      try {
        const downloadUrl = await this.exportStorage.getPresignedUrl(task.s3Key, 3600);
        return { ...task, downloadUrl };
      } catch (e) {
        console.warn(`[ExportManager] Failed to presign ${task.s3Key}:`, e);
      }
    }
    return task;
  }
}

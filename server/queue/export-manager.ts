import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import crypto from 'crypto';
import { S3Storage } from '../storage/s3-storage';
import { AlbumItem } from '../../src/types';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { getUserStorageUsage } from '../utils/storage-check';

// TTL helpers (Unix seconds)
const TTL_24H = () => Math.floor(Date.now() / 1000) + 86400;
const TTL_30D = () => Math.floor(Date.now() / 1000) + 30 * 86400;

/** Max concurrent export jobs running at the same time. */
const MAX_CONCURRENT_EXPORTS = 1;

/** Idle timeout per source stream — if no data for this long, abort. */
const IDLE_TIMEOUT_MS = 20_000;

/** Heartbeat interval for in-flight tasks. */
const HEARTBEAT_INTERVAL_MS = 10_000;

/** Reaper polling interval — how often to check for stuck tasks. */
const REAPER_INTERVAL_MS = 60_000;

export interface ExportTask {
  id: string;
  projectId: string;
  projectName: string;
  packageName?: string;
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
  private readonly workerId = crypto.randomUUID();
  private running = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private repository: IRepository,
    private imageStorage: S3Storage,
    private exportStorage: S3Storage,
    private userRepository: UserRepository
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Insert a pending task row and return the taskId immediately.
   * The worker loop will pick it up and run it.
   */
  private normalizePackageName(value?: string, fallbackProjectName?: string): string {
    const raw = (value || '').trim() || `${fallbackProjectName || 'Album'}_Album.zip`;
    const withoutZip = raw.replace(/\.zip$/i, '').trim();
    const safeBase = (withoutZip || `${fallbackProjectName || 'Album'}_Album`).replace(/[^a-zA-Z0-9-_]/g, '_');
    const compactBase = safeBase.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'Album';
    return `${compactBase}.zip`;
  }

  async startExport(
    userId: string,
    projectId: string,
    projectName: string,
    items: AlbumItem[],
    packageName?: string
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    const now = Date.now();
    const normalizedPackageName = this.normalizePackageName(packageName, projectName);
    const taskData: ExportTask = {
      id: taskId,
      projectId,
      projectName,
      packageName: normalizedPackageName,
      status: 'pending',
      current: 0,
      total: items.length,
      createdAt: now,
    };

    await this.repository.saveExportTask(userId, taskId, taskData);

    // Store items list in the data blob so the worker can read them back
    await this.repository.saveExportTask(userId, taskId, {
      ...taskData,
      items,
    });

    // Kick the loop in case it's sleeping
    this.scheduleLoop(0);

    return taskId;
  }

  /** Fetch a single task and attach a fresh presigned URL if completed. */
  async getTask(userId: string, taskId: string): Promise<ExportTask | undefined> {
    const task = await this.repository.getExportTask(userId, taskId);
    if (!task) return undefined;
    return this.presignTask(task);
  }

  /** Attach a fresh presigned URL to any completed task that has an s3Key. */
  async presignTask(task: any): Promise<ExportTask> {
    if (task.status === 'completed' && task.s3Key) {
      try {
        const packageName = this.normalizePackageName(task.packageName, task.projectName);
        const downloadUrl = await this.exportStorage.getPresignedUrl(task.s3Key, 86400, {
          responseContentDisposition: `attachment; filename="${packageName}"`,
          responseContentType: 'application/zip',
        });
        return { ...task, downloadUrl };
      } catch (e) {
        console.warn(`[ExportManager] Failed to presign ${task.s3Key}:`, e);
      }
    }
    return task;
  }

  // ─── Worker Loop ──────────────────────────────────────────────────────────

  /** Start the background claim loop and reaper. Call once at server startup. */
  startWorkerLoop(): void {
    this.scheduleLoop(0);
    this.reaperTimer = setInterval(() => this.reap(), REAPER_INTERVAL_MS);
    console.log(`[ExportManager] Worker loop started (worker=${this.workerId}, max=${MAX_CONCURRENT_EXPORTS})`);
  }

  stopWorkerLoop(): void {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    if (this.reaperTimer) clearInterval(this.reaperTimer);
  }

  private scheduleLoop(delayMs: number): void {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.loop(), delayMs);
  }

  private async loop(): Promise<void> {
    if (this.running >= MAX_CONCURRENT_EXPORTS) {
      // At capacity — check again in 5s
      this.scheduleLoop(5_000);
      return;
    }

    const task = await this.repository.claimNextExportTask(this.workerId).catch((e) => {
      console.error('[ExportManager] claimNextExportTask error:', e);
      return null;
    });

    if (!task) {
      // Nothing to do — check again in 5s
      this.scheduleLoop(5_000);
      return;
    }

    this.running++;
    this.runExportTask(task).finally(() => {
      this.running--;
      // Immediately try to claim another task
      this.scheduleLoop(0);
    });

    // If we still have capacity, schedule another claim immediately
    if (this.running < MAX_CONCURRENT_EXPORTS) {
      this.scheduleLoop(0);
    }
  }

  // ─── Pipeline ─────────────────────────────────────────────────────────────

  private async runExportTask(task: any): Promise<void> {
    const { id: taskId, userId, projectName, packageName } = task;
    const items: AlbumItem[] = task.items ?? [];

    console.log(`[ExportManager] Starting task ${taskId} (${items.length} items, user=${userId})`);

    const normalizedPackageName = this.normalizePackageName(packageName, projectName);
    const s3Key = `${userId}/exports/${taskId}/${normalizedPackageName}`;

    // Heartbeat timer
    const heartbeatInterval = setInterval(async () => {
      await this.repository.heartbeatExportTask(taskId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    try {
      if (items.length === 0) throw new Error('No items to export');

      // ── Pre-flight quota check ────────────────────────────────────────────
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit ?? 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.imageStorage, this.exportStorage, this.repository);

      let estimatedSize = 0;
      for (const item of items) {
        if (item.imageUrl) {
          const size = await this.imageStorage.getSize(item.imageUrl).catch(() => undefined);
          estimatedSize += size ?? (item.size ?? 5 * 1024 * 1024);
        }
      }

      if (currentUsage + estimatedSize > limit) {
        throw new Error(
          `Storage quota exceeded: ${((currentUsage + estimatedSize - limit) / (1024 * 1024)).toFixed(1)} MB over limit`
        );
      }

      // ── Streaming pipeline ────────────────────────────────────────────────
      const archive = archiver('zip', { zlib: { level: 0 } });
      const passThrough = new PassThrough();
      let bytesUploaded = 0;

      archive.on('error', (err) => passThrough.destroy(err));
      archive.on('warning', (err) => console.warn(`[ExportManager] Archive warning for ${taskId}:`, err));

      archive.pipe(passThrough);

      // Run the S3 upload and the append loop concurrently
      const uploadPromise = this.exportStorage.uploadStream(s3Key, passThrough, 'application/zip', (loaded) => {
        bytesUploaded = loaded;
      });

      // Quota byte counter on the passthrough
      let bytesWritten = 0;
      passThrough.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
        if (currentUsage + bytesWritten > limit) {
          archive.abort();
          passThrough.destroy(new Error('Storage quota exceeded at runtime'));
        }
      });

      const seenNames = new Set<string>();
      let done = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.imageUrl) { done++; continue; }

        console.log(`[ExportManager] ${taskId}: stream ${i + 1}/${items.length} — ${item.imageUrl}`);

        // Build a unique filename
        let name = item.imageUrl.split('/').pop() || `file_${i + 1}.png`;
        if (seenNames.has(name)) name = `${i + 1}_${name}`;
        seenNames.add(name);

        // Idle-timeout wrapper around the S3 read stream
        const sourceStream = await Promise.race([
          this.imageStorage.readStream(item.imageUrl),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Idle timeout opening ${item.imageUrl}`)), IDLE_TIMEOUT_MS)),
        ]);

        // Per-stream idle timeout: reset timer on every data event
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        const resetIdle = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            sourceStream.destroy(new Error(`Idle timeout reading ${item.imageUrl}`));
          }, IDLE_TIMEOUT_MS);
        };
        sourceStream.on('data', resetIdle);
        resetIdle();
        sourceStream.once('close', () => { if (idleTimer) clearTimeout(idleTimer); });

        archive.append(sourceStream as any, { name });
        await once(archive, 'entry');
        if (idleTimer) clearTimeout(idleTimer);

        done++;
        await this.updateTask(userId, taskId, { status: 'processing', current: done });
      }

      archive.finalize();
      await uploadPromise;

      console.log(`[ExportManager] ${taskId}: upload done — ${(bytesUploaded / 1024 / 1024).toFixed(1)} MB`);

      await this.updateTask(userId, taskId, {
        status: 'completed',
        current: items.length,
        size: bytesUploaded,
        s3Key,
        ttl: TTL_30D(),
      });
    } catch (err: any) {
      console.error(`[ExportManager] ${taskId} error:`, err);
      await this.updateTask(userId, taskId, {
        status: 'failed',
        current: 0,
        error: err.message,
        ttl: TTL_24H(),
      });
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async updateTask(userId: string, taskId: string, updates: Partial<ExportTask>): Promise<void> {
    try {
      const existing = await this.repository.getExportTask(userId, taskId);
      if (existing) {
        await this.repository.saveExportTask(userId, taskId, { ...existing, ...updates });
      }
    } catch (e) {
      console.error(`[ExportManager] Failed to update task ${taskId}:`, e);
    }
  }

  private async reap(): Promise<void> {
    try {
      const count = await this.repository.reapStaleExportTasks(2);
      if (count > 0) {
        console.log(`[ExportManager] Reaped ${count} stale export task(s)`);
        this.scheduleLoop(0);
      }
    } catch (e) {
      console.error('[ExportManager] Reaper error:', e);
    }
  }
}

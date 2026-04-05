import archiver from 'archiver';
import { S3Storage } from '../storage/s3-storage';
import { AlbumItem } from '../../src/types';
import crypto from 'crypto';

export interface ExportTask {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current: number;
  total: number;
  downloadUrl?: string;
  error?: string;
}

export class ExportManager {
  private tasks: Map<string, ExportTask> = new Map();

  constructor(
    private imageStorage: S3Storage,
    private exportStorage: S3Storage
  ) {}

  async startExport(userId: string, projectId: string, projectName: string, items: AlbumItem[]): Promise<string> {
    const taskId = crypto.randomUUID();
    this.tasks.set(taskId, { id: taskId, status: 'pending', current: 0, total: items.length });

    this.runExportTask(taskId, projectName, items).catch(e => {
      console.error(`[ExportManager] Task ${taskId} fatal:`, e);
      const task = this.tasks.get(taskId);
      if (task) this.tasks.set(taskId, { ...task, status: 'failed', error: e.message });
    });

    return taskId;
  }

  private async runExportTask(taskId: string, projectName: string, items: AlbumItem[]) {
    this.tasks.set(taskId, { id: taskId, status: 'processing', current: 0, total: items.length });

    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const zipKey = `${safeProjectName}_Album_${taskId.slice(0, 8)}.zip`;

    try {
      // --- Phase 1: Download each image sequentially ---
      const entries: { name: string; buffer: Buffer }[] = [];
      const seenNames = new Set<string>();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[ExportManager] ${taskId}: Downloading ${i + 1}/${items.length} — ${item.imageUrl}`);

        try {
          // Race against a 30-second timeout per file
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

        // Update progress after each file regardless of success/failure
        this.tasks.set(taskId, { id: taskId, status: 'processing', current: i + 1, total: items.length });
      }

      if (entries.length === 0) throw new Error('No files could be downloaded');

      console.log(`[ExportManager] ${taskId}: Downloaded ${entries.length} files. Building ZIP...`);

      // --- Phase 2: Build ZIP in memory ---
      const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 0 } }); // level 0 = store only, fastest
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

      // --- Phase 3: Upload ZIP to export bucket ---
      await this.exportStorage.save(zipKey, zipBuffer, 'application/zip');

      console.log(`[ExportManager] ${taskId}: Uploaded to export bucket.`);

      const downloadUrl = await this.exportStorage.getPresignedUrl(zipKey);
      this.tasks.set(taskId, { id: taskId, status: 'completed', current: items.length, total: items.length, downloadUrl });

    } catch (err: any) {
      console.error(`[ExportManager] ${taskId} error:`, err);
      this.tasks.set(taskId, { id: taskId, status: 'failed', current: 0, total: items.length, error: err.message });
    }
  }

  getTask(taskId: string): ExportTask | undefined {
    return this.tasks.get(taskId);
  }
}

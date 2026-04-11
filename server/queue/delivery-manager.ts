import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import { S3Storage } from '../storage/s3-storage';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { decrypt } from '../utils/crypto';

/** Max concurrent Drive upload jobs. */
const MAX_CONCURRENT_DELIVERIES = 1;

const HEARTBEAT_INTERVAL_MS = 10_000;
const REAPER_INTERVAL_MS = 60_000;
const DRIVE_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

// 48 h TTL on delivery tasks (success or failure)
const TTL_48H = () => Math.floor(Date.now() / 1000) + 2 * 86400;

function bufferFromChunk(chunk: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  return typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
}

function takeBufferedBytes(buffers: Buffer[], bytesToTake: number): Buffer {
  const chunk = Buffer.allocUnsafe(bytesToTake);
  let written = 0;

  while (written < bytesToTake) {
    const head = buffers[0];
    if (!head) throw new Error('Buffered stream ended unexpectedly');

    const bytes = Math.min(head.length, bytesToTake - written);
    head.copy(chunk, written, 0, bytes);
    written += bytes;

    if (bytes === head.length) {
      buffers.shift();
    } else {
      buffers[0] = head.subarray(bytes);
    }
  }

  return chunk;
}

async function* chunkReadable(readable: Readable, chunkSize: number): AsyncGenerator<Buffer> {
  const buffers: Buffer[] = [];
  let bufferedBytes = 0;

  for await (const rawChunk of readable) {
    const chunk = bufferFromChunk(rawChunk as Buffer | Uint8Array | string);
    buffers.push(chunk);
    bufferedBytes += chunk.length;

    while (bufferedBytes >= chunkSize) {
      yield takeBufferedBytes(buffers, chunkSize);
      bufferedBytes -= chunkSize;
    }
  }

  if (bufferedBytes > 0) {
    yield takeBufferedBytes(buffers, bufferedBytes);
  }
}

function getDriveAckBytes(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = /^bytes=0-(\d+)$/.exec(rangeHeader.trim());
  if (!match) return null;
  return Number(match[1]) + 1;
}

function toFetchBody(chunk: Buffer): Uint8Array {
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

export interface DeliveryTask {
  id: string;
  userId: string;
  exportTaskId: string;
  destination: 'drive';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytesTransferred: number;
  totalBytes?: number;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  createdAt: number;
}

export class DeliveryManager {
  private readonly workerId = crypto.randomUUID();
  private running = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private repository: IRepository,
    private exportStorage: S3Storage,
    private userRepository: UserRepository,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Submit a Drive upload job for a completed export.
   * Returns the deliveryTaskId immediately — caller should poll GET /api/deliveries/:id.
   */
  async startDelivery(userId: string, exportTaskId: string, destination: 'drive' = 'drive'): Promise<string> {
    const taskId = crypto.randomUUID();
    const data: DeliveryTask = {
      id: taskId,
      userId,
      exportTaskId,
      destination,
      status: 'pending',
      bytesTransferred: 0,
      createdAt: Date.now(),
    };
    await this.repository.saveDeliveryTask(userId, taskId, data);
    this.scheduleLoop(0);
    return taskId;
  }

  async getTask(userId: string, taskId: string): Promise<DeliveryTask | undefined> {
    return this.repository.getDeliveryTask(userId, taskId);
  }

  // ─── Worker Loop ───────────────────────────────────────────────────────────

  startWorkerLoop(): void {
    this.scheduleLoop(0);
    this.reaperTimer = setInterval(() => this.reap(), REAPER_INTERVAL_MS);
    console.log(`[DeliveryManager] Worker loop started (worker=${this.workerId}, max=${MAX_CONCURRENT_DELIVERIES})`);
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
    if (this.running >= MAX_CONCURRENT_DELIVERIES) {
      this.scheduleLoop(5_000);
      return;
    }

    const task = await this.repository.claimNextDeliveryTask(this.workerId).catch((e) => {
      console.error('[DeliveryManager] claimNextDeliveryTask error:', e);
      return null;
    });

    if (!task) {
      this.scheduleLoop(5_000);
      return;
    }

    this.running++;
    this.runDeliveryTask(task).finally(() => {
      this.running--;
      this.scheduleLoop(0);
    });

    if (this.running < MAX_CONCURRENT_DELIVERIES) this.scheduleLoop(0);
  }

  // ─── Delivery Pipeline ─────────────────────────────────────────────────────

  private async runDeliveryTask(task: any): Promise<void> {
    const { id: taskId, userId, exportTaskId } = task;
    console.log(`[DeliveryManager] Starting delivery ${taskId} for export ${exportTaskId}`);

    const heartbeatInterval = setInterval(async () => {
      await this.repository.heartbeatDeliveryTask(taskId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    try {
      // Load the completed export task
      const exportTask = await this.repository.getExportTask(userId, exportTaskId);
      if (!exportTask || exportTask.status !== 'completed' || !exportTask.s3Key) {
        throw new Error('Source export is not completed or has no S3 key');
      }

      // Check Google Drive is connected
      const encryptedToken = await this.userRepository.getGoogleDriveRefreshToken(userId);
      if (!encryptedToken) throw new Error('Google Drive is not connected');

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured on this server');

      // Get a fresh access token
      const refreshToken = decrypt(encryptedToken);
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('[DeliveryManager] Token refresh failed:', errText);
        if (tokenRes.status === 400 || tokenRes.status === 401) {
          await this.userRepository.clearGoogleDriveRefreshToken(userId);
        }
        throw new Error('Google Drive authorization expired. Please reconnect on the Exports page.');
      }

      const { access_token } = await tokenRes.json() as { access_token: string };
      const fileName = exportTask.s3Key.split('/').pop() || `export_${exportTaskId}.zip`;
      const totalBytes = exportTask.size;
      if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
        throw new Error('Source export is missing a valid size');
      }

      // Update totalBytes so frontend can show progress
      await this.repository.saveDeliveryTask(userId, taskId, {
        ...task,
        status: 'processing',
        totalBytes,
      });

      // ── Resumable upload to Google Drive ────────────────────────────────
      // 1. Initiate resumable session
      const initRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/zip',
            ...(totalBytes ? { 'X-Upload-Content-Length': String(totalBytes) } : {}),
          },
          body: JSON.stringify({ name: fileName, mimeType: 'application/zip' }),
        }
      );
      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Drive resumable init failed: ${errText}`);
      }

      const resumableUri = initRes.headers.get('Location');
      if (!resumableUri) throw new Error('No resumable URI returned from Drive');

      // 2. Stream the ZIP from S3 and upload it to Drive in bounded resumable chunks
      const zipStream = await this.exportStorage.readStream(exportTask.s3Key);
      let bytesTransferred = 0;
      let finalResponse: Response | null = null;

      try {
        for await (const chunk of chunkReadable(zipStream, DRIVE_UPLOAD_CHUNK_SIZE)) {
          const rangeStart = bytesTransferred;
          const rangeEnd = rangeStart + chunk.length - 1;
          const response = await fetch(resumableUri, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': String(chunk.length),
              'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalBytes}`,
            },
            body: toFetchBody(chunk),
          });

          if (response.status !== 308 && !response.ok) {
            const errText = await response.text();
            throw new Error(`Drive upload failed (${response.status}): ${errText}`);
          }

          if (response.status === 308) {
            const ackBytes = getDriveAckBytes(response.headers.get('Range'));
            if (ackBytes == null) {
              throw new Error('Drive did not acknowledge the uploaded chunk');
            }
            if (ackBytes !== rangeEnd + 1) {
              throw new Error(`Drive acknowledged ${ackBytes} bytes, expected ${rangeEnd + 1}`);
            }
            bytesTransferred = ackBytes;
          } else {
            bytesTransferred = rangeEnd + 1;
          }

          await this.repository.saveDeliveryTask(userId, taskId, {
            ...task,
            status: 'processing',
            totalBytes,
            bytesTransferred,
          });

          if (response.status !== 308) {
            finalResponse = response;
            break;
          }
        }
      } finally {
        zipStream.destroy();
      }

      if (bytesTransferred !== totalBytes) {
        throw new Error(`Drive upload ended early at ${bytesTransferred} of ${totalBytes} bytes`);
      }

      if (!finalResponse) {
        throw new Error('Drive upload did not return a completion response');
      }

      const driveFile = await finalResponse.json() as { id: string };
      const externalUrl = `https://drive.google.com/file/d/${driveFile.id}/view`;

      await this.repository.saveDeliveryTask(userId, taskId, {
        ...task,
        status: 'completed',
        externalId: driveFile.id,
        externalUrl,
        bytesTransferred,
        expiresAt: TTL_48H(),
      });
      console.log(`[DeliveryManager] ${taskId} completed — Drive file ${driveFile.id}`);
    } catch (err: any) {
      console.error(`[DeliveryManager] ${taskId} error:`, err);
      await this.repository.saveDeliveryTask(userId, taskId, {
        ...task,
        status: 'failed',
        error: err.message,
        expiresAt: TTL_48H(),
      });
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  private async reap(): Promise<void> {
    try {
      const count = await this.repository.reapStaleDeliveryTasks(2);
      if (count > 0) {
        console.log(`[DeliveryManager] Reaped ${count} stale delivery task(s)`);
        this.scheduleLoop(0);
      }
    } catch (e) {
      console.error('[DeliveryManager] Reaper error:', e);
    }
  }
}

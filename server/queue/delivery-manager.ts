import crypto from 'node:crypto';
import { S3Storage } from '../storage/s3-storage';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { decrypt } from '../utils/crypto';

/** Max concurrent Drive upload jobs. */
const MAX_CONCURRENT_DELIVERIES = 1;

const HEARTBEAT_INTERVAL_MS = 10_000;
const REAPER_INTERVAL_MS = 60_000;

// 48 h TTL on delivery tasks (success or failure)
const TTL_48H = () => Math.floor(Date.now() / 1000) + 2 * 86400;

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

      // 2. Stream the ZIP from S3 and upload to Drive in one pass
      const zipStream = await this.exportStorage.readStream(exportTask.s3Key);

      // Collect chunks for the upload body (resumable single-request upload)
      // For large files this uses Node's pipe to avoid buffering the whole file;
      // we read it as a stream and send it as a streaming body to fetch.
      // Node fetch supports ReadableStream bodies.
      const response = await fetch(resumableUri, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/zip',
          ...(totalBytes ? { 'Content-Length': String(totalBytes) } : {}),
        },
        // @ts-ignore — Node 18+ fetch accepts Node Readable
        body: zipStream,
        // @ts-ignore
        duplex: 'half',
      });

      if (!response.ok && response.status !== 308) {
        const errText = await response.text();
        throw new Error(`Drive upload failed (${response.status}): ${errText}`);
      }

      const driveFile = await response.json() as { id: string };
      const externalUrl = `https://drive.google.com/file/d/${driveFile.id}/view`;

      await this.repository.saveDeliveryTask(userId, taskId, {
        ...task,
        status: 'completed',
        externalId: driveFile.id,
        externalUrl,
        bytesTransferred: totalBytes ?? 0,
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

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ProviderRepository } from '../db/provider-repository';
import { ProjectRepository } from '../db/project-repository';
import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { buildGenerator } from '../generators/build-generator';
import { Job, Project, ProviderType, AlbumItem } from '../../src/types';
import { generateThumbnail, generateOptimized } from '../utils/image-utils';
import { getUserStorageUsage } from '../utils/storage-check';
import crypto from 'crypto';
import sharp from 'sharp';

const TABLE_NAME = 'remix-studio';

interface QueuedJob {
  userId: string;
  projectId: string;
  job: Job;
  aspectRatio?: string;
  quality?: string;
  format?: string;
  modelConfigId?: string;
}

import { SqsClient } from './sqs-client';

/**
 * QueueManager manages parallel AI generation tasks globally across all users.
 * It enforces per-provider concurrency limits and ensures task persistence.
 */
export class QueueManager {
  private activeJobs: Map<string, number> = new Map(); // providerId -> active count
  private queues: Map<string, QueuedJob[]> = new Map(); // providerId -> pending jobs
  private activeJobIds: Set<string> = new Set(); // global dedup: tracks jobIds from enqueue through executeJob completion
  private intervalId?: NodeJS.Timeout;

  constructor(
    private client: DynamoDBDocumentClient,
    private providerRepo: ProviderRepository,
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private userRepository: UserRepository,
    private exportStorage: S3Storage,
    private sqsClient?: SqsClient,
    private queueUrl?: string
  ) {
    this.intervalId = setInterval(() => {
      this.pollDetachedTasks().catch((e) => {
        console.error('[QueueManager] Detached Poller Error:', e);
      });
    }, 30_000); // 30s
  }

  public async startWorker() {
    if (!this.sqsClient || !this.queueUrl) return;
    console.log('[QueueManager] Starting SQS Consumer Worker...');
    
    setImmediate(async () => {
      while (true) {
        try {
          const messages = await this.sqsClient!.receiveMessages(this.queueUrl!, 1, 20);
          for (const msg of messages) {
            if (!msg.Body || !msg.ReceiptHandle) continue;
            
            const payload = JSON.parse(msg.Body) as QueuedJob & { providerId: string };
            console.log(`[QueueManager] Working on SQS msg for job ${payload.job.id}`);
            
            const provider = await this.providerRepo.getProvider(payload.userId, payload.providerId);
            if (!provider) {
               await this.sqsClient!.deleteMessage(this.queueUrl!, msg.ReceiptHandle);
               continue;
            }

            try {
              // Execute synchronously for now on worker, or we can await executeJob.
              await this.executeJob(payload, provider);
            } catch (jobError) {
              console.error(`[QueueManager] Job execution error:`, jobError);
            } finally {
              // Once execution finished (success, failed, or shifted to detached), 
              // we delete the SQS message because detached processing handles itself.
              await this.sqsClient!.deleteMessage(this.queueUrl!, msg.ReceiptHandle);
            }
          }
        } catch (err) {
          console.error('[QueueManager] SQS polling error:', err);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    });
  }

  public async pollDetachedTasks() {
    let lastKey: any;
    do {
      const result = await this.client.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(pk, :prefix) AND begins_with(sk, :projPrefix)',
        ExpressionAttributeValues: {
          ':prefix': 'USER_DATA#',
          ':projPrefix': 'PROJECT#'
        },
        ExclusiveStartKey: lastKey
      }));

      for (const item of (result.Items || [])) {
        const userId = item.pk.replace('USER_DATA#', '');
        const sk = item.sk as string;

        // If it's a individual Job item (Sort Key contains #JOB#)
        if (sk.includes('#JOB#')) {
          const job = item as unknown as Job;
          const [projPrefix, jobId] = sk.split('#JOB#');
          const projectId = projPrefix.replace('PROJECT#', '');

          if ((job.status === 'processing' || job.status === 'failed') && job.taskId) {
            console.log(`[QueueManager] Detached Poll (Healing): Checking Job ${jobId} in Project ${projectId} - Last status: ${job.status}`);
            await this.checkJobStatus(userId, projectId, job);
          }
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }

  private async checkJobStatus(userId: string, projectId: string, job: Job) {
    try {
      const providerRecord = await this.providerRepo.getProvider(userId, job.providerId!);
      if (!providerRecord) return;

      const apiKey = await this.providerRepo.getDecryptedApiKey(userId, providerRecord.providerId);
      if (!apiKey) return;

      const generator = buildGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);
      if (!generator.checkStatus) {
        console.warn(`[QueueManager] Generator for ${providerRecord.type} does not support checkStatus. Skipping Job ${job.id}`);
        return; 
      }

      console.log(`[QueueManager] Checking RunningHub status for Job ${job.id} (TaskId: ${job.taskId})`);
      const res = await generator.checkStatus(job.taskId!);
      console.log(`[QueueManager] Job ${job.id} Status: ${res.status}`);

      if (res.status === 'completed' && res.imageBytes) {
        console.log(`[QueueManager] Job ${job.id} detached poll completed successfully.`);
        const queued: QueuedJob = { userId, projectId, job, format: job.format, quality: job.quality, aspectRatio: job.aspectRatio, modelConfigId: job.modelConfigId };
        await this.processCompletedImage(res.imageBytes, queued);
      } else if (res.status === 'failed') {
        const errorMsg = res.error || 'Task failed on remote server.';
        console.log(`[QueueManager] Job ${job.id} detached poll failed (final): ${errorMsg}`);
        // RunningHub definitively says FAILED — clear taskId to stop polling
        await this.updateJobStatus(userId, projectId, job.id, { status: 'failed', error: errorMsg, taskId: undefined });
      }
    } catch (e: any) {
      console.error(`[QueueManager] checkStatus for ${job.id} failed:`, e);
    }
  }

  /**
   * Scan for pending jobs in a project and add them to the correct provider's queue.
   */
  async enqueueProject(userId: string, projectId: string) {
    const project = await this.projectRepo.getProject(userId, projectId);
    if (!project || !project.providerId) return;

    console.log(`[QueueManager] Enqueuing project ${projectId}. Total jobs: ${project.jobs.length}`);

    // ONLY pick up 'pending' jobs. Never auto-retry 'failed' jobs — retry must be explicit.
    // Jobs with a taskId are owned by the detached poller.
    const jobsToRun = project.jobs.filter(j => j.status === 'pending');

    const skipped = project.jobs.length - jobsToRun.length;
    if (skipped > 0) {
      console.log(`[QueueManager] Project ${projectId}: Picking up ${jobsToRun.length} pending jobs. Skipping ${skipped} jobs (not pending).`);
    }

    for (const job of jobsToRun) {
      this.enqueue(
        userId, 
        project.id, 
        job, 
        job.providerId || project.providerId!, 
        job.aspectRatio || project.aspectRatio, 
        job.quality || project.quality,
        job.format || project.format,
        job.modelConfigId
      );
    }
  }

  private enqueue(userId: string, projectId: string, job: Job, providerId: string, aspectRatio?: string, quality?: string, format?: string, modelConfigId?: string) {
    // Global dedup: covers both in-queue and currently-executing jobs
    if (this.activeJobIds.has(job.id)) return;

    if (this.sqsClient && this.queueUrl) {
      this.activeJobIds.add(job.id);
      this.sqsClient.sendMessage(this.queueUrl, { userId, projectId, job, providerId, aspectRatio, quality, format, modelConfigId });
      console.log(`[QueueManager] Job ${job.id} pushed to SQS.`);
    } else {
      // Legacy fallback
      if (!this.queues.has(providerId)) this.queues.set(providerId, []);
      this.activeJobIds.add(job.id);
      this.queues.get(providerId)!.push({ userId, projectId, job, aspectRatio, quality, format, modelConfigId });
      this.processNext(providerId);
    }
  }

  private async processNext(providerId: string) {
    const queue = this.queues.get(providerId) || [];
    if (queue.length === 0) return;

    const provider = await this.providerRepo.getProvider(queue[0]?.userId, providerId);
    if (!provider) {
      const dropped = queue.shift();
      console.warn(`[QueueManager] Provider not found: ${providerId} for user ${dropped?.userId}`);
      this.processNext(providerId);
      return;
    }

    const limit = provider.concurrency || 1;

    // Drain as many jobs as concurrency allows in one pass
    while (queue.length > 0 && (this.activeJobs.get(providerId) || 0) < limit) {
      // Shift IMMEDIATELY (synchronous) to lock the item — no await between read and shift
      const nextJob = queue.shift()!;
      this.activeJobs.set(providerId, (this.activeJobs.get(providerId) || 0) + 1);

      // Run in background (do not await)
      this.executeJob(nextJob, provider).finally(() => {
        this.activeJobIds.delete(nextJob.job.id);
        this.activeJobs.set(providerId, Math.max(0, (this.activeJobs.get(providerId) || 1) - 1));
        this.processNext(providerId);
      });
    }
  }

  private async executeJob(queued: QueuedJob, providerRecord: any) {
    const { userId, projectId, job } = queued;
    
    console.log(`[QueueManager] Executing job ${job.id} for project ${projectId} using provider ${providerRecord.providerId}`);

    try {
      // 1. Mark as processing in DB
      await this.updateJobStatus(userId, projectId, job.id, { 
        status: 'processing', 
        error: undefined 
      });

      // 2. Build generator
      const apiKey = await this.providerRepo.getDecryptedApiKey(userId, providerRecord.providerId);
      if (!apiKey) throw new Error('Stored API key not found for provider');

      const generator = buildGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);
      
      // Resolve imageContexts: could be S3 keys, presigned URLs, or base64 data URLs
      let refImages: string[] | undefined;
      if (job.imageContexts && job.imageContexts.length > 0) {
        refImages = [];
        for (const ctx of job.imageContexts) {
          if (ctx.startsWith('data:')) {
            // Base64 data URL — strip prefix
            refImages.push(ctx.replace(/^data:image\/\w+;base64,/, ''));
          } else if (ctx.startsWith('http')) {
            // Presigned URL — download the image
            const response = await fetch(ctx);
            if (!response.ok) throw new Error(`Failed to download reference image: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            refImages.push(buffer.toString('base64'));
          } else {
            // S3 key — read directly from storage
            const buffer = await this.storage.read(ctx);
            refImages.push(buffer.toString('base64'));
          }
        }
      }

      const modelConfig = providerRecord.models?.find((m: any) => m.id === job.modelConfigId || m.id === queued.modelConfigId);

      // 3. Generate
      const result = await generator.generate({
        prompt: job.prompt,
        modelId: modelConfig?.modelId,
        apiUrl: modelConfig?.apiUrl,
        aspectRatio: queued.aspectRatio || '1:1', 
        imageSize: queued.quality || '1K',
        refImagesBase64: refImages
      });

      if (result.ok === false) throw new Error(result.error);

      if (result.status === 'processing' && result.taskId) {
        console.log(`[QueueManager] Job ${job.id} shifted to detached polling. TaskId: ${result.taskId}`);
        await this.updateJobStatus(userId, projectId, job.id, { 
          status: 'processing', 
          taskId: result.taskId, 
          error: undefined 
        });
        return; // Detached!
      }

      await this.processCompletedImage(result.imageBytes!, queued);
    } catch (e: any) {
      console.error(`[QueueManager] Job ${job.id} failed:`, e.message);
      // If the job already has a taskId persisted, RunningHub may still be working on it.
      // Leave it as 'processing' so the poller can pick it up — don't override with 'failed'.
      const currentJob = await this.projectRepo.getJob(userId, projectId, job.id);
      if (currentJob?.taskId) {
        console.log(`[QueueManager] Job ${job.id} has taskId ${currentJob.taskId}, keeping as processing for poller.`);
        await this.updateJobStatus(userId, projectId, job.id, {
          status: 'processing',
          error: e.message || 'Local error, awaiting remote result'
        });
      } else {
        await this.updateJobStatus(userId, projectId, job.id, {
          status: 'failed',
          error: e.message || 'Unknown generation error'
        });
      }
    }
  }

  private async processCompletedImage(imageBytes: Buffer, queued: QueuedJob) {
    const { userId, projectId, job } = queued;
    try {
      // 4. Save to storage
      const targetFormat = queued.format || job.format || 'png';
      let finalBytes: Buffer;
      let mimeType: string;
      let ext: string;

      // Create sharp instance and add metadata
      let sharpInstance = sharp(imageBytes).withMetadata({
        exif: {
          IFD0: {
            UserComment: job.prompt
          }
        }
      });

      if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
        finalBytes = await sharpInstance.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
        mimeType = 'image/jpeg';
        ext = 'jpg';
      } else if (targetFormat === 'webp') {
        finalBytes = await sharpInstance.webp({ quality: 100, lossless: true }).toBuffer();
        mimeType = 'image/webp';
        ext = 'webp';
      } else {
        // Always explicitly convert to PNG via sharp, so the output bytes truly are PNG
        // regardless of what format the AI provider returned.
        finalBytes = await sharpInstance.png().toBuffer();
        mimeType = 'image/png';
        ext = 'png';
      }

      const idPart = job.filename || crypto.randomUUID();
      const filename = `${userId}/${projectId}/${idPart}`;
      const s3Url = await this.storage.save(`${filename}.${ext}`, finalBytes, mimeType);

      // Generate and save thumbnail/optimized versions (metadata is usually stripped for these)
      const thumbBuffer = await generateThumbnail(finalBytes);
      const thumbKey = `${filename}.thumb.jpg`;
      await this.storage.save(thumbKey, thumbBuffer, 'image/jpeg');

      const optBuffer = await generateOptimized(finalBytes);
      const optKey = `${filename}.opt.jpg`;
      await this.storage.save(optKey, optBuffer, 'image/jpeg');

      // 5. Runtime quota check — guards against concurrent uploads filling the space
      //    during the generation window. Uses actual file sizes (not estimates).
      const totalNewSize = finalBytes.length + thumbBuffer.length + optBuffer.length;
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.storage, this.exportStorage, this.projectRepo as any);
      if (currentUsage + totalNewSize > limit) {
        // Clean up already-uploaded S3 files before failing
        try { await this.storage.delete(s3Url); } catch (_) {}
        try { await this.storage.delete(thumbKey); } catch (_) {}
        try { await this.storage.delete(optKey); } catch (_) {}
        throw new Error(`Storage quota exceeded (${((currentUsage + totalNewSize - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Generated image was discarded.`);
      }

      // 6. Create album item
      const albumItem: AlbumItem = {
        id: crypto.randomUUID(),
        jobId: job.id,
        prompt: job.prompt,
        imageUrl: `${filename}.${ext}`,
        thumbnailUrl: thumbKey,
        optimizedUrl: optKey,
        providerId: job.providerId || queued.job.providerId,
        modelConfigId: queued.modelConfigId || job.modelConfigId,
        aspectRatio: queued.aspectRatio || job.aspectRatio,
        quality: queued.quality || job.quality,
        format: targetFormat as any,
        size: finalBytes.length,
        optimizedSize: optBuffer.length,
        thumbnailSize: thumbBuffer.length,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      // 6. Mark job as completed in DB
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: `${filename}.${ext}`,
        thumbnailUrl: thumbKey,
        optimizedUrl: optKey,
        size: finalBytes.length,
        optimizedSize: optBuffer.length,
        thumbnailSize: thumbBuffer.length,
        error: undefined,
        taskId: undefined
      });

    } catch (e: any) {
      console.error(`[QueueManager] Job ${job.id} failed during image processing:`, e.message);
      // Keep taskId and status as 'processing' — the remote task succeeded,
      // only local processing (download/S3/thumbnail) failed. The poller will retry.
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'processing',
        error: e.message || 'Image processing error, will retry'
      });
    }
  }

  private async updateJobStatus(userId: string, projectId: string, jobId: string, updates: Partial<Job>) {
    await this.projectRepo.updateJob(userId, projectId, jobId, updates);
  }

  /**
   * One-time scan on server startup to find and re-enqueue jobs that were
   * left in 'pending' or 'processing' states.
   */
  async recoverTasks() {
    console.log('[QueueManager] Starting task recovery scan...');
    let lastKey: any;
    let count = 0;
    
    let pendingCount = 0;
    let pollingCount = 0;
    const projectSet = new Set<string>();

    do {
      const result = await this.client.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(pk, :prefix) AND begins_with(sk, :projPrefix)',
        ExpressionAttributeValues: {
          ':prefix': 'USER_DATA#',
          ':projPrefix': 'PROJECT#'
        },
        ExclusiveStartKey: lastKey
      }));

      for (const item of (result.Items || [])) {
        const userId = item.pk.replace('USER_DATA#', '');
        const sk = item.sk as string;

        if (sk.includes('#JOB#')) {
          const job = item as unknown as Job;
          const [projPrefix, jobId] = sk.split('#JOB#');
          const projectId = projPrefix.replace('PROJECT#', '');

          if (job.status === 'processing' || job.status === 'pending') {
            if (job.status === 'processing' && job.taskId) {
              pollingCount++;
            } else if (job.status === 'processing' && !job.taskId) {
              await this.updateJobStatus(userId, projectId, jobId, { status: 'pending' });
              console.log(`[QueueManager] Resetting interrupted job ${jobId} to pending.`);
              projectSet.add(`${userId}|${projectId}`);
              pendingCount++;
            } else if (job.status === 'pending') {
              projectSet.add(`${userId}|${projectId}`);
              pendingCount++;
            }
          }
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // Enqueue projects once
    for (const entry of projectSet) {
      const [uId, pId] = entry.split('|');
      console.log(`[QueueManager] Re-enqueuing project ${pId} for user ${uId}`);
      await this.enqueueProject(uId, pId);
    }
    
    console.log(`[QueueManager] Task recovery complete. Pending: ${pendingCount}, Polling: ${pollingCount}, Projects Affected: ${projectSet.size}`);
    
    // Initial poll immediately after scan
    if (pollingCount > 0) {
      console.log(`[QueueManager] Starting initial poll for ${pollingCount} detached jobs...`);
      await this.pollDetachedTasks();
    }
  }
}

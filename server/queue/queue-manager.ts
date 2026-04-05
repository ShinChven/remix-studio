import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ProviderRepository } from '../db/provider-repository';
import { ProjectRepository } from '../db/project-repository';
import { S3Storage } from '../storage/s3-storage';
import { buildGenerator } from '../generators/build-generator';
import { Job, Project, ProviderType, AlbumItem } from '../../src/types';
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

/**
 * QueueManager manages parallel AI generation tasks globally across all users.
 * It enforces per-provider concurrency limits and ensures task persistence.
 */
export class QueueManager {
  private activeJobs: Map<string, number> = new Map(); // providerId -> active count
  private queues: Map<string, QueuedJob[]> = new Map(); // providerId -> pending jobs

  constructor(
    private client: DynamoDBDocumentClient,
    private providerRepo: ProviderRepository,
    private projectRepo: ProjectRepository,
    private storage: S3Storage
  ) {}

  /**
   * Scan for pending jobs in a project and add them to the correct provider's queue.
   */
  async enqueueProject(userId: string, projectId: string) {
    const project = await this.projectRepo.getProject(userId, projectId);
    if (!project || !project.providerId) return;

    // Only pick up jobs that are currently 'pending' or 'failed' (to retry)
    const jobsToRun = project.jobs.filter(j => j.status === 'pending' || j.status === 'failed');
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
    if (!this.queues.has(providerId)) this.queues.set(providerId, []);
    
    // Avoid double-queuing if it's already there
    const exists = this.queues.get(providerId)!.some(q => q.job.id === job.id);
    if (exists) return;

    this.queues.get(providerId)!.push({ userId, projectId, job, aspectRatio, quality, format, modelConfigId });
    this.processNext(providerId);
  }

  private async processNext(providerId: string) {
    const queue = this.queues.get(providerId) || [];

    if (queue.length === 0) return;

    // Peek at the first job to get userId for provider lookup
    const peek = queue[0];
    const provider = await this.providerRepo.getProvider(peek.userId, providerId);
    if (!provider) {
      console.warn(`[QueueManager] Provider not found: ${providerId} for user ${peek.userId}`);
      queue.shift();
      this.processNext(providerId);
      return;
    }

    // Re-read active AFTER the await — reading before would capture a stale value
    // since another processNext() could run during the await and already increment it.
    const active = this.activeJobs.get(providerId) || 0;
    const limit = provider.concurrency || 1;
    if (active >= limit) return;

    // Dequeue and start
    const nextJob = queue.shift()!;
    this.activeJobs.set(providerId, active + 1);

    // Run in background (do not await)
    this.executeJob(nextJob, provider).finally(() => {
      this.activeJobs.set(providerId, Math.max(0, (this.activeJobs.get(providerId) || 1) - 1));
      this.processNext(providerId);
    });
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

      // 4. Save to storage
      const targetFormat = queued.format || job.format || 'png';
      let finalBytes: Buffer;
      let mimeType: string;
      let ext: string;

      if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
        finalBytes = await sharp(result.imageBytes).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
        mimeType = 'image/jpeg';
        ext = 'jpg';
      } else if (targetFormat === 'webp') {
        finalBytes = await sharp(result.imageBytes).webp({ quality: 100, lossless: true }).toBuffer();
        mimeType = 'image/webp';
        ext = 'webp';
      } else {
        // Always explicitly convert to PNG via sharp, so the output bytes truly are PNG
        // regardless of what format the AI provider returned.
        finalBytes = await sharp(result.imageBytes).png().toBuffer();
        mimeType = 'image/png';
        ext = 'png';
      }

      const filename = `${userId}/${projectId}/${crypto.randomUUID()}.${ext}`;
      const s3Url = await this.storage.save(filename, finalBytes, mimeType);

      // 5. Create album item
      const albumItem: AlbumItem = {
        id: crypto.randomUUID(),
        jobId: job.id,
        prompt: job.prompt,
        imageUrl: s3Url,
        providerId: job.providerId || queued.job.providerId,
        modelConfigId: queued.modelConfigId || job.modelConfigId,
        aspectRatio: queued.aspectRatio || job.aspectRatio,
        quality: queued.quality || job.quality,
        format: targetFormat as any,
        size: finalBytes.length,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      // 6. Mark job as completed in DB
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: s3Url,
        error: undefined
      });

    } catch (e: any) {
      console.error(`[QueueManager] Job ${job.id} failed:`, e.message);
      await this.updateJobStatus(userId, projectId, job.id, { 
        status: 'failed', 
        error: e.message || 'Unknown generation error' 
      });
    }
  }

  private async updateJobStatus(userId: string, projectId: string, jobId: string, updates: Partial<Job>) {
    // Note: We refetch to avoid stale-state overwrites if multiple tasks in the same project finish nearly simultaneously.
    const project = await this.projectRepo.getProject(userId, projectId);
    if (!project) return;

    const newJobs = project.jobs.map(j => j.id === jobId ? { ...j, ...updates } : j);
    await this.projectRepo.updateProject(userId, projectId, { jobs: newJobs });
  }

  /**
   * One-time scan on server startup to find and re-enqueue jobs that were
   * left in 'pending' or 'processing' states.
   */
  async recoverTasks() {
    console.log('[QueueManager] Starting task recovery scan...');
    let lastKey: any;
    let count = 0;
    
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
        const projectId = item.sk.replace('PROJECT#', '');
        const jobs = (item.jobs || []) as Job[];

        const hasWork = jobs.some(j => j.status === 'pending' || j.status === 'processing');
        if (hasWork) {
          // If it was 'processing', we reset it to 'pending' as the memory state was lost on restart
          const newJobs = jobs.map(j => j.status === 'processing' ? { ...j, status: 'pending' } as Job : j);
          
          if (jobs.some(j => j.status === 'processing')) {
            await this.projectRepo.updateProject(userId, projectId, { jobs: newJobs });
          }

          console.log(`[QueueManager] Recovered project ${projectId} for user ${userId}`);
          await this.enqueueProject(userId, projectId);
          count++;
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`[QueueManager] Task recovery complete. Recovered items from ${count} projects.`);
  }
}

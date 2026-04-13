import { PrismaClient } from '@prisma/client';
import { ProviderRepository } from '../db/provider-repository';
import { ProjectRepository } from '../db/project-repository';
import { S3Storage } from '../storage/s3-storage';
import { buildGenerator } from '../generators/build-generator';
import { buildTextGenerator } from '../generators/build-text-generator';
import { buildVideoGenerator } from '../generators/build-video-generator';
import { Job, ProviderType, ProjectType, ModelConfig, PROVIDER_MODELS_MAP, resolveCustomModels } from '../../src/types';
import { ImageProcessor } from './image-processor';
import { TextProcessor } from './text-processor';
import { VideoProcessor } from './video-processor';
import { DetachedPoller } from './detached-poller';
import { ImageGenerator } from '../generators/image-generator';
import { VideoGenerator } from '../generators/video-generator';
import { assertSafeReferenceImageUrl } from '../utils/url-safety';

export interface QueuedJob {
  userId: string;
  projectId: string;
  job: Job;
  projectType?: ProjectType;
  aspectRatio?: string;
  quality?: string;
  background?: string;
  format?: string;
  modelConfigId?: string;
  // Text generation settings
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Video generation settings
  duration?: number;
  resolution?: string;
}

/**
 * QueueManager manages parallel AI generation tasks globally across all users.
 * It enforces per-provider concurrency limits and ensures task persistence.
 */
/**
 * Build the full model list for a provider record: built-in models + resolved custom variants.
 */
function getAllModels(providerRecord: any): ModelConfig[] {
  const providerType = providerRecord.type as ProviderType;
  const baseModels = PROVIDER_MODELS_MAP[providerType] || [];
  const customAliases = Array.isArray(providerRecord.models) ? providerRecord.models : [];
  return [...baseModels, ...resolveCustomModels(providerType, customAliases)];
}

export class QueueManager {
  private activeJobs: Map<string, number> = new Map(); // providerId -> active count
  private queues: Map<string, QueuedJob[]> = new Map(); // providerId -> pending jobs
  private activeJobIds: Set<string> = new Set(); // global dedup
  private processingLoops: Map<string, boolean> = new Map();

  constructor(
    private prisma: PrismaClient,
    private providerRepo: ProviderRepository,
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private imageProcessor: ImageProcessor,
    private textProcessor: TextProcessor,
    private videoProcessor: VideoProcessor,
    private detachedPoller: DetachedPoller
  ) {
    this.detachedPoller.start();
  }

  // Expose poller method if explicitly requested (e.g. from routes)
  public async pollDetachedTasks() {
    await this.detachedPoller.pollDetachedTasks();
  }

  /**
   * Scan for pending jobs in a project and add them to the correct provider's queue.
   */
  async enqueueProject(userId: string, projectId: string) {
    const project = await this.projectRepo.getProject(userId, projectId);
    if (!project) return;

    console.log(`[QueueManager] Enqueuing project ${projectId}. Total jobs: ${project.jobs.length}`);

    // ONLY pick up 'pending' jobs.
    const jobsToRun = project.jobs.filter(j => j.status === 'pending');

    const skipped = project.jobs.length - jobsToRun.length;
    if (skipped > 0) {
      console.log(`[QueueManager] Project ${projectId}: Picking up ${jobsToRun.length} pending jobs. Skipping ${skipped} jobs (not pending).`);
    }

    for (const job of jobsToRun) {
      const providerId = job.providerId || project.providerId;
      if (!providerId) continue;

      this.enqueue(
        userId,
        project.id,
        job,
        providerId,
        job.aspectRatio || project.aspectRatio,
        job.quality || project.quality,
        (job as any).background || (project as any).background,
        job.format || project.format,
        job.modelConfigId,
        (project as any).type || 'image',
        (project as any).systemPrompt,
        (project as any).temperature,
        (project as any).maxTokens,
        job.duration || project.duration,
        job.resolution || project.resolution,
      );
    }
  }

  private enqueue(userId: string, projectId: string, job: Job, providerId: string, aspectRatio?: string, quality?: string, background?: string, format?: string, modelConfigId?: string, projectType?: ProjectType, systemPrompt?: string, temperature?: number, maxTokens?: number, duration?: number, resolution?: string) {
    if (this.activeJobIds.has(job.id)) return;

    if (!this.queues.has(providerId)) this.queues.set(providerId, []);
    this.activeJobIds.add(job.id);
    this.queues.get(providerId)!.push({ userId, projectId, job, projectType, aspectRatio, quality, background, format, modelConfigId, systemPrompt, temperature, maxTokens, duration, resolution });
    this.processNext(providerId);
  }

  private async processNext(providerId: string) {
    if (this.processingLoops.get(providerId)) return;
    this.processingLoops.set(providerId, true);

    try {
      const queue = this.queues.get(providerId) || [];
      
      while (queue.length > 0) {
        const nextJob = queue[0];
        const provider = await this.providerRepo.getProvider(nextJob.userId, providerId);
        
        if (!provider) {
          const dropped = queue.shift();
          if (dropped) {
            this.activeJobIds.delete(dropped.job.id);
            console.warn(`[QueueManager] Provider not found: ${providerId} for user ${dropped.userId}. Marking job ${dropped.job.id} as failed.`);
            await this.updateJobStatus(dropped.userId, dropped.projectId, dropped.job.id, {
              status: 'failed',
              error: 'Provider not found or was deleted',
              taskId: null as any,
            });
          }
          continue;
        }

        const limit = provider.concurrency || 1;

        if ((this.activeJobs.get(providerId) || 0) >= limit) {
          break; // limit reached
        }

        // Shift IMMEDIATELY (synchronous) to lock the item
        queue.shift();
        this.activeJobs.set(providerId, (this.activeJobs.get(providerId) || 0) + 1);

        // Run in background
        this.executeJob(nextJob, provider).finally(() => {
          this.activeJobIds.delete(nextJob.job.id);
          this.activeJobs.set(providerId, Math.max(0, (this.activeJobs.get(providerId) || 1) - 1));
          this.processNext(providerId);
        });
      }
    } finally {
      this.processingLoops.set(providerId, false);
    }
  }

  private async executeJob(queued: QueuedJob, providerRecord: any) {
    const { userId, projectId, job } = queued;
    console.log(`[QueueManager] Executing job ${job.id} for project ${projectId} using provider ${providerRecord.id}`);

    try {
      if (!job.filename) {
        job.filename = job.id;
      }

      // CRITICAL FIX 2: Snapshotting
      // Resolve fallback parameters here and write them definitively into the database.
      // This ensures DetachedPoller or ImageProcessor later have complete metadata.
      const snapshottedJobData: Partial<Job> = {
        status: 'processing',
        filename: job.filename,
        providerId: providerRecord.id,
        aspectRatio: queued.aspectRatio || job.aspectRatio,
        quality: queued.quality || job.quality,
        format: (queued.format || job.format) as any,
        modelConfigId: queued.modelConfigId || job.modelConfigId,
        duration: queued.duration ?? job.duration,
        resolution: queued.resolution || job.resolution,
        error: undefined
      };

      await this.updateJobStatus(userId, projectId, job.id, snapshottedJobData);
      
      // Update in-memory job with snapshotted values for subsequent use in this function
      Object.assign(job, snapshottedJobData);

      // Build generator
      const apiKey = await this.providerRepo.getDecryptedApiKey(userId, providerRecord.id);
      if (!apiKey) throw new Error('Stored API key not found for provider');

      // Dispatch based on project type
      if (queued.projectType === 'text') {
        await this.executeTextJob(userId, projectId, job, queued, providerRecord, apiKey);
      } else if (queued.projectType === 'video') {
        const videoGenerator = buildVideoGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);
        await this.executeVideoJob(userId, projectId, job, queued, videoGenerator, providerRecord);
      } else {
        const generator = buildGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);

        // Dispatch to specific execution path based on generator capabilities
        if (generator.checkStatus) {
          await this.executeAsyncHandoff(userId, projectId, job, queued, generator, providerRecord);
        } else {
          await this.executeSyncJob(userId, projectId, job, queued, generator, providerRecord);
        }
      }

    } catch (e: any) {
      console.error(`[QueueManager] Job ${job.id} failed in dispatcher:`, e.message);
      // Global dispatcher failure. If it's an async job that failed AFTER generating a taskId, executeAsyncHandoff handles it.
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'failed',
        error: e.message || 'Unknown dispatcher error',
        taskId: null as any
      });
    }
  }

  /**
   * [Asynchronous Pipeline] (e.g. RunningHub)
   * Only fetches TaskId and exits. Leaves the polling up to DetachedPoller.
   */
  private async executeAsyncHandoff(userId: string, projectId: string, job: Job, queued: QueuedJob, generator: ImageGenerator, providerRecord: any) {
    // Pre-check Mechanism: Prevent Stale Task ID Deadlocks
    if (job.taskId) {
      try {
        console.log(`[QueueManager] Pre-checking stale taskId ${job.taskId} for Job ${job.id}`);
        const statusRes = await generator.checkStatus!(job.taskId);
        
        if (statusRes.status === 'processing' || statusRes.status === 'completed') {
           console.log(`[QueueManager] Job ${job.id} task is still active on remote. Handoff to poller.`);
           return; // Already snapshotted to processing, we're done here.
        } else {
           console.log(`[QueueManager] Job ${job.id} remote task failed/expired. Clearing taskId for fresh request.`);
           job.taskId = undefined;
           await this.updateJobStatus(userId, projectId, job.id, { taskId: null as any });
        }
      } catch (e) {
        console.warn(`[QueueManager] Failed to pre-check taskId ${job.taskId}. Assuming stale.`, e);
        job.taskId = undefined;
        await this.updateJobStatus(userId, projectId, job.id, { taskId: null as any });
      }
    }

    // Proceed to initiate fresh generation request
    const req = await this.prepareGenerateRequest(queued, providerRecord);
    const result = await generator.generate(req);

    if (result.ok === false) {
      throw new Error(result.error);
    }

    if (result.status === 'processing' && result.taskId) {
      console.log(`[QueueManager] Job ${job.id} shifted to detached polling. TaskId: ${result.taskId}`);
      await this.updateJobStatus(userId, projectId, job.id, { taskId: result.taskId });
      return; // Handed off successfully
    }
    
    // Fallback if an async generator synchronously completes immediately
    if (result.imageBytes) {
      await this.imageProcessor.processCompletedImage({
        userId,
        projectId,
        job,
        imageBytes: result.imageBytes,
        format: job.format,
        quality: job.quality,
        aspectRatio: job.aspectRatio,
        modelConfigId: job.modelConfigId,
        providerId: job.providerId
      });

      // Safety net: verify the job status was actually updated
      const verifiedJob = await this.projectRepo.getJob(userId, projectId, job.id);
      if (verifiedJob && verifiedJob.status === 'processing') {
        console.warn(`[QueueManager] Job ${job.id} still 'processing' after async-fallback processCompletedImage. Forcing status to 'completed'.`);
        await this.updateJobStatus(userId, projectId, job.id, {
          status: 'completed',
        });
      }
    } else {
      throw new Error('Async generator returned no taskId and no image bytes');
    }
  }

  /**
   * [Synchronous Pipeline] (e.g. OpenAI / Vertex)
   * Awaits result synchronously.
   */
  private async executeSyncJob(userId: string, projectId: string, job: Job, queued: QueuedJob, generator: ImageGenerator, providerRecord: any) {
    try {
      const req = await this.prepareGenerateRequest(queued, providerRecord);
      const result = await generator.generate(req);

      if (result.ok === false) {
        throw new Error(result.error);
      }

      if (!result.imageBytes) {
        throw new Error('Sync generator returned success but no image bytes');
      }

      await this.imageProcessor.processCompletedImage({
        userId,
        projectId,
        job,
        imageBytes: result.imageBytes,
        format: job.format,
        quality: job.quality,
        aspectRatio: job.aspectRatio,
        modelConfigId: job.modelConfigId,
        providerId: job.providerId
      });

      // Safety net: verify the job status was actually updated.
      // processCompletedImage swallows its own errors, so if the DB update
      // silently failed (e.g. updateMany matched 0 rows), the job would be
      // stuck in 'processing' forever while the album item was already created.
      const verifiedJob = await this.projectRepo.getJob(userId, projectId, job.id);
      if (verifiedJob && verifiedJob.status === 'processing') {
        console.warn(`[QueueManager] Job ${job.id} still 'processing' after processCompletedImage completed. Forcing status to 'completed'.`);
        await this.updateJobStatus(userId, projectId, job.id, {
          status: 'completed',
        });
      }
    } catch (e: any) {
      console.error(`[QueueManager] Job ${job.id} sync execution failed:`, e.message);
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'failed',
        error: e.message || 'Sync generation failed',
        taskId: null as any
      });
    }
  }

  /**
   * [Text Generation Pipeline]
   * Calls text generation API and stores result text.
   */
  private async executeTextJob(userId: string, projectId: string, job: Job, queued: QueuedJob, providerRecord: any, apiKey: string) {
    try {
      const textGenerator = buildTextGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);
      const modelConfig = getAllModels(providerRecord).find((m) => m.id === job.modelConfigId);

      // Prepare reference images if any
      let refImages: string[] | undefined;
      if (job.imageContexts && job.imageContexts.length > 0) {
        refImages = [];
        for (const ctx of job.imageContexts) {
          if (ctx.startsWith('data:')) {
            refImages.push(ctx.replace(/^data:image\/\w+;base64,/, ''));
          } else if (ctx.startsWith('http')) {
            await assertSafeReferenceImageUrl(ctx);
            const response = await fetch(ctx);
            if (!response.ok) throw new Error(`Failed to download reference image: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            refImages.push(buffer.toString('base64'));
          } else {
            const buffer = await this.storage.read(ctx);
            refImages.push(buffer.toString('base64'));
          }
        }
        if (refImages.length === 0) refImages = undefined;
      }

      const result = await textGenerator.generate({
        prompt: job.prompt,
        systemPrompt: queued.systemPrompt,
        modelId: modelConfig?.modelId,
        apiUrl: modelConfig?.apiUrl,
        temperature: queued.temperature ?? 0.7,
        maxTokens: queued.maxTokens ?? 2048,
        refImagesBase64: refImages,
      });

      if (result.ok === false) {
        throw new Error(result.error);
      }

      await this.textProcessor.processCompletedText({
        userId,
        projectId,
        job,
        text: result.text,
        modelConfigId: job.modelConfigId,
        providerId: job.providerId,
      });
    } catch (e: any) {
      console.error(`[QueueManager] Text job ${job.id} failed:`, e.message);
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'failed',
        error: e.message || 'Text generation failed',
        taskId: null as any,
      });
    }
  }

  /**
   * [Video Pipeline]
   * All video providers are async: generate() returns a taskId, DetachedPoller
   * later drains the operation and hands it to VideoProcessor.
   */
  private async executeVideoJob(userId: string, projectId: string, job: Job, queued: QueuedJob, generator: VideoGenerator, providerRecord: any) {
    // Pre-check stale taskId so a recovered job doesn't re-submit on top of an active remote task
    if (job.taskId) {
      try {
        console.log(`[QueueManager] Pre-checking stale video taskId ${job.taskId} for Job ${job.id}`);
        const statusRes = await generator.checkStatus(job.taskId);
        if (statusRes.status === 'processing' || statusRes.status === 'completed') {
          console.log(`[QueueManager] Video job ${job.id} task is still active on remote. Handoff to poller.`);
          return;
        }
        console.log(`[QueueManager] Video job ${job.id} remote task failed/expired. Clearing taskId for fresh request.`);
        job.taskId = undefined;
        await this.updateJobStatus(userId, projectId, job.id, { taskId: null as any });
      } catch (e) {
        console.warn(`[QueueManager] Failed to pre-check video taskId ${job.taskId}. Assuming stale.`, e);
        job.taskId = undefined;
        await this.updateJobStatus(userId, projectId, job.id, { taskId: null as any });
      }
    }

    const req = await this.prepareVideoGenerateRequest(queued, providerRecord);
    const result = await generator.generate(req);

    if (result.ok === false) {
      throw new Error(result.error);
    }

    if (result.status === 'processing' && result.taskId) {
      console.log(`[QueueManager] Video job ${job.id} shifted to detached polling. TaskId: ${result.taskId}`);
      await this.updateJobStatus(userId, projectId, job.id, { taskId: result.taskId });
      return;
    }

    // Fallback if a video generator synchronously completes immediately
    if (result.videoBytes) {
      await this.videoProcessor.processCompletedVideo({
        userId,
        projectId,
        job,
        videoBytes: result.videoBytes,
        mimeType: result.mimeType,
        aspectRatio: queued.aspectRatio || job.aspectRatio,
        resolution: queued.resolution || job.resolution,
        duration: queued.duration ?? job.duration,
        modelConfigId: job.modelConfigId,
        providerId: job.providerId,
      });
      return;
    }

    throw new Error('Video generator returned no taskId and no video bytes');
  }

  private async prepareVideoGenerateRequest(queued: QueuedJob, providerRecord: any) {
    const { job } = queued;
    let refImages: string[] | undefined;
    let refImageUrls: string[] | undefined;
    if (job.imageContexts && job.imageContexts.length > 0) {
      refImages = [];
      refImageUrls = [];
      for (const ctx of job.imageContexts) {
        if (ctx.startsWith('data:')) {
          refImageUrls.push(ctx);
          refImages.push(ctx.replace(/^data:image\/\w+;base64,/, ''));
        } else if (ctx.startsWith('http')) {
          await assertSafeReferenceImageUrl(ctx);
          refImageUrls.push(ctx);
          const response = await fetch(ctx);
          if (!response.ok) throw new Error(`Failed to download reference image: ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          refImages.push(buffer.toString('base64'));
        } else {
          refImageUrls.push(await this.storage.getPresignedUrl(ctx));
          const buffer = await this.storage.read(ctx);
          refImages.push(buffer.toString('base64'));
        }
      }
      if (refImages.length === 0) refImages = undefined;
      if (refImageUrls.length === 0) refImageUrls = undefined;
    }

    const modelConfig = getAllModels(providerRecord).find((m) => m.id === job.modelConfigId);

    return {
      prompt: job.prompt,
      modelId: modelConfig?.modelId,
      apiUrl: modelConfig?.apiUrl,
      aspectRatio: queued.aspectRatio || job.aspectRatio || '16:9',
      resolution: queued.resolution || job.resolution || '720p',
      duration: queued.duration ?? job.duration,
      refImagesBase64: refImages,
      refImageUrls,
    };
  }

  private async prepareGenerateRequest(queued: QueuedJob, providerRecord: any) {
    const { job } = queued;
    let refImages: string[] | undefined;
    let refImageUrls: string[] | undefined;
    if (job.imageContexts && job.imageContexts.length > 0) {
      refImages = [];
      refImageUrls = [];
      for (const ctx of job.imageContexts) {
        if (ctx.startsWith('data:')) {
          refImageUrls.push(ctx);
          refImages.push(ctx.replace(/^data:image\/\w+;base64,/, ''));
        } else if (ctx.startsWith('http')) {
          await assertSafeReferenceImageUrl(ctx);
          refImageUrls.push(ctx);
          const response = await fetch(ctx);
          if (!response.ok) throw new Error(`Failed to download reference image: ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          refImages.push(buffer.toString('base64'));
        } else {
          refImageUrls.push(await this.storage.getPresignedUrl(ctx));
          const buffer = await this.storage.read(ctx);
          refImages.push(buffer.toString('base64'));
        }
      }

      if (refImages.length === 0) refImages = undefined;
      if (refImageUrls.length === 0) refImageUrls = undefined;
    }

    const modelConfig = getAllModels(providerRecord).find((m) => m.id === job.modelConfigId);

    return {
      prompt: job.prompt,
      modelId: modelConfig?.modelId,
      apiUrl: modelConfig?.apiUrl,
      aspectRatio: job.aspectRatio || '1:1',
      imageSize: job.quality || '1K',
      background: queued.background || job.background,
      refImagesBase64: refImages,
      refImageUrls
    };
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

    let pendingCount = 0;
    let pollingCount = 0;
    const projectSet = new Set<string>();

    const jobs = await this.prisma.job.findMany({
      where: {
        status: { in: ['pending', 'processing'] },
      },
    });

    for (const item of jobs) {
      const job = this.prisma_jobToJob(item);
      const userId = item.userId;
      const projectId = item.projectId;

      if (job.status === 'processing' && job.taskId) {
        pollingCount++;
      } else if (job.status === 'processing' && !job.taskId) {
        await this.updateJobStatus(userId, projectId, job.id, { status: 'pending' });
        console.log(`[QueueManager] Resetting interrupted job ${job.id} to pending.`);
        projectSet.add(`${userId}|${projectId}`);
        pendingCount++;
      } else if (job.status === 'pending') {
        projectSet.add(`${userId}|${projectId}`);
        pendingCount++;
      }
    }

    // Enqueue projects once
    for (const entry of projectSet) {
      const [uId, pId] = entry.split('|');
      console.log(`[QueueManager] Re-enqueuing project ${pId} for user ${uId}`);
      await this.enqueueProject(uId, pId);
    }
    
    console.log(`[QueueManager] Task recovery complete. Pending: ${pendingCount}, Polling: ${pollingCount}, Projects Affected: ${projectSet.size}`);
    
    if (pollingCount > 0) {
      console.log(`[QueueManager] Starting initial poll for ${pollingCount} detached jobs...`);
      await this.pollDetachedTasks();
    }
  }

  private prisma_jobToJob(item: any): Job {
    return {
      id: item.id,
      prompt: item.prompt,
      status: item.status,
      imageContexts: (item.imageContexts as string[]) ?? [],
      imageUrl: item.imageUrl ?? undefined,
      thumbnailUrl: item.thumbnailUrl ?? undefined,
      optimizedUrl: item.optimizedUrl ?? undefined,
      error: item.error ?? undefined,
      createdAt: item.createdAt instanceof Date ? item.createdAt.getTime() : item.createdAt,
      providerId: item.providerId ?? undefined,
      modelConfigId: item.modelConfigId ?? undefined,
      aspectRatio: item.aspectRatio ?? undefined,
      quality: item.quality ?? undefined,
      format: item.format ?? undefined,
      duration: item.duration ?? undefined,
      resolution: item.resolution ?? undefined,
      taskId: item.taskId ?? undefined,
      filename: item.filename ?? undefined,
      size: item.size != null ? Number(item.size) : undefined,
    };
  }
}

import { PrismaClient } from '@prisma/client';
import { ProviderRepository } from '../db/provider-repository';
import { ProjectRepository } from '../db/project-repository';
import { S3Storage } from '../storage/s3-storage';
import { buildGenerator } from '../generators/build-generator';
import { buildTextGenerator } from '../generators/build-text-generator';
import { buildAudioGenerator } from '../generators/build-audio-generator';
import { buildVideoGenerator } from '../generators/build-video-generator';
import {
  Job,
  ProviderType,
  ProjectType,
  ModelConfig,
  PROVIDER_MODELS_MAP,
  parseAudioProjectConfig,
  resolveCustomModels,
  QueueMonitorJob,
  QueueMonitorProject,
  QueueMonitorProvider,
  QueueMonitorStatus,
  QueueMonitorView,
} from '../../src/types';
import { ImageProcessor } from './image-processor';
import { TextProcessor } from './text-processor';
import { VideoProcessor } from './video-processor';
import { AudioProcessor } from './audio-processor';
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
  sound?: 'on' | 'off';
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

function inferImageMimeType(value: string): string {
  const dataUrlMatch = value.match(/^data:(image\/[\w+.-]+);base64,/i);
  if (dataUrlMatch?.[1]) return dataUrlMatch[1].toLowerCase();

  try {
    const pathname = value.startsWith('http') ? new URL(value).pathname : value;
    const ext = pathname.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'bmp':
        return 'image/bmp';
      case 'svg':
        return 'image/svg+xml';
      case 'heic':
        return 'image/heic';
      case 'heif':
        return 'image/heif';
      case 'png':
      default:
        return 'image/png';
    }
  } catch {
    return 'image/png';
  }
}

export class QueueManager {
  private activeJobs: Map<string, number> = new Map(); // providerId -> active count
  private queues: Map<string, QueuedJob[]> = new Map(); // providerId -> pending jobs
  // Tracks every jobId that currently consumes a slot (queued, executing, or detached).
  // Maps to the providerId so we can release the right slot during reconciliation.
  private activeJobIds: Map<string, string> = new Map();
  private processingLoops: Map<string, boolean> = new Map();

  constructor(
    private prisma: PrismaClient,
    private providerRepo: ProviderRepository,
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private imageProcessor: ImageProcessor,
    private textProcessor: TextProcessor,
    private videoProcessor: VideoProcessor,
    private audioProcessor: AudioProcessor,
    private detachedPoller: DetachedPoller
  ) {
    this.detachedPoller.start();
  }

  // Expose poller method if explicitly requested (e.g. from routes)
  public async pollDetachedTasks() {
    await this.detachedPoller.pollDetachedTasks();
  }

  public async getMonitorStatus(userId: string, view: QueueMonitorView): Promise<QueueMonitorStatus> {
    const providerRecords = await this.prisma.provider.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const providers = providerRecords.map((provider) => {
      const providerType = provider.type as ProviderType;
      const customAliases = Array.isArray(provider.models) ? provider.models : [];
      return {
        id: provider.id,
        name: provider.name,
        type: providerType,
        concurrency: provider.concurrency || 1,
        models: [
          ...(PROVIDER_MODELS_MAP[providerType] || []),
          ...resolveCustomModels(providerType, customAliases as any),
        ],
      };
    });
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));

    const queuedJobIds = new Set<string>();
    const queuedProviderCounts = new Map<string, number>();
    for (const [providerId, queue] of this.queues) {
      for (const queued of queue) {
        if (queued.userId !== userId) continue;
        queuedJobIds.add(queued.job.id);
        queuedProviderCounts.set(providerId, (queuedProviderCounts.get(providerId) || 0) + 1);
      }
    }

    const jobRows = await this.prisma.job.findMany({
      where: {
        userId,
        status: { in: ['pending', 'processing', 'failed'] },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            providerId: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            type: true,
            concurrency: true,
            models: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const toProjectType = (value: string | null | undefined): ProjectType => {
      if (value === 'text' || value === 'video' || value === 'audio') return value;
      return 'image';
    };
    const toProjectStatus = (value: string | null | undefined) => value === 'archived' ? 'archived' : 'active';

    const toQueueState = (job: { id: string; status: string; taskId: string | null }): QueueMonitorJob['queueState'] => {
      if (job.status === 'failed') return 'failed';
      if (queuedJobIds.has(job.id)) return 'queued';
      if (job.status === 'processing') return job.taskId ? 'detached' : 'running';
      return 'waiting';
    };

    const toMonitorJob = (row: (typeof jobRows)[number]): QueueMonitorJob => {
      const providerId = row.providerId || row.project.providerId || undefined;
      const publicProvider = providerId ? providerById.get(providerId) : undefined;
      const providerType = (row.provider?.type || publicProvider?.type) as ProviderType | undefined;
      const modelConfigId = row.modelConfigId ?? undefined;
      const modelName = modelConfigId && publicProvider
        ? publicProvider.models.find((model) => model.id === modelConfigId)?.name
        : undefined;

      return {
        id: row.id,
        projectId: row.projectId,
        projectName: row.project.name,
        projectType: toProjectType(row.project.type),
        providerId,
        providerName: row.provider?.name || publicProvider?.name,
        providerType,
        modelConfigId,
        modelName,
        prompt: row.prompt,
        status: row.status as QueueMonitorJob['status'],
        queueState: toQueueState(row),
        createdAt: row.createdAt.getTime(),
        taskId: row.taskId ?? undefined,
        error: row.error ?? undefined,
        aspectRatio: row.aspectRatio ?? undefined,
        quality: row.quality ?? undefined,
        format: row.format ?? undefined,
        duration: row.duration ?? undefined,
        resolution: row.resolution ?? undefined,
        sound: row.sound ?? undefined,
      };
    };

    const jobs = jobRows.map(toMonitorJob);
    const totals = {
      projects: new Set(jobs.map((job) => job.projectId)).size,
      providers: providers.length,
      pendingJobs: jobs.filter((job) => job.status === 'pending').length,
      processingJobs: jobs.filter((job) => job.status === 'processing').length,
      failedJobs: jobs.filter((job) => job.status === 'failed').length,
      queuedJobs: jobs.filter((job) => job.queueState === 'queued').length,
      waitingJobs: jobs.filter((job) => job.queueState === 'waiting').length,
      runningJobs: jobs.filter((job) => job.queueState === 'running').length,
      detachedJobs: jobs.filter((job) => job.queueState === 'detached').length,
      activeSlots: providers.reduce((total, provider) => total + (this.activeJobs.get(provider.id) || 0), 0),
      concurrency: providers.reduce((total, provider) => total + (provider.concurrency || 1), 0),
    };

    const buildProjectRows = (): QueueMonitorProject[] => {
      const grouped = new Map<string, QueueMonitorProject>();
      for (const job of jobs) {
        const current = grouped.get(job.projectId) || {
          id: job.projectId,
          name: job.projectName,
          type: job.projectType,
          status: toProjectStatus(jobRows.find((row) => row.projectId === job.projectId)?.project.status),
          providerId: job.providerId,
          providerName: job.providerName,
          pendingJobs: 0,
          processingJobs: 0,
          failedJobs: 0,
          queuedJobs: 0,
          waitingJobs: 0,
          runningJobs: 0,
          detachedJobs: 0,
          latestJobAt: undefined,
          jobs: [],
        };

        current.jobs.push(job);
        current.latestJobAt = Math.max(current.latestJobAt || 0, job.createdAt);
        if (job.status === 'pending') current.pendingJobs++;
        if (job.status === 'processing') current.processingJobs++;
        if (job.status === 'failed') current.failedJobs++;
        if (job.queueState === 'queued') current.queuedJobs++;
        if (job.queueState === 'waiting') current.waitingJobs++;
        if (job.queueState === 'running') current.runningJobs++;
        if (job.queueState === 'detached') current.detachedJobs++;
        grouped.set(job.projectId, current);
      }
      return Array.from(grouped.values()).sort((a, b) => {
        const activeDelta = (b.processingJobs + b.pendingJobs) - (a.processingJobs + a.pendingJobs);
        if (activeDelta !== 0) return activeDelta;
        return (b.latestJobAt || 0) - (a.latestJobAt || 0);
      });
    };

    const buildProviderRows = (): QueueMonitorProvider[] => {
      const jobsByProvider = new Map<string, QueueMonitorJob[]>();
      for (const job of jobs) {
        if (!job.providerId) continue;
        if (!jobsByProvider.has(job.providerId)) jobsByProvider.set(job.providerId, []);
        jobsByProvider.get(job.providerId)!.push(job);
      }

      return providers.map((provider) => {
        const providerJobs = jobsByProvider.get(provider.id) || [];
        const concurrency = provider.concurrency || 1;
        const activeSlots = this.activeJobs.get(provider.id) || 0;
        return {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          concurrency,
          activeSlots,
          availableSlots: Math.max(0, concurrency - activeSlots),
          pendingJobs: providerJobs.filter((job) => job.status === 'pending').length,
          processingJobs: providerJobs.filter((job) => job.status === 'processing').length,
          failedJobs: providerJobs.filter((job) => job.status === 'failed').length,
          queuedJobs: queuedProviderCounts.get(provider.id) || 0,
          waitingJobs: providerJobs.filter((job) => job.queueState === 'waiting').length,
          runningJobs: providerJobs.filter((job) => job.queueState === 'running').length,
          detachedJobs: providerJobs.filter((job) => job.queueState === 'detached').length,
          jobs: providerJobs,
        };
      }).sort((a, b) => {
        const activeDelta = (b.activeSlots + b.queuedJobs + b.waitingJobs) - (a.activeSlots + a.queuedJobs + a.waitingJobs);
        if (activeDelta !== 0) return activeDelta;
        return a.name.localeCompare(b.name);
      });
    };

    return {
      view,
      updatedAt: Date.now(),
      totals,
      projects: view === 'projects' ? buildProjectRows() : undefined,
      providers: view === 'providers' ? buildProviderRows() : undefined,
    };
  }

  public async clearFailedJobs(userId: string, scope: { projectId?: string; providerId?: string } = {}): Promise<{ cleared: number; resumedProjects: number }> {
    const where: any = {
      userId,
      status: 'failed',
    };

    if (scope.projectId) {
      where.projectId = scope.projectId;
    }

    if (scope.providerId) {
      where.OR = [
        { providerId: scope.providerId },
        { providerId: null, project: { providerId: scope.providerId } },
      ];
    }

    const failedJobs = await this.prisma.job.findMany({
      where,
      select: { id: true, projectId: true },
    });

    if (failedJobs.length === 0) {
      return { cleared: 0, resumedProjects: 0 };
    }

    const failedJobIds = failedJobs.map((job) => job.id);
    const affectedProjectIds = Array.from(new Set(failedJobs.map((job) => job.projectId)));

    const result = await this.prisma.job.deleteMany({
      where: {
        userId,
        id: { in: failedJobIds },
      },
    });

    const pendingProjects = await this.prisma.job.findMany({
      where: {
        userId,
        status: 'pending',
        projectId: { in: affectedProjectIds },
      },
      select: { projectId: true },
      distinct: ['projectId'],
    });

    for (const { projectId } of pendingProjects) {
      await this.enqueueProject(userId, projectId);
    }

    return {
      cleared: result.count,
      resumedProjects: pendingProjects.length,
    };
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
        job.sound || project.sound,
      );
    }
  }

  private enqueue(userId: string, projectId: string, job: Job, providerId: string, aspectRatio?: string, quality?: string, background?: string, format?: string, modelConfigId?: string, projectType?: ProjectType, systemPrompt?: string, temperature?: number, maxTokens?: number, duration?: number, resolution?: string, sound?: 'on' | 'off') {
    if (this.activeJobIds.has(job.id)) return;

    if (!this.queues.has(providerId)) this.queues.set(providerId, []);
    this.activeJobIds.set(job.id, providerId);
    this.queues.get(providerId)!.push({ userId, projectId, job, projectType, aspectRatio, quality, background, format, modelConfigId, systemPrompt, temperature, maxTokens, duration, resolution, sound });
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

        // Run in background. For async (detached) jobs, the slot stays held
        // until DetachedPoller observes a terminal state and calls releaseSlot.
        const jobId = nextJob.job.id;
        this.executeJob(nextJob, provider).then((detached) => {
          if (!detached) this.releaseSlot(providerId, jobId);
        }, (e) => {
          console.error(`[QueueManager] Unhandled error in executeJob ${jobId}:`, e);
          this.releaseSlot(providerId, jobId);
        });
      }
    } finally {
      this.processingLoops.set(providerId, false);
    }
  }

  /**
   * Release a concurrency slot for a job. Idempotent — safe to call multiple times.
   * Called by .then handler in processNext for sync/failed jobs, and by DetachedPoller
   * for async jobs once they reach a terminal state.
   *
   * Pass `null` for providerId when the caller doesn't know it (e.g. a job whose
   * provider was deleted via cascade SetNull); we'll resolve it from the in-memory
   * tracking map populated at enqueue time.
   */
  public releaseSlot(providerId: string | null, jobId: string) {
    if (!this.activeJobIds.has(jobId)) return;
    const resolved = providerId ?? this.activeJobIds.get(jobId);
    if (!resolved) return;
    this.activeJobIds.delete(jobId);
    this.activeJobs.set(resolved, Math.max(0, (this.activeJobs.get(resolved) || 1) - 1));
    this.processNext(resolved);
  }

  /**
   * Reconcile in-memory slot tracking against the database. If a tracked job
   * no longer exists in the DB (deleted via workflow replace, project cascade,
   * or any direct manipulation), drop it. Without this, deleting a job mid-flight
   * leaks state until restart and can block the provider.
   *
   * Pending jobs (still in queue, never executed) never consumed an activeJobs
   * slot, so they're removed surgically without decrementing the counter.
   * Executing/detached jobs trigger a full releaseSlot.
   */
  public async reconcileSlots() {
    if (this.activeJobIds.size === 0) return;
    const trackedIds = Array.from(this.activeJobIds.keys());
    const dbJobs = await this.prisma.job.findMany({
      where: { id: { in: trackedIds } },
      select: { id: true },
    });
    const dbJobIds = new Set(dbJobs.map((j) => j.id));
    let releasedExecuting = 0;
    let droppedPending = 0;
    for (const [jobId, providerId] of this.activeJobIds) {
      if (dbJobIds.has(jobId)) continue;

      // If the job is still queued (never started executing), remove it surgically.
      // The activeJobs counter was never bumped for it, so do NOT call releaseSlot.
      const queue = this.queues.get(providerId);
      const idx = queue ? queue.findIndex((q) => q.job.id === jobId) : -1;
      if (idx >= 0) {
        queue!.splice(idx, 1);
        this.activeJobIds.delete(jobId);
        droppedPending++;
        continue;
      }

      // Otherwise it was executing or handed off to detached polling — release the slot.
      console.warn(`[QueueManager] Reconciling orphaned slot: job ${jobId} no longer exists in DB. Releasing on provider ${providerId}.`);
      this.releaseSlot(providerId, jobId);
      releasedExecuting++;
    }
    if (releasedExecuting > 0 || droppedPending > 0) {
      console.log(`[QueueManager] Reconciliation: released ${releasedExecuting} executing slot(s), dropped ${droppedPending} queued entry(s).`);
    }
  }

  /**
   * Execute a job. Returns true if the job was handed off to detached polling
   * (slot stays held); false if the job reached a terminal state in-line.
   */
  private async executeJob(queued: QueuedJob, providerRecord: any): Promise<boolean> {
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
        sound: queued.sound || job.sound,
        error: undefined
      };

      await this.updateJobStatus(userId, projectId, job.id, snapshottedJobData);
      
      // Update in-memory job with snapshotted values for subsequent use in this function
      Object.assign(job, snapshottedJobData);

      // Build generator
      const apiKey = await this.providerRepo.getDecryptedApiKey(userId, providerRecord.id);
      if (!apiKey) throw new Error('Stored API key not found for provider');
      const apiSecret = providerRecord.type === 'KlingAI'
        ? await this.providerRepo.getDecryptedApiSecret(userId, providerRecord.id)
        : null;
      if (providerRecord.type === 'KlingAI' && !apiSecret) {
        throw new Error('Stored API secret not found for KlingAI provider');
      }

      // Dispatch based on project type
      if (queued.projectType === 'text') {
        await this.executeTextJob(userId, projectId, job, queued, providerRecord, apiKey);
        return false;
      } else if (queued.projectType === 'audio') {
        await this.executeAudioJob(userId, projectId, job, queued, providerRecord, apiKey);
        return false;
      } else if (queued.projectType === 'video') {
        const videoGenerator = buildVideoGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl, apiSecret);
        return await this.executeVideoJob(userId, projectId, job, queued, videoGenerator, providerRecord);
      } else {
        const generator = buildGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl, apiSecret);

        // Dispatch to specific execution path based on generator capabilities
        if (generator.checkStatus) {
          return await this.executeAsyncHandoff(userId, projectId, job, queued, generator, providerRecord);
        } else {
          await this.executeSyncJob(userId, projectId, job, queued, generator, providerRecord);
          return false;
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
      return false;
    }
  }

  /**
   * [Asynchronous Pipeline] (e.g. RunningHub)
   * Only fetches TaskId and exits. Leaves the polling up to DetachedPoller.
   */
  private async executeAsyncHandoff(userId: string, projectId: string, job: Job, queued: QueuedJob, generator: ImageGenerator, providerRecord: any): Promise<boolean> {
    // Pre-check Mechanism: Prevent Stale Task ID Deadlocks
    if (job.taskId) {
      try {
        console.log(`[QueueManager] Pre-checking stale taskId ${job.taskId} for Job ${job.id}`);
        const statusRes = await generator.checkStatus!(job.taskId);

        if (statusRes.status === 'processing' || statusRes.status === 'completed') {
           console.log(`[QueueManager] Job ${job.id} task is still active on remote. Handoff to poller.`);
           return true; // Already snapshotted to processing, slot stays held until poller finalizes.
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
      return true; // Handed off successfully
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
      return false;
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
            refImages.push(ctx.replace(/^data:[^;]+;base64,/, ''));
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
   * [Audio Generation Pipeline]
   * Calls the configured audio model (TTS or music generation) and stores the result.
   */
  private async executeAudioJob(userId: string, projectId: string, job: Job, queued: QueuedJob, providerRecord: any, apiKey: string) {
    try {
      const audioGenerator = buildAudioGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);
      const modelConfig = getAllModels(providerRecord).find((m) => m.id === job.modelConfigId);
      const audioConfig = parseAudioProjectConfig(queued.systemPrompt);
      let refImages: Array<{ data: string; mimeType: string }> | undefined;

      if (job.imageContexts && job.imageContexts.length > 0) {
        refImages = [];

        for (const ctx of job.imageContexts) {
          const mimeType = inferImageMimeType(ctx);

          if (ctx.startsWith('data:')) {
            refImages.push({
              data: ctx.replace(/^data:[^;]+;base64,/, ''),
              mimeType,
            });
            continue;
          }

          let buffer: Buffer;
          if (ctx.startsWith('http')) {
            await assertSafeReferenceImageUrl(ctx);
            const response = await fetch(ctx);
            if (!response.ok) throw new Error(`Failed to download reference image: ${response.status}`);
            buffer = Buffer.from(await response.arrayBuffer());
          } else {
            buffer = await this.storage.read(ctx);
          }

          refImages.push({
            data: buffer.toString('base64'),
            mimeType,
          });
        }
      }

      const result = await audioGenerator.generate({
        prompt: job.prompt,
        modelId: modelConfig?.modelId,
        apiUrl: modelConfig?.apiUrl,
        audioConfig,
        outputFormat: job.format === 'wav' || job.format === 'mp3' || job.format === 'aac' ? job.format : undefined,
        refImages,
      });

      if (result.ok === false) {
        throw new Error(result.error);
      }

      await this.audioProcessor.processCompletedAudio({
        userId,
        projectId,
        job,
        audioBytes: result.audioBytes,
        text: result.text,
        mimeType: result.mimeType,
        modelConfigId: job.modelConfigId,
        providerId: job.providerId,
      });
    } catch (e: any) {
      console.error(`[QueueManager] Audio job ${job.id} failed:`, e.message);
      await this.updateJobStatus(userId, projectId, job.id, {
        status: 'failed',
        error: e.message || 'Audio generation failed',
        taskId: null as any,
      });
    }
  }

  /**
   * [Video Pipeline]
   * All video providers are async: generate() returns a taskId, DetachedPoller
   * later drains the operation and hands it to VideoProcessor.
   */
  private async executeVideoJob(userId: string, projectId: string, job: Job, queued: QueuedJob, generator: VideoGenerator, providerRecord: any): Promise<boolean> {
    // Pre-check stale taskId so a recovered job doesn't re-submit on top of an active remote task
    if (job.taskId) {
      try {
        console.log(`[QueueManager] Pre-checking stale video taskId ${job.taskId} for Job ${job.id}`);
        const statusRes = await generator.checkStatus(job.taskId);
        if (statusRes.status === 'processing' || statusRes.status === 'completed') {
          console.log(`[QueueManager] Video job ${job.id} task is still active on remote. Handoff to poller.`);
          return true; // Slot stays held until poller finalizes.
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
      return true; // Handed off — slot stays held until poller finalizes.
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
      return false;
    }

    throw new Error('Video generator returned no taskId and no video bytes');
  }

  private async prepareVideoGenerateRequest(queued: QueuedJob, providerRecord: any) {
    const { job } = queued;
    let refImages: string[] | undefined;
    let refImageUrls: string[] | undefined;
    let refVideoUrls: string[] | undefined;
    let refAudioUrls: string[] | undefined;
    if (job.imageContexts && job.imageContexts.length > 0) {
      refImages = [];
      refImageUrls = [];
      for (const ctx of job.imageContexts) {
        if (ctx.startsWith('data:')) {
          refImageUrls.push(ctx);
          refImages.push(ctx.replace(/^data:[^;]+;base64,/, ''));
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

    if (job.videoContexts && job.videoContexts.length > 0) {
      refVideoUrls = [];
      for (const ctx of job.videoContexts) {
        if (ctx.startsWith('http')) {
          refVideoUrls.push(ctx);
        } else {
          refVideoUrls.push(await this.storage.getPresignedUrl(ctx));
        }
      }
      if (refVideoUrls.length === 0) refVideoUrls = undefined;
    }

    if (job.audioContexts && job.audioContexts.length > 0) {
      refAudioUrls = [];
      for (const ctx of job.audioContexts) {
        if (ctx.startsWith('http')) {
          refAudioUrls.push(ctx);
        } else {
          refAudioUrls.push(await this.storage.getPresignedUrl(ctx));
        }
      }
      if (refAudioUrls.length === 0) refAudioUrls = undefined;
    }

    const modelConfig = getAllModels(providerRecord).find((m) => m.id === job.modelConfigId);

    return {
      prompt: job.prompt,
      modelId: modelConfig?.modelId,
      apiUrl: modelConfig?.apiUrl,
      aspectRatio: queued.aspectRatio || job.aspectRatio || '16:9',
      resolution: queued.resolution || job.resolution || '720p',
      duration: queued.duration ?? job.duration,
      sound: queued.sound || job.sound || 'on',
      refImagesBase64: refImages,
      refImageUrls,
      refVideoUrls,
      refAudioUrls,
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
          refImages.push(ctx.replace(/^data:[^;]+;base64,/, ''));
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
      format: job.format,
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
        // Reserve a concurrency slot for in-flight detached jobs so the limit is
        // enforced even after a restart. DetachedPoller will release on terminal state.
        const recoverProviderId = job.providerId;
        if (recoverProviderId && !this.activeJobIds.has(job.id)) {
          this.activeJobIds.set(job.id, recoverProviderId);
          this.activeJobs.set(recoverProviderId, (this.activeJobs.get(recoverProviderId) || 0) + 1);
        }
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
      videoContexts: (item.videoContexts as string[]) ?? [],
      audioContexts: (item.audioContexts as string[]) ?? [],
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

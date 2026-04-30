import { PrismaClient } from '@prisma/client';
import { ProviderRepository } from '../db/provider-repository';
import { ProjectRepository } from '../db/project-repository';
import { buildGenerator } from '../generators/build-generator';
import { buildVideoGenerator } from '../generators/build-video-generator';
import { Job, ProviderType } from '../../src/types';
import { ImageProcessor } from './image-processor';
import { VideoProcessor } from './video-processor';

// A processing+taskId job that never reaches a terminal state would hold its
// concurrency slot forever. After this timeout we declare the remote task
// stuck, fail the job, and free the slot. Override with JOB_PROCESSING_TIMEOUT_MS.
const DEFAULT_STUCK_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export class DetachedPoller {
  private isPollingDetached = false;
  private activePolls: Set<string> = new Set();
  private intervalId?: NodeJS.Timeout;
  private onJobFinalize?: (providerId: string | null, jobId: string) => void;
  private onPollCycleComplete?: () => Promise<void> | void;
  // First time the poller observed each in-flight job. Used to enforce the
  // stuck-task timeout. Reset on server restart — recovered jobs get a fresh
  // window, which we accept to avoid a schema migration.
  private firstSeenAt: Map<string, number> = new Map();
  private readonly stuckTimeoutMs: number;

  constructor(
    private prisma: PrismaClient,
    private providerRepo: ProviderRepository,
    private projectRepo: ProjectRepository,
    private imageProcessor: ImageProcessor,
    private videoProcessor: VideoProcessor
  ) {
    const raw = process.env.JOB_PROCESSING_TIMEOUT_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    this.stuckTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STUCK_TIMEOUT_MS;
  }

  /**
   * Register a callback fired whenever a polled job reaches a terminal state
   * (completed or failed). QueueManager uses this to release the concurrency
   * slot it reserved when the job was handed off to detached polling.
   */
  public setOnJobFinalize(cb: (providerId: string | null, jobId: string) => void) {
    this.onJobFinalize = cb;
  }

  /**
   * Register a callback fired after each full poll cycle. QueueManager uses
   * this to reconcile its in-memory slot tracking against the DB and release
   * slots for jobs that have been deleted out-of-band.
   */
  public setOnPollCycleComplete(cb: () => Promise<void> | void) {
    this.onPollCycleComplete = cb;
  }

  private finalize(providerId: string | undefined | null, jobId: string) {
    this.firstSeenAt.delete(jobId);
    try {
      // Always notify — receiver can resolve providerId from its own tracking
      // map when ours is null (e.g. provider was deleted; job.providerId got
      // SetNull'd by cascade and we no longer know the original provider).
      this.onJobFinalize?.(providerId ?? null, jobId);
    } catch (e) {
      console.error(`[DetachedPoller] onJobFinalize threw for job ${jobId}:`, e);
    }
  }

  private touchFirstSeen(jobId: string): number {
    const existing = this.firstSeenAt.get(jobId);
    if (existing != null) return existing;
    const now = Date.now();
    this.firstSeenAt.set(jobId, now);
    return now;
  }

  private isStuck(jobId: string): boolean {
    const seen = this.touchFirstSeen(jobId);
    return Date.now() - seen > this.stuckTimeoutMs;
  }

  private async markStuck(userId: string, projectId: string, job: Job) {
    const seen = this.firstSeenAt.get(job.id) ?? Date.now();
    const elapsedMin = Math.round((Date.now() - seen) / 60000);
    const errorMsg = `Task stuck on remote provider for ~${elapsedMin} min without reaching a terminal state.`;
    console.warn(`[DetachedPoller] Job ${job.id} (taskId ${job.taskId}) declared stuck: ${errorMsg}`);
    await this.updateJobStatus(userId, projectId, job.id, {
      status: 'failed',
      error: errorMsg,
      taskId: null as any,
    });
    this.finalize(job.providerId, job.id);
  }

  public start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.pollDetachedTasks().catch((e) => {
        console.error('[DetachedPoller] Poller Error:', e);
      });
    }, 30_000); // 30s
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  public async pollDetachedTasks() {
    if (this.isPollingDetached) {
      console.log('[DetachedPoller] Already running, skipping this interval.');
      return;
    }
    this.isPollingDetached = true;
    try {
      // Query jobs with 'processing' status that have a taskId (owned by detached poller)
      const jobs = await this.prisma.job.findMany({
        where: {
          status: 'processing',
          taskId: { not: null },
        },
        include: {
          project: { select: { type: true } },
        },
      });

      for (const item of jobs) {
        const job = this.prisma_jobToJob(item);
        const projectType = ((item as any).project?.type as string) || 'image';
        await this.checkJobStatus(item.userId, item.projectId, job, projectType);
      }

      if (this.onPollCycleComplete) {
        try {
          await this.onPollCycleComplete();
        } catch (e) {
          console.error('[DetachedPoller] onPollCycleComplete threw:', e);
        }
      }
    } finally {
      this.isPollingDetached = false;
    }
  }

  private async checkJobStatus(userId: string, projectId: string, job: Job, projectType: string) {
    if (this.activePolls.has(job.id)) return;
    this.activePolls.add(job.id);
    try {
      // Snapshotting fallback: The `providerId` on the `job` record should be fully resolved by QueueManager.
      if (!job.providerId) {
         console.warn(`[DetachedPoller] Job ${job.id} is missing providerId. Marking as failed.`);
         await this.updateJobStatus(userId, projectId, job.id, { status: 'failed', error: 'Missing providerId', taskId: null as any });
         // The provider was likely deleted (cascade SetNull); QueueManager still
         // tracks the original providerId in its activeJobIds map and will resolve
         // it when releasing the slot.
         this.finalize(null, job.id);
         return;
      }

      // Track first observation as early as possible so the stuck timeout fires
      // even when we never reach the remote call (e.g. provider record missing,
      // creds unreadable). Without this, a job whose creds were rotated would
      // hold its concurrency slot indefinitely.
      this.touchFirstSeen(job.id);

      const providerRecord = await this.providerRepo.getProvider(userId, job.providerId);
      if (!providerRecord) {
        if (this.isStuck(job.id)) await this.markStuck(userId, projectId, job);
        return;
      }

      const apiKey = await this.providerRepo.getDecryptedApiKey(userId, providerRecord.id);
      if (!apiKey) {
        if (this.isStuck(job.id)) await this.markStuck(userId, projectId, job);
        return;
      }
      const apiSecret = providerRecord.type === 'KlingAI'
        ? await this.providerRepo.getDecryptedApiSecret(userId, providerRecord.id)
        : null;
      if (providerRecord.type === 'KlingAI' && !apiSecret) {
        if (this.isStuck(job.id)) await this.markStuck(userId, projectId, job);
        return;
      }

      if (projectType === 'video') {
        const videoGenerator = buildVideoGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl, apiSecret);

        console.log(`[DetachedPoller] Checking video status for Job ${job.id} (TaskId: ${job.taskId})`);
        const res = await videoGenerator.checkStatus(job.taskId!);
        console.log(`[DetachedPoller] Video Job ${job.id} Status: ${res.status}`);

        if (res.status === 'completed' && res.videoBytes) {
          console.log(`[DetachedPoller] Video job ${job.id} completed. Dispatched to VideoProcessor.`);
          await this.videoProcessor.processCompletedVideo({
            userId,
            projectId,
            job,
            videoBytes: res.videoBytes,
            mimeType: res.mimeType,
            aspectRatio: job.aspectRatio,
            resolution: job.resolution,
            duration: job.duration,
            modelConfigId: job.modelConfigId,
            providerId: job.providerId,
          });
          this.finalize(job.providerId, job.id);
        } else if (res.status === 'failed') {
          const errorMsg = res.error || 'Video task failed on remote server.';
          console.log(`[DetachedPoller] Video job ${job.id} failed (final): ${errorMsg}`);
          await this.updateJobStatus(userId, projectId, job.id, { status: 'failed', error: errorMsg, taskId: null as any });
          this.finalize(job.providerId, job.id);
        } else if (this.isStuck(job.id)) {
          await this.markStuck(userId, projectId, job);
        }
        return;
      }

      const generator = buildGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl, apiSecret);
      if (!generator.checkStatus) {
        console.warn(`[DetachedPoller] Generator for ${providerRecord.type} does not support checkStatus. Skipping Job ${job.id}`);
        return;
      }

      console.log(`[DetachedPoller] Checking status for Job ${job.id} (TaskId: ${job.taskId})`);
      const res = await generator.checkStatus(job.taskId!);
      console.log(`[DetachedPoller] Job ${job.id} Status: ${res.status}`);

      if (res.status === 'completed' && res.imageBytes) {
        console.log(`[DetachedPoller] Job ${job.id} detached poll completed successfully. Dispatched to ImageProcessor.`);
        await this.imageProcessor.processCompletedImage({
          userId,
          projectId,
          job,
          imageBytes: res.imageBytes,
          format: job.format,
          quality: job.quality,
          aspectRatio: job.aspectRatio,
          modelConfigId: job.modelConfigId,
          providerId: job.providerId
        });
        this.finalize(job.providerId, job.id);
      } else if (res.status === 'failed') {
        const errorMsg = res.error || 'Task failed on remote server.';
        console.log(`[DetachedPoller] Job ${job.id} detached poll failed (final): ${errorMsg}`);
        // Remote failure definitively means the taskId is dead — clear taskId to stop polling
        await this.updateJobStatus(userId, projectId, job.id, { status: 'failed', error: errorMsg, taskId: null as any });
        this.finalize(job.providerId, job.id);
      } else if (this.isStuck(job.id)) {
        await this.markStuck(userId, projectId, job);
      }
    } catch (e: any) {
      console.error(`[DetachedPoller] checkStatus for ${job.id} failed:`, e);
    } finally {
      this.activePolls.delete(job.id);
    }
  }

  private async updateJobStatus(userId: string, projectId: string, jobId: string, updates: Partial<Job>) {
    await this.projectRepo.updateJob(userId, projectId, jobId, updates);
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

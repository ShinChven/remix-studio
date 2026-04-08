import { PrismaClient } from '@prisma/client';
import { ProviderRepository } from '../db/provider-repository';
import { ProjectRepository } from '../db/project-repository';
import { buildGenerator } from '../generators/build-generator';
import { Job, ProviderType } from '../../src/types';
import { ImageProcessor } from './image-processor';

export class DetachedPoller {
  private isPollingDetached = false;
  private activePolls: Set<string> = new Set();
  private intervalId?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaClient,
    private providerRepo: ProviderRepository,
    private projectRepo: ProjectRepository,
    private imageProcessor: ImageProcessor
  ) {}

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
      });

      for (const item of jobs) {
        const job = this.prisma_jobToJob(item);
        await this.checkJobStatus(item.userId, item.projectId, job);
      }
    } finally {
      this.isPollingDetached = false;
    }
  }

  private async checkJobStatus(userId: string, projectId: string, job: Job) {
    if (this.activePolls.has(job.id)) return;
    this.activePolls.add(job.id);
    try {
      // Snapshotting fallback: The `providerId` on the `job` record should be fully resolved by QueueManager.
      if (!job.providerId) {
         console.warn(`[DetachedPoller] Job ${job.id} is missing providerId. Marking as failed.`);
         await this.updateJobStatus(userId, projectId, job.id, { status: 'failed', error: 'Missing providerId', taskId: null as any });
         return;
      }

      const providerRecord = await this.providerRepo.getProvider(userId, job.providerId);
      if (!providerRecord) return;

      const apiKey = await this.providerRepo.getDecryptedApiKey(userId, providerRecord.id);
      if (!apiKey) return;

      const generator = buildGenerator(providerRecord.type as ProviderType, apiKey, providerRecord.apiUrl);
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
      } else if (res.status === 'failed') {
        const errorMsg = res.error || 'Task failed on remote server.';
        console.log(`[DetachedPoller] Job ${job.id} detached poll failed (final): ${errorMsg}`);
        // Remote failure definitively means the taskId is dead — clear taskId to stop polling
        await this.updateJobStatus(userId, projectId, job.id, { status: 'failed', error: errorMsg, taskId: null as any });
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
      taskId: item.taskId ?? undefined,
      filename: item.filename ?? undefined,
      size: item.size != null ? Number(item.size) : undefined,
    };
  }
}

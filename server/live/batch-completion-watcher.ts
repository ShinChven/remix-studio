import type { PrismaClient } from '@prisma/client';
import type { ProjectEventPublisher, ProjectLiveEvent } from './project-live-hub';
import type { LiveEventPublisher } from './user-live-hub';
import { getJobBatchSnapshot, type JobBatchSnapshot } from '../services/job-batches';

/**
 * Short settle delay before declaring a batch complete, folding rapid bursts
 * of job completions into one DB check and one assistant wakeup.
 */
const SETTLE_DELAY_MS = 2_000;

export interface BatchCompletedPayload {
  userId: string;
  conversationId: string;
  batch: JobBatchSnapshot;
  resumeMessage: string;
}

export type BatchCompletedHandler = (payload: BatchCompletedPayload) => void | Promise<void>;

/**
 * Wraps the project event publisher: forwards every event unchanged, pushes
 * live generation_batch updates to open browser tabs, and when an auto-resume
 * JobBatch has no pending/processing jobs left, invokes the registered handler
 * to wake up the owning assistant conversation.
 */
export class BatchCompletionWatcher implements ProjectEventPublisher {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onBatchCompleted: BatchCompletedHandler | null = null;

  constructor(
    private inner: ProjectEventPublisher,
    private prisma: PrismaClient,
    private liveEvents: LiveEventPublisher,
  ) {}

  setCompletionHandler(handler: BatchCompletedHandler) {
    this.onBatchCompleted = handler;
  }

  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at' | 'origin'> & { userId: string }): void {
    this.inner.notifyProjectChanged(event);

    if (
      event.reason !== 'job.completed'
      && event.reason !== 'job.failed'
      && event.reason !== 'job.updated'
      && event.reason !== 'jobs.changed'
    ) {
      return;
    }

    void this.handleProjectEvent(event).catch((err) => {
      console.error('[BatchCompletionWatcher] Failed to process project event:', err);
    });
  }

  /**
   * Called once at startup to catch any auto-resume batches whose jobs
   * finished while the server was restarting.
   */
  async reconcilePendingBatches(): Promise<void> {
    const candidates = await this.prisma.jobBatch.findMany({
      where: {
        autoResume: true,
        notifiedAt: null,
        conversationId: { not: null },
      },
      select: { id: true, userId: true },
      take: 100,
    });
    for (const candidate of candidates) {
      this.scheduleCheck(candidate.userId, candidate.id);
    }
  }

  private async handleProjectEvent(
    event: Omit<ProjectLiveEvent, 'type' | 'at' | 'origin'> & { userId: string },
  ): Promise<void> {
    if (event.jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: event.jobId, userId: event.userId },
        select: {
          batchId: true,
          batch: {
            select: {
              id: true,
              conversationId: true,
              autoResume: true,
              notifiedAt: true,
            },
          },
        },
      });
      if (!job?.batchId || !job.batch) return;

      this.liveEvents.publishChange(event.userId, {
        resource: 'generation_batch',
        action: 'updated',
        id: job.batch.id,
        ...(job.batch.conversationId ? { conversationId: job.batch.conversationId } : {}),
      });

      if (
        (event.reason === 'job.completed' || event.reason === 'job.failed')
        && job.batch.autoResume
        && job.batch.conversationId
        && !job.batch.notifiedAt
      ) {
        this.scheduleCheck(event.userId, job.batch.id);
      }
      return;
    }

    // Coarse project-level jobs.changed event: notify any recent batches on this project.
    const activeBatches = await this.prisma.jobBatch.findMany({
      where: {
        userId: event.userId,
        projectId: event.projectId,
        OR: [
          { jobs: { some: { status: { in: ['pending', 'processing'] } } } },
          { autoResume: true, notifiedAt: null },
        ],
      },
      select: { id: true, conversationId: true, autoResume: true, notifiedAt: true },
      take: 20,
    });
    for (const batch of activeBatches) {
      this.liveEvents.publishChange(event.userId, {
        resource: 'generation_batch',
        action: 'updated',
        id: batch.id,
        ...(batch.conversationId ? { conversationId: batch.conversationId } : {}),
      });
      if (batch.autoResume && batch.conversationId && !batch.notifiedAt) {
        this.scheduleCheck(event.userId, batch.id);
      }
    }
  }

  private scheduleCheck(userId: string, batchId: string) {
    const existing = this.timers.get(batchId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(batchId);
      void this.checkBatch(userId, batchId).catch((err) => {
        console.error(`[BatchCompletionWatcher] Check failed for batch ${batchId}:`, err);
      });
    }, SETTLE_DELAY_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.set(batchId, timer);
  }

  private async checkBatch(userId: string, batchId: string): Promise<void> {
    if (!this.onBatchCompleted) return;

    const remaining = await this.prisma.job.count({
      where: {
        userId,
        batchId,
        status: { in: ['pending', 'processing'] },
      },
    });
    if (remaining > 0) return;

    // Atomically claim notification so concurrent ticks never fire twice.
    const claimed = await this.prisma.jobBatch.updateMany({
      where: {
        id: batchId,
        userId,
        autoResume: true,
        notifiedAt: null,
        conversationId: { not: null },
      },
      data: { notifiedAt: new Date() },
    });
    if (claimed.count === 0) return;

    const snapshot = await getJobBatchSnapshot(this.prisma, userId, batchId);
    if (!snapshot || !snapshot.conversationId) return;

    this.liveEvents.publishChange(userId, {
      resource: 'generation_batch',
      action: 'updated',
      id: snapshot.batchId,
      conversationId: snapshot.conversationId,
    });

    const resumeMessage = formatBatchResumeMessage(snapshot);
    await this.onBatchCompleted({
      userId,
      conversationId: snapshot.conversationId,
      batch: snapshot,
      resumeMessage,
    });
  }
}

function formatBatchResumeMessage(batch: JobBatchSnapshot): string {
  const lines: string[] = [
    `[Generation Batch Completed] Batch "${batch.batchId}" for project "${batch.projectName}" (${batch.projectId}) has finished.`,
    `Summary: ${batch.completed} completed, ${batch.failed} failed (out of ${batch.totalCount} started).`,
  ];

  if (batch.resumeHint) {
    lines.push(`Next step note: ${batch.resumeHint}`);
  }

  if (batch.items.length > 0) {
    const preview = batch.items.slice(0, 12).map((item, idx) => {
      const promptSnippet = item.prompt ? ` — "${item.prompt.slice(0, 100)}"` : '';
      return `  ${idx + 1}. albumItemId=${item.id}${item.storageKey ? ` (key=${item.storageKey})` : ''}${promptSnippet}`;
    });
    lines.push('Generated album items:');
    lines.push(...preview);
    if (batch.items.length > 12) {
      lines.push(`  ...and ${batch.items.length - 12} more (call get_generation_batch with batchId "${batch.batchId}" for the full list).`);
    }
  }

  const failedJobs = batch.jobs.filter((j) => j.status === 'failed');
  if (failedJobs.length > 0) {
    lines.push('Failed jobs:');
    for (const job of failedJobs.slice(0, 5)) {
      lines.push(`  - jobId=${job.id}: ${job.error || 'Unknown error'}`);
    }
  }

  lines.push('Please review the results and proceed with the next steps for the user.');
  return lines.join('\n');
}

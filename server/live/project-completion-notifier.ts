import type { PrismaClient } from '@prisma/client';
import type { PushService } from '../services/push/push-service';
import type { ProjectEventPublisher, ProjectLiveEvent } from './project-live-hub';

// Jobs finish in bursts (a provider slot frees and the next job starts within
// the same tick; a completion is published by both the processor and the queue
// manager). Waiting a moment before looking at the queue lets that settle, and
// folds a burst of completions into one check.
const SETTLE_DELAY_MS = 3_000;

type ProjectRun = {
  userId: string;
  projectId: string;
  completed: Set<string>;
  failed: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * Wraps the live hub: every event is forwarded unchanged, and when a project
 * that was running jobs has none left pending or processing, its owner gets a
 * Web Push notification summarising the run.
 */
export class ProjectCompletionNotifier implements ProjectEventPublisher {
  private runs = new Map<string, ProjectRun>();

  constructor(
    private inner: ProjectEventPublisher,
    private prisma: PrismaClient,
    private push: PushService,
  ) {}

  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at'> & { userId: string }): void {
    this.inner.notifyProjectChanged(event);

    if (event.reason === 'project.deleted') {
      this.forget(event.userId, event.projectId);
      return;
    }
    if (event.reason !== 'job.completed' && event.reason !== 'job.failed') return;

    const key = `${event.userId}:${event.projectId}`;
    let run = this.runs.get(key);
    if (!run) {
      run = { userId: event.userId, projectId: event.projectId, completed: new Set(), failed: new Set(), timer: null };
      this.runs.set(key, run);
    }
    // Sets, since one completion is published more than once. A job that
    // failed and was retried to success counts only as completed.
    if (event.jobId) {
      if (event.reason === 'job.completed') {
        run.completed.add(event.jobId);
        run.failed.delete(event.jobId);
      } else if (!run.completed.has(event.jobId)) {
        run.failed.add(event.jobId);
      }
    }

    if (run.timer) clearTimeout(run.timer);
    run.timer = setTimeout(() => {
      run!.timer = null;
      this.checkRun(key).catch((error) => {
        console.error(`[ProjectCompletionNotifier] Check failed for project ${event.projectId}:`, error);
      });
    }, SETTLE_DELAY_MS);
  }

  private forget(userId: string, projectId: string) {
    const key = `${userId}:${projectId}`;
    const run = this.runs.get(key);
    if (run?.timer) clearTimeout(run.timer);
    this.runs.delete(key);
  }

  private async checkRun(key: string) {
    const run = this.runs.get(key);
    if (!run || run.timer) return;

    const remaining = await this.prisma.job.count({
      where: {
        userId: run.userId,
        projectId: run.projectId,
        status: { in: ['pending', 'processing'] },
      },
    });
    // Still running: the next completion re-arms the check.
    if (remaining > 0) return;
    // A new event arrived while the count was in flight; let its check decide.
    if (this.runs.get(key) !== run || run.timer) return;

    this.runs.delete(key);
    const completed = run.completed.size;
    const failed = run.failed.size;
    if (completed + failed === 0) return;

    const project = await this.prisma.project.findFirst({
      where: { id: run.projectId, userId: run.userId },
      select: { name: true },
    });
    if (!project) return;

    const total = completed + failed;
    const jobs = (n: number) => `${n} job${n === 1 ? '' : 's'}`;
    const body = failed === 0
      ? total === 1 ? '1 job finished.' : `All ${jobs(total)} finished.`
      : completed === 0
        ? `${jobs(failed)} failed.`
        : `${completed} of ${jobs(total)} finished, ${failed} failed.`;

    await this.push.sendToUser(run.userId, {
      title: `${project.name || 'Project'} is done`,
      body,
      url: `/project/${run.projectId}`,
      tag: `project-queue-${run.projectId}`,
    });
  }
}

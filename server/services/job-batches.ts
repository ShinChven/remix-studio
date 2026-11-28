import type { PrismaClient } from '@prisma/client';

export type JobBatchStatus = 'running' | 'completed' | 'partial' | 'failed';

export interface JobBatchJobEntry {
  id: string;
  status: string;
  prompt: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobBatchAlbumEntry {
  id: string;
  jobId: string | null;
  prompt: string | null;
  textContent: string | null;
  storageKey: string | null;
  thumbnailKey: string | null;
  optimizedKey: string | null;
  aspectRatio: string | null;
  format: string | null;
  createdAt: string;
}

export interface JobBatchSnapshot {
  batchId: string;
  projectId: string;
  projectName: string;
  projectType: string;
  projectUrl?: string;
  conversationId: string | null;
  status: JobBatchStatus;
  totalCount: number;
  pending: number;
  processing: number;
  queued: number;
  completed: number;
  failed: number;
  autoResume: boolean;
  resumeHint: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  jobs: JobBatchJobEntry[];
  items: JobBatchAlbumEntry[];
}

export interface ConversationJobBatchSummary {
  batchId: string;
  projectId: string;
  projectName: string;
  projectType: string;
  status: JobBatchStatus;
  totalCount: number;
  pending: number;
  processing: number;
  queued: number;
  completed: number;
  failed: number;
  autoResume: boolean;
  resumeHint: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  previewItems: {
    id: string;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    format: string | null;
  }[];
}

export function deriveBatchStatus(counts: {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}): JobBatchStatus {
  if (counts.pending + counts.processing > 0) return 'running';
  if (counts.failed > 0 && counts.completed > 0) return 'partial';
  if (counts.failed > 0 && counts.completed === 0) return 'failed';
  return 'completed';
}

export async function createJobBatch(
  prisma: PrismaClient,
  input: {
    userId: string;
    projectId: string;
    totalCount: number;
    conversationId?: string | null;
    autoResume?: boolean;
    resumeHint?: string | null;
  },
) {
  const conversationId = input.conversationId?.trim() || null;
  const autoResume = Boolean(input.autoResume && conversationId);
  const resumeHint = input.resumeHint?.trim() || null;
  return prisma.jobBatch.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      totalCount: input.totalCount,
      conversationId,
      autoResume,
      resumeHint,
    },
  });
}

export async function getJobBatchSnapshot(
  prisma: PrismaClient,
  userId: string,
  batchId: string,
  options?: { projectUrl?: (projectId: string) => string },
): Promise<JobBatchSnapshot | null> {
  const batch = await prisma.jobBatch.findFirst({
    where: { id: batchId, userId },
    include: {
      project: { select: { id: true, name: true, type: true } },
    },
  });
  if (!batch) return null;

  const [jobs, albumItems] = await Promise.all([
    prisma.job.findMany({
      where: { batchId: batch.id, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        prompt: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.albumItem.findMany({
      where: { batchId: batch.id, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        jobId: true,
        prompt: true,
        textContent: true,
        imageUrl: true,
        thumbnailUrl: true,
        optimizedUrl: true,
        aspectRatio: true,
        format: true,
        createdAt: true,
      },
    }),
  ]);

  let pending = 0;
  let processing = 0;
  let jobCompleted = 0;
  let failed = 0;
  for (const job of jobs) {
    if (job.status === 'pending') pending += 1;
    else if (job.status === 'processing') processing += 1;
    else if (job.status === 'completed') jobCompleted += 1;
    else if (job.status === 'failed') failed += 1;
  }

  // Album items survive job cleanup, so take the higher of the two counts.
  const completed = Math.max(jobCompleted, albumItems.length);
  const queued = pending + processing;
  const status = deriveBatchStatus({ pending, processing, completed, failed });

  return {
    batchId: batch.id,
    projectId: batch.projectId,
    projectName: batch.project.name,
    projectType: batch.project.type ?? 'image',
    ...(options?.projectUrl ? { projectUrl: options.projectUrl(batch.projectId) } : {}),
    conversationId: batch.conversationId,
    status,
    totalCount: batch.totalCount,
    pending,
    processing,
    queued,
    completed,
    failed,
    autoResume: batch.autoResume,
    resumeHint: batch.resumeHint,
    notifiedAt: batch.notifiedAt ? batch.notifiedAt.toISOString() : null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      prompt: job.prompt.slice(0, 240),
      error: job.error ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    })),
    items: albumItems.map((item) => ({
      id: item.id,
      jobId: item.jobId,
      prompt: item.prompt ? item.prompt.slice(0, 240) : null,
      textContent: item.textContent ? item.textContent.slice(0, 500) : null,
      storageKey: item.imageUrl ?? null,
      thumbnailKey: item.thumbnailUrl ?? null,
      optimizedKey: item.optimizedUrl ?? null,
      aspectRatio: item.aspectRatio ?? null,
      format: item.format ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function listConversationJobBatches(
  prisma: PrismaClient,
  userId: string,
  conversationId: string,
  limit = 20,
): Promise<ConversationJobBatchSummary[]> {
  const batches = await prisma.jobBatch.findMany({
    where: { userId, conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      project: { select: { id: true, name: true, type: true } },
    },
  });
  if (batches.length === 0) return [];

  const batchIds = batches.map((b) => b.id);
  const [jobGroups, albumItems] = await Promise.all([
    prisma.job.groupBy({
      by: ['batchId', 'status'],
      where: { userId, batchId: { in: batchIds } },
      _count: { _all: true },
    }),
    prisma.albumItem.findMany({
      where: { userId, batchId: { in: batchIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        batchId: true,
        thumbnailUrl: true,
        imageUrl: true,
        format: true,
      },
    }),
  ]);

  const countsByBatch = new Map<string, { pending: number; processing: number; completed: number; failed: number }>();
  for (const row of jobGroups) {
    if (!row.batchId) continue;
    const entry = countsByBatch.get(row.batchId) ?? { pending: 0, processing: 0, completed: 0, failed: 0 };
    const n = row._count._all;
    if (row.status === 'pending') entry.pending += n;
    else if (row.status === 'processing') entry.processing += n;
    else if (row.status === 'completed') entry.completed += n;
    else if (row.status === 'failed') entry.failed += n;
    countsByBatch.set(row.batchId, entry);
  }

  const itemsByBatch = new Map<string, typeof albumItems>();
  for (const item of albumItems) {
    if (!item.batchId) continue;
    const list = itemsByBatch.get(item.batchId) ?? [];
    list.push(item);
    itemsByBatch.set(item.batchId, list);
  }

  return batches.map((batch) => {
    const raw = countsByBatch.get(batch.id) ?? { pending: 0, processing: 0, completed: 0, failed: 0 };
    const batchItems = itemsByBatch.get(batch.id) ?? [];
    const completed = Math.max(raw.completed, batchItems.length);
    const queued = raw.pending + raw.processing;
    const status = deriveBatchStatus({
      pending: raw.pending,
      processing: raw.processing,
      completed,
      failed: raw.failed,
    });
    return {
      batchId: batch.id,
      projectId: batch.projectId,
      projectName: batch.project.name,
      projectType: batch.project.type ?? 'image',
      status,
      totalCount: batch.totalCount,
      pending: raw.pending,
      processing: raw.processing,
      queued,
      completed,
      failed: raw.failed,
      autoResume: batch.autoResume,
      resumeHint: batch.resumeHint,
      notifiedAt: batch.notifiedAt ? batch.notifiedAt.toISOString() : null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      previewItems: batchItems.slice(0, 4).map((item) => ({
        id: item.id,
        thumbnailUrl: item.thumbnailUrl,
        imageUrl: item.imageUrl,
        format: item.format,
      })),
    };
  });
}

export async function updateJobBatchAutoResume(
  prisma: PrismaClient,
  userId: string,
  batchId: string,
  autoResume: boolean,
): Promise<{ id: string; conversationId: string | null; autoResume: boolean } | null> {
  const existing = await prisma.jobBatch.findFirst({
    where: { id: batchId, userId },
    select: { id: true, conversationId: true, notifiedAt: true },
  });
  if (!existing) return null;
  if (!existing.conversationId && autoResume) {
    return { id: existing.id, conversationId: null, autoResume: false };
  }
  const updated = await prisma.jobBatch.update({
    where: { id: existing.id },
    data: { autoResume },
    select: { id: true, conversationId: true, autoResume: true },
  });
  return updated;
}

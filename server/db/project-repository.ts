import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { Project, ProjectStatus, Job, WorkflowItem, AlbumItem, TrashItem } from '../../src/types';

export class ProjectRepository {
  constructor(private prisma: PrismaClient) {}

  private toNullableJsonArray(value: string[] | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull {
    return value == null ? Prisma.DbNull : value;
  }

  private async assertOwnedProject(userId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }
  }

  async getUserProjects(userId: string, page: number = 1, limit: number = 50, q?: string, status?: ProjectStatus | 'all'): Promise<{ items: Project[], total: number, page: number, pages: number }> {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status && status !== 'all') {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { id: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { jobs: true, albumItems: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const projectIds = projects.map((p) => p.id);
    const projectSizes: Record<string, number> = {};

    if (projectIds.length > 0) {
      const [albumItems, trashItems, exportTasks] = await Promise.all([
        this.prisma.albumItem.findMany({
          where: { userId, projectId: { in: projectIds } },
          select: { projectId: true, size: true, optimizedSize: true, thumbnailSize: true },
        }),
        this.prisma.trashItem.findMany({
          where: { userId, projectId: { in: projectIds } },
          select: { projectId: true, size: true, optimizedSize: true, thumbnailSize: true },
        }),
        this.prisma.exportTask.findMany({
          where: { userId, projectId: { in: projectIds } },
          select: { projectId: true, size: true },
        }),
      ]);

      for (const item of albumItems) {
        const s = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
        projectSizes[item.projectId] = (projectSizes[item.projectId] || 0) + s;
      }
      for (const item of trashItems) {
        const s = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
        projectSizes[item.projectId] = (projectSizes[item.projectId] || 0) + s;
      }
      for (const item of exportTasks) {
        if (!item.projectId) continue;
        projectSizes[item.projectId] = (projectSizes[item.projectId] || 0) + Number(item.size || 0);
      }
    }

    const mappedProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: (p as any).description ?? undefined,
      type: (p as any).type ?? 'image',
      status: ((p as any).status ?? 'active') as ProjectStatus,
      createdAt: p.createdAt.getTime(),
      workflow: [],
      jobs: [],
      album: [],
      jobCount: p._count.jobs,
      albumCount: p._count.albumItems,
      totalSize: projectSizes[p.id] || 0,
      providerId: p.providerId ?? undefined,
      aspectRatio: p.aspectRatio ?? undefined,
      quality: p.quality ?? undefined,
      format: p.format as Project['format'] ?? undefined,
      shuffle: p.shuffle ?? undefined,
      modelConfigId: p.modelConfigId ?? undefined,
      prefix: p.prefix ?? undefined,
      background: (p as any).background ?? undefined,
    }));

    return {
      items: mappedProjects,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const p = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        jobs: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        workflowItems: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
        albumItems: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!p) return null;

    return {
      id: p.id,
      name: p.name,
      description: (p as any).description ?? undefined,
      type: (p as any).type ?? 'image',
      status: ((p as any).status ?? 'active') as ProjectStatus,
      createdAt: p.createdAt.getTime(),
      providerId: p.providerId ?? undefined,
      aspectRatio: p.aspectRatio ?? undefined,
      quality: p.quality ?? undefined,
      format: p.format as Project['format'] ?? undefined,
      shuffle: p.shuffle ?? undefined,
      modelConfigId: p.modelConfigId ?? undefined,
      prefix: p.prefix ?? undefined,
      background: (p as any).background ?? undefined,
      systemPrompt: (p as any).systemPrompt ?? undefined,
      temperature: (p as any).temperature ?? undefined,
      maxTokens: (p as any).maxTokens ?? undefined,
      duration: (p as any).duration ?? undefined,
      resolution: (p as any).resolution ?? undefined,
      sound: (p as any).sound ?? undefined,
      lastQueueCount: (p as any).lastQueueCount ?? undefined,
      jobs: p.jobs.map((j) => this.mapJob(j)),
      workflow: p.workflowItems.map((w) => this.mapWorkflow(w)),
      album: p.albumItems.map((a) => this.mapAlbumItem(a)),
    };
  }

  async createProject(userId: string, project: Project): Promise<void> {
    await this.prisma.project.create({
      data: {
        id: project.id,
        userId,
        name: project.name,
        description: project.description ?? null,
        type: project.type ?? 'image',
        status: project.status ?? 'active',
        createdAt: project.createdAt ? new Date(project.createdAt) : new Date(),
        providerId: project.providerId ?? null,
        aspectRatio: project.aspectRatio ?? null,
        quality: project.quality ?? null,
        format: project.format ?? null,
        shuffle: project.shuffle ?? null,
        modelConfigId: project.modelConfigId ?? null,
        prefix: project.prefix ?? null,
        background: (project as any).background ?? null,
        systemPrompt: project.systemPrompt ?? null,
        temperature: project.temperature ?? null,
        maxTokens: project.maxTokens ?? null,
        duration: project.duration ?? null,
        resolution: project.resolution ?? null,
        sound: project.sound ?? null,
        lastQueueCount: project.lastQueueCount ?? null,
      } as any,
    });

    if (project.jobs?.length) await this.saveJobs(userId, project.id, project.jobs);
    if (project.workflow?.length) await this.saveWorkflow(userId, project.id, project.workflow);
  }

  async updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void> {
    await this.assertOwnedProject(userId, projectId);

    const data: any = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description ?? null;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.providerId !== undefined) data.providerId = updates.providerId ?? null;
    if (updates.aspectRatio !== undefined) data.aspectRatio = updates.aspectRatio ?? null;
    if (updates.quality !== undefined) data.quality = updates.quality ?? null;
    if (updates.format !== undefined) data.format = updates.format ?? null;
    if (updates.shuffle !== undefined) data.shuffle = updates.shuffle ?? null;
    if (updates.modelConfigId !== undefined) data.modelConfigId = updates.modelConfigId ?? null;
    if (updates.prefix !== undefined) data.prefix = updates.prefix ?? null;
    if ((updates as any).background !== undefined) data.background = (updates as any).background ?? null;
    if (updates.systemPrompt !== undefined) data.systemPrompt = updates.systemPrompt ?? null;
    if (updates.temperature !== undefined) data.temperature = updates.temperature ?? null;
    if (updates.maxTokens !== undefined) data.maxTokens = updates.maxTokens ?? null;
    if (updates.duration !== undefined) data.duration = updates.duration ?? null;
    if (updates.resolution !== undefined) data.resolution = updates.resolution ?? null;
    if (updates.sound !== undefined) data.sound = updates.sound ?? null;
    if (updates.lastQueueCount !== undefined) data.lastQueueCount = updates.lastQueueCount ?? null;

    if (Object.keys(data).length > 0) {
      await this.prisma.project.updateMany({ where: { id: projectId, userId }, data: data as any });
    }

    if (updates.jobs !== undefined) await this.saveJobs(userId, projectId, updates.jobs);
    if (updates.workflow !== undefined) await this.saveWorkflow(userId, projectId, updates.workflow);
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    await this.prisma.project.deleteMany({ where: { id: projectId, userId } });
  }

  async getJob(userId: string, projectId: string, jobId: string): Promise<Job | null> {
    const j = await this.prisma.job.findFirst({
      where: { id: jobId, projectId, userId },
    });
    if (!j) return null;
    return this.mapJob(j);
  }

  async updateJob(userId: string, projectId: string, jobId: string, updates: Partial<Job>): Promise<void> {
    const data: any = {};
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.imageUrl !== undefined) data.imageUrl = updates.imageUrl ?? null;
    if (updates.thumbnailUrl !== undefined) data.thumbnailUrl = updates.thumbnailUrl ?? null;
    if (updates.optimizedUrl !== undefined) data.optimizedUrl = updates.optimizedUrl ?? null;
    if (updates.error !== undefined) data.error = updates.error ?? null;
    if (updates.resultText !== undefined) data.resultText = updates.resultText ?? null;
    if (updates.taskId !== undefined) data.taskId = updates.taskId ?? null;
    if (updates.filename !== undefined) data.filename = updates.filename ?? null;
    if (updates.format !== undefined) data.format = updates.format ?? null;
    if (updates.duration !== undefined) data.duration = updates.duration ?? null;
    if (updates.resolution !== undefined) data.resolution = updates.resolution ?? null;
    if (updates.sound !== undefined) data.sound = updates.sound ?? null;
    if (updates.size !== undefined) data.size = updates.size != null ? BigInt(updates.size) : null;
    if ((updates as any).optimizedSize !== undefined) data.optimizedSize = (updates as any).optimizedSize != null ? BigInt((updates as any).optimizedSize) : null;
    if ((updates as any).thumbnailSize !== undefined) data.thumbnailSize = (updates as any).thumbnailSize != null ? BigInt((updates as any).thumbnailSize) : null;

    const result = await this.prisma.job.updateMany({ where: { id: jobId, projectId, userId }, data: data as any });
    if (result.count === 0) {
      console.warn(`[ProjectRepository] updateJob matched 0 rows for job=${jobId} project=${projectId} user=${userId}. Data: ${JSON.stringify(data)}`);
    }
  }

  async addAlbumItem(userId: string, projectId: string, item: AlbumItem): Promise<void> {
    await this.assertOwnedProject(userId, projectId);

    const data = {
      projectId,
      userId,
      jobId: item.jobId ?? null,
      prompt: item.prompt ?? null,
      textContent: item.textContent ?? null,
      imageContexts: this.toNullableJsonArray(item.imageContexts),
      videoContexts: this.toNullableJsonArray(item.videoContexts),
      audioContexts: this.toNullableJsonArray(item.audioContexts),
      imageUrl: item.imageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      optimizedUrl: item.optimizedUrl ?? null,
      providerId: item.providerId ?? null,
      modelConfigId: item.modelConfigId ?? null,
      aspectRatio: item.aspectRatio ?? null,
      quality: item.quality ?? null,
      format: item.format ?? null,
      duration: item.duration ?? null,
      resolution: item.resolution ?? null,
      size: item.size != null ? BigInt(item.size) : null,
      optimizedSize: (item as any).optimizedSize != null ? BigInt((item as any).optimizedSize) : null,
      thumbnailSize: (item as any).thumbnailSize != null ? BigInt((item as any).thumbnailSize) : null,
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
    };

    const existing = await this.prisma.albumItem.findUnique({
      where: { id: item.id },
      select: { id: true, userId: true, projectId: true },
    });

    if (existing && (existing.userId !== userId || existing.projectId !== projectId)) {
      throw new Error('Album item not found');
    }

    if (existing) {
      await this.prisma.albumItem.updateMany({
        where: { id: item.id, projectId, userId },
        data,
      });
      return;
    }

    await this.prisma.albumItem.create({
      data: { id: item.id, ...data },
    });
  }

  async deleteAlbumItem(userId: string, projectId: string, itemId: string): Promise<AlbumItem | null> {
    const item = await this.prisma.albumItem.findFirst({ where: { id: itemId, projectId, userId } });
    if (!item) return null;
    await this.prisma.albumItem.deleteMany({ where: { id: itemId, projectId, userId } });
    return this.mapAlbumItem(item);
  }

  async moveToTrash(userId: string, projectId: string, itemId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new Error('Project not found');

    const item = await this.prisma.albumItem.findFirst({ where: { id: itemId, projectId, userId } });
    if (!item) throw new Error('Album item not found');

    await this.prisma.trashItem.create({
      data: {
        id: item.id,
        userId,
        projectId,
        projectName: project.name,
        jobId: item.jobId ?? null,
        prompt: item.prompt ?? null,
        textContent: item.textContent ?? null,
        imageContexts: this.toNullableJsonArray(item.imageContexts as string[] | null | undefined),
        videoContexts: this.toNullableJsonArray((item as any).videoContexts as string[] | null | undefined),
        audioContexts: this.toNullableJsonArray((item as any).audioContexts as string[] | null | undefined),
        imageUrl: item.imageUrl ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
        optimizedUrl: item.optimizedUrl ?? null,
        providerId: item.providerId ?? null,
        modelConfigId: item.modelConfigId ?? null,
        aspectRatio: item.aspectRatio ?? null,
        quality: item.quality ?? null,
        format: item.format ?? null,
        size: item.size ?? null,
        optimizedSize: item.optimizedSize ?? null,
        thumbnailSize: item.thumbnailSize ?? null,
        createdAt: item.createdAt,
        deletedAt: new Date(),
      } as any,
    });

    await this.prisma.albumItem.deleteMany({ where: { id: itemId, projectId, userId } });
  }

  async getTrashItems(userId: string): Promise<TrashItem[]> {
    const items = await this.prisma.trashItem.findMany({
      where: { userId },
      orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
    });
    return items.map((item) => this.mapTrashItem(item));
  }

  async restoreTrashItem(userId: string, itemId: string): Promise<void> {
    const trashItem = await this.prisma.trashItem.findFirst({ where: { id: itemId, userId } });
    if (!trashItem) throw new Error('Trash item not found');

    await this.prisma.albumItem.create({
      data: {
        id: trashItem.id,
        projectId: trashItem.projectId,
        userId,
        jobId: trashItem.jobId ?? null,
        prompt: trashItem.prompt ?? null,
        textContent: trashItem.textContent ?? null,
        imageContexts: this.toNullableJsonArray(trashItem.imageContexts as string[] | null | undefined),
        videoContexts: this.toNullableJsonArray((trashItem as any).videoContexts as string[] | null | undefined),
        audioContexts: this.toNullableJsonArray((trashItem as any).audioContexts as string[] | null | undefined),
        imageUrl: trashItem.imageUrl ?? null,
        thumbnailUrl: trashItem.thumbnailUrl ?? null,
        optimizedUrl: trashItem.optimizedUrl ?? null,
        providerId: trashItem.providerId ?? null,
        modelConfigId: trashItem.modelConfigId ?? null,
        aspectRatio: trashItem.aspectRatio ?? null,
        quality: trashItem.quality ?? null,
        format: trashItem.format ?? null,
        size: trashItem.size ?? null,
        optimizedSize: trashItem.optimizedSize ?? null,
        thumbnailSize: trashItem.thumbnailSize ?? null,
        createdAt: trashItem.createdAt,
      } as any,
    });

    await this.prisma.trashItem.delete({ where: { id: itemId } });
  }

  async deleteTrashPermanently(userId: string, itemId: string): Promise<string[]> {
    const item = await this.prisma.trashItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return [];

    const keys: string[] = [];
    if (item.imageUrl) keys.push(item.imageUrl);
    if (item.thumbnailUrl) keys.push(item.thumbnailUrl);
    if (item.optimizedUrl) keys.push(item.optimizedUrl);

    await this.prisma.trashItem.delete({ where: { id: itemId } });
    return keys;
  }

  async emptyTrash(userId: string): Promise<string[]> {
    const items = await this.prisma.trashItem.findMany({ where: { userId } });
    const keys: string[] = [];
    for (const item of items) {
      if (item.imageUrl) keys.push(item.imageUrl);
      if (item.thumbnailUrl) keys.push(item.thumbnailUrl);
      if (item.optimizedUrl) keys.push(item.optimizedUrl);
    }
    await this.prisma.trashItem.deleteMany({ where: { userId } });
    return keys;
  }

  // === Export CRUD ===

  async getExportTasks(userId: string, projectId: string): Promise<any[]> {
    const tasks = await this.prisma.exportTask.findMany({
      where: { userId, projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return tasks.map((t) => this.mapExportTask(t));
  }

  async getAllExportTasks(userId: string, limit: number = 20, cursor?: string): Promise<{ items: any[]; nextCursor?: string }> {
    const tasks = await this.prisma.exportTask.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (tasks.length > limit) {
      tasks.splice(limit);
      nextCursor = tasks[tasks.length - 1]?.id;
    }

    return { items: tasks.map((t) => this.mapExportTask(t)), nextCursor };
  }

  async getExportTask(userId: string, taskId: string): Promise<any | undefined> {
    const t = await this.prisma.exportTask.findFirst({ where: { id: taskId, userId } });
    if (!t) return undefined;
    return this.mapExportTask(t);
  }

  async saveExportTask(userId: string, taskId: string, data: any): Promise<void> {
    const { projectId, status, downloadUrl, error, size, createdAt, expiresAt, ...rest } = data;
    await this.prisma.exportTask.upsert({
      where: { id: taskId },
      create: {
        id: taskId,
        userId,
        projectId: projectId ?? null,
        status: status ?? 'pending',
        downloadUrl: downloadUrl ?? null,
        error: error ?? null,
        size: size != null ? BigInt(size) : null,
        data: Object.keys(rest).length > 0 ? rest : undefined,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      update: {
        projectId: projectId ?? null,
        status: status ?? undefined,
        downloadUrl: downloadUrl ?? null,
        error: error ?? null,
        size: size != null ? BigInt(size) : null,
        data: Object.keys(rest).length > 0 ? rest : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
  }

  async deleteExportTask(userId: string, taskId: string): Promise<void> {
    await this.prisma.exportTask.deleteMany({ where: { id: taskId, userId } });
  }

  /**
   * Atomically claim the next pending ExportTask from the global queue.
   * Uses FOR UPDATE SKIP LOCKED so concurrent workers cannot double-claim.
   */
  async claimNextExportTask(workerId: string): Promise<any | null> {
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE "ExportTask"
      SET    status        = 'processing',
             "claimedAt"  = NOW(),
             "workerId"   = ${workerId},
             "heartbeatAt" = NOW(),
             attempts     = attempts + 1
      WHERE  id = (
        SELECT id FROM "ExportTask"
        WHERE  status = 'pending'
        ORDER  BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT  1
      )
      RETURNING *
    `;
    if (!rows.length) return null;
    return this.mapExportTask(rows[0]);
  }

  async heartbeatExportTask(taskId: string): Promise<void> {
    await this.prisma.exportTask.updateMany({
      where: { id: taskId },
      data: { heartbeatAt: new Date() },
    });
  }

  /**
   * Requeue (or fail) ExportTasks whose heartbeat is older than thresholdMinutes.
   * Returns the number of rows affected.
   */
  async reapStaleExportTasks(thresholdMinutes = 2): Promise<number> {
    const result = await this.prisma.$executeRaw`
      UPDATE "ExportTask"
      SET    status      = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
             error       = CASE WHEN attempts >= 3 THEN 'worker timeout' ELSE error END,
             "claimedAt"  = NULL,
             "workerId"   = NULL
      WHERE  status = 'processing'
        AND  "heartbeatAt" < NOW() - (${thresholdMinutes} || ' minutes')::INTERVAL
    `;
    return result;
  }

  // === DeliveryTask CRUD + Queue ===

  async saveDeliveryTask(userId: string, taskId: string, data: any): Promise<void> {
    const { exportTaskId, destination, status, bytesTransferred, totalBytes, externalId, externalUrl, error, createdAt, expiresAt } = data;
    await this.prisma.deliveryTask.upsert({
      where: { id: taskId },
      create: {
        id: taskId,
        userId,
        exportTaskId,
        destination: destination ?? 'drive',
        status: status ?? 'pending',
        bytesTransferred: bytesTransferred != null ? BigInt(bytesTransferred) : BigInt(0),
        totalBytes: totalBytes != null ? BigInt(totalBytes) : null,
        externalId: externalId ?? null,
        externalUrl: externalUrl ?? null,
        error: error ?? null,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      update: {
        status: status ?? undefined,
        bytesTransferred: bytesTransferred != null ? BigInt(bytesTransferred) : undefined,
        totalBytes: totalBytes != null ? BigInt(totalBytes) : undefined,
        externalId: externalId ?? null,
        externalUrl: externalUrl ?? null,
        error: error ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
  }

  async getDeliveryTask(userId: string, taskId: string): Promise<any | undefined> {
    const t = await this.prisma.deliveryTask.findFirst({ where: { id: taskId, userId } });
    if (!t) return undefined;
    return this.mapDeliveryTask(t);
  }

  async listActiveDeliveryTasks(userId: string): Promise<any[]> {
    const tasks = await this.prisma.deliveryTask.findMany({
      where: {
        userId,
        status: { in: ['pending', 'processing'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return tasks.map((t) => this.mapDeliveryTask(t));
  }

  async deleteDeliveryTask(userId: string, taskId: string): Promise<void> {
    await this.prisma.deliveryTask.deleteMany({ where: { id: taskId, userId } });
  }

  async claimNextDeliveryTask(workerId: string): Promise<any | null> {
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE "DeliveryTask"
      SET    status        = 'processing',
             "claimedAt"  = NOW(),
             "workerId"   = ${workerId},
             "heartbeatAt" = NOW(),
             attempts     = attempts + 1
      WHERE  id = (
        SELECT id FROM "DeliveryTask"
        WHERE  status = 'pending'
        ORDER  BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT  1
      )
      RETURNING *
    `;
    if (!rows.length) return null;
    return this.mapDeliveryTask(rows[0]);
  }

  async heartbeatDeliveryTask(taskId: string): Promise<void> {
    await this.prisma.deliveryTask.updateMany({
      where: { id: taskId },
      data: { heartbeatAt: new Date() },
    });
  }

  async reapStaleDeliveryTasks(thresholdMinutes = 2): Promise<number> {
    const result = await this.prisma.$executeRaw`
      UPDATE "DeliveryTask"
      SET    status      = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
             error       = CASE WHEN attempts >= 3 THEN 'worker timeout' ELSE error END,
             "claimedAt"  = NULL,
             "workerId"   = NULL
      WHERE  status = 'processing'
        AND  "heartbeatAt" < NOW() - (${thresholdMinutes} || ' minutes')::INTERVAL
    `;
    return result;
  }

  private mapDeliveryTask(t: any): any {
    return {
      id: t.id,
      userId: t.userId,
      exportTaskId: t.exportTaskId,
      destination: t.destination,
      status: t.status,
      bytesTransferred: t.bytesTransferred != null ? Number(t.bytesTransferred) : 0,
      totalBytes: t.totalBytes != null ? Number(t.totalBytes) : undefined,
      externalId: t.externalId ?? undefined,
      externalUrl: t.externalUrl ?? undefined,
      error: t.error ?? undefined,
      createdAt: t.createdAt instanceof Date ? t.createdAt.getTime() : t.createdAt,
      expiresAt: t.expiresAt ? (t.expiresAt instanceof Date ? t.expiresAt.getTime() : t.expiresAt) : undefined,
    };
  }



  /**
   * Per-project album statistics aggregated in SQL. Replaces the N+1 pattern
   * of fetching album items per project.
   */
  async getAlbumStatsByProject(
    userId: string,
    projectIds: string[],
  ): Promise<Record<string, { itemCount: number; totalSize: number }>> {
    if (projectIds.length === 0) return {};

    const rows = await this.prisma.albumItem.groupBy({
      by: ['projectId'],
      where: { userId, projectId: { in: projectIds } },
      _count: { _all: true },
      _sum: { size: true, optimizedSize: true, thumbnailSize: true },
    });

    const result: Record<string, { itemCount: number; totalSize: number }> = {};
    for (const r of rows) {
      const totalSize =
        Number(r._sum.size || 0) +
        Number(r._sum.optimizedSize || 0) +
        Number(r._sum.thumbnailSize || 0);
      result[r.projectId] = { itemCount: r._count._all, totalSize };
    }
    return result;
  }

  /**
   * Per-category storage usage computed via SQL aggregates — one query per
   * category, no row materialization. Sums DB size fields (no S3 HeadObject).
   */
  async getStorageUsageAggregate(userId: string): Promise<{
    projects: number;
    campaigns: number;
    libraries: number;
    archives: number;
    trash: number;
  }> {
    const [albumAgg, postMediaAgg, libAgg, exportAgg, trashAgg] = await Promise.all([
      this.prisma.albumItem.aggregate({
        where: { userId },
        _sum: { size: true, optimizedSize: true, thumbnailSize: true },
      }),
      this.prisma.postMedia.aggregate({
        where: { post: { userId } },
        _sum: { size: true },
      }),
      this.prisma.libraryItem.aggregate({
        where: { library: { userId } },
        _sum: { size: true },
      }),
      this.prisma.exportTask.aggregate({
        where: { userId, status: 'completed' },
        _sum: { size: true },
      }),
      this.prisma.trashItem.aggregate({
        where: { userId },
        _sum: { size: true, optimizedSize: true, thumbnailSize: true },
      }),
    ]);

    const sum3 = (agg: { _sum: { size?: bigint | null; optimizedSize?: bigint | null; thumbnailSize?: bigint | null } }) =>
      Number(agg._sum.size || 0) +
      Number(agg._sum.optimizedSize || 0) +
      Number(agg._sum.thumbnailSize || 0);

    return {
      projects: sum3(albumAgg),
      campaigns: Number(postMediaAgg._sum.size || 0),
      libraries: Number(libAgg._sum.size || 0),
      archives: Number(exportAgg._sum.size || 0),
      trash: sum3(trashAgg),
    };
  }

  async getAllUserItems(userId: string): Promise<any[]> {
    const [jobs, albumItems, trashItems, exportTasks, libraryItems, workflowItems, postMedia] = await Promise.all([
      this.prisma.job.findMany({ where: { userId } }),
      this.prisma.albumItem.findMany({ where: { userId } }),
      this.prisma.trashItem.findMany({ where: { userId } }),
      this.prisma.exportTask.findMany({ where: { userId } }),
      this.prisma.libraryItem.findMany({ where: { library: { userId } } }),
      this.prisma.workflowItem.findMany({ where: { project: { userId } } }),
      this.prisma.postMedia.findMany({
        where: { post: { userId } },
        include: { post: { select: { campaignId: true } } },
      }),
    ]);

    return [
      ...jobs.map((j) => ({ ...this.mapJob(j), _type: 'JOB', projectId: j.projectId })),
      ...albumItems.map((a) => ({ ...this.mapAlbumItem(a), _type: 'ALBUM', projectId: a.projectId })),
      ...trashItems.map((t) => ({ ...this.mapTrashItem(t), _type: 'TRASH', projectId: t.projectId })),
      ...exportTasks.map((e) => ({ ...this.mapExportTask(e), _type: 'EXPORT', projectId: e.projectId ?? undefined })),
      ...libraryItems.map((l) => ({ ...this.mapLibItem(l), _type: 'LIBRARY_ITEM' })),
      ...workflowItems.map((w) => ({ ...this.mapWorkflow(w), _type: 'WORKFLOW_ITEM', projectId: w.projectId })),
      ...postMedia.map((m) => ({
        id: m.id,
        postId: m.postId,
        campaignId: m.post.campaignId,
        sourceUrl: m.sourceUrl ?? undefined,
        processedUrl: m.processedUrl ?? undefined,
        thumbnailUrl: m.thumbnailUrl ?? undefined,
        size: m.size != null ? Number(m.size) : 0,
        _type: 'POST_MEDIA',
      })),
    ];
  }

  private mapTrashItem(t: any): TrashItem {
    return {
      id: t.id,
      jobId: t.jobId ?? '',
      prompt: t.prompt ?? '',
      textContent: t.textContent ?? undefined,
      imageContexts: (t.imageContexts as string[]) ?? [],
      videoContexts: (t.videoContexts as string[]) ?? [],
      audioContexts: (t.audioContexts as string[]) ?? [],
      imageUrl: t.imageUrl ?? '',
      thumbnailUrl: t.thumbnailUrl ?? undefined,
      optimizedUrl: t.optimizedUrl ?? undefined,
      providerId: t.providerId ?? undefined,
      modelConfigId: t.modelConfigId ?? undefined,
      aspectRatio: t.aspectRatio ?? undefined,
      quality: t.quality ?? undefined,
      format: t.format as any ?? undefined,
      duration: t.duration ?? undefined,
      resolution: t.resolution ?? undefined,
      size: t.size != null ? Number(t.size) : undefined,
      optimizedSize: t.optimizedSize != null ? Number(t.optimizedSize) : undefined,
      thumbnailSize: t.thumbnailSize != null ? Number(t.thumbnailSize) : undefined,
      createdAt: t.createdAt.getTime(),
      projectId: t.projectId,
      projectName: t.projectName,
      deletedAt: t.deletedAt.getTime(),
    };
  }

  private mapLibItem(l: any): any {
    return {
      id: l.id,
      content: l.content,
      title: l.title ?? undefined,
      tags: (l.tags as string[]) ?? [],
      order: l.order ?? undefined,
      thumbnailUrl: l.thumbnailUrl ?? undefined,
      optimizedUrl: l.optimizedUrl ?? undefined,
      size: l.size != null ? Number(l.size) : undefined,
    };
  }

  private async saveJobs(userId: string, projectId: string, jobs: Job[]): Promise<void> {
    await this.assertOwnedProject(userId, projectId);

    for (const job of jobs) {
      const createData = {
        id: job.id,
        projectId,
        userId,
        prompt: job.prompt,
        status: job.status ?? 'pending',
        imageContexts: job.imageContexts ?? [],
        videoContexts: job.videoContexts ?? [],
        audioContexts: job.audioContexts ?? [],
        imageUrl: job.imageUrl ?? null,
        thumbnailUrl: job.thumbnailUrl ?? null,
        optimizedUrl: job.optimizedUrl ?? null,
        resultText: job.resultText ?? null,
        error: job.error ?? null,
        modelConfigId: job.modelConfigId ?? null,
        aspectRatio: job.aspectRatio ?? null,
        quality: job.quality ?? null,
        format: job.format ?? null,
        duration: job.duration ?? null,
        resolution: job.resolution ?? null,
        sound: job.sound ?? null,
        background: (job as any).background ?? null,
        taskId: job.taskId ?? null,
        filename: job.filename ?? null,
        size: job.size != null ? BigInt(job.size) : null,
        createdAt: job.createdAt ? new Date(job.createdAt) : new Date(),
        providerId: job.providerId ?? null,
      };

      const updateData = {
        prompt: job.prompt,
        status: job.status ?? 'pending',
        imageContexts: job.imageContexts ?? [],
        videoContexts: job.videoContexts ?? [],
        audioContexts: job.audioContexts ?? [],
        imageUrl: job.imageUrl ?? null,
        thumbnailUrl: job.thumbnailUrl ?? null,
        optimizedUrl: job.optimizedUrl ?? null,
        resultText: job.resultText ?? null,
        error: job.error ?? null,
        modelConfigId: job.modelConfigId ?? null,
        aspectRatio: job.aspectRatio ?? null,
        quality: job.quality ?? null,
        format: job.format ?? null,
        duration: job.duration ?? null,
        resolution: job.resolution ?? null,
        sound: job.sound ?? null,
        background: (job as any).background ?? null,
        taskId: job.taskId ?? null,
        filename: job.filename ?? null,
        size: job.size != null ? BigInt(job.size) : null,
        providerId: job.providerId ?? null,
      };

      const existing = await this.prisma.job.findUnique({
        where: { id: job.id },
        select: { id: true, userId: true, projectId: true },
      });

      if (existing && (existing.userId !== userId || existing.projectId !== projectId)) {
        throw new Error('Job not found');
      }

      if (existing) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: updateData as any,
        });
      } else {
        await this.prisma.job.create({ data: createData as any });
      }
    }

    // Delete jobs no longer in list
    const newIds = new Set(jobs.map((j) => j.id));
    const dbJobs = await this.prisma.job.findMany({ where: { projectId, userId }, select: { id: true } });
    const toDelete = dbJobs.filter((j) => !newIds.has(j.id)).map((j) => j.id);
    if (toDelete.length) {
      await this.prisma.job.deleteMany({ where: { id: { in: toDelete }, projectId, userId } });
    }
  }

  private async saveWorkflow(userId: string, projectId: string, workflow: WorkflowItem[]): Promise<void> {
    await this.assertOwnedProject(userId, projectId);

    const seenIds = new Set<string>();
    const normalizedWorkflow = workflow.map((item, idx) => {
      const trimmedId = item.id?.trim();
      const id = trimmedId && !seenIds.has(trimmedId) ? trimmedId : crypto.randomUUID();
      seenIds.add(id);
      return {
        ...item,
        id,
        order: item.order ?? idx,
      };
    });

    // Replace all workflow items for the project
    await this.prisma.workflowItem.deleteMany({
      where: {
        projectId,
        project: { userId },
      },
    });
    if (!normalizedWorkflow.length) return;

    await this.prisma.workflowItem.createMany({
      data: normalizedWorkflow.map((item) => ({
        id: item.id,
        projectId,
        type: item.type,
        value: item.value ?? null,
        order: item.order,
        thumbnailUrl: item.thumbnailUrl ?? null,
        optimizedUrl: item.optimizedUrl ?? null,
        selectedTags: this.toNullableJsonArray(item.selectedTags),
        disabled: item.disabled ?? false,
      })),
    });
  }

  private mapJob(j: any): Job {
    return {
      id: j.id,
      prompt: j.prompt,
      status: j.status,
      imageContexts: (j.imageContexts as string[]) ?? [],
      videoContexts: (j.videoContexts as string[]) ?? [],
      audioContexts: (j.audioContexts as string[]) ?? [],
      imageUrl: j.imageUrl ?? undefined,
      thumbnailUrl: j.thumbnailUrl ?? undefined,
      optimizedUrl: j.optimizedUrl ?? undefined,
      error: j.error ?? undefined,
      createdAt: j.createdAt instanceof Date ? j.createdAt.getTime() : j.createdAt,
      providerId: j.providerId ?? undefined,
      modelConfigId: j.modelConfigId ?? undefined,
      aspectRatio: j.aspectRatio ?? undefined,
      quality: j.quality ?? undefined,
      format: j.format as Job['format'] ?? undefined,
      duration: j.duration ?? undefined,
      resolution: j.resolution ?? undefined,
      sound: j.sound ?? undefined,
      background: j.background ?? undefined,
      resultText: j.resultText ?? undefined,
      taskId: j.taskId ?? undefined,
      filename: j.filename ?? undefined,
      size: j.size != null ? Number(j.size) : undefined,
      optimizedSize: j.optimizedSize != null ? Number(j.optimizedSize) : undefined,
      thumbnailSize: j.thumbnailSize != null ? Number(j.thumbnailSize) : undefined,
    };
  }

  private mapWorkflow(w: any): WorkflowItem {
    return {
      id: w.id,
      type: w.type,
      value: w.value ?? '',
      order: w.order,
      thumbnailUrl: w.thumbnailUrl ?? undefined,
      optimizedUrl: w.optimizedUrl ?? undefined,
      selectedTags: (w.selectedTags as string[]) ?? undefined,
      disabled: w.disabled ?? false,
    };
  }

  private mapAlbumItem(a: any): AlbumItem {
    return {
      id: a.id,
      jobId: a.jobId ?? '',
      prompt: a.prompt ?? '',
      textContent: a.textContent ?? undefined,
      imageContexts: (a.imageContexts as string[]) ?? [],
      videoContexts: (a.videoContexts as string[]) ?? [],
      audioContexts: (a.audioContexts as string[]) ?? [],
      imageUrl: a.imageUrl ?? '',
      thumbnailUrl: a.thumbnailUrl ?? undefined,
      optimizedUrl: a.optimizedUrl ?? undefined,
      providerId: a.providerId ?? undefined,
      modelConfigId: a.modelConfigId ?? undefined,
      aspectRatio: a.aspectRatio ?? undefined,
      quality: a.quality ?? undefined,
      format: a.format as AlbumItem['format'] ?? undefined,
      duration: a.duration ?? undefined,
      resolution: a.resolution ?? undefined,
      size: a.size != null ? Number(a.size) : undefined,
      optimizedSize: a.optimizedSize != null ? Number(a.optimizedSize) : undefined,
      thumbnailSize: a.thumbnailSize != null ? Number(a.thumbnailSize) : undefined,
      createdAt: a.createdAt instanceof Date ? a.createdAt.getTime() : a.createdAt,
    };
  }

  private mapExportTask(t: any): any {
    const extra = (t.data as any) ?? {};
    return {
      id: t.id,
      userId: t.userId,
      projectId: t.projectId ?? undefined,
      status: t.status,
      downloadUrl: t.downloadUrl ?? undefined,
      error: t.error ?? undefined,
      size: t.size != null ? Number(t.size) : undefined,
      createdAt: t.createdAt instanceof Date ? t.createdAt.getTime() : t.createdAt,
      expiresAt: t.expiresAt ? (t.expiresAt instanceof Date ? t.expiresAt.getTime() : t.expiresAt) : undefined,
      ...extra,
    };
  }
}

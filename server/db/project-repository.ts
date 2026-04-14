import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { Project, Job, WorkflowItem, AlbumItem, TrashItem } from '../../src/types';

export class ProjectRepository {
  constructor(private prisma: PrismaClient) {}

  private async assertOwnedProject(userId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }
  }

  async getUserProjects(userId: string, page: number = 1, limit: number = 50, sortBy: 'createdAt' | 'totalSize' = 'createdAt'): Promise<{ items: Project[], total: number, page: number, pages: number }> {
    const skip = (page - 1) * limit;

    const [total, projects, allItems] = await Promise.all([
      this.prisma.project.count({ where: { userId } }),
      this.prisma.project.findMany({
        where: { userId },
        ...(sortBy === 'createdAt' ? { skip, take: limit } : {}),
        include: {
          _count: { select: { jobs: true, albumItems: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.getAllUserItems(userId),
    ]);

    // Aggregate sizes by project
    const projectSizes: Record<string, number> = {};
    for (const item of allItems) {
      if (item.projectId && item._type !== 'JOB') {
        const itemSize = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
        projectSizes[item.projectId] = (projectSizes[item.projectId] || 0) + itemSize;
      }
    }

    const mappedProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      type: (p as any).type ?? 'image',
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
      format: p.format as 'png' | 'jpeg' | 'webp' | undefined ?? undefined,
      shuffle: p.shuffle ?? undefined,
      modelConfigId: p.modelConfigId ?? undefined,
      prefix: p.prefix ?? undefined,
      background: (p as any).background ?? undefined,
    }));

    const items = sortBy === 'totalSize'
      ? mappedProjects
          .sort((a, b) => (b.totalSize || 0) - (a.totalSize || 0) || b.createdAt - a.createdAt)
          .slice(skip, skip + limit)
      : mappedProjects;

    return {
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const p = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        jobs: { orderBy: { createdAt: 'asc' } },
        workflowItems: { orderBy: { order: 'asc' } },
        albumItems: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!p) return null;

    return {
      id: p.id,
      name: p.name,
      type: (p as any).type ?? 'image',
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
        type: project.type ?? 'image',
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
      } as any,
    });

    if (project.jobs?.length) await this.saveJobs(userId, project.id, project.jobs);
    if (project.workflow?.length) await this.saveWorkflow(userId, project.id, project.workflow);
  }

  async updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void> {
    await this.assertOwnedProject(userId, projectId);

    const data: any = {};
    if (updates.name !== undefined) data.name = updates.name;
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
      imageContexts: item.imageContexts ?? null,
      videoContexts: item.videoContexts ?? null,
      audioContexts: item.audioContexts ?? null,
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
        imageContexts: item.imageContexts ?? null,
        videoContexts: (item as any).videoContexts ?? null,
        audioContexts: (item as any).audioContexts ?? null,
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
      orderBy: { deletedAt: 'desc' },
    });
    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      projectId: item.projectId,
      projectName: item.projectName,
      jobId: item.jobId ?? undefined,
      prompt: item.prompt ?? undefined,
      textContent: item.textContent ?? undefined,
      imageContexts: (item.imageContexts as string[]) ?? [],
      videoContexts: ((item as any).videoContexts as string[]) ?? [],
      audioContexts: ((item as any).audioContexts as string[]) ?? [],
      imageUrl: item.imageUrl ?? undefined,
      thumbnailUrl: item.thumbnailUrl ?? undefined,
      optimizedUrl: item.optimizedUrl ?? undefined,
      providerId: item.providerId ?? undefined,
      modelConfigId: item.modelConfigId ?? undefined,
      aspectRatio: item.aspectRatio ?? undefined,
      quality: item.quality ?? undefined,
      format: item.format as 'png' | 'jpeg' | 'webp' | undefined ?? undefined,
      size: item.size != null ? Number(item.size) : undefined,
      createdAt: item.createdAt.getTime(),
      deletedAt: item.deletedAt.getTime(),
    }));
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
        imageContexts: trashItem.imageContexts ?? null,
        videoContexts: (trashItem as any).videoContexts ?? null,
        audioContexts: (trashItem as any).audioContexts ?? null,
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
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((t) => this.mapExportTask(t));
  }

  async getAllExportTasks(userId: string, limit: number = 20, cursor?: string): Promise<{ items: any[]; nextCursor?: string }> {
    const tasks = await this.prisma.exportTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (tasks.length > limit) {
      nextCursor = tasks[limit].id;
      tasks.splice(limit);
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
      orderBy: { createdAt: 'desc' },
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



  async getAllUserItems(userId: string): Promise<any[]> {
    const [jobs, albumItems, trashItems, exportTasks, libraryItems, workflowItems] = await Promise.all([
      this.prisma.job.findMany({ where: { userId } }),
      this.prisma.albumItem.findMany({ where: { userId } }),
      this.prisma.trashItem.findMany({ where: { userId } }),
      this.prisma.exportTask.findMany({ where: { userId } }),
      this.prisma.libraryItem.findMany({ where: { library: { userId } } }),
      this.prisma.workflowItem.findMany({ where: { project: { userId } } }),
    ]);

    return [
      ...jobs.map((j) => ({ ...this.mapJob(j), _type: 'JOB', projectId: j.projectId })),
      ...albumItems.map((a) => ({ ...this.mapAlbumItem(a), _type: 'ALBUM', projectId: a.projectId })),
      ...trashItems.map((t) => ({ ...this.mapTrashItem(t), _type: 'TRASH', projectId: t.projectId })),
      ...exportTasks.map((e) => ({ ...this.mapExportTask(e), _type: 'EXPORT', projectId: e.projectId ?? undefined })),
      ...libraryItems.map((l) => ({ ...this.mapLibItem(l), _type: 'LIBRARY_ITEM' })),
      ...workflowItems.map((w) => ({ ...this.mapWorkflow(w), _type: 'WORKFLOW_ITEM', projectId: w.projectId })),
    ];
  }

  private mapTrashItem(t: any): TrashItem {
    return {
      id: t.id,
      jobId: t.jobId ?? undefined,
      prompt: t.prompt ?? undefined,
      textContent: t.textContent ?? undefined,
      imageContexts: (t.imageContexts as string[]) ?? [],
      videoContexts: (t.videoContexts as string[]) ?? [],
      audioContexts: (t.audioContexts as string[]) ?? [],
      imageUrl: t.imageUrl ?? undefined,
      thumbnailUrl: t.thumbnailUrl ?? undefined,
      optimizedUrl: t.optimizedUrl ?? undefined,
      providerId: t.providerId ?? undefined,
      modelConfigId: t.modelConfigId ?? undefined,
      aspectRatio: t.aspectRatio ?? undefined,
      quality: t.quality ?? undefined,
      format: t.format as any ?? undefined,
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
      format: j.format as 'png' | 'jpeg' | 'webp' | 'mp4' | undefined ?? undefined,
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
    };
  }

  private mapAlbumItem(a: any): AlbumItem {
    return {
      id: a.id,
      jobId: a.jobId ?? undefined,
      prompt: a.prompt ?? undefined,
      textContent: a.textContent ?? undefined,
      imageContexts: (a.imageContexts as string[]) ?? [],
      videoContexts: (a.videoContexts as string[]) ?? [],
      audioContexts: (a.audioContexts as string[]) ?? [],
      imageUrl: a.imageUrl ?? undefined,
      thumbnailUrl: a.thumbnailUrl ?? undefined,
      optimizedUrl: a.optimizedUrl ?? undefined,
      providerId: a.providerId ?? undefined,
      modelConfigId: a.modelConfigId ?? undefined,
      aspectRatio: a.aspectRatio ?? undefined,
      quality: a.quality ?? undefined,
      format: a.format as 'png' | 'jpeg' | 'webp' | 'mp4' | undefined ?? undefined,
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

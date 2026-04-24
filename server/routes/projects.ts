import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { QueueManager } from '../queue/queue-manager';
import { ExportManager } from '../queue/export-manager';
import { DeliveryManager } from '../queue/delivery-manager';
import { checkStorageLimit } from '../utils/storage-check';
import { UserRepository } from '../auth/user-repository';
import type { WorkflowItem, Job, Project, LibraryItem } from '../../src/types';

type Variables = { user: JwtPayload };

/** Presign an S3 key if it looks like one (not already a URL), or re-sign an expired presigned URL */
async function presignIfKey(value: string, storage: S3Storage): Promise<string> {
  if (!value || value.startsWith('data:')) return value;
  if (!value.startsWith('http')) {
    return storage.getPresignedUrl(value);
  }
  // If it's a presigned URL that was accidentally stored, extract the key and re-sign
  const key = stripToKey(value, storage.getBucketName());
  if (key && key !== value) {
    return storage.getPresignedUrl(key);
  }
  return value;
}

/** Extract bare S3 key from a presigned URL, or return the value as-is if already a key */
function stripToKey(value: string | undefined, bucket: string): string | undefined {
  if (!value || !value.startsWith('http')) return value;
  try {
    const url = new URL(value);
    // Path-style: /bucket/key (used by MinIO/LocalStack)
    const prefix = `/${bucket}/`;
    if (url.pathname.startsWith(prefix)) {
      return decodeURIComponent(url.pathname.slice(prefix.length));
    }
    // Virtual-hosted style: bucket.host/key (used by AWS S3)
    if (url.hostname.startsWith(`${bucket}.`)) {
      return decodeURIComponent(url.pathname.slice(1));
    }
    return value;
  } catch {
    return value;
  }
}

function basenameFromKey(value: string | undefined): string {
  if (!value) return '';
  const clean = value.split('?')[0];
  return decodeURIComponent(clean.split('/').pop() || clean);
}

function splitFilename(filename: string, fallbackExt?: string): { base: string; ext: string } {
  const trimmed = filename.trim();
  const match = trimmed.match(/^(.*?)(\.[^.\/\\]+)$/);
  if (match && match[1]) return { base: match[1], ext: match[2].slice(1) };
  return { base: trimmed, ext: fallbackExt || '' };
}

/** Sign all S3 keys in a project's jobs, album items, and workflow images with pre-signed URLs */
async function signProjectImages(project: Project, storage: S3Storage): Promise<Project> {
  const jobs = await Promise.all(
    project.jobs.map(async (job) => {
      let size = job.size;
      let optimizedSize = job.optimizedSize;
      let thumbnailSize = job.thumbnailSize;

      if (!size && job.imageUrl) {
        try {
          const s3Size = await storage.getSize(job.imageUrl);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for job ${job.id}:`, e);
        }
      }
      if (!optimizedSize && job.optimizedUrl) {
        try {
          const s3Size = await storage.getSize(job.optimizedUrl);
          if (s3Size) optimizedSize = s3Size;
        } catch (e) {
          console.warn(`Failed to recover optimizedSize for job ${job.id}:`, e);
        }
      }
      if (!thumbnailSize && job.thumbnailUrl) {
        try {
          const s3Size = await storage.getSize(job.thumbnailUrl);
          if (s3Size) thumbnailSize = s3Size;
        } catch (e) {
          console.warn(`Failed to recover thumbnailSize for job ${job.id}:`, e);
        }
      }

      const imageUrl = job.imageUrl ? await presignIfKey(job.imageUrl, storage) : job.imageUrl;
      const thumbnailUrl = job.thumbnailUrl ? await presignIfKey(job.thumbnailUrl, storage) : job.thumbnailUrl;
      const optimizedUrl = job.optimizedUrl ? await presignIfKey(job.optimizedUrl, storage) : job.optimizedUrl;
      const imageContexts = job.imageContexts ? await Promise.all(job.imageContexts.map(ctx => presignIfKey(ctx, storage))) : job.imageContexts;
      const videoContexts = (job as any).videoContexts ? await Promise.all((job as any).videoContexts.map((ctx: string) => presignIfKey(ctx, storage))) : (job as any).videoContexts;
      const audioContexts = (job as any).audioContexts ? await Promise.all((job as any).audioContexts.map((ctx: string) => presignIfKey(ctx, storage))) : (job as any).audioContexts;
      return { ...job, imageUrl, thumbnailUrl, optimizedUrl, imageContexts, videoContexts, audioContexts, size, optimizedSize, thumbnailSize };
    })
  );
  const album = await Promise.all(
    (project.album || []).map(async (item) => {
      let size = item.size;
      let optimizedSize = item.optimizedSize;
      let thumbnailSize = item.thumbnailSize;

      if (!size && item.imageUrl) {
        try {
          const s3Size = await storage.getSize(item.imageUrl);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for album item ${item.id}:`, e);
        }
      }
      if (!optimizedSize && item.optimizedUrl) {
        try {
          const s3Size = await storage.getSize(item.optimizedUrl);
          if (s3Size) optimizedSize = s3Size;
        } catch (e) {
          console.warn(`Failed to recover optimizedSize for album item ${item.id}:`, e);
        }
      }
      if (!thumbnailSize && item.thumbnailUrl) {
        try {
          const s3Size = await storage.getSize(item.thumbnailUrl);
          if (s3Size) thumbnailSize = s3Size;
        } catch (e) {
          console.warn(`Failed to recover thumbnailSize for album item ${item.id}:`, e);
        }
      }

      const imageUrl = await presignIfKey(item.imageUrl, storage);
      const thumbnailUrl = item.thumbnailUrl ? await presignIfKey(item.thumbnailUrl, storage) : item.thumbnailUrl;
      const optimizedUrl = item.optimizedUrl ? await presignIfKey(item.optimizedUrl, storage) : item.optimizedUrl;
      const imageContexts = item.imageContexts ? await Promise.all(item.imageContexts.map(ctx => presignIfKey(ctx, storage))) : item.imageContexts;
      return { ...item, imageUrl, thumbnailUrl, optimizedUrl, imageContexts, size, optimizedSize, thumbnailSize };
    })
  );
  const workflow = await Promise.all(
    (project.workflow || []).map(async (item) => {
      let size = item.size;
      if (!size && (item.type === 'image' || item.type === 'video' || item.type === 'audio') && item.value && !item.value.startsWith('data:')) {
        try {
          const s3Size = await storage.getSize(item.value);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for workflow item ${item.id}:`, e);
        }
      }
      if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
        const value = await presignIfKey(item.value, storage);
        const thumbnailUrl = item.thumbnailUrl ? await presignIfKey(item.thumbnailUrl, storage) : item.thumbnailUrl;
        const optimizedUrl = item.optimizedUrl ? await presignIfKey(item.optimizedUrl, storage) : item.optimizedUrl;
        return { ...item, value, thumbnailUrl, optimizedUrl, size };
      }
      return item;
    })
  );
  return { ...project, jobs, album, workflow };
}

export function createProjectRouter(repository: IRepository, userRepository: UserRepository, storage: S3Storage, exportStorage: S3Storage, queueManager: QueueManager, exportManager: ExportManager, deliveryManager: DeliveryManager) {
  const router = new Hono<{ Variables: Variables }>();

  // NOTE: /rename must be registered before /:id to avoid route shadowing
  router.post('/api/projects/rename', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const oldId = typeof body?.oldId === 'string' ? body.oldId : null;
      const newId = typeof body?.newId === 'string' ? body.newId : null;

      if (!oldId || !newId) return c.json({ error: 'Missing IDs' }, 400);

      const safeOldId = oldId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const safeNewId = newId.replace(/[^a-zA-Z0-9-_]/g, '_');

      const oldPrefix = `${user.userId}/${safeOldId}/`;
      const newPrefix = `${user.userId}/${safeNewId}/`;

      await storage.rename(oldPrefix, newPrefix);

      // Update S3 keys in DB job and album records
      const project = await repository.getProject(user.userId, newId);
      if (project) {
        const updatedJobs = project.jobs.map((job) => {
          const imageContexts = job.imageContexts?.map((ctx) => ctx.startsWith(oldPrefix) ? ctx.replace(oldPrefix, newPrefix) : ctx);
          if (job.imageUrl && job.imageUrl.startsWith(oldPrefix)) {
            return { ...job, imageUrl: job.imageUrl.replace(oldPrefix, newPrefix), imageContexts };
          }
          return imageContexts ? { ...job, imageContexts } : job;
        });
        await repository.updateProject(user.userId, newId, { jobs: updatedJobs });

        // Update album item S3 keys
        for (const item of (project.album || [])) {
          const imageContexts = item.imageContexts?.map((ctx) => ctx.startsWith(oldPrefix) ? ctx.replace(oldPrefix, newPrefix) : ctx);
          if ((item.imageUrl && item.imageUrl.startsWith(oldPrefix)) || imageContexts) {
            await repository.addAlbumItem(user.userId, newId, {
              ...item,
              imageContexts,
              imageUrl: item.imageUrl?.startsWith(oldPrefix) ? item.imageUrl.replace(oldPrefix, newPrefix) : item.imageUrl,
            });
          }
        }
      }

      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/projects/rename]', e);
      return c.json({ error: 'Failed to rename project folder' }, 500);
    }
  });

  router.get('/api/projects', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const page = parseInt(c.req.query('page') || '1', 10);
      const limit = parseInt(c.req.query('limit') || '50', 10);
      const q = c.req.query('q');
      const rawStatus = c.req.query('status');
      const status: 'active' | 'archived' | 'all' | undefined =
        rawStatus === 'archived' || rawStatus === 'all' || rawStatus === 'active' ? rawStatus : undefined;

      const result = await repository.getUserProjects(user.userId, page, limit, q, status);
      const signedItems = await Promise.all(result.items.map((p) => signProjectImages(p, storage)));
      
      return c.json({
        ...result,
        items: signedItems
      });
    } catch (e) {
      console.error('[GET /api/projects]', e);
      return c.json({ error: 'Failed to list projects' }, 500);
    }
  });

  router.get('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Not found' }, 404);
      return c.json(await signProjectImages(project, storage));
    } catch (e) {
      console.error('[GET /api/projects/:id]', e);
      return c.json({ error: 'Failed to get project' }, 500);
    }
  });

  router.post('/api/projects', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const id = typeof body?.id === 'string' ? body.id.trim() : null;
      const name = typeof body?.name === 'string' ? body.name.trim() : null;

      if (!id || !name) return c.json({ error: 'id and name are required' }, 400);
      if (id.length > 128 || name.length > 256) return c.json({ error: 'Field too long' }, 400);

      const projectType: 'image' | 'text' | 'video' | 'audio' =
        body.type === 'text'
          ? 'text'
          : body.type === 'video'
            ? 'video'
            : body.type === 'audio'
              ? 'audio'
              : 'image';
      const projectStatus: 'active' | 'archived' = body.status === 'archived' ? 'archived' : 'active';
      const project = {
        id,
        name,
        type: projectType,
        status: projectStatus,
        createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
        workflow: Array.isArray(body.workflow) ? body.workflow : [],
        jobs: Array.isArray(body.jobs) ? body.jobs : [],
        album: [],
        providerId: typeof body.providerId === 'string' ? body.providerId : undefined,
        modelConfigId: typeof body.modelConfigId === 'string' ? body.modelConfigId : undefined,
        aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined,
        quality: typeof body.quality === 'string' ? body.quality : undefined,
        format: typeof body.format === 'string' ? body.format : undefined,
        shuffle: typeof body.shuffle === 'boolean' ? body.shuffle : undefined,
        prefix: typeof body.prefix === 'string' ? body.prefix.trim() : undefined,
        systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
        duration: typeof body.duration === 'number' ? body.duration : undefined,
        resolution: typeof body.resolution === 'string' ? body.resolution : undefined,
        sound: body.sound === 'on' || body.sound === 'off' ? body.sound : undefined,
        lastQueueCount: typeof body.lastQueueCount === 'number' ? body.lastQueueCount : undefined,
      };

      await repository.createProject(user.userId, project);
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/projects]', e);
      return c.json({ error: 'Failed to create project' }, 500);
    }
  });

  router.put('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const currentProject = await repository.getProject(user.userId, projectId);
      if (!currentProject) return c.json({ error: 'Not found' }, 404);

      const body = await c.req.json();
      const updates: Partial<Project> = {};
      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (body?.status === 'active' || body?.status === 'archived') updates.status = body.status;
      if (Array.isArray(body?.workflow)) {
        // Strip presigned URLs back to bare S3 keys before storing
        const bucket = storage.getBucketName();
        updates.workflow = body.workflow.map((item: WorkflowItem) => {
          if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
            return {
              ...item,
              value: stripToKey(item.value, bucket) || item.value,
              thumbnailUrl: stripToKey(item.thumbnailUrl, bucket),
              optimizedUrl: stripToKey(item.optimizedUrl, bucket),
            };
          }
          return item;
        });
      }
      if (Array.isArray(body?.jobs)) {
        const bucket = storage.getBucketName();
        updates.jobs = body.jobs.map((job: Job) => {
          const imageContexts = job.imageContexts 
            ? job.imageContexts.map(ctx => stripToKey(ctx, bucket) || ctx)
            : job.imageContexts;
          const videoContexts = job.videoContexts
            ? job.videoContexts.map(ctx => stripToKey(ctx, bucket) || ctx)
            : job.videoContexts;
          const audioContexts = job.audioContexts
            ? job.audioContexts.map(ctx => stripToKey(ctx, bucket) || ctx)
            : job.audioContexts;
          return { ...job, imageContexts, videoContexts, audioContexts };
        });
      }
      if (typeof body?.providerId === 'string') updates.providerId = body.providerId;
      if (typeof body?.aspectRatio === 'string') updates.aspectRatio = body.aspectRatio;
      if (typeof body?.quality === 'string') updates.quality = body.quality;
      if (typeof body?.format === 'string') updates.format = body.format as 'png' | 'jpeg' | 'webp' | 'mp4' | 'wav' | 'mp3' | 'm4a' | 'aac' | 'ogg' | 'webm';
      if (typeof body?.shuffle === 'boolean') updates.shuffle = body.shuffle;
      if (typeof body?.modelConfigId === 'string') updates.modelConfigId = body.modelConfigId;
      if (typeof body?.prefix === 'string') updates.prefix = body.prefix.trim();
      if (typeof body?.systemPrompt === 'string') updates.systemPrompt = body.systemPrompt;
      if (typeof body?.temperature === 'number') updates.temperature = body.temperature;
      if (typeof body?.maxTokens === 'number') updates.maxTokens = body.maxTokens;
      if (typeof body?.duration === 'number') updates.duration = body.duration;
      if (typeof body?.resolution === 'string') updates.resolution = body.resolution;
      if (body?.sound === 'on' || body?.sound === 'off') updates.sound = body.sound;
      if (typeof body?.lastQueueCount === 'number') updates.lastQueueCount = body.lastQueueCount;
      
      // Storage check for new jobs (Drafts)
      if (updates.jobs) {
        const newJobs = updates.jobs.filter(job => !currentProject.jobs.find(cj => cj.id === job.id));
        if (newJobs.length > 0) {
          // Simple estimate: 25MB per image (orig + thumb + opt)
          const estimatedNewSize = newJobs.length * 25 * 1024 * 1024;
          const { allowed, currentUsage, limit } = await checkStorageLimit(
            user.userId, 
            estimatedNewSize, 
            userRepository, 
            storage, 
            exportStorage, 
            repository
          );
          
          if (!allowed) {
            return c.json({ 
              error: `Storage limit exceeded. Cannot add more drafts. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(estimatedNewSize / (1024 * 1024)).toFixed(0)}MB.` 
            }, 403);
          }
        }
      }

      await repository.updateProject(user.userId, projectId, updates);
      return c.json({ success: true });
    } catch (e: any) {
      if (e?.message === 'Project not found' || e?.message === 'Job not found') {
        return c.json({ error: 'Not found' }, 404);
      }
      console.error('[PUT /api/projects/:id]', e);
      return c.json({ error: 'Failed to update project' }, 500);
    }
  });

  router.delete('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const projectPrefix = `${user.userId}/${safeProjectId}/`;

      // 1. Cleanup main project storage (original, optimized, thumbnails)
      try {
        const objects = await storage.listObjects(projectPrefix);
        for (const key of objects) {
          await storage.delete(key);
        }
      } catch (s3Err) {
        console.warn(`[ProjectDelete] Failed to cleanup main storage for project ${projectId}:`, s3Err);
      }

      // 2. Fetch all associated export tasks for S3 cleanup
      try {
        const exports = await repository.getExportTasks(user.userId, projectId);
        for (const task of exports) {
          if (task.s3Key) {
            try {
              await exportStorage.delete(task.s3Key);
            } catch (s3Err) {
              console.warn(`[ProjectDelete] Failed to delete export file ${task.s3Key}:`, s3Err);
            }
          }
          // Note: export task records in DB will be cleaned up by deleteProject if cascaded, 
          // or manually here if they are 'SetNull' records from previous project deletions.
          await repository.deleteExportTask(user.userId, task.id);
        }
      } catch (e) {
        console.warn(`[ProjectDelete] Failed to cleanup exports for project ${projectId}:`, e);
      }

      // 3. Delete the project and any cascading relations in DB
      await repository.deleteProject(user.userId, projectId);

      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id]', e);
      return c.json({ error: 'Failed to delete project and cleanup storage' }, 500);
    }
  });

  router.delete('/api/projects/:id/album/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const itemId = c.req.param('itemId');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      if (!itemId) return c.json({ error: 'Item id is required' }, 400);
      const deleted = await repository.deleteAlbumItem(user.userId, projectId, itemId);
      if (!deleted) return c.json({ error: 'Not found' }, 404);
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id/album/:itemId]', e);
      return c.json({ error: 'Failed to delete album item' }, 500);
    }
  });

  router.patch('/api/projects/:id/album/:itemId/filename', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const itemId = c.req.param('itemId');
      const body = await c.req.json().catch(() => ({}));
      const requested = typeof body.filename === 'string' ? body.filename.trim() : '';
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      if (!itemId) return c.json({ error: 'Item id is required' }, 400);
      if (!requested) return c.json({ error: 'Filename is required' }, 400);
      if (/[\/\\]/.test(requested)) return c.json({ error: 'Filename cannot contain path separators' }, 400);

      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);
      const item = (project.album || []).find((albumItem) => albumItem.id === itemId);
      if (!item) return c.json({ error: 'Album item not found' }, 404);

      const currentName = basenameFromKey(stripToKey(item.imageUrl, storage.getBucketName()));
      const currentParts = splitFilename(currentName, item.format);
      const requestedParts = splitFilename(requested, currentParts.ext);
      const normalizedFilename = currentParts.ext ? `${requestedParts.base}.${currentParts.ext}` : requestedParts.base;
      const duplicate = (project.album || []).some((albumItem) => {
        if (albumItem.id === itemId) return false;
        const name = basenameFromKey(stripToKey(albumItem.imageUrl, storage.getBucketName()));
        return name.trim().toLowerCase() === normalizedFilename.toLowerCase();
      });
      if (duplicate) return c.json({ error: 'Filename already exists in this album' }, 409);

      const updates: Partial<typeof item> = {};
      const mainKey = stripToKey(item.imageUrl, storage.getBucketName());
      if (mainKey && !mainKey.startsWith('http') && !mainKey.startsWith('data:') && currentParts.base && requestedParts.base !== currentParts.base) {
        const renameKey = async (value?: string) => {
          const key = stripToKey(value, storage.getBucketName());
          if (!key || key.startsWith('http') || key.startsWith('data:')) return value;
          const keyBasename = basenameFromKey(key);
          const dir = key.slice(0, key.length - keyBasename.length);
          if (!keyBasename.startsWith(currentParts.base)) return value;
          const renamedKey = `${dir}${requestedParts.base}${keyBasename.slice(currentParts.base.length)}`;
          await storage.copy(key, renamedKey);
          await storage.delete(key);
          return renamedKey;
        };
        updates.imageUrl = await renameKey(item.imageUrl);
        updates.thumbnailUrl = await renameKey(item.thumbnailUrl);
        updates.optimizedUrl = await renameKey(item.optimizedUrl);
      }

      const updated = { ...item, ...updates };
      await repository.addAlbumItem(user.userId, projectId, updated);
      return c.json({
        ...updated,
        imageUrl: updated.imageUrl ? await presignIfKey(updated.imageUrl, storage) : updated.imageUrl,
        thumbnailUrl: updated.thumbnailUrl ? await presignIfKey(updated.thumbnailUrl, storage) : updated.thumbnailUrl,
        optimizedUrl: updated.optimizedUrl ? await presignIfKey(updated.optimizedUrl, storage) : updated.optimizedUrl,
      });
    } catch (e) {
      console.error('[PATCH /api/projects/:id/album/:itemId/filename]', e);
      return c.json({ error: 'Failed to rename album item' }, 500);
    }
  });

  /**
   * POST /api/projects/:id/album/copy-to-library
   *
   * Copy selected album items to a matching library.
   */
  router.post('/api/projects/:id/album/copy-to-library', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const body = await c.req.json();
      
      const itemIds: string[] = body.itemIds || [];
      const version: 'raw' | 'optimized' = body.version || 'optimized';
      const destinationLibraryId: string | undefined = body.destinationLibraryId;
      const newLibraryName: string | undefined = body.newLibraryName;

      if (!itemIds.length) {
        return c.json({ error: 'No items selected' }, 400);
      }
      if (!destinationLibraryId && !newLibraryName) {
        return c.json({ error: 'destinationLibraryId or newLibraryName is required' }, 400);
      }

      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);
      const targetLibraryType =
        project.type === 'text'
          ? 'text'
          : project.type === 'video'
            ? 'video'
            : project.type === 'audio'
              ? 'audio'
              : 'image';

      const itemsToCopy = (project.album || []).filter(item => itemIds.includes(item.id));
      if (itemsToCopy.length === 0) return c.json({ error: 'No matching items found' }, 400);

      const bucket = storage.getBucketName();

      let requiredSize = 0;
      if (targetLibraryType === 'image' || targetLibraryType === 'video' || targetLibraryType === 'audio') {
        for (const item of itemsToCopy) {
          if (targetLibraryType === 'audio' || version === 'raw') {
            requiredSize += Number(item.size) || 0;
          } else {
            requiredSize += Number(item.optimizedSize || item.size) || 0;
          }
          if (targetLibraryType !== 'audio') {
            requiredSize += Number(item.thumbnailSize) || 0;
          }
        }
      }

      if (requiredSize > 0) {
        const { allowed, currentUsage, limit } = await checkStorageLimit(
          user.userId,
          requiredSize,
          userRepository,
          storage,
          exportStorage,
          repository
        );

        if (!allowed) {
          return c.json({
            error: `Storage limit exceeded. Cannot copy to library. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(requiredSize / (1024 * 1024)).toFixed(1)}MB.`
          }, 403);
        }
      }

      let libraryId = destinationLibraryId;

      if (!libraryId) {
        libraryId = randomUUID();
        await repository.createLibrary(user.userId, {
          id: libraryId,
          name: newLibraryName!,
          type: targetLibraryType
        });
      } else {
        const lib = await repository.getLibrary(user.userId, libraryId);
        if (!lib) {
          return c.json({ error: 'Destination library not found' }, 404);
        }
        if (lib.type !== targetLibraryType) {
          return c.json({ error: `Destination must be a ${targetLibraryType} library` }, 400);
        }
      }

      const safeLibraryId = libraryId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const newItems: LibraryItem[] = [];
      
      const jobFilenameMap = new Map<string, string>();
      for (const job of project.jobs) {
        if (job.filename) jobFilenameMap.set(job.id, job.filename);
      }

      if (targetLibraryType === 'text') {
        for (const item of itemsToCopy) {
          const jobFilename = item.jobId ? jobFilenameMap.get(item.jobId) : undefined;
          newItems.push({
            id: randomUUID(),
            title: jobFilename || undefined,
            content: item.textContent || item.prompt || '',
          });
        }
      } else {
        for (const item of itemsToCopy) {
          const sourceMainUrl = targetLibraryType === 'audio'
            ? item.imageUrl
            : version === 'raw'
              ? item.imageUrl
              : (item.optimizedUrl || item.imageUrl);
          const sourceMainKey = stripToKey(sourceMainUrl, bucket);
          const sourceThumbKey = targetLibraryType === 'audio' ? undefined : stripToKey(item.thumbnailUrl, bucket);

          let destMainKey: string | undefined;
          let destThumbKey: string | undefined;
          let basename: string | undefined;

          if (sourceMainKey && !sourceMainKey.startsWith('http') && !sourceMainKey.startsWith('data:')) {
            basename = sourceMainKey.split('/').pop() || sourceMainKey;
            destMainKey = `${user.userId}/${safeLibraryId}/${basename}`;
            await storage.copy(sourceMainKey, destMainKey);
          } else {
            destMainKey = sourceMainKey;
            if (sourceMainKey?.startsWith('http')) {
              try {
                const url = new URL(sourceMainKey);
                basename = url.pathname.split('/').pop();
              } catch {
                basename = undefined;
              }
            }
          }

          if (sourceThumbKey && !sourceThumbKey.startsWith('http') && !sourceThumbKey.startsWith('data:')) {
            const thumbBasename = sourceThumbKey.split('/').pop() || sourceThumbKey;
            destThumbKey = `${user.userId}/${safeLibraryId}/${thumbBasename}`;
            await storage.copy(sourceThumbKey, destThumbKey);
          } else {
            destThumbKey = sourceThumbKey;
          }

          const jobFilename = item.jobId ? jobFilenameMap.get(item.jobId) : undefined;

          newItems.push({
            id: randomUUID(),
            title: basename || jobFilename || undefined,
            content: destMainKey || '',
            thumbnailUrl: destThumbKey,
            optimizedUrl: targetLibraryType === 'audio' ? undefined : (version === 'raw' ? destMainKey : undefined),
            size: targetLibraryType === 'audio' ? item.size : (version === 'raw' ? item.size : (item.optimizedSize || item.size))
          });
        }
      }

      if (newItems.length > 0) {
        await repository.createLibraryItemsBatch(user.userId, libraryId, newItems);
      }

      return c.json({ success: true, libraryId });
    } catch (e) {
      console.error('[POST /api/projects/:id/album/copy-to-library]', e);
      return c.json({ error: 'Failed to copy to library' }, 500);
    }
  });

  /**
   * GET /api/projects/:id/orphans
   *
   * Find S3 files in the project folder that are not referenced by workflow, jobs, or album.
   */
  router.get('/api/projects/:id/orphans', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const projectPrefix = `${user.userId}/${safeProjectId}/`;

      // 1. List all files in S3 for this project
      const allS3Keys = await storage.listObjects(projectPrefix);

      // 2. Collect all referenced keys from database
      const referencedKeys = new Set<string>();

      // From Workflow
      project.workflow.forEach(item => {
        if ((item.type === 'image' || item.type === 'video' || item.type === 'audio') && item.value && !item.value.startsWith('http') && !item.value.startsWith('data:')) {
          referencedKeys.add(item.value);
          if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.add(item.thumbnailUrl);
          if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.add(item.optimizedUrl);
        }
      });

      // From Jobs
      project.jobs.forEach(job => {
        if (job.imageUrl && !job.imageUrl.startsWith('http')) referencedKeys.add(job.imageUrl);
        if (job.thumbnailUrl && !job.thumbnailUrl.startsWith('http')) referencedKeys.add(job.thumbnailUrl);
        if (job.optimizedUrl && !job.optimizedUrl.startsWith('http')) referencedKeys.add(job.optimizedUrl);
        (job.videoContexts || []).forEach((ctx) => {
          if (!ctx.startsWith('http') && !ctx.startsWith('data:')) referencedKeys.add(ctx);
        });
        (job.audioContexts || []).forEach((ctx) => {
          if (!ctx.startsWith('http') && !ctx.startsWith('data:')) referencedKeys.add(ctx);
        });
      });

      // From Album
      project.album.forEach(item => {
        if (item.imageUrl && !item.imageUrl.startsWith('http')) referencedKeys.add(item.imageUrl);
        if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.add(item.thumbnailUrl);
        if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.add(item.optimizedUrl);
      });

      // From Trash items belonging to this project
      const trashItems = await repository.getTrashItems(user.userId);
      trashItems.forEach(item => {
        if (item.projectId === projectId) {
          if (item.imageUrl && !item.imageUrl.startsWith('http')) referencedKeys.add(item.imageUrl);
          if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.add(item.thumbnailUrl);
          if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.add(item.optimizedUrl);
        }
      });

      // 3. Find orphans
      const orphans = allS3Keys.filter(key => !referencedKeys.has(key));

      // 4. Return orphans with pre-signed URLs and metadata
      const result = await Promise.all(orphans.map(async (key) => ({
        key,
        url: await storage.getPresignedUrl(key),
        size: await storage.getSize(key)
      })));

      return c.json(result);
    } catch (e) {
      console.error('[GET /api/projects/:id/orphans]', e);
      return c.json({ error: 'Failed to find orphan files' }, 500);
    }
  });

  /**
   * DELETE /api/projects/:id/orphans/batch
   *
   * Permanently delete selected orphan files from S3.
   */
  router.delete('/api/projects/:id/orphans/batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { keys } = await c.req.json();
      if (!Array.isArray(keys)) return c.json({ error: 'Expected an array of keys' }, 400);

      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const projectPrefix = `${user.userId}/${safeProjectId}/`;

      for (const key of keys) {
        // Security check: ensure the key belongs to this project's folder
        if (key.startsWith(projectPrefix)) {
          await storage.delete(key);
        } else {
          console.warn(`[Security] Attempt to delete S3 key outside project folder: ${key}`);
        }
      }

      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id/orphans/batch]', e);
      return c.json({ error: 'Failed to delete orphan files' }, 500);
    }
  });

  /**
   * POST /api/projects/:id/run
   *
   * Kick off the server-side generation queue for all 'pending' jobs in the project.
   */
  router.post('/api/projects/:id/run', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);

      // Storage check for pending jobs before enqueuing
      const pendingJobsCount = project.jobs.filter(j => j.status === 'pending').length;
      if (pendingJobsCount > 0) {
        // Simple estimate: 25MB per pending image
        const estimatedNewSize = pendingJobsCount * 25 * 1024 * 1024;
        const { allowed, currentUsage, limit } = await checkStorageLimit(
          user.userId, 
          estimatedNewSize, 
          userRepository, 
          storage, 
          exportStorage, 
          repository
        );

        if (!allowed) {
          return c.json({ 
            error: `Storage limit exceeded. Cannot start generation. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(estimatedNewSize / (1024 * 1024)).toFixed(0)}MB.`
          }, 403);
        }
      }

      // We explicitly don't await the queue processing
      queueManager.enqueueProject(user.userId, projectId);

      return c.json({ success: true }, 202);
    } catch (e) {
      console.error('[POST /api/projects/:id/run]', e);
      return c.json({ error: 'Failed to enqueue project tasks' }, 500);
    }
  });

  router.post('/api/poll', authMiddleware, async (c) => {
    try {
      // Trigger a manual poll of all detached tasks across all users
      // This is safe to call multiple times as generators handle their own status
      await queueManager.pollDetachedTasks();
      return c.json({ success: true, message: 'Poll completed' });
    } catch (e) {
      console.error('[POST /api/poll]', e);
      return c.json({ error: 'Failed to trigger poll' }, 500);
    }
  });

  router.post('/api/projects/:id/export', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const body = await c.req.json();
      const itemIds = body.itemIds as string[];
      const packageName = typeof body.packageName === 'string' ? body.packageName : undefined;

      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);

      const itemsToExport = itemIds 
        ? (project.album || []).filter(item => itemIds.includes(item.id))
        : (project.album || []);

      if (itemsToExport.length === 0) return c.json({ error: 'No items to export' }, 400);

      // Estimate the ZIP size using the sum of original image sizes
      // (JPEGs and PNGs are already compressed, so the ZIP will be roughly this size)
      const estimatedZipSize = itemsToExport.reduce((acc, item) => acc + (item.size || 5 * 1024 * 1024), 0);
      const { allowed, currentUsage, limit } = await checkStorageLimit(
        user.userId,
        estimatedZipSize,
        userRepository,
        storage,
        exportStorage,
        repository
      );

      if (!allowed) {
        return c.json({ 
          error: `Storage limit exceeded. Cannot export album. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(estimatedZipSize / (1024 * 1024)).toFixed(1)}MB.` 
        }, 403);
      }

      const taskId = await exportManager.startExport(user.userId, projectId, project.name, itemsToExport, packageName);
      return c.json({ taskId });
    } catch (e) {
      console.error('[POST /api/projects/:id/export]', e);
      return c.json({ error: 'Failed to start export' }, 500);
    }
  });

  router.get('/api/projects/:id/export/:taskId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const taskId = c.req.param('taskId');
      if (!taskId) return c.json({ error: 'Task id is required' }, 400);
      const task = await exportManager.getTask(user.userId, taskId);
      if (!task) return c.json({ error: 'Task not found' }, 404);
      return c.json(task);
    } catch (e) {
      console.error('[GET /api/projects/:id/export/:taskId]', e);
      return c.json({ error: 'Failed to get export status' }, 500);
    }
  });
  
  router.get('/api/exports', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const limit = parseInt(c.req.query('limit') || '20');
      const cursor = c.req.query('cursor');

      const result = await repository.getAllExportTasks(user.userId, limit, cursor);

      // Presign completed tasks on read
      const items = await Promise.all(result.items.map(t => exportManager.presignTask(t)));

      const nextCursor = result.nextCursor;

      return c.json({ items, nextCursor });
    } catch (e) {
      console.error('[GET /api/exports]', e);
      return c.json({ error: 'Failed to list all exports' }, 500);
    }
  });

  router.get('/api/projects/:id/exports', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const exports = await repository.getExportTasks(user.userId, projectId);
      return c.json(exports);
    } catch (e) {
      console.error('[GET /api/projects/:id/exports]', e);
      return c.json({ error: 'Failed to list exports' }, 500);
    }
  });

  /**
   * POST /api/exports/:taskId/upload-to-drive
   *
   * Submit a Drive upload job to the global delivery queue.
   * Returns { deliveryTaskId } immediately — frontend polls GET /api/deliveries/:id.
   */
  router.post('/api/exports/:taskId/upload-to-drive', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const taskId = c.req.param('taskId');

      const task = await repository.getExportTask(user.userId, taskId);
      if (!task) return c.json({ error: 'Export task not found' }, 404);
      if (task.status !== 'completed' || !task.s3Key) {
        return c.json({ error: 'Export is not ready for upload' }, 400);
      }

      // Verify Drive is connected before accepting the job
      const encryptedToken = await userRepository.getGoogleDriveRefreshToken(user.userId);
      if (!encryptedToken) {
        return c.json({ error: 'Google Drive is not connected. Please connect it in Account settings.' }, 400);
      }
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return c.json({ error: 'Google OAuth is not configured' }, 500);
      }

      const deliveryTaskId = await deliveryManager.startDelivery(user.userId, taskId, 'drive');
      return c.json({ deliveryTaskId }, 202);
    } catch (e) {
      console.error('[POST /api/exports/:taskId/upload-to-drive]', e);
      return c.json({ error: 'Failed to submit Drive upload job' }, 500);
    }
  });

  /**
   * GET /api/deliveries/:id
   *
   * Poll the status of a delivery task (Drive upload).
   */
  router.get('/api/deliveries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const deliveryId = c.req.param('id');
      const task = await deliveryManager.getTask(user.userId, deliveryId);
      if (!task) return c.json({ error: 'Delivery task not found' }, 404);
      return c.json(task);
    } catch (e) {
      console.error('[GET /api/deliveries/:id]', e);
      return c.json({ error: 'Failed to get delivery status' }, 500);
    }
  });

  router.get('/api/deliveries', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const tasks = await repository.listActiveDeliveryTasks(user.userId);
      return c.json(tasks);
    } catch (e) {
      console.error('[GET /api/deliveries]', e);
      return c.json({ error: 'Failed to list delivery tasks' }, 500);
    }
  });


  router.delete('/api/exports/:taskId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const taskId = c.req.param('taskId');
      // Fetch task to get s3Key for S3 cleanup
      const task = await repository.getExportTask(user.userId, taskId);
      if (task?.s3Key) {
        try { await exportStorage.delete(task.s3Key); } catch (s3Err) {
          console.warn(`[ExportManager] Failed to delete S3 file ${task.s3Key}:`, s3Err);
        }
      }
      await repository.deleteExportTask(user.userId, taskId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/exports/:taskId]', e);
      return c.json({ error: 'Failed to delete export task' }, 500);
    }
  });

  return router;
}

import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { QueueManager } from '../queue/queue-manager';
import { ExportManager } from '../queue/export-manager';
import { checkStorageLimit } from '../utils/storage-check';
import { UserRepository } from '../auth/user-repository';
import type { WorkflowItem, Job, Project } from '../../src/types';

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
      return { ...job, imageUrl, thumbnailUrl, optimizedUrl, size, optimizedSize, thumbnailSize };
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
      return { ...item, imageUrl, thumbnailUrl, optimizedUrl, size, optimizedSize, thumbnailSize };
    })
  );
  const workflow = await Promise.all(
    (project.workflow || []).map(async (item) => {
      let size = item.size;
      if (!size && item.type === 'image' && item.value && !item.value.startsWith('data:')) {
        try {
          const s3Size = await storage.getSize(item.value);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for workflow item ${item.id}:`, e);
        }
      }
      if (item.type === 'image') {
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

export function createProjectRouter(repository: IRepository, userRepository: UserRepository, storage: S3Storage, exportStorage: S3Storage, queueManager: QueueManager, exportManager: ExportManager) {
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
          if (job.imageUrl && job.imageUrl.startsWith(oldPrefix)) {
            return { ...job, imageUrl: job.imageUrl.replace(oldPrefix, newPrefix) };
          }
          return job;
        });
        await repository.updateProject(user.userId, newId, { jobs: updatedJobs });

        // Update album item S3 keys
        for (const item of (project.album || [])) {
          if (item.imageUrl && item.imageUrl.startsWith(oldPrefix)) {
            await repository.addAlbumItem(user.userId, newId, {
              ...item,
              imageUrl: item.imageUrl.replace(oldPrefix, newPrefix),
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

      const result = await repository.getUserProjects(user.userId, page, limit);
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
      const project = await repository.getProject(user.userId, c.req.param('id'));
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

      const project = {
        id,
        name,
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
      const body = await c.req.json();
      const updates: { name?: string; workflow?: WorkflowItem[]; jobs?: Job[]; providerId?: string; aspectRatio?: string; quality?: string; format?: 'png' | 'jpeg' | 'webp'; shuffle?: boolean; modelConfigId?: string; prefix?: string } = {};
      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (Array.isArray(body?.workflow)) {
        // Strip presigned URLs back to bare S3 keys before storing
        const bucket = storage.getBucketName();
        updates.workflow = body.workflow.map((item: WorkflowItem) => {
          if (item.type === 'image') {
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
      if (Array.isArray(body?.jobs)) updates.jobs = body.jobs;
      if (typeof body?.providerId === 'string') updates.providerId = body.providerId;
      if (typeof body?.aspectRatio === 'string') updates.aspectRatio = body.aspectRatio;
      if (typeof body?.quality === 'string') updates.quality = body.quality;
      if (typeof body?.format === 'string') updates.format = body.format as 'png' | 'jpeg' | 'webp';
      if (typeof body?.shuffle === 'boolean') updates.shuffle = body.shuffle;
      if (typeof body?.modelConfigId === 'string') updates.modelConfigId = body.modelConfigId;
      if (typeof body?.prefix === 'string') updates.prefix = body.prefix.trim();
      
      // Storage check for new jobs (Drafts)
      if (updates.jobs) {
        const currentProject = await repository.getProject(user.userId, c.req.param('id'));
        if (currentProject) {
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
      }

      await repository.updateProject(user.userId, c.req.param('id'), updates);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/projects/:id]', e);
      return c.json({ error: 'Failed to update project' }, 500);
    }
  });

  router.delete('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
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
      await repository.deleteAlbumItem(user.userId, c.req.param('id'), c.req.param('itemId'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id/album/:itemId]', e);
      return c.json({ error: 'Failed to delete album item' }, 500);
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
        if (item.type === 'image' && item.value && !item.value.startsWith('http') && !item.value.startsWith('data:')) {
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

      const safeProjectId = c.req.param('id').replace(/[^a-zA-Z0-9-_]/g, '_');
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
      const body = await c.req.json();
      const itemIds = body.itemIds as string[];

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

      const taskId = await exportManager.startExport(user.userId, projectId, project.name, itemsToExport);
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
      const exports = await repository.getExportTasks(user.userId, projectId);
      return c.json(exports);
    } catch (e) {
      console.error('[GET /api/projects/:id/exports]', e);
      return c.json({ error: 'Failed to list exports' }, 500);
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

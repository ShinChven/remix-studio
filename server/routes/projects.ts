import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { QueueManager } from '../queue/queue-manager';
import { ExportManager } from '../queue/export-manager';
import type { WorkflowItem, Job, Project } from '../../src/types';

type Variables = { user: JwtPayload };

/** Presign an S3 key if it looks like one (not already a URL) */
async function presignIfKey(value: string, storage: S3Storage): Promise<string> {
  if (value && !value.startsWith('http') && !value.startsWith('data:')) {
    return storage.getPresignedUrl(value);
  }
  return value;
}

/** Sign all S3 keys in a project's jobs, album items, and workflow images with pre-signed URLs */
async function signProjectImages(project: Project, storage: S3Storage): Promise<Project> {
  const jobs = await Promise.all(
    project.jobs.map(async (job) => {
      let size = job.size;
      if (!size && job.imageUrl) {
        try {
          const s3Size = await storage.getSize(job.imageUrl);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for job ${job.id}:`, e);
        }
      }
      const imageUrl = job.imageUrl ? await presignIfKey(job.imageUrl, storage) : job.imageUrl;
      const thumbnailUrl = job.thumbnailUrl ? await presignIfKey(job.thumbnailUrl, storage) : job.thumbnailUrl;
      const optimizedUrl = job.optimizedUrl ? await presignIfKey(job.optimizedUrl, storage) : job.optimizedUrl;
      return { ...job, imageUrl, thumbnailUrl, optimizedUrl, size };
    })
  );
  const album = await Promise.all(
    (project.album || []).map(async (item) => {
      let size = item.size;
      if (!size && item.imageUrl) {
        try {
          const s3Size = await storage.getSize(item.imageUrl);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for album item ${item.id}:`, e);
        }
      }
      const imageUrl = await presignIfKey(item.imageUrl, storage);
      const thumbnailUrl = item.thumbnailUrl ? await presignIfKey(item.thumbnailUrl, storage) : item.thumbnailUrl;
      const optimizedUrl = item.optimizedUrl ? await presignIfKey(item.optimizedUrl, storage) : item.optimizedUrl;
      return { ...item, imageUrl, thumbnailUrl, optimizedUrl, size };
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

export function createProjectRouter(repository: IRepository, storage: S3Storage, queueManager: QueueManager, exportManager: ExportManager) {
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
      const projects = await repository.getUserProjects(user.userId);
      const signed = await Promise.all(projects.map((p) => signProjectImages(p, storage)));
      return c.json(signed);
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
      if (Array.isArray(body?.workflow)) updates.workflow = body.workflow;
      if (Array.isArray(body?.jobs)) updates.jobs = body.jobs;
      if (typeof body?.providerId === 'string') updates.providerId = body.providerId;
      if (typeof body?.aspectRatio === 'string') updates.aspectRatio = body.aspectRatio;
      if (typeof body?.quality === 'string') updates.quality = body.quality;
      if (typeof body?.format === 'string') updates.format = body.format as 'png' | 'jpeg' | 'webp';
      if (typeof body?.shuffle === 'boolean') updates.shuffle = body.shuffle;
      if (typeof body?.modelConfigId === 'string') updates.modelConfigId = body.modelConfigId;
      if (typeof body?.prefix === 'string') updates.prefix = body.prefix.trim();

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
      await repository.deleteProject(user.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id]', e);
      return c.json({ error: 'Failed to delete project' }, 500);
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

      // 2. Collect all referenced keys from DynamoDB
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
      const projectId = c.req.param('id');
      const taskId = c.req.param('taskId');
      const task = await exportManager.getTask(user.userId, projectId, taskId);
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
      const cursorStr = c.req.query('cursor');
      let exclusiveStartKey: any;
      if (cursorStr) {
        exclusiveStartKey = JSON.parse(Buffer.from(cursorStr, 'base64').toString());
      }
      
      const result = await repository.getAllExportTasks(user.userId, limit, exclusiveStartKey);
      
      let nextCursor: string | undefined;
      if (result.nextCursor) {
        nextCursor = Buffer.from(JSON.stringify(result.nextCursor)).toString('base64');
      }

      return c.json({
        items: result.items,
        nextCursor
      });
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

  router.delete('/api/projects/:id/exports/:taskId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const taskId = c.req.param('taskId');
      await repository.deleteExportTask(user.userId, projectId, taskId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id/exports/:taskId]', e);
      return c.json({ error: 'Failed to delete export task' }, 500);
    }
  });

  return router;
}

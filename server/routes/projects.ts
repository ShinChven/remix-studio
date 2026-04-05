import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { QueueManager } from '../queue/queue-manager';
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
      const imageUrl = job.imageUrl ? await presignIfKey(job.imageUrl, storage) : job.imageUrl;
      const thumbnailUrl = job.thumbnailUrl ? await presignIfKey(job.thumbnailUrl, storage) : job.thumbnailUrl;
      const optimizedUrl = job.optimizedUrl ? await presignIfKey(job.optimizedUrl, storage) : job.optimizedUrl;
      return { ...job, imageUrl, thumbnailUrl, optimizedUrl };
    })
  );
  const album = await Promise.all(
    (project.album || []).map(async (item) => {
      const imageUrl = await presignIfKey(item.imageUrl, storage);
      const thumbnailUrl = item.thumbnailUrl ? await presignIfKey(item.thumbnailUrl, storage) : item.thumbnailUrl;
      const optimizedUrl = item.optimizedUrl ? await presignIfKey(item.optimizedUrl, storage) : item.optimizedUrl;
      return { ...item, imageUrl, thumbnailUrl, optimizedUrl };
    })
  );
  const workflow = await Promise.all(
    (project.workflow || []).map(async (item) => {
      if (item.type === 'image') {
        const value = await presignIfKey(item.value, storage);
        const thumbnailUrl = item.thumbnailUrl ? await presignIfKey(item.thumbnailUrl, storage) : item.thumbnailUrl;
        const optimizedUrl = item.optimizedUrl ? await presignIfKey(item.optimizedUrl, storage) : item.optimizedUrl;
        return { ...item, value, thumbnailUrl, optimizedUrl };
      }
      return item;
    })
  );
  return { ...project, jobs, album, workflow };
}

export function createProjectRouter(repository: IRepository, storage: S3Storage, queueManager: QueueManager) {
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
      const updates: { name?: string; workflow?: WorkflowItem[]; jobs?: Job[]; providerId?: string; aspectRatio?: string; quality?: string; format?: 'png' | 'jpeg' | 'webp'; shuffle?: boolean; modelConfigId?: string } = {};
      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (Array.isArray(body?.workflow)) updates.workflow = body.workflow;
      if (Array.isArray(body?.jobs)) updates.jobs = body.jobs;
      if (typeof body?.providerId === 'string') updates.providerId = body.providerId;
      if (typeof body?.aspectRatio === 'string') updates.aspectRatio = body.aspectRatio;
      if (typeof body?.quality === 'string') updates.quality = body.quality;
      if (typeof body?.format === 'string') updates.format = body.format as 'png' | 'jpeg' | 'webp';
      if (typeof body?.shuffle === 'boolean') updates.shuffle = body.shuffle;
      if (typeof body?.modelConfigId === 'string') updates.modelConfigId = body.modelConfigId;

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

  return router;
}

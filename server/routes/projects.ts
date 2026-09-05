import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { QueueManager } from '../queue/queue-manager';
import { ExportManager } from '../queue/export-manager';
import { DeliveryManager } from '../queue/delivery-manager';
import { ProjectImportManager } from '../queue/project-import-manager';
import {
  ProjectExportError,
  startProjectAlbumExport,
  startProjectBundleExport,
} from '../services/project-export';
import { checkStorageLimit } from '../utils/storage-check';
import { normalizeWorkflowForStorage, stripToKey } from '../utils/storage-keys';
import { UserRepository } from '../auth/user-repository';
import type { WorkflowItem, Job, Project, LibraryItem, QueueMonitorView, AlbumItem, AlbumItemSort } from '../../src/types';
import type { ProjectEventPublisher, ProjectLiveEventReason } from '../live/project-live-hub';
import { normalizePostWatermarkPayload, postWatermarkSettingSchema } from '../utils/watermark';

type Variables = { user: JwtPayload };

/** Storage round trips kept in flight at once by the album move. */
const STORAGE_CONCURRENCY = 16;

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

/**
 * Strip presigned URLs back to bare S3 keys on everything a job carries: its
 * media contexts and the workflow snapshot kept for "reuse". The snapshot is
 * read back weeks later, so storing a signed URL would hand the reuse flow a
 * link that has long since expired.
 */
function normalizeJobsForStorage(jobs: Job[], bucket: string): Job[] {
  return jobs.map((job) => {
    const imageContexts = job.imageContexts
      ? job.imageContexts.map(ctx => stripToKey(ctx, bucket) || ctx)
      : job.imageContexts;
    const videoContexts = job.videoContexts
      ? job.videoContexts.map(ctx => stripToKey(ctx, bucket) || ctx)
      : job.videoContexts;
    const audioContexts = job.audioContexts
      ? job.audioContexts.map(ctx => stripToKey(ctx, bucket) || ctx)
      : job.audioContexts;
    const workflowSnapshot = job.workflowSnapshot
      ? normalizeWorkflowForStorage(job.workflowSnapshot, bucket)
      : job.workflowSnapshot;
    return { ...job, imageContexts, videoContexts, audioContexts, workflowSnapshot };
  });
}

/**
 * Rebuild a one-combination workflow from a finished result's own prompt and
 * media references. Used when the job behind a result predates workflow
 * snapshots (or lost its snapshot to an older bulk-save bug): reusing it
 * reproduces exactly that result rather than the recipe that varied it, so
 * callers are told the workflow was reconstructed.
 */
function reconstructWorkflowSnapshot(source: {
  prompt?: string;
  imageContexts?: string[];
  videoContexts?: string[];
  audioContexts?: string[];
}): WorkflowItem[] {
  const items: WorkflowItem[] = [];
  // Fresh ids: these become real workflow items on the project the moment the
  // user confirms, and must not collide with anything already stored.
  const push = (type: WorkflowItem['type'], value: string) => {
    items.push({ id: randomUUID(), type, value, order: items.length });
  };

  const prompt = source.prompt?.trim();
  if (prompt) push('text', prompt);
  source.imageContexts?.forEach((value) => value && push('image', value));
  source.videoContexts?.forEach((value) => value && push('video', value));
  source.audioContexts?.forEach((value) => value && push('audio', value));

  return items;
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

export async function signJobs(jobs: Job[], storage: S3Storage): Promise<Job[]> {
  return Promise.all(
    jobs.map(async (job) => {
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
}

const ALBUM_ITEM_SORTS: AlbumItemSort[] = ['newest', 'oldest', 'name-asc', 'name-desc'];

/**
 * Read the album tag filter from a request — a comma-separated `tags` query
 * param on reads, or a `filterTags` array on the batch write body — plus how
 * multiple tags combine. Defaults to `all` (an item must carry every tag).
 */
function readAlbumTagFilter(
  c: { req: { query: (name: string) => string | undefined } },
  body?: any,
): { tags?: string[]; tagMatch: 'all' | 'any' } {
  const raw = body ? body.filterTags : c.req.query('tags');
  const parsed = typeof raw === 'string'
    ? raw.split(',')
    : Array.isArray(raw) ? raw : [];
  const tags = parsed
    .filter((tag: unknown): tag is string => typeof tag === 'string')
    .map((tag: string) => tag.trim())
    .filter(Boolean);
  const matchRaw = body ? body.tagMatch : c.req.query('tagMatch');
  return { tags: tags.length > 0 ? tags : undefined, tagMatch: matchRaw === 'any' ? 'any' : 'all' };
}

export async function signAlbumItems(album: AlbumItem[], storage: S3Storage): Promise<AlbumItem[]> {
  return Promise.all(
    album.map(async (item) => {
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
}

export async function signWorkflowItems(workflow: WorkflowItem[], storage: S3Storage): Promise<WorkflowItem[]> {
  return Promise.all(
    workflow.map(async (item) => {
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
}

/**
 * Run an async job over every entry with a bounded number in flight. The album
 * move touches three storage objects per item, so a selection of a few hundred
 * is thousands of round trips — sequentially that is minutes, and unbounded
 * `Promise.all` opens thousands of sockets at once.
 */
async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  run: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await run(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Whether a storage error means the object is not there, as opposed to the
 * request being refused or failing in transit. `S3Storage.exists` cannot tell
 * the two apart — it answers false for any error — and treating a throttled
 * HeadObject as "missing" would strand a file in the source folder.
 */
function isMissingObjectError(error: unknown): boolean {
  const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const name = err?.name || err?.Code;
  return name === 'NoSuchKey' || name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;
}

/**
 * Plan where each storage object behind a moved album item lands in the
 * destination project's folder.
 *
 * Keys are grouped by stem — `name.png`, `name.thumb.jpg` and `name.opt.jpg`
 * are one group — so a name already taken in the destination folder renames
 * the whole group together. The filename endpoint derives an item's thumbnail
 * and optimized keys from its main one, and would stop finding them if the
 * three drifted apart.
 */
async function planAlbumStorageMoves(
  keys: string[],
  sourcePrefix: string,
  destinationPrefix: string,
  storage: S3Storage,
): Promise<Record<string, string>> {
  type MoveGroup = { dir: string; stem: string; members: { key: string; suffix: string }[] };
  const groups = new Map<string, MoveGroup>();

  for (const key of keys) {
    if (!key.startsWith(sourcePrefix)) continue;
    const rest = key.slice(sourcePrefix.length);
    if (!rest) continue;
    const slash = rest.lastIndexOf('/');
    const dir = slash >= 0 ? rest.slice(0, slash + 1) : '';
    const base = slash >= 0 ? rest.slice(slash + 1) : rest;
    const dot = base.indexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const suffix = dot > 0 ? base.slice(dot) : '';
    const groupKey = `${dir}${stem}`;
    const group = groups.get(groupKey) ?? { dir, stem, members: [] };
    if (!group.members.some((member) => member.key === key)) group.members.push({ key, suffix });
    groups.set(groupKey, group);
  }

  const keyMap: Record<string, string> = {};
  const claimed = new Set<string>();

  for (const group of groups.values()) {
    let chosenStem: string | null = null;
    for (let attempt = 1; attempt <= 50; attempt++) {
      const candidate = attempt === 1 ? group.stem : `${group.stem}_${attempt}`;
      const paths = group.members.map((member) => `${destinationPrefix}${group.dir}${candidate}${member.suffix}`);
      if (paths.some((path) => claimed.has(path))) continue;
      const existing = await Promise.all(paths.map((path) => storage.exists(path)));
      if (existing.some(Boolean)) continue;
      chosenStem = candidate;
      break;
    }
    // Fifty taken names in one folder is not a case worth another round trip.
    if (!chosenStem) chosenStem = `${group.stem}_${randomUUID().slice(0, 8)}`;

    for (const member of group.members) {
      const destination = `${destinationPrefix}${group.dir}${chosenStem}${member.suffix}`;
      claimed.add(destination);
      keyMap[member.key] = destination;
    }
  }

  return keyMap;
}

export function createProjectRouter(repository: IRepository, userRepository: UserRepository, storage: S3Storage, exportStorage: S3Storage, queueManager: QueueManager, exportManager: ExportManager, deliveryManager: DeliveryManager, projectImportManager: ProjectImportManager, prisma: PrismaClient, projectEvents?: ProjectEventPublisher) {
  const router = new Hono<{ Variables: Variables }>();

  const exportDeps = { repository, userRepository, storage, exportStorage, exportManager };

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
        // Targeted rewrite — must NOT go through saveJobs, which now refuses
        // to overwrite server-controlled fields like imageUrl.
        await repository.rewriteJobStorageKeys(user.userId, newId, oldPrefix, newPrefix);

        const rewritePrefixedKey = (value?: string) => (
          value?.startsWith(oldPrefix) ? value.replace(oldPrefix, newPrefix) : value
        );
        const rewritePrefixedKeys = (values?: string[]) => {
          if (!values) return values;
          let changed = false;
          const rewritten = values.map((value) => {
            const next = rewritePrefixedKey(value);
            if (next !== value) changed = true;
            return next || value;
          });
          return changed ? rewritten : values;
        };

        // Update album item S3 keys
        const albumItems = await repository.getAllProjectAlbumItems(user.userId, newId);
        for (const item of albumItems) {
          const imageContexts = rewritePrefixedKeys(item.imageContexts);
          const videoContexts = rewritePrefixedKeys(item.videoContexts);
          const audioContexts = rewritePrefixedKeys(item.audioContexts);
          const imageUrl = rewritePrefixedKey(item.imageUrl);
          const thumbnailUrl = rewritePrefixedKey(item.thumbnailUrl);
          const optimizedUrl = rewritePrefixedKey(item.optimizedUrl);

          if (
            imageUrl !== item.imageUrl ||
            thumbnailUrl !== item.thumbnailUrl ||
            optimizedUrl !== item.optimizedUrl ||
            imageContexts !== item.imageContexts ||
            videoContexts !== item.videoContexts ||
            audioContexts !== item.audioContexts
          ) {
            await repository.addAlbumItem(user.userId, newId, {
              ...item,
              imageContexts,
              videoContexts,
              audioContexts,
              imageUrl,
              thumbnailUrl,
              optimizedUrl,
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
      const nameOnly = c.req.query('nameOnly') === 'true';

      const result = await repository.getUserProjects(user.userId, page, limit, q, status, nameOnly);
      const signedItems = await Promise.all(
        result.items.map(async (p) => ({
          ...p,
          album: await signAlbumItems(p.album || [], storage),
        }))
      );
      return c.json({
        ...result,
        items: signedItems,
      });
    } catch (e) {
      console.error('[GET /api/projects]', e);
      return c.json({ error: 'Failed to list projects' }, 500);
    }
  });

  router.get('/api/queue-status', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const rawView = c.req.query('view');
      const view: QueueMonitorView = rawView === 'providers' ? 'providers' : 'projects';
      return c.json(await queueManager.getMonitorStatus(user.userId, view));
    } catch (e) {
      console.error('[GET /api/queue-status]', e);
      return c.json({ error: 'Failed to load queue status' }, 500);
    }
  });

  router.delete('/api/queue-status/failed', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.query('projectId')?.trim() || undefined;
      const providerId = c.req.query('providerId')?.trim() || undefined;
      if (projectId && providerId) {
        return c.json({ error: 'Choose projectId or providerId, not both' }, 400);
      }
      return c.json(await queueManager.clearFailedJobs(user.userId, { projectId, providerId }));
    } catch (e) {
      console.error('[DELETE /api/queue-status/failed]', e);
      return c.json({ error: 'Failed to clear failed jobs' }, 500);
    }
  });

  router.get('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Not found' }, 404);
      return c.json(project);
    } catch (e) {
      console.error('[GET /api/projects/:id]', e);
      return c.json({ error: 'Failed to get project' }, 500);
    }
  });

  router.get('/api/projects/:id/workflow', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const items = await repository.getProjectWorkflow(user.userId, projectId);
      return c.json(await signWorkflowItems(items, storage));
    } catch (e) {
      console.error('[GET /api/projects/:id/workflow]', e);
      return c.json({ error: 'Failed to get workflow' }, 500);
    }
  });

  router.get('/api/projects/:id/jobs', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const excludeStatusRaw = c.req.query('excludeStatus');
      const excludeStatus = excludeStatusRaw
        ? excludeStatusRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const jobs = await repository.getProjectJobs(user.userId, projectId, { excludeStatus });
      return c.json(await signJobs(jobs, storage));
    } catch (e) {
      console.error('[GET /api/projects/:id/jobs]', e);
      return c.json({ error: 'Failed to get jobs' }, 500);
    }
  });

  router.get('/api/projects/:id/jobs/completed', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const page = parseInt(c.req.query('page') || '1', 10);
      const limit = parseInt(c.req.query('limit') || '500', 10);
      const sortRaw = c.req.query('sort');
      const sort: 'newest' | 'oldest' = sortRaw === 'oldest' ? 'oldest' : 'newest';
      const result = await repository.getProjectCompletedJobs(user.userId, projectId, { page, limit, sort });
      return c.json({
        ...result,
        items: await signJobs(result.items, storage),
      });
    } catch (e) {
      console.error('[GET /api/projects/:id/jobs/completed]', e);
      return c.json({ error: 'Failed to get completed jobs' }, 500);
    }
  });

  router.get('/api/projects/:id/jobs/:jobId/configuration', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const jobId = c.req.param('jobId');
      if (!projectId || !jobId) return c.json({ error: 'Project id and job id are required' }, 400);

      const job = await repository.getJob(user.userId, projectId, jobId);
      if (!job) return c.json({ error: 'Job not found' }, 404);

      const snapshot = job.workflowSnapshot?.length ? job.workflowSnapshot : null;
      const reconstructed = snapshot ? null : reconstructWorkflowSnapshot(job);

      return c.json({
        workflowSnapshot: await signWorkflowItems(snapshot ?? reconstructed ?? [], storage),
        workflowReconstructed: !snapshot && (reconstructed?.length ?? 0) > 0,
        providerId: job.providerId,
        modelConfigId: job.modelConfigId,
        aspectRatio: job.aspectRatio,
        quality: job.quality,
        background: job.background,
        format: job.format,
        duration: job.duration,
        resolution: job.resolution,
        sound: job.sound,
      });
    } catch (e) {
      console.error('[GET /api/projects/:id/jobs/:jobId/configuration]', e);
      return c.json({ error: 'Failed to get job configuration' }, 500);
    }
  });

  /**
   * GET /api/projects/:id/album/:itemId/configuration
   *
   * Same payload as the job configuration endpoint, resolved from the album
   * item's originating job so a finished result can be reused straight from the
   * album. The workflow snapshot only lives on the job, so when that job is
   * gone — or predates snapshots entirely — the workflow is rebuilt from the
   * item's own prompt and references and flagged as reconstructed; the item's
   * settings fill the rest.
   */
  router.get('/api/projects/:id/album/:itemId/configuration', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const itemId = c.req.param('itemId');
      if (!projectId || !itemId) return c.json({ error: 'Project id and album item id are required' }, 400);

      const item = await repository.getAlbumItem(user.userId, projectId, itemId);
      if (!item) return c.json({ error: 'Album item not found' }, 404);

      const job = item.jobId ? await repository.getJob(user.userId, projectId, item.jobId) : null;

      const snapshot = job?.workflowSnapshot?.length ? job.workflowSnapshot : null;
      const reconstructed = snapshot ? null : reconstructWorkflowSnapshot(item);

      return c.json({
        workflowSnapshot: await signWorkflowItems(snapshot ?? reconstructed ?? [], storage),
        workflowReconstructed: !snapshot && (reconstructed?.length ?? 0) > 0,
        providerId: job?.providerId ?? item.providerId,
        modelConfigId: job?.modelConfigId ?? item.modelConfigId,
        aspectRatio: job?.aspectRatio ?? item.aspectRatio,
        quality: job?.quality ?? item.quality,
        background: job?.background,
        format: job?.format ?? item.format,
        duration: job?.duration ?? item.duration,
        resolution: job?.resolution ?? item.resolution,
        sound: job?.sound,
      });
    } catch (e) {
      console.error('[GET /api/projects/:id/album/:itemId/configuration]', e);
      return c.json({ error: 'Failed to get album item configuration' }, 500);
    }
  });

  router.delete('/api/projects/:id/jobs/:jobId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const jobId = c.req.param('jobId');
      if (!projectId || !jobId) return c.json({ error: 'Project id and job id are required' }, 400);
      await repository.deleteProjectJob(user.userId, projectId, jobId);
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        jobId,
        reason: 'job.deleted',
      });
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id/jobs/:jobId]', e);
      return c.json({ error: 'Failed to delete job' }, 500);
    }
  });

  router.post('/api/projects/:id/jobs/delete-batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const body = await c.req.json().catch(() => ({}));
      const rawJobIds: unknown[] = Array.isArray(body?.jobIds) ? body.jobIds : [];
      const jobIds: string[] = Array.from(new Set(
        rawJobIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      ));
      if (!projectId || jobIds.length === 0) {
        return c.json({ error: 'Project id and jobIds are required' }, 400);
      }

      const deleted = await repository.deleteProjectJobs(user.userId, projectId, jobIds);
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        reason: 'job.deleted',
      });
      return c.json({ success: true, deleted });
    } catch (e) {
      console.error('[POST /api/projects/:id/jobs/delete-batch]', e);
      return c.json({ error: 'Failed to delete jobs' }, 500);
    }
  });

  router.get('/api/projects/:id/album', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const page = parseInt(c.req.query('page') || '1', 10);
      const limit = parseInt(c.req.query('limit') || '500', 10);
      const sortRaw = c.req.query('sort');
      const sort: AlbumItemSort = ALBUM_ITEM_SORTS.includes(sortRaw as AlbumItemSort)
        ? (sortRaw as AlbumItemSort)
        : 'newest';
      const aspectRatiosRaw = c.req.query('aspectRatios');
      const aspectRatios = aspectRatiosRaw
        ? aspectRatiosRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const q = c.req.query('q')?.trim() || undefined;
      const { tags, tagMatch } = readAlbumTagFilter(c);
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const result = await repository.getProjectAlbum(user.userId, projectId, { page, limit, sort, aspectRatios, tags, tagMatch, q });
      return c.json({
        ...result,
        items: await signAlbumItems(result.items, storage)
      });
    } catch (e) {
      console.error('[GET /api/projects/:id/album]', e);
      return c.json({ error: 'Failed to get album' }, 500);
    }
  });

  router.post('/api/projects', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const id = typeof body?.id === 'string' ? body.id.trim() : null;
      const name = typeof body?.name === 'string' ? body.name.trim() : null;
      const description = typeof body?.description === 'string' ? body.description.trim() : undefined;

      if (!id || !name) return c.json({ error: 'id and name are required' }, 400);
      if (id.length > 128 || name.length > 256) return c.json({ error: 'Field too long' }, 400);
      if (description && description.length > 2000) return c.json({ error: 'Description too long' }, 400);

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
        description: description || undefined,
        type: projectType,
        status: projectStatus,
        createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
        workflow: Array.isArray(body.workflow) ? normalizeWorkflowForStorage(body.workflow, storage.getBucketName()) : [],
        jobs: Array.isArray(body.jobs) ? normalizeJobsForStorage(body.jobs, storage.getBucketName()) : [],
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
        showDisabledItems: typeof body.showDisabledItems === 'boolean' ? body.showDisabledItems : undefined,
      };

      await repository.createProject(user.userId, project);
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId: project.id,
        reason: 'project.created',
      });
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
      if (typeof body?.description === 'string') {
        const description = body.description.trim();
        if (description.length > 2000) return c.json({ error: 'Description too long' }, 400);
        (updates as any).description = description || null;
      }
      if (body?.status === 'active' || body?.status === 'archived') updates.status = body.status;
      if (Array.isArray(body?.workflow)) {
        // Strip presigned URLs back to bare S3 keys before storing
        const bucket = storage.getBucketName();
        updates.workflow = normalizeWorkflowForStorage(body.workflow, bucket);
      }
      if (Array.isArray(body?.jobs)) {
        updates.jobs = normalizeJobsForStorage(body.jobs, storage.getBucketName());
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
      if (typeof body?.showDisabledItems === 'boolean') updates.showDisabledItems = body.showDisabledItems;
      
      // Storage check for new jobs (Drafts)
      if (updates.jobs) {
        const existingJobs = await repository.getProjectJobs(user.userId, projectId);
        const existingJobIds = new Set(existingJobs.map((job) => job.id));
        const newJobs = updates.jobs.filter(job => !existingJobIds.has(job.id));
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
      let reason: ProjectLiveEventReason = 'project.updated';
      if (updates.jobs) reason = 'jobs.changed';
      else if (updates.workflow) reason = 'workflow.updated';
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        reason,
      });
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
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        reason: 'project.deleted',
      });

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
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        itemId,
        reason: 'album.deleted',
      });
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
      const albumPage = await repository.getProjectAlbum(user.userId, projectId, { limit: 999999 });
      const albumItems = albumPage.items;
      const item = albumItems.find((albumItem) => albumItem.id === itemId);
      if (!item) return c.json({ error: 'Album item not found' }, 404);

      const currentName = basenameFromKey(stripToKey(item.imageUrl, storage.getBucketName()));
      const currentParts = splitFilename(currentName, item.format);
      const requestedParts = splitFilename(requested, currentParts.ext);
      const normalizedFilename = currentParts.ext ? `${requestedParts.base}.${currentParts.ext}` : requestedParts.base;
      const duplicate = albumItems.some((albumItem) => {
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
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        itemId,
        reason: 'album.renamed',
      });
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
   * GET /api/projects/:id/album/tags
   *
   * Every tag used in the project's album, with how many items carry it.
   */
  router.get('/api/projects/:id/album/tags', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      const tagCounts = await repository.getAlbumTagCounts(user.userId, projectId);
      return c.json({ tagCounts });
    } catch (e) {
      console.error('[GET /api/projects/:id/album/tags]', e);
      return c.json({ error: 'Failed to get album tags' }, 500);
    }
  });

  /**
   * PATCH /api/projects/:id/album/:itemId/tags
   *
   * Replace one album item's tag list.
   */
  router.patch('/api/projects/:id/album/:itemId/tags', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const itemId = c.req.param('itemId');
      const body = await c.req.json().catch(() => ({}));
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);
      if (!itemId) return c.json({ error: 'Item id is required' }, 400);
      if (!Array.isArray(body?.tags)) return c.json({ error: 'tags must be an array of strings' }, 400);

      const updated = await repository.setAlbumItemTags(user.userId, projectId, itemId, body.tags);
      if (!updated) return c.json({ error: 'Album item not found' }, 404);

      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        itemId,
        reason: 'album.tagged',
      });
      const [signed] = await signAlbumItems([updated], storage);
      return c.json(signed);
    } catch (e) {
      console.error('[PATCH /api/projects/:id/album/:itemId/tags]', e);
      return c.json({ error: 'Failed to update album item tags' }, 500);
    }
  });

  /**
   * POST /api/projects/:id/album/tags-batch
   *
   * Add, remove or replace tags across many album items. Scope is either an
   * explicit `itemIds` list or `allAlbumItems: true`, which applies to every
   * item the current filters select.
   */
  router.post('/api/projects/:id/album/tags-batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const body = await c.req.json().catch(() => ({}));
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);

      const allAlbumItems = body?.allAlbumItems === true;
      const itemIds: string[] = Array.isArray(body?.itemIds)
        ? body.itemIds.filter((id: unknown) => typeof id === 'string' && id)
        : [];
      if (!allAlbumItems && itemIds.length === 0) {
        return c.json({ error: 'itemIds is required unless allAlbumItems is true' }, 400);
      }

      const asTagList = (value: unknown) => (Array.isArray(value) ? value : undefined);
      const add = asTagList(body?.add);
      const remove = asTagList(body?.remove);
      const replace = asTagList(body?.replace);
      if (!add && !remove && !replace) {
        return c.json({ error: 'Provide at least one of: add, remove, replace' }, 400);
      }

      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);

      const aspectRatios = typeof body?.aspectRatios === 'string'
        ? body.aspectRatios.split(',').map((r: string) => r.trim()).filter(Boolean)
        : Array.isArray(body?.aspectRatios)
          ? body.aspectRatios.filter((r: unknown): r is string => typeof r === 'string')
          : undefined;
      const { tags: filterTags, tagMatch } = readAlbumTagFilter(c, body);
      const { updated } = await repository.updateAlbumItemsTags(user.userId, projectId, {
        itemIds: allAlbumItems ? undefined : itemIds,
        all: allAlbumItems,
        add,
        remove,
        replace,
        aspectRatios,
        tags: filterTags,
        tagMatch,
      });

      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        reason: 'album.tagged',
      });
      const tagCounts = await repository.getAlbumTagCounts(user.userId, projectId);
      return c.json({ success: true, updated, tagCounts });
    } catch (e) {
      console.error('[POST /api/projects/:id/album/tags-batch]', e);
      return c.json({ error: 'Failed to update album tags' }, 500);
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
      const allAlbumItems: boolean = body.allAlbumItems === true;
      const version: 'raw' | 'optimized' = body.version || 'optimized';
      const destinationLibraryId: string | undefined = body.destinationLibraryId;
      const newLibraryName: string | undefined = body.newLibraryName;

      if (!allAlbumItems && !itemIds.length) {
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

      const albumPage = await repository.getProjectAlbum(user.userId, projectId, { limit: 999999 });
      const albumItems = albumPage.items;
      const itemsToCopy = allAlbumItems
        ? albumItems
        : albumItems.filter((item) => itemIds.includes(item.id));
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
          description: project.description,
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
      const projectJobs = await repository.getProjectJobs(user.userId, projectId);
      for (const job of projectJobs) {
        if (job.filename) jobFilenameMap.set(job.id, job.filename);
      }

      if (targetLibraryType === 'text') {
        for (const item of itemsToCopy) {
          const jobFilename = item.jobId ? jobFilenameMap.get(item.jobId) : undefined;
          newItems.push({
            id: randomUUID(),
            title: jobFilename || undefined,
            content: item.textContent || item.prompt || '',
            tags: item.tags && item.tags.length > 0 ? item.tags : undefined,
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
            tags: item.tags && item.tags.length > 0 ? item.tags : undefined,
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
   * POST /api/projects/:id/album/move-to-project
   *
   * Move selected album items into another project of the same type, taking
   * everything that hangs off each item with it: the job row that produced it
   * — including the workflow snapshot that makes the result reusable — and
   * every file the item or that job references from inside this project's
   * storage folder, references and context media included.
   *
   * Files are copied into the destination folder and the source copy is
   * deleted only once nothing left in this project still points at it, so a
   * reference shared with a workflow step or a job that stayed behind keeps
   * working on both sides.
   */
  router.post('/api/projects/:id/album/move-to-project', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    // Set once this request creates the destination project, so a failure
    // further down can take it back out again rather than leaving it behind.
    let createdProjectId: string | null = null;
    try {
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);

      const body = await c.req.json().catch(() => ({}));
      const itemIds: string[] = Array.from(new Set(
        (Array.isArray(body?.itemIds) ? body.itemIds : [])
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id: string) => id.trim()),
      ));
      const destinationProjectId = typeof body?.destinationProjectId === 'string' ? body.destinationProjectId.trim() : '';
      const newProjectName = typeof body?.newProjectName === 'string' ? body.newProjectName.trim() : '';
      const requestedNewProjectId = typeof body?.newProjectId === 'string' ? body.newProjectId.trim() : '';

      if (itemIds.length === 0) return c.json({ error: 'No items selected' }, 400);
      if (!destinationProjectId && !newProjectName) {
        return c.json({ error: 'destinationProjectId or newProjectName is required' }, 400);
      }
      if (newProjectName.length > 256) return c.json({ error: 'Field too long' }, 400);

      const sourceProject = await repository.getProject(user.userId, projectId);
      if (!sourceProject) return c.json({ error: 'Project not found' }, 404);
      const sourceType = sourceProject.type || 'image';

      const bucket = storage.getBucketName();
      const albumPage = await repository.getProjectAlbum(user.userId, projectId, { limit: 999999 });
      const itemsToMove = albumPage.items.filter((item) => itemIds.includes(item.id));
      if (itemsToMove.length === 0) return c.json({ error: 'No matching items found' }, 400);

      // The jobs behind the moved items travel with them; one still running
      // does not, since its worker would write the result back into a project
      // the job had left.
      const jobIds = Array.from(new Set(itemsToMove.map((item) => item.jobId).filter((id): id is string => Boolean(id))));
      const jobsToMove = jobIds.length
        ? (await repository.getProjectJobsByIds(user.userId, projectId, jobIds, { includeWorkflowSnapshot: true }))
          .filter((job) => job.status !== 'processing')
        : [];
      const movableJobIds = new Set(jobsToMove.map((job) => job.id));

      let targetProjectId = destinationProjectId;
      let createdProject = false;

      if (targetProjectId) {
        if (targetProjectId === projectId) {
          return c.json({ error: 'Destination must be a different project' }, 400);
        }
        const destination = await repository.getProject(user.userId, targetProjectId);
        if (!destination) return c.json({ error: 'Destination project not found' }, 404);
        if ((destination.type || 'image') !== sourceType) {
          return c.json({ error: `Destination must be a ${sourceType} project` }, 400);
        }
      } else {
        targetProjectId = (requestedNewProjectId || newProjectName).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 128)
          || `project-${Date.now()}`;
        if (targetProjectId === projectId || await repository.getProject(user.userId, targetProjectId)) {
          targetProjectId = `${targetProjectId}-${randomUUID().slice(0, 8)}`.slice(0, 128);
        }
        // The items were generated under this project's settings, so the new
        // project starts from them — a move is not a reason to re-pick a model.
        const newProject: Project = {
          id: targetProjectId,
          name: newProjectName,
          description: sourceProject.description,
          type: sourceType,
          status: 'active',
          createdAt: Date.now(),
          workflow: [],
          jobs: [],
          album: [],
          providerId: sourceProject.providerId,
          modelConfigId: sourceProject.modelConfigId,
          aspectRatio: sourceProject.aspectRatio,
          quality: sourceProject.quality,
          background: sourceProject.background,
          format: sourceProject.format,
          shuffle: sourceProject.shuffle,
          prefix: sourceProject.prefix,
          systemPrompt: sourceProject.systemPrompt,
          temperature: sourceProject.temperature,
          maxTokens: sourceProject.maxTokens,
          duration: sourceProject.duration,
          resolution: sourceProject.resolution,
          sound: sourceProject.sound,
        };
        try {
          await repository.createProject(user.userId, newProject);
        } catch {
          // Project ids are unique across accounts, so a name-derived id can
          // collide with a project this user cannot see.
          newProject.id = `${targetProjectId}-${randomUUID().slice(0, 8)}`.slice(0, 128);
          targetProjectId = newProject.id;
          await repository.createProject(user.userId, newProject);
        }
        createdProject = true;
        createdProjectId = targetProjectId;
      }

      const safeSourceId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const safeTargetId = targetProjectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const sourcePrefix = `${user.userId}/${safeSourceId}/`;
      const destinationPrefix = `${user.userId}/${safeTargetId}/`;

      const movingKeys = new Set<string>();
      const collectKey = (value?: string) => {
        const key = stripToKey(value, bucket);
        if (key && key.startsWith(sourcePrefix)) movingKeys.add(key);
      };
      const collectKeys = (values?: string[]) => (values || []).forEach(collectKey);

      for (const item of itemsToMove) {
        collectKey(item.imageUrl);
        collectKey(item.thumbnailUrl);
        collectKey(item.optimizedUrl);
        collectKeys(item.imageContexts);
        collectKeys(item.videoContexts);
        collectKeys(item.audioContexts);
      }
      for (const job of jobsToMove) {
        collectKey(job.imageUrl);
        collectKey(job.thumbnailUrl);
        collectKey(job.optimizedUrl);
        collectKeys(job.imageContexts);
        collectKeys(job.videoContexts);
        collectKeys(job.audioContexts);
        for (const step of job.workflowSnapshot || []) {
          if (step.type !== 'image' && step.type !== 'video' && step.type !== 'audio') continue;
          collectKey(step.value);
          collectKey(step.thumbnailUrl);
          collectKey(step.optimizedUrl);
        }
      }

      // Two project ids can sanitize to the same folder name, in which case
      // the files are already where they need to be and nothing is copied.
      const keyMap = sourcePrefix === destinationPrefix
        ? {}
        : await planAlbumStorageMoves(Array.from(movingKeys), sourcePrefix, destinationPrefix, storage);

      // A row can reference a file that is no longer in the bucket — a reference
      // image replaced in the workflow, a step deleted, a result cleaned up by
      // the orphan tool — and copying one of those throws. Only that specific
      // error is tolerated, and the key then drops out of the map so the row
      // keeps the key it had and the sweep below leaves the source alone.
      // Anything else (refused, throttled, a broken connection) still fails the
      // request, because silently skipping it would strand a live file.
      const missing = await mapWithConcurrency(
        Object.entries(keyMap),
        STORAGE_CONCURRENCY,
        async ([sourceKey, destinationKey]) => {
          try {
            await storage.copy(sourceKey, destinationKey);
            return null;
          } catch (e) {
            if (!isMissingObjectError(e)) throw e;
            return sourceKey;
          }
        },
      );
      const missingFiles = missing.filter((key): key is string => key !== null).length;
      for (const sourceKey of missing) {
        if (sourceKey) delete keyMap[sourceKey];
      }
      if (missingFiles > 0) {
        console.warn(`[album move] ${missingFiles} referenced file(s) are missing from storage and were left behind`);
      }

      const { movedItems, movedJobs } = await repository.moveAlbumItemsToProject(
        user.userId,
        projectId,
        targetProjectId,
        { itemIds: itemsToMove.map((item) => item.id), jobIds: Array.from(movableJobIds), keyMap, bucket },
      );

      // The items have moved as of the call above — that is the point of no
      // return. Everything below is housekeeping: sweeping up the source copies
      // and telling open viewers to refresh. A failure in any of it is logged
      // and swallowed, because reporting a move that happened as one that
      // failed is worse than leaving a few files to the orphan tool.
      createdProjectId = null;
      let removedFiles = 0;
      try {
        const [remainingWorkflow, remainingJobs, remainingAlbum, trashItems] = await Promise.all([
          repository.getProjectWorkflow(user.userId, projectId),
          repository.getProjectJobs(user.userId, projectId, { includeWorkflowSnapshot: true }),
          repository.getProjectAlbum(user.userId, projectId, { limit: 999999 }),
          repository.getTrashItems(user.userId),
        ]);

        const stillReferenced = new Set<string>();
        const keepKey = (value?: string) => {
          const key = stripToKey(value, bucket);
          if (key) stillReferenced.add(key);
        };
        const keepKeys = (values?: string[]) => (values || []).forEach(keepKey);

        remainingWorkflow.forEach((item) => {
          keepKey(item.value);
          keepKey(item.thumbnailUrl);
          keepKey(item.optimizedUrl);
        });
        remainingJobs.forEach((job) => {
          keepKey(job.imageUrl);
          keepKey(job.thumbnailUrl);
          keepKey(job.optimizedUrl);
          keepKeys(job.imageContexts);
          keepKeys(job.videoContexts);
          keepKeys(job.audioContexts);
        });
        remainingAlbum.items.forEach((item) => {
          keepKey(item.imageUrl);
          keepKey(item.thumbnailUrl);
          keepKey(item.optimizedUrl);
          keepKeys(item.imageContexts);
          keepKeys(item.videoContexts);
          keepKeys(item.audioContexts);
        });
        trashItems.forEach((item) => {
          if (item.projectId !== projectId) return;
          keepKey(item.imageUrl);
          keepKey(item.thumbnailUrl);
          keepKey(item.optimizedUrl);
        });

        // A job left behind keeps the media inside its workflow snapshot, which
        // is the only place a reference from a since-deleted workflow step
        // survives — so those keys count as referenced too.
        for (const job of remainingJobs) {
          for (const step of job.workflowSnapshot || []) {
            if (step.type !== 'image' && step.type !== 'video' && step.type !== 'audio') continue;
            keepKey(step.value);
            keepKey(step.thumbnailUrl);
            keepKey(step.optimizedUrl);
          }
        }

        const deletable = Object.keys(keyMap).filter((sourceKey) => !stillReferenced.has(sourceKey));
        const deleted = await mapWithConcurrency(deletable, STORAGE_CONCURRENCY, async (sourceKey) => {
          try {
            await storage.delete(sourceKey);
            return true;
          } catch (e) {
            console.warn(`[album move] Failed to delete source file ${sourceKey}:`, e);
            return false;
          }
        });
        removedFiles = deleted.filter(Boolean).length;
      } catch (cleanupError) {
        console.warn('[album move] Source cleanup failed after a completed move:', cleanupError);
      }

      // Published outside the sweep above: an open viewer on either side is
      // stale until this lands, so a failure to clean up files must not also
      // cost both projects their refresh.
      try {
        projectEvents?.notifyProjectChanged({
          userId: user.userId,
          projectId,
          reason: 'album.moved',
        });
        projectEvents?.notifyProjectChanged({
          userId: user.userId,
          projectId: targetProjectId,
          reason: createdProject ? 'project.created' : 'album.moved',
        });
      } catch (notifyError) {
        console.warn('[album move] Failed to publish move events:', notifyError);
      }

      return c.json({
        success: true,
        projectId: targetProjectId,
        createdProject,
        movedItems,
        movedJobs,
        movedFiles: Object.keys(keyMap).length,
        missingFiles,
        removedFiles,
      });
    } catch (e) {
      console.error('[POST /api/projects/:id/album/move-to-project]', e);

      // Roll back a destination project this request created, so a failed move
      // does not leave an empty project in the list. Only when it is still
      // empty — if anything did land there, the project is the record of it.
      if (createdProjectId) {
        try {
          const album = await repository.getProjectAlbum(user.userId, createdProjectId, { limit: 1 });
          if (album.total === 0) await repository.deleteProject(user.userId, createdProjectId);
        } catch (cleanupError) {
          console.warn(`[album move] Failed to clean up project ${createdProjectId}:`, cleanupError);
        }
      }

      // The reason stays in the server log: an exception here carries bucket
      // names, object keys and table names, which do not belong in a toast.
      return c.json({ error: 'Failed to move album items' }, 500);
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
      const [workflow, jobs, albumPage] = await Promise.all([
        repository.getProjectWorkflow(user.userId, projectId),
        repository.getProjectJobs(user.userId, projectId),
        repository.getProjectAlbum(user.userId, projectId, { limit: 999999 }),
      ]);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const projectPrefix = `${user.userId}/${safeProjectId}/`;
      const bucket = storage.getBucketName();

      // 1. List all files in S3 for this project
      const allS3Keys = await storage.listObjects(projectPrefix);

      // 2. Collect all referenced keys from database
      const referencedKeys = new Set<string>();
      const addReferencedKey = (value?: string) => {
        const key = stripToKey(value, bucket);
        if (key && !key.startsWith('http') && !key.startsWith('data:')) {
          referencedKeys.add(key);
        }
      };
      const addReferencedKeys = (values?: string[]) => {
        (values || []).forEach(addReferencedKey);
      };

      // From Workflow
      workflow.forEach(item => {
        if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
          addReferencedKey(item.value);
          addReferencedKey(item.thumbnailUrl);
          addReferencedKey(item.optimizedUrl);
        }
      });

      // From Jobs
      jobs.forEach(job => {
        addReferencedKey(job.imageUrl);
        addReferencedKey(job.thumbnailUrl);
        addReferencedKey(job.optimizedUrl);
        addReferencedKeys(job.imageContexts);
        addReferencedKeys(job.videoContexts);
        addReferencedKeys(job.audioContexts);
      });

      // From Album
      albumPage.items.forEach(item => {
        addReferencedKey(item.imageUrl);
        addReferencedKey(item.thumbnailUrl);
        addReferencedKey(item.optimizedUrl);
        addReferencedKeys(item.imageContexts);
        addReferencedKeys(item.videoContexts);
        addReferencedKeys(item.audioContexts);
      });

      // From Trash items belonging to this project
      const trashItems = await repository.getTrashItems(user.userId);
      trashItems.forEach(item => {
        if (item.projectId === projectId) {
          addReferencedKey(item.imageUrl);
          addReferencedKey(item.thumbnailUrl);
          addReferencedKey(item.optimizedUrl);
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
   * POST /api/projects/:id/jobs/start
   *
   * Move targeted draft/failed jobs to pending and enqueue them without forcing
   * the client to PUT the entire jobs array.
   */
  router.post('/api/projects/:id/jobs/start', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);

      const project = await repository.getProject(user.userId, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 404);

      const body = await c.req.json().catch(() => ({}));
      const mode = body?.mode === 'allDrafts'
        ? 'allDrafts'
        : body?.mode === 'selected'
          ? 'selected'
          : null;
      if (!mode) return c.json({ error: 'Invalid start mode' }, 400);

      const rawJobIds: unknown[] = Array.isArray(body?.jobIds) ? body.jobIds : [];
      const jobIds: string[] = Array.from(new Set(
        rawJobIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
      ));

      if (mode === 'selected' && jobIds.length === 0) {
        return c.json({ error: 'jobIds are required' }, 400);
      }

      const startableJobs = await repository.findProjectJobsForStart(user.userId, projectId, { mode, jobIds });
      if (startableJobs.length === 0) {
        return c.json({ success: true, started: 0 }, 202);
      }

      const pendingCount = await repository.countPendingProjectJobs(user.userId, projectId);
      const movingToPendingCount = startableJobs.filter((job) => job.status !== 'pending').length;
      const futurePendingCount = pendingCount + movingToPendingCount;

      if (futurePendingCount > 0) {
        const estimatedNewSize = futurePendingCount * 25 * 1024 * 1024;
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

      const startJobIds = startableJobs.map((job) => job.id);
      const started = await repository.startProjectJobs(user.userId, projectId, startJobIds);
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        reason: 'jobs.changed',
      });

      await queueManager.enqueueProjectJobs(user.userId, projectId, startJobIds);

      return c.json({ success: true, started }, 202);
    } catch (e) {
      console.error('[POST /api/projects/:id/jobs/start]', e);
      return c.json({ error: 'Failed to start project jobs' }, 500);
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
      const allJobs = await repository.getProjectJobs(user.userId, projectId);
      const pendingJobsCount = allJobs.filter(j => j.status === 'pending').length;
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
      const itemIds = Array.isArray(body.itemIds)
        ? body.itemIds.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0)
        : undefined;
      const packageName = typeof body.packageName === 'string' ? body.packageName : undefined;
      const exportVersion: 'raw' | 'optimized' = body.exportVersion === 'optimized' ? 'optimized' : 'raw';
      const watermarkSettings = body.watermarkSettings
        ? normalizePostWatermarkPayload(postWatermarkSettingSchema.parse(body.watermarkSettings))
        : undefined;

      const { taskId } = await startProjectAlbumExport(exportDeps, user.userId, {
        projectId,
        itemIds,
        packageName,
        exportVersion,
        watermarkSettings,
      });
      return c.json({ taskId });
    } catch (e) {
      if (e instanceof ProjectExportError) return c.json({ error: e.message }, e.status);
      console.error('[POST /api/projects/:id/export]', e);
      return c.json({ error: 'Failed to start export' }, 500);
    }
  });

  /**
   * POST /api/projects/:id/export-bundle
   *
   * Package a whole project — settings, workflow, album and every media file
   * they reference — into one portable .zip. The archive lands in the normal
   * exports list, so it can be downloaded, released to a drive, or sold like
   * any other package.
   */
  router.post('/api/projects/:id/export-bundle', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      if (!projectId) return c.json({ error: 'Project id is required' }, 400);

      const body = await c.req.json().catch(() => ({}));
      const packageName = typeof body?.packageName === 'string' ? body.packageName : undefined;

      const { taskId } = await startProjectBundleExport(exportDeps, user.userId, { projectId, packageName });
      return c.json({ taskId });
    } catch (e) {
      if (e instanceof ProjectExportError) return c.json({ error: e.message }, e.status);
      console.error('[POST /api/projects/:id/export-bundle]', e);
      return c.json({ error: 'Failed to start project export' }, 500);
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
      const pageValue = Number(c.req.query('page') || '1');
      const pageSizeValue = Number(c.req.query('pageSize') || c.req.query('limit') || '20');
      const page = Math.max(1, Math.floor(Number.isFinite(pageValue) ? pageValue : 1));
      const pageSize = Math.max(1, Math.min(100, Math.floor(Number.isFinite(pageSizeValue) ? pageSizeValue : 20)));

      const result = await repository.getAllExportTasks(user.userId, page, pageSize);

      // Presign completed tasks on read
      const items = await Promise.all(result.items.map(t => exportManager.presignTask(t)));

      return c.json({ ...result, items });
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
   * Queue a release of this export to one of the user's connected drives.
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

      const body = await c.req.json().catch(() => ({} as any));
      const requestedId = typeof body?.driveConnectionId === 'string' ? body.driveConnectionId : null;

      const connections = await prisma.driveConnection.findMany({
        where: { userId: user.userId },
        select: { id: true, provider: true },
        orderBy: { createdAt: 'desc' },
      });
      if (connections.length === 0) {
        return c.json({ error: 'No drive is connected. Connect one on the Releases page.' }, 400);
      }

      // With a single drive connected the caller may omit the target.
      const connection = requestedId
        ? connections.find((item) => item.id === requestedId)
        : connections.length === 1
          ? connections[0]
          : null;
      if (!connection) {
        return c.json(
          { error: requestedId ? 'Drive connection not found' : 'Pick which drive to release to.' },
          400,
        );
      }

      const deliveryTaskId = await deliveryManager.startDelivery(user.userId, taskId, {
        destination: 'drive',
        driveConnectionId: connection.id,
        driveProvider: connection.provider,
      });
      return c.json({ deliveryTaskId }, 202);
    } catch (e) {
      console.error('[POST /api/exports/:taskId/upload-to-drive]', e);
      return c.json({ error: 'Failed to submit drive release job' }, 500);
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


  router.get('/api/exports/:taskId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const taskId = c.req.param('taskId');
      const task = await repository.getExportTask(user.userId, taskId);
      if (!task) return c.json({ error: 'Export not found' }, 404);
      return c.json(task);
    } catch (e) {
      console.error('[GET /api/exports/:taskId]', e);
      return c.json({ error: 'Failed to fetch export' }, 500);
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

  // === Project bundle import ===

  /**
   * POST /api/project-imports
   *
   * Body is the raw .zip (no multipart wrapper) so a multi-gigabyte bundle
   * streams straight into storage instead of being buffered in memory. The
   * archive is unpacked into a new project by ProjectImportManager; the
   * response returns immediately with a task to poll.
   */
  router.post('/api/project-imports', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const taskId = randomUUID();
    const s3Key = ProjectImportManager.uploadKey(user.userId, taskId);

    try {
      const rawName = c.req.header('x-file-name');
      const fileName = rawName ? decodeURIComponent(rawName).slice(0, 255) : undefined;

      const declaredLength = Number(c.req.header('content-length') || '0');
      if (Number.isFinite(declaredLength) && declaredLength > 0) {
        // The uploaded archive plus everything it unpacks to has to fit, so
        // reserve twice its size up front rather than failing halfway through.
        const { allowed, currentUsage, limit } = await checkStorageLimit(
          user.userId,
          declaredLength * 2,
          userRepository,
          storage,
          exportStorage,
          repository
        );
        if (!allowed) {
          return c.json({
            error: `Storage limit exceeded. Cannot import project. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${((declaredLength * 2) / (1024 * 1024)).toFixed(1)}MB.`,
          }, 403);
        }
      }

      const body = c.req.raw.body;
      if (!body) return c.json({ error: 'No archive was uploaded' }, 400);

      await exportStorage.uploadStream(
        s3Key,
        Readable.fromWeb(body as any),
        'application/zip'
      );

      const size = await exportStorage.getSize(s3Key).catch(() => undefined);
      await projectImportManager.enqueue({ userId: user.userId, taskId, fileName, s3Key, size });

      return c.json({ taskId });
    } catch (e) {
      console.error('[POST /api/project-imports]', e);
      // Never leave a half-written archive eating the user's quota.
      await exportStorage.delete(s3Key).catch(() => {});
      return c.json({ error: 'Failed to upload project bundle' }, 500);
    }
  });

  router.get('/api/project-imports', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const pageValue = Number(c.req.query('page') || '1');
      const pageSizeValue = Number(c.req.query('pageSize') || c.req.query('limit') || '10');
      const page = Math.max(1, Math.floor(Number.isFinite(pageValue) ? pageValue : 1));
      const pageSize = Math.max(1, Math.min(50, Math.floor(Number.isFinite(pageSizeValue) ? pageSizeValue : 10)));

      const result = await repository.getProjectImportTasks(user.userId, page, pageSize);
      return c.json(result);
    } catch (e) {
      console.error('[GET /api/project-imports]', e);
      return c.json({ error: 'Failed to list project imports' }, 500);
    }
  });

  router.get('/api/project-imports/:taskId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const task = await repository.getProjectImportTask(user.userId, c.req.param('taskId'));
      if (!task) return c.json({ error: 'Import not found' }, 404);
      return c.json(task);
    } catch (e) {
      console.error('[GET /api/project-imports/:taskId]', e);
      return c.json({ error: 'Failed to fetch import' }, 500);
    }
  });

  router.delete('/api/project-imports/:taskId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const taskId = c.req.param('taskId');
      const task = await repository.getProjectImportTask(user.userId, taskId);
      if (!task) return c.json({ error: 'Import not found' }, 404);
      if (task.status === 'processing') {
        return c.json({ error: 'This import is still running' }, 409);
      }
      // Only the record goes away — an imported project is the user's to keep.
      if (task.s3Key) {
        await exportStorage.delete(task.s3Key).catch((s3Err) => {
          console.warn(`[DELETE /api/project-imports/:taskId] Failed to delete ${task.s3Key}:`, s3Err);
        });
      }
      await repository.deleteProjectImportTask(user.userId, taskId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/project-imports/:taskId]', e);
      return c.json({ error: 'Failed to delete import task' }, 500);
    }
  });

  return router;
}

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { AUTO_TAG_CONCURRENCY_LIMIT, AutoTagScope, AutoTagSettings } from '../../src/types';
import type { IRepository } from '../db/repository';
import { normalizeAlbumTags } from '../db/project-repository';
import { autoTagLanguageName } from '../services/auto-tag/prompt';
import { AutoTagOffError, AutoTagQueue, albumItemAutoTagKind, libraryAutoTagKind } from '../services/auto-tag/queue';
import { resolveAutoTagSettings, taggingModels } from '../services/auto-tag/settings';

const autoTagSettingsSchema = z.object({
  providerId: z.string().min(1).nullable(),
  modelConfigId: z.string().min(1).nullable(),
  concurrencyLimit: z.number().int().min(AUTO_TAG_CONCURRENCY_LIMIT.min).max(AUTO_TAG_CONCURRENCY_LIMIT.max),
});

const runOptionsSchema = z.object({
  /** Leave items that already carry tags alone. */
  onlyUntagged: z.boolean().optional(),
  /** UI language code; tags are written in it. */
  language: z.string().max(16).optional(),
});

const albumRunSchema = runOptionsSchema.extend({
  itemIds: z.array(z.string().min(1)).optional(),
  /** Every item the album's current filters select, instead of `itemIds`. */
  allAlbumItems: z.boolean().optional(),
  aspectRatios: z.array(z.string()).optional(),
  filterTags: z.array(z.string()).optional(),
  tagMatch: z.enum(['all', 'any']).optional(),
  q: z.string().optional(),
});

const libraryRunSchema = runOptionsSchema.extend({
  itemIds: z.array(z.string().min(1)).optional(),
  /** Every item the library's current search and tag filter select, instead of `itemIds`. */
  all: z.boolean().optional(),
  filterTags: z.array(z.string()).optional(),
  q: z.string().optional(),
});

export function createAutoTagRouter(
  prisma: PrismaClient,
  repository: Pick<IRepository, 'getProjectAlbum' | 'getLibraryItemsPaginated'>,
  queue: AutoTagQueue,
) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  /**
   * Queue the chosen items, minus those that cannot be tagged and, with
   * `onlyUntagged`, those that already have tags. Refused while auto-tagging
   * is off, so the page can send the user to Preferences.
   */
  const startRun = async (
    userId: string,
    scope: AutoTagScope,
    candidates: { id: string; tags: unknown; taggable: boolean }[],
    options: z.infer<typeof runOptionsSchema>,
  ) => {
    const { target } = await resolveAutoTagSettings(prisma, userId);
    if (!target) return { error: new AutoTagOffError().message, code: 'auto_tag_off' as const };
    const itemIds = candidates
      .filter((item) => item.taggable && (!options.onlyUntagged || normalizeAlbumTags(item.tags).length === 0))
      .map((item) => item.id);
    const status = queue.enqueue(userId, scope, itemIds, autoTagLanguageName(options.language));
    return { queued: itemIds.length, skipped: candidates.length - itemIds.length, status };
  };

  router.get('/api/settings/auto-tag', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const { settings } = await resolveAutoTagSettings(prisma, user.userId);
      return c.json<AutoTagSettings>(settings);
    } catch (e) {
      console.error('[GET /api/settings/auto-tag]', e);
      return c.json({ error: 'Failed to load auto-tagging settings' }, 500);
    }
  });

  router.put('/api/settings/auto-tag', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const parsed = autoTagSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid auto-tagging settings' }, 400);
    }

    const { providerId, concurrencyLimit } = parsed.data;
    const modelConfigId = providerId ? parsed.data.modelConfigId : null;

    if (providerId) {
      const provider = await prisma.provider.findFirst({
        where: { id: providerId, userId: user.userId },
        select: { type: true, models: true },
      });
      if (!provider) return c.json({ error: 'Provider not found' }, 404);

      const models = taggingModels(provider);
      if (!models) return c.json({ error: 'This provider cannot read images' }, 400);
      if (!modelConfigId || !models.some((m) => m.id === modelConfigId)) {
        return c.json({ error: 'Choose a text model from this provider' }, 400);
      }
    }

    try {
      const data = { providerId, modelConfigId, concurrencyLimit };
      const saved = await prisma.autoTagSetting.upsert({
        where: { userId: user.userId },
        update: data,
        create: { userId: user.userId, ...data },
      });
      return c.json<AutoTagSettings>({
        providerId: saved.providerId,
        modelConfigId: saved.modelConfigId,
        concurrencyLimit: saved.concurrencyLimit,
      });
    } catch (e) {
      console.error('[PUT /api/settings/auto-tag]', e);
      return c.json({ error: 'Failed to save auto-tagging settings' }, 500);
    }
  });

  router.post('/api/projects/:id/album/auto-tag', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const projectId = c.req.param('id');
    const parsed = albumRunSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid auto-tagging request' }, 400);
    const body = parsed.data;
    if (!body.allAlbumItems && !body.itemIds?.length) {
      return c.json({ error: 'itemIds is required unless allAlbumItems is true' }, 400);
    }

    try {
      const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.userId }, select: { type: true } });
      if (!project) return c.json({ error: 'Project not found' }, 404);

      const items = body.allAlbumItems
        ? (await repository.getProjectAlbum(user.userId, projectId, {
          limit: 999999,
          aspectRatios: body.aspectRatios?.length ? body.aspectRatios : undefined,
          tags: body.filterTags?.length ? body.filterTags : undefined,
          tagMatch: body.tagMatch,
          q: body.q,
        })).items
        : await prisma.albumItem.findMany({
          where: { id: { in: body.itemIds }, projectId, userId: user.userId },
          select: { id: true, imageUrl: true, textContent: true, tags: true },
        });

      const result = await startRun(
        user.userId,
        { kind: 'album', projectId },
        items.map((item) => ({ id: item.id, tags: item.tags, taggable: albumItemAutoTagKind(item, project.type) !== null })),
        body,
      );
      if ('error' in result) return c.json(result, 409);
      return c.json(result);
    } catch (e) {
      console.error('[POST /api/projects/:id/album/auto-tag]', e);
      return c.json({ error: 'Failed to start auto-tagging' }, 500);
    }
  });

  router.post('/api/libraries/:id/auto-tag', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const libraryId = c.req.param('id');
    const parsed = libraryRunSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid auto-tagging request' }, 400);
    const body = parsed.data;
    if (!body.all && !body.itemIds?.length) {
      return c.json({ error: 'itemIds is required unless all is true' }, 400);
    }

    try {
      const library = await prisma.library.findFirst({ where: { id: libraryId, userId: user.userId }, select: { type: true } });
      if (!library) return c.json({ error: 'Library not found' }, 404);
      if (!libraryAutoTagKind(library.type)) {
        return c.json({ error: 'Only image and text libraries can be auto-tagged' }, 400);
      }

      const items = body.all
        ? (await repository.getLibraryItemsPaginated(
          user.userId,
          libraryId,
          1,
          999999,
          body.q?.trim() || undefined,
          body.filterTags?.length ? body.filterTags : undefined,
        )).items
        : await prisma.libraryItem.findMany({
          where: { libraryId, id: { in: body.itemIds } },
          select: { id: true, tags: true },
        });
      const result = await startRun(
        user.userId,
        { kind: 'library', libraryId },
        items.map((item) => ({ id: item.id, tags: item.tags, taggable: true })),
        body,
      );
      if ('error' in result) return c.json(result, 409);
      return c.json(result);
    } catch (e) {
      console.error('[POST /api/libraries/:id/auto-tag]', e);
      return c.json({ error: 'Failed to start auto-tagging' }, 500);
    }
  });

  // Status, retry and cancel only ever reach the caller's own runs: the queue
  // keeps each user's runs apart, so another user's id finds nothing.
  const scopes: { path: string; scope: (id: string) => AutoTagScope }[] = [
    { path: '/api/projects/:id/album/auto-tag', scope: (projectId) => ({ kind: 'album', projectId }) },
    { path: '/api/libraries/:id/auto-tag', scope: (libraryId) => ({ kind: 'library', libraryId }) },
  ];
  for (const { path, scope } of scopes) {
    router.get(path, authMiddleware, (c) => {
      const user = c.get('user') as JwtPayload;
      return c.json(queue.status(user.userId, scope(c.req.param('id')!)));
    });

    router.post(`${path}/retry`, authMiddleware, async (c) => {
      const user = c.get('user') as JwtPayload;
      const body = runOptionsSchema.safeParse(await c.req.json().catch(() => ({})));
      const language = autoTagLanguageName(body.success ? body.data.language : undefined);
      return c.json(queue.retry(user.userId, scope(c.req.param('id')!), language));
    });

    // POST rather than DELETE: `DELETE /api/projects/:id/album/:itemId` is
    // registered first and would take the request for an album item.
    router.post(`${path}/cancel`, authMiddleware, (c) => {
      const user = c.get('user') as JwtPayload;
      return c.json(queue.cancel(user.userId, scope(c.req.param('id')!)));
    });
  }

  return router;
}

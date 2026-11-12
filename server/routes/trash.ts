import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import type { ProjectEventPublisher } from '../live/project-live-hub';
import type { LiveEventPublisher } from '../live/user-live-hub';

type Variables = { user: JwtPayload };

export function createTrashRouter(repository: IRepository, storage: S3Storage, projectEvents?: ProjectEventPublisher, liveEvents?: LiveEventPublisher) {
  const router = new Hono<{ Variables: Variables }>();

  const deleteKeys = async (keys: string[]) => {
    for (const key of keys) {
      try {
        await storage.delete(key);
      } catch (s3Err) {
        console.error(`[Trash] Failed to delete S3 key ${key}:`, s3Err);
      }
    }
  };

  const readIds = async (c: { req: { json: () => Promise<any> } }): Promise<string[] | null> => {
    const body = await c.req.json().catch(() => null);
    const ids = body?.ids;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null;
  };

  // ─── Library items ───
  // Kept apart from album items: their own table, and their own routes under /api/library-trash.

  router.get('/api/library-trash', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const items = await repository.getLibraryTrashItems(user.userId);
      const signed = await Promise.all(items.map(async (item) => ({
        ...item,
        imageUrl: item.imageUrl ? await storage.getPresignedUrl(item.imageUrl) : item.imageUrl,
        thumbnailUrl: item.thumbnailUrl ? await storage.getPresignedUrl(item.thumbnailUrl) : item.thumbnailUrl,
        optimizedUrl: item.optimizedUrl ? await storage.getPresignedUrl(item.optimizedUrl) : item.optimizedUrl,
      })));
      return c.json(signed);
    } catch (e) {
      console.error('[GET /api/library-trash]', e);
      return c.json({ error: 'Failed to fetch trash' }, 500);
    }
  });

  router.post('/api/library-trash/restore', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const ids = await readIds(c);
      if (!ids) return c.json({ error: 'Invalid IDs' }, 400);
      const { restored, libraryIds } = await repository.restoreLibraryTrashItems(user.userId, ids);
      for (const id of libraryIds) liveEvents?.publishChange(user.userId, { resource: 'library', action: 'updated', id });
      return c.json({ success: true, count: restored });
    } catch (e) {
      console.error('[POST /api/library-trash/restore]', e);
      return c.json({ error: 'Failed to restore items' }, 500);
    }
  });

  router.delete('/api/library-trash/empty', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await deleteKeys(await repository.deleteLibraryTrashPermanently(user.userId));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/library-trash/empty]', e);
      return c.json({ error: 'Failed to empty trash' }, 500);
    }
  });

  router.delete('/api/library-trash/batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const ids = await readIds(c);
      if (!ids) return c.json({ error: 'Invalid IDs' }, 400);
      await deleteKeys(await repository.deleteLibraryTrashPermanently(user.userId, ids));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/library-trash/batch]', e);
      return c.json({ error: 'Failed to delete items' }, 500);
    }
  });

  // ─── Album items ───

  router.get('/api/trash', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const items = await repository.getTrashItems(user.userId);
      
      // Presign URLs for viewing in the trash
      const signed = await Promise.all(items.map(async (item) => {
        // Self-heal missing sizes from S3
        let size = item.size;
        if (!size && item.imageUrl) {
          try {
            const s3Size = await storage.getSize(item.imageUrl);
            if (s3Size) size = s3Size;
          } catch (e) {
            console.warn(`Failed to recover size for trash item ${item.id}:`, e);
          }
        }

        const imageUrl = item.imageUrl ? await storage.getPresignedUrl(item.imageUrl) : item.imageUrl;
        const thumbnailUrl = item.thumbnailUrl ? await storage.getPresignedUrl(item.thumbnailUrl) : item.thumbnailUrl;
        const optimizedUrl = item.optimizedUrl ? await storage.getPresignedUrl(item.optimizedUrl) : item.optimizedUrl;
        return { ...item, imageUrl, thumbnailUrl, optimizedUrl, size };
      }));
      
      return c.json(signed);
    } catch (e) {
      console.error('[GET /api/trash]', e);
      return c.json({ error: 'Failed to fetch trash' }, 500);
    }
  });

  router.post('/api/trash/:id/restore', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const itemId = c.req.param('id');
      const item = (await repository.getTrashItems(user.userId)).find((trashItem) => trashItem.id === itemId);
      await repository.restoreTrashItem(user.userId, itemId);
      if (item?.projectId) {
        projectEvents?.notifyProjectChanged({
          userId: user.userId,
          projectId: item.projectId,
          itemId,
          reason: 'album.restored',
        });
      }
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/trash/:id/restore]', e);
      return c.json({ error: 'Failed to restore item' }, 500);
    }
  });

  router.post('/api/trash/restore-batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) return c.json({ error: 'Invalid IDs' }, 400);

      const trashItems = await repository.getTrashItems(user.userId);
      const projectIds = new Set<string>();
      for (const id of ids) {
        const item = trashItems.find((trashItem) => trashItem.id === id);
        if (item?.projectId) projectIds.add(item.projectId);
        await repository.restoreTrashItem(user.userId, id);
      }
      for (const projectId of projectIds) {
        projectEvents?.notifyProjectChanged({
          userId: user.userId,
          projectId,
          reason: 'album.restored',
        });
      }
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/trash/restore-batch]', e);
      return c.json({ error: 'Failed to restore items' }, 500);
    }
  });

  router.delete('/api/trash/empty', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const s3Keys = await repository.emptyTrash(user.userId);
      
      // Cleanup S3 files
      for (const key of s3Keys) {
        try {
          await storage.delete(key);
        } catch (s3Err) {
          console.error(`[Trash] Failed to delete S3 key ${key}:`, s3Err);
        }
      }
      
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/trash/empty]', e);
      return c.json({ error: 'Failed to empty trash' }, 500);
    }
  });

  router.delete('/api/trash/batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { ids } = await c.req.json();
      if (!Array.isArray(ids)) return c.json({ error: 'Invalid IDs' }, 400);

      for (const id of ids) {
        const s3Keys = await repository.deleteTrashPermanently(user.userId, id);
        for (const key of s3Keys) {
          try {
            await storage.delete(key);
          } catch (s3Err) {
            console.error(`[Trash] Failed to delete S3 key ${key}:`, s3Err);
          }
        }
      }
      
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/trash/batch]', e);
      return c.json({ error: 'Failed to delete items' }, 500);
    }
  });

  router.delete('/api/trash/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const s3Keys = await repository.deleteTrashPermanently(user.userId, c.req.param('id'));
      for (const key of s3Keys) {
        try {
          await storage.delete(key);
        } catch (s3Err) {
          console.error(`[Trash] Failed to delete S3 key ${key}:`, s3Err);
        }
      }
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/trash/:id]', e);
      return c.json({ error: 'Failed to delete item' }, 500);
    }
  });

  router.post('/api/projects/:id/album/:itemId/trash', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projectId = c.req.param('id');
      const itemId = c.req.param('itemId');
      await repository.moveToTrash(user.userId, projectId, itemId);
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        itemId,
        reason: 'album.deleted',
      });
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/projects/:id/album/:itemId/trash]', e);
      return c.json({ error: 'Failed to move item to trash' }, 500);
    }
  });

  router.post('/api/projects/:id/album/trash-batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { ids } = await c.req.json();
      const projectId = c.req.param('id');
      if (!Array.isArray(ids)) return c.json({ error: 'Invalid IDs' }, 400);

      for (const id of ids) {
        await repository.moveToTrash(user.userId, projectId, id);
      }
      projectEvents?.notifyProjectChanged({
        userId: user.userId,
        projectId,
        reason: 'album.deleted',
      });
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/projects/:id/album/trash-batch]', e);
      return c.json({ error: 'Failed to move items to trash' }, 500);
    }
  });

  return router;
}

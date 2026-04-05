import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';

type Variables = { user: JwtPayload };

export function createTrashRouter(repository: IRepository, storage: S3Storage) {
  const router = new Hono<{ Variables: Variables }>();

  router.get('/api/trash', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const items = await repository.getTrashItems(user.userId);
      
      // Presign URLs for viewing in the trash
      const signed = await Promise.all(items.map(async (item) => {
        const imageUrl = await storage.getPresignedUrl(item.imageUrl);
        return { ...item, imageUrl };
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
      await repository.restoreTrashItem(user.userId, c.req.param('id'));
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

      for (const id of ids) {
        await repository.restoreTrashItem(user.userId, id);
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
        const s3Key = await repository.deleteTrashPermanently(user.userId, id);
        if (s3Key) {
          try {
            await storage.delete(s3Key);
          } catch (s3Err) {
            console.error(`[Trash] Failed to delete S3 key ${s3Key}:`, s3Err);
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
      const s3Key = await repository.deleteTrashPermanently(user.userId, c.req.param('id'));
      if (s3Key) {
        await storage.delete(s3Key);
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
      await repository.moveToTrash(user.userId, c.req.param('id'), c.req.param('itemId'));
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
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/projects/:id/album/trash-batch]', e);
      return c.json({ error: 'Failed to move items to trash' }, 500);
    }
  });

  return router;
}

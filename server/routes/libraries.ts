import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import type { LibraryItem, Library } from '../../src/types';

type Variables = { user: JwtPayload };

/** Sign S3 keys in library item content fields */
async function signLibraryImages(items: LibraryItem[], storage: S3Storage): Promise<LibraryItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.content && !item.content.startsWith('http') && !item.content.startsWith('data:')) {
        const signedUrl = await storage.getPresignedUrl(item.content);
        return { ...item, content: signedUrl };
      }
      return item;
    })
  );
}

async function signLibrary(lib: Library, storage: S3Storage): Promise<Library> {
  return { ...lib, items: await signLibraryImages(lib.items, storage) };
}

export function createLibraryRouter(repository: IRepository, storage: S3Storage) {
  const router = new Hono<{ Variables: Variables }>();

  // === Libraries ===

  router.get('/api/libraries', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const libraries = await repository.getUserLibraries(user.userId);
      const signed = await Promise.all(libraries.map((lib) => signLibrary(lib, storage)));
      return c.json(signed);
    } catch (e) {
      console.error('[GET /api/libraries]', e);
      return c.json({ error: 'Failed to list libraries' }, 500);
    }
  });

  router.get('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const library = await repository.getLibrary(user.userId, c.req.param('id'));
      if (!library) return c.json({ error: 'Not found' }, 404);
      return c.json(await signLibrary(library, storage));
    } catch (e) {
      console.error('[GET /api/libraries/:id]', e);
      return c.json({ error: 'Failed to get library' }, 500);
    }
  });

  router.post('/api/libraries', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const id = typeof body?.id === 'string' ? body.id.trim() : null;
      const name = typeof body?.name === 'string' ? body.name.trim() : null;
      const type = typeof body?.type === 'string' ? body.type.trim() : null;

      if (!id || !name || !type) return c.json({ error: 'id, name, and type are required' }, 400);
      if (id.length > 128 || name.length > 256) return c.json({ error: 'Field too long' }, 400);

      await repository.createLibrary(user.userId, { id, name, type });
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/libraries]', e);
      return c.json({ error: 'Failed to create library' }, 500);
    }
  });

  router.put('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const updates: { name?: string; type?: string } = {};
      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (typeof body?.type === 'string') updates.type = body.type.trim();

      await repository.updateLibrary(user.userId, c.req.param('id'), updates);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/libraries/:id]', e);
      return c.json({ error: 'Failed to update library' }, 500);
    }
  });

  router.delete('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteLibrary(user.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/libraries/:id]', e);
      return c.json({ error: 'Failed to delete library' }, 500);
    }
  });

  // === Library Items ===

  router.get('/api/libraries/:libId/items', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const items = await repository.getLibraryItems(user.userId, c.req.param('libId'));
      return c.json(await signLibraryImages(items, storage));
    } catch (e) {
      console.error('[GET /api/libraries/:libId/items]', e);
      return c.json({ error: 'Failed to list items' }, 500);
    }
  });

  router.post('/api/libraries/:libId/items', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const item = await c.req.json();
      await repository.createLibraryItem(user.userId, c.req.param('libId'), item);
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/libraries/:libId/items]', e);
      return c.json({ error: 'Failed to create item' }, 500);
    }
  });

  router.put('/api/libraries/:libId/items/reorder', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      
      if (!Array.isArray(body)) {
        return c.json({ error: 'Expected an array of { id, order }' }, 400);
      }
      
      await repository.reorderLibraryItems(user.userId, c.req.param('libId'), body);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/libraries/:libId/items/reorder]', e);
      return c.json({ error: 'Failed to reorder items' }, 500);
    }
  });

  router.put('/api/libraries/:libId/items/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const updates: { content?: string; title?: string } = {};
      if (typeof body?.content === 'string') updates.content = body.content;
      if (typeof body?.title === 'string') updates.title = body.title;

      await repository.updateLibraryItem(user.userId, c.req.param('libId'), c.req.param('itemId'), updates);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/libraries/:libId/items/:itemId]', e);
      return c.json({ error: 'Failed to update item' }, 500);
    }
  });

  router.delete('/api/libraries/:libId/items/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteLibraryItem(user.userId, c.req.param('libId'), c.req.param('itemId'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/libraries/:libId/items/:itemId]', e);
      return c.json({ error: 'Failed to delete item' }, 500);
    }
  });

  return router;
}

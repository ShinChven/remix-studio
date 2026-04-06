import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { checkStorageLimit } from '../utils/storage-check';
import type { LibraryItem, Library } from '../../src/types';

type Variables = { user: JwtPayload };

/** Sign S3 keys in library item content fields */
async function signLibraryImages(items: LibraryItem[], storage: S3Storage, libraryType: string): Promise<LibraryItem[]> {
  if (libraryType !== 'image') return items;
  return Promise.all(
    items.map(async (item) => {
      let size = item.size;
      if (!size && item.content && !item.content.startsWith('http') && !item.content.startsWith('data:')) {
        try {
          const s3Size = await storage.getSize(item.content);
          if (s3Size) size = s3Size;
        } catch (e) {
          console.warn(`Failed to recover size for library item ${item.id}:`, e);
        }
      }

      const content = (item.content && !item.content.startsWith('http') && !item.content.startsWith('data:'))
        ? await storage.getPresignedUrl(item.content)
        : item.content;
      const thumbnailUrl = (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http'))
        ? await storage.getPresignedUrl(item.thumbnailUrl)
        : item.thumbnailUrl;
      const optimizedUrl = (item.optimizedUrl && !item.optimizedUrl.startsWith('http'))
        ? await storage.getPresignedUrl(item.optimizedUrl)
        : item.optimizedUrl;
      return { ...item, content, thumbnailUrl, optimizedUrl, size };
    })
  );
}

async function signLibrary(lib: Library, storage: S3Storage): Promise<Library> {
  return { ...lib, items: await signLibraryImages(lib.items, storage, lib.type) };
}

export function createLibraryRouter(repository: IRepository, storage: S3Storage, userRepository: UserRepository, exportStorage: S3Storage) {
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

  // Check which projects reference this library
  router.get('/api/libraries/:id/references', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const libraryId = c.req.param('id');
      const projects = await repository.getUserProjects(user.userId);
      const referencingProjects = projects.filter((p) =>
        p.workflow.some((item) => item.type === 'library' && item.value === libraryId)
      );
      return c.json(referencingProjects.map((p) => ({ id: p.id, name: p.name })));
    } catch (e) {
      console.error('[GET /api/libraries/:id/references]', e);
      return c.json({ error: 'Failed to check references' }, 500);
    }
  });

  // Remove library references from specified projects (or all)
  router.post('/api/libraries/:id/remove-references', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const libraryId = c.req.param('id');
      const body = await c.req.json();
      const projectIds: string[] | undefined = body?.projectIds; // undefined = all

      const projects = await repository.getUserProjects(user.userId);
      const targets = projectIds
        ? projects.filter((p) => projectIds.includes(p.id))
        : projects;

      for (const project of targets) {
        const filtered = project.workflow.filter(
          (item) => !(item.type === 'library' && item.value === libraryId)
        );
        if (filtered.length !== project.workflow.length) {
          await repository.updateProject(user.userId, project.id, { workflow: filtered });
        }
      }
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/libraries/:id/remove-references]', e);
      return c.json({ error: 'Failed to remove references' }, 500);
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
      const libId = c.req.param('libId');
      const [items, library] = await Promise.all([
        repository.getLibraryItems(user.userId, libId),
        repository.getLibrary(user.userId, libId),
      ]);
      if (!library) return c.json({ error: 'Not found' }, 404);
      return c.json(await signLibraryImages(items, storage, library.type));
    } catch (e) {
      console.error('[GET /api/libraries/:libId/items]', e);
      return c.json({ error: 'Failed to list items' }, 500);
    }
  });

  router.post('/api/libraries/:libId/items', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const item = await c.req.json();

      // Estimate size from item fields (image libraries store size in DB fields)
      const estimatedSize = (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
      if (estimatedSize > 0) {
        const { allowed, currentUsage, limit } = await checkStorageLimit(
          user.userId,
          estimatedSize,
          userRepository,
          storage,
          exportStorage,
          repository
        );
        if (!allowed) {
          return c.json({
            error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ${(estimatedSize / (1024 * 1024)).toFixed(1)}MB.`
          }, 403);
        }
      }

      await repository.createLibraryItem(user.userId, c.req.param('libId'), item);
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/libraries/:libId/items]', e);
      return c.json({ error: 'Failed to create item' }, 500);
    }
  });

  router.post('/api/libraries/:libId/items/batch', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const items = await c.req.json();
      if (!Array.isArray(items)) {
        return c.json({ error: 'Expected an array of items' }, 400);
      }

      // Sum sizes across all items in the batch
      const batchSize = items.reduce((acc: number, item: any) =>
        acc + (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0), 0);
      if (batchSize > 0) {
        const { allowed, currentUsage, limit } = await checkStorageLimit(
          user.userId,
          batchSize,
          userRepository,
          storage,
          exportStorage,
          repository
        );
        if (!allowed) {
          return c.json({
            error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ${(batchSize / (1024 * 1024)).toFixed(1)}MB.`
          }, 403);
        }
      }

      await repository.createLibraryItemsBatch(user.userId, c.req.param('libId'), items);
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/libraries/:libId/items/batch]', e);
      return c.json({ error: 'Failed to create items batch' }, 500);
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
      const updates: { content?: string; title?: string; tags?: string[] } = {};
      if (typeof body?.content === 'string') updates.content = body.content;
      if (typeof body?.title === 'string') updates.title = body.title;
      if (Array.isArray(body?.tags)) updates.tags = body.tags;

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

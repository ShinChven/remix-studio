import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';

type Variables = { user: JwtPayload };

const IMAGE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB base64 payload limit

export function createImageRouter(storage: S3Storage) {
  const router = new Hono<{ Variables: Variables }>();

  router.post('/api/images', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const { base64, projectId } = body;

      if (!base64 || typeof base64 !== 'string') return c.json({ error: 'No image data' }, 400);
      if (!projectId || typeof projectId !== 'string') return c.json({ error: 'projectId is required' }, 400);
      if (base64.length > IMAGE_SIZE_LIMIT_BYTES) return c.json({ error: 'Image too large (max 10 MB)' }, 413);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const url = await storage.save(key, buffer, 'image/png');
      return c.json({ url });
    } catch (e) {
      console.error('[POST /api/images]', e);
      return c.json({ error: 'Failed to save image' }, 500);
    }
  });

  router.get('/api/images/*', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const key = c.req.path.replace('/api/images/', '');

      if (key.includes('..')) return c.json({ error: 'Invalid path' }, 400);
      if (!key.startsWith(`${user.userId}/`)) return c.json({ error: 'Forbidden' }, 403);

      const data = await storage.read(key);
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': 'image/png' },
      });
    } catch (e) {
      console.error('[GET /api/images/*]', e);
      return c.notFound();
    }
  });

  return router;
}

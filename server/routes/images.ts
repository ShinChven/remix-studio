import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
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

      const s3Key = await storage.save(key, buffer, 'image/png');
      const signedUrl = await storage.getPresignedUrl(s3Key);
      return c.json({ key: s3Key, url: signedUrl });
    } catch (e) {
      console.error('[POST /api/images]', e);
      return c.json({ error: 'Failed to save image' }, 500);
    }
  });

  return router;
}

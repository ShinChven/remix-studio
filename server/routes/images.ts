import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { S3Storage } from '../storage/s3-storage';

type Variables = { user: JwtPayload };

const IMAGE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

export function createImageRouter(storage: S3Storage) {
  const router = new Hono<{ Variables: Variables }>();

  router.post('/api/images', authMiddleware, bodyLimit({ maxSize: IMAGE_SIZE_LIMIT_BYTES, onError: (c) => c.json({ error: 'Image too large (max 50MB)' }, 413) }), async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const { base64, projectId } = body;

      if (!base64 || typeof base64 !== 'string') return c.json({ error: 'No image data' }, 400);
      if (!projectId || typeof projectId !== 'string') return c.json({ error: 'projectId is required' }, 400);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const mimeMatch = base64.match(/^data:(image\/[\w+.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/png': 'png' };
      const ext = extMap[mimeType] ?? 'png';
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:image\/[\w+.-]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const s3Key = await storage.save(key, buffer, mimeType);
      const signedUrl = await storage.getPresignedUrl(s3Key);
      return c.json({ key: s3Key, url: signedUrl });
    } catch (e) {
      console.error('[POST /api/images]', e);
      return c.json({ error: 'Failed to save image' }, 500);
    }
  });

  return router;
}

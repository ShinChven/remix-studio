import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { S3Storage } from '../storage/s3-storage';
import { checkStorageLimit } from '../utils/storage-check';
import { estimateStoredBytes, ingestMedia, MEDIA_SIZE_LIMIT_BYTES, mediaExtension } from '../services/media-ingest';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';

import { formatError } from '../utils/error-handler';

type Variables = { user: JwtPayload };

const IMAGE_SIZE_LIMIT_BYTES = MEDIA_SIZE_LIMIT_BYTES.image; // 50 MB

export function createImageRouter(storage: S3Storage, exportStorage: S3Storage, repository: IRepository, userRepository: UserRepository) {
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
      const ext = mediaExtension('image', mimeType);
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:image\/[\w+.-]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Estimated total size (orig + thumb + opt)
      const estimatedSize = estimateStoredBytes('image', buffer.length);

      // 0. Check storage limit
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
          error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(estimatedSize / (1024 * 1024)).toFixed(1)}MB.` 
        }, 403);
      }

      const { key: s3Key, thumbnailKey: thumbKey, optimizedKey: optKey } = await ingestMedia(storage, {
        kind: 'image',
        key,
        ext,
        mimeType,
        buffer,
      });

      const signedUrl = await storage.getPresignedUrl(s3Key);
      const thumbUrl = await storage.getPresignedUrl(thumbKey!);
      const optUrl = await storage.getPresignedUrl(optKey!);

      return c.json({ 
        key: s3Key, 
        url: signedUrl,
        thumbnailKey: thumbKey,
        thumbnailUrl: thumbUrl,
        optimizedKey: optKey,
        optimizedUrl: optUrl,
        size: buffer.length
      });
    } catch (e) {
      console.error('[POST /api/images]', e);
      return c.json({ error: formatError(e, 'Failed to save image') }, 500);
    }
  });

  return router;
}

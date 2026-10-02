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

const VIDEO_SIZE_LIMIT_BYTES = MEDIA_SIZE_LIMIT_BYTES.video; // 200 MB

export function createVideoRouter(storage: S3Storage, exportStorage: S3Storage, repository: IRepository, userRepository: UserRepository) {
  const router = new Hono<{ Variables: Variables }>();

  router.post('/api/videos', authMiddleware, bodyLimit({ maxSize: VIDEO_SIZE_LIMIT_BYTES, onError: (c) => c.json({ error: 'Video too large (max 200MB)' }, 413) }), async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const { base64, projectId } = body;

      if (!base64 || typeof base64 !== 'string') return c.json({ error: 'No video data' }, 400);
      if (!projectId || typeof projectId !== 'string') return c.json({ error: 'projectId is required' }, 400);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const mimeMatch = base64.match(/^data:(video\/[\w+.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
      const ext = mediaExtension('video', mimeType);
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:video\/[\w+.-]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const estimatedSize = estimateStoredBytes('video', buffer.length);

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
        kind: 'video',
        key,
        ext,
        mimeType,
        buffer,
      });

      return c.json({
        key: s3Key,
        url: await storage.getPresignedUrl(s3Key),
        thumbnailKey: thumbKey,
        thumbnailUrl: await storage.getPresignedUrl(thumbKey!),
        optimizedKey: optKey,
        optimizedUrl: await storage.getPresignedUrl(optKey!),
        size: buffer.length,
      });
    } catch (e) {
      console.error('[POST /api/videos]', e);
      return c.json({ error: formatError(e, 'Failed to save video') }, 500);
    }
  });

  return router;
}

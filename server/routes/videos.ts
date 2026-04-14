import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { S3Storage } from '../storage/s3-storage';
import { generateThumbnail, generateOptimized } from '../utils/image-utils';
import { extractFirstFramePng } from '../utils/video-utils';
import { checkStorageLimit } from '../utils/storage-check';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { formatError } from '../utils/error-handler';

type Variables = { user: JwtPayload };

const VIDEO_SIZE_LIMIT_BYTES = 200 * 1024 * 1024; // 200 MB

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
      const extMap: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
        'video/x-matroska': 'mkv',
      };
      const ext = extMap[mimeType] ?? 'mp4';
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:video\/[\w+.-]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const estimatedSize = buffer.length * 1.5;

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

      const s3Key = await storage.save(key, buffer, mimeType);

      const posterPng = await extractFirstFramePng(buffer);
      const thumbBuffer = await generateThumbnail(posterPng);
      const thumbKey = key.replace(new RegExp(`\\.${ext}$`), `.thumb.jpg`);
      await storage.save(thumbKey, thumbBuffer, 'image/jpeg');

      const optBuffer = await generateOptimized(posterPng);
      const optKey = key.replace(new RegExp(`\\.${ext}$`), `.opt.jpg`);
      await storage.save(optKey, optBuffer, 'image/jpeg');

      return c.json({
        key: s3Key,
        url: await storage.getPresignedUrl(s3Key),
        thumbnailKey: thumbKey,
        thumbnailUrl: await storage.getPresignedUrl(thumbKey),
        optimizedKey: optKey,
        optimizedUrl: await storage.getPresignedUrl(optKey),
        size: buffer.length,
      });
    } catch (e) {
      console.error('[POST /api/videos]', e);
      return c.json({ error: formatError(e, 'Failed to save video') }, 500);
    }
  });

  return router;
}

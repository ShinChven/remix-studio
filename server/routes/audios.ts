import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { S3Storage } from '../storage/s3-storage';
import { checkStorageLimit } from '../utils/storage-check';
import { ingestMedia, MEDIA_SIZE_LIMIT_BYTES, mediaExtension } from '../services/media-ingest';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { formatError } from '../utils/error-handler';

type Variables = { user: JwtPayload };

const AUDIO_SIZE_LIMIT_BYTES = MEDIA_SIZE_LIMIT_BYTES.audio; // 50 MB

export function createAudioRouter(storage: S3Storage, exportStorage: S3Storage, repository: IRepository, userRepository: UserRepository) {
  const router = new Hono<{ Variables: Variables }>();

  router.post('/api/audios', authMiddleware, bodyLimit({ maxSize: AUDIO_SIZE_LIMIT_BYTES, onError: (c) => c.json({ error: 'Audio too large (max 50MB)' }, 413) }), async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const { base64, projectId } = body;

      if (!base64 || typeof base64 !== 'string') return c.json({ error: 'No audio data' }, 400);
      if (!projectId || typeof projectId !== 'string') return c.json({ error: 'projectId is required' }, 400);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const mimeMatch = base64.match(/^data:(audio\/[\w+.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'audio/mpeg';
      const ext = mediaExtension('audio', mimeType);
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:audio\/[\w+.-]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const { allowed, currentUsage, limit } = await checkStorageLimit(
        user.userId,
        buffer.length,
        userRepository,
        storage,
        exportStorage,
        repository
      );

      if (!allowed) {
        return c.json({
          error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(buffer.length / (1024 * 1024)).toFixed(1)}MB.`
        }, 403);
      }

      const { key: s3Key } = await ingestMedia(storage, { kind: 'audio', key, ext, mimeType, buffer });

      return c.json({
        key: s3Key,
        url: await storage.getPresignedUrl(s3Key),
        size: buffer.length,
      });
    } catch (e) {
      console.error('[POST /api/audios]', e);
      return c.json({ error: formatError(e, 'Failed to save audio') }, 500);
    }
  });

  return router;
}

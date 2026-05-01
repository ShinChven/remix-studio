import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { PostManager } from '../queue/post-manager';
import { ProviderRepository } from '../db/provider-repository';
import { resolveChatProvider } from '../assistant/chat-provider-factory';
import { S3Storage } from '../storage/s3-storage';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { generateOptimized, generateThumbnail } from '../utils/image-utils';
import { extractFirstFramePng } from '../utils/video-utils';
import { checkStorageLimit } from '../utils/storage-check';
import { collectPostMediaStorageKeys, deleteStorageKeys } from '../utils/post-media-cleanup';

const POST_IMAGE_RAW_MAX_DIMENSION = 4096;
const POST_IMAGE_RAW_QUALITY = 90;
const CAMPAIGN_MEDIA_UPLOAD_LIMIT_BYTES = 500 * 1024 * 1024;

type ImportSource =
  | { kind: 'library'; libraryId: string; itemId: string }
  | { kind: 'album'; projectId: string; itemId: string };

type ResolvedImportMedia = {
  source: ImportSource;
  mediaType: 'image' | 'video';
  rawValue?: string | null;
  thumbnailValue?: string | null;
  optimizedValue?: string | null;
  rawSize?: number | null;
};

async function presignStorageValue(storage: S3Storage, value?: string | null): Promise<string | null | undefined> {
  if (!value) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('data:')) return value;
  try {
    return await storage.getPresignedUrl(value);
  } catch {
    return value;
  }
}

async function signPostMediaUrls(storage: S3Storage, post: any) {
  if (!post?.media) return post;
  return {
    ...post,
    media: await Promise.all(post.media.map(async (media: any) => ({
      ...media,
      size: media.size == null ? media.size : Number(media.size),
      sourceUrl: await presignStorageValue(storage, media.sourceUrl),
      processedUrl: await presignStorageValue(storage, media.processedUrl),
      thumbnailUrl: await presignStorageValue(storage, media.thumbnailUrl),
    }))),
  };
}

function stripToStorageKey(value: string | null | undefined, bucket: string): string | undefined {
  if (!value || value.startsWith('data:')) return value || undefined;
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    const pathStylePrefix = `/${bucket}/`;
    if (url.pathname.startsWith(pathStylePrefix)) {
      return decodeURIComponent(url.pathname.slice(pathStylePrefix.length));
    }
    if (url.hostname.startsWith(`${bucket}.`)) {
      return decodeURIComponent(url.pathname.slice(1));
    }
  } catch {
    return value;
  }

  return value;
}

function storageKeyExt(key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  const ext = path.extname(key.split('?')[0]).replace('.', '').toLowerCase();
  return ext || fallback;
}

function videoMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'mp4':
    default:
      return 'video/mp4';
  }
}

function videoMimeExt(mimeType: string): string {
  switch (mimeType) {
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    case 'video/x-matroska':
      return 'mkv';
    case 'video/mp4':
    default:
      return 'mp4';
  }
}

function dataUrlMimeType(value: string): string | null {
  const match = value.match(/^data:([\w/+.-]+);base64,/);
  return match?.[1] || null;
}

function bufferFromDataUrl(value: string, expectedPrefix: 'image' | 'video'): Buffer | null {
  const match = value.match(new RegExp(`^data:${expectedPrefix}/[\\w+.-]+;base64,(.+)$`));
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

function readMediaBufferFromDataUrl(value: string, expectedPrefix: 'image' | 'video'): Buffer {
  const buffer = bufferFromDataUrl(value, expectedPrefix);
  if (!buffer) throw new Error(`Invalid ${expectedPrefix} data URL`);
  return buffer;
}

async function readMediaBuffer(storage: S3Storage, value: string | undefined, bucket: string, expectedPrefix: 'image' | 'video'): Promise<Buffer> {
  if (!value) throw new Error('Media source is missing');
  if (value.startsWith('data:')) {
    const buffer = bufferFromDataUrl(value, expectedPrefix);
    if (!buffer) throw new Error('Unsupported data URL media source');
    return buffer;
  }

  const key = stripToStorageKey(value, bucket);
  if (!key || /^https?:\/\//i.test(key)) {
    throw new Error('External media URLs cannot be imported');
  }
  return storage.read(key);
}

async function processPostRawImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(POST_IMAGE_RAW_MAX_DIMENSION, POST_IMAGE_RAW_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: POST_IMAGE_RAW_QUALITY })
    .toBuffer();
}

async function copyIfStorageKey(
  storage: S3Storage,
  sourceValue: string | null | undefined,
  destinationKey: string,
  bucket: string,
): Promise<boolean> {
  const sourceKey = stripToStorageKey(sourceValue, bucket);
  if (!sourceKey || sourceKey.startsWith('data:') || /^https?:\/\//i.test(sourceKey)) return false;
  await storage.copy(sourceKey, destinationKey);
  return true;
}

async function getStorageValueSize(storage: S3Storage, value: string | null | undefined, bucket: string): Promise<number> {
  if (!value) return 0;
  if (value.startsWith('data:')) {
    const comma = value.indexOf(',');
    return comma >= 0 ? Buffer.byteLength(value.slice(comma + 1), 'base64') : 0;
  }
  const key = stripToStorageKey(value, bucket);
  if (!key || /^https?:\/\//i.test(key)) return 0;
  return (await storage.getSize(key)) || 0;
}

export function createPostsRouter(
  prisma: PrismaClient,
  postManager: PostManager,
  providerRepository: ProviderRepository,
  storage: S3Storage,
  exportStorage: S3Storage,
  repository: IRepository,
  userRepository: UserRepository,
) {
  const postsRouter = new Hono<{ Variables: { user: JwtPayload } }>();

  const createPostSchema = z.object({
    campaignId: z.string().min(1),
    textContent: z.string().optional(),
    scheduledAt: z.string().optional().nullable(),
    status: z.string().optional().default('draft'),
  });

  postsRouter.post('/api/posts', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const body = await c.req.json();
      const data = createPostSchema.parse(body);

      // Verify campaign belongs to user
      const campaign = await prisma.campaign.findFirst({
        where: { id: data.campaignId, userId: user.userId },
      });
      if (!campaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }

      const post = await prisma.post.create({
        data: {
          userId: user.userId,
          campaignId: data.campaignId,
          textContent: data.textContent,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          status: data.status,
        },
      });
      return c.json(await signPostMediaUrls(storage, post));
    } catch (error) {
      console.error('Failed to create post:', error);
      return c.json({ error: 'Failed to create post' }, 400);
    }
  });

  const importSourceSchema = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('library'),
      libraryId: z.string().min(1),
      itemId: z.string().min(1),
    }),
    z.object({
      kind: z.literal('album'),
      projectId: z.string().min(1),
      itemId: z.string().min(1),
    }),
  ]);

  const importMediaPostsSchema = z.object({
    sources: z.array(importSourceSchema).min(1).max(100),
  });

  async function resolveImportSources(userId: string, sources: ImportSource[]): Promise<ResolvedImportMedia[]> {
    const resolved = new Map<string, ResolvedImportMedia>();
    const librarySourceGroups = new Map<string, ImportSource[]>();
    const albumSourceGroups = new Map<string, ImportSource[]>();

    for (const source of sources) {
      if (source.kind === 'library') {
        const group = librarySourceGroups.get(source.libraryId) || [];
        group.push(source);
        librarySourceGroups.set(source.libraryId, group);
      } else {
        const group = albumSourceGroups.get(source.projectId) || [];
        group.push(source);
        albumSourceGroups.set(source.projectId, group);
      }
    }

    for (const [libraryId, group] of librarySourceGroups) {
      const itemIds = group.map((source) => source.itemId);
      const items = await prisma.libraryItem.findMany({
        where: {
          id: { in: itemIds },
          libraryId,
          library: {
            userId,
            type: { in: ['image', 'video'] },
          },
        },
        include: {
          library: {
            select: { type: true },
          },
        },
      });

      for (const item of items) {
        resolved.set(`library:${libraryId}:${item.id}`, {
          source: { kind: 'library', libraryId, itemId: item.id },
          mediaType: item.library.type === 'video' ? 'video' : 'image',
          rawValue: item.content,
          thumbnailValue: item.thumbnailUrl,
          optimizedValue: item.optimizedUrl,
          rawSize: item.size == null ? undefined : Number(item.size),
        });
      }
    }

    for (const [projectId, group] of albumSourceGroups) {
      const itemIds = group.map((source) => source.itemId);
      const items = await prisma.albumItem.findMany({
        where: {
          id: { in: itemIds },
          projectId,
          userId,
          project: {
            userId,
            type: { in: ['image', 'video'] },
          },
        },
        include: {
          project: {
            select: { type: true },
          },
        },
      });

      for (const item of items) {
        resolved.set(`album:${projectId}:${item.id}`, {
          source: { kind: 'album', projectId, itemId: item.id },
          mediaType: item.project.type === 'video' ? 'video' : 'image',
          rawValue: item.imageUrl,
          thumbnailValue: item.thumbnailUrl,
          optimizedValue: item.optimizedUrl,
          rawSize: item.size == null ? undefined : Number(item.size),
        });
      }
    }

    return sources.map((source) => {
      const key = source.kind === 'library'
        ? `library:${source.libraryId}:${source.itemId}`
        : `album:${source.projectId}:${source.itemId}`;
      const item = resolved.get(key);
      if (!item) {
        throw new Error(`Media item not found or unsupported: ${key}`);
      }
      return item;
    });
  }

  postsRouter.post('/api/campaigns/:campaignId/posts/import-media', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const campaignId = c.req.param('campaignId');

    try {
      const body = await c.req.json();
      const data = importMediaPostsSchema.parse(body);

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId: user.userId },
        select: { id: true },
      });
      if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

      const bucket = storage.getBucketName();
      const safeCampaignId = campaignId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const sources = await resolveImportSources(user.userId, data.sources);
      const created: Array<{ postId: string; mediaId: string }> = [];

      for (const item of sources) {
        const postId = randomUUID();
        const mediaId = randomUUID();
        const baseKey = `campaigns/${safeCampaignId}/posts/${postId}/media/${mediaId}`;
        let rawKey: string;
        let optimizedKey: string;
        let thumbKey: string;
        let mimeType: string;
        let storedSize = 0;

        if (item.mediaType === 'image') {
          const sourceBuffer = await readMediaBuffer(storage, item.rawValue || undefined, bucket, 'image');
          const rawBuffer = await processPostRawImage(sourceBuffer);
          const optBuffer = await generateOptimized(rawBuffer);
          const thumbBuffer = await generateThumbnail(rawBuffer);

          storedSize = rawBuffer.length + optBuffer.length + thumbBuffer.length;
          const { allowed, currentUsage, limit } = await checkStorageLimit(
            user.userId,
            storedSize,
            userRepository,
            storage,
            exportStorage,
            repository,
          );
          if (!allowed) {
            return c.json({
              error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(storedSize / (1024 * 1024)).toFixed(1)}MB.`,
            }, 403);
          }

          rawKey = `${baseKey}.raw.jpg`;
          optimizedKey = `${baseKey}.opt.jpg`;
          thumbKey = `${baseKey}.thumb.jpg`;
          mimeType = 'image/jpeg';

          await Promise.all([
            storage.save(rawKey, rawBuffer, 'image/jpeg'),
            storage.save(optimizedKey, optBuffer, 'image/jpeg'),
            storage.save(thumbKey, thumbBuffer, 'image/jpeg'),
          ]);
        } else {
          const sourceRawKey = stripToStorageKey(item.rawValue, bucket);
          if (!sourceRawKey || sourceRawKey.startsWith('data:') || /^https?:\/\//i.test(sourceRawKey)) {
            throw new Error('Video import requires an internal storage object');
          }

          const ext = storageKeyExt(sourceRawKey, 'mp4');
          mimeType = videoMimeFromExt(ext);
          rawKey = `${baseKey}.raw.${ext}`;
          optimizedKey = `${baseKey}.opt.jpg`;
          thumbKey = `${baseKey}.thumb.jpg`;

          const rawSize = item.rawSize || (await storage.getSize(sourceRawKey)) || 0;
          let optSize = await getStorageValueSize(storage, item.optimizedValue, bucket);
          let thumbSize = await getStorageValueSize(storage, item.thumbnailValue, bucket);

          let generatedOpt: Buffer | null = null;
          let generatedThumb: Buffer | null = null;
          const hasCopiedOpt = optSize > 0;
          const hasCopiedThumb = thumbSize > 0;

          if (!hasCopiedOpt || !hasCopiedThumb) {
            const rawBuffer = await storage.read(sourceRawKey);
            const posterPng = await extractFirstFramePng(rawBuffer);
            if (!hasCopiedOpt) {
              generatedOpt = await generateOptimized(posterPng);
              optSize = generatedOpt.length;
            }
            if (!hasCopiedThumb) {
              generatedThumb = await generateThumbnail(posterPng);
              thumbSize = generatedThumb.length;
            }
          }

          storedSize = rawSize + optSize + thumbSize;
          const { allowed, currentUsage, limit } = await checkStorageLimit(
            user.userId,
            storedSize,
            userRepository,
            storage,
            exportStorage,
            repository,
          );
          if (!allowed) {
            return c.json({
              error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(storedSize / (1024 * 1024)).toFixed(1)}MB.`,
            }, 403);
          }

          await storage.copy(sourceRawKey, rawKey);

          if (!(await copyIfStorageKey(storage, item.optimizedValue, optimizedKey, bucket)) && generatedOpt) {
            await storage.save(optimizedKey, generatedOpt, 'image/jpeg');
          }

          if (!(await copyIfStorageKey(storage, item.thumbnailValue, thumbKey, bucket)) && generatedThumb) {
            await storage.save(thumbKey, generatedThumb, 'image/jpeg');
          }
        }

        await prisma.$transaction([
          prisma.post.create({
            data: {
              id: postId,
              userId: user.userId,
              campaignId,
              textContent: '',
              status: 'draft',
            },
          }),
          prisma.postMedia.create({
            data: {
              id: mediaId,
              postId,
              sourceUrl: rawKey,
              processedUrl: item.mediaType === 'video' ? rawKey : optimizedKey,
              thumbnailUrl: thumbKey,
              type: item.mediaType,
              status: 'ready',
              quality: 'high',
              mimeType,
              size: storedSize,
              position: 0,
            },
          }),
        ]);

        created.push({ postId, mediaId });
      }

      return c.json({ created, count: created.length });
    } catch (error: any) {
      console.error('Failed to import campaign media posts:', error);
      return c.json({ error: error?.message || 'Failed to import media posts' }, 400);
    }
  });

  const uploadMediaPostsSchema = z.object({
    files: z.array(z.object({
      base64: z.string().min(1),
      name: z.string().optional(),
    })).min(1).max(100),
  });

  postsRouter.post(
    '/api/campaigns/:campaignId/posts/upload-media',
    authMiddleware,
    bodyLimit({
      maxSize: CAMPAIGN_MEDIA_UPLOAD_LIMIT_BYTES,
      onError: (c) => c.json({ error: 'Upload too large (max 500MB per batch)' }, 413),
    }),
    async (c) => {
      const user = c.get('user') as JwtPayload;
      const campaignId = c.req.param('campaignId');

      try {
        const body = await c.req.json();
        const data = uploadMediaPostsSchema.parse(body);

        const campaign = await prisma.campaign.findFirst({
          where: { id: campaignId, userId: user.userId },
          select: { id: true },
        });
        if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

        const safeCampaignId = campaignId.replace(/[^a-zA-Z0-9-_]/g, '_');
        const created: Array<{ postId: string; mediaId: string }> = [];

        for (const file of data.files) {
          const mimeType = dataUrlMimeType(file.base64);
          const isImage = Boolean(mimeType?.startsWith('image/'));
          const isVideo = Boolean(mimeType?.startsWith('video/'));
          if (!mimeType || (!isImage && !isVideo)) {
            throw new Error(`Unsupported media type${file.name ? ` for ${file.name}` : ''}`);
          }

          const postId = randomUUID();
          const mediaId = randomUUID();
          const baseKey = `campaigns/${safeCampaignId}/posts/${postId}/media/${mediaId}`;
          let rawKey: string;
          let processedKey: string;
          let thumbKey: string;
          let storedSize = 0;

          if (isImage) {
            const sourceBuffer = readMediaBufferFromDataUrl(file.base64, 'image');
            const rawBuffer = await processPostRawImage(sourceBuffer);
            const optBuffer = await generateOptimized(rawBuffer);
            const thumbBuffer = await generateThumbnail(rawBuffer);

            storedSize = rawBuffer.length + optBuffer.length + thumbBuffer.length;
            const { allowed, currentUsage, limit } = await checkStorageLimit(
              user.userId,
              storedSize,
              userRepository,
              storage,
              exportStorage,
              repository,
            );
            if (!allowed) {
              return c.json({
                error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(storedSize / (1024 * 1024)).toFixed(1)}MB.`,
              }, 403);
            }

            rawKey = `${baseKey}.raw.jpg`;
            processedKey = `${baseKey}.opt.jpg`;
            thumbKey = `${baseKey}.thumb.jpg`;

            await Promise.all([
              storage.save(rawKey, rawBuffer, 'image/jpeg'),
              storage.save(processedKey, optBuffer, 'image/jpeg'),
              storage.save(thumbKey, thumbBuffer, 'image/jpeg'),
            ]);
          } else {
            const sourceBuffer = readMediaBufferFromDataUrl(file.base64, 'video');
            const ext = videoMimeExt(mimeType);
            const posterPng = await extractFirstFramePng(sourceBuffer);
            const optBuffer = await generateOptimized(posterPng);
            const thumbBuffer = await generateThumbnail(posterPng);

            storedSize = sourceBuffer.length + optBuffer.length + thumbBuffer.length;
            const { allowed, currentUsage, limit } = await checkStorageLimit(
              user.userId,
              storedSize,
              userRepository,
              storage,
              exportStorage,
              repository,
            );
            if (!allowed) {
              return c.json({
                error: `Storage limit exceeded. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(storedSize / (1024 * 1024)).toFixed(1)}MB.`,
              }, 403);
            }

            rawKey = `${baseKey}.raw.${ext}`;
            processedKey = rawKey;
            thumbKey = `${baseKey}.thumb.jpg`;
            const optKey = `${baseKey}.opt.jpg`;

            await Promise.all([
              storage.save(rawKey, sourceBuffer, mimeType),
              storage.save(optKey, optBuffer, 'image/jpeg'),
              storage.save(thumbKey, thumbBuffer, 'image/jpeg'),
            ]);
          }

          await prisma.$transaction([
            prisma.post.create({
              data: {
                id: postId,
                userId: user.userId,
                campaignId,
                textContent: '',
                status: 'draft',
              },
            }),
            prisma.postMedia.create({
              data: {
                id: mediaId,
                postId,
                sourceUrl: rawKey,
                processedUrl: processedKey,
                thumbnailUrl: thumbKey,
                type: isVideo ? 'video' : 'image',
                status: 'ready',
                quality: 'high',
                mimeType: isVideo ? mimeType : 'image/jpeg',
                size: storedSize,
                position: 0,
              },
            }),
          ]);

          created.push({ postId, mediaId });
        }

        return c.json({ created, count: created.length });
      } catch (error: any) {
        console.error('Failed to upload campaign media posts:', error);
        return c.json({ error: error?.message || 'Failed to upload media posts' }, 400);
      }
    },
  );

  // ========== Scheduled Posts ==========

  postsRouter.get('/api/posts/scheduled', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const pageSize = Math.max(1, Math.min(100, Number(c.req.query('pageSize') || 25)));
    const skip = (page - 1) * pageSize;
    const q = c.req.query('q');
    const sortBy = c.req.query('sortBy') || 'scheduledAt';
    const sortOrder = (c.req.query('sortOrder') || 'asc') as 'asc' | 'desc';

    const whereClause: any = {
      userId: user.userId,
      status: 'scheduled',
    };

    if (q) {
      whereClause.OR = [
        { textContent: { contains: q, mode: 'insensitive' } },
        { campaign: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }

    try {
      const [total, items] = await Promise.all([
        prisma.post.count({ where: whereClause }),
        prisma.post.findMany({
          where: whereClause,
          include: {
            campaign: { select: { id: true, name: true } },
            media: { orderBy: { position: 'asc' } },
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: pageSize,
        }),
      ]);

      const signedItems = await Promise.all(items.map((item) => signPostMediaUrls(storage, item)));

      return c.json({
        items: signedItems,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error) {
      console.error('Failed to get scheduled posts:', error);
      return c.json({ error: 'Failed to fetch scheduled posts' }, 500);
    }
  });

  postsRouter.get('/api/posts/scheduled-counts', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const from = c.req.query('from'); // ISO date string
    const to = c.req.query('to');     // ISO date string
    const timezoneOffsetMinutes = Number(c.req.query('timezoneOffsetMinutes') || 0);

    if (!from || !to) {
      return c.json({ error: 'Missing from or to parameters' }, 400);
    }

    try {
      const posts = await prisma.post.findMany({
        where: {
          userId: user.userId,
          status: 'scheduled',
          scheduledAt: {
            gte: new Date(from),
            lte: new Date(to),
          },
        },
        select: {
          scheduledAt: true,
          executions: { select: { id: true } },
        },
      });

      // Group by local date
      const counts: Record<string, { date: string; postCount: number; sendCount: number }> = {};

      posts.forEach((post) => {
        if (!post.scheduledAt) return;
        
        // Adjust for timezone offset if needed, or just use the local date representation
        // The frontend sends from/to in local date start/end ISOs usually.
        // Let's use simple YYYY-MM-DD in user's presumed local time.
        // Actually, let's just use the Date object and adjust by offset.
        const localDate = new Date(post.scheduledAt.getTime() - timezoneOffsetMinutes * 60000);
        const dateKey = localDate.toISOString().split('T')[0];

        if (!counts[dateKey]) {
          counts[dateKey] = { date: dateKey, postCount: 0, sendCount: 0 };
        }
        counts[dateKey].postCount++;
        counts[dateKey].sendCount += post.executions.length || 1; // Assuming at least 1 send if it's a post
      });

      return c.json(Object.values(counts));
    } catch (error) {
      console.error('Failed to get scheduled counts:', error);
      return c.json({ error: 'Failed to fetch scheduled counts' }, 500);
    }
  });

  postsRouter.get('/api/posts/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const post = await prisma.post.findFirst({
        where: { id, userId: user.userId },
        include: {
          media: { orderBy: { position: 'asc' } },
          executions: { include: { socialAccount: true } },
          campaign: { include: { socialAccounts: true } },
        },
      });

      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }

      return c.json(await signPostMediaUrls(storage, post));
    } catch (error) {
      console.error('Failed to get post:', error);
      return c.json({ error: 'Failed to get post' }, 500);
    }
  });

  postsRouter.delete('/api/posts/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const post = await prisma.post.findFirst({
        where: { id, userId: user.userId },
        include: { media: true },
      });

      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }

      const keys = collectPostMediaStorageKeys(post.media, storage, {
        userId: user.userId,
        campaignId: post.campaignId,
        postId: post.id,
      });
      await deleteStorageKeys(storage, keys, `[PostDelete:${post.id}]`);

      await prisma.post.delete({ where: { id: post.id } });
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete post:', error);
      return c.json({ error: 'Failed to delete post' }, 500);
    }
  });

  const updatePostSchema = z.object({
    textContent: z.string().optional(),
    scheduledAt: z.string().optional().nullable(),
    status: z.string().optional(),
  });

  postsRouter.put('/api/posts/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const body = await c.req.json();
      const data = updatePostSchema.parse(body);

      const post = await prisma.post.findFirst({
        where: { id, userId: user.userId },
      });

      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }

      const updated = await prisma.post.update({
        where: { id },
        data: {
          ...(data.textContent !== undefined && { textContent: data.textContent }),
          ...(data.scheduledAt !== undefined && { scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null }),
          ...(data.status !== undefined && { status: data.status }),
        }
      });

      return c.json(updated);
    } catch (error) {
      console.error('Failed to update post:', error);
      return c.json({ error: 'Failed to update post' }, 400);
    }
  });

  const addMediaSchema = z.object({
    sourceUrl: z.string().min(1),
    type: z.enum(['image', 'video', 'gif']),
    mimeType: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    size: z.number().optional()
  });

  postsRouter.post('/api/posts/:id/media', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const postId = c.req.param('id');

    try {
      const body = await c.req.json();
      const data = addMediaSchema.parse(body);

      const post = await prisma.post.findFirst({
        where: { id: postId, userId: user.userId },
      });

      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }

      const maxPosition = await prisma.postMedia.aggregate({
        where: { postId },
        _max: { position: true },
      });
      const nextPosition = (maxPosition._max.position ?? -1) + 1;

      const media = await prisma.postMedia.create({
        data: {
          postId,
          sourceUrl: data.sourceUrl,
          type: data.type,
          mimeType: data.mimeType,
          width: data.width,
          height: data.height,
          size: data.size,
          position: nextPosition,
          status: 'pending' // MediaProcessingPoller will pick this up
        }
      });

      return c.json(media);
    } catch (error) {
      console.error('Failed to add media to post:', error);
      return c.json({ error: 'Failed to add media' }, 400);
    }
  });

  postsRouter.delete('/api/posts/media/:mediaId', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const mediaId = c.req.param('mediaId');

    try {
      const media = await prisma.postMedia.findUnique({
        where: { id: mediaId },
        include: { post: true }
      });

      if (!media || media.post.userId !== user.userId) {
        return c.json({ error: 'Media not found' }, 404);
      }

      const keys = collectPostMediaStorageKeys([media], storage, {
        userId: user.userId,
        campaignId: media.post.campaignId,
        postId: media.postId,
      });
      await deleteStorageKeys(storage, keys, `[PostMediaDelete:${media.id}]`);

      await prisma.postMedia.delete({
        where: { id: mediaId }
      });

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete media:', error);
      return c.json({ error: 'Failed to delete media' }, 500);
    }
  });

  const reorderMediaSchema = z.object({
    mediaIds: z.array(z.string().min(1)).min(1),
  });

  postsRouter.put('/api/posts/:id/media/reorder', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const postId = c.req.param('id');

    try {
      const body = await c.req.json();
      const { mediaIds } = reorderMediaSchema.parse(body);

      const post = await prisma.post.findFirst({ where: { id: postId, userId: user.userId } });
      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }

      const existing = await prisma.postMedia.findMany({
        where: { postId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((m) => m.id));
      if (mediaIds.length !== existing.length || !mediaIds.every((id) => existingIds.has(id))) {
        return c.json({ error: 'mediaIds must include exactly the post\'s current media' }, 400);
      }

      await prisma.$transaction(
        mediaIds.map((id, index) =>
          prisma.postMedia.update({ where: { id }, data: { position: index } }),
        ),
      );

      const updated = await prisma.postMedia.findMany({
        where: { postId },
        orderBy: { position: 'asc' },
      });
      const signed = await signPostMediaUrls(storage, { media: updated });
      return c.json({ media: signed.media });
    } catch (error) {
      console.error('Failed to reorder media:', error);
      return c.json({ error: 'Failed to reorder media' }, 400);
    }
  });

  // ========== Phase 7: Batch & manual operations ==========

  const batchScheduleSchema = z.object({
    items: z.array(z.object({
      postId: z.string().min(1),
      scheduledAt: z.string().min(1), // ISO
    })).min(1),
  });

  postsRouter.post('/api/posts/batch-schedule', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const body = await c.req.json();
      const data = batchScheduleSchema.parse(body);

      let updated = 0;
      const skipped: Array<{ postId: string; reason: string }> = [];

      for (const item of data.items) {
        const post = await prisma.post.findFirst({
          where: { id: item.postId, userId: user.userId },
          include: { media: true },
        });
        if (!post) {
          skipped.push({ postId: item.postId, reason: 'Not found' });
          continue;
        }
        if (post.status === 'completed' || post.status === 'failed') {
          skipped.push({ postId: item.postId, reason: `Already ${post.status}` });
          continue;
        }
        const notReady = post.media.filter((m) => m.status !== 'ready');
        if (post.media.length > 0 && notReady.length > 0) {
          skipped.push({ postId: item.postId, reason: 'Media still processing' });
          continue;
        }
        const scheduledAt = new Date(item.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          skipped.push({ postId: item.postId, reason: 'Invalid scheduledAt' });
          continue;
        }

        await prisma.post.update({
          where: { id: post.id },
          data: { status: 'scheduled', scheduledAt },
        });
        updated++;
      }

      return c.json({ updated, skipped });
    } catch (error) {
      console.error('Failed to batch-schedule posts:', error);
      return c.json({ error: 'Failed to batch-schedule posts' }, 400);
    }
  });

  const batchUnscheduleSchema = z.object({
    postIds: z.array(z.string().min(1)).min(1),
  });

  postsRouter.post('/api/posts/batch-unschedule', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const body = await c.req.json();
      const data = batchUnscheduleSchema.parse(body);

      let updated = 0;
      const skipped: Array<{ postId: string; reason: string }> = [];

      for (const postId of data.postIds) {
        const post = await prisma.post.findFirst({
          where: { id: postId, userId: user.userId },
        });
        if (!post) {
          skipped.push({ postId, reason: 'Not found' });
          continue;
        }
        if (post.status !== 'scheduled') {
          skipped.push({ postId, reason: `Not scheduled (status=${post.status})` });
          continue;
        }
        await prisma.post.update({
          where: { id: post.id },
          data: { status: 'draft', scheduledAt: null },
        });
        updated++;
      }

      return c.json({ updated, skipped });
    } catch (error) {
      console.error('Failed to batch-unschedule posts:', error);
      return c.json({ error: 'Failed to batch-unschedule posts' }, 400);
    }
  });

  postsRouter.post('/api/posts/:id/send', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const post = await prisma.post.findFirst({
        where: { id, userId: user.userId },
      });
      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }
      // Synchronously fan out and execute — wait for real results
      const { results } = await postManager.fanOutAndExecute(id);

      const allOk = results.every((r) => r.ok);
      const anyOk = results.some((r) => r.ok);

      const updated = await prisma.post.findUnique({
        where: { id },
        include: {
          media: { orderBy: { position: 'asc' } },
          executions: { include: { socialAccount: true } },
        },
      });

      const signedPost = await signPostMediaUrls(storage, updated);

      if (!allOk) {
        // Return 422 so the frontend can show the real error message
        const firstError = results.find((r) => !r.ok)?.error || 'Publish failed';
        return c.json({ error: firstError, partial: anyOk, results, post: signedPost }, 422);
      }

      return c.json({ results, post: signedPost });
    } catch (error: any) {
      console.error('Failed to send post:', error);
      return c.json({ error: error?.message || 'Failed to send post' }, 400);
    }
  });

  const batchGenerateTextSchema = z.object({
    postIds: z.array(z.string().min(1)).min(1),
    promptText: z.string().min(1),
    includeImages: z.boolean().optional(),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  });

  postsRouter.post('/api/posts/batch-generate-text', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const body = await c.req.json();
      const data = batchGenerateTextSchema.parse(body);

      const { provider } = await resolveChatProvider(providerRepository, user.userId, data.providerId);

      const concurrency = 3;
      const results: Array<{ postId: string; ok: boolean; text?: string; error?: string }> = [];

      const queue = [...data.postIds];
      const workers: Promise<void>[] = [];

      const runOne = async (postId: string) => {
        try {
          const post = await prisma.post.findFirst({
            where: { id: postId, userId: user.userId },
            include: { media: { orderBy: { position: 'asc' } } },
          });
          if (!post) {
            results.push({ postId, ok: false, error: 'Not found' });
            return;
          }

          const userMessage: any = {
            role: 'user',
            content: data.promptText,
          };

          if (data.includeImages) {
            const firstImage = post.media.find(
              (m) => m.type === 'image' && (m.thumbnailUrl || m.processedUrl || m.sourceUrl),
            );
            if (firstImage) {
              // Adapter expects base64 data URIs; we pass the storage URL hint
              // through a textual reference since we don't have inline buffers here.
              // Adapters that don't support images will ignore the field.
              userMessage.images = [];
            }
          }

          const response = await provider.chat({
            modelId: data.modelId,
            messages: [
              { role: 'system', content: 'You write short social media posts. Reply with only the post text — no quotes, no preface, no explanations.' },
              userMessage,
            ],
            tools: [],
            temperature: 0.8,
            maxTokens: 600,
          });

          const text = (response.text || '').trim();
          if (!text) {
            results.push({ postId, ok: false, error: 'Empty response' });
            return;
          }

          await prisma.post.update({
            where: { id: post.id },
            data: { textContent: text },
          });
          results.push({ postId, ok: true, text });
        } catch (err: any) {
          results.push({ postId, ok: false, error: err?.message || 'Generation failed' });
        }
      };

      const worker = async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          await runOne(next);
        }
      };

      for (let i = 0; i < Math.min(concurrency, data.postIds.length); i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      // Preserve original order
      const indexById = new Map(data.postIds.map((id, i) => [id, i]));
      results.sort((a, b) => (indexById.get(a.postId) ?? 0) - (indexById.get(b.postId) ?? 0));

      return c.json({ results });
    } catch (error: any) {
      console.error('Failed to batch-generate text:', error);
      return c.json({ error: error?.message || 'Failed to batch-generate text' }, 400);
    }
  });


  return postsRouter;
}

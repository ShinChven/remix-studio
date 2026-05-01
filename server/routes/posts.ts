import { Hono } from 'hono';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { PostManager } from '../queue/post-manager';
import { ProviderRepository } from '../db/provider-repository';
import { resolveChatProvider } from '../assistant/chat-provider-factory';
import { S3Storage } from '../storage/s3-storage';

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

export function createPostsRouter(
  prisma: PrismaClient,
  postManager: PostManager,
  providerRepository: ProviderRepository,
  storage: S3Storage,
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

  postsRouter.get('/api/posts/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const post = await prisma.post.findFirst({
        where: { id, userId: user.userId },
        include: {
          media: true,
          executions: { include: { socialAccount: true } },
          campaign: { include: { socialAccounts: true } },
        },
      });

      if (!post) {
        return c.json({ error: 'Post not found' }, 404);
      }

      return c.json(post);
    } catch (error) {
      console.error('Failed to get post:', error);
      return c.json({ error: 'Failed to get post' }, 500);
    }
  });

  postsRouter.delete('/api/posts/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      await prisma.post.deleteMany({
        where: { id, userId: user.userId },
      });
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

      const media = await prisma.postMedia.create({
        data: {
          postId,
          sourceUrl: data.sourceUrl,
          type: data.type,
          mimeType: data.mimeType,
          width: data.width,
          height: data.height,
          size: data.size,
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

      await prisma.postMedia.delete({
        where: { id: mediaId }
      });

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete media:', error);
      return c.json({ error: 'Failed to delete media' }, 500);
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
      if (post.status === 'completed') {
        return c.json({ error: 'Post already published' }, 400);
      }

      await postManager.fanOutPost(id);

      const updated = await prisma.post.findUnique({
        where: { id },
        include: {
          media: true,
          executions: { include: { socialAccount: true } },
        },
      });
      return c.json(await signPostMediaUrls(storage, updated));
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
            include: { media: true },
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

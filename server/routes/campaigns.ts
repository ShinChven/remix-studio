import { Hono } from 'hono';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { S3Storage } from '../storage/s3-storage';
import { collectPostMediaStorageKeys, deleteStorageKeys, safeStorageKeyPart } from '../utils/post-media-cleanup';

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

export function createCampaignsRouter(prisma: PrismaClient, storage: S3Storage) {
  const campaignsRouter = new Hono<{ Variables: { user: JwtPayload } }>();

  // Must be registered BEFORE /api/campaigns/:id to avoid being caught by the param route
  campaignsRouter.get('/api/campaigns/recent-posts', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const limitRaw = Number(c.req.query('limit') ?? 20);
    const limit = Math.max(1, Math.min(100, Number.isNaN(limitRaw) ? 20 : limitRaw));

    try {
      const posts = await prisma.post.findMany({
        where: {
          userId: user.userId,
          status: { in: ['completed', 'failed'] },
        },
        include: {
          campaign: { select: { id: true, name: true } },
          media: { select: { id: true, thumbnailUrl: true, processedUrl: true, sourceUrl: true, type: true } },
          executions: {
            include: { socialAccount: { select: { id: true, platform: true, profileName: true, avatarUrl: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      // Presign thumbnail URLs
      const signed = await Promise.all(
        posts.map(async (post) => ({
          ...post,
          media: await Promise.all(
            post.media.map(async (m) => ({
              ...m,
              thumbnailUrl: await presignStorageValue(storage, m.thumbnailUrl),
              processedUrl: await presignStorageValue(storage, m.processedUrl),
              sourceUrl: await presignStorageValue(storage, m.sourceUrl),
            })),
          ),
        })),
      );

      return c.json(signed);
    } catch (error) {
      console.error('Failed to get recent posts:', error);
      return c.json({ error: 'Failed to fetch recent posts' }, 500);
    }
  });

  // Daily delivery counts for the posting-trend chart.
  // Buckets executions by the user's local date so the chart lines up with the
  // day boundaries they see everywhere else in the UI.
  campaignsRouter.get('/api/campaigns/posted-counts', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const from = c.req.query('from');
    const to = c.req.query('to');
    const timezoneOffsetMinutes = Number(c.req.query('timezoneOffsetMinutes') || 0);

    if (!from || !to) {
      return c.json({ error: 'Missing from or to parameters' }, 400);
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return c.json({ error: 'Invalid from or to parameters' }, 400);
    }

    try {
      const executions = await prisma.postExecution.findMany({
        where: {
          post: { userId: user.userId },
          OR: [
            { status: 'posted', publishedAt: { gte: fromDate, lte: toDate } },
            { status: 'failed', updatedAt: { gte: fromDate, lte: toDate } },
          ],
        },
        select: { status: true, publishedAt: true, updatedAt: true },
      });

      const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
      const counts: Record<string, { date: string; posted: number; failed: number }> = {};

      executions.forEach((execution) => {
        const at = execution.status === 'posted'
          ? (execution.publishedAt ?? execution.updatedAt)
          : execution.updatedAt;
        if (!at) return;

        const dateKey = new Date(at.getTime() - offsetMinutes * 60000).toISOString().split('T')[0];
        if (!counts[dateKey]) counts[dateKey] = { date: dateKey, posted: 0, failed: 0 };
        if (execution.status === 'posted') counts[dateKey].posted++;
        else counts[dateKey].failed++;
      });

      return c.json(Object.values(counts).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error) {
      console.error('Failed to get posted counts:', error);
      return c.json({ error: 'Failed to fetch posted counts' }, 500);
    }
  });

  campaignsRouter.get('/api/campaigns/history', authMiddleware, async (c) => {
    console.log('[DEBUG] GET /api/campaigns/history called');
    const user = c.get('user') as JwtPayload;
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const pageSize = Math.max(1, Math.min(100, Number(c.req.query('pageSize') || 25)));
    const skip = (page - 1) * pageSize;

    const startDateRaw = c.req.query('startDate');
    const endDateRaw = c.req.query('endDate');
    const q = c.req.query('q');
    const timezoneOffsetMinutes = Number(c.req.query('timezoneOffsetMinutes') || 0);
    const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;

    // A bare `YYYY-MM-DD` is a day on the caller's calendar, so shift it by their
    // UTC offset instead of assuming the day starts at UTC midnight.
    const dayBoundary = (raw: string, edge: 'start' | 'end') => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const parsed = new Date(raw);
        if (edge === 'end' && !Number.isNaN(parsed.getTime())) parsed.setUTCHours(23, 59, 59, 999);
        return parsed;
      }
      const suffix = edge === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
      return new Date(new Date(`${raw}${suffix}`).getTime() + offsetMinutes * 60000);
    };

    const dateFilter: any = {};
    if (startDateRaw) {
      const start = dayBoundary(startDateRaw, 'start');
      if (!Number.isNaN(start.getTime())) dateFilter.gte = start;
    }
    if (endDateRaw) {
      const end = dayBoundary(endDateRaw, 'end');
      if (!Number.isNaN(end.getTime())) dateFilter.lte = end;
    }

    const whereClause: any = {
      userId: user.userId,
      status: { in: ['completed', 'failed'] },
    };

    if (Object.keys(dateFilter).length > 0) {
      whereClause.updatedAt = dateFilter;
    }

    if (q) {
      whereClause.OR = [
        { textContent: { contains: q, mode: 'insensitive' } },
        { campaign: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }

    try {
      console.log(`[DEBUG] Fetching history for user ${user.userId}, page ${page}, size ${pageSize}`);
      const [total, posts] = await Promise.all([
        prisma.post.count({
          where: whereClause,
        }),
        prisma.post.findMany({
          where: whereClause,
          include: {
            campaign: { select: { id: true, name: true } },
            media: { select: { id: true, thumbnailUrl: true, processedUrl: true, sourceUrl: true, type: true } },
            executions: {
              include: { socialAccount: { select: { id: true, platform: true, profileName: true, avatarUrl: true } } },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ]);

      console.log(`[DEBUG] Found ${posts.length} posts out of ${total}`);

      // Presign URLs
      const signed = await Promise.all(
        posts.map(async (post) => ({
          ...post,
          media: await Promise.all(
            post.media.map(async (m) => ({
              ...m,
              thumbnailUrl: await presignStorageValue(storage, m.thumbnailUrl),
              processedUrl: await presignStorageValue(storage, m.processedUrl),
              sourceUrl: await presignStorageValue(storage, m.sourceUrl),
            })),
          ),
        })),
      );

      console.log(`[DEBUG] Presigned URLs for history`);

      return c.json({
        items: signed,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error) {
      console.error('Failed to get campaign history:', error);
      return c.json({ error: 'Failed to fetch campaign history: ' + String(error) }, 500);
    }
  });

  campaignsRouter.get('/api/campaigns', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const [campaigns, completedCounts, postDates] = await Promise.all([
        prisma.campaign.findMany({
          where: { userId: user.userId },
          include: {
            socialAccounts: true,
            posts: { 
              include: { media: true },
              orderBy: { createdAt: 'desc' },
              take: 20
            },
            _count: { select: { posts: true } },
          },
          orderBy: { createdAt: 'desc' }
        }),
        // Get completed posts count per campaign for accurate status display
        prisma.post.groupBy({
          by: ['campaignId'],
          where: {
            userId: user.userId,
            status: { in: ['completed', 'posted'] }
          },
          _count: { id: true }
        }),
        prisma.post.groupBy({
          by: ['campaignId'],
          where: {
            userId: user.userId,
            scheduledAt: { not: null }
          },
          _min: { scheduledAt: true },
          _max: { scheduledAt: true }
        })
      ]);

      const countMap = new Map(completedCounts.map(item => [item.campaignId, item._count.id]));
      const dateMap = new Map(postDates.map(item => [item.campaignId, { min: item._min.scheduledAt, max: item._max.scheduledAt }]));

      // Presign URLs and fix BigInt serialization
      const signedCampaigns = await Promise.all(
        campaigns.map(async (campaign) => {
          const dates = dateMap.get(campaign.id);
          return {
            ...campaign,
            completedPostsCount: countMap.get(campaign.id) || 0,
            scheduledStart: dates?.min || null,
            scheduledEnd: dates?.max || null,
            posts: await Promise.all(
              campaign.posts.map(async (post) => ({
                ...post,
                media: await Promise.all(
                  post.media.map(async (m) => ({
                    ...m,
                    size: m.size != null ? Number(m.size) : null,
                    thumbnailUrl: await presignStorageValue(storage, m.thumbnailUrl),
                    processedUrl: await presignStorageValue(storage, m.processedUrl),
                    sourceUrl: await presignStorageValue(storage, m.sourceUrl),
                  })),
                ),
              })),
            ),
          };
        })
      );

      return c.json(signedCampaigns);
    } catch (error) {
      console.error('Failed to get campaigns:', error);
      return c.json({ error: 'Failed to list campaigns' }, 500);
    }
  });

  const createCampaignSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    socialAccountIds: z.array(z.string()).optional(),
  });

  campaignsRouter.post('/api/campaigns', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const body = await c.req.json();
      const data = createCampaignSchema.parse(body);

      const campaign = await prisma.campaign.create({
        data: {
          userId: user.userId,
          name: data.name,
          description: data.description,
          ...(data.socialAccountIds && data.socialAccountIds.length > 0 ? {
            socialAccounts: {
              connect: data.socialAccountIds.map(id => ({ id }))
            }
          } : {})
        },
        include: { socialAccounts: true }
      });
      return c.json(campaign);
    } catch (error) {
      console.error('Failed to create campaign:', error);
      return c.json({ error: 'Failed to create campaign' }, 400);
    }
  });

  campaignsRouter.get('/api/campaigns/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');
    const includePosts = c.req.query('includePosts') !== 'false';
    
    try {
      const campaign = await prisma.campaign.findFirst({
        where: { id, userId: user.userId },
        include: {
          socialAccounts: true,
          ...(includePosts ? { posts: {
            include: {
              media: { orderBy: { position: 'asc' } },
              executions: { include: { socialAccount: true } }
            },
            orderBy: { createdAt: 'desc' }
          } } : {})
        }
      });
      
      if (!campaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }
      if (!includePosts) {
        return c.json(campaign);
      }
      return c.json({
        ...campaign,
        posts: await Promise.all((campaign as any).posts.map((post: any) => signPostMediaUrls(storage, post))),
      });
    } catch (error) {
      console.error('Failed to get campaign:', error);
      return c.json({ error: 'Failed to get campaign' }, 500);
    }
  });

  const updateCampaignSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional().nullable(),
    socialAccountIds: z.array(z.string()).optional(),
    status: z.string().optional(),
  });

  campaignsRouter.put('/api/campaigns/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const body = await c.req.json();
      const data = updateCampaignSchema.parse(body);

      const campaign = await prisma.campaign.findFirst({
        where: { id, userId: user.userId },
      });

      if (!campaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }

      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status && { status: data.status }),
          ...(data.socialAccountIds !== undefined ? {
            socialAccounts: {
              set: data.socialAccountIds.map(id => ({ id }))
            }
          } : {})
        },
        include: { socialAccounts: true }
      });

      return c.json(updated);
    } catch (error) {
      console.error('Failed to update campaign:', error);
      return c.json({ error: 'Failed to update campaign' }, 400);
    }
  });

  campaignsRouter.delete('/api/campaigns/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const campaign = await prisma.campaign.findFirst({
        where: { id, userId: user.userId },
        include: {
          posts: {
            include: { media: true },
          },
        },
      });

      if (!campaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }

      const keys = new Set<string>();
      for (const post of campaign.posts) {
        const postKeys = collectPostMediaStorageKeys(post.media, storage, {
          userId: user.userId,
          campaignId: campaign.id,
        });
        postKeys.forEach((key) => keys.add(key));
      }

      // New batch imports live under this dedicated prefix. Listing it also
      // cleans up files that were written before a DB transaction failed.
      try {
        const importedPrefix = `campaigns/${safeStorageKeyPart(campaign.id)}/`;
        const importedObjects = await storage.listObjects(importedPrefix);
        importedObjects.forEach((key) => keys.add(key));
      } catch (storageError) {
        console.warn(`[CampaignDelete:${campaign.id}] Failed to list campaign storage prefix:`, storageError);
      }

      await deleteStorageKeys(storage, Array.from(keys), `[CampaignDelete:${campaign.id}]`);

      await prisma.campaign.delete({
        where: { id },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      return c.json({ error: 'Failed to delete campaign' }, 500);
    }
  });

  return campaignsRouter;
}

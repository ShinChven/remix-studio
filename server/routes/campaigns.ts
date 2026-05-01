import { Hono } from 'hono';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';

export function createCampaignsRouter(prisma: PrismaClient) {
  const campaignsRouter = new Hono();

  campaignsRouter.get('/api/campaigns', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const campaigns = await prisma.campaign.findMany({
        where: { userId: user.userId },
        include: { socialAccounts: true, _count: { select: { posts: true } } },
        orderBy: { createdAt: 'desc' }
      });
      return c.json(campaigns);
    } catch (error) {
      console.error('Failed to get campaigns:', error);
      return c.json({ error: 'Failed to list campaigns' }, 500);
    }
  });

  const createCampaignSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
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
    
    try {
      const campaign = await prisma.campaign.findFirst({
        where: { id, userId: user.userId },
        include: { socialAccounts: true }
      });
      
      if (!campaign) {
        return c.json({ error: 'Campaign not found' }, 404);
      }
      return c.json(campaign);
    } catch (error) {
      console.error('Failed to get campaign:', error);
      return c.json({ error: 'Failed to get campaign' }, 500);
    }
  });

  return campaignsRouter;
}

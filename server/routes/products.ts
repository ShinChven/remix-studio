import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { DeliveryManager } from '../queue/delivery-manager';

interface CreateProductBody {
  storeId: string;
  exportTaskId: string;
  title: string;
  priceCents: number;
  currency?: string;
  description?: string | null;
  taxonomyId?: string | null;
  tags?: string[];
  coverItems?: { albumItemId: string; useRaw?: boolean }[];
  publishImmediately?: boolean;
}

function sanitizeBody(body: any): CreateProductBody {
  if (!body || typeof body !== 'object') throw new Error('Invalid body');
  const storeId = String(body.storeId || '');
  const exportTaskId = String(body.exportTaskId || '');
  const title = String(body.title || '').trim();
  const priceCents = Number(body.priceCents);
  if (!storeId) throw new Error('storeId is required');
  if (!exportTaskId) throw new Error('exportTaskId is required');
  if (!title) throw new Error('title is required');
  if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error('priceCents must be a non-negative number');

  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0).slice(0, 30)
    : [];
  const coverItems = Array.isArray(body.coverItems)
    ? body.coverItems
        .map((c: any) => ({ albumItemId: String(c?.albumItemId || ''), useRaw: !!c?.useRaw }))
        .filter((c: any) => !!c.albumItemId)
        .slice(0, 8)
    : [];

  return {
    storeId,
    exportTaskId,
    title,
    priceCents: Math.round(priceCents),
    currency: body.currency ? String(body.currency).toLowerCase() : 'usd',
    description: body.description ? String(body.description) : null,
    taxonomyId: body.taxonomyId ? String(body.taxonomyId) : null,
    tags,
    coverItems,
    publishImmediately: !!body.publishImmediately,
  };
}

export function createProductsRouter(prisma: PrismaClient, deliveryManager: DeliveryManager) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  // List the authenticated user's products
  router.get('/api/products', authMiddleware, async (c) => {
    const user = c.get('user');
    const products = await prisma.product.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        storeId: true,
        exportTaskId: true,
        title: true,
        priceCents: true,
        currency: true,
        status: true,
        gumroadProductId: true,
        gumroadShortUrl: true,
        errorMsg: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return c.json(products);
  });

  router.get('/api/products/:id', authMiddleware, async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const product = await prisma.product.findFirst({
      where: { id, userId: user.userId },
    });
    if (!product) return c.json({ error: 'Product not found' }, 404);
    return c.json(product);
  });

  router.post('/api/products', authMiddleware, async (c) => {
    const user = c.get('user');

    let parsed: CreateProductBody;
    try {
      parsed = sanitizeBody(await c.req.json());
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }

    // Verify store belongs to user
    const store = await prisma.store.findFirst({
      where: { id: parsed.storeId, userId: user.userId },
    });
    if (!store) return c.json({ error: 'Store not found' }, 404);

    // Verify export task belongs to user and is completed
    const exportTask = await prisma.exportTask.findFirst({
      where: { id: parsed.exportTaskId, userId: user.userId },
    });
    if (!exportTask) return c.json({ error: 'Export task not found' }, 404);
    if (exportTask.status !== 'completed') {
      return c.json({ error: 'Export task is not completed' }, 400);
    }

    const product = await prisma.product.create({
      data: {
        userId: user.userId,
        storeId: store.id,
        exportTaskId: exportTask.id,
        title: parsed.title,
        description: parsed.description,
        priceCents: parsed.priceCents,
        currency: parsed.currency ?? 'usd',
        taxonomyId: parsed.taxonomyId,
        tags: parsed.tags ?? [],
        coverItems: parsed.coverItems ?? [],
        status: 'draft',
      },
    });

    if (parsed.publishImmediately) {
      const deliveryTaskId = await deliveryManager.startDelivery(user.userId, exportTask.id, {
        destination: 'gumroad',
        productId: product.id,
      });
      return c.json({ product, deliveryTaskId }, 202);
    }

    return c.json({ product }, 201);
  });

  // Manually trigger publish for an existing product (e.g. retry)
  router.post('/api/products/:id/publish', authMiddleware, async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const product = await prisma.product.findFirst({
      where: { id, userId: user.userId },
    });
    if (!product) return c.json({ error: 'Product not found' }, 404);
    if (product.status === 'publishing') {
      return c.json({ error: 'Product is already being published' }, 409);
    }
    if (!product.exportTaskId) {
      return c.json({ error: 'Product has no export to publish' }, 400);
    }

    const deliveryTaskId = await deliveryManager.startDelivery(user.userId, product.exportTaskId, {
      destination: 'gumroad',
      productId: product.id,
    });
    return c.json({ deliveryTaskId }, 202);
  });

  return router;
}

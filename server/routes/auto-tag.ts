import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware, JwtPayload } from '../auth/auth';
import {
  AUTO_TAG_CONCURRENCY_LIMIT,
  AutoTagSettings,
  ProviderType,
  getProviderRecordModels,
  providerAcceptsImageInput,
} from '../../src/types';

const autoTagSettingsSchema = z.object({
  providerId: z.string().min(1).nullable(),
  modelConfigId: z.string().min(1).nullable(),
  concurrencyLimit: z.number().int().min(AUTO_TAG_CONCURRENCY_LIMIT.min).max(AUTO_TAG_CONCURRENCY_LIMIT.max),
});

/** The provider's text models when it can read images, or null when it cannot tag. */
function taggingModelIds(provider: { type: string; models: unknown }): Set<string> | null {
  if (!providerAcceptsImageInput(provider.type as ProviderType)) return null;
  return new Set(getProviderRecordModels(provider).filter((m) => m.category === 'text').map((m) => m.id));
}

export function createAutoTagRouter(prisma: PrismaClient) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  router.get('/api/settings/auto-tag', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    try {
      const setting = await prisma.autoTagSetting.findUnique({
        where: { userId: user.userId },
        include: { provider: { select: { type: true, models: true } } },
      });
      if (!setting) {
        return c.json<AutoTagSettings>({ providerId: null, modelConfigId: null, concurrencyLimit: AUTO_TAG_CONCURRENCY_LIMIT.default });
      }

      // The provider may since have been deleted, or the custom model removed
      // from it; report what can still run rather than a dangling choice.
      const modelIds = setting.provider ? taggingModelIds(setting.provider) : null;
      const usable = Boolean(modelIds && setting.modelConfigId && modelIds.has(setting.modelConfigId));
      return c.json<AutoTagSettings>({
        providerId: modelIds ? setting.providerId : null,
        modelConfigId: usable ? setting.modelConfigId : null,
        concurrencyLimit: setting.concurrencyLimit,
      });
    } catch (e) {
      console.error('[GET /api/settings/auto-tag]', e);
      return c.json({ error: 'Failed to load auto-tagging settings' }, 500);
    }
  });

  router.put('/api/settings/auto-tag', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const parsed = autoTagSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid auto-tagging settings' }, 400);
    }

    const { providerId, concurrencyLimit } = parsed.data;
    const modelConfigId = providerId ? parsed.data.modelConfigId : null;

    if (providerId) {
      const provider = await prisma.provider.findFirst({
        where: { id: providerId, userId: user.userId },
        select: { type: true, models: true },
      });
      if (!provider) return c.json({ error: 'Provider not found' }, 404);

      const modelIds = taggingModelIds(provider);
      if (!modelIds) return c.json({ error: 'This provider cannot read images' }, 400);
      if (!modelConfigId || !modelIds.has(modelConfigId)) {
        return c.json({ error: 'Choose a text model from this provider' }, 400);
      }
    }

    try {
      const data = { providerId, modelConfigId, concurrencyLimit };
      const saved = await prisma.autoTagSetting.upsert({
        where: { userId: user.userId },
        update: data,
        create: { userId: user.userId, ...data },
      });
      return c.json<AutoTagSettings>({
        providerId: saved.providerId,
        modelConfigId: saved.modelConfigId,
        concurrencyLimit: saved.concurrencyLimit,
      });
    } catch (e) {
      console.error('[PUT /api/settings/auto-tag]', e);
      return c.json({ error: 'Failed to save auto-tagging settings' }, 500);
    }
  });

  return router;
}

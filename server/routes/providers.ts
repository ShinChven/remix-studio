import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { ProviderRepository } from '../db/provider-repository';
import type { ProviderType } from '../../src/types';
import crypto from 'crypto';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

const VALID_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'RunningHub', 'OpenAI', 'Grok', 'Claude'];
type Variables = { user: JwtPayload };

export function createProviderRouter(repo: ProviderRepository) {
  const router = new Hono<{ Variables: Variables }>();

  function normalizeConcurrency(value: unknown, fallback: number) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.floor(value));
  }

  // List all providers for the current user (no raw API keys)
  router.get('/api/providers', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const providers = await repo.listProviders(user.userId);
      return c.json(providers);
    } catch (e) {
      console.error('[GET /api/providers]', e);
      return c.json({ error: 'Failed to list providers' }, 500);
    }
  });

  // Get one provider for the current user (no raw API keys)
  router.get('/api/providers/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const providerId = c.req.param('id');
      const provider = await repo.getPublicProvider(user.userId, providerId);
      if (!provider) return c.json({ error: 'Provider not found' }, 404);
      return c.json(provider);
    } catch (e) {
      console.error('[GET /api/providers/:id]', e);
      return c.json({ error: 'Failed to get provider' }, 500);
    }
  });

  // Create a new provider
  router.post('/api/providers', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();

      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const type = body?.type as ProviderType;
      const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
      const apiUrl = typeof body?.apiUrl === 'string' ? body.apiUrl.trim() || undefined : undefined;
      const concurrency = normalizeConcurrency(body?.concurrency, 1);

      if (!name) return c.json({ error: 'name is required' }, 400);
      if (!VALID_TYPES.includes(type)) return c.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
      if (!apiKey) return c.json({ error: 'apiKey is required' }, 400);

      const id = crypto.randomUUID();
      await repo.createProvider(user.userId, {
        id,
        name,
        type,
        apiKey,
        apiUrl: assertSafeProviderApiUrl(type, apiUrl),
        concurrency,
      });
      return c.json({ id }, 201);
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.startsWith('Provider API URL')) {
        return c.json({ error: e.message }, 400);
      }
      console.error('[POST /api/providers]', e);
      return c.json({ error: e?.message || 'Failed to create provider' }, 500);
    }
  });

  // Update a provider (apiKey is optional — omit to keep existing)
  router.put('/api/providers/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const providerId = c.req.param('id');
      const body = await c.req.json();

      const updates: {
        name?: string;
        type?: ProviderType;
        apiKey?: string;
        apiUrl?: string | null;
        concurrency?: number;
      } = {};

      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (body?.type !== undefined) {
        if (!VALID_TYPES.includes(body.type)) return c.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
        updates.type = body.type;
      }
      if (typeof body?.apiKey === 'string' && body.apiKey.trim()) {
        updates.apiKey = body.apiKey.trim();
      }
      // null = clear; string = update; undefined = leave unchanged
      if (body?.apiUrl === null) {
        updates.apiUrl = null;
      } else if (typeof body?.apiUrl === 'string') {
        updates.apiUrl = body.apiUrl.trim() || null;
      }

      if (body?.concurrency !== undefined) {
        updates.concurrency = normalizeConcurrency(body.concurrency, 1);
      }

      const effectiveType = updates.type ?? body?.type ?? (await repo.getProvider(user.userId, providerId))?.type;
      if (!effectiveType) return c.json({ error: 'Provider not found' }, 404);
      if (updates.apiUrl !== undefined) {
        updates.apiUrl = assertSafeProviderApiUrl(effectiveType, updates.apiUrl);
      }

      await repo.updateProvider(user.userId, providerId, updates);
      return c.json({ success: true });
    } catch (e: any) {
      if (e?.message === 'Provider not found') return c.json({ error: 'Provider not found' }, 404);
      if (typeof e?.message === 'string' && e.message.startsWith('Provider API URL')) {
        return c.json({ error: e.message }, 400);
      }
      console.error('[PUT /api/providers/:id]', e);
      return c.json({ error: e?.message || 'Failed to update provider' }, 500);
    }
  });

  // Delete a provider
  router.delete('/api/providers/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const providerId = c.req.param('id');
      await repo.deleteProvider(user.userId, providerId);
      return c.json({ success: true });
    } catch (e: any) {
      if (e?.message === 'Provider not found') return c.json({ error: 'Provider not found' }, 404);
      console.error('[DELETE /api/providers/:id]', e);
      return c.json({ error: 'Failed to delete provider' }, 500);
    }
  });

  return router;
}

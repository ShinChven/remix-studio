import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { ProviderRepository } from '../db/provider-repository';
import { CivitaiApiError, CivitaiClient } from '../civitai/civitai-client';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

type Variables = { user: JwtPayload };

const MAX_INPUT_LENGTH = 2000;

export function createCivitaiRouter(providerRepo: ProviderRepository) {
  const router = new Hono<{ Variables: Variables }>();

  /**
   * POST /api/civitai/resolve
   *
   * Look up a Civitai model by its page link or AIR with the token of one of
   * the user's Civitai providers, and return it as a resource a Civitai
   * project can generate with: its AIR, name, type, base model and trigger
   * words.
   */
  router.post('/api/civitai/resolve', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const body = await c.req.json().catch(() => ({}));
    const value = typeof body?.value === 'string' ? body.value.trim() : '';
    if (!value) return c.json({ error: 'value is required' }, 400);
    if (value.length > MAX_INPUT_LENGTH) return c.json({ error: 'value is too long' }, 400);
    if (typeof body?.providerId !== 'string' || !body.providerId) {
      return c.json({ error: 'Choose a Civitai account first' }, 400);
    }

    const provider = await providerRepo.getProvider(user.userId, body.providerId);
    if (!provider || provider.type !== 'Civitai') {
      return c.json({ error: 'Civitai provider not found' }, 404);
    }
    const apiKey = await providerRepo.getDecryptedApiKey(user.userId, provider.id);
    if (!apiKey) return c.json({ error: 'The Civitai provider has no API token' }, 400);

    try {
      const client = new CivitaiClient(apiKey, assertSafeProviderApiUrl('Civitai', provider.apiUrl));
      return c.json(await client.resolveResource(value));
    } catch (e: any) {
      if (e instanceof CivitaiApiError && e.status === 404) {
        return c.json({ error: 'Civitai has no model at that link or AIR' }, 404);
      }
      const cause = e?.cause?.code || e?.cause?.message;
      const message = e?.name === 'TimeoutError'
        ? 'Civitai did not answer in time'
        : cause ? `${e.message} (${cause})` : (e?.message || 'Looking up the model on Civitai failed');
      return c.json({ error: message }, e instanceof CivitaiApiError ? 502 : 400);
    }
  });

  return router;
}

import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { ProviderRepository } from '../db/provider-repository';
import { CivitaiApiError, CivitaiClient } from '../civitai/civitai-client';
import { assertSafeProviderApiUrl } from '../utils/url-safety';

type Variables = { user: JwtPayload };

const MAX_INPUT_LENGTH = 2000;

const CHECKPOINT_TYPES = ['Checkpoint'];
const NETWORK_TYPES = ['LORA', 'LoCon', 'DoRA', 'TextualInversion'];

function describeLookupError(e: any, fallback: string): string {
  const cause = e?.cause?.code || e?.cause?.message;
  if (e?.name === 'TimeoutError') return 'Civitai did not answer in time';
  return cause ? `${e.message} (${cause})` : (e?.message || fallback);
}

export function createCivitaiRouter(providerRepo: ProviderRepository) {
  const router = new Hono<{ Variables: Variables }>();

  /** A client with the token of one of the user's Civitai providers. */
  const clientFor = async (userId: string, providerId: unknown): Promise<{ client: CivitaiClient } | { error: string; status: 400 | 404 }> => {
    if (typeof providerId !== 'string' || !providerId) return { error: 'Choose a Civitai account first', status: 400 };
    const provider = await providerRepo.getProvider(userId, providerId);
    if (!provider || provider.type !== 'Civitai') return { error: 'Civitai provider not found', status: 404 };
    const apiKey = await providerRepo.getDecryptedApiKey(userId, provider.id);
    if (!apiKey) return { error: 'The Civitai provider has no API token', status: 400 };
    try {
      return { client: new CivitaiClient(apiKey, assertSafeProviderApiUrl('Civitai', provider.apiUrl)) };
    } catch (e: any) {
      return { error: e?.message || 'Invalid Civitai API URL', status: 400 };
    }
  };

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
    const client = await clientFor(user.userId, body?.providerId);
    if ('error' in client) return c.json({ error: client.error }, client.status);
    try {
      return c.json(await client.client.resolveResource(value));
    } catch (e: any) {
      if (e instanceof CivitaiApiError && e.status === 404) {
        return c.json({ error: 'Civitai has no model at that link or AIR' }, 404);
      }
      return c.json({ error: describeLookupError(e, 'Looking up the model on Civitai failed') }, e instanceof CivitaiApiError ? 502 : 400);
    }
  });

  /**
   * POST /api/civitai/search
   *
   * Search Civitai's catalog by name for the models a slot takes: checkpoints,
   * or LoRAs and embeddings. A result is resolved with /api/civitai/resolve
   * once picked, which is what reports its AIR.
   */
  router.post('/api/civitai/search', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const body = await c.req.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) return c.json({ error: 'query is required' }, 400);
    if (query.length > 200) return c.json({ error: 'query is too long' }, 400);
    const types = body?.slot === 'checkpoint' ? CHECKPOINT_TYPES : NETWORK_TYPES;
    // A video project looks for LoRAs made for its engine.
    const baseModels = Array.isArray(body?.baseModels)
      ? body.baseModels.filter((value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 100).slice(0, 10)
      : [];

    const client = await clientFor(user.userId, body?.providerId);
    if ('error' in client) return c.json({ error: client.error }, client.status);
    try {
      return c.json(await client.client.searchModels(query, types, baseModels));
    } catch (e: any) {
      return c.json({ error: describeLookupError(e, 'Searching Civitai failed') }, e instanceof CivitaiApiError ? 502 : 400);
    }
  });

  return router;
}

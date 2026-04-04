import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { ProviderRepository } from '../db/provider-repository';
import { buildGenerator } from '../generators/build-generator';
import type { ProviderType } from '../../src/types';

type Variables = { user: JwtPayload };

const VALID_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'];
const VALID_IMAGE_SIZES   = ['1K', '4K'];

export function createGenerateRouter(providerRepo: ProviderRepository) {
  const router = new Hono<{ Variables: Variables }>();

  /**
   * POST /api/generate
   *
   * Body:
   *   providerId   string   — which provider record to use
   *   prompt       string   — generation prompt
   *   aspectRatio  string?  — e.g. "2:3" (default)
   *   imageSize    string?  — "1K" | "4K" (default "1K")
   *   refImage     string?  — base64 PNG for img2img (no data-URL prefix)
   *
   * Returns: { image: "<base64 PNG>" }
   */
  router.post('/api/generate', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();

      const providerId  = typeof body?.providerId  === 'string' ? body.providerId.trim()  : '';
      const prompt      = typeof body?.prompt      === 'string' ? body.prompt.trim()      : '';
      const aspectRatio = typeof body?.aspectRatio === 'string' ? body.aspectRatio.trim() : '2:3';
      const imageSize   = typeof body?.imageSize   === 'string' ? body.imageSize.trim()   : '1K';
      const refImage    = typeof body?.refImage    === 'string' ? body.refImage          : undefined;

      if (!providerId) return c.json({ error: 'providerId is required' }, 400);
      if (!prompt)     return c.json({ error: 'prompt is required' }, 400);
      if (!VALID_ASPECT_RATIOS.includes(aspectRatio))
        return c.json({ error: `aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(', ')}` }, 400);
      if (!VALID_IMAGE_SIZES.includes(imageSize))
        return c.json({ error: `imageSize must be one of: ${VALID_IMAGE_SIZES.join(', ')}` }, 400);

      // Fetch provider and decrypt key (server-side only)
      const record = await providerRepo.getProvider(user.userId, providerId);
      if (!record) return c.json({ error: 'Provider not found' }, 404);

      const apiKey = await providerRepo.getDecryptedApiKey(user.userId, providerId);
      if (!apiKey) return c.json({ error: 'Provider has no API key stored' }, 400);

      const generator = buildGenerator(record.type as ProviderType, apiKey, record.apiUrl);
      const result = await generator.generate({ prompt, aspectRatio, imageSize, refImageBase64: refImage });

      if (result.ok === false) {
        return c.json({ error: result.error }, 502);
      }

      const base64 = result.imageBytes.toString('base64');
      return c.json({ image: base64 });
    } catch (e) {
      console.error('[POST /api/generate]', e);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return router;
}

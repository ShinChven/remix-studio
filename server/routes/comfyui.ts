import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { ComfyClient } from '../comfyui/comfy-client';
import { normalizeComfyAddress } from '../../src/lib/comfyWorkflow';

type Variables = { user: JwtPayload };

export function createComfyUIRouter() {
  const router = new Hono<{ Variables: Variables }>();

  /**
   * POST /api/comfyui/test
   *
   * Check that the server can reach a ComfyUI instance. Generation runs on the
   * server, so the address must be reachable from here, not just the browser.
   */
  router.post('/api/comfyui/test', authMiddleware, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body?.url !== 'string' || !body.url.trim()) {
      return c.json({ error: 'url is required' }, 400);
    }

    let url: string;
    try {
      url = normalizeComfyAddress(body.url);
    } catch (e: any) {
      return c.json({ error: e?.message || 'Invalid ComfyUI URL' }, 400);
    }

    try {
      const stats = await new ComfyClient(url).systemStats();
      const device = Array.isArray(stats?.devices) ? stats.devices[0] : undefined;
      return c.json({
        ok: true,
        url,
        version: stats?.system?.comfyui_version,
        device: device?.name,
        vramTotal: typeof device?.vram_total === 'number' ? device.vram_total : undefined,
        vramFree: typeof device?.vram_free === 'number' ? device.vram_free : undefined,
      });
    } catch (e: any) {
      const cause = e?.cause?.code || e?.cause?.message;
      return c.json({ ok: false, url, error: cause ? `${e.message} (${cause})` : (e?.message || 'Connection failed') });
    }
  });

  return router;
}

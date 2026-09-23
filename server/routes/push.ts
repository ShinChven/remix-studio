import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import type { PushService } from '../services/push/push-service';

const MAX_FIELD_LENGTH = 2048;

function isHttpsEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

export function createPushRouter(push: PushService) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  /** The VAPID public key the browser needs to subscribe. */
  router.get('/api/push/config', authMiddleware, async (c) => {
    const publicKey = await push.getPublicKey();
    return c.json({ enabled: Boolean(publicKey), publicKey });
  });

  /** Whether this browser's subscription is registered to the signed-in user. */
  router.post('/api/push/subscriptions/status', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const body = await c.req.json().catch(() => null);
    if (!isHttpsEndpoint(body?.endpoint)) return c.json({ subscribed: false });
    return c.json({ subscribed: await push.isSubscribed(user.userId, body.endpoint) });
  });

  router.post('/api/push/subscriptions', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const body = await c.req.json().catch(() => null);
    if (!isHttpsEndpoint(body?.endpoint) || !isKey(body?.keys?.p256dh) || !isKey(body?.keys?.auth)) {
      return c.json({ error: 'Invalid push subscription' }, 400);
    }
    try {
      await push.subscribe(
        user.userId,
        { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
        c.req.header('user-agent')?.slice(0, 512),
      );
      return c.json({ ok: true });
    } catch (e) {
      console.error('[POST /api/push/subscriptions]', e);
      return c.json({ error: 'Failed to save push subscription' }, 500);
    }
  });

  router.delete('/api/push/subscriptions', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const body = await c.req.json().catch(() => null);
    if (!isHttpsEndpoint(body?.endpoint)) return c.json({ error: 'Invalid endpoint' }, 400);
    await push.unsubscribe(user.userId, body.endpoint);
    return c.json({ ok: true });
  });

  /** Sends a sample notification to every browser the user subscribed. */
  router.post('/api/push/test', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const delivered = await push.sendToUser(user.userId, {
      title: 'Remix Studio',
      body: 'Notifications are working. You will be notified when a project finishes its queue.',
      url: '/account?tab=preferences',
      tag: 'push-test',
    });
    return c.json({ delivered });
  });

  return router;
}

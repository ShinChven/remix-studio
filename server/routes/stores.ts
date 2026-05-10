import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { StoreFactory } from '../services/store';
import { encrypt, decrypt } from '../utils/crypto';

const STORES_REDIRECT_PATH = '/exports/stores';

export function createStoreRouter(prisma: PrismaClient) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  // Redirect to provider
  router.get('/api/stores/:platform/connect', authMiddleware, async (c) => {
    const platform = c.req.param('platform');

    try {
      const store = StoreFactory.getStore(platform);
      const state = crypto.randomBytes(16).toString('base64url');

      setCookie(c, `store_${platform}_state`, state, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 60 * 10,
      });

      return c.redirect(store.getAuthUrl(state));
    } catch (error: any) {
      console.error('[Store Connect]', error);
      return c.json({ error: error.message }, 400);
    }
  });

  // Handle OAuth callback
  router.get('/api/stores/:platform/callback', authMiddleware, async (c) => {
    const platform = c.req.param('platform');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const errorParam = c.req.query('error');

    const user = c.get('user') as JwtPayload;

    if (errorParam) {
      return c.redirect(`${STORES_REDIRECT_PATH}?error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return c.redirect(`${STORES_REDIRECT_PATH}?error=missing_code_or_state`);
    }

    const savedState = getCookie(c, `store_${platform}_state`);
    if (!savedState || state !== savedState) {
      return c.redirect(`${STORES_REDIRECT_PATH}?error=invalid_state`);
    }

    try {
      const store = StoreFactory.getStore(platform);
      const tokens = await store.exchangeCode(code);
      const profile = await store.fetchProfile(tokens.accessToken);

      if (!profile.accountId) {
        throw new Error('Could not determine account ID from store profile');
      }

      const encryptedAccessToken = encrypt(tokens.accessToken);
      const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

      await prisma.store.upsert({
        where: {
          userId_platform_accountId: {
            userId: user.userId,
            platform,
            accountId: profile.accountId,
          },
        },
        update: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes ?? null,
          status: 'active',
          profileName: profile.profileName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
        create: {
          userId: user.userId,
          platform,
          accountId: profile.accountId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes ?? undefined,
          status: 'active',
          profileName: profile.profileName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
      });

      return c.redirect(`${STORES_REDIRECT_PATH}?success=connected`);
    } catch (error: any) {
      console.error('[Store Callback]', error);
      return c.redirect(`${STORES_REDIRECT_PATH}?error=${encodeURIComponent(error.message)}`);
    }
  });

  // List connected stores for user
  router.get('/api/stores', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;

    try {
      const stores = await prisma.store.findMany({
        where: { userId: user.userId },
        select: {
          id: true,
          platform: true,
          accountId: true,
          profileName: true,
          email: true,
          avatarUrl: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return c.json(stores);
    } catch (error: any) {
      console.error('[Store List]', error);
      return c.json({ error: error.message }, 500);
    }
  });

  // Disconnect (delete) store
  router.delete('/api/stores/:platform/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const platform = c.req.param('platform');
    const id = c.req.param('id');

    try {
      const existing = await prisma.store.findFirst({
        where: { id, platform, userId: user.userId },
      });

      if (!existing) {
        return c.json({ error: 'Store not found' }, 404);
      }

      // Best-effort revoke at provider
      try {
        const store = StoreFactory.getStore(platform);
        if (store.revokeToken) {
          const accessToken = decrypt(existing.accessToken);
          await store.revokeToken(accessToken);
        }
      } catch (revokeErr) {
        console.warn('[Store Disconnect] Provider revoke failed (continuing):', revokeErr);
      }

      await prisma.store.deleteMany({
        where: { id, platform, userId: user.userId },
      });

      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Store Disconnect]', error);
      return c.json({ error: error.message }, 500);
    }
  });

  return router;
}

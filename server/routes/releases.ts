import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload, signFlowToken, verifyFlowToken } from '../auth/auth';
import { StoreFactory } from '../services/store';
import { DriveFactory, isDriveProviderId } from '../services/drive';
import { GOOGLE_DRIVE_CALLBACK_PATH } from '../services/drive/google-drive';
import { listDriveConnections, upsertDriveConnection } from '../services/drive/connections';
import { encrypt, decrypt } from '../utils/crypto';

/** Where every connect/disconnect flow lands the browser afterwards. */
const RELEASES_REDIRECT_PATH = '/exports/releases';

const STOREFRONTS = [{ id: 'gumroad', label: 'Gumroad' }] as const;

function flowCookieOptions(url: string) {
  const isSecure = new URL(url).protocol === 'https:' || process.env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax' as const,
    maxAge: 60 * 10,
  };
}

function redirectWithError(message: string): string {
  return `${RELEASES_REDIRECT_PATH}?error=${encodeURIComponent(message)}`;
}

export function createReleaseRouter(prisma: PrismaClient) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  // ─── Unified connection list ───────────────────────────────────────────────

  /**
   * Everything a finished export can be released to: storefronts to sell on and
   * drives to ship files to, plus which providers this server can offer.
   */
  router.get('/api/releases/connections', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;

    try {
      const [stores, drives] = await Promise.all([
        prisma.store.findMany({
          where: { userId: user.userId },
          select: {
            id: true,
            platform: true,
            accountId: true,
            profileName: true,
            email: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        listDriveConnections(prisma, user.userId),
      ]);

      return c.json({
        connections: [
          ...stores.map((store) => ({
            id: store.id,
            kind: 'store' as const,
            platform: store.platform,
            accountId: store.accountId,
            displayName: store.profileName,
            email: store.email,
            avatarUrl: store.avatarUrl,
            folderId: null,
            status: store.status,
            createdAt: store.createdAt,
            updatedAt: store.updatedAt,
          })),
          ...drives,
        ],
        providers: [
          ...STOREFRONTS.map((store) => ({
            id: store.id,
            kind: 'store' as const,
            label: store.label,
            configured: Boolean(process.env.GUMROAD_CLIENT_ID && process.env.GUMROAD_CLIENT_SECRET),
          })),
          ...DriveFactory.list().map((drive) => ({
            id: drive.provider,
            kind: 'drive' as const,
            label: drive.label,
            configured: drive.isConfigured(),
          })),
        ],
      });
    } catch (error: any) {
      console.error('[Releases] connections', error);
      return c.json({ error: error.message }, 500);
    }
  });

  // ─── Drives ────────────────────────────────────────────────────────────────

  /**
   * Google Drive keeps its historical callback path so redirect URIs already
   * registered with Google keep working; new providers use the releases path.
   */
  const callbackPathFor = (provider: string) =>
    provider === 'google-drive' ? GOOGLE_DRIVE_CALLBACK_PATH : `/api/releases/drives/${provider}/callback`;

  router.get('/api/releases/drives/:provider/connect', authMiddleware, async (c) => {
    const provider = c.req.param('provider');
    const user = c.get('user') as JwtPayload;

    try {
      if (!isDriveProviderId(provider)) {
        return c.json({ error: `Unsupported drive provider: ${provider}` }, 400);
      }
      const drive = DriveFactory.getProvider(provider);

      const state = crypto.randomBytes(32).toString('hex');
      const flowToken = signFlowToken(
        { purpose: 'drive-connect', provider, state, userId: user.userId },
        '10m',
      );
      setCookie(c, 'drive_connect_state', flowToken, flowCookieOptions(c.req.url));

      return c.redirect(drive.getAuthUrl(state));
    } catch (error: any) {
      console.error('[Releases] drive connect', error);
      return c.json({ error: error.message }, 400);
    }
  });

  /**
   * Shared OAuth landing for every drive provider. Google Drive's legacy path is
   * routed here too (see `callbackPathFor`).
   */
  const handleDriveCallback = async (c: any, provider: string) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const errorParam = c.req.query('error');

    if (errorParam) return c.redirect(redirectWithError(errorParam));
    if (!code || !state) return c.redirect(redirectWithError('Invalid OAuth callback'));

    const cookie = getCookie(c, 'drive_connect_state');
    if (!cookie) return c.redirect(redirectWithError('OAuth state expired'));
    setCookie(c, 'drive_connect_state', '', { ...flowCookieOptions(c.req.url), maxAge: 0 });

    let flow;
    try {
      flow = verifyFlowToken(cookie);
    } catch {
      return c.redirect(redirectWithError('Invalid OAuth state'));
    }
    if (
      flow.purpose !== 'drive-connect' ||
      flow.state !== state ||
      flow.provider !== provider ||
      !flow.userId
    ) {
      return c.redirect(redirectWithError('Invalid OAuth state'));
    }

    try {
      const drive = DriveFactory.getProvider(provider);
      const { tokens, profile } = await drive.exchangeCode(code);
      await upsertDriveConnection(prisma, { userId: flow.userId, provider, tokens, profile });
      return c.redirect(`${RELEASES_REDIRECT_PATH}?success=connected`);
    } catch (error: any) {
      console.error(`[Releases] ${provider} callback`, error);
      return c.redirect(redirectWithError(error.message || 'Drive connection failed'));
    }
  };

  router.get('/api/releases/drives/:provider/callback', (c) =>
    handleDriveCallback(c, c.req.param('provider')),
  );
  router.get(GOOGLE_DRIVE_CALLBACK_PATH, (c) => handleDriveCallback(c, 'google-drive'));

  router.delete('/api/releases/drives/:id', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const id = c.req.param('id');

    try {
      const deleted = await prisma.driveConnection.deleteMany({ where: { id, userId: user.userId } });
      if (deleted.count === 0) return c.json({ error: 'Drive connection not found' }, 404);
      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Releases] drive disconnect', error);
      return c.json({ error: error.message }, 500);
    }
  });

  // ─── Storefronts ───────────────────────────────────────────────────────────
  // These keep their historical `/api/stores` paths: the Gumroad callback URL is
  // registered inside each deployment's Gumroad application.

  router.get('/api/stores/:platform/connect', authMiddleware, async (c) => {
    const platform = c.req.param('platform');

    try {
      const store = StoreFactory.getStore(platform);
      const state = crypto.randomBytes(16).toString('base64url');

      setCookie(c, `store_${platform}_state`, state, flowCookieOptions(c.req.url));

      return c.redirect(store.getAuthUrl(state));
    } catch (error: any) {
      console.error('[Store Connect]', error);
      return c.json({ error: error.message }, 400);
    }
  });

  router.get('/api/stores/:platform/callback', authMiddleware, async (c) => {
    const platform = c.req.param('platform');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const errorParam = c.req.query('error');

    const user = c.get('user') as JwtPayload;

    if (errorParam) {
      return c.redirect(redirectWithError(errorParam));
    }

    if (!code || !state) {
      return c.redirect(redirectWithError('missing_code_or_state'));
    }

    const savedState = getCookie(c, `store_${platform}_state`);
    if (!savedState || state !== savedState) {
      return c.redirect(redirectWithError('invalid_state'));
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

      return c.redirect(`${RELEASES_REDIRECT_PATH}?success=connected`);
    } catch (error: any) {
      console.error('[Store Callback]', error);
      return c.redirect(redirectWithError(error.message));
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

  // ─── Release history ───────────────────────────────────────────────────────

  /** Paginated record of every export shipped to a storefront or a drive. */
  router.get('/api/store-uploads', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;

    const pageRaw = Number(c.req.query('page') ?? '1');
    const pageSizeRaw = Number(c.req.query('pageSize') ?? '20');
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(Math.floor(pageSizeRaw), 1), 100) : 20;
    // Optional filter so a single export can show only its own releases.
    const exportTaskId = c.req.query('exportTaskId')?.trim() || undefined;
    const where = { userId: user.userId, ...(exportTaskId ? { exportTaskId } : {}) };

    try {
      const [items, total] = await Promise.all([
        prisma.storeUploadHistory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            store: {
              select: { id: true, platform: true, profileName: true, accountId: true },
            },
            driveConnection: {
              select: { id: true, provider: true, displayName: true, email: true, accountId: true },
            },
            product: {
              select: { id: true, title: true, gumroadShortUrl: true },
            },
          },
        }),
        prisma.storeUploadHistory.count({ where }),
      ]);

      return c.json({
        items,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (error: any) {
      console.error('[Release History]', error);
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

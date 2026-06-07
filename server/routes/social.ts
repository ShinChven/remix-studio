import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { SocialChannelFactory } from '../services/social';
import { encrypt, decrypt } from '../utils/crypto';

/**
 * Parse and verify a Meta `signed_request` (used by the Threads/Meta deauthorize
 * and data-deletion callbacks). Format is `<base64url sig>.<base64url payload>`;
 * the signature is HMAC-SHA256 of the raw payload string keyed by the app secret.
 * Returns the decoded payload, or null if missing/invalid.
 */
function parseSignedRequest(signedRequest: string | undefined, appSecret: string): any | null {
  if (!signedRequest || !appSecret || !signedRequest.includes('.')) return null;
  const [encodedSig, payload] = signedRequest.split('.', 2);
  try {
    const sig = Buffer.from(encodedSig, 'base64url');
    const expected = crypto.createHmac('sha256', appSecret).update(payload).digest();
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function createSocialRouter(prisma: PrismaClient) {
  const router = new Hono<{ Variables: { user: JwtPayload } }>();

  // Redirect to provider
  router.get('/api/social/:platform/connect', authMiddleware, async (c) => {
    const platform = c.req.param('platform');
    
    try {
      const channel = SocialChannelFactory.getChannel(platform);
      
      // Generate PKCE code verifier and challenge
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      
      // Generate state to prevent CSRF
      const state = crypto.randomBytes(16).toString('base64url');

      // Store verifier and state in cookies for callback
      setCookie(c, `oauth_${platform}_state`, state, { path: '/', httpOnly: true, secure: true, maxAge: 60 * 10 });
      setCookie(c, `oauth_${platform}_verifier`, codeVerifier, { path: '/', httpOnly: true, secure: true, maxAge: 60 * 10 });

      const authUrl = channel.getAuthUrl(state, codeChallenge);
      return c.redirect(authUrl);
    } catch (error: any) {
      console.error('[Social Connect]', error);
      return c.json({ error: error.message }, 400);
    }
  });

  // Handle OAuth callback
  router.get('/api/social/:platform/callback', authMiddleware, async (c) => {
    const platform = c.req.param('platform');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const errorParam = c.req.query('error');
    
    const user = c.get('user') as JwtPayload;

    if (errorParam) {
      return c.redirect(`/campaigns/channels?error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return c.redirect('/campaigns/channels?error=missing_code_or_state');
    }

    const savedState = getCookie(c, `oauth_${platform}_state`);
    const codeVerifier = getCookie(c, `oauth_${platform}_verifier`);

    if (!savedState || !codeVerifier || state !== savedState) {
      return c.redirect('/campaigns/channels?error=invalid_state_or_verifier');
    }

    try {
      const channel = SocialChannelFactory.getChannel(platform);
      const tokens = await channel.exchangeCode(code, codeVerifier);

      // Fetch the real profile via the channel abstraction so we have a stable
      // accountId for upsert, regardless of platform.
      let accountId = `unknown_${Date.now()}`;
      let profileName = 'Connected Account';
      let avatarUrl: string | null = null;

      try {
        const profile = await channel.getProfile(tokens.accessToken);
        accountId = profile.accountId ?? accountId;
        profileName = profile.profileName ?? profileName;
        avatarUrl = profile.avatarUrl ?? null;
      } catch (profileErr) {
        console.warn('[Social Callback] Profile fetch failed:', profileErr);
      }

      // We encrypt tokens at rest (Security Audit check 6.1)
      const encryptedAccessToken = encrypt(tokens.accessToken);
      const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
      const scopes = tokens.scopes && tokens.scopes.length > 0 ? tokens.scopes : undefined;

      await prisma.socialAccount.upsert({
        where: {
          userId_platform_accountId: {
            userId: user.userId,
            platform,
            accountId,
          }
        },
        update: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokens.expiresAt,
          status: 'active',
          profileName,
          avatarUrl,
          ...(scopes ? { scopes } : {}),
        },
        create: {
          userId: user.userId,
          platform,
          accountId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokens.expiresAt,
          status: 'active',
          profileName,
          avatarUrl,
          ...(scopes ? { scopes } : {}),
        }
      });

      return c.redirect('/campaigns/channels?success=connected');
    } catch (error: any) {
      console.error('[Social Callback]', error);
      return c.redirect(`/campaigns/channels?error=${encodeURIComponent(error.message)}`);
    }
  });

  // Get social accounts for user
  router.get('/api/social/accounts', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    
    try {
      const accounts = await prisma.socialAccount.findMany({
        where: { userId: user.userId },
        select: {
          id: true,
          platform: true,
          accountId: true,
          profileName: true,
          avatarUrl: true,
          status: true,
          expiresAt: true,
          updatedAt: true
        }
      });
      return c.json(accounts);
    } catch (error: any) {
      console.error('[Social Accounts]', error);
      return c.json({ error: error.message }, 500);
    }
  });

  // Disconnect (delete) social account
  router.delete('/api/social/:platform/:accountId', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const platform = c.req.param('platform');
    const accountId = c.req.param('accountId');
    
    // Strict tenant isolation (Security Audit check 6.1)
    await prisma.socialAccount.deleteMany({
      where: {
        id: accountId,
        platform,
        userId: user.userId
      }
    });

    return c.json({ success: true });
  });

  // ---- Meta Threads lifecycle callbacks (server-to-server, NO authMiddleware) ----
  // Meta calls these with a signed_request; they satisfy the required "Uninstall
  // Callback URL" and "Delete Callback URL" fields in the Threads app dashboard.

  // Uninstall / deauthorize: user removed the app -> delete their Threads account + tokens.
  router.post('/api/social/threads/deauthorize', async (c) => {
    const body = await c.req.parseBody();
    const data = parseSignedRequest(body['signed_request'] as string | undefined, process.env.THREADS_APP_SECRET || '');
    if (!data?.user_id) return c.json({ error: 'Invalid signed_request' }, 400);

    await prisma.socialAccount.deleteMany({
      where: { platform: 'threads', accountId: String(data.user_id) },
    });
    return c.json({ success: true });
  });

  // Data deletion request: delete the user's data and return the JSON Meta requires.
  router.post('/api/social/threads/data-deletion', async (c) => {
    const body = await c.req.parseBody();
    const data = parseSignedRequest(body['signed_request'] as string | undefined, process.env.THREADS_APP_SECRET || '');
    if (!data?.user_id) return c.json({ error: 'Invalid signed_request' }, 400);

    const userId = String(data.user_id);
    await prisma.socialAccount.deleteMany({
      where: { platform: 'threads', accountId: userId },
    });

    // Deletion is synchronous, so the status URL just confirms completion.
    const confirmationCode = `threads_${userId}_${Date.now()}`;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return c.json({
      url: `${appUrl}/campaigns/channels?threads_deletion=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  });

  // Refresh social account profile
  router.post('/api/social/:platform/:accountId/refresh-profile', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const platform = c.req.param('platform');
    const accountRef = c.req.param('accountId');

    try {
      const account = await prisma.socialAccount.findFirst({
        where: {
          platform,
          userId: user.userId,
          OR: [
            { id: accountRef },
            { accountId: accountRef },
          ],
        }
      });

      if (!account) return c.json({ error: 'Account not found' }, 404);

      let accessToken = decrypt(account.accessToken);
      const channel = SocialChannelFactory.getChannel(platform);

      // We might need to refresh token if it's expired
      if (account.expiresAt && new Date(account.expiresAt).getTime() < Date.now()) {
        if (!account.refreshToken) return c.json({ error: 'Token expired and no refresh token available' }, 400);
        const tokens = await channel.refreshTokens(decrypt(account.refreshToken));
        accessToken = tokens.accessToken;

        await prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encrypt(tokens.accessToken),
            refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
            expiresAt: tokens.expiresAt,
          }
        });
      }

      // Fetch profile via the channel abstraction (works for all platforms).
      try {
        const profile = await channel.getProfile(accessToken);
        const avatarUrl = profile.avatarUrl ?? null;
        const profileName = profile.profileName ?? account.profileName;

        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { avatarUrl, profileName }
        });
        return c.json({ success: true, avatarUrl, profileName });
      } catch (profileErr: any) {
        return c.json({ error: `Failed to fetch profile: ${profileErr.message}` }, 400);
      }
    } catch (error: any) {
      console.error('[Social Refresh]', error);
      return c.json({ error: error.message }, 500);
    }
  });

  return router;
}

import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { SocialChannelFactory } from '../services/social';
import { encrypt } from '../utils/crypto';

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

      // Fetch real profile from X API so we have a stable accountId for upsert
      let accountId = `unknown_${Date.now()}`;
      let profileName = 'Connected Account';
      let avatarUrl: string | null = null;

      try {
        const profileRes = await fetch('https://api.x.com/2/users/me?user.fields=name,username,profile_image_url', {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          accountId = profileData.data?.id ?? accountId;
          profileName = profileData.data?.name ?? profileData.data?.username ?? profileName;
          avatarUrl = profileData.data?.profile_image_url ?? null;
        } else {
          console.warn('[Social Callback] Could not fetch profile, using fallback accountId');
        }
      } catch (profileErr) {
        console.warn('[Social Callback] Profile fetch failed:', profileErr);
      }

      // We encrypt tokens at rest (Security Audit check 6.1)
      const encryptedAccessToken = encrypt(tokens.accessToken);
      const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

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

  return router;
}

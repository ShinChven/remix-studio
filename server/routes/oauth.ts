import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { authMiddleware, verifyToken, type JwtPayload } from '../auth/auth';

type Variables = { user: JwtPayload };

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function generateSecureToken(bytes = 32): string {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

function verifyCodeChallenge(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method === 'S256') {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }
  // plain method (not recommended but part of spec)
  return codeVerifier === codeChallenge;
}

function getBaseUrl(req: Request): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto.toLowerCase()}://${forwardedHost}`;
  }
  const url = new URL(req.url);
  return url.origin;
}

function getProtectedResourceMetadataUrl(req: Request): string {
  return `${getBaseUrl(req)}/.well-known/oauth-protected-resource`;
}

function buildLoginRedirect(req: Request): URL {
  const loginUrl = new URL('/login', getBaseUrl(req));
  loginUrl.searchParams.set('next', new URL(req.url).pathname + new URL(req.url).search);
  return loginUrl;
}

export function createOAuthRouter(prisma: PrismaClient) {
  const router = new Hono<{ Variables: Variables }>();

  // CORS for OAuth discovery, registration, and token endpoints.
  // Required by the MCP spec for browser-based OAuth flows (e.g. MCP Inspector direct mode).
  // These endpoints are safe to expose: discovery is public metadata, /token requires
  // a valid authorization code + PKCE verifier, /register is public by design (RFC 7591).
  const oauthCors = cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type', 'Accept', 'MCP-Protocol-Version'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  });
  router.use('/.well-known/*', oauthCors);
  router.use('/register', oauthCors);
  router.use('/token', oauthCors);

  // ============================================================
  // RFC 8414 — OAuth 2.0 Authorization Server Metadata
  // ============================================================
  router.get('/.well-known/oauth-authorization-server', (c) => {
    const baseUrl = getBaseUrl(c.req.raw);
    return c.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp:tools'],
    });
  });

  // RFC 9728 — OAuth 2.0 Protected Resource Metadata
  router.get('/.well-known/oauth-protected-resource', (c) => {
    const baseUrl = getBaseUrl(c.req.raw);
    return c.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:tools'],
    });
  });

  // ============================================================
  // RFC 7591 — Dynamic Client Registration
  // ============================================================
  router.post('/register', async (c) => {
    try {
      const sessionToken = getCookie(c, 'token');
      let createdByUserId: string | null = null;
      if (sessionToken) {
        try {
          createdByUserId = verifyToken(sessionToken).userId;
        } catch {
          createdByUserId = null;
        }
      }

      const body = await c.req.json();
      const redirectUris = body.redirect_uris;
      if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
        return c.json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' }, 400);
      }

      // Validate redirect URIs: must be localhost or HTTPS
      for (const uri of redirectUris) {
        try {
          const parsed = new URL(uri);
          const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
          if (!isLocalhost && parsed.protocol !== 'https:') {
            return c.json({ error: 'invalid_client_metadata', error_description: 'Redirect URIs must be localhost or HTTPS' }, 400);
          }
        } catch {
          return c.json({ error: 'invalid_client_metadata', error_description: `Invalid redirect URI: ${uri}` }, 400);
        }
      }

      const clientId = generateSecureToken(16);
      const grantTypes = body.grant_types ?? ['authorization_code'];
      const responseTypes = body.response_types ?? ['code'];
      const tokenEndpointAuthMethod = body.token_endpoint_auth_method ?? 'client_secret_basic';
      const clientName = body.client_name ?? null;
      const scope = body.scope ?? 'mcp:tools';
      const clientSecret = tokenEndpointAuthMethod === 'none' ? null : generateSecureToken(32);
      const clientSecretHash = clientSecret ? sha256(clientSecret) : null;

      await prisma.oAuthClient.create({
        data: {
          clientId,
          createdByUserId,
          clientSecretHash,
          clientName,
          redirectUris,
          grantTypes,
          responseTypes,
          tokenEndpointAuthMethod,
          scope,
        },
      });

      const now = Math.floor(Date.now() / 1000);
      return c.json({
        client_id: clientId,
        client_id_issued_at: now,
        ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : { client_secret_expires_at: 0 }),
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: grantTypes,
        response_types: responseTypes,
        token_endpoint_auth_method: tokenEndpointAuthMethod,
        scope,
      }, 201);
    } catch (e) {
      console.error('[POST /register]', e);
      return c.json({ error: 'server_error', error_description: 'Failed to register client' }, 500);
    }
  });

  // ============================================================
  // Authorization Endpoint — GET /authorize
  // Shows login form or consent page
  // ============================================================
  router.get('/authorize', async (c) => {
    const clientId = c.req.query('client_id');
    const redirectUri = c.req.query('redirect_uri');
    const responseType = c.req.query('response_type');
    const state = c.req.query('state');
    const scope = c.req.query('scope');
    const codeChallenge = c.req.query('code_challenge');
    const codeChallengeMethod = c.req.query('code_challenge_method') || 'S256';

    if (!clientId || !redirectUri || responseType !== 'code') {
      return c.json({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400);
    }

    // Verify client
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
      return c.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 400);
    }

    // Verify redirect URI
    const allowedUris = client.redirectUris as string[];
    if (!allowedUris.includes(redirectUri)) {
      return c.json({ error: 'invalid_request', error_description: 'Redirect URI not registered' }, 400);
    }

    // Check if user is already logged in via session cookie
    const token = getCookie(c, 'token');
    let loggedInUser: JwtPayload | null = null;
    if (token) {
      try {
        loggedInUser = verifyToken(token);
      } catch {
        // not logged in
      }
    }

    if (!loggedInUser) return c.redirect(buildLoginRedirect(c.req.raw).toString());

    // Render a simple HTML consent page
    const html = renderAuthorizePage({
      clientName: client.clientName || clientId,
      scope: scope || 'mcp:tools',
      clientId,
      redirectUri,
      state: state || '',
      codeChallenge: codeChallenge || '',
      codeChallengeMethod,
      loggedInEmail: loggedInUser?.email || null,
    });

    return c.html(html);
  });

  // ============================================================
  // Authorization Endpoint — POST /authorize
  // Handles user login + consent approval
  // ============================================================
  router.post('/authorize', async (c) => {
    const body = await c.req.parseBody();
    const clientId = body.client_id as string;
    const redirectUri = body.redirect_uri as string;
    const state = body.state as string;
    const codeChallenge = body.code_challenge as string;
    const codeChallengeMethod = (body.code_challenge_method as string) || 'S256';
    const action = body.action as string;

    if (!clientId || !redirectUri) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    // Verify client
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
      return c.json({ error: 'invalid_client' }, 400);
    }

    if (action === 'deny') {
      const url = new URL(redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (state) url.searchParams.set('state', state);
      return c.redirect(url.toString());
    }

    // Resolve user: check session cookie first, then form credentials
    let userId: string | null = null;
    const token = getCookie(c, 'token');
    if (token) {
      try {
        const payload = verifyToken(token);
        userId = payload.userId;
      } catch {
        // invalid session
      }
    }

    if (!userId) return c.redirect(buildLoginRedirect(c.req.raw).toString());

    // Generate authorization code
    const code = generateSecureToken(32);
    await prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId,
        userId,
        redirectUri,
        scope: 'mcp:tools',
        codeChallenge: codeChallenge || null,
        codeChallengeMethod: codeChallenge ? codeChallengeMethod : null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString());
  });

  // ============================================================
  // Token Endpoint — POST /token
  // Exchanges authorization code for access token, or refreshes
  // ============================================================
  router.post('/token', async (c) => {
    const contentType = c.req.header('content-type') || '';
    let params: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.parseBody();
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') params[k] = v;
      }
    } else if (contentType.includes('application/json')) {
      params = await c.req.json();
    } else {
      const body = await c.req.parseBody();
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') params[k] = v;
      }
    }

    // Extract client credentials from Authorization header or body
    let clientId = params.client_id;
    let clientSecret = params.client_secret;

    const authHeader = c.req.header('authorization');
    if (authHeader?.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [id, secret] = decoded.split(':');
      clientId = decodeURIComponent(id);
      clientSecret = decodeURIComponent(secret);
    }

    const grantType = params.grant_type;

    if (grantType === 'authorization_code') {
      return handleAuthorizationCodeGrant(c, prisma, clientId, clientSecret, params);
    } else if (grantType === 'refresh_token') {
      return handleRefreshTokenGrant(c, prisma, clientId, clientSecret, params);
    } else {
      return c.json({ error: 'unsupported_grant_type' }, 400);
    }
  });

  // ============================================================
  // OAuth Client Management API (for logged-in users)
  // ============================================================

  router.get('/api/oauth/clients', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;

      const clients = await prisma.oAuthClient.findMany({
        where: {
          OR: [
            { createdByUserId: user.userId },
            {
              accessTokens: {
                some: { userId: user.userId, revoked: false, expiresAt: { gt: new Date() } },
              },
            },
          ],
        },
        select: {
          id: true,
          clientId: true,
          createdByUserId: true,
          clientName: true,
          redirectUris: true,
          scope: true,
          createdAt: true,
          _count: {
            select: {
              accessTokens: {
                where: { userId: user.userId, revoked: false, expiresAt: { gt: new Date() } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return c.json(clients.map((client) => ({
        id: client.id,
        clientId: client.clientId,
        clientName: client.clientName,
        redirectUris: client.redirectUris,
        scope: client.scope,
        activeTokens: client._count.accessTokens,
        createdAt: client.createdAt.getTime(),
        isOwned: client.createdByUserId === user.userId,
      })));
    } catch (e) {
      console.error('[GET /api/oauth/clients]', e);
      return c.json({ error: 'Failed to list OAuth clients' }, 500);
    }
  });

  router.patch('/api/oauth/clients/:clientId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const clientId = c.req.param('clientId');
      const body = await c.req.json();
      const redirectUris = body.redirect_uris;

      if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
        return c.json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' }, 400);
      }

      for (const uri of redirectUris) {
        try {
          const parsed = new URL(uri);
          const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
          if (!isLocalhost && parsed.protocol !== 'https:') {
            return c.json({ error: 'invalid_client_metadata', error_description: 'Redirect URIs must be localhost or HTTPS' }, 400);
          }
        } catch {
          return c.json({ error: 'invalid_client_metadata', error_description: `Invalid redirect URI: ${uri}` }, 400);
        }
      }

      const client = await prisma.oAuthClient.findUnique({
        where: { clientId },
        select: { id: true, createdByUserId: true },
      });

      if (!client) {
        return c.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, 404);
      }

      if (client.createdByUserId !== user.userId) {
        return c.json({ error: 'forbidden', error_description: 'You do not own this client' }, 403);
      }

      const updated = await prisma.oAuthClient.update({
        where: { clientId },
        data: { redirectUris },
        select: {
          id: true,
          clientId: true,
          clientName: true,
          redirectUris: true,
          scope: true,
          createdAt: true,
          _count: {
            select: {
              accessTokens: {
                where: { userId: user.userId, revoked: false, expiresAt: { gt: new Date() } },
              },
            },
          },
        },
      });

      return c.json({
        id: updated.id,
        clientId: updated.clientId,
        clientName: updated.clientName,
        redirectUris: updated.redirectUris,
        scope: updated.scope,
        activeTokens: updated._count.accessTokens,
        createdAt: updated.createdAt.getTime(),
        isOwned: true,
      });
    } catch (e) {
      console.error('[PATCH /api/oauth/clients/:clientId]', e);
      return c.json({ error: 'Failed to update OAuth client' }, 500);
    }
  });

  router.delete('/api/oauth/clients/:clientId/revoke', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const clientId = c.req.param('clientId');

      // Revoke all tokens for this user+client
      const result = await prisma.oAuthAccessToken.updateMany({
        where: { clientId, userId: user.userId, revoked: false },
        data: { revoked: true },
      });

      return c.json({ success: true, revokedCount: result.count });
    } catch (e) {
      console.error('[DELETE /api/oauth/clients/:clientId/revoke]', e);
      return c.json({ error: 'Failed to revoke client access' }, 500);
    }
  });

  // ============================================================
  // Personal Access Tokens (for MCP clients without OAuth)
  // ============================================================

  router.get('/api/oauth/tokens', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const tokens = await prisma.personalAccessToken.findMany({
        where: { userId: user.userId, revoked: false },
        select: {
          id: true,
          name: true,
          tokenPrefix: true,
          scope: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return c.json(tokens.map((t) => ({
        ...t,
        lastUsedAt: t.lastUsedAt?.getTime() ?? null,
        expiresAt: t.expiresAt?.getTime() ?? null,
        createdAt: t.createdAt.getTime(),
        expired: t.expiresAt ? t.expiresAt < new Date() : false,
      })));
    } catch (e) {
      console.error('[GET /api/oauth/tokens]', e);
      return c.json({ error: 'Failed to list tokens' }, 500);
    }
  });

  router.post('/api/oauth/tokens', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const expiresInDays = typeof body?.expiresInDays === 'number' ? body.expiresInDays : null;

      if (!name || name.length > 128) {
        return c.json({ error: 'Name is required (max 128 characters)' }, 400);
      }

      const rawToken = `pat_${generateSecureToken(32)}`;
      const tokenHash = sha256(rawToken);
      const tokenPrefix = rawToken.slice(0, 12);

      await prisma.personalAccessToken.create({
        data: {
          userId: user.userId,
          name,
          tokenHash,
          tokenPrefix,
          scope: 'mcp:tools',
          expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 3600 * 1000) : null,
        },
      });

      // Return the raw token ONCE — it cannot be retrieved again
      return c.json({ token: rawToken, name, tokenPrefix }, 201);
    } catch (e) {
      console.error('[POST /api/oauth/tokens]', e);
      return c.json({ error: 'Failed to create token' }, 500);
    }
  });

  router.delete('/api/oauth/tokens/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const tokenId = c.req.param('id');

      const result = await prisma.personalAccessToken.updateMany({
        where: { id: tokenId, userId: user.userId, revoked: false },
        data: { revoked: true },
      });

      if (result.count === 0) {
        return c.json({ error: 'Token not found' }, 404);
      }

      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/oauth/tokens/:id]', e);
      return c.json({ error: 'Failed to revoke token' }, 500);
    }
  });

  return router;
}

async function handleAuthorizationCodeGrant(
  c: any, prisma: PrismaClient,
  clientId: string | undefined, clientSecret: string | undefined,
  params: Record<string, string>,
) {
  const code = params.code;
  const redirectUri = params.redirect_uri;
  const codeVerifier = params.code_verifier;

  if (!code || !clientId) {
    return c.json({ error: 'invalid_request', error_description: 'Missing code or client_id' }, 400);
  }

  // Look up client
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  // Verify client secret if the client was issued one
  if (client.clientSecretHash) {
    if (!clientSecret || sha256(clientSecret) !== client.clientSecretHash) {
      return c.json({ error: 'invalid_client', error_description: 'Invalid client credentials' }, 401);
    }
  }

  // Look up auth code
  const authCode = await prisma.oAuthAuthorizationCode.findUnique({ where: { code } });
  if (!authCode || authCode.clientId !== clientId || authCode.used) {
    return c.json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }, 400);
  }

  if (authCode.expiresAt < new Date()) {
    return c.json({ error: 'invalid_grant', error_description: 'Authorization code expired' }, 400);
  }

  if (redirectUri && authCode.redirectUri !== redirectUri) {
    return c.json({ error: 'invalid_grant', error_description: 'Redirect URI mismatch' }, 400);
  }

  // Verify PKCE
  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return c.json({ error: 'invalid_grant', error_description: 'code_verifier is required' }, 400);
    }
    if (!verifyCodeChallenge(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod || 'S256')) {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
    }
  }

  // Mark code as used
  await prisma.oAuthAuthorizationCode.update({ where: { code }, data: { used: true } });

  // Issue tokens
  const accessToken = generateSecureToken(32);
  const refreshToken = generateSecureToken(32);
  const expiresInSeconds = 3600; // 1 hour

  await prisma.oAuthAccessToken.create({
    data: {
      token: sha256(accessToken),
      clientId,
      userId: authCode.userId,
      scope: authCode.scope,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      refreshToken: sha256(refreshToken),
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days
    },
  });

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresInSeconds,
    refresh_token: refreshToken,
    scope: authCode.scope || 'mcp:tools',
  });
}

async function handleRefreshTokenGrant(
  c: any, prisma: PrismaClient,
  clientId: string | undefined, clientSecret: string | undefined,
  params: Record<string, string>,
) {
  const refreshToken = params.refresh_token;
  if (!refreshToken || !clientId) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  if (client.clientSecretHash) {
    if (!clientSecret || sha256(clientSecret) !== client.clientSecretHash) {
      return c.json({ error: 'invalid_client' }, 401);
    }
  }

  const tokenRecord = await prisma.oAuthAccessToken.findUnique({
    where: { refreshToken: sha256(refreshToken) },
  });

  if (!tokenRecord || tokenRecord.clientId !== clientId || tokenRecord.revoked) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  if (tokenRecord.refreshExpiresAt && tokenRecord.refreshExpiresAt < new Date()) {
    return c.json({ error: 'invalid_grant', error_description: 'Refresh token expired' }, 400);
  }

  // Revoke old token
  await prisma.oAuthAccessToken.update({
    where: { id: tokenRecord.id },
    data: { revoked: true },
  });

  // Issue new tokens (rotation)
  const newAccessToken = generateSecureToken(32);
  const newRefreshToken = generateSecureToken(32);
  const expiresInSeconds = 3600;

  await prisma.oAuthAccessToken.create({
    data: {
      token: sha256(newAccessToken),
      clientId,
      userId: tokenRecord.userId,
      scope: tokenRecord.scope,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      refreshToken: sha256(newRefreshToken),
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });

  return c.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: expiresInSeconds,
    refresh_token: newRefreshToken,
    scope: tokenRecord.scope || 'mcp:tools',
  });
}

function renderAuthorizePage(opts: {
  clientName: string;
  scope: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  loggedInEmail: string | null;
  error?: string;
}): string {
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Connection — Remix Studio</title>
  <style>
    :root {
      --bg-color: #09090b;
      --card-bg: #18181b;
      --border-color: #27272a;
      --text-main: #f4f4f5;
      --text-muted: #a1a1aa;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
      --danger: #ef4444;
      --success-bg: rgba(34, 197, 94, 0.1);
      --success-border: rgba(34, 197, 94, 0.2);
      --success-text: #4ade80;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background: var(--bg-color); color: var(--text-main); display: flex; justify-content: center; align-items: center; min-height: 100vh; line-height: 1.5; padding: 1rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 2.5rem; max-width: 460px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { text-align: center; margin-bottom: 2rem; }
    .header svg { width: 48px; height: 48px; color: var(--accent); margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.025em; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; }
    .client-name { color: var(--text-main); font-weight: 600; }
    .permissions { background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; }
    .permissions h3 { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 1rem; }
    .permissions ul { list-style: none; }
    .permissions li { position: relative; padding-left: 1.75rem; font-size: 0.9rem; color: var(--text-main); margin-bottom: 0.75rem; }
    .permissions li:last-child { margin-bottom: 0; }
    .permissions li::before { content: "✓"; position: absolute; left: 0; top: 0; color: var(--accent); font-weight: bold; }
    .scope-badge { display: inline-block; background: rgba(59, 130, 246, 0.1); color: var(--accent); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-family: monospace; margin-top: 0.75rem; }
    .error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: var(--danger); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.875rem; }
    .logged-in { display: flex; align-items: center; gap: 0.75rem; background: var(--success-bg); border: 1px solid var(--success-border); padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; font-size: 0.875rem; color: var(--success-text); }
    .logged-in svg { width: 20px; height: 20px; flex-shrink: 0; }
    .actions { display: flex; gap: 1rem; margin-top: 2rem; }
    button { flex: 1; padding: 0.75rem 1rem; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-approve { background: var(--accent); color: white; }
    .btn-approve:hover { background: var(--accent-hover); }
    .btn-deny { background: transparent; color: var(--text-main); border: 1px solid var(--border-color); }
    .btn-deny:hover { background: rgba(255,255,255,0.05); }
    .footer { text-align: center; margin-top: 1.5rem; font-size: 0.75rem; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
      <h1>Connection Request</h1>
      <p class="subtitle"><span class="client-name">${escHtml(opts.clientName)}</span> would like to connect to your Remix Studio account.</p>
    </div>

    ${opts.error ? `<div class="error">${escHtml(opts.error)}</div>` : ''}

    <div class="permissions">
      <h3>This application will be able to:</h3>
      <ul>
        <li>Access your configured Model Context Protocol (MCP) connections</li>
        <li>Read and execute available tools on your behalf</li>
        <li>Integrate with your personal workspace resources</li>
      </ul>
      <div class="scope-badge">Scope: ${escHtml(opts.scope)}</div>
    </div>

    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escHtml(opts.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escHtml(opts.redirectUri)}">
      <input type="hidden" name="state" value="${escHtml(opts.state)}">
      <input type="hidden" name="code_challenge" value="${escHtml(opts.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escHtml(opts.codeChallengeMethod)}">

      <div class="logged-in">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
        </svg>
        <span>Signed in as <strong>${escHtml(opts.loggedInEmail || 'Unknown')}</strong></span>
      </div>

      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn-deny">Cancel</button>
        <button type="submit" name="action" value="approve" class="btn-approve">Authorize App</button>
      </div>
    </form>
    
    <div class="footer">
      Only authorize applications you trust. You can revoke access at any time in your Account Settings.
    </div>
  </div>
</body>
</html>`;
}

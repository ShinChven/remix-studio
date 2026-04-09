import { Hono } from 'hono';
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

      // Find all clients that have issued tokens to this user
      const tokens = await prisma.oAuthAccessToken.findMany({
        where: { userId: user.userId },
        select: { clientId: true },
        distinct: ['clientId'],
      });
      const clientIds = tokens.map((t) => t.clientId);

      // Also find clients from authorization codes
      const codes = await prisma.oAuthAuthorizationCode.findMany({
        where: { userId: user.userId },
        select: { clientId: true },
        distinct: ['clientId'],
      });
      const allClientIds = [...new Set([...clientIds, ...codes.map((c) => c.clientId)])];

      const clients = await prisma.oAuthClient.findMany({
        where: { clientId: { in: allClientIds } },
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
      })));
    } catch (e) {
      console.error('[GET /api/oauth/clients]', e);
      return c.json({ error: 'Failed to list OAuth clients' }, 500);
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
  <title>Authorize — Remix Studio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100%; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .scope { color: #888; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .client-name { color: #7c9cff; font-weight: 600; }
    .error { background: #3a1515; border: 1px solid #662222; color: #ff6b6b; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.875rem; }
    label { display: block; font-size: 0.875rem; color: #aaa; margin-bottom: 0.25rem; }
    input[type="email"], input[type="password"] { width: 100%; padding: 0.625rem; background: #111; border: 1px solid #333; border-radius: 6px; color: #e0e0e0; font-size: 0.875rem; margin-bottom: 0.75rem; }
    input:focus { outline: none; border-color: #7c9cff; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
    button { flex: 1; padding: 0.625rem; border: none; border-radius: 6px; font-size: 0.875rem; cursor: pointer; font-weight: 500; }
    .btn-approve { background: #7c9cff; color: #000; }
    .btn-approve:hover { background: #97b3ff; }
    .btn-deny { background: #333; color: #ccc; }
    .btn-deny:hover { background: #444; }
    .logged-in { background: #1a2a1a; border: 1px solid #2a4a2a; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.875rem; color: #8bc48b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize Application</h1>
    <p class="scope"><span class="client-name">${escHtml(opts.clientName)}</span> is requesting access to your account.</p>
    <p class="scope">Scope: <strong>${escHtml(opts.scope)}</strong></p>

    ${opts.error ? `<div class="error">${escHtml(opts.error)}</div>` : ''}

    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escHtml(opts.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escHtml(opts.redirectUri)}">
      <input type="hidden" name="state" value="${escHtml(opts.state)}">
      <input type="hidden" name="code_challenge" value="${escHtml(opts.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escHtml(opts.codeChallengeMethod)}">

      <div class="logged-in">Logged in as <strong>${escHtml(opts.loggedInEmail)}</strong></div>

      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn-approve">Approve</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

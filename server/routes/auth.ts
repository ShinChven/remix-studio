import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { authMiddleware, adminOnly, hashPassword, verifyPassword, signToken, JwtPayload, signFlowToken, verifyFlowToken } from '../auth/auth';
import { UserRepository } from '../auth/user-repository';
import { checkRateLimit, getClientAddress } from '../utils/rate-limiter';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { UserRole, UserStatus } from '../../src/types';
import { decrypt, encrypt } from '../utils/crypto';
import { buildAuthenticationOptions, buildRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '../auth/webauthn';
import { generateOtpAuthUri, generateTotpSecret, verifyTotpCode } from '../auth/totp';

const VALID_ROLES: UserRole[] = ['admin', 'user'];
const VALID_STATUSES: UserStatus[] = ['active', 'disabled'];
const DEFAULT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60_000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const TWO_FACTOR_WINDOW_MS = 5 * 60_000;

type Variables = { user: JwtPayload };

function serializeUser(user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>) {
  return {
    id: user.sk,
    email: user.email,
    role: user.role,
    status: user.status,
    storageLimit: user.storageLimit,
    hasPassword: Boolean(user.passwordHash),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    googleDriveConnected: Boolean(user.googleDriveRefreshToken),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function stripDefaultPort(proto: string, host: string) {
  const lowerProto = proto.toLowerCase();
  if ((lowerProto === 'https' && host.endsWith(':443')) || (lowerProto === 'http' && host.endsWith(':80'))) {
    return host.replace(/:(443|80)$/, '');
  }
  return host;
}

function parseForwardedHeader(value: string | null) {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;

  const parts = first.split(';').map((part) => part.trim());
  let proto = '';
  let host = '';

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim().replace(/^"|"$/g, '');
    if (key === 'proto') proto = value;
    if (key === 'host') host = value;
  }

  if (!proto || !host) return null;
  return `${proto.toLowerCase()}://${stripDefaultPort(proto, host)}`;
}

function getRequestOrigin(req: Request) {
  const explicitOrigin = process.env.WEBAUTHN_ORIGIN?.trim();
  if (explicitOrigin) {
    return new URL(explicitOrigin).origin;
  }

  const forwarded = parseForwardedHeader(req.headers.get('forwarded'));
  if (forwarded) return forwarded;

  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto.toLowerCase()}://${stripDefaultPort(forwardedProto, forwardedHost)}`;
  }

  return new URL(req.url).origin;
}

function getSessionCookieOptions(url: string) {
  const requestUrl = new URL(url);
  return {
    httpOnly: true,
    secure: requestUrl.protocol === 'https:' || process.env.NODE_ENV === 'production',
    sameSite: 'Strict' as const,
    maxAge: 24 * 60 * 60,
    path: '/',
  };
}

function clearSessionCookie(c: any) {
  setCookie(c, 'token', '', {
    ...getSessionCookieOptions(c.req.url),
    maxAge: 0,
  });
}

function hashRateLimitValue(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function finalizeLogin(c: any, userRepository: UserRepository, user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>) {
  await userRepository.touchLastLogin(user.sk);

  const token = signToken({
    userId: user.sk,
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion ?? 0,
  });
  setCookie(c, 'token', token, getSessionCookieOptions(c.req.url));

  return c.json({
    user: {
      ...serializeUser({ ...user, lastLoginAt: Date.now() }),
    },
  });
}

export function createAuthRouter(userRepository: UserRepository) {
  const router = new Hono<{ Variables: Variables }>();

  router.post('/api/auth/login', async (c) => {
    try {
      const body = await c.req.json();
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
      const password = typeof body?.password === 'string' ? body.password : null;

      if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

      const clientAddress = getClientAddress(c.req.raw);
      if (!checkRateLimit({
        bucket: 'auth-login',
        keyParts: [clientAddress, email],
        maxAttempts: LOGIN_MAX_ATTEMPTS,
        windowMs: LOGIN_WINDOW_MS,
      })) {
        return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
      }

      const user = await userRepository.findByEmail(email);
      if (!user) return c.json({ error: 'Invalid credentials' }, 401);
      if (user.status === 'disabled') return c.json({ error: 'This account has been disabled' }, 403);
      if (!user.passwordHash) return c.json({ error: 'This account does not have a password. Please use another sign-in method.' }, 400);

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const tempToken = signFlowToken({
          purpose: 'login-2fa',
          userId: user.sk,
          method: 'password',
        });

        return c.json({
          requiresTwoFactor: true,
          tempToken,
          user: {
            id: user.sk,
            email: user.email,
          },
        });
      }

      return finalizeLogin(c, userRepository, user);
    } catch (e) {
      console.error('[POST /api/auth/login]', e);
      return c.json({ error: 'Login failed' }, 500);
    }
  });

  router.get('/api/auth/me', authMiddleware, async (c) => {
    const payload = c.get('user') as JwtPayload;
    const user = await userRepository.findById(payload.userId);
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ user: serializeUser(user) });
  });

  router.put('/api/auth/password', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

      if (!newPassword) {
        return c.json({ error: 'New password is required' }, 400);
      }

      if (newPassword.length < 8) {
        return c.json({ error: 'New password must be at least 8 characters long' }, 400);
      }

      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);

      if (user.passwordHash) {
        if (!currentPassword) {
          return c.json({ error: 'Current password is required' }, 400);
        }
        const isValid = await verifyPassword(currentPassword, user.passwordHash);
        if (!isValid) return c.json({ error: 'Current password is incorrect' }, 401);

        if (currentPassword === newPassword) {
          return c.json({ error: 'New password must be different from your current password' }, 400);
        }
      }

      const passwordHash = await hashPassword(newPassword);
      await userRepository.updatePassword(payload.userId, passwordHash);

      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/auth/password]', e);
      return c.json({ error: 'Failed to update password' }, 500);
    }
  });

  router.delete('/api/auth/password', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const body = await c.req.json().catch(() => ({}));
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';

      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);

      if (!user.passwordHash) {
        return c.json({ error: 'Account already has no password' }, 400);
      }

      if (!currentPassword) {
        return c.json({ error: 'Current password is required' }, 400);
      }
      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) return c.json({ error: 'Current password is incorrect' }, 401);

      // Ensure the user has at least one alternative login method (passkey)
      const passkeys = await userRepository.listPasskeys(payload.userId);
      if (passkeys.length === 0) {
        return c.json({ error: 'You must have at least one passkey registered before removing your password' }, 400);
      }

      await userRepository.removePassword(payload.userId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/auth/password]', e);
      return c.json({ error: 'Failed to remove password' }, 500);
    }
  });

  router.post('/api/auth/logout', async (c) => {
    clearSessionCookie(c);
    return c.json({ success: true });
  });

  router.post('/api/auth/2fa/verify-login', async (c) => {
    try {
      const body = await c.req.json();
      const tempToken = typeof body?.tempToken === 'string' ? body.tempToken : '';
      const code = typeof body?.code === 'string' ? body.code : '';

      if (!tempToken || !code) {
        return c.json({ error: '2FA token and code are required' }, 400);
      }

      const clientAddress = getClientAddress(c.req.raw);
      if (!checkRateLimit({
        bucket: 'auth-login-2fa',
        keyParts: [clientAddress, hashRateLimitValue(tempToken)],
        maxAttempts: TWO_FACTOR_MAX_ATTEMPTS,
        windowMs: TWO_FACTOR_WINDOW_MS,
      })) {
        return c.json({ error: 'Too many verification attempts. Please try again later.' }, 429);
      }

      const flow = verifyFlowToken(tempToken);
      if (flow.purpose !== 'login-2fa' || !flow.userId) {
        return c.json({ error: 'Invalid 2FA flow token' }, 400);
      }

      const user = await userRepository.findById(flow.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);
      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return c.json({ error: '2FA is not enabled for this account' }, 400);
      }

      const isValidCode = verifyTotpCode(decrypt(user.twoFactorSecret), code);
      if (!isValidCode) {
        return c.json({ error: 'Invalid verification code' }, 401);
      }

      return finalizeLogin(c, userRepository, user);
    } catch (e) {
      console.error('[POST /api/auth/2fa/verify-login]', e);
      return c.json({ error: 'Failed to verify 2FA login' }, 500);
    }
  });

  router.get('/api/auth/security', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);

      const passkeys = await userRepository.listPasskeys(payload.userId);
      return c.json({
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        pendingTwoFactorSetup: Boolean(user.twoFactorTempSecret && user.twoFactorTempExpiresAt && user.twoFactorTempExpiresAt > Date.now()),
        passkeys: passkeys.map((passkey) => ({
          id: passkey.id,
          name: passkey.name,
          createdAt: passkey.createdAt,
          lastUsedAt: passkey.lastUsedAt,
          transports: passkey.transports,
        })),
      });
    } catch (e) {
      console.error('[GET /api/auth/security]', e);
      return c.json({ error: 'Failed to load security settings' }, 500);
    }
  });

  router.post('/api/auth/passkeys/register/options', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);

      const body = await c.req.json().catch(() => ({}));
      const name = typeof body?.name === 'string' ? body.name.trim() : 'This device';
      const passkeys = await userRepository.listPasskeys(payload.userId);
      const challenge = crypto.randomBytes(32).toString('base64url');
      const options = buildRegistrationOptions({
        origin: getRequestOrigin(c.req.raw),
        userId: user.sk,
        userEmail: user.email,
        challenge,
        excludeCredentialIds: passkeys.map((passkey) => passkey.credentialId),
      });

      const flowToken = signFlowToken({
        purpose: 'passkey-register',
        userId: user.sk,
        challenge,
        name,
      });

      return c.json({ options, flowToken });
    } catch (e) {
      console.error('[POST /api/auth/passkeys/register/options]', e);
      return c.json({ error: 'Failed to start passkey registration' }, 500);
    }
  });

  router.post('/api/auth/passkeys/register/verify', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const flowToken = typeof body?.flowToken === 'string' ? body.flowToken : '';
      const credential = body?.credential;

      if (!flowToken || !credential) {
        return c.json({ error: 'Registration flow token and credential are required' }, 400);
      }

      const flow = verifyFlowToken(flowToken);
      if (flow.purpose !== 'passkey-register' || flow.userId !== payload.userId || !flow.challenge) {
        return c.json({ error: 'Invalid registration flow token' }, 400);
      }

      const verified = verifyRegistrationResponse({
        origin: getRequestOrigin(c.req.raw),
        expectedChallenge: flow.challenge,
        credential,
      });

      const created = await userRepository.createPasskey(payload.userId, {
        name: flow.name || 'This device',
        credentialId: verified.credentialId,
        publicKey: verified.publicKey,
        algorithm: verified.algorithm,
        counter: verified.counter,
        transports: verified.transports,
      });

      return c.json({
        passkey: {
          id: created.id,
          name: created.name,
          createdAt: created.createdAt,
          lastUsedAt: created.lastUsedAt,
          transports: created.transports,
        },
      }, 201);
    } catch (e: any) {
      console.error('[POST /api/auth/passkeys/register/verify]', e);
      return c.json({ error: e.message || 'Failed to register passkey' }, 500);
    }
  });

  router.delete('/api/auth/passkeys/:id', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      await userRepository.deletePasskey(payload.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/auth/passkeys/:id]', e);
      return c.json({ error: 'Failed to delete passkey' }, 500);
    }
  });

  router.post('/api/auth/passkeys/login/options', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

      let allowCredentialIds: string[] | undefined;
      if (email) {
        const user = await userRepository.findByEmail(email);
        if (!user || user.status === 'disabled') {
          return c.json({ error: 'No active account was found for that email' }, 404);
        }

        const passkeys = await userRepository.listPasskeys(user.sk);
        if (passkeys.length === 0) {
          return c.json({ error: 'This account has no registered passkeys' }, 400);
        }

        allowCredentialIds = passkeys.map((passkey) => passkey.credentialId);
      }

      const challenge = crypto.randomBytes(32).toString('base64url');
      const options = buildAuthenticationOptions({
        origin: getRequestOrigin(c.req.raw),
        challenge,
        allowCredentialIds,
      });

      const flowToken = signFlowToken({
        purpose: 'passkey-login',
        challenge,
        email: email || undefined,
      });

      return c.json({ options, flowToken });
    } catch (e) {
      console.error('[POST /api/auth/passkeys/login/options]', e);
      return c.json({ error: 'Failed to start passkey login' }, 500);
    }
  });

  router.post('/api/auth/passkeys/login/verify', async (c) => {
    try {
      const body = await c.req.json();
      const flowToken = typeof body?.flowToken === 'string' ? body.flowToken : '';
      const credential = body?.credential;

      if (!flowToken || !credential) {
        return c.json({ error: 'Passkey flow token and credential are required' }, 400);
      }

      const flow = verifyFlowToken(flowToken);
      if (flow.purpose !== 'passkey-login' || !flow.challenge) {
        return c.json({ error: 'Invalid passkey flow token' }, 400);
      }

      const passkey = await userRepository.findPasskeyByCredentialId(credential.rawId || credential.id);
      if (!passkey) {
        return c.json({ error: 'Passkey not recognized' }, 404);
      }

      const user = await userRepository.findById(passkey.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);
      if (user.status === 'disabled') return c.json({ error: 'This account has been disabled' }, 403);
      if (flow.email && user.email !== flow.email) {
        return c.json({ error: 'Passkey does not match the requested account' }, 400);
      }

      const verified = verifyAuthenticationResponse({
        origin: getRequestOrigin(c.req.raw),
        expectedChallenge: flow.challenge,
        credential,
        storedCredentialId: passkey.credentialId,
        publicKey: passkey.publicKey,
        algorithm: passkey.algorithm,
        previousCounter: passkey.counter,
      });

      await userRepository.updatePasskeyCounter(passkey.id, verified.counter);
      return finalizeLogin(c, userRepository, user);
    } catch (e: any) {
      console.error('[POST /api/auth/passkeys/login/verify]', e);
      return c.json({ error: e.message || 'Failed to verify passkey login' }, 500);
    }
  });

  router.post('/api/auth/2fa/setup', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const password = typeof body?.password === 'string' ? body.password : '';

      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);

      if (user.passwordHash) {
        if (!password) {
          return c.json({ error: 'Password is required to set up 2FA' }, 400);
        }
        const validPassword = await verifyPassword(password, user.passwordHash);
        if (!validPassword) {
          return c.json({ error: 'Current password is incorrect' }, 401);
        }
      }

      const secret = generateTotpSecret();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await userRepository.startTwoFactorSetup(payload.userId, encrypt(secret), expiresAt);

      return c.json({
        secret,
        otpauthUri: generateOtpAuthUri(user.email, secret),
        expiresAt: expiresAt.getTime(),
      });
    } catch (e) {
      console.error('[POST /api/auth/2fa/setup]', e);
      return c.json({ error: 'Failed to set up 2FA' }, 500);
    }
  });

  router.post('/api/auth/2fa/enable', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const code = typeof body?.code === 'string' ? body.code : '';

      if (!code) {
        return c.json({ error: 'Verification code is required' }, 400);
      }

      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);
      if (!user.twoFactorTempSecret || !user.twoFactorTempExpiresAt || user.twoFactorTempExpiresAt < Date.now()) {
        return c.json({ error: 'Start 2FA setup again before enabling it' }, 400);
      }

      const secret = decrypt(user.twoFactorTempSecret);
      if (!verifyTotpCode(secret, code)) {
        return c.json({ error: 'Invalid verification code' }, 401);
      }

      await userRepository.enableTwoFactor(payload.userId, encrypt(secret));
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/auth/2fa/enable]', e);
      return c.json({ error: 'Failed to enable 2FA' }, 500);
    }
  });

  router.post('/api/auth/2fa/disable', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const password = typeof body?.password === 'string' ? body.password : '';
      const code = typeof body?.code === 'string' ? body.code : '';

      if (!code) {
        return c.json({ error: 'Verification code is required' }, 400);
      }

      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);
      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return c.json({ error: '2FA is not enabled for this account' }, 400);
      }

      if (user.passwordHash) {
        if (!password) {
          return c.json({ error: 'Password is required' }, 400);
        }
        const validPassword = await verifyPassword(password, user.passwordHash);
        if (!validPassword) {
          return c.json({ error: 'Current password is incorrect' }, 401);
        }
      }

      const validCode = verifyTotpCode(decrypt(user.twoFactorSecret), code);
      if (!validCode) {
        return c.json({ error: 'Invalid verification code' }, 401);
      }

      await userRepository.disableTwoFactor(payload.userId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/auth/2fa/disable]', e);
      return c.json({ error: 'Failed to disable 2FA' }, 500);
    }
  });

  router.get('/api/admin/users', authMiddleware, adminOnly, async (c) => {
    try {
      const q = c.req.query('q')?.trim();
      const role = c.req.query('role');
      const status = c.req.query('status');
      const page = Number(c.req.query('page') || 1);
      const pageSize = Number(c.req.query('pageSize') || 20);
      const sortBy = c.req.query('sortBy');
      const sortOrder = c.req.query('sortOrder');

      const result = await userRepository.listUsers({
        q: q || undefined,
        role: VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : undefined,
        status: VALID_STATUSES.includes(status as UserStatus) ? (status as UserStatus) : undefined,
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 20,
        sortBy: sortBy === 'email' || sortBy === 'lastLoginAt' || sortBy === 'createdAt' ? sortBy : undefined,
        sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined,
      });

      return c.json(result);
    } catch (e) {
      console.error('[GET /api/admin/users]', e);
      return c.json({ error: 'Failed to list users' }, 500);
    }
  });

  router.post('/api/admin/users', authMiddleware, adminOnly, async (c) => {
    try {
      const body = await c.req.json();
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' && body.password ? body.password : '';
      const role = body?.role;
      const status = body?.status;
      const storageLimit = Number(body?.storageLimit ?? DEFAULT_STORAGE_LIMIT);

      if (!email) {
        return c.json({ error: 'Email is required' }, 400);
      }
      if (password && password.length < 8) {
        return c.json({ error: 'Password must be at least 8 characters long' }, 400);
      }
      if (!VALID_ROLES.includes(role)) {
        return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400);
      }
      if (!VALID_STATUSES.includes(status)) {
        return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400);
      }
      if (!Number.isFinite(storageLimit) || storageLimit <= 0) {
        return c.json({ error: 'Invalid storage limit' }, 400);
      }

      const passwordHash = password ? await hashPassword(password) : null;
      await userRepository.createUser({
        pk: 'USER',
        sk: crypto.randomUUID(),
        email,
        passwordHash,
        role,
        status,
        storageLimit,
        createdAt: Date.now(),
      });

      const created = await userRepository.findByEmail(email);
      if (!created) return c.json({ error: 'Failed to load created user' }, 500);
      return c.json({ user: serializeUser(created) }, 201);
    } catch (e: any) {
      console.error('[POST /api/admin/users]', e);
      return c.json({ error: e.message || 'Failed to create user' }, 500);
    }
  });

  router.get('/api/admin/users/:id', authMiddleware, adminOnly, async (c) => {
    try {
      const userId = c.req.param('id');
      const detail = await userRepository.getUserDetail(userId);
      if (!detail) return c.json({ error: 'User not found' }, 404);
      return c.json(detail);
    } catch (e) {
      console.error('[GET /api/admin/users/:id]', e);
      return c.json({ error: 'Failed to load user detail' }, 500);
    }
  });

  router.put('/api/admin/users/:id/role', authMiddleware, adminOnly, async (c) => {
    try {
      const currentUser = c.get('user') as JwtPayload;
      const userId = c.req.param('id');
      const body = await c.req.json();
      const role = body?.role;

      if (!VALID_ROLES.includes(role)) {
        return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400);
      }

      const targetUser = await userRepository.findById(userId);
      if (!targetUser) return c.json({ error: 'User not found' }, 404);
      if (targetUser.role === 'admin' && role !== 'admin') {
        const otherActiveAdmins = await userRepository.countActiveAdmins(userId);
        if (otherActiveAdmins === 0) {
          return c.json({ error: 'You cannot demote the last active admin' }, 400);
        }
      }
      if (currentUser.userId === userId && role !== 'admin') {
        return c.json({ error: 'You cannot remove your own admin access' }, 400);
      }

      await userRepository.updateRole(userId, role as UserRole);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/admin/users/:id/role]', e);
      return c.json({ error: 'Failed to update role' }, 500);
    }
  });

  router.put('/api/admin/users/:id/storage-limit', authMiddleware, adminOnly, async (c) => {
    try {
      const userId = c.req.param('id');
      const body = await c.req.json();
      const limit = Number(body?.limit);

      if (isNaN(limit) || limit < 0) {
        return c.json({ error: 'Invalid storage limit' }, 400);
      }

      await userRepository.updateStorageLimit(userId, limit);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/admin/users/:id/storage-limit]', e);
      return c.json({ error: 'Failed to update storage limit' }, 500);
    }
  });

  router.put('/api/admin/users/:id/status', authMiddleware, adminOnly, async (c) => {
    try {
      const currentUser = c.get('user') as JwtPayload;
      const userId = c.req.param('id');
      const body = await c.req.json();
      const status = body?.status;

      if (!VALID_STATUSES.includes(status)) {
        return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400);
      }

      const targetUser = await userRepository.findById(userId);
      if (!targetUser) return c.json({ error: 'User not found' }, 404);
      if (currentUser.userId === userId) {
        return c.json({ error: 'You cannot change your own status' }, 400);
      }
      if (targetUser.role === 'admin' && targetUser.status === 'active' && status !== 'active') {
        const otherActiveAdmins = await userRepository.countActiveAdmins(userId);
        if (otherActiveAdmins === 0) {
          return c.json({ error: 'You cannot disable the last active admin' }, 400);
        }
      }

      await userRepository.updateStatus(userId, status as UserStatus);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/admin/users/:id/status]', e);
      return c.json({ error: 'Failed to update user status' }, 500);
    }
  });

  router.put('/api/admin/users/:id/password', authMiddleware, adminOnly, async (c) => {
    try {
      const currentUser = c.get('user') as JwtPayload;
      const userId = c.req.param('id');
      const body = await c.req.json();
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

      if (currentUser.userId === userId) {
        return c.json({ error: 'Use account settings to change your own password' }, 400);
      }
      if (newPassword.length < 8) {
        return c.json({ error: 'New password must be at least 8 characters long' }, 400);
      }

      const targetUser = await userRepository.findById(userId);
      if (!targetUser) return c.json({ error: 'User not found' }, 404);

      const passwordHash = await hashPassword(newPassword);
      await userRepository.updatePassword(userId, passwordHash);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/admin/users/:id/password]', e);
      return c.json({ error: 'Failed to reset password' }, 500);
    }
  });

  // ========== Google Drive OAuth (connect/disconnect) ==========

  router.get('/api/auth/google-drive/status', authMiddleware, async (c) => {
    const payload = c.get('user') as JwtPayload;
    const token = await userRepository.getGoogleDriveRefreshToken(payload.userId);
    return c.json({ connected: Boolean(token) });
  });

  router.get('/api/auth/google-drive/connect', authMiddleware, async (c) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return c.json({ error: 'Google OAuth is not configured' }, 500);
    }

    // Build the Drive-specific redirect URI by replacing the path
    const driveRedirectUri = new URL(redirectUri);
    driveRedirectUri.pathname = '/api/auth/google-drive/callback';
    const driveRedirectUriStr = driveRedirectUri.toString();

    const state = crypto.randomBytes(32).toString('hex');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: driveRedirectUriStr,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      state,
      prompt: 'consent',
    });

    const stateToken = signFlowToken({ purpose: 'google-drive-connect', state, userId: c.get('user').userId } as any, '10m');
    const cookieOpts = getSessionCookieOptions(c.req.url);
    setCookie(c, 'google_drive_state', stateToken, {
      ...cookieOpts,
      sameSite: 'Lax',
      maxAge: 600,
    });

    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  router.get('/api/auth/google-drive/callback', authMiddleware, async (c) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        return c.redirect('/account?tab=security&error=Google+OAuth+is+not+configured');
      }

      const driveRedirectUri = new URL(redirectUri);
      driveRedirectUri.pathname = '/api/auth/google-drive/callback';
      const driveRedirectUriStr = driveRedirectUri.toString();

      const code = c.req.query('code');
      const state = c.req.query('state');
      const errorParam = c.req.query('error');

      if (errorParam) {
        return c.redirect(`/account?tab=security&error=${encodeURIComponent(errorParam)}`);
      }

      if (!code || !state) {
        return c.redirect('/account?tab=security&error=Invalid+OAuth+callback');
      }

      const stateCookie = getCookie(c, 'google_drive_state');
      if (!stateCookie) {
        return c.redirect('/account?tab=security&error=OAuth+state+expired');
      }

      try {
        const flow = verifyFlowToken(stateCookie) as any;
        if (flow.purpose !== 'google-drive-connect' || flow.state !== state) {
          return c.redirect('/account?tab=security&error=Invalid+OAuth+state');
        }
      } catch {
        return c.redirect('/account?tab=security&error=Invalid+OAuth+state');
      }

      // Clear state cookie
      setCookie(c, 'google_drive_state', '', {
        ...getSessionCookieOptions(c.req.url),
        maxAge: 0,
      });

      // Exchange code for tokens (including refresh_token because access_type=offline)
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: driveRedirectUriStr,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        console.error('[Google Drive] Token exchange failed:', await tokenRes.text());
        return c.redirect('/account?tab=security&error=Failed+to+connect+Google+Drive');
      }

      const tokenData = await tokenRes.json() as { refresh_token?: string; access_token?: string };
      if (!tokenData.refresh_token) {
        return c.redirect('/account?tab=security&error=Failed+to+get+refresh+token.+Please+try+again.');
      }

      const payload = c.get('user') as JwtPayload;
      await userRepository.setGoogleDriveRefreshToken(payload.userId, encrypt(tokenData.refresh_token));

      return c.redirect('/account?tab=security&success=Google+Drive+connected');
    } catch (e) {
      console.error('[GET /api/auth/google-drive/callback]', e);
      return c.redirect('/account?tab=security&error=Google+Drive+connection+failed');
    }
  });

  router.delete('/api/auth/google-drive/disconnect', authMiddleware, async (c) => {
    try {
      const payload = c.get('user') as JwtPayload;
      await userRepository.clearGoogleDriveRefreshToken(payload.userId);
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/auth/google-drive/disconnect]', e);
      return c.json({ error: 'Failed to disconnect Google Drive' }, 500);
    }
  });

  // ========== Google OAuth ==========

  router.get('/api/auth/google', (c) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return c.json({ error: 'Google OAuth is not configured' }, 500);
    }

    const state = crypto.randomBytes(32).toString('hex');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      state,
      prompt: 'select_account',
    });

    const stateToken = signFlowToken({ purpose: 'google-oauth', state } as any, '10m');
    const cookieOpts = getSessionCookieOptions(c.req.url);
    setCookie(c, 'google_oauth_state', stateToken, {
      ...cookieOpts,
      sameSite: 'Lax',
      maxAge: 600,
    });

    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  router.get('/api/auth/google/callback', async (c) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        return c.redirect('/login?error=Google+OAuth+is+not+configured');
      }

      const code = c.req.query('code');
      const state = c.req.query('state');
      const errorParam = c.req.query('error');

      if (errorParam) {
        return c.redirect(`/login?error=${encodeURIComponent(errorParam)}`);
      }

      if (!code || !state) {
        return c.redirect('/login?error=Invalid+OAuth+callback');
      }

      // Verify state
      const stateCookie = getCookie(c, 'google_oauth_state');
      if (!stateCookie) {
        return c.redirect('/login?error=OAuth+state+expired');
      }

      try {
        const flow = verifyFlowToken(stateCookie) as any;
        if (flow.purpose !== 'google-oauth' || flow.state !== state) {
          return c.redirect('/login?error=Invalid+OAuth+state');
        }
      } catch {
        return c.redirect('/login?error=Invalid+OAuth+state');
      }

      // Clear state cookie
      setCookie(c, 'google_oauth_state', '', {
        ...getSessionCookieOptions(c.req.url),
        maxAge: 0,
      });

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        console.error('[Google OAuth] Token exchange failed:', await tokenRes.text());
        return c.redirect('/login?error=Failed+to+authenticate+with+Google');
      }

      const tokenData = await tokenRes.json() as { id_token?: string };
      if (!tokenData.id_token) {
        return c.redirect('/login?error=Failed+to+get+identity+from+Google');
      }

      // Verify ID token signature and claims using Google's public keys
      const oauth2Client = new OAuth2Client(clientId);
      let payload;
      try {
        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokenData.id_token,
          audience: clientId,
        });
        payload = ticket.getPayload();
      } catch (e) {
        console.error('[Google OAuth] ID token verification failed:', e);
        return c.redirect('/login?error=Failed+to+verify+Google+identity');
      }

      if (!payload?.email || !payload.email_verified) {
        return c.redirect('/login?error=Google+account+email+is+not+verified');
      }

      const email = payload.email.toLowerCase();

      // Only allow login for existing active users — no registration
      const user = await userRepository.findByEmail(email);
      if (!user) {
        return c.redirect('/login?error=No+account+found+for+this+email.+Registration+is+disabled.');
      }
      if (user.status === 'disabled') {
        return c.redirect('/login?error=This+account+has+been+disabled');
      }

      // Finalize login (set JWT cookie)
      await userRepository.touchLastLogin(user.sk);
      const token = signToken({
        userId: user.sk,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion ?? 0,
      });
      setCookie(c, 'token', token, getSessionCookieOptions(c.req.url));

      return c.redirect('/');
    } catch (e) {
      console.error('[GET /api/auth/google/callback]', e);
      return c.redirect('/login?error=Google+login+failed');
    }
  });

  return router;
}

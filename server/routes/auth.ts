import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { authMiddleware, adminOnly, hashPassword, verifyPassword, signToken, JwtPayload } from '../auth/auth';
import { UserRepository } from '../auth/user-repository';
import { checkRateLimit } from '../utils/rate-limiter';
import crypto from 'crypto';
import type { UserRole, UserStatus } from '../../src/types';

const VALID_ROLES: UserRole[] = ['admin', 'user'];
const VALID_STATUSES: UserStatus[] = ['active', 'disabled'];
const DEFAULT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;

type Variables = { user: JwtPayload };

function serializeUser(user: NonNullable<Awaited<ReturnType<UserRepository['findById']>>>) {
  return {
    id: user.sk,
    email: user.email,
    role: user.role,
    status: user.status,
    storageLimit: user.storageLimit,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function createAuthRouter(userRepository: UserRepository) {
  const router = new Hono<{ Variables: Variables }>();

  router.post('/api/auth/login', async (c) => {
    try {
      const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
      if (!checkRateLimit(ip)) {
        return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
      }

      const body = await c.req.json();
      const email = typeof body?.email === 'string' ? body.email.trim() : null;
      const password = typeof body?.password === 'string' ? body.password : null;

      if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

      const user = await userRepository.findByEmail(email);
      if (!user) return c.json({ error: 'Invalid credentials' }, 401);
      if (user.status === 'disabled') return c.json({ error: 'This account has been disabled' }, 403);

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

      await userRepository.touchLastLogin(user.sk);

      const token = signToken({ userId: user.sk, email: user.email, role: user.role });

      // Set cookie for browser auth (e.g. <img> tags)
      setCookie(c, 'token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      return c.json({
        token,
        user: {
          ...serializeUser({ ...user, lastLoginAt: Date.now() }),
        }
      });
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

      if (!currentPassword || !newPassword) {
        return c.json({ error: 'Current password and new password are required' }, 400);
      }

      if (newPassword.length < 8) {
        return c.json({ error: 'New password must be at least 8 characters long' }, 400);
      }

      const user = await userRepository.findById(payload.userId);
      if (!user) return c.json({ error: 'User not found' }, 404);

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) return c.json({ error: 'Current password is incorrect' }, 401);

      if (currentPassword === newPassword) {
        return c.json({ error: 'New password must be different from your current password' }, 400);
      }

      const passwordHash = await hashPassword(newPassword);
      await userRepository.updatePassword(payload.userId, passwordHash);

      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/auth/password]', e);
      return c.json({ error: 'Failed to update password' }, 500);
    }
  });

  router.post('/api/auth/logout', async (c) => {
    setCookie(c, 'token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 0,
      path: '/',
    });
    return c.json({ success: true });
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
      const password = typeof body?.password === 'string' ? body.password : '';
      const role = body?.role;
      const status = body?.status;
      const storageLimit = Number(body?.storageLimit ?? DEFAULT_STORAGE_LIMIT);

      if (!email || !password) {
        return c.json({ error: 'Email and password are required' }, 400);
      }
      if (password.length < 8) {
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

      const passwordHash = await hashPassword(password);
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

  return router;
}

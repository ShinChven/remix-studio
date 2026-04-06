import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { authMiddleware, adminOnly, hashPassword, verifyPassword, signToken, JwtPayload } from '../auth/auth';
import { UserRepository } from '../auth/user-repository';
import { checkRateLimit } from '../utils/rate-limiter';
import type { UserRole } from '../../src/types';

const VALID_ROLES: UserRole[] = ['admin', 'user'];

type Variables = { user: JwtPayload };

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

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

      const token = signToken({ userId: user.sk, email: user.email, role: user.role });

      // Set cookie for browser auth (e.g. <img> tags)
      setCookie(c, 'token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      return c.json({ token, user: { id: user.sk, email: user.email, role: user.role } });
    } catch (e) {
      console.error('[POST /api/auth/login]', e);
      return c.json({ error: 'Login failed' }, 500);
    }
  });

  router.get('/api/auth/me', authMiddleware, async (c) => {
    const payload = c.get('user') as JwtPayload;
    return c.json({ user: { id: payload.userId, email: payload.email, role: payload.role } });
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
      const users = await userRepository.listUsers();
      return c.json(users.map(u => ({ 
        id: u.sk, 
        email: u.email, 
        role: u.role, 
        storageLimit: u.storageLimit,
        createdAt: u.createdAt 
      })));
    } catch (e) {
      console.error('[GET /api/admin/users]', e);
      return c.json({ error: 'Failed to list users' }, 500);
    }
  });

  router.put('/api/admin/users/:id/role', authMiddleware, adminOnly, async (c) => {
    try {
      const userId = c.req.param('id');
      const body = await c.req.json();
      const role = body?.role;

      if (!VALID_ROLES.includes(role)) {
        return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400);
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

  return router;
}

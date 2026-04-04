import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Context, Next } from 'hono';
import type { UserRole } from '../../src/types';

const JWT_SECRET = process.env.JWT_SECRET || 'remix-studio-dev-secret';
const SALT_ROUNDS = 10;

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface UserRecord {
  pk: string;       // 'USER'
  sk: string;       // userId
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

import { getCookie } from 'hono/cookie';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function authMiddleware(c: Context, next: Next): Response | Promise<Response | void> {
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = getCookie(c, 'token');
  }

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = verifyToken(token);
    c.set('user', payload);
    return next() as Promise<void>;
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export function adminOnly(c: Context, next: Next): Response | Promise<Response | void> {
  const user = c.get('user') as JwtPayload;
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: admin access required' }, 403);
  }
  return next() as Promise<void>;
}

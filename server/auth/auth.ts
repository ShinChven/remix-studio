import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { UserRole, UserStatus } from '../../src/types';
import type { UserRepository } from './user-repository';

const SALT_ROUNDS = 10;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV !== 'test') {
    throw new Error('JWT_SECRET is required');
  }
  return secret || 'test-jwt-secret';
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionVersion: number;
}

export interface AuthFlowPayload {
  purpose:
    | 'login-2fa'
    | 'google-drive-connect'
    | 'google-oauth'
    | 'passkey-register'
    | 'passkey-login';
  userId?: string;
  email?: string;
  challenge?: string;
  name?: string;
  method?: 'password' | 'passkey';
  state?: string;
  nextUrl?: string;
  inviteCode?: string;
  googleSub?: string;
}

export interface UserRecord {
  pk: string;       // 'USER'
  sk: string;       // userId
  email: string;
  passwordHash?: string | null;
  role: UserRole;
  status: UserStatus;
  createdByUserId?: string | null;
  storageLimit?: number;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  twoFactorTempSecret?: string | null;
  twoFactorTempExpiresAt?: number | null;
  googleDriveRefreshToken?: string | null;
  createdAt: number;
  updatedAt?: number;
  lastLoginAt?: number;
  sessionVersion?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let authUserRepository: UserRepository | null = null;

export function configureAuth(userRepository: UserRepository) {
  authUserRepository = userRepository;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '2h' });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

export function signFlowToken(payload: AuthFlowPayload, expiresIn: SignOptions['expiresIn'] = '10m'): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyFlowToken(token: string): AuthFlowPayload {
  return jwt.verify(token, getJwtSecret()) as AuthFlowPayload;
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const token = getCookie(c, 'token');

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = verifyToken(token);
    if (authUserRepository) {
      const user = await authUserRepository.findById(payload.userId);
      if (!user) {
        return c.json({ error: 'User not found' }, 401);
      }
      if (user.status === 'disabled') {
        return c.json({ error: 'This account has been disabled' }, 403);
      }
      if ((user.sessionVersion ?? 0) !== payload.sessionVersion) {
        return c.json({ error: 'Session expired' }, 401);
      }
      c.set('user', {
        ...payload,
        role: user.role,
        email: user.email,
        sessionVersion: user.sessionVersion ?? 0,
      });
    } else {
      c.set('user', payload);
    }
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      c.set('tokenExpired', true); // useful if we want to signal the client
    }
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

import crypto from 'crypto';
import type { MediaDevice, PrismaClient } from '@prisma/client';
import { ProjectScope, scopeFromJson } from './catalog';

/**
 * Tokens that let a TV or a WebDAV client read a user's albums. Only a hash
 * is stored; the raw token is shown once, when the device is created.
 */

export type MediaDeviceKind = 'tv' | 'webdav' | 'dlna';

export const MEDIA_TOKEN_PREFIX = 'rsm_';

export interface ResolvedDevice {
  device: MediaDevice;
  userId: string;
  scope: ProjectScope;
}

export function hashMediaToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateMediaToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${MEDIA_TOKEN_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  return { token, tokenHash: hashMediaToken(token), tokenPrefix: token.slice(0, 10) };
}

/** How often a device's last-used time is written back, at most. */
const TOUCH_INTERVAL_MS = 60_000;

export class MediaDeviceAuth {
  private lastTouch = new Map<string, number>();

  constructor(private prisma: PrismaClient) {}

  private async accept(device: MediaDevice | null, ip?: string): Promise<ResolvedDevice | null> {
    if (!device) return null;
    const user = await this.prisma.user.findUnique({ where: { id: device.userId }, select: { status: true } });
    if (!user || user.status === 'disabled') return null;
    this.touch(device, ip);
    return { device, userId: device.userId, scope: scopeFromJson(device.projectIds) };
  }

  /** A token only opens the protocol it was issued for. */
  async resolveToken(rawToken: string | undefined | null, kind: 'tv' | 'webdav', ip?: string): Promise<ResolvedDevice | null> {
    if (!rawToken || !rawToken.startsWith(MEDIA_TOKEN_PREFIX) || rawToken.length > 128) return null;
    const device = await this.prisma.mediaDevice.findUnique({ where: { tokenHash: hashMediaToken(rawToken) } });
    if (!device || device.kind !== kind) return null;
    return this.accept(device, ip);
  }

  async resolveDlnaServer(deviceId: string, ip?: string): Promise<ResolvedDevice | null> {
    if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return null;
    const device = await this.prisma.mediaDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.kind !== 'dlna') return null;
    return this.accept(device, ip);
  }

  private touch(device: MediaDevice, ip?: string) {
    const now = Date.now();
    if (now - (this.lastTouch.get(device.id) ?? 0) < TOUCH_INTERVAL_MS) return;
    this.lastTouch.set(device.id, now);
    this.prisma.mediaDevice
      .update({ where: { id: device.id }, data: { lastUsedAt: new Date(now), ...(ip ? { lastSeenIp: ip.slice(0, 64) } : {}) } })
      .catch(() => {});
  }
}

/** Reads `Authorization: Bearer <token>` or Basic auth whose password is the token. */
export function tokenFromAuthorization(header: string | undefined | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ', 2);
  if (!value) return null;
  if (scheme.toLowerCase() === 'bearer') return value.trim();
  if (scheme.toLowerCase() === 'basic') {
    try {
      const decoded = Buffer.from(value.trim(), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;
      // Some clients only offer a user name field; accept the token there too.
      if (password.startsWith(MEDIA_TOKEN_PREFIX)) return password;
      const user = colon >= 0 ? decoded.slice(0, colon) : '';
      return user.startsWith(MEDIA_TOKEN_PREFIX) ? user : password;
    } catch {
      return null;
    }
  }
  return null;
}

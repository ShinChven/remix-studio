import crypto from 'crypto';
import QRCode from 'qrcode';
import { Hono, type Context } from 'hono';
import { Prisma, type MediaDevice, type PrismaClient } from '@prisma/client';
import { authMiddleware, JwtPayload } from '../auth/auth';
import type { S3Storage } from '../storage/s3-storage';
import { checkRateLimit } from '../utils/rate-limiter';
import { MediaCatalog, MediaEntry, MediaFolder, scopeFromJson } from './catalog';
import { MediaDeviceAuth, ResolvedDevice, generateMediaToken, hashMediaToken, tokenFromAuthorization } from './device-auth';
import type { MediaKind } from './media-types';
import { clientAddress } from './net-utils';
import type { DlnaService } from './dlna/dlna-service';

/**
 * HTTP API for media sharing:
 *  - /api/media-devices, /api/media-pairings: the signed-in user manages the
 *    devices that may read their albums and approves TVs waiting to link.
 *  - /api/tv/*: what TV mode calls with its device token.
 */

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_POLL_INTERVAL_S = 3;
// No 0/O, 1/I/L, 5/S or U/V: easy to read off a TV across a room.
const USER_CODE_ALPHABET = '2346789ABCDEFGHJKMNPQRTWXYZ';
const MEDIA_URL_TTL_S = 6 * 3600;
const KINDS: MediaKind[] = ['image', 'video', 'audio'];

type Variables = { user: JwtPayload; device: ResolvedDevice };

function generateUserCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
  return code;
}

export function normalizeUserCode(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function guessTvName(userAgent: string | undefined): string {
  const ua = userAgent || '';
  if (/web0s|webos/i.test(ua)) return 'LG TV';
  if (/tizen/i.test(ua)) return 'Samsung TV';
  if (/android tv|bravia|googletv|aft\w/i.test(ua)) return 'Android TV';
  if (/playstation|xbox/i.test(ua)) return 'Game console';
  return 'TV';
}

/**
 * Where the phone should open the approval page: the address the TV itself
 * uses (it reached the server there), else APP_URL, else this request's host.
 */
function linkOrigin(c: Context, tvOrigin: unknown): string {
  if (typeof tvOrigin === 'string') {
    try {
      const url = new URL(tvOrigin);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // fall through
    }
  }
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, '');
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim() || new URL(c.req.url).protocol.replace(':', '');
  return `${proto}://${c.req.header('host')}`;
}

function cleanName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.trim().slice(0, 64) : '';
  return name || fallback;
}

/**
 * Validates a scope from a request body: null for every project, else the
 * listed projects the user owns. Ids of projects deleted since the list was
 * loaded are dropped rather than failing the save.
 */
async function parseScope(prisma: PrismaClient, userId: string, value: unknown): Promise<string[] | null | 'invalid'> {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return 'invalid';
  const ids = Array.from(new Set(value.filter((id): id is string => typeof id === 'string')));
  const owned = await prisma.project.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
  return owned.length > 0 ? owned.map((project) => project.id) : 'invalid';
}

function serializeDevice(device: MediaDevice, existingProjects?: Set<string>) {
  const scope = scopeFromJson(device.projectIds);
  return {
    id: device.id,
    name: device.name,
    kind: device.kind,
    tokenPrefix: device.tokenPrefix,
    projectIds: scope && existingProjects ? scope.filter((id) => existingProjects.has(id)) : scope,
    lastUsedAt: device.lastUsedAt?.getTime() ?? null,
    lastSeenIp: device.lastSeenIp,
    createdAt: device.createdAt.getTime(),
  };
}

export function createMediaRouter(
  prisma: PrismaClient,
  catalog: MediaCatalog,
  auth: MediaDeviceAuth,
  storage: S3Storage,
  dlna: DlnaService | null,
) {
  const router = new Hono<{ Variables: Variables }>();

  // ============================================================
  // Device management (signed-in user)
  // ============================================================

  router.get('/api/media-devices', authMiddleware, async (c) => {
    const user = c.get('user');
    const [devices, projects] = await Promise.all([
      prisma.mediaDevice.findMany({ where: { userId: user.userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.project.findMany({ where: { userId: user.userId }, select: { id: true } }),
    ]);
    const existing = new Set(projects.map((project) => project.id));
    return c.json({
      devices: devices.map((device) => serializeDevice(device, existing)),
      dlna: dlna ? dlna.status() : { enabled: false, running: false, addresses: [] },
    });
  });

  router.post('/api/media-devices', authMiddleware, async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);
    const kind = body?.kind;
    if (kind !== 'webdav' && kind !== 'dlna') return c.json({ error: 'kind must be webdav or dlna' }, 400);
    const scope = await parseScope(prisma, user.userId, body?.projectIds);
    if (scope === 'invalid') return c.json({ error: 'Invalid project selection' }, 400);
    const count = await prisma.mediaDevice.count({ where: { userId: user.userId } });
    if (count >= 50) return c.json({ error: 'Too many devices; remove some first' }, 400);

    const projectIds = scope ?? Prisma.DbNull;
    if (kind === 'dlna') {
      const device = await prisma.mediaDevice.create({
        data: { userId: user.userId, kind, name: cleanName(body?.name, 'Remix Studio'), projectIds },
      });
      dlna?.refresh();
      return c.json({ device: serializeDevice(device) }, 201);
    }
    const { token, tokenHash, tokenPrefix } = generateMediaToken();
    const device = await prisma.mediaDevice.create({
      data: { userId: user.userId, kind, name: cleanName(body?.name, 'WebDAV'), tokenHash, tokenPrefix, projectIds },
    });
    // The raw token is returned once and cannot be read back.
    return c.json({ device: serializeDevice(device), token }, 201);
  });

  router.patch('/api/media-devices/:id', authMiddleware, async (c) => {
    const user = c.get('user');
    const device = await prisma.mediaDevice.findFirst({ where: { id: c.req.param('id'), userId: user.userId } });
    if (!device) return c.json({ error: 'Device not found' }, 404);
    const body = await c.req.json().catch(() => null);
    const data: Prisma.MediaDeviceUpdateInput = {};
    if (body && 'name' in body) data.name = cleanName(body.name, device.name);
    if (body && 'projectIds' in body) {
      const scope = await parseScope(prisma, user.userId, body.projectIds);
      if (scope === 'invalid') return c.json({ error: 'Invalid project selection' }, 400);
      data.projectIds = scope ?? Prisma.DbNull;
    }
    const updated = await prisma.mediaDevice.update({ where: { id: device.id }, data });
    if (device.kind === 'dlna') dlna?.refresh();
    return c.json({ device: serializeDevice(updated) });
  });

  router.delete('/api/media-devices/:id', authMiddleware, async (c) => {
    const user = c.get('user');
    const device = await prisma.mediaDevice.findFirst({ where: { id: c.req.param('id'), userId: user.userId } });
    if (!device) return c.json({ error: 'Device not found' }, 404);
    if (device.kind === 'dlna') await dlna?.retire(device.id);
    await prisma.mediaDevice.delete({ where: { id: device.id } });
    return c.json({ success: true });
  });

  /** A pending TV, looked up by the code it shows, for the approval screen. */
  router.get('/api/media-pairings/:code', authMiddleware, async (c) => {
    // Codes are short enough to guess at scale; cap lookups per user.
    if (!checkRateLimit({ bucket: 'media-pairing-lookup', keyParts: [c.get('user').userId], maxAttempts: 30, windowMs: 10 * 60 * 1000 })) {
      return c.json({ error: 'Too many attempts, try again later' }, 429);
    }
    const pairing = await prisma.mediaPairing.findUnique({ where: { userCode: normalizeUserCode(c.req.param('code')) } });
    if (!pairing || pairing.expiresAt < new Date() || pairing.status !== 'pending') {
      return c.json({ error: 'This code is invalid or has expired' }, 404);
    }
    return c.json({
      userCode: pairing.userCode,
      suggestedName: guessTvName(pairing.userAgent ?? undefined),
      userAgent: pairing.userAgent,
      expiresAt: pairing.expiresAt.getTime(),
    });
  });

  router.post('/api/media-pairings/:code/approve', authMiddleware, async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);
    const scope = await parseScope(prisma, user.userId, body?.projectIds);
    if (scope === 'invalid') return c.json({ error: 'Invalid project selection' }, 400);
    const pairing = await prisma.mediaPairing.findUnique({ where: { userCode: normalizeUserCode(c.req.param('code')) } });
    if (!pairing || pairing.expiresAt < new Date()) return c.json({ error: 'This code is invalid or has expired' }, 404);
    const result = await prisma.mediaPairing.updateMany({
      where: { id: pairing.id, status: 'pending' },
      data: {
        status: 'approved',
        userId: user.userId,
        deviceName: cleanName(body?.name, guessTvName(pairing.userAgent ?? undefined)),
        projectIds: scope ?? Prisma.DbNull,
      },
    });
    if (result.count === 0) return c.json({ error: 'This code was already used' }, 409);
    return c.json({ success: true });
  });

  router.post('/api/media-pairings/:code/deny', authMiddleware, async (c) => {
    await prisma.mediaPairing.updateMany({
      where: { userCode: normalizeUserCode(c.req.param('code')), status: 'pending' },
      data: { status: 'denied' },
    });
    return c.json({ success: true });
  });

  // ============================================================
  // TV pairing (no session: the TV has nothing but its screen)
  // ============================================================

  router.post('/api/tv/pair/start', async (c) => {
    const ip = clientAddress(c);
    if (!checkRateLimit({ bucket: 'tv-pair-start', keyParts: [ip], maxAttempts: 20, windowMs: 10 * 60 * 1000 })) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    await prisma.mediaPairing.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    const body = await c.req.json().catch(() => null);

    const deviceCode = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    for (let attempt = 0; attempt < 5; attempt++) {
      const userCode = generateUserCode();
      try {
        await prisma.mediaPairing.create({
          data: { deviceCodeHash: hashMediaToken(deviceCode), userCode, expiresAt, userAgent: c.req.header('user-agent')?.slice(0, 512) },
        });
        const linkUrl = `${linkOrigin(c, body?.origin)}/link?code=${userCode}`;
        return c.json({
          deviceCode,
          userCode,
          expiresAt: expiresAt.getTime(),
          interval: PAIRING_POLL_INTERVAL_S,
          linkUrl,
          qrSvg: await QRCode.toString(linkUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    return c.json({ error: 'Could not allocate a code, try again' }, 503);
  });

  router.post('/api/tv/pair/poll', async (c) => {
    const body = await c.req.json().catch(() => null);
    const deviceCode = typeof body?.deviceCode === 'string' ? body.deviceCode : '';
    if (!deviceCode) return c.json({ error: 'deviceCode is required' }, 400);
    const pairing = await prisma.mediaPairing.findUnique({ where: { deviceCodeHash: hashMediaToken(deviceCode) } });
    if (!pairing || pairing.expiresAt < new Date()) return c.json({ status: 'expired' }, 410);
    if (pairing.status === 'denied') {
      await prisma.mediaPairing.delete({ where: { id: pairing.id } }).catch(() => {});
      return c.json({ status: 'denied' }, 403);
    }
    if (pairing.status !== 'approved' || !pairing.userId) return c.json({ status: 'pending' });

    // Claim the approval exactly once, even if two polls race.
    const claimed = await prisma.mediaPairing.deleteMany({ where: { id: pairing.id, status: 'approved' } });
    if (claimed.count === 0) return c.json({ status: 'expired' }, 410);
    const { token, tokenHash, tokenPrefix } = generateMediaToken();
    const owner = await prisma.user.findUnique({ where: { id: pairing.userId }, select: { status: true } });
    if (!owner || owner.status === 'disabled') return c.json({ status: 'denied' }, 403);
    const device = await prisma.mediaDevice.create({
      data: {
        userId: pairing.userId,
        kind: 'tv',
        name: pairing.deviceName || 'TV',
        tokenHash,
        tokenPrefix,
        projectIds: pairing.projectIds ?? Prisma.DbNull,
        lastUsedAt: new Date(),
        lastSeenIp: clientAddress(c).slice(0, 64),
      },
    });
    return c.json({ status: 'approved', token, deviceName: device.name });
  });

  // ============================================================
  // TV mode API (device token)
  // ============================================================

  const deviceAuth = async (c: Context<{ Variables: Variables }>, next: () => Promise<void>) => {
    const device = await auth.resolveToken(tokenFromAuthorization(c.req.header('authorization')), 'tv', clientAddress(c));
    if (!device) return c.json({ error: 'Unauthorized' }, 401);
    c.set('device', device);
    await next();
  };

  const sign = (key: string | null | undefined) =>
    key ? storage.getPresignedUrl(key, MEDIA_URL_TTL_S) : Promise.resolve(null);

  async function tvFolder(folder: MediaFolder) {
    return {
      id: folder.id,
      name: folder.name,
      type: folder.type,
      itemCount: folder.itemCount,
      latestAt: folder.latestAt.getTime(),
      coverUrl: folder.cover ? await sign(folder.cover.thumbnailKey || folder.cover.optimizedKey || folder.cover.key) : null,
    };
  }

  async function tvItem(entry: MediaEntry) {
    const [url, thumbnailUrl, optimizedUrl] = await Promise.all([
      sign(entry.key),
      sign(entry.thumbnailKey),
      sign(entry.optimizedKey),
    ]);
    return {
      id: entry.id,
      projectId: entry.projectId,
      kind: entry.kind,
      title: entry.title,
      prompt: entry.prompt,
      mimeType: entry.mimeType,
      // Images display the 2K JPEG rendition: every TV decodes it quickly.
      displayUrl: entry.kind === 'image' ? (optimizedUrl || url) : url,
      url,
      thumbnailUrl: thumbnailUrl || optimizedUrl || (entry.kind === 'image' ? url : null),
      posterUrl: optimizedUrl || thumbnailUrl,
      createdAt: entry.createdAt.getTime(),
      duration: entry.duration,
      aspectRatio: entry.aspectRatio,
      tags: entry.tags,
    };
  }

  function listOptions(c: Context) {
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '60', 10) || 60));
    const kind = c.req.query('kind');
    const kinds = kind && KINDS.includes(kind as MediaKind) ? [kind as MediaKind] : undefined;
    const tag = c.req.query('tag')?.trim() || undefined;
    const order: 'newest' | 'oldest' = c.req.query('order') === 'oldest' ? 'oldest' : 'newest';
    return { offset, limit, kinds, tag, order };
  }

  router.get('/api/tv/session', deviceAuth, async (c) => {
    const { device } = c.get('device');
    return c.json({ deviceId: device.id, deviceName: device.name });
  });

  router.post('/api/tv/logout', deviceAuth, async (c) => {
    const { device } = c.get('device');
    await prisma.mediaDevice.delete({ where: { id: device.id } }).catch(() => {});
    return c.json({ success: true });
  });

  router.get('/api/tv/folders', deviceAuth, async (c) => {
    const device = c.get('device');
    const folders = await catalog.listFolders(device.userId, device.scope);
    return c.json({ folders: await Promise.all(folders.map(tvFolder)) });
  });

  router.get('/api/tv/folders/:id', deviceAuth, async (c) => {
    const device = c.get('device');
    const folder = await catalog.getFolder(device.userId, device.scope, c.req.param('id'));
    if (!folder) return c.json({ error: 'Not found' }, 404);
    const tags = await catalog.listTags(device.userId, folder.id);
    return c.json({ folder: await tvFolder(folder), tags });
  });

  router.get('/api/tv/folders/:id/items', deviceAuth, async (c) => {
    const device = c.get('device');
    const options = listOptions(c);
    const { items, total } = await catalog.listItems(device.userId, device.scope, c.req.param('id'), options);
    return c.json({ items: await Promise.all(items.map(tvItem)), total, offset: options.offset });
  });

  router.get('/api/tv/recent', deviceAuth, async (c) => {
    const device = c.get('device');
    const options = listOptions(c);
    const { items, total } = await catalog.listRecent(device.userId, device.scope, options);
    return c.json({ items: await Promise.all(items.map(tvItem)), total, offset: options.offset });
  });

  return router;
}

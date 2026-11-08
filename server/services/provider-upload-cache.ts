import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { UploadCache } from '../generators/upload-cache';

/**
 * Longest a provider URL is reused after its upload. RunningHub and APIMart do
 * not document how long they keep uploaded files, and an async provider may
 * fetch the image well after the job was sent, so this stays short.
 */
export const PROVIDER_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

/** A signed URL stops being reused this long before its signature lapses. */
export const SIGNED_URL_MARGIN_MS = 60 * 60 * 1000;

const VERIFY_TIMEOUT_MS = 15_000;
const HEADER_BYTES = 16;

/** What a provider URL serves now: whether it opens like an image, and its full size. */
export interface ServedImage {
  ok: boolean;
  size?: number;
}

/** Lookups and uploads in progress, so concurrent jobs with the same image share one. */
const inFlight = new Map<string, Promise<string>>();

/** True when the bytes open with the signature of an image format providers accept. */
export function startsLikeImage(head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 8 && head[0] === 0x89 && ascii(1, 4) === 'PNG') return true;
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true;
  if (head.length >= 4 && ascii(0, 4) === 'GIF8') return true;
  if (head.length >= 12 && ascii(4, 8) === 'ftyp') return true; // AVIF / HEIC
  return false;
}

/** Full size of the file behind a response: Content-Range's total on a 206, Content-Length on a 200. */
function servedSize(res: Response): number | undefined {
  const raw = res.status === 206
    ? res.headers.get('content-range')?.match(/\/(\d+)\s*$/)?.[1]
    : res.headers.get('content-length');
  const size = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(size) && size > 0 ? size : undefined;
}

/**
 * Read only the first bytes of a provider URL. A provider that dropped the
 * file answers with an error status or an error page, which fail the image
 * signature; a placeholder image passes it but differs in size.
 */
export async function checkProviderUrl(url: string): Promise<ServedImage> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) return { ok: false };
    // A server that ignores Range sends the whole file; stop once the header is in.
    const reader = res.body.getReader();
    const head = new Uint8Array(HEADER_BYTES);
    let filled = 0;
    try {
      while (filled < HEADER_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const take = Math.min(value.length, HEADER_BYTES - filled);
        head.set(value.subarray(0, take), filled);
        filled += take;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return { ok: startsLikeImage(head.subarray(0, filled)), size: servedSize(res) };
  } catch {
    return { ok: false };
  }
}

/**
 * When a signed URL's signature lapses, for the signing schemes object stores
 * use (AWS SigV4, Aliyun OSS v1 and v4, Tencent COS). Undefined for unsigned URLs.
 */
export function signedUrlExpiry(url: string): Date | undefined {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return undefined;
  }
  const get = (name: string) => {
    for (const [key, value] of params) if (key.toLowerCase() === name) return value;
    return undefined;
  };
  const fromStamp = (stamp: string | undefined, seconds: string | undefined) => {
    const m = stamp?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!m || !seconds || !/^\d+$/.test(seconds)) return undefined;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + Number(seconds) * 1000);
  };

  const sigV4 = fromStamp(get('x-amz-date'), get('x-amz-expires')) ?? fromStamp(get('x-oss-date'), get('x-oss-expires'));
  if (sigV4) return sigV4;
  const cosEnd = get('q-sign-time')?.split(';')[1];
  if (cosEnd && /^\d+$/.test(cosEnd)) return new Date(Number(cosEnd) * 1000);
  const expires = get('expires');
  if (expires && /^\d+$/.test(expires)) return new Date(Number(expires) * 1000);
  return undefined;
}

export function createProviderUploadCache(
  prisma: PrismaClient,
  providerId: string,
  options: { ttlMs?: number; check?: (url: string) => Promise<ServedImage> } = {},
): UploadCache {
  const ttlMs = options.ttlMs ?? PROVIDER_UPLOAD_TTL_MS;
  const check = options.check ?? checkProviderUrl;

  /** A cached URL, checked against the provider just now; undefined when it must be uploaded again. */
  const lookup = async (endpoint: string, contentHash: string): Promise<string | undefined> => {
    try {
      const row = await prisma.providerUploadCache.findUnique({
        where: { providerId_endpoint_contentHash: { providerId, endpoint, contentHash } },
      });
      if (!row || row.expiresAt.getTime() <= Date.now()) return undefined;
      const served = await check(row.url);
      if (served.ok && served.size === row.servedSize) return row.url;
      await prisma.providerUploadCache.deleteMany({ where: { providerId, endpoint, contentHash } });
      console.warn(`[UploadCache] Cached ${endpoint} URL no longer serves the uploaded image; uploading again.`);
    } catch (e) {
      console.warn('[UploadCache] Lookup failed; uploading without the cache:', e);
    }
    return undefined;
  };

  /**
   * Record a fresh upload, but only when its URL can be checked later: it
   * must serve an image of a known size now, and outlive the reuse margin.
   */
  const remember = async (endpoint: string, contentHash: string, url: string) => {
    try {
      const now = Date.now();
      let expiresAt = now + ttlMs;
      const signedUntil = signedUrlExpiry(url);
      if (signedUntil) expiresAt = Math.min(expiresAt, signedUntil.getTime() - SIGNED_URL_MARGIN_MS);
      if (expiresAt <= now) return;

      const served = await check(url);
      if (!served.ok || served.size === undefined) return;

      const data = { url, servedSize: served.size, expiresAt: new Date(expiresAt) };
      await prisma.providerUploadCache.upsert({
        where: { providerId_endpoint_contentHash: { providerId, endpoint, contentHash } },
        create: { providerId, endpoint, contentHash, ...data },
        update: data,
      });
    } catch (e) {
      console.warn('[UploadCache] Could not record the uploaded URL:', e);
    }
  };

  return {
    async reuse(endpoint, bytes, upload) {
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      const key = `${providerId}\n${endpoint}\n${contentHash}`;

      const pending = inFlight.get(key);
      if (pending) {
        // A failed shared upload fails only the job that ran it; the others upload for themselves.
        try {
          return await pending;
        } catch {
          return upload();
        }
      }

      const run = (async () => {
        const cached = await lookup(endpoint, contentHash);
        if (cached) return cached;
        const url = await upload();
        await remember(endpoint, contentHash, url);
        return url;
      })();
      inFlight.set(key, run);
      try {
        return await run;
      } finally {
        inFlight.delete(key);
      }
    },
  };
}

/** Delete cache rows past their TTL. Returns how many were removed. */
export async function cleanupExpiredProviderUploads(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.providerUploadCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}

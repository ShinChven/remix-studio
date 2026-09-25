import type { S3Storage } from '../storage/s3-storage';

/**
 * Streams a stored file to a TV, a DLNA renderer or a WebDAV client. Those
 * clients cannot follow presigned S3 links reliably (redirects, HTTPS with
 * long query strings), so the server relays the bytes and supports the
 * single byte ranges players use to seek.
 */

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export interface ServeOptions {
  mimeType: string;
  method: string;
  rangeHeader?: string | null;
  ifNoneMatch?: string | null;
  /** Extra headers, e.g. the DLNA transfer mode. */
  headers?: Record<string, string>;
  /** Sent as the attachment's name when set. */
  downloadName?: string;
}

function errorName(error: unknown): string {
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name || e?.Code || '';
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function serveStoredObject(storage: S3Storage, key: string, options: ServeOptions): Promise<Response> {
  const head = options.method === 'HEAD';
  const rangeMatch = !head && options.rangeHeader ? SINGLE_RANGE.exec(options.rangeHeader.trim()) : null;
  const range = rangeMatch && (rangeMatch[1] || rangeMatch[2]) ? options.rangeHeader!.trim() : undefined;

  let object: Awaited<ReturnType<S3Storage['getObjectForServe']>>;
  try {
    object = await storage.getObjectForServe(key, { head, range });
  } catch (error) {
    const name = errorName(error);
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'InvalidRange' || status === 416) {
      const size = await storage.getSize(key);
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size ?? 0}` } });
    }
    if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) {
      return new Response('Not found', { status: 404 });
    }
    throw error;
  }

  const headers = new Headers({
    'Content-Type': options.mimeType,
    'Accept-Ranges': 'bytes',
    // Album files never change in place: a new version gets a new key.
    'Cache-Control': 'private, max-age=86400',
    ...options.headers,
  });
  if (object.etag) headers.set('ETag', object.etag);
  if (object.lastModified) headers.set('Last-Modified', object.lastModified.toUTCString());
  if (options.downloadName) headers.set('Content-Disposition', contentDisposition(options.downloadName));

  if (object.etag && options.ifNoneMatch && options.ifNoneMatch.split(',').some((tag) => tag.trim() === object.etag)) {
    object.body?.cancel().catch(() => {});
    return new Response(null, { status: 304, headers });
  }

  if (object.contentLength != null) headers.set('Content-Length', String(object.contentLength));
  if (object.contentRange) {
    headers.set('Content-Range', object.contentRange);
    return new Response(object.body ?? null, { status: 206, headers });
  }
  return new Response(head ? null : (object.body ?? null), { status: 200, headers });
}

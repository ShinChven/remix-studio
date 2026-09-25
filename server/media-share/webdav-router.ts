import { Hono, type Context } from 'hono';
import type { S3Storage } from '../storage/s3-storage';
import { MediaCatalog, MediaEntry, MediaFolder } from './catalog';
import { MediaDeviceAuth, ResolvedDevice, tokenFromAuthorization } from './device-auth';
import { serveStoredObject } from './media-stream';
import { clientAddress } from './net-utils';

/**
 * A read-only WebDAV share of the user's albums at /dav/:
 *
 *   /dav/<Project name>/<20260925-143012_prompt_1a2b3c4d.png>
 *
 * Clients sign in with HTTP Basic auth whose password is a WebDAV device
 * token (any user name). Finder, Windows, file managers on TVs and phones,
 * Infuse and rclone all speak this subset: OPTIONS, PROPFIND, GET and HEAD.
 */

export const DAV_ROOT = '/dav';
const REALM = 'Remix Studio';
const ALLOW = 'OPTIONS, GET, HEAD, PROPFIND';
const PAGE = 2000;
// Metadata files desktop clients probe for on every folder.
const PROBE_FILES = /^(\._.*|\.DS_Store|\.localized|\.hidden|\.metadata_never_index.*|\.Spotlight-V100|\.Trashes|desktop\.ini|Thumbs\.db|folder\.jpg|autorun\.inf|\.directory)$/i;

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]!));
}

function hrefFor(...segments: string[]): string {
  return `${DAV_ROOT}/${segments.map(encodeURIComponent).join('/')}`;
}

interface DavResource {
  href: string;
  name: string;
  collection: boolean;
  size?: number | null;
  mimeType?: string;
  etag?: string;
  modified: Date;
  created: Date;
}

function responseXml(resource: DavResource): string {
  const props = [
    `<D:displayname>${xmlEscape(resource.name)}</D:displayname>`,
    resource.collection ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>',
    `<D:getlastmodified>${resource.modified.toUTCString()}</D:getlastmodified>`,
    `<D:creationdate>${resource.created.toISOString()}</D:creationdate>`,
  ];
  if (!resource.collection) {
    if (resource.size != null) props.push(`<D:getcontentlength>${resource.size}</D:getcontentlength>`);
    if (resource.mimeType) props.push(`<D:getcontenttype>${resource.mimeType}</D:getcontenttype>`);
    if (resource.etag) props.push(`<D:getetag>"${resource.etag}"</D:getetag>`);
  }
  props.push('<D:supportedlock/>');
  return `<D:response><D:href>${xmlEscape(resource.href)}</D:href><D:propstat><D:prop>${props.join('')}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function multistatus(resources: DavResource[]): Response {
  const body = `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${resources.map(responseXml).join('')}</D:multistatus>`;
  return new Response(body, { status: 207, headers: { 'Content-Type': 'application/xml; charset=utf-8', DAV: '1' } });
}

function folderResource(folder: MediaFolder): DavResource {
  return {
    href: `${hrefFor(folder.folderName)}/`,
    name: folder.folderName,
    collection: true,
    modified: folder.latestAt,
    created: folder.createdAt,
  };
}

function fileResource(folder: MediaFolder, entry: MediaEntry): DavResource {
  return {
    href: hrefFor(folder.folderName, entry.fileName),
    name: entry.fileName,
    collection: false,
    size: entry.size,
    mimeType: entry.mimeType,
    etag: entry.id,
    modified: entry.createdAt,
    created: entry.createdAt,
  };
}

function htmlPage(title: string, links: { href: string; label: string; meta?: string }[]): Response {
  const rows = links
    .map((link) => `<li><a href="${xmlEscape(link.href)}">${xmlEscape(link.label)}</a>${link.meta ? ` <small>${xmlEscape(link.meta)}</small>` : ''}</li>`)
    .join('');
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${xmlEscape(title)}</title><style>body{font:15px system-ui;margin:24px;color:#222}small{color:#888}li{margin:4px 0}</style><h1>${xmlEscape(title)}</h1><ul>${rows}</ul>`;
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

/** Path segments after /dav, decoded; null when the path is malformed. */
function segmentsOf(path: string): string[] | null {
  const rest = path.slice(DAV_ROOT.length).split('/').filter(Boolean);
  try {
    return rest.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

export function createWebDavRouter(catalog: MediaCatalog, auth: MediaDeviceAuth, storage: S3Storage) {
  const router = new Hono();

  async function listAllItems(device: ResolvedDevice, folder: MediaFolder): Promise<MediaEntry[]> {
    const all: MediaEntry[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { items, total } = await catalog.listItems(device.userId, device.scope, folder.id, { offset, limit: PAGE });
      all.push(...items);
      if (items.length === 0 || offset + PAGE >= total) break;
    }
    await catalog.fillMissingSizes(all, (key) => storage.getSize(key));
    return all;
  }

  const handle = async (c: Context) => {
    const method = c.req.method.toUpperCase();
    if (method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: { DAV: '1', Allow: ALLOW, 'MS-Author-Via': 'DAV', 'Content-Length': '0' } });
    }
    if (!['GET', 'HEAD', 'PROPFIND'].includes(method)) {
      return new Response('This share is read-only', { status: 405, headers: { Allow: ALLOW } });
    }

    const segments = segmentsOf(c.req.path);
    if (!segments) return new Response('Bad path', { status: 400 });
    // Answer desktop metadata probes before touching the database.
    const last = segments[segments.length - 1];
    if (last && PROBE_FILES.test(last)) return new Response('Not found', { status: 404 });

    const device = await auth.resolveToken(tokenFromAuthorization(c.req.header('authorization')), 'webdav', clientAddress(c));
    if (!device) return unauthorized();

    const depth = (c.req.header('depth') || 'infinity').toLowerCase();
    const withChildren = method === 'PROPFIND' && depth !== '0';

    if (segments.length === 0) {
      const folders = await catalog.listFolders(device.userId, device.scope);
      if (method === 'PROPFIND') {
        const now = new Date();
        const root: DavResource = { href: `${DAV_ROOT}/`, name: 'Remix Studio', collection: true, modified: folders[0]?.latestAt ?? now, created: now };
        return multistatus(withChildren ? [root, ...folders.map(folderResource)] : [root]);
      }
      if (method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return htmlPage('Remix Studio', folders.map((folder) => ({ href: `${hrefFor(folder.folderName)}/`, label: `${folder.folderName}/`, meta: `${folder.itemCount}` })));
    }

    const folder = await catalog.findFolderByName(device.userId, device.scope, segments[0]);
    if (!folder || segments.length > 2) return new Response('Not found', { status: 404 });

    if (segments.length === 1) {
      if (method === 'PROPFIND') {
        const self = folderResource(folder);
        if (!withChildren) return multistatus([self]);
        const items = await listAllItems(device, folder);
        return multistatus([self, ...items.map((entry) => fileResource(folder, entry))]);
      }
      if (!c.req.path.endsWith('/')) return c.redirect(`${hrefFor(folder.folderName)}/`, 301);
      if (method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      const items = await listAllItems(device, folder);
      return htmlPage(folder.folderName, [
        { href: `${DAV_ROOT}/`, label: '../' },
        ...items.map((entry) => ({ href: hrefFor(folder.folderName, entry.fileName), label: entry.fileName })),
      ]);
    }

    const entry = await catalog.findItemByFileName(device.userId, folder.id, segments[1]);
    if (!entry) return new Response('Not found', { status: 404 });
    if (method === 'PROPFIND') {
      await catalog.fillMissingSizes([entry], (key) => storage.getSize(key));
      return multistatus([fileResource(folder, entry)]);
    }
    return serveStoredObject(storage, entry.key, {
      method,
      mimeType: entry.mimeType,
      rangeHeader: c.req.header('range'),
      ifNoneMatch: c.req.header('if-none-match'),
    });
  };

  router.all(DAV_ROOT, handle);
  router.all(`${DAV_ROOT}/*`, handle);
  return router;
}

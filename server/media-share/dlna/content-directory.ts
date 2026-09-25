import { MediaCatalog, MediaEntry, MediaFolder, ProjectScope } from '../catalog';
import { MediaKind, extensionOf } from '../media-types';
import { xmlEscape } from './xml';

/**
 * The ContentDirectory tree a DLNA server exposes, and its DIDL-Lite rendering:
 *
 *   0                       root
 *   ├─ recent               newest media across every project in scope
 *   └─ p:<projectId>        one project's album
 *      ├─ pt:<projectId>    "Tags" (only when the album has tags)
 *      │  └─ t:<projectId>:<tag>
 *      └─ i:<itemId>        an album item
 */

export const ROOT_ID = '0';
const RECENT_ID = 'recent';
/** RequestedCount 0 means "everything"; this is where everything stops. */
const MAX_PAGE = 2000;

export interface BrowseResult {
  didl: string;
  returned: number;
  total: number;
}

export class DlnaError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

interface ContainerNode {
  id: string;
  parentId: string;
  title: string;
  childCount: number;
  className?: string;
  albumArt?: string | null;
}

const DIDL_OPEN = '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/" xmlns:sec="http://www.sec.co.kr/">';
const DIDL_CLOSE = '</DIDL-Lite>';

// DLNA.ORG_FLAGS: streaming transfer mode for A/V, interactive for images;
// both advertise byte-range seeking (OP=01) and DLNA 1.5.
const FLAGS_AV = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000';
const FLAGS_IMAGE = 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=00f00000000000000000000000000000';

export function contentFeatures(mimeType: string, variant: MediaVariant): string {
  if (mimeType === 'image/jpeg') {
    return `DLNA.ORG_PN=${variant === 'thumbnail' ? 'JPEG_TN' : 'JPEG_LRG'};${FLAGS_IMAGE}`;
  }
  if (mimeType.startsWith('image/')) return FLAGS_IMAGE;
  if (mimeType === 'audio/mpeg') return `DLNA.ORG_PN=MP3;${FLAGS_AV}`;
  return FLAGS_AV;
}

export function protocolInfo(mimeType: string, variant: MediaVariant): string {
  return `http-get:*:${mimeType}:${contentFeatures(mimeType, variant)}`;
}

/** The media types advertised by ConnectionManager.GetProtocolInfo. */
export const SOURCE_PROTOCOL_INFO = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac',
].map((mime) => protocolInfo(mime, 'original')).join(',');

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`;
}

/** The stored key behind one rendition of an item. */
export function keyFor(entry: Pick<MediaEntry, 'key' | 'optimizedKey' | 'thumbnailKey'>, variant: MediaVariant): string {
  if (variant === 'optimized') return entry.optimizedKey || entry.key;
  if (variant === 'thumbnail') return entry.thumbnailKey || entry.optimizedKey || entry.key;
  return entry.key;
}

function upnpClass(kind: MediaKind): string {
  if (kind === 'image') return 'object.item.imageItem.photo';
  if (kind === 'video') return 'object.item.videoItem';
  return 'object.item.audioItem.musicTrack';
}

function encodeTag(tag: string): string {
  return Buffer.from(tag, 'utf8').toString('base64url');
}

function decodeTag(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export type MediaVariant = 'original' | 'optimized' | 'thumbnail';

/** Builds media URLs for one server as seen from the requesting client. */
export type MediaUrlBuilder = (itemId: string, variant: MediaVariant, key: string) => string;

export class ContentDirectory {
  constructor(
    private catalog: MediaCatalog,
    private userId: string,
    private scope: ProjectScope,
    private mediaUrl: MediaUrlBuilder,
    private rootTitle: string,
  ) {}

  private containerXml(node: ContainerNode): string {
    const art = node.albumArt ? `<upnp:albumArtURI dlna:profileID="JPEG_TN">${xmlEscape(node.albumArt)}</upnp:albumArtURI>` : '';
    return `<container id="${xmlEscape(node.id)}" parentID="${xmlEscape(node.parentId)}" restricted="1" searchable="1" childCount="${node.childCount}"><dc:title>${xmlEscape(node.title)}</dc:title><upnp:class>${node.className || 'object.container.storageFolder'}</upnp:class>${art}</container>`;
  }

  private itemXml(entry: MediaEntry, parentId: string): string {
    const resources: string[] = [];
    const res = (variant: MediaVariant, mime: string, size: number | null, extra = '') =>
      resources.push(`<res protocolInfo="${xmlEscape(protocolInfo(mime, variant))}"${size != null ? ` size="${size}"` : ''}${extra}>${xmlEscape(this.mediaUrl(entry.id, variant, keyFor(entry, variant)))}</res>`);

    if (entry.kind === 'image') {
      // TVs pick the first resource they can show; the 2K JPEG shows everywhere.
      if (entry.optimizedKey) res('optimized', 'image/jpeg', entry.optimizedSize);
      res('original', entry.mimeType, entry.size);
    } else {
      const duration = entry.duration ? ` duration="${formatDuration(entry.duration)}"` : '';
      res('original', entry.mimeType, entry.size, duration);
    }
    const thumbKey = entry.thumbnailKey || entry.optimizedKey;
    const thumbVariant = entry.thumbnailKey ? 'thumbnail' : 'optimized';
    if (thumbKey && extensionOf(thumbKey) === 'jpg') {
      res(thumbVariant, 'image/jpeg', entry.thumbnailKey ? entry.thumbnailSize : entry.optimizedSize);
    }
    const art = thumbKey
      ? `<upnp:albumArtURI dlna:profileID="JPEG_TN">${xmlEscape(this.mediaUrl(entry.id, thumbVariant, thumbKey))}</upnp:albumArtURI>`
      : '';
    const date = entry.createdAt.toISOString().replace(/\.\d{3}Z$/, '');
    const genre = entry.tags.length > 0 ? `<upnp:genre>${xmlEscape(entry.tags.join(', '))}</upnp:genre>` : '';
    const description = entry.prompt && entry.prompt !== entry.title
      ? `<dc:description>${xmlEscape(entry.prompt.slice(0, 1000))}</dc:description>`
      : '';
    return `<item id="i:${entry.id}" parentID="${xmlEscape(parentId)}" restricted="1"><dc:title>${xmlEscape(entry.title)}</dc:title><dc:date>${date}</dc:date><upnp:class>${upnpClass(entry.kind)}</upnp:class>${genre}${description}${art}${resources.join('')}</item>`;
  }

  private wrap(parts: string[]): string {
    return DIDL_OPEN + parts.join('') + DIDL_CLOSE;
  }

  private folderNode(folder: MediaFolder): ContainerNode {
    const coverKey = folder.cover?.thumbnailKey || folder.cover?.optimizedKey;
    return {
      id: `p:${folder.id}`,
      parentId: ROOT_ID,
      title: folder.name,
      childCount: folder.itemCount + (folder.hasTags ? 1 : 0),
      className: 'object.container.album.photoAlbum',
      albumArt: folder.cover && coverKey
        ? this.mediaUrl(folder.cover.itemId, folder.cover.thumbnailKey ? 'thumbnail' : 'optimized', coverKey)
        : null,
    };
  }

  private async rootChildren(): Promise<ContainerNode[]> {
    const [folders, recent] = await Promise.all([
      this.catalog.listFolders(this.userId, this.scope),
      this.catalog.listRecent(this.userId, this.scope, { limit: 1 }),
    ]);
    const nodes: ContainerNode[] = [];
    if (recent.total > 0) {
      const latest = recent.items[0];
      const art = latest?.thumbnailKey || latest?.optimizedKey;
      nodes.push({
        id: RECENT_ID,
        parentId: ROOT_ID,
        title: 'Recent',
        childCount: recent.total,
        albumArt: latest && art ? this.mediaUrl(latest.id, latest.thumbnailKey ? 'thumbnail' : 'optimized', art) : null,
      });
    }
    nodes.push(...folders.map((folder) => this.folderNode(folder)));
    return nodes;
  }

  private parseProjectId(objectId: string, prefix: string): string {
    const id = objectId.slice(prefix.length).split(':')[0];
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DlnaError(701, 'No such object');
    return id;
  }

  private async requireFolder(projectId: string): Promise<MediaFolder> {
    const folder = await this.catalog.getFolder(this.userId, this.scope, projectId);
    if (!folder) throw new DlnaError(701, 'No such object');
    return folder;
  }

  async metadata(objectId: string): Promise<BrowseResult> {
    let xml: string;
    if (objectId === ROOT_ID) {
      const children = await this.rootChildren();
      xml = `<container id="0" parentID="-1" restricted="1" searchable="1" childCount="${children.length}"><dc:title>${xmlEscape(this.rootTitle)}</dc:title><upnp:class>object.container.storageFolder</upnp:class></container>`;
    } else if (objectId === RECENT_ID) {
      const { total } = await this.catalog.listRecent(this.userId, this.scope, { limit: 1 });
      xml = this.containerXml({ id: RECENT_ID, parentId: ROOT_ID, title: 'Recent', childCount: total });
    } else if (objectId.startsWith('p:')) {
      const folder = await this.requireFolder(this.parseProjectId(objectId, 'p:'));
      xml = this.containerXml(this.folderNode(folder));
    } else if (objectId.startsWith('pt:')) {
      const folder = await this.requireFolder(this.parseProjectId(objectId, 'pt:'));
      const tags = await this.catalog.listTags(this.userId, folder.id);
      xml = this.containerXml({ id: objectId, parentId: `p:${folder.id}`, title: 'Tags', childCount: tags.length });
    } else if (objectId.startsWith('t:')) {
      const { folder, tag } = await this.parseTagId(objectId);
      const { total } = await this.catalog.listItems(this.userId, this.scope, folder.id, { tag, limit: 1 });
      xml = this.containerXml({ id: objectId, parentId: `pt:${folder.id}`, title: tag, childCount: total });
    } else if (objectId.startsWith('i:')) {
      const entry = await this.catalog.getItem(this.userId, this.scope, objectId.slice(2));
      if (!entry) throw new DlnaError(701, 'No such object');
      xml = this.itemXml(entry, `p:${entry.projectId}`);
    } else {
      throw new DlnaError(701, 'No such object');
    }
    return { didl: this.wrap([xml]), returned: 1, total: 1 };
  }

  private async parseTagId(objectId: string): Promise<{ folder: MediaFolder; tag: string }> {
    const [, projectId, encoded] = objectId.split(':');
    if (!projectId || !encoded) throw new DlnaError(701, 'No such object');
    const folder = await this.requireFolder(this.parseProjectId(`p:${projectId}`, 'p:'));
    return { folder, tag: decodeTag(encoded) };
  }

  async children(objectId: string, start: number, requested: number): Promise<BrowseResult> {
    const count = requested > 0 ? Math.min(requested, MAX_PAGE) : MAX_PAGE;

    if (objectId === ROOT_ID) {
      const nodes = await this.rootChildren();
      const page = nodes.slice(start, start + count);
      return { didl: this.wrap(page.map((node) => this.containerXml(node))), returned: page.length, total: nodes.length };
    }

    if (objectId === RECENT_ID) {
      const { items, total } = await this.catalog.listRecent(this.userId, this.scope, { offset: start, limit: count });
      return { didl: this.wrap(items.map((entry) => this.itemXml(entry, RECENT_ID))), returned: items.length, total };
    }

    if (objectId.startsWith('p:')) {
      const folder = await this.requireFolder(this.parseProjectId(objectId, 'p:'));
      const tags = folder.hasTags ? await this.catalog.listTags(this.userId, folder.id) : [];
      const leading: ContainerNode[] = tags.length > 0
        ? [{ id: `pt:${folder.id}`, parentId: objectId, title: 'Tags', childCount: tags.length }]
        : [];
      const containers = leading.slice(start, start + count);
      const itemStart = Math.max(0, start - leading.length);
      const itemCount = count - containers.length;
      const { items, total } = itemCount > 0
        ? await this.catalog.listItems(this.userId, this.scope, folder.id, { offset: itemStart, limit: itemCount })
        : { items: [], total: folder.itemCount };
      return {
        didl: this.wrap([...containers.map((node) => this.containerXml(node)), ...items.map((entry) => this.itemXml(entry, objectId))]),
        returned: containers.length + items.length,
        total: leading.length + total,
      };
    }

    if (objectId.startsWith('pt:')) {
      const folder = await this.requireFolder(this.parseProjectId(objectId, 'pt:'));
      const tags = await this.catalog.listTags(this.userId, folder.id);
      const page = tags.slice(start, start + count);
      return {
        didl: this.wrap(page.map(({ tag, count: n }) => this.containerXml({
          id: `t:${folder.id}:${encodeTag(tag)}`,
          parentId: objectId,
          title: tag,
          childCount: n,
        }))),
        returned: page.length,
        total: tags.length,
      };
    }

    if (objectId.startsWith('t:')) {
      const { folder, tag } = await this.parseTagId(objectId);
      const { items, total } = await this.catalog.listItems(this.userId, this.scope, folder.id, { tag, offset: start, limit: count });
      return { didl: this.wrap(items.map((entry) => this.itemXml(entry, objectId))), returned: items.length, total };
    }

    if (objectId.startsWith('i:')) {
      return { didl: this.wrap([]), returned: 0, total: 0 };
    }
    throw new DlnaError(701, 'No such object');
  }

  /**
   * Search is answered for the class filters clients actually send
   * ("upnp:class derivedfrom \"object.item.imageItem\""): newest media of
   * the matching kinds across every project in scope.
   */
  async search(criteria: string, start: number, requested: number): Promise<BrowseResult> {
    const count = requested > 0 ? Math.min(requested, MAX_PAGE) : MAX_PAGE;
    const kinds: MediaKind[] = [];
    if (/imageItem/i.test(criteria)) kinds.push('image');
    if (/videoItem/i.test(criteria)) kinds.push('video');
    if (/audioItem/i.test(criteria)) kinds.push('audio');
    const onlyContainers = /object\.container/i.test(criteria) && kinds.length === 0;
    if (onlyContainers) return { didl: this.wrap([]), returned: 0, total: 0 };
    const { items, total } = await this.catalog.listRecent(this.userId, this.scope, {
      offset: start,
      limit: count,
      kinds: kinds.length > 0 ? kinds : undefined,
    });
    return { didl: this.wrap(items.map((entry) => this.itemXml(entry, `p:${entry.projectId}`))), returned: items.length, total };
  }
}

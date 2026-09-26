import { Prisma, PrismaClient } from '@prisma/client';
import { MediaKind, extensionOf, mediaKindForKey, mimeTypeForKey } from './media-types';

/**
 * The read-only view of a user's project albums that TV mode, WebDAV and DLNA
 * all browse: projects become folders, album items become files. Every
 * protocol goes through this class so they agree on what a device may see
 * and on the names things carry.
 */

/** The projects a device may read; null means every active project. */
export type ProjectScope = string[] | null;

export interface MediaFolder {
  id: string;
  /** Project name made safe as a path segment, unique within the listing. */
  folderName: string;
  name: string;
  type: string;
  itemCount: number;
  /** Whether any media in the project carries a tag. */
  hasTags: boolean;
  latestAt: Date;
  createdAt: Date;
  cover: { itemId: string; thumbnailKey: string | null; optimizedKey: string | null; key: string } | null;
}

export interface MediaEntry {
  id: string;
  projectId: string;
  kind: MediaKind;
  title: string;
  prompt: string | null;
  fileName: string;
  key: string;
  mimeType: string;
  size: number | null;
  optimizedSize: number | null;
  thumbnailSize: number | null;
  thumbnailKey: string | null;
  optimizedKey: string | null;
  createdAt: Date;
  duration: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  tags: string[];
}

export interface ListItemsOptions {
  offset?: number;
  limit?: number;
  kinds?: MediaKind[];
  tag?: string;
  order?: 'newest' | 'oldest';
}

const EXTENSIONS_BY_KIND: Record<MediaKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'],
  video: ['mp4', 'm4v', 'mov', 'webm', 'mkv'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm'],
};

const MEDIA_EXTENSIONS = Array.from(new Set(Object.values(EXTENSIONS_BY_KIND).flat()));
/**
 * The same filter for raw SQL. Rows are filtered by extension in the query,
 * never after it, so LIMIT/OFFSET paging and totals always agree.
 */
const MEDIA_KEY_PATTERN = `\\.(${MEDIA_EXTENSIONS.join('|')})$`;
const IMAGE_KEY_PATTERN = `\\.(${EXTENSIONS_BY_KIND.image.join('|')})$`;

/** How long a folder listing is reused to resolve WebDAV paths. */
const FOLDER_CACHE_TTL_MS = 10_000;

const ITEM_SELECT = {
  id: true,
  projectId: true,
  prompt: true,
  imageUrl: true,
  thumbnailUrl: true,
  optimizedUrl: true,
  size: true,
  optimizedSize: true,
  thumbnailSize: true,
  createdAt: true,
  duration: true,
  resolution: true,
  aspectRatio: true,
  tags: true,
  project: { select: { type: true } },
} satisfies Prisma.AlbumItemSelect;

type ItemRow = Prisma.AlbumItemGetPayload<{ select: typeof ITEM_SELECT }>;

// Characters Windows, macOS or the DAV path syntax refuse in a name.
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f/\\:*?"<>|#%]+/g;

export function sanitizeName(value: string, maxLength: number): string {
  const cleaned = value
    .replace(UNSAFE_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return Array.from(cleaned).slice(0, maxLength).join('').trim();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function stampOf(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

/** The first line of the prompt, shortened for a title. */
export function titleFromPrompt(prompt: string | null | undefined, fallback: string): string {
  const firstLine = (prompt || '').split('\n').map((line) => line.trim()).find(Boolean);
  if (!firstLine) return fallback;
  const chars = Array.from(firstLine);
  return chars.length > 80 ? `${chars.slice(0, 79).join('')}…` : firstLine;
}

/**
 * `20260925-143012_a-cat-on-the-moon_1a2b3c4d.png`: sorts by creation time,
 * says what it shows, and ends with the id prefix that resolves it back.
 */
export function fileNameFor(item: { id: string; prompt: string | null; createdAt: Date; key: string }): string {
  const firstLine = (item.prompt || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
  const slug = Array.from(firstLine.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''))
    .slice(0, 48).join('').replace(/-+$/, '');
  const ext = extensionOf(item.key) || 'bin';
  return `${stampOf(item.createdAt)}_${slug ? `${slug}_` : ''}${item.id.slice(0, 8)}.${ext}`;
}

const FILE_ID_PATTERN = /([0-9a-f]{8})\.[a-z0-9]+$/i;

export function idPrefixFromFileName(fileName: string): string | null {
  const match = FILE_ID_PATTERN.exec(fileName);
  return match ? match[1].toLowerCase() : null;
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

export function scopeFromJson(value: unknown): ProjectScope {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === 'string');
}

export class MediaCatalog {
  constructor(private prisma: PrismaClient) {}

  private toEntry(row: ItemRow): MediaEntry | null {
    const key = row.imageUrl;
    const kind = mediaKindForKey(key, row.project?.type);
    if (!key || !kind) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      kind,
      title: titleFromPrompt(row.prompt, stampOf(row.createdAt)),
      prompt: row.prompt,
      fileName: fileNameFor({ id: row.id, prompt: row.prompt, createdAt: row.createdAt, key }),
      key,
      mimeType: mimeTypeForKey(key),
      size: row.size != null ? Number(row.size) : null,
      optimizedSize: row.optimizedSize != null ? Number(row.optimizedSize) : null,
      thumbnailSize: row.thumbnailSize != null ? Number(row.thumbnailSize) : null,
      thumbnailKey: row.thumbnailUrl || null,
      optimizedKey: row.optimizedUrl || null,
      createdAt: row.createdAt,
      duration: row.duration ?? null,
      resolution: row.resolution ?? null,
      aspectRatio: row.aspectRatio ?? null,
      tags: normalizeTags(row.tags),
    };
  }

  /** Album rows holding a stored file some player can open (text results carry none). */
  private mediaWhere(kinds?: MediaKind[]): Prisma.AlbumItemWhereInput {
    const exts = kinds && kinds.length > 0
      ? Array.from(new Set(kinds.flatMap((kind) => EXTENSIONS_BY_KIND[kind])))
      : MEDIA_EXTENSIONS;
    return {
      imageUrl: { not: null },
      NOT: { imageUrl: { startsWith: 'data:' } },
      OR: exts.map((ext) => ({ imageUrl: { endsWith: `.${ext}`, mode: 'insensitive' as const } })),
    };
  }

  private projectWhere(userId: string, scope: ProjectScope): Prisma.ProjectWhereInput {
    return scope ? { userId, id: { in: scope } } : { userId, status: 'active' };
  }

  /** Ids of the projects in scope that still exist. */
  async projectIdsInScope(userId: string, scope: ProjectScope): Promise<string[]> {
    const rows = await this.prisma.project.findMany({ where: this.projectWhere(userId, scope), select: { id: true } });
    return rows.map((row) => row.id);
  }

  /** Projects that have at least one media item, most recently active first. */
  async listFolders(userId: string, scope: ProjectScope, onlyProjectId?: string): Promise<MediaFolder[]> {
    const projects = await this.prisma.project.findMany({
      where: { ...this.projectWhere(userId, scope), ...(onlyProjectId ? { id: onlyProjectId } : {}) },
      select: { id: true, name: true, type: true, createdAt: true },
    });
    if (projects.length === 0) return [];
    const ids = projects.map((project) => project.id);

    const [counts, covers, tagged] = await Promise.all([
      this.prisma.albumItem.groupBy({
        by: ['projectId'],
        where: { userId, projectId: { in: ids }, ...this.mediaWhere() },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.$queryRaw<{ projectId: string; id: string; imageUrl: string; thumbnailUrl: string | null; optimizedUrl: string | null }[]>`
        SELECT DISTINCT ON ("projectId") "projectId", "id", "imageUrl", "thumbnailUrl", "optimizedUrl"
        FROM "AlbumItem"
        WHERE "userId" = ${userId}
          AND "projectId" IN (${Prisma.join(ids)})
          AND "imageUrl" ~* ${MEDIA_KEY_PATTERN}
          AND ("thumbnailUrl" IS NOT NULL OR "optimizedUrl" IS NOT NULL OR "imageUrl" ~* ${IMAGE_KEY_PATTERN})
        ORDER BY "projectId", "createdAt" DESC, "id" DESC
      `,
      this.prisma.$queryRaw<{ projectId: string }[]>`
        SELECT DISTINCT "projectId"
        FROM "AlbumItem"
        WHERE "userId" = ${userId}
          AND "projectId" IN (${Prisma.join(ids)})
          AND "imageUrl" ~* ${MEDIA_KEY_PATTERN}
          AND jsonb_typeof("tags") = 'array'
          AND jsonb_array_length("tags") > 0
      `,
    ]);
    const taggedIds = new Set(tagged.map((row) => row.projectId));

    const countById = new Map(counts.map((row) => [row.projectId, row]));
    const coverById = new Map(covers.map((row) => [row.projectId, row]));

    const folders = projects
      .map((project) => {
        const count = countById.get(project.id);
        if (!count || count._count._all === 0) return null;
        const cover = coverById.get(project.id);
        return {
          id: project.id,
          name: project.name,
          type: project.type,
          folderName: sanitizeName(project.name, 96) || 'Untitled',
          itemCount: count._count._all,
          hasTags: taggedIds.has(project.id),
          latestAt: count._max.createdAt ?? project.createdAt,
          createdAt: project.createdAt,
          cover: cover ? { itemId: cover.id, thumbnailKey: cover.thumbnailUrl, optimizedKey: cover.optimizedUrl, key: cover.imageUrl } : null,
        } satisfies MediaFolder;
      })
      .filter((folder): folder is MediaFolder => folder !== null)
      .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime() || a.name.localeCompare(b.name));

    // Two projects may share a name; the one created later gets its id
    // appended. Deciding by creation (not activity) keeps names stable.
    const seen = new Set<string>();
    const byCreation = [...folders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    for (const folder of byCreation) {
      const lower = folder.folderName.toLowerCase();
      if (seen.has(lower)) folder.folderName = `${folder.folderName} (${folder.id.slice(0, 8)})`;
      seen.add(folder.folderName.toLowerCase());
    }
    return folders;
  }

  /** One folder; its `folderName` is not de-duplicated against the others. */
  async getFolder(userId: string, scope: ProjectScope, projectId: string): Promise<MediaFolder | null> {
    if (scope && !scope.includes(projectId)) return null;
    const folders = await this.listFolders(userId, scope, projectId);
    return folders[0] ?? null;
  }

  private folderCache = new Map<string, { at: number; folders: Promise<MediaFolder[]> }>();

  /**
   * Resolves a WebDAV folder name. A client syncing a folder sends a request
   * per file, so the listing that names folders is reused for a few seconds
   * instead of being aggregated again for every file.
   */
  async findFolderByName(userId: string, scope: ProjectScope, folderName: string): Promise<MediaFolder | null> {
    const cacheKey = `${userId}|${scope ? scope.join(',') : '*'}`;
    const now = Date.now();
    let cached = this.folderCache.get(cacheKey);
    if (!cached || now - cached.at > FOLDER_CACHE_TTL_MS) {
      if (this.folderCache.size > 200) this.folderCache.clear();
      cached = { at: now, folders: this.listFolders(userId, scope) };
      this.folderCache.set(cacheKey, cached);
      cached.folders.catch(() => this.folderCache.delete(cacheKey));
    }
    const folders = await cached.folders;
    const lower = folderName.toLowerCase();
    return folders.find((folder) => folder.folderName.toLowerCase() === lower) ?? null;
  }

  private itemWhere(userId: string, projectIds: string[], options: ListItemsOptions): Prisma.AlbumItemWhereInput {
    const where: Prisma.AlbumItemWhereInput = {
      userId,
      projectId: projectIds.length === 1 ? projectIds[0] : { in: projectIds },
      ...this.mediaWhere(options.kinds),
    };
    if (options.tag) where.tags = { array_contains: [options.tag] };
    return where;
  }

  private async listIn(
    userId: string,
    projectIds: string[],
    options: ListItemsOptions,
  ): Promise<{ items: MediaEntry[]; total: number }> {
    if (projectIds.length === 0) return { items: [], total: 0 };
    const where = this.itemWhere(userId, projectIds, options);
    const direction = options.order === 'oldest' ? 'asc' : 'desc';
    const [total, rows] = await Promise.all([
      this.prisma.albumItem.count({ where }),
      this.prisma.albumItem.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: [{ createdAt: direction }, { id: direction }],
        skip: Math.max(0, options.offset ?? 0),
        take: Math.min(Math.max(1, options.limit ?? 100), 5000),
      }),
    ]);
    return {
      items: rows.map((row) => this.toEntry(row)).filter((entry): entry is MediaEntry => entry !== null),
      total,
    };
  }

  /** One project's media, or nothing when the project is out of scope. */
  async listItems(userId: string, scope: ProjectScope, projectId: string, options: ListItemsOptions = {}) {
    if (scope && !scope.includes(projectId)) return { items: [], total: 0 };
    const project = await this.prisma.project.findFirst({
      where: { ...this.projectWhere(userId, scope), id: projectId },
      select: { id: true },
    });
    if (!project) return { items: [], total: 0 };
    return this.listIn(userId, [projectId], options);
  }

  /** The newest media across every project in scope. */
  async listRecent(userId: string, scope: ProjectScope, options: ListItemsOptions = {}) {
    const ids = await this.projectIdsInScope(userId, scope);
    return this.listIn(userId, ids, options);
  }

  async getItem(userId: string, scope: ProjectScope, itemId: string): Promise<MediaEntry | null> {
    const row = await this.prisma.albumItem.findFirst({
      where: { id: itemId, userId, project: this.projectWhere(userId, scope) },
      select: ITEM_SELECT,
    });
    return row ? this.toEntry(row) : null;
  }

  /** Resolves a file name produced by `fileNameFor` inside one project. */
  async findItemByFileName(userId: string, projectId: string, fileName: string): Promise<MediaEntry | null> {
    const prefix = idPrefixFromFileName(fileName);
    if (!prefix) return null;
    const rows = await this.prisma.albumItem.findMany({
      where: { userId, projectId, id: { startsWith: prefix }, ...this.mediaWhere() },
      select: ITEM_SELECT,
      take: 10,
    });
    for (const row of rows) {
      const entry = this.toEntry(row);
      if (entry && entry.fileName === fileName) return entry;
    }
    return null;
  }

  /** Every tag used by media in one project, most used first. */
  async listTags(userId: string, projectId: string): Promise<{ tag: string; count: number }[]> {
    const rows = await this.prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT tag, COUNT(*)::int AS count
      FROM "AlbumItem",
        LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof("tags") = 'array' THEN "tags" ELSE '[]'::jsonb END
        ) AS tag
      WHERE "projectId" = ${projectId} AND "userId" = ${userId} AND "imageUrl" ~* ${MEDIA_KEY_PATTERN}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `;
    return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
  }

  /**
   * Older album rows were saved without a size; clients listing a folder
   * need one. Missing sizes are read from storage and written back so the
   * lookup happens once per item.
   */
  async fillMissingSizes(entries: MediaEntry[], getSize: (key: string) => Promise<number | undefined>): Promise<void> {
    const missing = entries.filter((entry) => entry.size == null);
    const CONCURRENCY = 8;
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      await Promise.all(missing.slice(i, i + CONCURRENCY).map(async (entry) => {
        const size = await getSize(entry.key).catch(() => undefined);
        if (size == null) return;
        entry.size = size;
        await this.prisma.albumItem.update({ where: { id: entry.id }, data: { size: BigInt(size) } }).catch(() => {});
      }));
    }
  }

  /** Changes whenever an album in scope gains or loses items; DLNA clients cache on it. */
  async updateStamp(userId: string, scope: ProjectScope): Promise<number> {
    const ids = await this.projectIdsInScope(userId, scope);
    if (ids.length === 0) return 1;
    const result = await this.prisma.albumItem.aggregate({
      where: { userId, projectId: { in: ids } },
      _max: { createdAt: true },
      _count: { _all: true },
    });
    const latest = result._max.createdAt ? Math.floor(result._max.createdAt.getTime() / 1000) : 0;
    // UpdateIDs are ui4; fold the newest timestamp and the count into 31 bits.
    return ((latest + result._count._all * 7919) % 0x7fffffff) || 1;
  }
}

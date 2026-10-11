import { Prisma, PrismaClient } from '@prisma/client';
import type { LibraryType } from '../../src/types';
import { Library, LibraryItem } from '../../src/types';

/**
 * Matches content with something besides whitespace in it — the whitespace
 * JavaScript's trim() removes, which the remix engine uses to skip blank items.
 */
const NON_BLANK_PATTERN = '[^\\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';

export interface LibraryChoiceQuery {
  tags: string[];
  tagMatch: 'and' | 'or';
  /** Positions among the items the source offers; none to count only. */
  indices: number[];
}

export interface LibraryChoice {
  type: LibraryType;
  count: number;
  /** The items at the asked positions, by position. */
  items: Map<number, LibraryItem>;
}

export class LibraryRepository {
  constructor(private prisma: PrismaClient) {}

  private async assertOwnedLibrary(userId: string, libraryId: string): Promise<void> {
    const library = await this.prisma.library.findFirst({
      where: { id: libraryId, userId },
      select: { id: true },
    });

    if (!library) {
      throw new Error('Library not found');
    }
  }

  async getUserLibraries(userId: string, page: number = 1, limit: number = 50, q?: string, includeItems: boolean = false, type?: LibraryType, nameOnly: boolean = false, includeCover: boolean = false): Promise<{ items: Library[], total: number, page: number, pages: number }> {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (type) {
      where.type = type;
    }
    if (q) {
      where.OR = nameOnly
        ? [
            { name: { contains: q, mode: 'insensitive' } },
          ]
        : [
            { name: { contains: q, mode: 'insensitive' } },
            { id: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ];
    }

    const [total, libs] = await Promise.all([
      this.prisma.library.count({ where }),
      this.prisma.library.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { pinnedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        include: includeItems
          ? {
              items: {
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              },
            }
          : undefined,
      })
    ]);
    const [counts, covers] = await Promise.all([
      this.getItemCounts(libs.map((lib) => lib.id)),
      includeCover && !includeItems
        ? this.getCoverKeys(libs.filter((lib) => lib.type === 'image' || lib.type === 'video').map((lib) => lib.id))
        : new Map<string, { content: string; thumbnailUrl: string | null }>(),
    ]);

    const items = libs.map((lib) => ({
      id: lib.id,
      name: lib.name,
      description: (lib as any).description ?? undefined,
      type: lib.type as LibraryType,
      items: 'items' in lib && Array.isArray(lib.items) ? lib.items.map((item) => this.mapItem(item)) : [],
      ...(includeCover && !includeItems ? { coverUrl: this.coverKey(lib.type as LibraryType, covers.get(lib.id)) } : {}),
      itemCount: counts.get(lib.id) ?? 0,
      createdAt: lib.createdAt instanceof Date ? lib.createdAt.getTime() : lib.createdAt,
      updatedAt: lib.updatedAt instanceof Date ? lib.updatedAt.getTime() : lib.updatedAt,
      pinnedAt: lib.pinnedAt ? lib.pinnedAt.toISOString() : null,
    }));

    return {
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * How many items each of these libraries holds. (A `_count` include would
   * group the whole item table, every user's libraries included, and then
   * keep the rows for these.)
   */
  private async getItemCounts(libraryIds: string[]): Promise<Map<string, number>> {
    if (libraryIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ libraryId: string; count: number }>>`
      SELECT "libraryId", count(*)::int AS count
      FROM "LibraryItem"
      WHERE "libraryId" = ANY(${libraryIds}::text[])
      GROUP BY "libraryId"
    `;
    return new Map(rows.map((row) => [row.libraryId, row.count]));
  }

  /**
   * Each library's newest item, for its cover, one row per library. (A nested
   * `take: 1` include does not do this: it reads every item of every library
   * and keeps the first in memory.)
   */
  private async getCoverKeys(libraryIds: string[]): Promise<Map<string, { content: string; thumbnailUrl: string | null }>> {
    if (libraryIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ libraryId: string; content: string; thumbnailUrl: string | null }>>`
      SELECT library.id AS "libraryId", newest.content, newest."thumbnailUrl"
      FROM unnest(${libraryIds}::text[]) AS library(id)
      CROSS JOIN LATERAL (
        SELECT content, "thumbnailUrl" FROM "LibraryItem"
        WHERE "libraryId" = library.id
        ORDER BY "createdAt" DESC, id ASC
        LIMIT 1
      ) AS newest
    `;
    return new Map(rows.map((row) => [row.libraryId, row]));
  }

  /** The stored key or URL a library's cover thumbnail is drawn from. */
  private coverKey(type: LibraryType, item?: { content: string; thumbnailUrl: string | null }): string | undefined {
    if (!item) return undefined;
    if (type === 'image') return item.thumbnailUrl || item.content || undefined;
    if (type === 'video') return item.thumbnailUrl || undefined;
    return undefined;
  }

  async getLibrary(userId: string, libraryId: string): Promise<Library | null> {
    const lib = await this.prisma.library.findFirst({
      where: { id: libraryId, userId },
      include: {
        items: {
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!lib) return null;

    return {
      id: lib.id,
      name: lib.name,
      description: (lib as any).description ?? undefined,
      type: lib.type as LibraryType,
      items: lib.items.map((item) => this.mapItem(item)),
      createdAt: lib.createdAt instanceof Date ? lib.createdAt.getTime() : lib.createdAt,
      updatedAt: lib.updatedAt instanceof Date ? lib.updatedAt.getTime() : lib.updatedAt,
      pinnedAt: lib.pinnedAt ? lib.pinnedAt.toISOString() : null,
    };
  }

  async createLibrary(userId: string, library: Omit<Library, 'items'>): Promise<void> {
    await this.prisma.library.create({
      data: { id: library.id, userId, name: library.name, description: library.description ?? null, type: library.type } as any,
    });
  }

  async updateLibrary(userId: string, libraryId: string, updates: { name?: string; description?: string | null; type?: string }): Promise<void> {
    const result = await this.prisma.library.updateMany({
      where: { id: libraryId, userId },
      data: updates as any,
    });

    if (result.count === 0) {
      throw new Error('Library not found');
    }
  }

  async deleteLibrary(userId: string, libraryId: string): Promise<void> {
    const result = await this.prisma.library.deleteMany({ where: { id: libraryId, userId } });
    if (result.count === 0) {
      throw new Error('Library not found');
    }
  }

  async setLibraryPinned(userId: string, libraryId: string, pinned: boolean): Promise<void> {
    const result = await this.prisma.library.updateMany({
      where: { id: libraryId, userId },
      data: { pinnedAt: pinned ? new Date() : null },
    });
    if (result.count === 0) {
      throw new Error('Library not found');
    }
  }

  async countPinnedLibraries(userId: string): Promise<number> {
    return this.prisma.library.count({ where: { userId, pinnedAt: { not: null } } });
  }

  async getLibraryItems(userId: string, libraryId: string): Promise<LibraryItem[]> {
    const lib = await this.prisma.library.findFirst({ where: { id: libraryId, userId } });
    if (!lib) return [];

    const items = await this.prisma.libraryItem.findMany({
      where: { libraryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => this.mapItem(item));
  }

  /**
   * A library as one workflow step draws from it: how many items it offers —
   * those with content, under the step's tag filter, matched the way
   * filterItemsByTags does — and the items at the asked positions, newest
   * first as the remix engine orders them. The count and the items come from
   * one statement, so they agree. Null when the library is not the user's.
   */
  async getLibraryChoice(userId: string, libraryId: string, query: LibraryChoiceQuery): Promise<LibraryChoice | null> {
    const lib = await this.prisma.library.findFirst({ where: { id: libraryId, userId }, select: { type: true } });
    if (!lib) return null;

    const tags = Array.from(new Set(query.tags.map((tag) => tag.toLowerCase())));
    const matching = Prisma.sql`SELECT count(DISTINCT lower(tag.value)) FROM jsonb_array_elements_text("tags") AS tag(value) WHERE lower(tag.value) = ANY(${tags}::text[])`;
    // CASE keeps jsonb_array_elements_text off tags that are not an array.
    const tagFilter = tags.length === 0
      ? Prisma.sql`TRUE`
      : query.tagMatch === 'and'
        ? Prisma.sql`CASE WHEN jsonb_typeof("tags") = 'array' THEN (${matching}) = ${tags.length} ELSE FALSE END`
        : Prisma.sql`CASE WHEN jsonb_typeof("tags") = 'array' THEN (${matching}) > 0 ELSE FALSE END`;

    const rows = await this.prisma.$queryRaw<Array<{ count: number; position: number | null; id: string | null; content: string | null; title: string | null; tags: unknown }>>`
      WITH eligible AS (
        SELECT id, (row_number() OVER (ORDER BY "createdAt" DESC, id ASC) - 1)::int AS position
        FROM "LibraryItem"
        WHERE "libraryId" = ${libraryId} AND content ~ ${NON_BLANK_PATTERN} AND ${tagFilter}
      ),
      total AS (SELECT count(*)::int AS count FROM eligible)
      SELECT total.count, picked.position, item.id, item.content, item.title, item.tags
      FROM total
      LEFT JOIN eligible AS picked ON picked.position = ANY(${query.indices}::int[])
      LEFT JOIN "LibraryItem" AS item ON item.id = picked.id
    `;

    const items = new Map<number, LibraryItem>();
    for (const row of rows) {
      if (row.position === null || row.id === null) continue;
      items.set(row.position, this.mapItem({ id: row.id, content: row.content, title: row.title, tags: row.tags }));
    }
    return { type: lib.type as LibraryType, count: rows[0]?.count ?? 0, items };
  }

  async getLibraryItemsByIds(userId: string, libraryId: string, itemIds: string[]): Promise<LibraryItem[]> {
    const lib = await this.prisma.library.findFirst({ where: { id: libraryId, userId } });
    if (!lib) return [];

    const items = await this.prisma.libraryItem.findMany({
      where: { libraryId, id: { in: itemIds } },
    });
    return items.map((item) => this.mapItem(item));
  }

  async getLibraryItemsPaginated(userId: string, libraryId: string, page: number = 1, limit: number = 25, q?: string, tags?: string[], sortBy: 'time' | 'name' = 'time', sortOrder: 'asc' | 'desc' = 'desc'): Promise<{ items: LibraryItem[], total: number, page: number, pages: number }> {
    const lib = await this.prisma.library.findFirst({ where: { id: libraryId, userId } });
    if (!lib) return { items: [], total: 0, page, pages: 1 };

    const skip = (page - 1) * limit;
    const where: any = { libraryId };
    const andClauses: any[] = [];

    if (q) {
      andClauses.push({
        OR: lib.type === 'text'
          ? [
              { title: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
              { tags: { array_contains: [q] } },
            ]
          : [
              { title: { contains: q, mode: 'insensitive' } },
              { tags: { array_contains: [q] } },
            ],
      });
    }

    if (tags && tags.length > 0) {
      andClauses.push({ tags: { array_contains: tags } });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    let orderByClause: any[] = [];
    if (sortBy === 'name') {
      orderByClause = [{ title: sortOrder }, { createdAt: 'desc' }, { id: 'asc' }];
    } else {
      orderByClause = [{ createdAt: sortOrder }, { id: 'asc' }];
    }

    const [total, items] = await Promise.all([
      this.prisma.libraryItem.count({ where }),
      (this.prisma.libraryItem.findMany as any)({
        where,
        skip,
        take: limit,
        orderBy: orderByClause,
      }),
    ]);

    return {
      items: items.map((item) => this.mapItem(item)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createLibraryItem(userId: string, libraryId: string, item: LibraryItem): Promise<void> {
    await this.assertOwnedLibrary(userId, libraryId);

    await this.prisma.libraryItem.create({
      data: {
        id: item.id,
        libraryId,
        content: item.content,
        title: item.title ?? null,
        tags: item.tags ?? [],
        thumbnailUrl: item.thumbnailUrl ?? null,
        optimizedUrl: item.optimizedUrl ?? null,
        size: item.size != null ? BigInt(item.size) : null,
      },
    });
  }

  async createLibraryItemsBatch(userId: string, libraryId: string, items: LibraryItem[]): Promise<void> {
    await this.assertOwnedLibrary(userId, libraryId);

    if (items.length === 0) return;

    await this.prisma.libraryItem.createMany({
      data: items.map((item) => ({
        id: item.id,
        libraryId,
        content: item.content,
        title: item.title ?? null,
        tags: item.tags ?? [],
        thumbnailUrl: item.thumbnailUrl ?? null,
        optimizedUrl: item.optimizedUrl ?? null,
        size: item.size != null ? BigInt(item.size) : null,
      })),
    });
  }

  async updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void> {
    await this.assertOwnedLibrary(userId, libraryId);

    const data: any = {};
    if (updates.content !== undefined) data.content = updates.content;
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.thumbnailUrl !== undefined) data.thumbnailUrl = updates.thumbnailUrl;
    if (updates.optimizedUrl !== undefined) data.optimizedUrl = updates.optimizedUrl;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.size !== undefined) data.size = updates.size != null ? BigInt(updates.size) : null;

    const result = await this.prisma.libraryItem.updateMany({
      where: {
        id: itemId,
        libraryId,
        library: { userId },
      },
      data,
    });

    if (result.count === 0) {
      throw new Error('Library item not found');
    }
  }

  async deleteLibraryItem(userId: string, libraryId: string, itemId: string): Promise<void> {
    await this.assertOwnedLibrary(userId, libraryId);

    const result = await this.prisma.libraryItem.deleteMany({
      where: {
        id: itemId,
        libraryId,
        library: { userId },
      },
    });

    if (result.count === 0) {
      throw new Error('Library item not found');
    }
  }



  async searchLibraryItems(
    userId: string,
    query?: string,
    options: { libraryId?: string; tags?: string[]; page?: number; limit?: number } = {},
  ): Promise<{ items: (LibraryItem & { libraryId: string; libraryName: string; libraryDescription?: string })[]; total: number; page: number; pages: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { library: { userId } };
    if (options.libraryId) where.libraryId = options.libraryId;

    // Text search across content, title
    const trimmedQuery = query?.trim();
    if (trimmedQuery) {
      where.OR = [
        { content: { contains: trimmedQuery, mode: 'insensitive' } },
        { title: { contains: trimmedQuery, mode: 'insensitive' } },
      ];
    }

    // Tag filtering — match items that contain ALL specified tags
    // Prisma Json field: use array_contains for PostgreSQL
    if (options.tags && options.tags.length > 0) {
      where.tags = { array_contains: options.tags };
    }

    const orderBy = [{ createdAt: 'desc' as const }, { id: 'asc' as const }];

    const [total, items] = await Promise.all([
      this.prisma.libraryItem.count({ where }),
      (this.prisma.libraryItem.findMany as any)({
        where,
        skip,
        take: limit,
        orderBy,
        include: { library: { select: { name: true, description: true } } },
      }),
    ]);

    return {
      items: (items as any[]).map((item) => ({
        ...this.mapItem(item),
        libraryId: item.libraryId,
        libraryName: item.library.name,
        libraryDescription: (item.library as any).description ?? undefined,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private mapItem(item: any): LibraryItem {
    return {
      id: item.id,
      content: item.content,
      title: item.title ?? undefined,
      tags: (item.tags as string[]) ?? [],
      thumbnailUrl: item.thumbnailUrl ?? undefined,
      optimizedUrl: item.optimizedUrl ?? undefined,
      size: item.size != null ? Number(item.size) : undefined,
      createdAt: item.createdAt instanceof Date ? item.createdAt.getTime() : item.createdAt,
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.getTime() : item.updatedAt,
    };
  }
}

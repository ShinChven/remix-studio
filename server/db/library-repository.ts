import { Prisma, PrismaClient } from '@prisma/client';
import type { LibraryType, TrashItem } from '../../src/types';
import { Library, LibraryItem } from '../../src/types';

export interface LibraryItemRefs {
  id: string;
  name: string;
  type: LibraryType;
  items: Array<{ id: string; tags: string[] }>;
}

const ITEM_ID_BATCH_SIZE = 10000;

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

  async getUserLibraries(userId: string, page: number = 1, limit: number = 50, q?: string, includeItems: boolean = false, type?: LibraryType, nameOnly: boolean = false): Promise<{ items: Library[], total: number, page: number, pages: number }> {
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
              _count: { select: { items: true } },
            }
          : {
              _count: { select: { items: true } },
            },
      })
    ]);

    const items = libs.map((lib) => ({
      id: lib.id,
      name: lib.name,
      description: (lib as any).description ?? undefined,
      type: lib.type as LibraryType,
      items: 'items' in lib && Array.isArray(lib.items) ? lib.items.map((item) => this.mapItem(item)) : [],
      itemCount: lib._count.items,
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

  /** The newest item of each library, keyed by library ID; empty libraries are left out. */
  async getLibraryCoverItems(userId: string, libraryIds: string[]): Promise<Map<string, LibraryItem>> {
    const covers = await Promise.all(
      libraryIds.map((libraryId) =>
        this.prisma.libraryItem.findFirst({
          where: { libraryId, library: { userId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        })
      )
    );

    const result = new Map<string, LibraryItem>();
    covers.forEach((item, index) => {
      if (item) result.set(libraryIds[index], this.mapItem(item));
    });
    return result;
  }

  /**
   * Each library's non-empty items as ID and tags only, newest first: enough to
   * pick combinations without reading any content. Missing libraries are left out.
   */
  async getLibraryItemRefs(userId: string, libraryIds: string[]): Promise<LibraryItemRefs[]> {
    if (libraryIds.length === 0) return [];
    const libraries = await this.prisma.library.findMany({
      where: { id: { in: libraryIds }, userId },
      select: { id: true, name: true, type: true },
    });
    const items = await this.prisma.libraryItem.findMany({
      where: { libraryId: { in: libraries.map((lib) => lib.id) }, NOT: { content: '' } },
      select: { id: true, libraryId: true, tags: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    const byLibrary = new Map<string, LibraryItemRefs>(
      libraries.map((lib) => [lib.id, { id: lib.id, name: lib.name, type: lib.type as LibraryType, items: [] }])
    );
    for (const item of items) {
      byLibrary.get(item.libraryId)?.items.push({ id: item.id, tags: (item.tags as string[]) ?? [] });
    }
    return Array.from(byLibrary.values());
  }

  /** The content and title of these items, from any of the user's libraries. */
  async getLibraryItemContents(userId: string, itemIds: string[]): Promise<Map<string, { content: string; title?: string }>> {
    const result = new Map<string, { content: string; title?: string }>();
    // Stay well under the database's limit on bound parameters per query.
    for (let start = 0; start < itemIds.length; start += ITEM_ID_BATCH_SIZE) {
      const items = await this.prisma.libraryItem.findMany({
        where: { id: { in: itemIds.slice(start, start + ITEM_ID_BATCH_SIZE) }, library: { userId } },
        select: { id: true, content: true, title: true },
      });
      for (const item of items) {
        result.set(item.id, { content: item.content, title: item.title ?? undefined });
      }
    }
    return result;
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

  /** The library's type, or null when the user has no such library; reads none of its items. */
  async getLibraryType(userId: string, libraryId: string): Promise<LibraryType | null> {
    const lib = await this.prisma.library.findFirst({ where: { id: libraryId, userId }, select: { type: true } });
    return lib ? (lib.type as LibraryType) : null;
  }

  /** The library without its items, or null when the user has no such library; itemCount is filled only on request. */
  async getLibrarySummary(userId: string, libraryId: string, includeItemCount: boolean = false): Promise<Omit<Library, 'items'> | null> {
    const lib = await this.prisma.library.findFirst({
      where: { id: libraryId, userId },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        pinnedAt: true,
      },
    });
    if (!lib) return null;

    const itemCount = includeItemCount
      ? await this.prisma.libraryItem.count({ where: { libraryId } })
      : undefined;

    return {
      id: lib.id,
      name: lib.name,
      description: lib.description ?? undefined,
      type: lib.type as LibraryType,
      ...(itemCount !== undefined ? { itemCount } : {}),
      createdAt: lib.createdAt.getTime(),
      updatedAt: lib.updatedAt.getTime(),
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

  /** Moves items to the recycle bin; ids that are not in the library are skipped. Returns how many moved. */
  async moveLibraryItemsToTrash(userId: string, libraryId: string, itemIds: string[]): Promise<number> {
    const library = await this.prisma.library.findFirst({
      where: { id: libraryId, userId },
      select: { name: true, type: true },
    });
    if (!library) throw new Error('Library not found');
    if (itemIds.length === 0) return 0;

    return this.prisma.$transaction(async (tx) => {
      const items = await tx.libraryItem.findMany({ where: { libraryId, id: { in: itemIds } } });
      if (items.length === 0) return 0;

      const deletedAt = new Date();
      await tx.libraryTrashItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          userId,
          libraryId,
          libraryName: library.name,
          libraryType: library.type,
          content: item.content,
          title: item.title,
          tags: (item.tags as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
          thumbnailUrl: item.thumbnailUrl,
          optimizedUrl: item.optimizedUrl,
          size: item.size,
          createdAt: item.createdAt,
          deletedAt,
        })),
      });
      await tx.libraryItem.deleteMany({ where: { libraryId, id: { in: items.map((item) => item.id) } } });
      return items.length;
    });
  }

  /** Deleted library items, newest first, in the shape the recycle bin shows: the library stands where a project would. */
  async getLibraryTrashItems(userId: string): Promise<TrashItem[]> {
    const items = await this.prisma.libraryTrashItem.findMany({
      where: { userId },
      orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
    });
    // Items outlive their library; only those whose library is still there can go back.
    const libraryIds = [...new Set(items.map((item) => item.libraryId))];
    const libraries = libraryIds.length
      ? await this.prisma.library.findMany({ where: { userId, id: { in: libraryIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(libraries.map((library) => [library.id, library.name]));

    return items.map((item) => {
      const libraryType = item.libraryType as LibraryType;
      const isText = libraryType === 'text';
      return {
        id: item.id,
        source: 'library' as const,
        libraryType,
        title: item.title ?? undefined,
        jobId: '',
        prompt: '',
        textContent: isText ? item.content : undefined,
        imageUrl: isText ? '' : item.content,
        thumbnailUrl: item.thumbnailUrl ?? undefined,
        optimizedUrl: item.optimizedUrl ?? undefined,
        tags: (item.tags as string[]) ?? [],
        size: item.size != null ? Number(item.size) : undefined,
        createdAt: item.createdAt.getTime(),
        deletedAt: item.deletedAt.getTime(),
        projectId: item.libraryId,
        projectName: names.get(item.libraryId) ?? item.libraryName,
        projectExists: names.has(item.libraryId),
      };
    });
  }

  /** Puts deleted items back in their libraries; items whose library is gone stay in the bin. Returns the libraries that changed. */
  async restoreLibraryTrashItems(userId: string, itemIds: string[]): Promise<{ restored: number; libraryIds: string[] }> {
    if (itemIds.length === 0) return { restored: 0, libraryIds: [] };

    return this.prisma.$transaction(async (tx) => {
      const trashed = await tx.libraryTrashItem.findMany({ where: { userId, id: { in: itemIds } } });
      const libraries = await tx.library.findMany({
        where: { userId, id: { in: [...new Set(trashed.map((item) => item.libraryId))] } },
        select: { id: true },
      });
      const existing = new Set(libraries.map((library) => library.id));
      const restorable = trashed.filter((item) => existing.has(item.libraryId));
      if (restorable.length === 0) return { restored: 0, libraryIds: [] };

      await tx.libraryItem.createMany({
        data: restorable.map((item) => ({
          id: item.id,
          libraryId: item.libraryId,
          content: item.content,
          title: item.title,
          tags: (item.tags as Prisma.InputJsonValue | null) ?? [],
          thumbnailUrl: item.thumbnailUrl,
          optimizedUrl: item.optimizedUrl,
          size: item.size,
          createdAt: item.createdAt,
        })),
      });
      await tx.libraryTrashItem.deleteMany({ where: { userId, id: { in: restorable.map((item) => item.id) } } });
      return { restored: restorable.length, libraryIds: [...new Set(restorable.map((item) => item.libraryId))] };
    });
  }

  /**
   * Removes deleted library items for good: the given ones, or the whole bin.
   * Returns the storage keys that are now safe to delete, leaving out any file
   * that a job, album item, workflow or another library item still points at.
   */
  async deleteLibraryTrashPermanently(userId: string, itemIds?: string[]): Promise<string[]> {
    const where = itemIds ? { userId, id: { in: itemIds } } : { userId };
    const items = await this.prisma.libraryTrashItem.findMany({ where });
    if (items.length === 0) return [];

    await this.prisma.libraryTrashItem.deleteMany({ where: { userId, id: { in: items.map((item) => item.id) } } });

    const keys = new Set<string>();
    for (const item of items) {
      const candidates = item.libraryType === 'text' ? [] : [item.content, item.thumbnailUrl, item.optimizedUrl];
      for (const key of candidates) {
        if (key && !key.startsWith('http') && !key.startsWith('data:')) keys.add(key);
      }
    }
    if (keys.size === 0) return [];

    const referenced = await this.findReferencedStorageKeys(userId, [...keys]);
    return [...keys].filter((key) => !referenced.has(key));
  }

  /** Which of these storage keys some record of the user's still uses. */
  private async findReferencedStorageKeys(userId: string, keys: string[]): Promise<Set<string>> {
    const contexts = (table: string) =>
      (['imageContexts', 'videoContexts', 'audioContexts'] as const).map(
        (column) => Prisma.sql`
          SELECT e.value AS key FROM ${Prisma.raw(`"${table}"`)} r
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r.${Prisma.raw(`"${column}"`)}) = 'array' THEN r.${Prisma.raw(`"${column}"`)} ELSE '[]'::jsonb END
          ) AS e(value)
          WHERE r."userId" = ${userId}`,
      );

    const sources = [
      ...contexts('Job'),
      ...contexts('AlbumItem'),
      ...contexts('TrashItem'),
      Prisma.sql`
        SELECT v.key FROM "LibraryItem" i
        JOIN "Library" l ON l."id" = i."libraryId"
        CROSS JOIN LATERAL (VALUES (i."content"), (i."thumbnailUrl"), (i."optimizedUrl")) AS v(key)
        WHERE l."userId" = ${userId}`,
      Prisma.sql`
        SELECT v.key FROM "LibraryTrashItem" t
        CROSS JOIN LATERAL (VALUES (t."content"), (t."thumbnailUrl"), (t."optimizedUrl")) AS v(key)
        WHERE t."userId" = ${userId}`,
      Prisma.sql`
        SELECT v.key FROM "WorkflowItem" w
        JOIN "Project" p ON p."id" = w."projectId"
        CROSS JOIN LATERAL (VALUES (w."value"), (w."thumbnailUrl"), (w."optimizedUrl")) AS v(key)
        WHERE p."userId" = ${userId}`,
    ];

    const rows = await this.prisma.$queryRaw<Array<{ key: string }>>`
      SELECT DISTINCT k.key
      FROM unnest(${keys}::text[]) AS k(key)
      JOIN (${Prisma.join(sources, ' UNION ALL ')}) AS used ON used.key = k.key`;
    return new Set(rows.map((row) => row.key));
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

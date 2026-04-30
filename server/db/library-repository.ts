import { PrismaClient } from '@prisma/client';
import type { LibraryType } from '../../src/types';
import { Library, LibraryItem } from '../../src/types';

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

  async getUserLibraries(userId: string, page: number = 1, limit: number = 50, q?: string, includeItems: boolean = false, type?: LibraryType): Promise<{ items: Library[], total: number, page: number, pages: number }> {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (type) {
      where.type = type;
    }
    if (q) {
      where.OR = [
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
                orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
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
      pinnedAt: lib.pinnedAt ? lib.pinnedAt.toISOString() : null,
    }));

    return {
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getLibrary(userId: string, libraryId: string): Promise<Library | null> {
    const lib = await this.prisma.library.findFirst({
      where: { id: libraryId, userId },
      include: {
        items: {
          orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
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
      orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => this.mapItem(item));
  }

  async getLibraryItemsPaginated(userId: string, libraryId: string, page: number = 1, limit: number = 25, q?: string, tags?: string[]): Promise<{ items: LibraryItem[], total: number, page: number, pages: number }> {
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

    const [total, items] = await Promise.all([
      this.prisma.libraryItem.count({ where }),
      (this.prisma.libraryItem.findMany as any)({
        where,
        skip,
        take: limit,
        orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
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
        order: item.order ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
        optimizedUrl: item.optimizedUrl ?? null,
        size: item.size != null ? BigInt(item.size) : null,
      },
    });
  }

  async createLibraryItemsBatch(userId: string, libraryId: string, items: LibraryItem[]): Promise<void> {
    await this.assertOwnedLibrary(userId, libraryId);

    await this.prisma.libraryItem.createMany({
      data: items.map((item) => ({
        id: item.id,
        libraryId,
        content: item.content,
        title: item.title ?? null,
        tags: item.tags ?? [],
        order: item.order ?? null,
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
    if (updates.order !== undefined) data.order = updates.order;
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

  async reorderLibraryItems(userId: string, libraryId: string, updates: { id: string; order: number }[]): Promise<void> {
    await this.assertOwnedLibrary(userId, libraryId);

    const itemIds = [...new Set(updates.map((item) => item.id))];
    const existing = await this.prisma.libraryItem.findMany({
      where: {
        id: { in: itemIds },
        libraryId,
        library: { userId },
      },
      select: { id: true },
    });

    if (existing.length !== itemIds.length) {
      throw new Error('Library item not found');
    }

    await Promise.all(
      updates.map((u) =>
        this.prisma.libraryItem.updateMany({
          where: {
            id: u.id,
            libraryId,
            library: { userId },
          },
          data: { order: u.order },
        })
      )
    );
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

    const orderBy = options.libraryId
      ? [{ order: { sort: 'asc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }, { id: 'asc' as const }]
      : [{ createdAt: 'desc' as const }, { id: 'asc' as const }];

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
      order: item.order ?? undefined,
      thumbnailUrl: item.thumbnailUrl ?? undefined,
      optimizedUrl: item.optimizedUrl ?? undefined,
      size: item.size != null ? Number(item.size) : undefined,
      createdAt: item.createdAt instanceof Date ? item.createdAt.getTime() : item.createdAt,
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.getTime() : item.updatedAt,
    };
  }
}

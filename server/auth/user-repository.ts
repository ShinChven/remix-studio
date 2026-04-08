import { PrismaClient } from '@prisma/client';
import type { PaginatedResult, UserDetail, UserRole, UserStatus, UserSummary } from '../../src/types';
import type { UserRecord } from './auth';

const DEFAULT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;

type ListUsersParams = {
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'lastLoginAt' | 'email';
  sortOrder?: 'asc' | 'desc';
};

function toNumber(value: bigint | number | null | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  return Number(value || 0);
}

function sumSizeFields(record: { size?: bigint | number | null; optimizedSize?: bigint | number | null; thumbnailSize?: bigint | number | null }) {
  return toNumber(record.size) + toNumber(record.optimizedSize) + toNumber(record.thumbnailSize);
}

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async createUser(user: UserRecord): Promise<void> {
    const existing = await this.findByEmail(user.email);
    if (existing) throw new Error('Email already exists');

    await this.prisma.user.create({
      data: {
        id: user.sk,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role ?? 'user',
        status: user.status ?? 'disabled',
        storageLimit: BigInt(user.storageLimit ?? DEFAULT_STORAGE_LIMIT),
        createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
      },
    });
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) return null;
    return this.toRecord(u);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { email } });
    if (!u) return null;
    return this.toRecord(u);
  }

  async listUsers(params: ListUsersParams = {}): Promise<PaginatedResult<UserSummary>> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const where = {
      ...(params.q ? { email: { contains: params.q, mode: 'insensitive' as const } } : {}),
      ...(params.role ? { role: params.role } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';
    const orderBy =
      sortBy === 'email'
        ? [{ email: sortOrder }]
        : sortBy === 'lastLoginAt'
          ? [{ lastLoginAt: sortOrder }, { createdAt: 'desc' as const }]
          : [{ createdAt: sortOrder }, { email: 'asc' as const }];

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          _count: {
            select: {
              projects: true,
              libraries: true,
              providers: true,
              exportTasks: true,
            },
          },
        },
      }),
    ]);

    const usageByUserId = await this.getStorageUsageForUsers(users.map((user) => user.id));

    return {
      items: users.map((u) => ({
        ...this.toSafeUser(u),
        projectCount: u._count.projects,
        libraryCount: u._count.libraries,
        providerCount: u._count.providers,
        usedStorage: usageByUserId.get(u.id)?.total || 0,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getUserDetail(userId: string): Promise<UserDetail | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            projects: true,
            libraries: true,
            providers: true,
            exportTasks: true,
          },
        },
      },
    });
    if (!user) return null;

    const usage = (await this.getStorageUsageForUsers([userId])).get(userId) || {
      total: 0,
      projects: 0,
      libraries: 0,
      exports: 0,
      trash: 0,
    };

    return {
      ...this.toSafeUser(user),
      projectCount: user._count.projects,
      libraryCount: user._count.libraries,
      providerCount: user._count.providers,
      exportCount: user._count.exportTasks,
      usedStorage: usage.total,
      storageBreakdown: {
        projects: usage.projects,
        libraries: usage.libraries,
        exports: usage.exports,
        trash: usage.trash,
      },
    };
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  async updateStorageLimit(userId: string, limit: number): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { storageLimit: BigInt(limit) } });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  async countActiveAdmins(excludeUserId?: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        role: 'admin',
        status: 'active',
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    });
  }

  async hasAnyUsers(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count > 0;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private async getStorageUsageForUsers(userIds: string[]) {
    const usage = new Map<string, { total: number; projects: number; libraries: number; exports: number; trash: number }>();
    if (userIds.length === 0) return usage;

    const [albumItems, libraryItems, trashItems, exportTasks] = await Promise.all([
      this.prisma.albumItem.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, size: true, optimizedSize: true, thumbnailSize: true },
      }),
      this.prisma.libraryItem.findMany({
        where: { library: { userId: { in: userIds } } },
        select: { size: true, optimizedUrl: true, thumbnailUrl: true, library: { select: { userId: true } } },
      }),
      this.prisma.trashItem.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, size: true, optimizedSize: true, thumbnailSize: true },
      }),
      this.prisma.exportTask.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, size: true },
      }),
    ]);

    const ensure = (userId: string) => {
      if (!usage.has(userId)) {
        usage.set(userId, { total: 0, projects: 0, libraries: 0, exports: 0, trash: 0 });
      }
      return usage.get(userId)!;
    };

    for (const item of albumItems) {
      const entry = ensure(item.userId);
      const size = sumSizeFields(item);
      entry.projects += size;
      entry.total += size;
    }

    for (const item of libraryItems) {
      const entry = ensure(item.library.userId);
      const size = toNumber(item.size);
      entry.libraries += size;
      entry.total += size;
    }

    for (const item of trashItems) {
      const entry = ensure(item.userId);
      const size = sumSizeFields(item);
      entry.trash += size;
      entry.total += size;
    }

    for (const task of exportTasks) {
      const entry = ensure(task.userId);
      const size = toNumber(task.size);
      entry.exports += size;
      entry.total += size;
    }

    return usage;
  }

  private toSafeUser(u: any) {
    return {
      id: u.id,
      email: u.email,
      role: u.role as UserRole,
      status: u.status as UserStatus,
      storageLimit: toNumber(u.storageLimit) || DEFAULT_STORAGE_LIMIT,
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : u.createdAt,
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.getTime() : u.updatedAt,
      lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.getTime() : undefined,
    };
  }

  private toRecord(u: any): UserRecord {
    return {
      pk: 'USER',
      sk: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      role: u.role as UserRole,
      status: u.status as UserStatus,
      storageLimit: toNumber(u.storageLimit) || DEFAULT_STORAGE_LIMIT,
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : u.createdAt,
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.getTime() : u.updatedAt,
      lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.getTime() : undefined,
    };
  }
}

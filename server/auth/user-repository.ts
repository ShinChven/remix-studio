import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import type { InviteCode, PaginatedResult, UserDetail, UserRole, UserStatus, UserSummary } from '../../src/types';
import type { UserRecord } from './auth';
import { decrypt, encrypt } from '../utils/crypto';

const DEFAULT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;
const DEFAULT_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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
        passwordHash: user.passwordHash ?? null,
        role: user.role ?? 'user',
        status: user.status ?? 'disabled',
        createdByUserId: user.createdByUserId ?? null,
        sessionVersion: user.sessionVersion ?? 0,
        storageLimit: BigInt(user.storageLimit ?? DEFAULT_STORAGE_LIMIT),
        twoFactorEnabled: user.twoFactorEnabled ?? false,
        twoFactorSecret: user.twoFactorSecret ?? null,
        twoFactorTempSecret: user.twoFactorTempSecret ?? null,
        twoFactorTempExpiresAt: user.twoFactorTempExpiresAt ? new Date(user.twoFactorTempExpiresAt) : null,
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
          createdByUser: {
            select: {
              id: true,
              email: true,
            },
          },
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
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
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

    const inviteCode = await this.findInviteByUsedUserId(userId);

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
      inviteCode,
    };
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        role,
        sessionVersion: { increment: 1 },
      },
    });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status,
        sessionVersion: { increment: 1 },
      },
    });
  }

  async updateStorageLimit(userId: string, limit: number): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { storageLimit: BigInt(limit) } });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
  }

  async removePassword(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: null,
        sessionVersion: { increment: 1 },
      },
    });
  }

  async startTwoFactorSetup(userId: string, encryptedSecret: string, expiresAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorTempSecret: encryptedSecret,
        twoFactorTempExpiresAt: expiresAt,
      },
    });
  }

  async enableTwoFactor(userId: string, encryptedSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        twoFactorTempSecret: null,
        twoFactorTempExpiresAt: null,
      },
    });
  }

  async disableTwoFactor(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorTempSecret: null,
        twoFactorTempExpiresAt: null,
      },
    });
  }

  async clearPendingTwoFactorSetup(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorTempSecret: null,
        twoFactorTempExpiresAt: null,
      },
    });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  async listPasskeys(userId: string) {
    const passkeys = await this.prisma.passkeyCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return passkeys.map((passkey) => ({
      id: passkey.id,
      userId: passkey.userId,
      name: passkey.name,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      algorithm: passkey.algorithm,
      counter: toNumber(passkey.counter),
      transports: Array.isArray(passkey.transports) ? passkey.transports : [],
      createdAt: passkey.createdAt.getTime(),
      lastUsedAt: passkey.lastUsedAt ? passkey.lastUsedAt.getTime() : undefined,
    }));
  }

  async findPasskeyByCredentialId(credentialId: string) {
    const passkey = await this.prisma.passkeyCredential.findUnique({ where: { credentialId } });
    if (!passkey) return null;

    return {
      id: passkey.id,
      userId: passkey.userId,
      name: passkey.name,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      algorithm: passkey.algorithm,
      counter: toNumber(passkey.counter),
      transports: Array.isArray(passkey.transports) ? passkey.transports : [],
      createdAt: passkey.createdAt.getTime(),
      lastUsedAt: passkey.lastUsedAt ? passkey.lastUsedAt.getTime() : undefined,
    };
  }

  async createPasskey(userId: string, data: {
    name: string;
    credentialId: string;
    publicKey: string;
    algorithm: string;
    counter: number;
    transports?: string[];
  }) {
    const passkey = await this.prisma.passkeyCredential.create({
      data: {
        userId,
        name: data.name,
        credentialId: data.credentialId,
        publicKey: data.publicKey,
        algorithm: data.algorithm,
        counter: BigInt(data.counter),
        transports: data.transports || [],
      },
    });

    return {
      id: passkey.id,
      userId: passkey.userId,
      name: passkey.name,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      algorithm: passkey.algorithm,
      counter: toNumber(passkey.counter),
      transports: Array.isArray(passkey.transports) ? passkey.transports : [],
      createdAt: passkey.createdAt.getTime(),
      lastUsedAt: passkey.lastUsedAt ? passkey.lastUsedAt.getTime() : undefined,
    };
  }

  async deletePasskey(userId: string, passkeyId: string): Promise<void> {
    const result = await this.prisma.passkeyCredential.deleteMany({
      where: { id: passkeyId, userId },
    });
    if (result.count === 0) {
      throw new Error('Passkey not found');
    }
  }

  async updatePasskeyCounter(passkeyId: string, counter: number): Promise<void> {
    await this.prisma.passkeyCredential.update({
      where: { id: passkeyId },
      data: {
        counter: BigInt(counter),
        lastUsedAt: new Date(),
      },
    });
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

  async setGoogleDriveRefreshToken(userId: string, encryptedToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { googleDriveRefreshToken: encryptedToken },
    });
  }

  async clearGoogleDriveRefreshToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { googleDriveRefreshToken: null },
    });
  }

  async getGoogleDriveRefreshToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { googleDriveRefreshToken: true },
    });
    return user?.googleDriveRefreshToken ?? null;
  }

  async hasAnyUsers(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count > 0;
  }

  async createInviteCode(createdByUserId: string, expiresAt?: Date, note?: string): Promise<InviteCode> {
    const plainCode = this.generateInviteCode();
    const invite = await this.prisma.inviteCode.create({
      data: {
        codeHash: this.hashInviteCode(plainCode),
        codeEncrypted: encrypt(plainCode),
        note: note?.trim() || null,
        createdByUserId,
        expiresAt: expiresAt ?? new Date(Date.now() + DEFAULT_INVITE_EXPIRY_MS),
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        usedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return this.toInviteCode(invite);
  }

  async listInviteCodes(createdByUserId?: string): Promise<InviteCode[]> {
    const invites = await this.prisma.inviteCode.findMany({
      where: createdByUserId ? { createdByUserId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        usedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return invites.map((invite) => this.toInviteCode(invite));
  }

  async redeemInviteCode(code: string, data: { email: string; role?: UserRole; status?: UserStatus }) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedCode = code.trim().toUpperCase();
    const codeHash = this.hashInviteCode(normalizedCode);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        throw new Error('Email already exists');
      }

      const claimed = await tx.inviteCode.updateMany({
        where: {
          codeHash,
          usedAt: null,
          usedByUserId: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        data: {
          usedAt: now,
          usedByEmail: normalizedEmail,
        },
      });

      if (claimed.count !== 1) {
        throw new Error('Invite code is invalid or unavailable');
      }

      const invite = await tx.inviteCode.findUnique({
        where: { codeHash },
        include: {
          createdByUser: {
            select: {
              id: true,
              email: true,
            },
          },
          usedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
      if (!invite) {
        throw new Error('Invite code is invalid or unavailable');
      }

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          role: data.role ?? 'user',
          status: data.status ?? 'active',
          createdByUserId: invite.createdByUserId,
          storageLimit: BigInt(DEFAULT_STORAGE_LIMIT),
        },
      });

      const updatedInvite = await tx.inviteCode.update({
        where: { codeHash },
        data: {
          usedByUserId: user.id,
        },
        include: {
          createdByUser: {
            select: {
              id: true,
              email: true,
            },
          },
          usedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      return {
        user: this.toRecord(user),
        invite: this.toInviteCode(updatedInvite),
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async findInviteByUsedUserId(userId: string): Promise<InviteCode | null> {
    const invite = await this.prisma.inviteCode.findFirst({
      where: { usedByUserId: userId },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
          },
        },
        usedByUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return invite ? this.toInviteCode(invite) : null;
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
      createdBy: u.createdByUser
        ? {
            id: u.createdByUser.id,
            email: u.createdByUser.email,
          }
        : null,
      storageLimit: toNumber(u.storageLimit) || DEFAULT_STORAGE_LIMIT,
      twoFactorEnabled: Boolean(u.twoFactorEnabled),
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
      createdByUserId: u.createdByUserId ?? null,
      storageLimit: toNumber(u.storageLimit) || DEFAULT_STORAGE_LIMIT,
      twoFactorEnabled: Boolean(u.twoFactorEnabled),
      twoFactorSecret: u.twoFactorSecret ?? null,
      twoFactorTempSecret: u.twoFactorTempSecret ?? null,
      twoFactorTempExpiresAt: u.twoFactorTempExpiresAt instanceof Date ? u.twoFactorTempExpiresAt.getTime() : u.twoFactorTempExpiresAt ?? null,
      googleDriveRefreshToken: u.googleDriveRefreshToken ?? null,
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : u.createdAt,
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.getTime() : u.updatedAt,
      lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.getTime() : undefined,
      sessionVersion: u.sessionVersion ?? 0,
    };
  }

  private toInviteCode(invite: any): InviteCode {
    return {
      id: invite.id,
      code: decrypt(invite.codeEncrypted),
      note: invite.note ?? null,
      createdAt: invite.createdAt instanceof Date ? invite.createdAt.getTime() : invite.createdAt,
      usedAt: invite.usedAt instanceof Date ? invite.usedAt.getTime() : undefined,
      expiresAt: invite.expiresAt instanceof Date ? invite.expiresAt.getTime() : undefined,
      createdBy: {
        id: invite.createdByUser.id,
        email: invite.createdByUser.email,
      },
      usedBy: invite.usedByUser
        ? {
            id: invite.usedByUser.id,
            email: invite.usedByUser.email,
          }
        : null,
      usedByEmail: invite.usedByEmail ?? null,
    };
  }

  private generateInviteCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 10 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
  }

  private hashInviteCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
}

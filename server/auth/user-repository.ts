import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import type { InviteCode, PaginatedResult, UserDetail, UserRole, UserStatus, UserSummary } from '../../src/types';
import type { UserRecord } from './auth';
import { decrypt, encrypt } from '../utils/crypto';

const DEFAULT_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024;
const DEFAULT_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Window during which a rotated refresh token may be presented again without being treated as
 * reuse. It covers the case where the rotation response never reached the browser — a dropped
 * connection, a backgrounded mobile tab, a laptop suspending mid-request — leaving the client
 * holding the previous token. Wider than the equivalent window for OAuth clients because a
 * browser can be frozen mid-refresh and only come back minutes later, and being wrong here
 * signs the user out for no reason.
 */
export const SESSION_ROTATION_GRACE_MS = 5 * 60 * 1000;

/** How long rotation tombstones are kept before housekeeping removes them. */
const ROTATION_TOMBSTONE_TTL_MS = 60 * 60 * 1000;
const INVITE_TIER_STORAGE_LIMITS = {
  free: 5 * 1024 * 1024 * 1024,
  professional: 100 * 1024 * 1024 * 1024,
  premium: 500 * 1024 * 1024 * 1024,
} as const;

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
          ? [
              { lastLoginAt: { sort: sortOrder, nulls: 'last' as const } },
              { createdAt: 'desc' as const },
              { email: 'asc' as const },
            ]
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

  async createSession(userId: string, tokenHash: string, expiresAt: Date, userAgent?: string, ipAddress?: string): Promise<void> {
    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });
  }

  /**
   * Deletes the session a refresh token belongs to, along with the rest of its rotation chain.
   * Starting from a tombstone (a client logging out with a token whose rotation response it
   * never received) this also removes the live successor, so logout always ends the session.
   */
  async deleteSession(tokenHash: string): Promise<void> {
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
      select: { id: true },
    });
    if (!session) return;
    await this.deleteRotationChain(session.id);
  }

  /**
   * Walks the rotation chain forward from `startId` to the session that has not been rotated
   * yet — the one a healthy client would be holding. Returns null if the chain dead-ends,
   * which happens once logout or housekeeping has removed its tail.
   *
   * Walking the whole chain rather than a single hop matters for clients on a flaky
   * connection: they can lose several rotation responses in a row, and every token they
   * replay should still lead to the session that is actually live.
   */
  async findLiveRotationTail(startId: string) {
    const seen = new Set<string>();
    let currentId: string | null = startId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const session = await this.prisma.userSession.findUnique({ where: { id: currentId } });
      if (!session) return null;
      if (!session.rotatedAt) return session;
      currentId = session.rotatedToId;
    }
    return null;
  }

  /**
   * Atomically rotates a refresh token: creates the successor session and turns the old one
   * into a tombstone pointing at it, in a single transaction. This prevents race conditions
   * under concurrent refresh requests, ensuring the old token can only be consumed once.
   *
   * The old session is tombstoned rather than deleted so that a client whose rotation response
   * never arrived still resolves to a known session and can be recovered inside the grace
   * window, instead of being signed out with no way back. Tombstones are purged by
   * cleanExpiredSessions().
   *
   * Returns the new session id, or null if the session was already consumed (concurrent
   * request won the race).
   */
  async rotateSession(
    oldTokenHash: string,
    newTokenHash: string,
    userId: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<string | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.userSession.create({
          data: { userId, tokenHash: newTokenHash, expiresAt, userAgent, ipAddress },
        });
        // Guarding on rotatedAt: null keeps this single-consumption — a concurrent
        // rotation of the same token updates zero rows and loses the race.
        const tombstoned = await tx.userSession.updateMany({
          where: { tokenHash: oldTokenHash, rotatedAt: null },
          data: { rotatedToId: created.id, rotatedAt: new Date() },
        });
        if (tombstoned.count === 0) {
          throw new Error('SESSION_ALREADY_CONSUMED');
        }
        return created.id;
      });
    } catch (e: any) {
      if (e.message === 'SESSION_ALREADY_CONSUMED') return null;
      throw e;
    }
  }

  /**
   * Deletes every session in the rotation chain starting at `startId` (following rotatedToId).
   * Used when a refresh token is reused outside the rotation grace window, so a leaked token
   * cannot keep spawning sessions.
   */
  async deleteRotationChain(startId: string): Promise<void> {
    const seen = new Set<string>();
    let currentId: string | null = startId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const session: { id: string; rotatedToId: string | null } | null =
        await this.prisma.userSession.findUnique({
          where: { id: currentId },
          select: { id: true, rotatedToId: true },
        });
      if (!session) break;
      const nextId = session.rotatedToId;
      // deleteMany, not delete: a concurrent logout or housekeeping pass may have removed the
      // row since it was read, and that must not turn into a 500 on the refresh path.
      await this.prisma.userSession.deleteMany({ where: { id: session.id } });
      currentId = nextId;
    }
  }

  async deleteAllSessionsForUser(userId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });
  }

  /**
   * Deletes all sessions whose expiresAt is in the past, plus rotation tombstones that are
   * well past the grace window and can no longer recover anyone.
   * Safe to call periodically (e.g. every hour) as a background housekeeping task.
   */
  async cleanExpiredSessions(): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { rotatedAt: { lt: new Date(Date.now() - ROTATION_TOMBSTONE_TTL_MS) } },
        ],
      },
    });
    return result.count;
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

  async hasAnyUsers(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count > 0;
  }

  async createInviteCode(
    createdByUserId: string,
    expiresAt?: Date,
    note?: string,
    maxUses: number = 1,
    membershipTier: keyof typeof INVITE_TIER_STORAGE_LIMITS = 'free',
  ): Promise<InviteCode> {
    const plainCode = this.generateInviteCode();
    const invite = await this.prisma.inviteCode.create({
      data: {
        codeHash: this.hashInviteCode(plainCode),
        codeEncrypted: encrypt(plainCode),
        note: note?.trim() || null,
        membershipTier,
        maxUses,
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
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 1,
          select: {
            email: true,
            redeemedAt: true,
          },
        },
        _count: {
          select: {
            redemptions: true,
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
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 1,
          select: {
            email: true,
            redeemedAt: true,
          },
        },
        _count: {
          select: {
            redemptions: true,
          },
        },
      },
    });

    return invites.map((invite) => this.toInviteCode(invite));
  }

  async deleteInviteCode(inviteId: string, createdByUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const invite = await tx.inviteCode.findFirst({
        where: {
          id: inviteId,
          createdByUserId,
        },
        select: {
          id: true,
          _count: {
            select: {
              redemptions: true,
            },
          },
        },
      });

      if (!invite) {
        throw new Error('Invite code not found');
      }

      if (invite._count.redemptions > 0) {
        throw new Error('Invite code has already been used and cannot be deleted');
      }

      await tx.inviteCode.delete({
        where: { id: invite.id },
      });
    });
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
          redemptions: {
            orderBy: { redeemedAt: 'desc' },
            take: 1,
            select: {
              email: true,
              redeemedAt: true,
            },
          },
          _count: {
            select: {
              redemptions: true,
            },
          },
        },
      });
      if (!invite) {
        throw new Error('Invite code is invalid or unavailable');
      }
      if (invite.expiresAt && invite.expiresAt <= now) {
        throw new Error('Invite code is invalid or unavailable');
      }
      if (invite._count.redemptions >= invite.maxUses) {
        throw new Error('Invite code is invalid or unavailable');
      }

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          role: data.role ?? 'user',
          status: data.status ?? 'active',
          createdByUserId: invite.createdByUserId,
          storageLimit: BigInt(INVITE_TIER_STORAGE_LIMITS[invite.membershipTier as keyof typeof INVITE_TIER_STORAGE_LIMITS] ?? DEFAULT_STORAGE_LIMIT),
        },
      });

      await tx.inviteRedemption.create({
        data: {
          inviteCodeId: invite.id,
          userId: user.id,
          email: normalizedEmail,
          redeemedAt: now,
        },
      });

      const updatedInvite = await tx.inviteCode.update({
        where: { codeHash },
        data: {
          usedAt: now,
          usedByUserId: user.id,
          usedByEmail: normalizedEmail,
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
          redemptions: {
            orderBy: { redeemedAt: 'desc' },
            take: 1,
            select: {
              email: true,
              redeemedAt: true,
            },
          },
          _count: {
            select: {
              redemptions: true,
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
    const redemption = await this.prisma.inviteRedemption.findUnique({
      where: { userId },
      include: {
        inviteCode: {
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
            redemptions: {
              orderBy: { redeemedAt: 'desc' },
              take: 1,
              select: {
                email: true,
                redeemedAt: true,
              },
            },
            _count: {
              select: {
                redemptions: true,
              },
            },
          },
        },
      },
    });

    return redemption ? this.toInviteCode(redemption.inviteCode) : null;
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
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : u.createdAt,
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.getTime() : u.updatedAt,
      lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.getTime() : undefined,
      sessionVersion: u.sessionVersion ?? 0,
    };
  }

  private toInviteCode(invite: any): InviteCode {
    const lastRedemption = invite.redemptions?.[0] ?? null;
    return {
      id: invite.id,
      code: decrypt(invite.codeEncrypted),
      note: invite.note ?? null,
      membershipTier: invite.membershipTier ?? 'free',
      maxUses: invite.maxUses ?? 1,
      usedCount: invite._count?.redemptions ?? 0,
      lastUsedAt: lastRedemption?.redeemedAt instanceof Date ? lastRedemption.redeemedAt.getTime() : lastRedemption?.redeemedAt,
      lastUsedByEmail: lastRedemption?.email ?? null,
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

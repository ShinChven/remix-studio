import { PrismaClient } from '@prisma/client';
import type { UserRole } from '../../src/types';
import type { UserRecord } from './auth';

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async createUser(user: UserRecord): Promise<void> {
    const existing = await this.findByEmail(user.email);
    if (existing) throw new Error('Email already exists');

    await this.prisma.user.create({
      data: {
        id: user.sk, // sk was the UUID in DynamoDB
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role ?? 'user',
        storageLimit: BigInt(user.storageLimit ?? 5 * 1024 * 1024 * 1024),
        createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
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

  async listUsers(): Promise<UserRecord[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => {
      const record = this.toRecord(u);
      const { passwordHash: _omit, ...safe } = record;
      return safe as UserRecord;
    });
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async updateStorageLimit(userId: string, limit: number): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { storageLimit: BigInt(limit) } });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async hasAnyUsers(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count > 0;
  }

  private toRecord(u: any): UserRecord {
    return {
      pk: 'USER',
      sk: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      role: u.role as UserRole,
      storageLimit: Number(u.storageLimit),
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : u.createdAt,
    };
  }
}

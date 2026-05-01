import { PrismaClient, SocialAccount, Prisma } from '@prisma/client';

export class SocialAccountRepository {
  constructor(private prisma: PrismaClient) {}

  async getAccount(userId: string, accountId: string): Promise<SocialAccount | null> {
    return this.prisma.socialAccount.findUnique({
      where: {
        id: accountId,
        userId: userId,
      }
    });
  }

  async getAccounts(userId: string): Promise<SocialAccount[]> {
    return this.prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertAccount(
    userId: string,
    platform: string,
    providerAccountId: string,
    data: {
      profileName?: string;
      avatarUrl?: string;
      accessToken: string;
      refreshToken?: string;
      scopes?: any;
      expiresAt?: Date;
      status?: string;
    }
  ): Promise<SocialAccount> {
    return this.prisma.socialAccount.upsert({
      where: {
        userId_platform_accountId: {
          userId,
          platform,
          accountId: providerAccountId,
        },
      },
      update: data,
      create: {
        userId,
        platform,
        accountId: providerAccountId,
        ...data,
      },
    });
  }

  async deleteAccount(userId: string, accountId: string): Promise<void> {
    await this.prisma.socialAccount.deleteMany({
      where: {
        id: accountId,
        userId: userId,
      },
    });
  }
}

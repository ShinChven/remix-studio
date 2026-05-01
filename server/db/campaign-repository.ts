import { PrismaClient, Campaign, Prisma } from '@prisma/client';

export class CampaignRepository {
  constructor(private prisma: PrismaClient) {}

  async getCampaign(userId: string, campaignId: string): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: userId,
      },
      include: {
        socialAccounts: true,
      }
    });
  }

  async getCampaigns(userId: string, status?: string): Promise<Campaign[]> {
    return this.prisma.campaign.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        socialAccounts: true,
        _count: {
          select: { posts: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCampaign(
    userId: string,
    data: { name: string; description?: string; status?: string; socialAccountIds?: string[] }
  ): Promise<Campaign> {
    const { socialAccountIds, ...rest } = data;
    return this.prisma.campaign.create({
      data: {
        ...rest,
        userId,
        ...(socialAccountIds && socialAccountIds.length > 0 ? {
          socialAccounts: {
            connect: socialAccountIds.map(id => ({ id }))
          }
        } : {})
      },
    });
  }

  async updateCampaign(
    userId: string,
    campaignId: string,
    data: { name?: string; description?: string; status?: string; socialAccountIds?: string[] }
  ): Promise<Campaign> {
    const { socialAccountIds, ...rest } = data;
    return this.prisma.campaign.update({
      where: {
        id: campaignId,
        userId: userId, // implicit authorization by ensuring it exists first or catching error, but update where unique might complain. Actually, Prisma allows updateMany for non-uniques.
      },
      data: {
        ...rest,
        ...(socialAccountIds ? {
          socialAccounts: {
            set: socialAccountIds.map(id => ({ id }))
          }
        } : {})
      },
    }).catch(async (e) => {
      // Workaround for `update` needing unique constraint, but we want to ensure userId matches.
      // id is unique. So we can just check if it belongs to user first.
      const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }});
      if (!campaign || campaign.userId !== userId) throw new Error("Campaign not found or unauthorized");
      
      return this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...rest,
          ...(socialAccountIds ? {
            socialAccounts: {
              set: socialAccountIds.map(id => ({ id }))
            }
          } : {})
        },
      });
    });
  }

  async deleteCampaign(userId: string, campaignId: string): Promise<void> {
    await this.prisma.campaign.deleteMany({
      where: {
        id: campaignId,
        userId: userId,
      },
    });
  }
}

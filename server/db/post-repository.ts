import { PrismaClient, Post, PostMedia, PostExecution, Prisma } from '@prisma/client';

export class PostRepository {
  constructor(private prisma: PrismaClient) {}

  async getPost(userId: string, postId: string): Promise<(Post & { media: PostMedia[], executions: PostExecution[] }) | null> {
    return this.prisma.post.findFirst({
      where: {
        id: postId,
        userId: userId,
      },
      include: {
        media: true,
        executions: true,
      }
    });
  }

  async getCampaignPosts(userId: string, campaignId: string): Promise<(Post & { media: PostMedia[], executions: PostExecution[] })[]> {
    return this.prisma.post.findMany({
      where: {
        userId,
        campaignId,
      },
      include: {
        media: true,
        executions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPost(
    userId: string,
    campaignId: string,
    data: { textContent?: string; scheduledAt?: Date; status?: string }
  ): Promise<Post> {
    // Verify campaign belongs to user
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }});
    if (!campaign || campaign.userId !== userId) {
      throw new Error("Campaign not found or unauthorized");
    }

    return this.prisma.post.create({
      data: {
        ...data,
        userId,
        campaignId,
      },
    });
  }

  async updatePost(
    userId: string,
    postId: string,
    data: { textContent?: string; scheduledAt?: Date; status?: string }
  ): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }});
    if (!post || post.userId !== userId) throw new Error("Post not found or unauthorized");

    return this.prisma.post.update({
      where: { id: postId },
      data,
    });
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    await this.prisma.post.deleteMany({
      where: {
        id: postId,
        userId: userId,
      },
    });
  }

  async addMediaToPost(
    userId: string,
    postId: string,
    media: { sourceUrl: string; type: string; quality?: string; mimeType?: string; size?: number; width?: number; height?: number }
  ): Promise<PostMedia> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }});
    if (!post || post.userId !== userId) throw new Error("Post not found or unauthorized");

    return this.prisma.postMedia.create({
      data: {
        ...media,
        postId,
      },
    });
  }
}

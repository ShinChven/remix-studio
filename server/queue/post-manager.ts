import { PrismaClient } from '@prisma/client';
import { SocialChannelFactory } from '../services/social';
import { decrypt, encrypt } from '../utils/crypto';

export class PostManager {
  private fanoutTimer: NodeJS.Timeout | null = null;
  private executionTimer: NodeJS.Timeout | null = null;
  private isFanningOut = false;
  private isExecuting = false;

  constructor(
    private prisma: PrismaClient,
    private storage: any
  ) {}

  start(intervalMs = 60000) {
    if (!this.fanoutTimer) {
      this.fanoutTimer = setInterval(() => this.fanOutPosts(), intervalMs);
    }
    if (!this.executionTimer) {
      this.executionTimer = setInterval(() => this.processExecutions(), intervalMs / 6); // More frequent for queue
    }
  }

  stop() {
    if (this.fanoutTimer) clearInterval(this.fanoutTimer);
    if (this.executionTimer) clearInterval(this.executionTimer);
    this.fanoutTimer = null;
    this.executionTimer = null;
  }

  // 3.4 PostManager Fan-out Trigger
  private async fanOutPosts() {
    if (this.isFanningOut) return;
    this.isFanningOut = true;

    try {
      const posts = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM "Post"
        WHERE status = 'scheduled' AND "scheduledAt" <= NOW()
        FOR UPDATE SKIP LOCKED
        LIMIT 100
      `;

      for (const post of posts) {
        const campaign = await this.prisma.campaign.findUnique({
          where: { id: post.campaignId },
          include: { socialAccounts: true }
        });

        if (!campaign || campaign.socialAccounts.length === 0) {
          await this.prisma.post.update({
            where: { id: post.id },
            data: { status: 'failed' } // No accounts to post to
          });
          continue;
        }

        // Fan out to executions
        for (const account of campaign.socialAccounts) {
          await this.prisma.postExecution.create({
            data: {
              postId: post.id,
              socialAccountId: account.id,
              status: 'pending',
              nextAttemptAt: new Date(),
            }
          });
        }

        await this.prisma.post.update({
          where: { id: post.id },
          data: { status: 'completed' } // Completed fan-out
        });
      }
    } catch (e) {
      console.error('[PostManager] Error in fanOutPosts:', e);
    } finally {
      this.isFanningOut = false;
    }
  }

  // 3.5 PostManager Execution Worker
  private async processExecutions() {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      const executions = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM "PostExecution"
        WHERE status = 'pending' AND "nextAttemptAt" <= NOW()
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      `;

      for (const exec of executions) {
        await this.executePost(exec);
      }
    } catch (e) {
      console.error('[PostManager] Error in processExecutions:', e);
    } finally {
      this.isExecuting = false;
    }
  }

  private async executePost(exec: any) {
    try {
      await this.prisma.postExecution.update({
        where: { id: exec.id },
        data: {
          status: 'publishing',
          attempts: exec.attempts + 1,
          lastAttemptAt: new Date()
        }
      });

      const account = await this.prisma.socialAccount.findUnique({ where: { id: exec.socialAccountId } });
      if (!account) throw new Error('Social Account not found');
      
      const post = await this.prisma.post.findUnique({ where: { id: exec.postId }, include: { media: true } });
      if (!post) throw new Error('Post not found');

      if (post.userId !== account.userId) {
        throw new Error('Tenant isolation mismatch: Post and Social Account belong to different users.');
      }

      const channel = SocialChannelFactory.getChannel(account.platform);
      
      let accessToken = account.accessToken;
      if (accessToken) {
         try {
           accessToken = decrypt(accessToken);
         } catch(e) {} // May not be encrypted in tests yet
      }

      // Check refresh
      if (account.expiresAt && account.expiresAt < new Date() && account.refreshToken) {
        let rt = account.refreshToken;
        try { rt = decrypt(rt); } catch(e) {}
        const tokens = await channel.refreshTokens(rt);
        accessToken = tokens.accessToken;
        
        const encryptedAccessToken = encrypt(tokens.accessToken);
        const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined;
        
        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
             accessToken: encryptedAccessToken,
             refreshToken: encryptedRefreshToken,
             expiresAt: tokens.expiresAt
          }
        });
      }

      const mediaItems = await Promise.all(post.media.map(async (m) => {
        const key = m.processedUrl || m.sourceUrl;
        const buffer = await this.storage.read(key);
        return { buffer, mimeType: m.mimeType || 'image/jpeg' };
      }));
      
      const externalId = await channel.publish(post.textContent || '', mediaItems, { accessToken });

      await this.prisma.postExecution.update({
        where: { id: exec.id },
        data: {
          status: 'posted',
          externalId,
          publishedAt: new Date()
        }
      });

    } catch (e: any) {
      // 3.6 Retry & Backoff Strategy
      console.error(`[PostManager] Error executing post ${exec.id}:`, e);
      
      const maxRetries = 3;
      if (exec.attempts < maxRetries) {
        const backoffMs = [1000, 2500, 5000][exec.attempts] || 5000;
        await this.prisma.postExecution.update({
          where: { id: exec.id },
          data: {
            status: 'pending',
            nextAttemptAt: new Date(Date.now() + backoffMs)
          }
        });
      } else {
        await this.prisma.postExecution.update({
          where: { id: exec.id },
          data: {
            status: 'failed',
            errorMsg: e.message
          }
        });
      }
    }
  }
}

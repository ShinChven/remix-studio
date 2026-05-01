import { PrismaClient } from '@prisma/client';
import { SocialChannelFactory } from '../services/social';
import { decrypt, encrypt } from '../utils/crypto';

export class PostManager {
  private fanoutTimer: NodeJS.Timeout | null = null;
  private executionTimer: NodeJS.Timeout | null = null;
  private isFanningOut = false;
  private isExecuting = false;
  // In-process lock to prevent concurrent refresh races for the same account
  private refreshLocks = new Map<string, Promise<string | null>>();

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

  /**
   * Fans out a single post to its campaign's connected social accounts by
   * creating one PostExecution per account and flipping the post to
   * 'completed'. Atomic via SELECT … FOR UPDATE so the scheduler and a
   * manual /send call can't double-fan-out the same post.
   *
   * Throws on: post not found, no connected accounts, media not yet ready.
   * Returns silently (no executions) if the post was already fanned out.
   */
  /**
   * Fan out a post and immediately execute all resulting executions synchronously.
   * Returns per-account results so callers can report real success/failure.
   */
  async fanOutAndExecute(postId: string): Promise<{ results: Array<{ accountId: string; platform: string; ok: boolean; externalId?: string; error?: string }> }> {
    const { executions } = await this.fanOutPost(postId);

    const results: Array<{ accountId: string; platform: string; ok: boolean; externalId?: string; error?: string }> = [];

    for (const exec of executions) {
      // Run execution and inspect the resulting DB state
      await this.executePost(exec);
      const updated = await this.prisma.postExecution.findUnique({
        where: { id: exec.id },
        include: { socialAccount: true },
      });
      results.push({
        accountId: exec.socialAccountId,
        platform: updated?.socialAccount?.platform ?? 'unknown',
        ok: updated?.status === 'posted',
        externalId: updated?.externalId ?? undefined,
        error: updated?.errorMsg ?? undefined,
      });
    }

    // Set post status based on real execution results
    const anyPosted = results.some((r) => r.ok);
    const allPosted = results.every((r) => r.ok);
    const finalStatus = allPosted ? 'completed' : anyPosted ? 'completed' : 'failed';
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: finalStatus },
    });

    return { results };
  }

  async fanOutPost(postId: string): Promise<{ executions: any[] }> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM "Post" WHERE id = ${postId} FOR UPDATE
      `;
      if (rows.length === 0) {
        throw new Error('Post not found');
      }
      const post = rows[0];


      const media = await tx.postMedia.findMany({ where: { postId: post.id } });
      const notReady = media.filter((m) => m.status !== 'ready');
      if (media.length > 0 && notReady.length > 0) {
        throw new Error('Cannot publish: some media is still processing');
      }

      const campaign = await tx.campaign.findUnique({
        where: { id: post.campaignId },
        include: { socialAccounts: true },
      });

      if (!campaign || campaign.socialAccounts.length === 0) {
        await tx.post.update({
          where: { id: post.id },
          data: { status: 'failed' },
        });
        throw new Error('No social accounts connected to this campaign');
      }

      const executions: any[] = [];
      for (const account of campaign.socialAccounts) {
        const exec = await tx.postExecution.create({
          data: {
            postId: post.id,
            socialAccountId: account.id,
            status: 'pending',
            nextAttemptAt: new Date(),
          },
        });
        executions.push(exec);
      }

      // Mark post as 'queued' so the scheduler doesn't re-pick it on the next tick.
      // fanOutAndExecute() will override this to 'completed'/'failed' based on real results.
      // The async queue path leaves it as 'queued' until all PostExecutions settle.
      await tx.post.update({
        where: { id: post.id },
        data: { status: 'queued' },
      });

      return { executions };
    });
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
        try {
          await this.fanOutPost(post.id);
        } catch (e) {
          console.error(`[PostManager] fanOutPost(${post.id}) failed:`, e);
        }
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
        // After each execution, check if all executions for this post are settled
        // and update the parent Post status accordingly (async queue path)
        await this.settlePostStatus(exec.postId);
      }
    } catch (e) {
      console.error('[PostManager] Error in processExecutions:', e);
    } finally {
      this.isExecuting = false;
    }
  }

  // Update Post status once all its PostExecutions are no longer pending/publishing
  private async settlePostStatus(postId: string) {
    const executions = await this.prisma.postExecution.findMany({ where: { postId } });
    const allSettled = executions.every((e) => e.status === 'posted' || e.status === 'failed');
    if (!allSettled) return; // still executing

    const anyPosted = executions.some((e) => e.status === 'posted');
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: anyPosted ? 'completed' : 'failed' },
    });
  }

  async executePost(exec: any) {
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

      // Proactive refresh: refresh if expired or within 5 minutes of expiry
      const fiveMinutes = 5 * 60 * 1000;
      if (account.expiresAt && account.expiresAt.getTime() - Date.now() < fiveMinutes && account.refreshToken) {
        const refreshed = await this.refreshAccountToken(account, channel);
        if (refreshed) accessToken = refreshed;
      }

      const mediaItems = await Promise.all(post.media.map(async (m) => {
        const key = m.processedUrl || m.sourceUrl;
        const buffer = await this.storage.read(key);
        return { buffer, mimeType: m.mimeType || 'image/jpeg' };
      }));

      let externalId: string;
      try {
        externalId = await channel.publish(post.textContent || '', mediaItems, { accessToken });
      } catch (publishErr: any) {
        // Reactive refresh: if auth failed, refresh token and retry once
        const isAuthError = publishErr.message && (
          publishErr.message.includes('401') ||
          publishErr.message.includes('403') ||
          publishErr.message.includes('Unauthorized') ||
          publishErr.message.includes('Forbidden')
        );
        if (isAuthError && account.refreshToken) {
          console.log(`[PostManager] Auth error on publish, attempting reactive token refresh for account ${account.id}`);
          const refreshed = await this.refreshAccountToken(account, channel, true);
          if (refreshed) {
            accessToken = refreshed;
            externalId = await channel.publish(post.textContent || '', mediaItems, { accessToken });
          } else {
            throw publishErr;
          }
        } else {
          throw publishErr;
        }
      }

      let externalUrl: string | undefined;
      if (externalId) {
        if (account.platform.toLowerCase() === 'twitter' || account.platform.toLowerCase() === 'x') {
          // Fallback generic Twitter status URL if username is unknown.
          externalUrl = `https://twitter.com/i/web/status/${externalId}`;
          // If we have profileName and it looks like a handle, we could use it, but generic is safer.
        } else if (account.platform.toLowerCase() === 'linkedin') {
          // LinkedIn URNs can be tricky, but typically:
          externalUrl = `https://www.linkedin.com/feed/update/${externalId}`;
        }
      }

      await this.prisma.postExecution.update({
        where: { id: exec.id },
        data: {
          status: 'posted',
          externalId,
          externalUrl,
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

  /**
   * Refresh an account's access token. Uses an in-process lock to prevent
   * concurrent refresh races (thundering herd protection, matching pilot-banana).
   * Preserves the old refresh token if X doesn't return a new one.
   */
  private async refreshAccountToken(account: any, channel: any, force = false): Promise<string | null> {
    // If a refresh is already in flight for this account, wait for it
    const existing = this.refreshLocks.get(account.id);
    if (existing) {
      console.log(`[PostManager] Refresh already in flight for account ${account.id}, waiting...`);
      return existing;
    }

    const refreshPromise = (async (): Promise<string | null> => {
      try {
        let rt = account.refreshToken;
        if (!rt) return null;
        try { rt = decrypt(rt); } catch(e) {}

        const tokens = await channel.refreshTokens(rt);

        const encryptedAccessToken = encrypt(tokens.accessToken);
        // Preserve old refresh token if X didn't return a new one (pilot-banana pattern)
        const newRt = tokens.refreshToken ?? rt;
        const encryptedRefreshToken = encrypt(newRt);

        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: tokens.expiresAt,
          },
        });

        console.log(`[PostManager] Token refreshed successfully for account ${account.id}`);
        return tokens.accessToken;
      } catch (err: any) {
        console.error(`[PostManager] Token refresh failed for account ${account.id}:`, err.message);
        return null;
      } finally {
        this.refreshLocks.delete(account.id);
      }
    })();

    this.refreshLocks.set(account.id, refreshPromise);
    return refreshPromise;
  }
}

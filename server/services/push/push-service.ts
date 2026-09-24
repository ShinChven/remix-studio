import { PrismaClient } from '@prisma/client';
import webpush from 'web-push';
import { decrypt, encrypt } from '../../utils/crypto';

const VAPID_SETTING_KEY = 'push.vapid';
const DEFAULT_SUBJECT = 'mailto:admin@localhost';

// Push services drop messages nobody could deliver within this window; a
// "your project finished" notice a day late is noise, not news.
const PUSH_TTL_SECONDS = 60 * 60 * 12;

export interface PushPayload {
  title: string;
  body: string;
  /** Path the notification opens when clicked, e.g. `/project/<id>`. */
  url?: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Web Push delivery through the browser vendors' push services (FCM, Mozilla
 * autopush, Apple). No third-party account is involved: the server signs each
 * request with its own VAPID key pair.
 *
 * Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when both are set.
 * Otherwise a pair is generated once and kept in the database (private key
 * encrypted), so existing subscriptions keep working across restarts.
 */
export class PushService {
  private keysPromise: Promise<VapidKeys | null> | null = null;

  constructor(private prisma: PrismaClient) {}

  async getPublicKey(): Promise<string | null> {
    const keys = await this.loadKeys();
    return keys?.publicKey ?? null;
  }

  async subscribe(userId: string, input: PushSubscriptionInput, userAgent?: string | null) {
    // A browser that re-subscribes keeps its endpoint; if another account
    // signed in on the same browser, the subscription now belongs to this one.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent || null,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async isSubscribed(userId: string, endpoint: string): Promise<boolean> {
    const count = await this.prisma.pushSubscription.count({ where: { userId, endpoint } });
    return count > 0;
  }

  /** Sends to every browser the user subscribed. Returns how many accepted it. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    const keys = await this.loadKeys();
    if (!keys) return 0;

    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return 0;

    const body = JSON.stringify(payload);
    const options = {
      TTL: PUSH_TTL_SECONDS,
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT || DEFAULT_SUBJECT,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      },
    };

    let delivered = 0;
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          options,
        );
        delivered++;
        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});
      } catch (error: any) {
        const status = error?.statusCode;
        // 404/410: the browser dropped the subscription (unsubscribed, cleared
        // site data, uninstalled). It will never work again.
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          return;
        }
        console.error(`[PushService] Delivery failed (status=${status ?? 'n/a'}) for user ${userId}:`, error?.body || error?.message || error);
      }
    }));
    return delivered;
  }

  private loadKeys(): Promise<VapidKeys | null> {
    if (!this.keysPromise) {
      this.keysPromise = this.resolveKeys().catch((error) => {
        console.error('[PushService] Web Push disabled, could not load VAPID keys:', error?.message || error);
        // Allow a later call to retry instead of caching the failure forever.
        this.keysPromise = null;
        return null;
      });
    }
    return this.keysPromise;
  }

  private async resolveKeys(): Promise<VapidKeys> {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate };

    const stored = await this.prisma.systemSetting.findUnique({ where: { key: VAPID_SETTING_KEY } });
    if (stored) {
      const parsed = JSON.parse(stored.value) as { publicKey: string; privateKey: string };
      return { publicKey: parsed.publicKey, privateKey: decrypt(parsed.privateKey) };
    }

    const generated = webpush.generateVAPIDKeys();
    const value = JSON.stringify({ publicKey: generated.publicKey, privateKey: encrypt(generated.privateKey) });
    // Two instances starting together may both generate; whichever row lands
    // first wins and both read it back, so they sign with the same pair.
    await this.prisma.systemSetting.upsert({
      where: { key: VAPID_SETTING_KEY },
      create: { key: VAPID_SETTING_KEY, value },
      update: {},
    });
    const saved = await this.prisma.systemSetting.findUniqueOrThrow({ where: { key: VAPID_SETTING_KEY } });
    const parsed = JSON.parse(saved.value) as { publicKey: string; privateKey: string };
    console.log('[PushService] Generated and stored a VAPID key pair for Web Push.');
    return { publicKey: parsed.publicKey, privateKey: decrypt(parsed.privateKey) };
  }
}

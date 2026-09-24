import { deletePushSubscription, fetchPushConfig, savePushSubscription } from '../api';

export type PushSupport =
  | 'supported'
  // iOS/iPadOS only offer Web Push to a site added to the Home Screen.
  | 'needs-install'
  | 'unsupported';

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac but has a touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function getPushSupport(): PushSupport {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'needs-install';
  return hasApis && window.isSecureContext ? 'supported' : 'unsupported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (getPushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

function toPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
  };
}

/**
 * Asks for permission (must run from a user gesture), subscribes this browser
 * and registers the subscription with the server.
 */
export async function enablePushNotifications(): Promise<'enabled' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const config = await fetchPushConfig();
  if (!config.enabled || !config.publicKey) {
    throw new Error('Push notifications are not available on this server.');
  }

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
  let subscription = await registration.pushManager.getSubscription();

  // A subscription made with a different server key (keys rotated) cannot be
  // reused; replace it.
  if (subscription) {
    const current = subscription.options.applicationServerKey;
    const currentBytes = current ? new Uint8Array(current) : null;
    const matches = currentBytes
      && currentBytes.length === applicationServerKey.length
      && currentBytes.every((byte, i) => byte === applicationServerKey[i]);
    if (!matches) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  await savePushSubscription(toPayload(subscription));
  return 'enabled';
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  await deletePushSubscription(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

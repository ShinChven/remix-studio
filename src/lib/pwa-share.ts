export const PWA_SHARE_SESSION_KEY = '__remix_pwa_share_handoff';

const HANDOFF_CACHE = 'remix-studio-share-handoff-v1';
const HANDOFF_BLOB_KEY = '/__share-handoff/payload';

export type PwaShareHandoff = {
  type: 'text' | 'image';
  data: string;
  name?: string;
};

export type PwaShareHandoffInput =
  | { type: 'text'; data: string }
  | { type: 'image'; blob: Blob; name?: string };

type StoredHandoff =
  | { type: 'text'; data: string; name?: string }
  | { type: 'image'; ref: 'cache'; name?: string }
  | { type: 'image'; data: string; name?: string };

// The payload is consumed on mount, and a mount can happen more than once for
// the same navigation (a remount while auth resolves, React's double-invoked
// effects in development). Remembering what was read keeps the second caller
// from finding an emptied slot.
let consumed: { value: PwaShareHandoff | null } | null = null;
let inFlight: Promise<PwaShareHandoff | null> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read shared image'));
    reader.readAsDataURL(blob);
  });
}

function writeSession(payload: StoredHandoff): boolean {
  try {
    sessionStorage.setItem(PWA_SHARE_SESSION_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Hands a shared payload to the page that will act on it. Images travel
 * through the Cache API rather than sessionStorage: a photo shared from an
 * Android gallery is routinely several megabytes, and base64 in a ~5MB session
 * quota fails well before that.
 */
export async function stashPwaShareHandoff(payload: PwaShareHandoffInput): Promise<boolean> {
  if (payload.type === 'text') {
    return writeSession({ type: 'text', data: payload.data });
  }

  if ('caches' in window) {
    try {
      const cache = await caches.open(HANDOFF_CACHE);
      await cache.put(
        HANDOFF_BLOB_KEY,
        new Response(payload.blob, {
          headers: { 'Content-Type': payload.blob.type || 'application/octet-stream' },
        }),
      );
      if (writeSession({ type: 'image', ref: 'cache', name: payload.name })) return true;
      await cache.delete(HANDOFF_BLOB_KEY);
    } catch {
      // Fall through to the inline copy below.
    }
  }

  try {
    const dataUrl = await blobToDataUrl(payload.blob);
    return writeSession({ type: 'image', data: dataUrl, name: payload.name });
  } catch {
    return false;
  }
}

async function readHandoff(): Promise<PwaShareHandoff | null> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PWA_SHARE_SESSION_KEY);
    if (raw) sessionStorage.removeItem(PWA_SHARE_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: StoredHandoff;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed?.type === 'text') {
    return typeof parsed.data === 'string' ? { type: 'text', data: parsed.data } : null;
  }
  if (parsed?.type !== 'image') return null;

  if ('data' in parsed && typeof parsed.data === 'string') {
    return { type: 'image', data: parsed.data, name: parsed.name };
  }

  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(HANDOFF_CACHE);
    const res = await cache.match(HANDOFF_BLOB_KEY);
    if (!res) return null;
    const dataUrl = await blobToDataUrl(await res.blob());
    await cache.delete(HANDOFF_BLOB_KEY);
    return { type: 'image', data: dataUrl, name: parsed.name };
  } catch {
    return null;
  }
}

export function consumePwaShareHandoff(): Promise<PwaShareHandoff | null> {
  if (consumed) return Promise.resolve(consumed.value);
  if (!inFlight) {
    inFlight = readHandoff()
      .then((value) => {
        consumed = { value };
        return value;
      })
      .catch(() => {
        consumed = { value: null };
        return null;
      });
  }
  return inFlight;
}

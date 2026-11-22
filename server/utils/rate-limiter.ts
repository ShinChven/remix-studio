type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  bucket: string;
  keyParts: Array<string | number | null | undefined>;
  maxAttempts: number;
  windowMs: number;
};

type RateLimitKey = Pick<RateLimitOptions, 'bucket' | 'keyParts'>;

const PRUNE_INTERVAL_MS = 60_000;

const rateLimitBuckets = new Map<string, Map<string, RateLimitEntry>>();

function getBucket(bucket: string) {
  let store = rateLimitBuckets.get(bucket);
  if (!store) {
    store = new Map<string, RateLimitEntry>();
    rateLimitBuckets.set(bucket, store);
  }
  return store;
}

function buildRateLimitKey(parts: RateLimitOptions['keyParts']) {
  return parts
    .map((part) => String(part ?? 'unknown').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

/** Drops windows that have ended, so keys an attacker never reuses do not pile up. */
export function pruneRateLimits(now = Date.now()) {
  for (const [bucket, store] of rateLimitBuckets) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
    if (store.size === 0) rateLimitBuckets.delete(bucket);
  }
}

setInterval(() => pruneRateLimits(), PRUNE_INTERVAL_MS).unref();

/**
 * How many reverse proxies sit in front of the app. `TRUST_PROXY` takes a hop
 * count; `true` and `yes` mean one hop. Anything else trusts no proxy.
 */
function trustedProxyHops() {
  const value = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (value === 'true' || value === 'yes') return 1;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/**
 * The client address as reported by the trusted proxies. Each proxy appends
 * the address it received the request from to `X-Forwarded-For`, so the
 * client's address is the entry the outermost trusted proxy added: the Nth from
 * the end for N hops. Entries before it were sent by the client and can be
 * anything, so they are never read.
 */
export function getClientAddress(req: Request): string {
  const hops = trustedProxyHops();
  if (hops === 0) return 'direct';

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const entries = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const address = entries[entries.length - hops];
    if (address) return address;
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  return realIp || 'proxied-unknown';
}

/** Whether `getClientAddress` returned a real address rather than a placeholder. */
export function isKnownClientAddress(address: string) {
  return address !== 'direct' && address !== 'proxied-unknown';
}

export function checkRateLimit(options: RateLimitOptions): boolean {
  const now = Date.now();
  const store = getBucket(options.bucket);
  const key = buildRateLimitKey(options.keyParts);
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }

  if (entry.count >= options.maxAttempts) return false;

  entry.count += 1;
  return true;
}

/**
 * Forgets the attempts counted under a key. Call it after an attempt succeeds,
 * so a bucket ends up counting only failures. Counting the attempt before the
 * check and clearing it on success keeps concurrent guesses from slipping past
 * the limit while a slow password hash is still running.
 */
export function resetRateLimit(options: RateLimitKey) {
  rateLimitBuckets.get(options.bucket)?.delete(buildRateLimitKey(options.keyParts));
}

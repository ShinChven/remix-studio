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

function shouldTrustProxy() {
  const value = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function getClientAddress(req: Request): string {
  if (!shouldTrustProxy()) return 'direct';

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);
    if (first) return first;
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  return realIp || 'proxied-unknown';
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

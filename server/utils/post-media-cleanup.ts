import { S3Storage } from '../storage/s3-storage';

type PostMediaLike = {
  sourceUrl?: string | null;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
};

type CleanupScope = {
  userId: string;
  campaignId: string;
  postId?: string;
};

export function safeStorageKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function stripToStorageKey(value: string | null | undefined, bucket: string): string | undefined {
  if (!value || value.startsWith('data:')) return undefined;
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    const pathStylePrefix = `/${bucket}/`;
    if (url.pathname.startsWith(pathStylePrefix)) {
      return decodeURIComponent(url.pathname.slice(pathStylePrefix.length));
    }
    if (url.hostname.startsWith(`${bucket}.`)) {
      return decodeURIComponent(url.pathname.slice(1));
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isCampaignOwnedKey(key: string, scope: CleanupScope): boolean {
  const safeCampaignId = safeStorageKeyPart(scope.campaignId);
  const newPrefix = scope.postId
    ? `campaigns/${safeCampaignId}/posts/${scope.postId}/`
    : `campaigns/${safeCampaignId}/`;
  const legacyPrefix = `${scope.userId}/${safeCampaignId}/`;

  return key.startsWith(newPrefix) || key.startsWith(legacyPrefix);
}

export function collectPostMediaStorageKeys(
  mediaItems: PostMediaLike[],
  storage: S3Storage,
  scope: CleanupScope,
): string[] {
  const keys = new Set<string>();
  const bucket = storage.getBucketName();

  for (const media of mediaItems) {
    for (const value of [media.sourceUrl, media.processedUrl, media.thumbnailUrl]) {
      const key = stripToStorageKey(value, bucket);
      if (!key || !isCampaignOwnedKey(key, scope)) continue;
      keys.add(key);
    }
  }

  return Array.from(keys);
}

export async function deleteStorageKeys(storage: S3Storage, keys: string[], logPrefix: string): Promise<void> {
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (error) {
      console.warn(`${logPrefix} Failed to delete ${key}:`, error);
    }
  }
}

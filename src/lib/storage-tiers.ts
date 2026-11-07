export const GIGABYTE = 1024 ** 3;
const TERABYTE = 1024 * GIGABYTE;

export const STORAGE_TIERS = [
  { key: 'free', name: 'Free', bytes: 5 * GIGABYTE },
  { key: 'professional', name: 'Professional', bytes: 100 * GIGABYTE },
  { key: 'premium', name: 'Premium', bytes: 500 * GIGABYTE },
  { key: 'ultra', name: 'Ultra', bytes: TERABYTE },
  { key: 'max', name: 'Max', bytes: 2 * TERABYTE },
] as const;

type StorageTier = (typeof STORAGE_TIERS)[number];
export type StorageTierKey = StorageTier['key'];
export const FREE_STORAGE_TIER = STORAGE_TIERS[0];

export function storageTierForKey(key: unknown): StorageTier {
  return STORAGE_TIERS.find((tier) => tier.key === key) ?? FREE_STORAGE_TIER;
}

export function storageTierForLimit(limit: number | undefined, tolerance = 0): StorageTier | undefined {
  return STORAGE_TIERS.find((tier) => Math.abs(tier.bytes - (limit ?? 0)) <= tolerance);
}

export function formatStorageTierOption({ name, bytes }: StorageTier): string {
  const size = bytes >= TERABYTE ? `${bytes / TERABYTE} TB` : `${bytes / GIGABYTE} GB`;
  return `${name} (${size})`;
}

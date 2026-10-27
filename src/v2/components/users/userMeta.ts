import type { MaterialShapeName } from '../../../m3';

const GB = 1024 ** 3;

/** Storage tiers an admin can give an account; they match the invite membership tiers. */
export const STORAGE_TIERS = [
  { key: 'free', bytes: 5 * GB },
  { key: 'professional', bytes: 100 * GB },
  { key: 'premium', bytes: 500 * GB },
] as const;

export type StorageTierKey = (typeof STORAGE_TIERS)[number]['key'];

/** The tier a limit belongs to, or null for a custom limit. */
export function tierOf(limit: number | undefined): StorageTierKey | null {
  return STORAGE_TIERS.find((tier) => Math.abs(tier.bytes - (limit || 0)) < 1000)?.key ?? null;
}

export const GIGABYTE = GB;

/** Share of the limit in use, from 0 to 1. */
export function usageRatio(used: number, limit: number | undefined): number {
  return limit && limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
}

/** Tone of a usage meter: calm, nearly full, or full. */
export function usageTone(ratio: number): 'normal' | 'warning' | 'error' {
  return ratio >= 0.95 ? 'error' : ratio >= 0.8 ? 'warning' : 'normal';
}

const AVATAR_SHAPES: MaterialShapeName[] = ['cookie-9', 'clover-4', 'sunny', 'puffy', 'flower', 'gem', 'cookie-6', 'soft-burst', 'pentagon', 'arch', 'clamshell', 'puffy-diamond'];
const AVATAR_TONES = ['primary', 'secondary', 'tertiary'] as const;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable shape and color for an account, so the same person looks the same everywhere. */
export function avatarStyle(id: string): { shape: MaterialShapeName; tone: (typeof AVATAR_TONES)[number] } {
  const h = hash(id);
  return { shape: AVATAR_SHAPES[h % AVATAR_SHAPES.length], tone: AVATAR_TONES[(h >>> 8) % AVATAR_TONES.length] };
}

/** The part of an email before the @, for initials and short labels. */
export function emailName(email: string): string {
  return email.split('@')[0] || email;
}

/** "3 hours ago", "yesterday", in the interface language. */
export function relativeTime(value: number | undefined, locale: string): string {
  if (!value) return '';
  const seconds = (value - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

/** A random password of letters, digits and symbols, without look-alike characters. */
export function generatePassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

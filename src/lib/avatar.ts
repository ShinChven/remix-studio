const AVATAR_COLORS = [
  { bg: '#0f766e', fg: '#f0fdfa', accent: '#14b8a6' },
  { bg: '#1d4ed8', fg: '#eff6ff', accent: '#60a5fa' },
  { bg: '#7c2d12', fg: '#fff7ed', accent: '#fb923c' },
  { bg: '#6d28d9', fg: '#faf5ff', accent: '#a78bfa' },
  { bg: '#be123c', fg: '#fff1f2', accent: '#fb7185' },
  { bg: '#334155', fg: '#f8fafc', accent: '#94a3b8' },
] as const;

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return hash >>> 0;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function avatarInitials(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'RS';

  const parts = trimmed.split(/[\s._@-]+/).filter(Boolean);
  const chars = parts.length > 1
    ? parts.slice(0, 2).map((part) => Array.from(part)[0])
    : Array.from(parts[0] || trimmed).slice(0, 2);

  return chars.join('').toUpperCase() || 'RS';
}

export function defaultAvatar(seed?: string | null, label?: string | null) {
  const normalizedSeed = (seed || label || 'account').trim() || 'account';
  const displayLabel = (label || normalizedSeed).trim();
  const colors = AVATAR_COLORS[hashString(normalizedSeed) % AVATAR_COLORS.length];
  const initials = escapeXml(avatarInitials(displayLabel));

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">',
    `<rect width="96" height="96" fill="${colors.bg}"/>`,
    `<path d="M0 72C22 52 38 72 58 50C72 35 84 30 96 32V96H0Z" fill="${colors.accent}" opacity="0.35"/>`,
    `<circle cx="73" cy="22" r="18" fill="${colors.accent}" opacity="0.22"/>`,
    `<text x="48" y="51" text-anchor="middle" dominant-baseline="middle" font-family="Inter, ui-sans-serif, system-ui, Arial, sans-serif" font-size="34" font-weight="800" fill="${colors.fg}">${initials}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function applyAvatarFallback(target: HTMLImageElement, seed?: string | null, label?: string | null) {
  const fallback = defaultAvatar(seed, label);
  if (target.getAttribute('src') === fallback || target.currentSrc === fallback || target.src === fallback) {
    return false;
  }
  target.src = fallback;
  return true;
}

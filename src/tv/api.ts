/** The TV mode API, authenticated with the device token from pairing. */

export type MediaKind = 'image' | 'video' | 'audio';

export interface TvFolder {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  latestAt: number;
  coverUrl: string | null;
}

export interface TvItem {
  id: string;
  projectId: string;
  kind: MediaKind;
  title: string;
  prompt: string | null;
  mimeType: string;
  displayUrl: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  createdAt: number;
  duration: number | null;
  aspectRatio: string | null;
  tags: string[];
}

export interface ItemPage {
  items: TvItem[];
  total: number;
  offset: number;
}

export interface PairingStart {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  interval: number;
  linkUrl: string;
  qrSvg: string;
}

const TOKEN_KEY = 'remixStudioTvToken';

export class UnauthorizedError extends Error {}

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (e) {
    // Private mode or storage disabled: the TV links again next time.
  }
}

export function getToken(): string | null {
  return storageGet(TOKEN_KEY);
}

export function setToken(token: string | null) {
  storageSet(TOKEN_KEY, token);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers, credentials: 'omit' });
  if (res.status === 401) throw new UnauthorizedError('Unauthorized');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function query(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value !== undefined && value !== '') parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const api = {
  startPairing: () =>
    request<PairingStart>('/api/tv/pair/start', { method: 'POST', body: JSON.stringify({ origin: window.location.origin }) }),

  /** Resolves to the token once approved, null while pending; throws 'expired' or 'denied'. */
  async pollPairing(deviceCode: string): Promise<{ token: string; deviceName: string } | null> {
    const res = await fetch('/api/tv/pair/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
      credentials: 'omit',
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 410) throw new Error('expired');
    if (res.status === 403) throw new Error('denied');
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return body.status === 'approved' ? { token: body.token, deviceName: body.deviceName } : null;
  },

  session: () => request<{ deviceId: string; deviceName: string }>('/api/tv/session'),
  logout: () => request<{ success: boolean }>('/api/tv/logout', { method: 'POST', body: '{}' }),
  folders: () => request<{ folders: TvFolder[] }>('/api/tv/folders'),
  folder: (id: string) => request<{ folder: TvFolder; tags: { tag: string; count: number }[] }>(`/api/tv/folders/${encodeURIComponent(id)}`),

  items(folderId: string, opts: { offset: number; limit: number; kind?: MediaKind; tag?: string; order?: 'newest' | 'oldest' }) {
    const q = query({ offset: opts.offset, limit: opts.limit, kind: opts.kind, tag: opts.tag, order: opts.order });
    return folderId === 'recent'
      ? request<ItemPage>(`/api/tv/recent${q}`)
      : request<ItemPage>(`/api/tv/folders/${encodeURIComponent(folderId)}/items${q}`);
  },
};

export interface TvSettings {
  intervalSeconds: number;
  order: 'newest' | 'oldest';
  captions: boolean;
}

const SETTINGS_KEY = 'remixStudioTvSettings';

export function loadSettings(): TvSettings {
  const defaults: TvSettings = { intervalSeconds: 8, order: 'newest', captions: true };
  try {
    const raw = storageGet(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      intervalSeconds: [3, 5, 8, 15, 30].indexOf(parsed.intervalSeconds) >= 0 ? parsed.intervalSeconds : defaults.intervalSeconds,
      order: parsed.order === 'oldest' ? 'oldest' : 'newest',
      captions: parsed.captions !== false,
    };
  } catch (e) {
    return defaults;
  }
}

export function saveSettings(settings: TvSettings) {
  storageSet(SETTINGS_KEY, JSON.stringify(settings));
}

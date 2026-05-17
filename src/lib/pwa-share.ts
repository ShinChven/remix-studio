export const PWA_SHARE_SESSION_KEY = '__remix_pwa_share_handoff';

export type PwaShareHandoff = {
  type: 'text' | 'image';
  data: string;
  name?: string;
};

export function stashPwaShareHandoff(payload: PwaShareHandoff): boolean {
  try {
    sessionStorage.setItem(PWA_SHARE_SESSION_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumePwaShareHandoff(): PwaShareHandoff | null {
  try {
    const raw = sessionStorage.getItem(PWA_SHARE_SESSION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PWA_SHARE_SESSION_KEY);
    const parsed = JSON.parse(raw);
    if (parsed?.type !== 'text' && parsed?.type !== 'image') return null;
    if (typeof parsed.data !== 'string') return null;
    return parsed as PwaShareHandoff;
  } catch {
    return null;
  }
}

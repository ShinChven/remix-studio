export type MediaPickerSourceKind = 'library' | 'album';

export interface MediaPickerSourceMemory {
  kind: MediaPickerSourceKind;
  sourceId: string;
}

const STORAGE_PREFIX = 'media_picker_last_source:';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`;
}

export function getLastMediaPickerSource(scope: string): MediaPickerSourceMemory | null {
  if (!canUseStorage() || !scope) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MediaPickerSourceMemory>;
    if (parsed?.kind !== 'library' && parsed?.kind !== 'album') return null;
    if (typeof parsed.sourceId !== 'string' || !parsed.sourceId) return null;
    return { kind: parsed.kind, sourceId: parsed.sourceId };
  } catch {
    return null;
  }
}

export function setLastMediaPickerSource(scope: string, memory: MediaPickerSourceMemory) {
  if (!canUseStorage() || !scope || !memory.sourceId) return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(memory));
  } catch {
    // Ignore quota or privacy-mode failures; remembering the source is best effort.
  }
}

import type { MaterialShapeName } from '../../m3';

/** Media kinds of libraries and projects, with the icon, color roles and shape that mark them. */
export interface KindMeta {
  icon: string;
  /** Container + on-container utility classes. */
  tone: string;
  /** Accent text color utility class. */
  accent: string;
  shape: MaterialShapeName;
  /** One notch of the shape in degrees: turning by it lands on the same silhouette. */
  turn: number;
}

const KINDS: Record<string, KindMeta> = {
  text: { icon: 'notes', tone: 'bg-primary-container text-on-primary-container', accent: 'text-primary', shape: 'cookie-4', turn: 90 },
  image: { icon: 'image', tone: 'bg-tertiary-container text-on-tertiary-container', accent: 'text-tertiary', shape: 'clover-4', turn: 90 },
  video: { icon: 'movie', tone: 'bg-secondary-container text-on-secondary-container', accent: 'text-secondary', shape: 'sunny', turn: 45 },
  audio: { icon: 'music_note', tone: 'bg-success-container text-on-success-container', accent: 'text-success', shape: 'soft-burst', turn: 36 },
  comfyui: { icon: 'account_tree', tone: 'bg-warning-container text-on-warning-container', accent: 'text-warning', shape: 'puffy-diamond', turn: 90 },
  civitai: { icon: 'hexagon', tone: 'bg-surface-container-highest text-primary', accent: 'text-primary', shape: 'pentagon', turn: 72 },
};

export function kindMeta(kind: string | undefined): KindMeta {
  return KINDS[kind ?? 'text'] ?? KINDS.text;
}

/** Stable numeric seed from an id, for generated artwork. */
export function seedOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(31, hash) + id.charCodeAt(i)) >>> 0;
  return hash % 9973;
}

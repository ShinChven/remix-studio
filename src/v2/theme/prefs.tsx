import {
  argbFromHex,
  customColor,
  hexFromArgb,
  sourceColorFromImage,
} from '@material/material-color-utilities';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { isHexColor, useTheme, type ThemeMode } from '../../m3';

/** Layout preferences of the new UI that sit beside the M3 color and motion settings. */
export interface UiPrefs {
  /** Global density. Busy pages also opt their own regions into `compact`. */
  density: 'comfortable' | 'compact';
  /** Multiplier for the M3 corner scale (0 = square, 1 = spec, 1.5 = extra round). */
  cornerScale: number;
  /** Root font size multiplier; the M3 type scale is in rem, so everything follows. */
  fontScale: number;
  /** Seed for the success and warning roles, harmonized with the theme seed. */
  successSeed: string;
  warningSeed: string;
  /** Translucent bars and rail with a backdrop blur (shared with the classic UI). */
  glass: boolean;
  /** Cards lift on hover (shared with the classic UI). */
  motion: boolean;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  density: 'comfortable',
  cornerScale: 1,
  fontScale: 1,
  successSeed: '#2E7D32',
  warningSeed: '#B26A00',
  glass: true,
  motion: true,
};

/** Keys the classic UI also reads, so both interfaces keep the same choice. */
const GLASS_KEY = 'glass';
const MOTION_KEY = 'motion';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}

export const DEFAULT_SEED = '#4F46E5';
export const THEME_STORAGE_KEY = 'v2-m3-theme';
const PREFS_STORAGE_KEY = 'v2-ui-prefs';
const CUSTOM_STYLE_ID = 'v2-custom-colors';
const SHAPE_STYLE_ID = 'v2-shape-scale';

const CORNERS: Array<[string, number]> = [
  ['extra-small', 4],
  ['small', 8],
  ['medium', 12],
  ['large', 16],
  ['large-increased', 20],
  ['extra-large', 28],
  ['extra-large-increased', 32],
  ['extra-extra-large', 48],
];

function readPrefs(): UiPrefs {
  const flags = { glass: readFlag(GLASS_KEY), motion: readFlag(MOTION_KEY) };
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFS, ...flags };
    const saved = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
      cornerScale: typeof saved.cornerScale === 'number' ? saved.cornerScale : 1,
      fontScale: typeof saved.fontScale === 'number' ? saved.fontScale : 1,
      successSeed: typeof saved.successSeed === 'string' && isHexColor(saved.successSeed) ? saved.successSeed : DEFAULT_UI_PREFS.successSeed,
      warningSeed: typeof saved.warningSeed === 'string' && isHexColor(saved.warningSeed) ? saved.warningSeed : DEFAULT_UI_PREFS.warningSeed,
      ...flags,
    };
  } catch {
    return { ...DEFAULT_UI_PREFS, ...flags };
  }
}

function upsertStyle(id: string, css: string) {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/** CSS for the extended `success` and `warning` roles, harmonized with the theme seed. */
function customColorCss(seed: string, success: string, warning: string): string {
  const source = argbFromHex(isHexColor(seed) ? seed : DEFAULT_SEED);
  const decls = (dark: boolean) =>
    (
      [
        ['success', success],
        ['warning', warning],
      ] as const
    )
      .map(([name, value]) => {
        const group = customColor(source, { name, value: argbFromHex(value), blend: true });
        const scheme = dark ? group.dark : group.light;
        return [
          `--v2-color-${name}:${hexFromArgb(scheme.color)};`,
          `--v2-color-on-${name}:${hexFromArgb(scheme.onColor)};`,
          `--v2-color-${name}-container:${hexFromArgb(scheme.colorContainer)};`,
          `--v2-color-on-${name}-container:${hexFromArgb(scheme.onColorContainer)};`,
        ].join('');
      })
      .join('');
  const light = decls(false);
  const dark = decls(true);
  return (
    `:root{${light}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-m3-theme="light"]){${dark}}}` +
    `:root[data-m3-theme="dark"]{${dark}}`
  );
}

interface UiPrefsContextValue extends UiPrefs {
  setPrefs: (patch: Partial<UiPrefs>) => void;
  resetPrefs: () => void;
}

const UiPrefsContext = createContext<UiPrefsContextValue | null>(null);

/** Applies and persists the layout preferences and the extended color roles. */
export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<UiPrefs>(readPrefs);
  const { seed } = useTheme();

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Preferences still apply for this visit.
    }
  }, [prefs]);

  useEffect(() => {
    document.documentElement.dataset.density = prefs.density;
  }, [prefs.density]);

  useEffect(() => {
    document.documentElement.dataset.glass = prefs.glass ? 'on' : 'off';
    document.documentElement.dataset.motion = prefs.motion ? 'on' : 'off';
    try {
      localStorage.setItem(GLASS_KEY, prefs.glass ? 'on' : 'off');
      localStorage.setItem(MOTION_KEY, prefs.motion ? 'on' : 'off');
    } catch {
      // The flags still apply for this visit.
    }
  }, [prefs.glass, prefs.motion]);

  useEffect(() => {
    document.documentElement.style.fontSize = prefs.fontScale === 1 ? '' : `${prefs.fontScale * 100}%`;
  }, [prefs.fontScale]);

  useEffect(() => {
    const scale = prefs.cornerScale;
    const css =
      scale === 1
        ? ''
        : `:root{${CORNERS.map(([name, px]) => `--md-sys-shape-corner-${name}:${Math.round(px * scale)}px;`).join('')}}`;
    upsertStyle(SHAPE_STYLE_ID, css);
  }, [prefs.cornerScale]);

  useEffect(() => {
    try {
      upsertStyle(CUSTOM_STYLE_ID, customColorCss(seed, prefs.successSeed, prefs.warningSeed));
    } catch {
      upsertStyle(CUSTOM_STYLE_ID, customColorCss(DEFAULT_SEED, DEFAULT_UI_PREFS.successSeed, DEFAULT_UI_PREFS.warningSeed));
    }
  }, [seed, prefs.successSeed, prefs.warningSeed]);

  const value = useMemo<UiPrefsContextValue>(
    () => ({
      ...prefs,
      setPrefs: (patch) => setPrefsState((prev) => ({ ...prev, ...patch })),
      resetPrefs: () => setPrefsState((prev) => ({ ...DEFAULT_UI_PREFS, glass: prev.glass, motion: prev.motion })),
    }),
    [prefs],
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export function useUiPrefs(): UiPrefsContextValue {
  const value = useContext(UiPrefsContext);
  if (!value) throw new Error('useUiPrefs() must be used inside <UiPrefsProvider>');
  return value;
}

/** Extracts the dominant color of an image file, for seeding the theme from a picture. */
export async function seedFromImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return hexFromArgb(await sourceColorFromImage(image));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Changes the color mode with a circular reveal from the pointer, where view transitions are
 * available and motion is allowed.
 */
export function setModeWithReveal(
  setMode: (mode: ThemeMode) => void,
  mode: ThemeMode,
  origin?: { clientX: number; clientY: number },
) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced || !origin) {
    setMode(mode);
    return;
  }
  const { clientX: x, clientY: y } = origin;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => flushSync(() => setMode(mode)));
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 500, easing: 'cubic-bezier(0.2, 0, 0, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

import {
  type CSSProperties,
  createContext,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { cx, useIsoLayoutEffect, useMediaQuery } from '../utils/hooks'
import { PortalContainerProvider } from '../utils/portal'
import type { MotionScheme } from '../utils/spring'
import { ATTRIBUTE, MOTION_ATTRIBUTE, STYLE_ID } from './initScript'
import {
  BASELINE_SEED,
  createScheme,
  createThemeCss,
  isHexColor,
  type SchemeVariant,
  schemeToStyle,
} from './scheme'

/** Color mode: always light, always dark, or follow the system setting. */
export type ThemeMode = 'light' | 'dark' | 'system'

/** Color and motion settings that `ThemeProvider` applies and saves. */
export interface ThemeConfig {
  /** Seed (source) color as a hex string, e.g. `#6750A4`. */
  seed: string
  /** Scheme variant that turns the seed into tonal palettes. */
  variant: SchemeVariant
  /** -1 to 1, or `'auto'` to follow the `prefers-contrast` media query. */
  contrast: number | 'auto'
  /** Motion scheme: `expressive` (springs that overshoot) or `standard` (calmer). */
  motionScheme: MotionScheme
}

/** What `useTheme()` returns: the current settings and functions that change them. */
export interface ThemeContextValue extends ThemeConfig {
  /** The chosen mode. It can be `system`. */
  mode: ThemeMode
  /** The mode in effect after resolving `system`. */
  resolvedMode: 'light' | 'dark'
  /** Changes the mode and saves it. */
  setMode: (mode: ThemeMode) => void
  /** Merges the given color settings into the current ones and saves them. */
  setConfig: (config: Partial<ThemeConfig>) => void
  /** Restores `defaultConfig` and `defaultMode`. */
  reset: () => void
}

/** Settings used when nothing is saved and no `defaultConfig` is given. */
export const DEFAULT_THEME: ThemeConfig = {
  seed: BASELINE_SEED,
  variant: 'tonal-spot',
  contrast: 'auto',
  motionScheme: 'expressive',
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw as T
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Keeps the known settings of a saved configuration. Settings this package no longer has (such
 * as the `spec` of the 2021/2025 color spec switch) are dropped; everything else is kept.
 */
export function migrateThemeConfig(saved: unknown): Partial<ThemeConfig> {
  if (!saved || typeof saved !== 'object') return {}
  const { seed, variant, contrast, motionScheme } = saved as Record<string, unknown>
  const out: Partial<ThemeConfig> = {}
  if (typeof seed === 'string') out.seed = seed
  if (typeof variant === 'string') out.variant = variant as SchemeVariant
  if (typeof contrast === 'number' || contrast === 'auto') out.contrast = contrast
  if (motionScheme === 'expressive' || motionScheme === 'standard') out.motionScheme = motionScheme
  return out
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode, blocked site data): the theme still works.
  }
}

export interface ThemeProviderProps {
  /** The app. */
  children: ReactNode
  /** Mode used until the user chooses one. */
  defaultMode?: ThemeMode
  /** Color settings used until the user changes them. Merged over `DEFAULT_THEME`. */
  defaultConfig?: Partial<ThemeConfig>
  /** localStorage key prefix. Set to `null` to disable persistence. */
  storageKey?: string | null
}

/**
 * Applies a dynamic M3 Expressive color scheme and motion scheme to the document and persists the
 * user's choices.
 * Pair with `themeInitScript()` in the HTML head to avoid a flash of the default theme.
 */
export function ThemeProvider({
  children,
  defaultMode = 'system',
  defaultConfig,
  storageKey = 'm3-theme',
}: ThemeProviderProps) {
  const initialConfig = { ...DEFAULT_THEME, ...defaultConfig }
  const [mode, setModeState] = useState<ThemeMode>(
    () => (storageKey && read<ThemeMode>(`${storageKey}:mode`)) || defaultMode,
  )
  const [config, setConfigState] = useState<ThemeConfig>(() => ({
    ...initialConfig,
    ...(storageKey ? migrateThemeConfig(read(`${storageKey}:config`)) : null),
  }))
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolvedMode = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  const { seed, variant, contrast, motionScheme } = config
  const css = useMemo(() => {
    try {
      return createThemeCss({ seed, variant, contrast })
    } catch {
      return createThemeCss(DEFAULT_THEME)
    }
  }, [seed, variant, contrast])

  useIsoLayoutEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
    }
    // Keep it last in <head> so it wins over the static baseline stylesheet.
    document.head.appendChild(style)
    if (style.textContent !== css) style.textContent = css
    if (storageKey) write(`${storageKey}:css`, css)
  }, [css, storageKey])

  useIsoLayoutEffect(() => {
    const root = document.documentElement
    if (mode === 'system') root.removeAttribute(ATTRIBUTE)
    else root.setAttribute(ATTRIBUTE, mode)
  }, [mode])

  useIsoLayoutEffect(() => {
    document.documentElement.setAttribute(MOTION_ATTRIBUTE, motionScheme)
  }, [motionScheme])

  useEffect(() => {
    if (!storageKey) return
    write(`${storageKey}:mode`, mode === 'system' ? null : JSON.stringify(mode))
  }, [mode, storageKey])

  useEffect(() => {
    if (!storageKey) return
    write(`${storageKey}:config`, JSON.stringify(config))
  }, [config, storageKey])

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...config,
      mode,
      resolvedMode,
      setMode: setModeState,
      setConfig: (next) => setConfigState((prev) => ({ ...prev, ...next })),
      reset: () => {
        setConfigState({ ...DEFAULT_THEME, ...defaultConfig })
        setModeState(defaultMode)
      },
    }),
    [config, mode, resolvedMode, defaultConfig, defaultMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Reads and changes the app theme. Throws when used outside `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme() must be used inside <ThemeProvider>')
  return value
}

/** Reads the theme context value, or `null` when rendered outside `ThemeProvider`. */
export function useOptionalTheme(): ThemeContextValue | null {
  return useContext(ThemeContext)
}

export type ThemeScopeProps = {
  /** Element to render, such as `section` or `aside`. Defaults to `div`. */
  as?: ElementType
  /** Seed color as a hex string. Defaults to the provider seed. */
  seed?: string
  /** Scheme variant. Defaults to the provider variant. */
  variant?: SchemeVariant
  /** Contrast level from -1 to 1. Defaults to the provider level, or 0 when it is `auto`. */
  contrast?: number
  /** Brightness for this subtree. Defaults to the surrounding resolved mode. */
  mode?: 'light' | 'dark'
  /** Motion scheme for this subtree. Defaults to the surrounding scheme. */
  motionScheme?: MotionScheme
} & Omit<HTMLAttributes<HTMLElement>, 'color'>

/**
 * Applies a different scheme (seed, variant, brightness or motion scheme) to a subtree,
 * including its portals.
 */
export function ThemeScope({
  as,
  seed,
  variant,
  contrast,
  mode,
  motionScheme,
  className,
  style,
  children,
  ...rest
}: ThemeScopeProps) {
  const theme = useContext(ThemeContext)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const dark = (mode ?? theme?.resolvedMode ?? (systemDark ? 'dark' : 'light')) === 'dark'
  const requestedSeed = seed ?? theme?.seed ?? BASELINE_SEED
  // An invalid seed (a typo, or a bad value saved in storage) falls back to the baseline.
  const resolvedSeed = isHexColor(requestedSeed) ? requestedSeed : BASELINE_SEED
  const resolvedVariant = variant ?? theme?.variant ?? 'tonal-spot'
  const resolvedContrast = contrast ?? (typeof theme?.contrast === 'number' ? theme.contrast : 0)
  const vars = useMemo(
    () =>
      schemeToStyle(
        createScheme({
          seed: resolvedSeed,
          variant: resolvedVariant,
          contrast: resolvedContrast,
          dark,
        }),
        dark,
      ),
    [resolvedSeed, resolvedVariant, resolvedContrast, dark],
  )
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const Component = (as ?? 'div') as ElementType
  return (
    <Component
      {...rest}
      ref={setContainer}
      className={cx('m3-theme-scope', className)}
      data-motion-scheme={motionScheme}
      style={{ ...(vars as CSSProperties), ...style }}
    >
      <PortalContainerProvider container={container}>{children}</PortalContainerProvider>
    </Component>
  )
}

import {
  argbFromHex,
  type DynamicColor,
  type DynamicScheme,
  Hct,
  hexFromArgb,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
} from '@material/material-color-utilities'

/** Scheme variants from the Material Color Utilities (dynamic color). */
export type SchemeVariant =
  | 'tonal-spot'
  | 'neutral'
  | 'vibrant'
  | 'expressive'
  | 'fidelity'
  | 'content'
  | 'monochrome'
  | 'rainbow'
  | 'fruit-salad'

/** Every scheme variant. */
export const SCHEME_VARIANTS: readonly SchemeVariant[] = [
  'tonal-spot',
  'neutral',
  'vibrant',
  'expressive',
  'fidelity',
  'content',
  'monochrome',
  'rainbow',
  'fruit-salad',
]

/** Every color role of the M3 color system, as used in `--md-sys-color-<role>`. */
export const COLOR_ROLES = [
  'background',
  'on-background',
  'surface',
  'surface-dim',
  'surface-bright',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
  'on-surface',
  'surface-variant',
  'on-surface-variant',
  'inverse-surface',
  'inverse-on-surface',
  'outline',
  'outline-variant',
  'shadow',
  'scrim',
  'surface-tint',
  'primary',
  'on-primary',
  'primary-container',
  'on-primary-container',
  'inverse-primary',
  'secondary',
  'on-secondary',
  'secondary-container',
  'on-secondary-container',
  'tertiary',
  'on-tertiary',
  'tertiary-container',
  'on-tertiary-container',
  'error',
  'on-error',
  'error-container',
  'on-error-container',
  'primary-fixed',
  'primary-fixed-dim',
  'on-primary-fixed',
  'on-primary-fixed-variant',
  'secondary-fixed',
  'secondary-fixed-dim',
  'on-secondary-fixed',
  'on-secondary-fixed-variant',
  'tertiary-fixed',
  'tertiary-fixed-dim',
  'on-tertiary-fixed',
  'on-tertiary-fixed-variant',
] as const

/** The name of one M3 color role, e.g. `primary-container`. */
export type ColorRole = (typeof COLOR_ROLES)[number]
/** A hex color for every color role. */
export type ColorScheme = Record<ColorRole, string>

/** Options for `createScheme`. */
export interface SchemeOptions {
  /** Source (seed) color as a hex string, e.g. `#6750A4`. */
  seed: string
  /** Builds the dark scheme when true, the light scheme when false. */
  dark: boolean
  /** Scheme variant. Defaults to `tonal-spot`. */
  variant?: SchemeVariant
  /** Contrast level from -1 (reduced) through 0 (default) to 1 (maximum). */
  contrast?: number
}

/** The M3 baseline seed color. */
export const BASELINE_SEED = '#6750A4'

const SCHEMES = {
  'tonal-spot': SchemeTonalSpot,
  neutral: SchemeNeutral,
  vibrant: SchemeVibrant,
  expressive: SchemeExpressive,
  fidelity: SchemeFidelity,
  content: SchemeContent,
  monochrome: SchemeMonochrome,
  rainbow: SchemeRainbow,
  'fruit-salad': SchemeFruitSalad,
} satisfies Record<SchemeVariant, unknown>

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Returns true when the string is a 3- or 6-digit hex color. */
export function isHexColor(value: string): boolean {
  return HEX.test(value.trim())
}

function normalizeHex(value: string): string {
  const match = HEX.exec(value.trim())
  if (!match) throw new Error(`Invalid hex color: ${value}`)
  const hex = match[1]!
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  return `#${full.toLowerCase()}`
}

/** The color spec every scheme uses: the 2025 M3 Expressive color spec. */
const COLOR_SPEC = '2025'

function createDynamicScheme(options: SchemeOptions): DynamicScheme {
  const { seed, dark, variant = 'tonal-spot', contrast = 0 } = options
  const Scheme = SCHEMES[variant]
  const level = Math.min(1, Math.max(-1, contrast))
  return new Scheme(Hct.fromInt(argbFromHex(normalizeHex(seed))), dark, level, COLOR_SPEC)
}

/** Builds every M3 color role (2025 Expressive color spec) for one seed color and brightness. */
export function createScheme(options: SchemeOptions): ColorScheme {
  const scheme = createDynamicScheme(options)
  const colors = scheme.colors as unknown as Record<string, () => DynamicColor | undefined>
  const out = {} as ColorScheme
  for (const role of COLOR_ROLES) {
    const method = role.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    const color = colors[method]?.call(scheme.colors)
    if (!color) throw new Error(`Color role "${role}" is missing from the generated scheme`)
    out[role] = hexFromArgb(color.getArgb(scheme))
  }
  return out
}

/** The tones that `createTonalPalettes` returns for each palette. */
export const PALETTE_TONES = [
  0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100,
] as const

/** The key colors of a scheme. */
export type PaletteKey =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'neutral'
  | 'neutral-variant'
  | 'error'
/** Hex colors by tone (0–100) for each key color. */
export type TonalPalettes = Record<PaletteKey, Record<number, string>>

/** Tonal palettes (tone 0–100) for the seed color and variant. */
export function createTonalPalettes(options: Omit<SchemeOptions, 'dark'>): TonalPalettes {
  const scheme = createDynamicScheme({ ...options, dark: false })
  const pick = {
    primary: scheme.primaryPalette,
    secondary: scheme.secondaryPalette,
    tertiary: scheme.tertiaryPalette,
    neutral: scheme.neutralPalette,
    'neutral-variant': scheme.neutralVariantPalette,
    error: scheme.errorPalette,
  }
  const out = {} as TonalPalettes
  for (const [key, palette] of Object.entries(pick) as [
    PaletteKey,
    typeof scheme.primaryPalette,
  ][]) {
    out[key] = Object.fromEntries(
      PALETTE_TONES.map((tone) => [tone, hexFromArgb(palette.tone(tone))]),
    )
  }
  return out
}

/** CSS declarations (`--md-sys-color-*: …;`) for a scheme, plus `color-scheme`. */
export function schemeToDeclarations(scheme: ColorScheme, dark: boolean): string {
  const decls = COLOR_ROLES.map((role) => `--md-sys-color-${role}:${scheme[role]};`)
  decls.push(`--m3-icon-grad:${dark ? -25 : 0};`, `color-scheme:${dark ? 'dark' : 'light'};`)
  return decls.join('')
}

/** Inline style object for scoped theming (see `ThemeScope`). */
export function schemeToStyle(scheme: ColorScheme, dark: boolean): Record<string, string> {
  const style: Record<string, string> = {
    colorScheme: dark ? 'dark' : 'light',
    '--m3-icon-grad': dark ? '-25' : '0',
  }
  for (const role of COLOR_ROLES) style[`--md-sys-color-${role}`] = scheme[role]
  return style
}

/** Options for `createThemeCss`. */
export interface ThemeCssOptions extends Omit<SchemeOptions, 'dark' | 'contrast'> {
  /** A fixed contrast level, or `'auto'` to follow `prefers-contrast: more`. */
  contrast?: number | 'auto'
  /** Selector that carries the theme. Defaults to `:root:root` so it overrides the static baseline. */
  selector?: string
  /** Attribute on the selector element that forces a mode. Defaults to `data-m3-theme`. */
  attribute?: string
}

/** High contrast level used when `contrast` is `'auto'` and the user asks for more contrast. */
export const AUTO_HIGH_CONTRAST = 0.5

/**
 * Builds a complete stylesheet: light by default, dark under `prefers-color-scheme: dark`,
 * and forced modes through `[data-m3-theme="light" | "dark"]`.
 */
export function createThemeCss(options: ThemeCssOptions): string {
  const {
    selector = ':root:root',
    attribute = 'data-m3-theme',
    contrast = 'auto',
    ...rest
  } = options
  const block = (level: number) => {
    const light = schemeToDeclarations(
      createScheme({ ...rest, contrast: level, dark: false }),
      false,
    )
    const dark = schemeToDeclarations(createScheme({ ...rest, contrast: level, dark: true }), true)
    return (
      `${selector}{${light}}` +
      `@media (prefers-color-scheme: dark){${selector}:not([${attribute}="light"]){${dark}}}` +
      `${selector}[${attribute}="dark"]{${dark}}`
    )
  }
  if (contrast === 'auto') {
    return `${block(0)}@media (prefers-contrast: more){${block(AUTO_HIGH_CONTRAST)}}`
  }
  return block(contrast)
}

import { type CSSProperties, useEffect, useId, useState } from 'react'
import { Button } from '../components/Button'
import { ButtonGroup } from '../components/ButtonGroup'
import { Icon } from '../components/Icon'
import { Select } from '../components/Select'
import { Switch } from '../components/Selection'
import { Slider } from '../components/Slider'
import { TextField } from '../components/TextField'
import { cx } from '../utils/hooks'
import type { MotionScheme } from '../utils/spring'
import { isHexColor, SCHEME_VARIANTS, type SchemeVariant } from './scheme'
import { DEFAULT_THEME, type ThemeConfig, type ThemeMode, useOptionalTheme } from './ThemeProvider'

/** Eight seed colors to pick from. */
export const THEME_BUILDER_PRESETS: readonly string[] = [
  '#6750A4',
  '#00668B',
  '#006A6A',
  '#3B6939',
  '#8B5000',
  '#B3261E',
  '#7D5260',
  '#1E3A8A',
]

export interface ThemeBuilderLabels {
  seed?: string
  seedHexAriaLabel?: string
  seedHexErrorText?: string
  customSeedTitle?: string
  customSeedAriaLabel?: string
  variant?: string
  variantAriaLabel?: string
  mode?: string
  modeAriaLabel?: string
  modeLight?: string
  modeDark?: string
  modeSystem?: string
  motion?: string
  motionAriaLabel?: string
  motionExpressive?: string
  motionStandard?: string
  contrast?: string
  contrastAriaLabel?: string
  followSystemContrast?: string
  reset?: string
}

export interface ThemeBuilderProps {
  /** Visual container style: 'card' (elevated container) or 'plain' (flat, unpadded). Defaults to 'card'. */
  variant?: 'card' | 'plain'
  /** List of preset hex colors shown as quick-pick swatches. Defaults to 8 Material 3 baseline seeds. */
  presets?: readonly string[]
  /** Whether to show the seed color swatch picker and hex field. Defaults to true. */
  showSeed?: boolean
  /** Whether to show the scheme variant dropdown. Defaults to true. */
  showVariant?: boolean
  /** Whether to show the light / dark / system mode selector. Defaults to true. */
  showMode?: boolean
  /** Whether to show the Expressive / Standard motion scheme selector. Defaults to true. */
  showMotion?: boolean
  /** Whether to show the contrast controls. Defaults to true. */
  showContrast?: boolean
  /** Whether to show the reset button. Defaults to true. */
  showReset?: boolean
  /** Optional custom or localized labels. */
  labels?: ThemeBuilderLabels
  /** Controlled theme values. When passed with `onChange`, overrides the ambient `useTheme()` context. */
  value?: Partial<ThemeConfig> & { mode?: ThemeMode }
  /** Called when any theme setting changes in controlled mode. */
  onChange?: (next: Partial<ThemeConfig> & { mode?: ThemeMode }) => void
  /** Called when the reset button is clicked in controlled mode. */
  onReset?: () => void
  /** Additional CSS class on the container element. */
  className?: string
  /** Inline style on the container element. */
  style?: CSSProperties
}

/**
 * Self-contained M3 Expressive theme builder and settings widget: seed color, scheme variant,
 * mode, motion scheme and contrast.
 *
 * Automatically binds to the ambient `ThemeProvider` context when available, or can be run in
 * fully controlled / standalone mode via `value` and `onChange`.
 */
export function ThemeBuilder({
  variant = 'card',
  presets = THEME_BUILDER_PRESETS,
  showSeed = true,
  showVariant = true,
  showMode = true,
  showMotion = true,
  showContrast = true,
  showReset = true,
  labels,
  value,
  onChange,
  onReset,
  className,
  style,
}: ThemeBuilderProps) {
  const ambientTheme = useOptionalTheme()
  const baseId = useId()
  const seedLabelId = `${baseId}-seed`
  const contrastLabelId = `${baseId}-contrast`

  // Internal state used when uncontrolled and outside a ThemeProvider
  const [internalConfig, setInternalConfig] = useState<ThemeConfig>(DEFAULT_THEME)
  const [internalMode, setInternalMode] = useState<ThemeMode>('system')

  const isControlled = value !== undefined && onChange !== undefined

  const currentSeed = isControlled
    ? (value.seed ?? DEFAULT_THEME.seed)
    : (ambientTheme?.seed ?? internalConfig.seed)

  const currentVariant = isControlled
    ? (value.variant ?? DEFAULT_THEME.variant)
    : (ambientTheme?.variant ?? internalConfig.variant)

  const currentMode = isControlled ? (value.mode ?? 'system') : (ambientTheme?.mode ?? internalMode)

  const currentMotion = isControlled
    ? (value.motionScheme ?? DEFAULT_THEME.motionScheme)
    : (ambientTheme?.motionScheme ?? internalConfig.motionScheme)

  const currentContrast = isControlled
    ? (value.contrast ?? DEFAULT_THEME.contrast)
    : (ambientTheme?.contrast ?? internalConfig.contrast)

  const [hexInput, setHexInput] = useState(currentSeed)

  useEffect(() => {
    setHexInput(currentSeed)
  }, [currentSeed])

  const updateConfig = (patch: Partial<ThemeConfig>) => {
    if (isControlled) {
      onChange({
        seed: currentSeed,
        variant: currentVariant,
        contrast: currentContrast,
        motionScheme: currentMotion,
        mode: currentMode,
        ...patch,
      })
    } else if (ambientTheme) {
      ambientTheme.setConfig(patch)
    } else {
      setInternalConfig((prev) => ({ ...prev, ...patch }))
    }
  }

  const updateMode = (nextMode: ThemeMode) => {
    if (isControlled) {
      onChange({
        seed: currentSeed,
        variant: currentVariant,
        contrast: currentContrast,
        motionScheme: currentMotion,
        mode: nextMode,
      })
    } else if (ambientTheme) {
      ambientTheme.setMode(nextMode)
    } else {
      setInternalMode(nextMode)
    }
  }

  const handleReset = () => {
    if (isControlled) {
      onReset?.()
    } else if (ambientTheme) {
      ambientTheme.reset()
    } else {
      setInternalConfig(DEFAULT_THEME)
      setInternalMode('system')
    }
  }

  const autoContrast = currentContrast === 'auto'
  const customSeed = !presets.some((c) => c.toLowerCase() === currentSeed.toLowerCase())

  return (
    <div className={cx('m3-theme-builder', className)} data-variant={variant} style={style}>
      <div className="m3-theme-builder__groups">
        {showSeed && (
          <div className="m3-theme-builder__group m3-theme-builder__group--wide">
            <span className="m3-theme-builder__label" id={seedLabelId}>
              {labels?.seed ?? 'Seed color'}
            </span>
            <div className="m3-theme-builder__control m3-theme-builder__seeds">
              <fieldset className="m3-theme-builder__swatches" aria-labelledby={seedLabelId}>
                {presets.map((c) => {
                  const selected = currentSeed.toLowerCase() === c.toLowerCase()
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={selected}
                      className="m3-theme-builder__seed m3-focus-ring"
                      style={{ background: c }}
                      onClick={() => {
                        setHexInput(c)
                        updateConfig({ seed: c })
                      }}
                    >
                      {selected && <Icon name="check" size={20} />}
                    </button>
                  )
                })}
                <label
                  className="m3-theme-builder__seed m3-theme-builder__seed--custom"
                  title={labels?.customSeedTitle ?? 'Custom color'}
                  data-selected={customSeed ? '' : undefined}
                >
                  <input
                    type="color"
                    aria-label={labels?.customSeedAriaLabel ?? 'Custom seed color'}
                    value={isHexColor(currentSeed) ? currentSeed : '#6750a4'}
                    onChange={(e) => {
                      setHexInput(e.target.value)
                      updateConfig({ seed: e.target.value })
                    }}
                  />
                  <span className="m3-theme-builder__seed-badge">
                    <Icon name={customSeed ? 'check' : 'colorize'} size={16} />
                  </span>
                </label>
              </fieldset>
              <TextField
                variant="outlined"
                aria-label={labels?.seedHexAriaLabel ?? 'Seed color as a hex code'}
                leadingIcon="tag"
                value={hexInput.replace(/^#/, '')}
                error={!isHexColor(hexInput)}
                errorText={labels?.seedHexErrorText ?? 'Use RGB or RRGGBB'}
                onValueChange={(v) => {
                  const next = `#${v.replace(/^#/, '')}`
                  setHexInput(next)
                  if (isHexColor(next)) updateConfig({ seed: next })
                }}
                className="m3-theme-builder__hex"
              />
            </div>
          </div>
        )}

        {showVariant && (
          <div className="m3-theme-builder__group">
            <span className="m3-theme-builder__label">{labels?.variant ?? 'Scheme variant'}</span>
            <div className="m3-theme-builder__control">
              <Select
                aria-label={labels?.variantAriaLabel ?? 'Scheme variant'}
                variant="outlined"
                value={currentVariant}
                options={SCHEME_VARIANTS.map((v) => ({
                  value: v,
                  label: v.replace('-', ' '),
                }))}
                onChange={(v) => updateConfig({ variant: v as SchemeVariant })}
                className="m3-theme-builder__variant"
              />
            </div>
          </div>
        )}

        {showMode && (
          <div className="m3-theme-builder__group">
            <span className="m3-theme-builder__label">{labels?.mode ?? 'Mode'}</span>
            <div className="m3-theme-builder__control">
              <ButtonGroup
                variant="connected"
                selection="single"
                fullWidth
                aria-label={labels?.modeAriaLabel ?? 'Mode'}
                value={currentMode}
                onChange={(mode) => mode && updateMode(mode as ThemeMode)}
              >
                <Button variant="tonal" value="light" icon="light_mode">
                  {labels?.modeLight ?? 'Light'}
                </Button>
                <Button variant="tonal" value="dark" icon="dark_mode">
                  {labels?.modeDark ?? 'Dark'}
                </Button>
                <Button variant="tonal" value="system" icon="computer">
                  {labels?.modeSystem ?? 'System'}
                </Button>
              </ButtonGroup>
            </div>
          </div>
        )}

        {showMotion && (
          <div className="m3-theme-builder__group">
            <span className="m3-theme-builder__label">{labels?.motion ?? 'Motion'}</span>
            <div className="m3-theme-builder__control">
              <ButtonGroup
                variant="connected"
                selection="single"
                fullWidth
                aria-label={labels?.motionAriaLabel ?? 'Motion scheme'}
                value={currentMotion}
                onChange={(scheme) =>
                  scheme && updateConfig({ motionScheme: scheme as MotionScheme })
                }
              >
                <Button variant="tonal" value="expressive" icon="animation">
                  {labels?.motionExpressive ?? 'Expressive'}
                </Button>
                <Button variant="tonal" value="standard" icon="motion_mode">
                  {labels?.motionStandard ?? 'Standard'}
                </Button>
              </ButtonGroup>
            </div>
          </div>
        )}

        {showContrast && (
          <div className="m3-theme-builder__group m3-theme-builder__group--wide">
            <span className="m3-theme-builder__label" id={contrastLabelId}>
              {labels?.contrast ?? 'Contrast'}:{' '}
              {autoContrast
                ? (labels?.followSystemContrast ?? 'system setting')
                : (currentContrast as number).toFixed(1)}
            </span>
            <div className="m3-theme-builder__control">
              <Switch
                label={labels?.followSystemContrast ?? 'Follow the system setting'}
                checked={autoContrast}
                onChange={(e) => updateConfig({ contrast: e.target.checked ? 'auto' : 0 })}
              />
              <Slider
                aria-labelledby={contrastLabelId}
                min={-1}
                max={1}
                step={0.5}
                stops
                labeled
                disabled={autoContrast}
                value={autoContrast ? 0 : (currentContrast as number)}
                onChange={(v) => updateConfig({ contrast: v })}
                className="m3-theme-builder__contrast"
              />
            </div>
          </div>
        )}
      </div>

      {showReset && (
        <div className="m3-theme-builder__footer">
          <Button variant="text" icon="restart_alt" onClick={handleReset}>
            {labels?.reset ?? 'Reset to default'}
          </Button>
        </div>
      )}
    </div>
  )
}

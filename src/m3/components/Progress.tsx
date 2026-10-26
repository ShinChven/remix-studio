import { type CSSProperties, type HTMLAttributes, useRef, useState } from 'react'
import { cx, prefersReducedMotion, useIsoLayoutEffect } from '../utils/hooks'

/** Progress indicator shape: a straight (flat) or wavy active indicator (M3 Expressive). */
export type ProgressShape = 'flat' | 'wavy'

interface ProgressBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current value. Omit for an indeterminate indicator. */
  value?: number
  /** Value that means complete. */
  max?: number
  /** `wavy` draws the active indicator as a wave, for more expressive moments. */
  shape?: ProgressShape
  /** Accessible name, e.g. "Uploading image". */
  'aria-label'?: string
  /** Hides the indicator from assistive tech, e.g. inside a component that already reports busy. */
  'aria-hidden'?: boolean
}

function clamp01(value: number, max: number) {
  return max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
}

/** Gap between the active indicator and the track. */
const TRACK_GAP = 4

/** Waves flatten out near the start and the end, as in the spec. */
function waveAmplitude(fraction: number, amplitude: number) {
  return fraction <= 0.1 || fraction >= 0.95 ? 0 : amplitude
}

export interface LinearProgressProps extends ProgressBaseProps {
  /** Secondary (buffer) value, for media buffering (flat indicators). */
  buffer?: number
  /** Track and indicator thickness in px: 4 (default) or 8 for a thick indicator. */
  thickness?: number
  /** Wave height (amplitude) in px for `wavy`. Defaults to 3. */
  amplitude?: number
  /** Wave length in px for `wavy`. Defaults to 40 (20 while indeterminate). */
  wavelength?: number
}

/** Linear progress indicator, flat or wavy, determinate (with stop indicator) or indeterminate. */
export function LinearProgress({
  value,
  max = 100,
  shape = 'flat',
  buffer,
  thickness,
  amplitude,
  wavelength,
  className,
  style,
  ...rest
}: LinearProgressProps) {
  const indeterminate = value === undefined
  const fraction = indeterminate ? 0 : clamp01(value, max)
  const vars: Record<string, string | number> = { '--_value': fraction }
  if (buffer !== undefined) vars['--_buffer'] = clamp01(buffer, max)
  if (thickness) vars['--_thickness'] = `${thickness}px`
  const common = {
    role: 'progressbar',
    'aria-valuemin': indeterminate ? undefined : 0,
    'aria-valuemax': indeterminate ? undefined : max,
    'aria-valuenow': indeterminate ? undefined : value,
    ...rest,
    className: cx('m3-linear-progress', className),
    'data-indeterminate': indeterminate ? '' : undefined,
    'data-empty': !indeterminate && fraction === 0 ? '' : undefined,
    'data-complete': !indeterminate && fraction === 1 ? '' : undefined,
  }
  if (shape === 'wavy') {
    return (
      <WavyLinear
        common={common}
        fraction={indeterminate ? null : fraction}
        thickness={thickness ?? 4}
        amplitude={amplitude ?? 3}
        wavelength={wavelength ?? (indeterminate ? 20 : 40)}
        style={{ ...(vars as CSSProperties), ...style }}
      />
    )
  }
  return (
    <div {...common} data-shape="flat" style={{ ...(vars as CSSProperties), ...style }}>
      {indeterminate ? (
        <>
          <span className="m3-linear-progress__bar" data-bar="primary" />
          <span className="m3-linear-progress__bar" data-bar="secondary" />
        </>
      ) : (
        <>
          <span className="m3-linear-progress__active" />
          <span className="m3-linear-progress__track">
            {buffer !== undefined && <span className="m3-linear-progress__buffer" />}
          </span>
          <span className="m3-linear-progress__stop" />
        </>
      )}
    </div>
  )
}

/** One cycle of the indeterminate animation: two lines whose ends travel at different times. */
const CYCLE_MS = 1750
const LINES = [
  { head: [0, 1000], tail: [250, 1000] },
  { head: [650, 850], tail: [900, 850] },
] as const

function ease(t: number) {
  // cubic-bezier(0.2, 0, 0.8, 1), solved numerically.
  const x = Math.min(1, Math.max(0, t))
  let lo = 0
  let hi = 1
  let u = x
  for (let i = 0; i < 20; i++) {
    u = (lo + hi) / 2
    const bx = 3 * (1 - u) * (1 - u) * u * 0.2 + 3 * (1 - u) * u * u * 0.8 + u * u * u
    if (bx < x) lo = u
    else hi = u
  }
  return 3 * (1 - u) * u * u + u * u * u
}

function wave(
  x0: number,
  x1: number,
  mid: number,
  amplitude: number,
  wavelength: number,
  phase: number,
) {
  if (x1 - x0 < 0.5) return ''
  const y = (x: number) => mid + amplitude * Math.sin(((x - phase) / wavelength) * Math.PI * 2)
  if (amplitude === 0) return `M${x0} ${mid}L${x1} ${mid}`
  let d = `M${x0.toFixed(1)} ${y(x0).toFixed(2)}`
  for (let x = x0 + 2; x < x1; x += 2) d += `L${x.toFixed(1)} ${y(x).toFixed(2)}`
  return `${d}L${x1.toFixed(1)} ${y(x1).toFixed(2)}`
}

function WavyLinear({
  common,
  fraction,
  thickness,
  amplitude,
  wavelength,
  style,
}: {
  common: Record<string, unknown>
  fraction: number | null
  thickness: number
  amplitude: number
  wavelength: number
  style: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const activeRef = useRef<SVGPathElement>(null)
  const secondRef = useRef<SVGPathElement>(null)
  const trackRef = useRef<SVGPathElement>(null)
  const [width, setWidth] = useState(0)
  const height = thickness + amplitude * 2
  const mid = height / 2
  const cap = thickness / 2
  const fractionRef = useRef(fraction)
  fractionRef.current = fraction

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.getBoundingClientRect().width)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const determinate = fraction !== null
  useIsoLayoutEffect(() => {
    const active = activeRef.current
    const second = secondRef.current
    const track = trackRef.current
    if (!width || !active || !second || !track) return
    const reduced = prefersReducedMotion()
    const start = performance.now()
    let currentAmplitude = waveAmplitude(fractionRef.current ?? 0.5, amplitude)
    let frame = 0
    const span = width - cap * 2
    const draw = (now: number) => {
      const elapsed = now - start
      // The wave travels one wavelength per second.
      const phase = reduced ? 0 : ((elapsed / 1000) * wavelength) % wavelength
      const f = fractionRef.current
      if (f !== null) {
        const target = waveAmplitude(f, amplitude)
        currentAmplitude += (target - currentAmplitude) * 0.15
        const end = cap + span * f
        active.setAttribute(
          'd',
          f > 0 ? wave(cap, end, mid, currentAmplitude, wavelength, phase) : '',
        )
        second.setAttribute('d', '')
        const trackStart = f > 0 ? end + TRACK_GAP + thickness : cap
        track.setAttribute('d', f < 1 ? `M${trackStart} ${mid}L${width - cap} ${mid}` : '')
      } else {
        const t = elapsed % CYCLE_MS
        const lines = LINES.map(({ head, tail }) => {
          const h = ease((t - head[0]) / head[1])
          const tl = ease((t - tail[0]) / tail[1])
          return [cap + span * tl, cap + span * h] as const
        })
        const [a, b] = lines as unknown as [[number, number], [number, number]]
        active.setAttribute('d', wave(a[0], a[1], mid, amplitude, wavelength, phase))
        second.setAttribute('d', wave(b[0], b[1], mid, amplitude, wavelength, phase))
        // Track in the gaps: from the end of the second line to the start of the first.
        const gap = TRACK_GAP + thickness
        const segments: string[] = []
        const visible = [a, b].filter(([x0, x1]) => x1 - x0 > 0.5).sort((p, q) => p[0] - q[0])
        let cursor = cap
        for (const [x0, x1] of visible) {
          if (x0 - gap > cursor) segments.push(`M${cursor} ${mid}L${x0 - gap} ${mid}`)
          cursor = Math.max(cursor, x1 + gap)
        }
        if (cursor < width - cap) segments.push(`M${cursor} ${mid}L${width - cap} ${mid}`)
        track.setAttribute('d', segments.join(''))
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [width, determinate, amplitude, wavelength, thickness, mid, cap])

  return (
    <div
      {...common}
      ref={ref}
      data-shape="wavy"
      style={{ ...style, '--_height': `${height}px` } as CSSProperties}
    >
      <svg width="100%" height={height} aria-hidden="true" focusable="false">
        <path ref={trackRef} className="m3-linear-progress__wave-track" strokeWidth={thickness} />
        <path ref={activeRef} className="m3-linear-progress__wave" strokeWidth={thickness} />
        <path ref={secondRef} className="m3-linear-progress__wave" strokeWidth={thickness} />
        {determinate && fraction < 1 && width > 0 && (
          <circle
            className="m3-linear-progress__wave-stop"
            cx={width - cap}
            cy={mid}
            r={Math.min(2, cap)}
          />
        )}
      </svg>
    </div>
  )
}

export interface CircularProgressProps extends ProgressBaseProps {
  /** Diameter in px. Defaults to 40 (48 for `wavy`). */
  size?: number
  /** Stroke thickness in px: 4 by default, 8 for a thick indicator. */
  thickness?: number
  /** Wave height (amplitude) in px for `wavy`. Defaults to 1.6. */
  amplitude?: number
  /** Wave length in px along the circle for `wavy`. Defaults to 15. */
  wavelength?: number
}

/** A closed wavy circle as path data, for dash-based drawing. */
function wavyCircle(c: number, radius: number, amplitude: number, wavelength: number) {
  const circumference = 2 * Math.PI * radius
  const waves = Math.max(3, Math.round(circumference / wavelength))
  const steps = waves * 12
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const r = radius + amplitude * Math.sin(angle * waves)
    const x = c + r * Math.cos(angle)
    const y = c + r * Math.sin(angle)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return `${d}Z`
}

/** Circular progress indicator, flat or wavy, determinate (with track gap) or indeterminate. */
export function CircularProgress({
  value,
  max = 100,
  shape = 'flat',
  size,
  thickness,
  amplitude = 1.6,
  wavelength = 15,
  className,
  style,
  ...rest
}: CircularProgressProps) {
  const indeterminate = value === undefined
  const wavy = shape === 'wavy'
  const diameter = size ?? (wavy ? 48 : 40)
  const stroke = thickness ?? 4
  const waveRoom = wavy ? amplitude : 0
  const radius = (diameter - stroke) / 2 - waveRoom
  const c = diameter / 2
  const circumference = 2 * Math.PI * radius
  const fraction = indeterminate ? 0.25 : clamp01(value, max)
  // Gap between active indicator and track, in pathLength units (rounded caps eat into it).
  const gap = ((TRACK_GAP + stroke) / circumference) * 100
  const active = fraction * 100
  const trackLength = Math.max(0, 100 - active - (active > 0 ? 2 * gap : 0))
  const trackStart = active > 0 ? active + gap : 0
  const showWave = wavy && (indeterminate || waveAmplitude(fraction, amplitude) > 0)
  const activeShape = showWave ? (
    <path
      className="m3-circular-progress__active"
      d={wavyCircle(c, radius, amplitude, wavelength)}
      strokeWidth={stroke}
      pathLength={100}
      strokeDasharray={indeterminate ? undefined : `${active} 100`}
      style={!indeterminate && active === 0 ? { opacity: 0 } : undefined}
    />
  ) : (
    <circle
      className="m3-circular-progress__active"
      cx={c}
      cy={c}
      r={radius}
      strokeWidth={stroke}
      pathLength={100}
      strokeDasharray={indeterminate ? undefined : `${active} 100`}
      style={!indeterminate && active === 0 ? { opacity: 0 } : undefined}
    />
  )
  return (
    <div
      role="progressbar"
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : value}
      {...rest}
      className={cx('m3-circular-progress', className)}
      data-indeterminate={indeterminate ? '' : undefined}
      data-shape={shape}
      style={{ width: diameter, height: diameter, ...style }}
    >
      <svg
        viewBox={`0 0 ${diameter} ${diameter}`}
        width={diameter}
        height={diameter}
        aria-hidden="true"
      >
        {!indeterminate && trackLength > 0 && (
          <circle
            className="m3-circular-progress__track"
            cx={c}
            cy={c}
            r={radius}
            strokeWidth={stroke}
            pathLength={100}
            strokeDasharray={`${trackLength} 100`}
            strokeDashoffset={-trackStart}
          />
        )}
        {activeShape}
      </svg>
    </div>
  )
}

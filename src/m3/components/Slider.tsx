import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { cx, useControllableState, useElementSize } from '../utils/hooks'
import { type IconSource, renderIcon } from './Icon'

type SliderValue = number | [number, number]

/** Slider size (M3 Expressive): track thickness from 16dp (`xs`, the default) to 96dp (`xl`). */
export type SliderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface SliderBaseProps<V extends SliderValue> {
  /** Current value (controlled). A range slider takes `[start, end]`. */
  value?: V
  /** Value on first render (uncontrolled). Defaults to `min`, or `[min, max]` for a range. */
  defaultValue?: V
  /** Called continuously while dragging. */
  onChange?: (value: V) => void
  /** Called once when the user releases the handle or presses a key. */
  onChangeEnd?: (value: V) => void
  /** Lowest value. */
  min?: number
  /** Highest value. */
  max?: number
  /** Distance between allowed values. */
  step?: number
  /** Show stop indicators at each step (formerly the discrete slider). */
  stops?: boolean
  /** Show a value indicator next to the handle while dragging or focused. */
  labeled?: boolean
  /** Formats values for the label and `aria-valuetext`. */
  formatValue?: (value: number) => string
  /** Horizontal (default) or vertical; vertical sliders grow upwards. */
  orientation?: 'horizontal' | 'vertical'
  /** Size: track thickness 16 (`xs`), 24, 40, 56 or 96dp (`xl`). */
  size?: SliderSize
  /** Dims the slider and ignores pointer and keyboard input. */
  disabled?: boolean
  /** Form name. Hidden inputs carry the value (`name[0]` and `name[1]` for a range). */
  name?: string
  /** Class name for the root element. */
  className?: string
  /** Inline style for the root element (e.g. the height of a vertical slider). */
  style?: CSSProperties
  /** Accessible name when there is no visible label. */
  'aria-label'?: string
  /** ID of the element that labels the slider. */
  'aria-labelledby'?: string
}

export interface SliderProps extends SliderBaseProps<number> {
  /** Centered slider: the active track runs from the middle of the range to the value. */
  centered?: boolean
  /** Icon inside the track (standard slider, `md` size and larger), e.g. `volume_up`. */
  insetIcon?: IconSource
}
export type RangeSliderProps = SliderBaseProps<[number, number]> & {
  /** Accessible names for the two handles. */
  thumbLabels?: [string, string]
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function snap(v: number, min: number, step: number) {
  const snapped = Math.round((v - min) / step) * step + min
  // Avoid float noise such as 0.30000000000000004.
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number(snapped.toFixed(decimals))
}

const INSET_ICON: Partial<Record<SliderSize, { size: number; padding: number }>> = {
  md: { size: 24, padding: 6 },
  lg: { size: 24, padding: 6 },
  xl: { size: 32, padding: 8 },
}
/** Gap between the handle and the track on each side. */
const HANDLE_GAP = 6

interface Segment {
  kind: 'active' | 'inactive'
  from: number
  to: number
  /** Ends that touch a handle get a gap and small corners; the others are outer ends. */
  handleFrom: boolean
  handleTo: boolean
}

function SliderImpl({
  values,
  setValues,
  onCommit,
  min,
  max,
  step,
  stops,
  labeled,
  formatValue,
  orientation,
  size,
  centered,
  insetIcon,
  disabled,
  name,
  className,
  style,
  thumbLabels,
  ariaLabel,
  ariaLabelledBy,
}: {
  values: number[]
  setValues: (values: number[]) => void
  onCommit: (values: number[]) => void
  min: number
  max: number
  step: number
  stops: boolean
  labeled: boolean
  formatValue: (v: number) => string
  orientation: 'horizontal' | 'vertical'
  size: SliderSize
  centered: boolean
  insetIcon: IconSource | undefined
  disabled: boolean
  name: string | undefined
  className: string | undefined
  style: CSSProperties | undefined
  thumbLabels: (string | undefined)[]
  ariaLabel: string | undefined
  ariaLabelledBy: string | undefined
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const trackSize = useElementSize(trackRef)
  const [dragging, setDragging] = useState<number | null>(null)
  const latest = useRef(values)
  latest.current = values
  const range = values.length === 2
  const vertical = orientation === 'vertical'
  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100

  const valueFromPointer = (clientX: number, clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    let ratio: number
    if (vertical) {
      ratio = (rect.bottom - clientY) / (rect.height || 1)
    } else {
      const rtl = getComputedStyle(trackRef.current!).direction === 'rtl'
      ratio = (clientX - rect.left) / (rect.width || 1)
      if (rtl) ratio = 1 - ratio
    }
    return clamp(snap(min + ratio * (max - min), min, step), min, max)
  }

  const update = (index: number, raw: number) => {
    const next = [...latest.current]
    let v = clamp(snap(raw, min, step), min, max)
    if (range) v = index === 0 ? Math.min(v, next[1]!) : Math.max(v, next[0]!)
    if (next[index] === v) return next
    next[index] = v
    latest.current = next
    setValues(next)
    return next
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return
    const v = valueFromPointer(e.clientX, e.clientY)
    const index = range
      ? Math.abs(v - values[0]!) <= Math.abs(v - values[1]!) &&
        !(v > values[1]! && values[0] === values[1])
        ? 0
        : 1
      : 0
    setDragging(index)
    update(index, v)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.querySelectorAll<HTMLElement>('[role="slider"]')[index]?.focus()
    e.preventDefault()
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return
    update(dragging, valueFromPointer(e.clientX, e.clientY))
  }
  const onPointerUp = () => {
    if (dragging === null) return
    setDragging(null)
    onCommit(latest.current)
  }

  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return
    const big = Math.max(step, (max - min) / 10)
    const rtl = !vertical && getComputedStyle(e.currentTarget).direction === 'rtl'
    const current = values[index]!
    let next: number
    switch (e.key) {
      case 'ArrowUp':
        next = current + step
        break
      case 'ArrowDown':
        next = current - step
        break
      case 'ArrowRight':
        next = current + (rtl ? -step : step)
        break
      case 'ArrowLeft':
        next = current + (rtl ? step : -step)
        break
      case 'PageUp':
        next = current + big
        break
      case 'PageDown':
        next = current - big
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
      default:
        return
    }
    e.preventDefault()
    const after = update(index, next)
    // Keys at the end of the range do not change the value: no commit.
    if (after[index] !== current) onCommit(after)
  }

  const positions = values.map(pct)
  const segments: Segment[] = []
  if (range) {
    const [a, b] = positions as [number, number]
    segments.push({ kind: 'inactive', from: 0, to: a, handleFrom: false, handleTo: true })
    segments.push({ kind: 'active', from: a, to: b, handleFrom: true, handleTo: true })
    segments.push({ kind: 'inactive', from: b, to: 100, handleFrom: true, handleTo: false })
  } else if (centered) {
    const v = positions[0]!
    const c = 50
    const low = Math.min(v, c)
    const high = Math.max(v, c)
    segments.push({ kind: 'inactive', from: 0, to: low, handleFrom: false, handleTo: v < c })
    segments.push({ kind: 'active', from: low, to: high, handleFrom: v < c, handleTo: v >= c })
    segments.push({ kind: 'inactive', from: high, to: 100, handleFrom: v >= c, handleTo: false })
  } else {
    const v = positions[0]!
    segments.push({ kind: 'active', from: 0, to: v, handleFrom: false, handleTo: true })
    segments.push({ kind: 'inactive', from: v, to: 100, handleFrom: true, handleTo: false })
  }
  const isActive = (p: number) =>
    segments.some((s) => s.kind === 'active' && p >= s.from - 1e-9 && p <= s.to + 1e-9)

  const stopCount = stops ? Math.floor((max - min) / step) : 0
  // Inset icon: inside the active track at the start, or after the handle when it would not fit.
  const icon = !range && !centered ? INSET_ICON[size] : undefined
  const length = vertical ? trackSize.height : trackSize.width
  const activeLength = (length * positions[0]!) / 100 - HANDLE_GAP
  const iconInActive = icon ? activeLength >= icon.size + icon.padding * 2 : true
  return (
    <div
      className={cx('m3-slider', className)}
      data-orientation={orientation}
      data-size={size}
      data-disabled={disabled ? '' : undefined}
      data-range={range ? '' : undefined}
      data-centered={centered ? '' : undefined}
      data-dragging={dragging !== null ? '' : undefined}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={trackRef} className="m3-slider__track">
        {segments.map((s, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
            key={i}
            className="m3-slider__segment"
            data-kind={s.kind}
            data-outer-from={s.handleFrom ? undefined : ''}
            data-outer-to={s.handleTo ? undefined : ''}
            style={
              {
                '--_from': `${s.from}%`,
                '--_to': `${s.to}%`,
                '--_gap-from': s.handleFrom ? 1 : 0,
                '--_gap-to': s.handleTo ? 1 : 0,
              } as CSSProperties
            }
          />
        ))}
        {insetIcon && icon && (
          <span
            className="m3-slider__icon"
            aria-hidden="true"
            data-place={iconInActive ? 'active' : 'inactive'}
            style={
              {
                '--_at': iconInActive ? '0%' : `${positions[0]}%`,
                '--_icon-padding': `${icon.padding}px`,
              } as CSSProperties
            }
          >
            {renderIcon(insetIcon, { size: icon.size })}
          </span>
        )}
        {stopCount > 0 && stopCount <= 200 && (
          <span className="m3-slider__stops" aria-hidden="true">
            {Array.from({ length: stopCount + 1 }, (_, i) => {
              // Stops sit on the real values, which may end before `max`.
              const p = pct(min + i * step)
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
                  key={i}
                  className="m3-slider__stop"
                  data-on={isActive(p) ? '' : undefined}
                  data-edge={p <= 0 ? 'start' : p >= 100 ? 'end' : undefined}
                  style={{ '--_at': `${p}%` } as CSSProperties}
                />
              )
            })}
          </span>
        )}
        {values.map((v, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: handles are positional (start, end)
            key={i}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-valuemin={range && i === 1 ? values[0] : min}
            aria-valuemax={range && i === 0 ? values[1] : max}
            aria-valuenow={v}
            aria-valuetext={formatValue(v)}
            aria-orientation={orientation}
            aria-disabled={disabled || undefined}
            aria-label={thumbLabels[i] ?? ariaLabel}
            aria-labelledby={thumbLabels[i] ? undefined : ariaLabelledBy}
            className="m3-slider__handle"
            data-active={dragging === i ? '' : undefined}
            style={{ '--_at': `${pct(v)}%` } as CSSProperties}
            onKeyDown={onKeyDown(i)}
          >
            {labeled && <span className="m3-slider__label">{formatValue(v)}</span>}
          </span>
        ))}
      </div>
      {name &&
        values.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: hidden inputs mirror the handles
          <input key={i} type="hidden" name={range ? `${name}[${i}]` : name} value={v} />
        ))}
    </div>
  )
}

const defaultFormat = (v: number) => String(v)

/** Slider for a single value (M3 Expressive): standard or centered, in five sizes. */
export function Slider({
  value,
  defaultValue,
  onChange,
  onChangeEnd,
  min = 0,
  max = 100,
  step = 1,
  stops = false,
  labeled = false,
  formatValue = defaultFormat,
  orientation = 'horizontal',
  size = 'xs',
  centered = false,
  insetIcon,
  disabled = false,
  name,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SliderProps) {
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue: defaultValue ?? (centered ? (min + max) / 2 : min),
    onChange,
  })
  return (
    <SliderImpl
      values={[current]}
      setValues={([v]) => setCurrent(v!)}
      onCommit={([v]) => onChangeEnd?.(v!)}
      min={min}
      max={max}
      step={step}
      stops={stops}
      labeled={labeled}
      formatValue={formatValue}
      orientation={orientation}
      size={size}
      centered={centered}
      insetIcon={insetIcon}
      disabled={disabled}
      name={name}
      className={className}
      style={style}
      thumbLabels={[]}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
    />
  )
}

/** Range slider with start and end handles. */
export function RangeSlider({
  value,
  defaultValue,
  onChange,
  onChangeEnd,
  min = 0,
  max = 100,
  step = 1,
  stops = false,
  labeled = false,
  formatValue = defaultFormat,
  orientation = 'horizontal',
  size = 'xs',
  disabled = false,
  name,
  className,
  style,
  thumbLabels,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: RangeSliderProps) {
  const [current, setCurrent] = useControllableState<[number, number]>({
    value,
    defaultValue: defaultValue ?? [min, max],
    onChange,
  })
  return (
    <SliderImpl
      values={current}
      setValues={(v) => setCurrent([v[0]!, v[1]!])}
      onCommit={(v) => onChangeEnd?.([v[0]!, v[1]!])}
      min={min}
      max={max}
      step={step}
      stops={stops}
      labeled={labeled}
      formatValue={formatValue}
      orientation={orientation}
      size={size}
      centered={false}
      insetIcon={undefined}
      disabled={disabled}
      name={name}
      className={className}
      style={style}
      thumbLabels={thumbLabels ?? []}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
    />
  )
}

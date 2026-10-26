import { type CSSProperties, type HTMLAttributes, useRef } from 'react'
import { type MaterialShapeName, shapePath } from '../shapes/materialShapes'
import { createMorph } from '../shapes/morph'
import { cx, prefersReducedMotion, useIsoLayoutEffect } from '../utils/hooks'
import { animateSpring, type SpringSpec } from '../utils/spring'

/** The seven shapes the indeterminate loading indicator morphs through, in order. */
export const LOADING_INDICATOR_SHAPES: readonly MaterialShapeName[] = [
  'soft-burst',
  'cookie-9',
  'pentagon',
  'pill',
  'sunny',
  'cookie-4',
  'oval',
]

const DETERMINATE_SHAPES: readonly MaterialShapeName[] = ['circle', 'soft-burst']
const BOX = 100
/** Active indicator (38dp) inside the 48dp container. */
const ACTIVE_SCALE = 38 / 48
const MORPH_INTERVAL_MS = 650
const GLOBAL_ROTATION_MS = 4666
const MORPH_SPRING: SpringSpec = { damping: 0.6, stiffness: 200 }

export interface LoadingIndicatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Shows the indicator on a circular container, for use over other content. */
  contained?: boolean
  /** Diameter in px: 24 to 240, 48 by default. */
  size?: number
  /**
   * Progress from 0 to 1 for a determinate indicator, e.g. while pulling to refresh. Omit for the
   * looping indeterminate indicator.
   */
  value?: number
  /** Custom morph sequence for the indeterminate indicator (two or more shapes). */
  shapes?: readonly MaterialShapeName[]
  /** Accessible name that says what is loading, e.g. “Loading messages”. */
  'aria-label'?: string
  /** Hides the indicator from assistive technology, e.g. inside a button that reports busy. */
  'aria-hidden'?: boolean
}

/**
 * Loading indicator (M3 Expressive): a shape that morphs through a looping sequence while it
 * rotates. Use it for waits of about 200ms to 5s; it replaces most indeterminate circular
 * progress indicators.
 */
export function LoadingIndicator({
  contained,
  size = 48,
  value,
  shapes = LOADING_INDICATOR_SHAPES,
  className,
  style,
  ...rest
}: LoadingIndicatorProps) {
  const groupRef = useRef<SVGGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const determinate = value !== undefined
  const progress = determinate ? Math.min(1, Math.max(0, value)) : 0
  const sequence = shapes.length >= 2 ? shapes : LOADING_INDICATOR_SHAPES
  const sequenceKey = sequence.join(',')

  // Indeterminate: morph to the next shape every 650ms while the whole indicator rotates.
  useIsoLayoutEffect(() => {
    const group = groupRef.current
    const path = pathRef.current
    if (determinate || !group || !path) return
    const reduced = prefersReducedMotion()
    // Every step turns the indicator a further quarter; four steps make a whole turn, so the
    // rotation stays continuous when the shape sequence starts over.
    let turn = 0
    let morphProgress = 0
    let stopSpring: (() => unknown) | null = null
    let frame = 0
    const start = performance.now()
    const draw = (now: number) => {
      const elapsed = now - start
      const spin = reduced ? 0 : ((elapsed % GLOBAL_ROTATION_MS) / GLOBAL_ROTATION_MS) * 360
      const rotation = spin + ((turn % 4) + morphProgress) * 90
      const from = sequence[turn % sequence.length]!
      const to = sequence[(turn + 1) % sequence.length]!
      path.setAttribute('d', createMorph(from, to).path(morphProgress, BOX))
      group.setAttribute('transform', transform(rotation))
      frame = requestAnimationFrame(draw)
    }
    const step = () => {
      stopSpring?.()
      stopSpring = animateSpring({
        from: 0,
        to: 1,
        spring: MORPH_SPRING,
        onUpdate: (v) => {
          morphProgress = v
        },
      })
    }
    const timer = window.setInterval(() => {
      stopSpring?.()
      turn = (turn + 1) % (sequence.length * 4)
      morphProgress = 0
      step()
    }, MORPH_INTERVAL_MS)
    step()
    frame = requestAnimationFrame(draw)
    return () => {
      window.clearInterval(timer)
      stopSpring?.()
      cancelAnimationFrame(frame)
    }
  }, [determinate, sequenceKey])

  const initialPath = determinate
    ? createMorph(DETERMINATE_SHAPES[0]!, DETERMINATE_SHAPES[1]!).path(progress, BOX)
    : shapePath(sequence[0]!, BOX)
  const initialTransform = transform(determinate ? progress * 180 : 0)

  return (
    <div
      role="progressbar"
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 1 : undefined}
      aria-valuenow={determinate ? progress : undefined}
      {...rest}
      className={cx('m3-loading-indicator', className)}
      data-contained={contained ? '' : undefined}
      style={{ '--_size': `${size}px`, ...style } as CSSProperties}
    >
      <svg viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true" focusable="false">
        <g ref={groupRef} transform={initialTransform}>
          <path ref={pathRef} d={initialPath} />
        </g>
      </svg>
    </div>
  )
}

function transform(rotation: number) {
  const c = BOX / 2
  return `rotate(${Math.round(rotation * 10) / 10} ${c} ${c}) translate(${c} ${c}) scale(${ACTIVE_SCALE}) translate(${-c} ${-c})`
}

import { type SVGProps, useMemo, useRef } from 'react'
import { type MaterialShapeName, shapePath } from '../shapes/materialShapes'
import { createMorph } from '../shapes/morph'
import { cx, prefersReducedMotion, useIsoLayoutEffect } from '../utils/hooks'
import { animateSpring, motionSchemeOf, SPRINGS, type SpringSpeed } from '../utils/spring'

/** The SVG coordinate space of drawn shapes. */
const BOX = 100

export interface ShapeProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'name'> {
  /** A shape of the Material shape library. Changing it morphs to the new shape. */
  name: MaterialShapeName
  /** Width and height: a number of pixels or any CSS length. */
  size?: number | string
  /** Accessible name. Without one the shape is decorative (hidden from assistive technology). */
  label?: string
  /** Spring speed of the morph when `name` changes; `false` switches without morphing. */
  morph?: SpringSpeed | false
}

/**
 * A shape from the M3 Expressive shape library, drawn in the current text color. Changing `name`
 * morphs from the old shape to the new one on a spatial spring of the current motion scheme.
 */
export function Shape({
  name,
  size = 48,
  label,
  morph = 'default',
  className,
  ...rest
}: ShapeProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const shown = useRef(name)
  const stop = useRef<(() => unknown) | null>(null)

  useIsoLayoutEffect(() => {
    const previous = shown.current
    shown.current = name
    const path = pathRef.current
    if (previous === name || !path || morph === false || prefersReducedMotion()) return
    stop.current?.()
    const transition = createMorph(previous, name)
    const spring = SPRINGS[motionSchemeOf(path)][morph].spatial
    // The new path is already in the DOM; start from the old shape before the next paint.
    path.setAttribute('d', transition.path(0, BOX))
    stop.current = animateSpring({
      from: 0,
      to: 1,
      spring,
      onUpdate: (progress) => path.setAttribute('d', transition.path(progress, BOX)),
      onComplete: () => {
        stop.current = null
      },
    })
  }, [name, morph])

  useIsoLayoutEffect(() => () => void stop.current?.(), [])

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
      className={cx('m3-shape', className)}
    >
      <path ref={pathRef} d={shapePath(name, BOX)} />
    </svg>
  )
}

/**
 * SVG path data for the shape between `from` (progress 0) and `to` (progress 1), in a
 * `size` × `size` box. Use it to drive a morph from scroll position, a gesture or a value.
 */
export function useShapeMorph(
  from: MaterialShapeName,
  to: MaterialShapeName,
  progress: number,
  size = 1,
): string {
  const transition = useMemo(() => createMorph(from, to), [from, to])
  return transition.path(Math.round(progress * 1000) / 1000, size)
}

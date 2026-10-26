/**
 * Shape morphing between two outlines. Both outlines are resampled at the same number of points,
 * evenly spaced along their length, and the second is rotated (as a cyclic shift of its points)
 * to line up with the first, so that matching parts of the two shapes travel the shortest way.
 * Each frame interpolates the points and draws them as a smooth closed curve.
 */
import { type MaterialShapeName, materialShape } from './materialShapes'
import { type Cubic, polygonToPath, type RoundedPolygon } from './polygon'

const SAMPLES = 120
const STEPS_PER_CUBIC = 12

function cubicPoint(c: Cubic, t: number): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const d = 3 * u * t * t
  const e = t * t * t
  return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]]
}

/** Points along the outline, evenly spaced by length, in clockwise order. */
export function sampleOutline(polygon: RoundedPolygon, count = SAMPLES): Float64Array {
  const dense: number[] = []
  for (const c of polygon.cubics) {
    for (let i = 0; i < STEPS_PER_CUBIC; i++) {
      const [x, y] = cubicPoint(c, i / STEPS_PER_CUBIC)
      dense.push(x, y)
    }
  }
  const n = dense.length / 2
  // Keep a clockwise winding (on screen) so that every shape runs the same way.
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += dense[i * 2]! * dense[j * 2 + 1]! - dense[j * 2]! * dense[i * 2 + 1]!
  }
  if (area < 0) {
    const reversed: number[] = []
    for (let i = n - 1; i >= 0; i--) reversed.push(dense[i * 2]!, dense[i * 2 + 1]!)
    dense.splice(0, dense.length, ...reversed)
  }
  const lengths = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    lengths[i + 1] =
      lengths[i]! + Math.hypot(dense[j * 2]! - dense[i * 2]!, dense[j * 2 + 1]! - dense[i * 2 + 1]!)
  }
  const total = lengths[n]!
  const out = new Float64Array(count * 2)
  let segment = 0
  for (let k = 0; k < count; k++) {
    const target = (total * k) / count
    while (segment < n - 1 && lengths[segment + 1]! < target) segment++
    const span = lengths[segment + 1]! - lengths[segment]!
    const t = span > 0 ? (target - lengths[segment]!) / span : 0
    const j = (segment + 1) % n
    out[k * 2] = dense[segment * 2]! + (dense[j * 2]! - dense[segment * 2]!) * t
    out[k * 2 + 1] = dense[segment * 2 + 1]! + (dense[j * 2 + 1]! - dense[segment * 2 + 1]!) * t
  }
  return out
}

/** Cyclically shifts `b` to the alignment with `a` that moves its points the least. */
function align(a: Float64Array, b: Float64Array): Float64Array {
  const count = a.length / 2
  let best = 0
  let bestCost = Number.POSITIVE_INFINITY
  for (let shift = 0; shift < count; shift++) {
    let cost = 0
    for (let i = 0; i < count && cost < bestCost; i++) {
      const j = ((i + shift) % count) * 2
      const dx = a[i * 2]! - b[j]!
      const dy = a[i * 2 + 1]! - b[j + 1]!
      cost += dx * dx + dy * dy
    }
    if (cost < bestCost) {
      bestCost = cost
      best = shift
    }
  }
  const out = new Float64Array(b.length)
  for (let i = 0; i < count; i++) {
    const j = ((i + best) % count) * 2
    out[i * 2] = b[j]!
    out[i * 2 + 1] = b[j + 1]!
  }
  return out
}

const round = (n: number) => Math.round(n * 100) / 100

/** A smooth closed path through the points (Catmull-Rom curves drawn as cubic Béziers). */
export function pointsToPath(points: Float64Array, size = 1): string {
  const count = points.length / 2
  const x = (i: number) => points[((i + count) % count) * 2]! * size
  const y = (i: number) => points[((i + count) % count) * 2 + 1]! * size
  let d = `M${round(x(0))} ${round(y(0))}`
  for (let i = 0; i < count; i++) {
    const c1x = x(i) + (x(i + 1) - x(i - 1)) / 6
    const c1y = y(i) + (y(i + 1) - y(i - 1)) / 6
    const c2x = x(i + 1) - (x(i + 2) - x(i)) / 6
    const c2y = y(i + 1) - (y(i + 2) - y(i)) / 6
    d += `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(x(i + 1))} ${round(y(i + 1))}`
  }
  return `${d}Z`
}

/** A morph between two outlines: `path(progress)` draws the in-between shape. */
export interface Morph {
  /** SVG path data at `progress` (0 = start shape, 1 = end shape; overshoot is allowed). */
  path: (progress: number, size?: number) => string
  /** Interpolated points at `progress`, for custom drawing. */
  points: (progress: number) => Float64Array
}

type ShapeInput = MaterialShapeName | RoundedPolygon

const toPolygon = (shape: ShapeInput) => (typeof shape === 'string' ? materialShape(shape) : shape)

const cache = new Map<string, Morph>()

/** Creates (and caches, for library shapes) a morph from one shape to another. */
export function createMorph(from: ShapeInput, to: ShapeInput): Morph {
  const key = typeof from === 'string' && typeof to === 'string' ? `${from}>${to}` : null
  const cached = key ? cache.get(key) : undefined
  if (cached) return cached
  const fromPolygon = toPolygon(from)
  const toPolygonValue = toPolygon(to)
  const a = sampleOutline(fromPolygon)
  const b = align(a, sampleOutline(toPolygonValue))
  const buffer = new Float64Array(a.length)
  const points = (progress: number) => {
    for (let i = 0; i < a.length; i++) buffer[i] = a[i]! + (b[i]! - a[i]!) * progress
    return buffer
  }
  const morph: Morph = {
    points,
    path: (progress, size = 1) => {
      // At rest, draw the exact outlines.
      if (progress === 0) return polygonToPath(fromPolygon, size)
      if (progress === 1) return polygonToPath(toPolygonValue, size)
      return pointsToPath(points(progress), size)
    },
  }
  if (key) cache.set(key, morph)
  return morph
}

/**
 * The Material shape library: the 35 shapes of M3 Expressive, defined as in Jetpack Compose
 * `MaterialShapes` and built with the rounded-polygon port in `./polygon`. Every shape fits the
 * unit square.
 */
import {
  type CornerRounding,
  circle,
  normalizePolygon,
  polygonToPath,
  type RoundedPolygon,
  rectangle,
  regularPolygon,
  rotatePolygon,
  roundedPolygon,
  scalePolygon,
  star,
  transformPolygon,
  UNROUNDED,
} from './polygon'

/** The name of a shape in the Material shape library. */
export type MaterialShapeName =
  | 'circle'
  | 'square'
  | 'slanted'
  | 'arch'
  | 'fan'
  | 'arrow'
  | 'semicircle'
  | 'oval'
  | 'pill'
  | 'triangle'
  | 'diamond'
  | 'clamshell'
  | 'pentagon'
  | 'gem'
  | 'sunny'
  | 'very-sunny'
  | 'cookie-4'
  | 'cookie-6'
  | 'cookie-7'
  | 'cookie-9'
  | 'cookie-12'
  | 'ghostish'
  | 'clover-4'
  | 'clover-8'
  | 'burst'
  | 'soft-burst'
  | 'boom'
  | 'soft-boom'
  | 'flower'
  | 'puffy'
  | 'puffy-diamond'
  | 'pixel-circle'
  | 'pixel-triangle'
  | 'bun'
  | 'heart'

type PointRound = readonly [x: number, y: number, rounding?: CornerRounding]

const r15: CornerRounding = { radius: 0.15 }
const r20: CornerRounding = { radius: 0.2 }
const r30: CornerRounding = { radius: 0.3 }
const r50: CornerRounding = { radius: 0.5 }
const r100: CornerRounding = { radius: 1 }

const CENTER = 0.5

/** Repeats a section of vertices around the center, optionally mirroring every other copy. */
function repeat(points: readonly PointRound[], reps: number, mirroring: boolean): PointRound[] {
  const out: PointRound[] = []
  if (mirroring) {
    const angles = points.map(([x, y]) => (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI)
    const distances = points.map(([x, y]) => Math.hypot(x - CENTER, y - CENTER))
    const actualReps = reps * 2
    const sectionAngle = 360 / actualReps
    for (let it = 0; it < actualReps; it++) {
      for (let index = 0; index < points.length; index++) {
        const i = it % 2 === 0 ? index : points.length - 1 - index
        if (i > 0 || it % 2 === 0) {
          const degrees =
            sectionAngle * it +
            (it % 2 === 0 ? angles[i]! : sectionAngle - angles[i]! + 2 * angles[0]!)
          const a = (degrees * Math.PI) / 180
          out.push([
            Math.cos(a) * distances[i]! + CENTER,
            Math.sin(a) * distances[i]! + CENTER,
            points[i]![2],
          ])
        }
      }
    }
    return out
  }
  for (let k = 0; k < points.length * reps; k++) {
    const [x, y, rounding] = points[k % points.length]!
    const a = ((Math.floor(k / points.length) * 360) / reps) * (Math.PI / 180)
    const dx = x - CENTER
    const dy = y - CENTER
    out.push([
      dx * Math.cos(a) - dy * Math.sin(a) + CENTER,
      dx * Math.sin(a) + dy * Math.cos(a) + CENTER,
      rounding,
    ])
  }
  return out
}

function custom(points: readonly PointRound[], reps: number, mirroring = false): RoundedPolygon {
  const all = repeat(points, reps, mirroring)
  return roundedPolygon(
    all.flatMap(([x, y]) => [x, y] as const),
    UNROUNDED,
    all.map(([, , rounding]) => rounding ?? UNROUNDED),
    [CENTER, CENTER],
  )
}

const rot = (polygon: RoundedPolygon, degrees: number) => rotatePolygon(polygon, degrees)

const DEFINITIONS: Record<MaterialShapeName, () => RoundedPolygon> = {
  circle: () => circle(10),
  square: () => rectangle(1, 1, r30),
  slanted: () =>
    custom(
      [
        [0.926, 0.97, { radius: 0.189, smoothing: 0.811 }],
        [-0.021, 0.967, { radius: 0.187, smoothing: 0.057 }],
      ],
      2,
    ),
  arch: () => rot(regularPolygon(4, { perVertexRounding: [r100, r100, r20, r20] }), -135),
  fan: () =>
    custom(
      [
        [1.004, 1, { radius: 0.148, smoothing: 0.417 }],
        [0, 1, { radius: 0.151 }],
        [0, -0.003, { radius: 0.148 }],
        [0.978, 0.02, { radius: 0.803 }],
      ],
      1,
    ),
  arrow: () =>
    custom(
      [
        [0.5, 0.892, { radius: 0.313 }],
        [-0.216, 1.05, { radius: 0.207 }],
        [0.499, -0.16, { radius: 0.215, smoothing: 1 }],
        [1.225, 1.06, { radius: 0.211 }],
      ],
      1,
    ),
  semicircle: () => rectangle(1.6, 1, undefined, [r20, r20, r100, r100]),
  oval: () => rot(scalePolygon(circle(), 1, 0.64), -45),
  pill: () =>
    custom(
      [
        [0.961, 0.039, { radius: 0.426 }],
        [1.001, 0.428],
        [1, 0.609, { radius: 1 }],
      ],
      2,
      true,
    ),
  triangle: () => rot(regularPolygon(3, { rounding: r20 }), -90),
  diamond: () =>
    custom(
      [
        [0.5, 1.096, { radius: 0.151, smoothing: 0.524 }],
        [0.04, 0.5, { radius: 0.159 }],
      ],
      2,
    ),
  clamshell: () =>
    custom(
      [
        [0.171, 0.841, { radius: 0.159 }],
        [-0.02, 0.5, { radius: 0.14 }],
        [0.17, 0.159, { radius: 0.159 }],
      ],
      2,
    ),
  pentagon: () =>
    custom(
      [
        [0.5, -0.009, { radius: 0.172 }],
        [1.03, 0.365, { radius: 0.164 }],
        [0.828, 0.97, { radius: 0.169 }],
      ],
      1,
      true,
    ),
  gem: () =>
    custom(
      [
        [0.499, 1.023, { radius: 0.241, smoothing: 0.778 }],
        [-0.005, 0.792, { radius: 0.208 }],
        [0.073, 0.258, { radius: 0.228 }],
        [0.433, 0, { radius: 0.491 }],
      ],
      1,
      true,
    ),
  sunny: () => star(8, 0.8, r15),
  'very-sunny': () =>
    custom(
      [
        [0.5, 1.08, { radius: 0.085 }],
        [0.358, 0.843, { radius: 0.085 }],
      ],
      8,
    ),
  'cookie-4': () =>
    custom(
      [
        [1.237, 1.236, { radius: 0.258 }],
        [0.5, 0.918, { radius: 0.233 }],
      ],
      4,
    ),
  'cookie-6': () =>
    custom(
      [
        [0.723, 0.884, { radius: 0.394 }],
        [0.5, 1.099, { radius: 0.398 }],
      ],
      6,
    ),
  'cookie-7': () => rot(star(7, 0.75, r50), -90),
  'cookie-9': () => rot(star(9, 0.8, r50), -90),
  'cookie-12': () => rot(star(12, 0.8, r50), -90),
  ghostish: () =>
    custom(
      [
        [0.5, 0, { radius: 1 }],
        [1, 0, { radius: 1 }],
        [1, 1.14, { radius: 0.254, smoothing: 0.106 }],
        [0.575, 0.906, { radius: 0.253 }],
      ],
      1,
      true,
    ),
  'clover-4': () =>
    custom(
      [
        [0.5, 0.074],
        [0.725, -0.099, { radius: 0.476 }],
      ],
      4,
      true,
    ),
  'clover-8': () =>
    custom(
      [
        [0.5, 0.036],
        [0.758, -0.101, { radius: 0.209 }],
      ],
      8,
    ),
  burst: () =>
    custom(
      [
        [0.5, -0.006, { radius: 0.006 }],
        [0.592, 0.158, { radius: 0.006 }],
      ],
      12,
    ),
  'soft-burst': () =>
    custom(
      [
        [0.193, 0.277, { radius: 0.053 }],
        [0.176, 0.055, { radius: 0.053 }],
      ],
      10,
    ),
  boom: () =>
    custom(
      [
        [0.457, 0.296, { radius: 0.007 }],
        [0.5, -0.051, { radius: 0.007 }],
      ],
      15,
    ),
  'soft-boom': () =>
    custom(
      [
        [0.733, 0.454],
        [0.839, 0.437, { radius: 0.532 }],
        [0.949, 0.449, { radius: 0.439, smoothing: 1 }],
        [0.998, 0.478, { radius: 0.174 }],
      ],
      16,
      true,
    ),
  flower: () =>
    custom(
      [
        [0.37, 0.187],
        [0.416, 0.049, { radius: 0.381 }],
        [0.479, 0.001, { radius: 0.095 }],
      ],
      8,
      true,
    ),
  puffy: () =>
    transformPolygon(
      custom(
        [
          [0.5, 0.053],
          [0.545, -0.04, { radius: 0.405 }],
          [0.67, -0.035, { radius: 0.426 }],
          [0.717, 0.066, { radius: 0.574 }],
          [0.722, 0.128],
          [0.777, 0.002, { radius: 0.36 }],
          [0.914, 0.149, { radius: 0.66 }],
          [0.926, 0.289, { radius: 0.66 }],
          [0.881, 0.346],
          [0.94, 0.344, { radius: 0.126 }],
          [1.003, 0.437, { radius: 0.255 }],
        ],
        2,
        true,
      ),
      (x, y) => [x, y * 0.742],
    ),
  'puffy-diamond': () =>
    custom(
      [
        [0.87, 0.13, { radius: 0.146 }],
        [0.818, 0.357],
        [1, 0.332, { radius: 0.853 }],
      ],
      4,
      true,
    ),
  'pixel-circle': () =>
    custom(
      [
        [0.5, 0],
        [0.704, 0],
        [0.704, 0.065],
        [0.843, 0.065],
        [0.843, 0.148],
        [0.926, 0.148],
        [0.926, 0.296],
        [1, 0.296],
      ],
      2,
      true,
    ),
  'pixel-triangle': () =>
    custom(
      [
        [0.11, 0.5],
        [0.113, 0],
        [0.287, 0],
        [0.287, 0.087],
        [0.421, 0.087],
        [0.421, 0.17],
        [0.56, 0.17],
        [0.56, 0.265],
        [0.674, 0.265],
        [0.675, 0.344],
        [0.789, 0.344],
        [0.789, 0.439],
        [0.888, 0.439],
      ],
      1,
      true,
    ),
  bun: () =>
    custom(
      [
        [0.796, 0.5],
        [0.853, 0.518, { radius: 1 }],
        [0.992, 0.631, { radius: 1 }],
        [0.968, 1, { radius: 1 }],
      ],
      2,
      true,
    ),
  heart: () =>
    custom(
      [
        [0.5, 0.268, { radius: 0.016 }],
        [0.792, -0.066, { radius: 0.958 }],
        [1.064, 0.276, { radius: 1 }],
        [0.501, 0.946, { radius: 0.129 }],
      ],
      1,
      true,
    ),
}

/** Every shape of the Material shape library, in the order of the spec. */
export const MATERIAL_SHAPES = Object.keys(DEFINITIONS) as readonly MaterialShapeName[]

const polygons = new Map<MaterialShapeName, RoundedPolygon>()
const paths = new Map<MaterialShapeName, string>()

/** The outline of a Material shape, fitted to the unit square. */
export function materialShape(name: MaterialShapeName): RoundedPolygon {
  let polygon = polygons.get(name)
  if (!polygon) {
    const define = DEFINITIONS[name]
    if (!define) throw new Error(`Unknown Material shape: ${name}`)
    polygon = normalizePolygon(define())
    polygons.set(name, polygon)
  }
  return polygon
}

/** SVG path data of a Material shape in a `size` × `size` box (default: the unit square). */
export function shapePath(name: MaterialShapeName, size = 1): string {
  if (size !== 1) return polygonToPath(materialShape(name), size)
  let path = paths.get(name)
  if (!path) {
    path = polygonToPath(materialShape(name))
    paths.set(name, path)
  }
  return path
}

/**
 * A CSS `url()` with an SVG of the shape, for `mask-image` (or `-webkit-mask-image`): crops any
 * element, such as an image or avatar, to the shape at whatever size it has.
 */
export function shapeMaskImage(name: MaterialShapeName): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${shapePath(name, 100)}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** True when the string names a shape of the Material shape library. */
export function isMaterialShape(name: string): name is MaterialShapeName {
  return name in DEFINITIONS
}

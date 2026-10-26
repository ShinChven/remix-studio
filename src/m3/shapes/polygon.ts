/**
 * Rounded polygons: a TypeScript port of the geometry in `androidx.graphics.shapes`
 * (RoundedPolygon, CornerRounding and the circle / rectangle / star factories), which Jetpack
 * Compose uses to build the Material shape library. A polygon becomes a closed outline of cubic
 * Bézier curves: each vertex is rounded with a circular arc, optionally smoothed by two flanking
 * curves, and joined to the next vertex by a straight edge.
 */

/** A cubic Bézier curve: `[x0, y0, c0x, c0y, c1x, c1y, x1, y1]`. */
export type Cubic = readonly [number, number, number, number, number, number, number, number]

/** Rounding of one vertex: `radius` of the arc, `smoothing` from 0 (arc only) to 1 (smoothest). */
export interface CornerRounding {
  radius: number
  smoothing?: number
}

/** A sharp vertex. */
export const UNROUNDED: CornerRounding = { radius: 0, smoothing: 0 }

const EPSILON = 1e-4

type Vec = readonly [number, number]

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1]
const length = (a: Vec) => Math.hypot(a[0], a[1])
const rotate90 = (a: Vec): Vec => [-a[1], a[0]]
const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]
function direction(a: Vec): Vec {
  const d = length(a)
  return d > 0 ? [a[0] / d, a[1] / d] : [0, 0]
}

function straightLine(x0: number, y0: number, x1: number, y1: number): Cubic {
  return [
    x0,
    y0,
    x0 + (x1 - x0) / 3,
    y0 + (y1 - y0) / 3,
    x0 + ((x1 - x0) * 2) / 3,
    y0 + ((y1 - y0) * 2) / 3,
    x1,
    y1,
  ]
}

function circularArc(center: Vec, p0: Vec, p1: Vec): Cubic {
  const p0d = direction(sub(p0, center))
  const p1d = direction(sub(p1, center))
  const rotatedP0 = rotate90(p0d)
  const rotatedP1 = rotate90(p1d)
  const clockwise = dot(rotatedP0, sub(p1, center)) >= 0
  const cosa = dot(p0d, p1d)
  if (cosa > 0.999) return straightLine(p0[0], p0[1], p1[0], p1[1])
  const k =
    ((((length(sub(p0, center)) * 4) / 3) *
      (Math.sqrt(2 * (1 - cosa)) - Math.sqrt(1 - cosa * cosa))) /
      (1 - cosa)) *
    (clockwise ? 1 : -1)
  return [
    p0[0],
    p0[1],
    p0[0] + rotatedP0[0] * k,
    p0[1] + rotatedP0[1] * k,
    p1[0] - rotatedP1[0] * k,
    p1[1] - rotatedP1[1] * k,
    p1[0],
    p1[1],
  ]
}

function reverse(c: Cubic): Cubic {
  return [c[6], c[7], c[4], c[5], c[2], c[3], c[0], c[1]]
}

function lineIntersection(p0: Vec, d0: Vec, p1: Vec, d1: Vec): Vec | null {
  const rotatedD1 = rotate90(d1)
  const den = dot(d0, rotatedD1)
  if (Math.abs(den) < EPSILON) return null
  const num = dot(sub(p1, p0), rotatedD1)
  if (Math.abs(den) < EPSILON * Math.abs(num)) return null
  return add(p0, mul(d0, num / den))
}

/** The rounding of one vertex, given its neighbours. */
class RoundedCorner {
  readonly p0: Vec
  readonly p1: Vec
  readonly p2: Vec
  readonly d1: Vec
  readonly d2: Vec
  readonly cornerRadius: number
  readonly smoothing: number
  readonly expectedRoundCut: number

  constructor(p0: Vec, p1: Vec, p2: Vec, rounding: CornerRounding) {
    this.p0 = p0
    this.p1 = p1
    this.p2 = p2
    const v01 = sub(p0, p1)
    const v21 = sub(p2, p1)
    const d01 = length(v01)
    const d21 = length(v21)
    if (d01 > 0 && d21 > 0) {
      this.d1 = mul(v01, 1 / d01)
      this.d2 = mul(v21, 1 / d21)
      this.cornerRadius = rounding.radius
      this.smoothing = rounding.smoothing ?? 0
      const cosAngle = dot(this.d1, this.d2)
      const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle))
      // tan(A/2) = sin(A) / (1 + cos(A)) = radius / cut
      this.expectedRoundCut = sinAngle > 1e-3 ? (this.cornerRadius * (cosAngle + 1)) / sinAngle : 0
    } else {
      this.d1 = [0, 0]
      this.d2 = [0, 0]
      this.cornerRadius = 0
      this.smoothing = 0
      this.expectedRoundCut = 0
    }
  }

  /** Smoothing lengthens the cut: 0 is the round cut, 1 doubles it. */
  get expectedCut() {
    return (1 + this.smoothing) * this.expectedRoundCut
  }

  cubics(allowedCut0: number, allowedCut1: number): Cubic[] {
    const allowedCut = Math.min(allowedCut0, allowedCut1)
    const { p1 } = this
    if (this.expectedRoundCut < EPSILON || allowedCut < EPSILON || this.cornerRadius < EPSILON) {
      return [straightLine(p1[0], p1[1], p1[0], p1[1])]
    }
    const actualRoundCut = Math.min(allowedCut, this.expectedRoundCut)
    const smoothing0 = this.actualSmoothing(allowedCut0)
    const smoothing1 = this.actualSmoothing(allowedCut1)
    const actualR = (this.cornerRadius * actualRoundCut) / this.expectedRoundCut
    const centerDistance = Math.sqrt(actualR * actualR + actualRoundCut * actualRoundCut)
    const center = add(p1, mul(direction(mul(add(this.d1, this.d2), 0.5)), centerDistance))
    const circleIntersection0 = add(p1, mul(this.d1, actualRoundCut))
    const circleIntersection2 = add(p1, mul(this.d2, actualRoundCut))
    const flanking0 = this.flankingCurve(
      actualRoundCut,
      smoothing0,
      this.p0,
      circleIntersection0,
      circleIntersection2,
      center,
      actualR,
    )
    const flanking2 = reverse(
      this.flankingCurve(
        actualRoundCut,
        smoothing1,
        this.p2,
        circleIntersection2,
        circleIntersection0,
        center,
        actualR,
      ),
    )
    return [
      flanking0,
      circularArc(center, [flanking0[6], flanking0[7]], [flanking2[0], flanking2[1]]),
      flanking2,
    ]
  }

  private actualSmoothing(allowedCut: number) {
    if (allowedCut > this.expectedCut) return this.smoothing
    if (allowedCut > this.expectedRoundCut) {
      return (
        (this.smoothing * (allowedCut - this.expectedRoundCut)) /
        (this.expectedCut - this.expectedRoundCut)
      )
    }
    return 0
  }

  private flankingCurve(
    actualRoundCut: number,
    smoothing: number,
    sideStart: Vec,
    circleSegmentIntersection: Vec,
    otherCircleSegmentIntersection: Vec,
    circleCenter: Vec,
    actualR: number,
  ): Cubic {
    const corner = this.p1
    const sideDirection = direction(sub(sideStart, corner))
    const curveStart = add(corner, mul(sideDirection, actualRoundCut * (1 + smoothing)))
    // Cut a part of the circle section proportional to 1 - smoothing.
    const p = lerp(
      circleSegmentIntersection,
      mul(add(circleSegmentIntersection, otherCircleSegmentIntersection), 0.5),
      smoothing,
    )
    const curveEnd = add(circleCenter, mul(direction(sub(p, circleCenter)), actualR))
    const circleTangent = rotate90(sub(curveEnd, circleCenter))
    const anchorEnd =
      lineIntersection(sideStart, sideDirection, curveEnd, circleTangent) ??
      circleSegmentIntersection
    const anchorStart = mul(add(curveStart, mul(anchorEnd, 2)), 1 / 3)
    return [
      curveStart[0],
      curveStart[1],
      anchorStart[0],
      anchorStart[1],
      anchorEnd[0],
      anchorEnd[1],
      curveEnd[0],
      curveEnd[1],
    ]
  }
}

/** A closed outline of cubic curves, with the center it was built around. */
export interface RoundedPolygon {
  cubics: Cubic[]
  center: Vec
}

/**
 * Builds a rounded polygon from vertices `[x0, y0, x1, y1, …]`. `rounding` applies to every
 * vertex unless `perVertexRounding` gives one per vertex.
 */
export function roundedPolygon(
  vertices: readonly number[],
  rounding: CornerRounding = UNROUNDED,
  perVertexRounding?: readonly CornerRounding[],
  center?: Vec,
): RoundedPolygon {
  const n = vertices.length / 2
  if (n < 3) throw new Error('A polygon needs at least three vertices')
  const vertex = (i: number): Vec => [vertices[i * 2]!, vertices[i * 2 + 1]!]
  const corners: RoundedCorner[] = []
  for (let i = 0; i < n; i++) {
    corners.push(
      new RoundedCorner(
        vertex((i + n - 1) % n),
        vertex(i),
        vertex((i + 1) % n),
        perVertexRounding?.[i] ?? rounding,
      ),
    )
  }
  // For each side, how much of the round cut and of the smoothing both of its corners can have.
  const cutAdjusts = corners.map((corner, i) => {
    const next = corners[(i + 1) % n]!
    const expectedRoundCut = corner.expectedRoundCut + next.expectedRoundCut
    const expectedCut = corner.expectedCut + next.expectedCut
    const sideSize = length(sub(vertex(i), vertex((i + 1) % n)))
    if (expectedRoundCut > sideSize) return [sideSize / expectedRoundCut, 0] as const
    if (expectedCut > sideSize) {
      return [1, (sideSize - expectedRoundCut) / (expectedCut - expectedRoundCut)] as const
    }
    return [1, 1] as const
  })
  const cornerCubics = corners.map((corner, i) => {
    const allowed = [0, 1].map((delta) => {
      const [roundCutRatio, cutRatio] = cutAdjusts[(i + n - 1 + delta) % n]!
      return (
        corner.expectedRoundCut * roundCutRatio +
        (corner.expectedCut - corner.expectedRoundCut) * cutRatio
      )
    })
    return corner.cubics(allowed[0]!, allowed[1]!)
  })
  const cubics: Cubic[] = []
  for (let i = 0; i < n; i++) {
    const here = cornerCubics[i]!
    const next = cornerCubics[(i + 1) % n]!
    cubics.push(...here)
    const last = here[here.length - 1]!
    const first = next[0]!
    cubics.push(straightLine(last[6], last[7], first[0], first[1]))
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    cx += vertices[i * 2]!
    cy += vertices[i * 2 + 1]!
  }
  return {
    // Zero-length corners of sharp vertices add nothing to the outline.
    cubics: cubics.filter((c) => c[0] !== c[6] || c[1] !== c[7] || c[0] !== c[2] || c[1] !== c[3]),
    center: center ?? [cx / n, cy / n],
  }
}

/** A regular polygon with `numVertices` vertices on a circle of `radius`, the first at angle 0. */
export function regularPolygon(
  numVertices: number,
  options: {
    radius?: number
    rounding?: CornerRounding
    perVertexRounding?: readonly CornerRounding[]
  } = {},
): RoundedPolygon {
  const { radius = 1, rounding, perVertexRounding } = options
  const vertices: number[] = []
  for (let i = 0; i < numVertices; i++) {
    const angle = ((Math.PI * 2) / numVertices) * i
    vertices.push(radius * Math.cos(angle), radius * Math.sin(angle))
  }
  return roundedPolygon(vertices, rounding, perVertexRounding, [0, 0])
}

/** A circle, approximated by a fully rounded regular polygon. */
export function circle(numVertices = 8, radius = 1): RoundedPolygon {
  const polygonRadius = radius / Math.cos(Math.PI / numVertices)
  return regularPolygon(numVertices, { radius: polygonRadius, rounding: { radius } })
}

/** A rectangle centred on the origin. */
export function rectangle(
  width: number,
  height: number,
  rounding?: CornerRounding,
  perVertexRounding?: readonly CornerRounding[],
): RoundedPolygon {
  const l = -width / 2
  const t = -height / 2
  const r = width / 2
  const b = height / 2
  return roundedPolygon([r, b, l, b, l, t, r, t], rounding, perVertexRounding, [0, 0])
}

/** A star with `points` outer vertices alternating with inner vertices at `innerRadius`. */
export function star(
  points: number,
  innerRadius: number,
  rounding?: CornerRounding,
): RoundedPolygon {
  const vertices: number[] = []
  for (let i = 0; i < points; i++) {
    const outer = (Math.PI / points) * 2 * i
    const inner = (Math.PI / points) * (2 * i + 1)
    vertices.push(Math.cos(outer), Math.sin(outer))
    vertices.push(innerRadius * Math.cos(inner), innerRadius * Math.sin(inner))
  }
  return roundedPolygon(vertices, rounding, undefined, [0, 0])
}

/** Applies a point transform to every control point (affine transforms keep curves exact). */
export function transformPolygon(
  polygon: RoundedPolygon,
  f: (x: number, y: number) => Vec,
): RoundedPolygon {
  return {
    cubics: polygon.cubics.map((c) => {
      const a = f(c[0], c[1])
      const b = f(c[2], c[3])
      const d = f(c[4], c[5])
      const e = f(c[6], c[7])
      return [a[0], a[1], b[0], b[1], d[0], d[1], e[0], e[1]] as Cubic
    }),
    center: f(polygon.center[0], polygon.center[1]),
  }
}

/** Rotates a polygon around the origin by `degrees` (clockwise on screen). */
export function rotatePolygon(polygon: RoundedPolygon, degrees: number): RoundedPolygon {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return transformPolygon(polygon, (x, y) => [c * x - s * y, s * x + c * y])
}

/** Scales a polygon around the origin. */
export function scalePolygon(polygon: RoundedPolygon, sx: number, sy = sx): RoundedPolygon {
  return transformPolygon(polygon, (x, y) => [x * sx, y * sy])
}

/**
 * Fits a polygon into the unit square (keeping its aspect ratio, centred), measured by the
 * control points of its curves as `RoundedPolygon.normalized()` does.
 */
export function normalizePolygon(polygon: RoundedPolygon): RoundedPolygon {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const c of polygon.cubics) {
    for (let i = 0; i < 8; i += 2) {
      minX = Math.min(minX, c[i]!)
      maxX = Math.max(maxX, c[i]!)
      minY = Math.min(minY, c[i + 1]!)
      maxY = Math.max(maxY, c[i + 1]!)
    }
  }
  const width = maxX - minX
  const height = maxY - minY
  const side = Math.max(width, height)
  const offsetX = (side - width) / 2 - minX
  const offsetY = (side - height) / 2 - minY
  return transformPolygon(polygon, (x, y) => [(x + offsetX) / side, (y + offsetY) / side])
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** SVG path data for the outline, scaled from the unit square to `size`. */
export function polygonToPath(polygon: RoundedPolygon, size = 1): string {
  const { cubics } = polygon
  if (cubics.length === 0) return ''
  const s = (n: number) => round(n * size)
  const first = cubics[0]!
  let d = `M${s(first[0])} ${s(first[1])}`
  for (const c of cubics) {
    d += `C${s(c[2])} ${s(c[3])} ${s(c[4])} ${s(c[5])} ${s(c[6])} ${s(c[7])}`
  }
  return `${d}Z`
}

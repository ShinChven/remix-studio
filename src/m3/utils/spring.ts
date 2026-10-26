/**
 * M3 Expressive motion physics: the spring tokens of both motion schemes, a damped-spring solver,
 * and the conversions used by CSS (`linear()` curves) and JS animations. Dependency-free, so it
 * also runs on the server and in build scripts.
 */

/** Motion scheme: Expressive (bouncy, the default) or Standard (calmer, for utilitarian apps). */
export type MotionScheme = 'expressive' | 'standard'
/** Spring speed: fast for small elements, default for most, slow for full-screen motion. */
export type SpringSpeed = 'fast' | 'default' | 'slow'
/** Spatial springs move things (position, size, corners) and overshoot; effects springs fade. */
export type SpringKind = 'spatial' | 'effects'

/** A spring: damping ratio (1 = no overshoot) and stiffness (higher = faster). Mass is 1. */
export interface SpringSpec {
  damping: number
  stiffness: number
}

/** The spring tokens (`md.sys.motion.spring.<speed>.<kind>`) of each motion scheme. */
export const SPRINGS: Record<MotionScheme, Record<SpringSpeed, Record<SpringKind, SpringSpec>>> = {
  expressive: {
    fast: { spatial: { damping: 0.6, stiffness: 800 }, effects: { damping: 1, stiffness: 3800 } },
    default: {
      spatial: { damping: 0.8, stiffness: 380 },
      effects: { damping: 1, stiffness: 1600 },
    },
    slow: { spatial: { damping: 0.8, stiffness: 200 }, effects: { damping: 1, stiffness: 800 } },
  },
  standard: {
    fast: { spatial: { damping: 0.9, stiffness: 1400 }, effects: { damping: 1, stiffness: 3800 } },
    default: {
      spatial: { damping: 0.9, stiffness: 700 },
      effects: { damping: 1, stiffness: 1600 },
    },
    slow: { spatial: { damping: 0.9, stiffness: 300 }, effects: { damping: 1, stiffness: 800 } },
  },
}

/** Every motion scheme. */
export const MOTION_SCHEMES: readonly MotionScheme[] = ['expressive', 'standard']

/**
 * Position of a spring released from 0 towards 1 with the given initial velocity (units per
 * second), `t` seconds after release.
 */
export function springValue(spec: SpringSpec, t: number, velocity = 0): number {
  const { damping: zeta, stiffness } = spec
  const w0 = Math.sqrt(stiffness)
  // x(t) measures the remaining distance: starts at -1 (we report 1 + x).
  const x0 = -1
  const v0 = velocity
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const envelope = Math.exp(-zeta * w0 * t)
    const x = envelope * (x0 * Math.cos(wd * t) + ((v0 + zeta * w0 * x0) / wd) * Math.sin(wd * t))
    return 1 + x
  }
  // Critically damped (overdamped springs are treated as critical: M3 tokens never use them).
  const x = Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t)
  return 1 + x
}

/** Velocity (units per second) of the spring from `springValue` at time `t`. */
export function springVelocity(spec: SpringSpec, t: number, velocity = 0): number {
  const h = 1e-4
  return (springValue(spec, t + h, velocity) - springValue(spec, t, velocity)) / h
}

/** Seconds until the spring stays within `threshold` of its target. */
export function springDuration(spec: SpringSpec, threshold = 0.001, velocity = 0): number {
  const step = 1 / 240
  let settledSince = 0
  for (let t = 0; t < 10; t += step) {
    if (Math.abs(springValue(spec, t, velocity) - 1) > threshold) settledSince = t + step
    else if (t - settledSince > 0.1) break
  }
  return settledSince
}

/** A CSS `linear()` easing that traces the spring, with its duration in milliseconds. */
export function springToLinear(
  spec: SpringSpec,
  samples = 40,
): { easing: string; duration: number } {
  const seconds = springDuration(spec)
  const points: string[] = []
  for (let i = 0; i <= samples; i++) {
    const value = i === samples ? 1 : springValue(spec, (seconds * i) / samples)
    points.push(String(Math.round(value * 1000) / 1000))
  }
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(seconds * 1000) }
}

/** Reads the motion scheme in effect for an element (`data-motion-scheme` on it or an ancestor). */
export function motionSchemeOf(element: Element | null | undefined): MotionScheme {
  const holder = element?.closest('[data-motion-scheme]')
  return holder?.getAttribute('data-motion-scheme') === 'standard' ? 'standard' : 'expressive'
}

export interface SpringAnimationOptions {
  /** Start value. */
  from: number
  /** Target value. */
  to: number
  /** The spring. */
  spring: SpringSpec
  /** Initial velocity in units per second. */
  velocity?: number
  /** Called on every frame with the current value and velocity. */
  onUpdate: (value: number, velocity: number) => void
  /** Called once the spring settles at `to`. */
  onComplete?: () => void
}

/**
 * Animates a number with a spring on `requestAnimationFrame`. Returns a function that stops the
 * animation and reports the value and velocity at that moment, so a gesture or a new target can
 * take over without a jump (the spring is interruptible).
 */
export function animateSpring(options: SpringAnimationOptions): () => {
  value: number
  velocity: number
} {
  const { from, to, spring, velocity = 0, onUpdate, onComplete } = options
  const distance = to - from
  let value = from
  let currentVelocity = velocity
  if (distance === 0 && velocity === 0) {
    onUpdate(to, 0)
    onComplete?.()
    return () => ({ value: to, velocity: 0 })
  }
  // Normalize the velocity to the 0 → 1 progress space of springValue.
  const normalizedVelocity = distance === 0 ? 0 : velocity / distance
  const duration = springDuration(spring, 0.0005, normalizedVelocity)
  let frame = 0
  let start = 0
  const tick = (now: number) => {
    if (!start) start = now
    const t = (now - start) / 1000
    if (t >= duration) {
      value = to
      currentVelocity = 0
      onUpdate(to, 0)
      onComplete?.()
      return
    }
    const progress = springValue(spring, t, normalizedVelocity)
    value = from + distance * progress
    currentVelocity = springVelocity(spring, t, normalizedVelocity) * distance
    onUpdate(value, currentVelocity)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    return { value, velocity: currentVelocity }
  }
}

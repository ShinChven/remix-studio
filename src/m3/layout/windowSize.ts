import { useMediaQuery } from '../utils/hooks'

/** M3 window size classes. */
export type WindowSizeClass = 'compact' | 'medium' | 'expanded' | 'large' | 'extra-large'

/** Lower bounds (dp ≈ CSS px) of each class above compact. */
export const WINDOW_BREAKPOINTS = {
  medium: 600,
  expanded: 840,
  large: 1200,
  'extra-large': 1600,
} as const

const ORDER: WindowSizeClass[] = ['compact', 'medium', 'expanded', 'large', 'extra-large']

/** The current window size class. `fallback` is used during SSR. */
export function useWindowSizeClass(fallback: WindowSizeClass = 'expanded'): WindowSizeClass {
  const index = ORDER.indexOf(fallback)
  const medium = useMediaQuery(`(min-width: ${WINDOW_BREAKPOINTS.medium}px)`, index >= 1)
  const expanded = useMediaQuery(`(min-width: ${WINDOW_BREAKPOINTS.expanded}px)`, index >= 2)
  const large = useMediaQuery(`(min-width: ${WINDOW_BREAKPOINTS.large}px)`, index >= 3)
  const extraLarge = useMediaQuery(
    `(min-width: ${WINDOW_BREAKPOINTS['extra-large']}px)`,
    index >= 4,
  )
  if (extraLarge) return 'extra-large'
  if (large) return 'large'
  if (expanded) return 'expanded'
  if (medium) return 'medium'
  return 'compact'
}

/** True when `current` is at least `min`. */
export function isAtLeast(current: WindowSizeClass, min: WindowSizeClass): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(min)
}

import {
  type Ref,
  type RefCallback,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

/** Joins class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Keeps a ref pointing at the latest value, for use inside long-lived listeners. */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useIsoLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

/** A stable function identity that always calls the latest callback. */
export function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useLatest(fn)
  return useCallback((...args: A) => ref.current(...args), [ref])
}

interface ControllableOptions<T> {
  value: T | undefined
  defaultValue: T
  onChange?: ((value: T) => void) | undefined
}

/** State that is controlled when `value` is defined and uncontrolled otherwise. */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: ControllableOptions<T>): [T, (next: T | ((prev: T) => T)) => void] {
  const [inner, setInner] = useState(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? (value as T) : inner
  const currentRef = useRef(current)
  currentRef.current = current
  const onChangeRef = useLatest(onChange)

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(currentRef.current) : next
      if (Object.is(resolved, currentRef.current)) return
      currentRef.current = resolved
      if (!controlled) setInner(resolved)
      onChangeRef.current?.(resolved)
    },
    [controlled, onChangeRef],
  )
  return [current, set]
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

/** Merges several refs into one callback ref. */
export function useMergedRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return useCallback(
    (value: T | null) => {
      for (const ref of refs) assignRef(ref, value)
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: the refs themselves are the dependencies
    refs,
  )
}

const noopSubscribe = () => () => {}

/** True on the client after hydration, false during SSR. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/** Subscribes to a CSS media query. Returns `fallback` on the server. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(query).matches
        : fallback,
    () => fallback,
  )
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** Reads `dir` from the closest element (or the document) to support RTL layouts. */
export function isRtl(el: Element | null | undefined): boolean {
  if (!el) return typeof document !== 'undefined' && document.dir === 'rtl'
  return getComputedStyle(el).direction === 'rtl'
}

export type PresenceState = 'open' | 'closed'

/**
 * Keeps an overlay mounted while it animates out. Enter transitions use `@starting-style`
 * on `[data-state="open"]`; exit transitions run while `state` is `closed`.
 */
export function usePresence(
  open: boolean,
  exitMs: number,
): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    const ms = prefersReducedMotion() ? 0 : exitMs
    const timer = window.setTimeout(() => setMounted(false), ms)
    return () => window.clearTimeout(timer)
  }, [open, mounted, exitMs])
  return { mounted: open || mounted, state: open ? 'open' : 'closed' }
}

/** Generates a stable id, honoring an explicit one. */
export function useStableId(prefix: string, explicit?: string): string {
  const [id] = useState(() => `${prefix}-${Math.random().toString(36).slice(2, 10)}`)
  return explicit ?? id
}

/** Observes an element's content-box size. */
export function useElementSize<T extends Element>(ref: {
  current: T | null
}): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      )
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/**
 * Scrolls `container` so `el` is visible, without scrolling any other ancestor
 * (unlike `Element.scrollIntoView`, which also moves the page).
 */
export function scrollIntoContainer(
  container: HTMLElement,
  el: HTMLElement,
  align: 'nearest' | 'center' = 'nearest',
) {
  const box = container.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  const top = rect.top - box.top - container.clientTop + container.scrollTop
  const bottom = top + rect.height
  if (align === 'center') {
    container.scrollTop = top - (container.clientHeight - rect.height) / 2
  } else if (top < container.scrollTop) {
    container.scrollTop = top
  } else if (bottom > container.scrollTop + container.clientHeight) {
    container.scrollTop = bottom - container.clientHeight
  }
}

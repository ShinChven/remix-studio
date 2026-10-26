import { type RefObject, useEffect } from 'react'
import { useLatest } from './hooks'

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[inert],[hidden]')) return false
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true
}

/** Elements inside `root` reachable with the Tab key, in DOM order. */
export function getTabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.tabIndex >= 0 && isVisible(el) && el.getAttribute('aria-hidden') !== 'true',
  )
}

export interface FocusTrapOptions {
  /** Element to focus on activation. Defaults to `[data-autofocus]`, then the first tabbable element. */
  initialFocus?: RefObject<HTMLElement | null> | undefined
  restoreFocus?: boolean
  /** Only the top-most layer pulls focus back. */
  isTop?: () => boolean
}

/** Traps Tab focus inside `containerRef` while `active`, and restores focus afterwards. */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  options: FocusTrapOptions = {},
) {
  const optionsRef = useLatest(options)
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return
    const previous = document.activeElement as HTMLElement | null
    const { initialFocus } = optionsRef.current
    const target =
      initialFocus?.current ??
      container.querySelector<HTMLElement>('[data-autofocus]') ??
      getTabbable(container)[0] ??
      container
    if (target === container && container.tabIndex < 0 && !container.hasAttribute('tabindex')) {
      container.tabIndex = -1
    }
    target.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      if (optionsRef.current.isTop && !optionsRef.current.isTop()) return
      const tabbable = getTabbable(container)
      if (tabbable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = tabbable[0]!
      const last = tabbable.at(-1)!
      const activeEl = document.activeElement
      if (event.shiftKey && (activeEl === first || activeEl === container)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      const t = event.target as Node | null
      if (!t || container.contains(t)) return
      if (optionsRef.current.isTop && !optionsRef.current.isTop()) return
      ;(getTabbable(container)[0] ?? container).focus({ preventScroll: true })
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      if (optionsRef.current.restoreFocus !== false && previous?.isConnected) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [active, containerRef, optionsRef])
}

export type RovingOrientation = 'horizontal' | 'vertical' | 'both'

const ENABLED = ':not(:disabled):not([aria-disabled="true"])'

/**
 * Moves focus among `selector` items inside `container` in response to arrow/Home/End keys.
 * Returns the newly focused element, or null when the key is not a navigation key.
 */
export function handleRovingKeyDown(
  event: { key: string; preventDefault(): void; currentTarget: EventTarget | null },
  container: HTMLElement,
  selector: string,
  orientation: RovingOrientation = 'horizontal',
  loop = true,
): HTMLElement | null {
  // Skip disabled items and items that cannot take focus at all (no tabindex, not native controls).
  const items = [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => el.matches(ENABLED) && (el.tabIndex >= 0 || el.hasAttribute('tabindex')),
  )
  if (items.length === 0) return null
  const rtl = getComputedStyle(container).direction === 'rtl'
  const current = items.findIndex(
    (el) => el === document.activeElement || el.contains(document.activeElement),
  )
  const prevKeys =
    orientation === 'vertical'
      ? ['ArrowUp']
      : orientation === 'horizontal'
        ? [rtl ? 'ArrowRight' : 'ArrowLeft']
        : ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft']
  const nextKeys =
    orientation === 'vertical'
      ? ['ArrowDown']
      : orientation === 'horizontal'
        ? [rtl ? 'ArrowLeft' : 'ArrowRight']
        : ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight']
  let index: number
  if (nextKeys.includes(event.key)) {
    index = current + 1
    if (index >= items.length) index = loop ? 0 : items.length - 1
  } else if (prevKeys.includes(event.key)) {
    index = current - 1
    if (index < 0) index = loop ? items.length - 1 : 0
  } else if (event.key === 'Home') {
    index = 0
  } else if (event.key === 'End') {
    index = items.length - 1
  } else {
    return null
  }
  event.preventDefault()
  const next = items[index]!
  next.focus()
  return next
}

/** Typeahead: accumulates printable keys for 500 ms and finds the next matching label. */
export function createTypeahead() {
  let buffer = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  return (key: string, labels: string[], currentIndex: number): number => {
    if (key.length !== 1 || (key === ' ' && buffer === '')) return -1
    clearTimeout(timer)
    timer = setTimeout(() => {
      buffer = ''
    }, 500)
    buffer += key.toLowerCase()
    const repeated = buffer.length > 1 && [...buffer].every((c) => c === buffer[0])
    const query = repeated ? buffer[0]! : buffer
    const start = repeated || buffer.length === 1 ? currentIndex + 1 : currentIndex
    for (let i = 0; i < labels.length; i++) {
      const index = (start + i + labels.length) % labels.length
      if (labels[index]!.trim().toLowerCase().startsWith(query)) return index
    }
    return -1
  }
}

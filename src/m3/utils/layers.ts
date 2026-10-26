import { type RefObject, useEffect, useRef } from 'react'
import { useLatest } from './hooks'

/**
 * A stack of open overlays (dialogs, menus, sheets). Escape and outside presses go to the
 * top-most layer only, so a menu inside a dialog closes before the dialog does.
 */
interface Layer {
  onEscape: (event: KeyboardEvent) => void
  onOutside: (event: PointerEvent) => void
  contains: (target: Node) => boolean
  hasOutsideHandler: () => boolean
  hasEscapeHandler: () => boolean
}

const layers: Layer[] = []
let listening = false

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const top = layers.at(-1)
  if (!top?.hasEscapeHandler()) return
  event.preventDefault()
  top.onEscape(event)
}

function onPointerDown(event: PointerEvent) {
  const top = layers.at(-1)
  if (!top?.hasOutsideHandler()) return
  const target = event.target as Node | null
  if (target && top.contains(target)) return
  top.onOutside(event)
}

function ensureListeners() {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('pointerdown', onPointerDown, true)
}

export function isTopLayer(layer: Layer | null): boolean {
  return layer !== null && layers.at(-1) === layer
}

export interface LayerOptions {
  onEscape?: ((event: KeyboardEvent) => void) | undefined
  onOutsidePointerDown?: ((event: PointerEvent) => void) | undefined
  /** Elements that count as "inside" this layer (the floating element, its anchor…). */
  refs?: RefObject<Element | null>[]
}

/** Registers an overlay layer while `open` is true. Returns a function that tells if it is on top. */
export function useLayer(open: boolean, options: LayerOptions): () => boolean {
  const optionsRef = useLatest(options)
  const layerRef = useRef<Layer | null>(null)
  useEffect(() => {
    if (!open) return
    ensureListeners()
    const layer: Layer = {
      onEscape: (event) => optionsRef.current.onEscape?.(event),
      onOutside: (event) => optionsRef.current.onOutsidePointerDown?.(event),
      contains: (target) =>
        (optionsRef.current.refs ?? []).some((ref) => ref.current?.contains(target)),
      hasOutsideHandler: () => !!optionsRef.current.onOutsidePointerDown,
      hasEscapeHandler: () => !!optionsRef.current.onEscape,
    }
    layers.push(layer)
    layerRef.current = layer
    return () => {
      const index = layers.indexOf(layer)
      if (index >= 0) layers.splice(index, 1)
      layerRef.current = null
    }
  }, [open, optionsRef])
  return () => isTopLayer(layerRef.current)
}

let scrollLocks = 0
let savedStyle: { overflow: string; paddingRight: string } | null = null

/** Locks page scroll while any modal is open (reference counted). */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const root = document.documentElement
    if (scrollLocks === 0) {
      const scrollbar = window.innerWidth - root.clientWidth
      savedStyle = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }
      root.style.overflow = 'hidden'
      if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`
    }
    scrollLocks++
    return () => {
      scrollLocks--
      if (scrollLocks === 0 && savedStyle) {
        root.style.overflow = savedStyle.overflow
        root.style.paddingRight = savedStyle.paddingRight
        savedStyle = null
      }
    }
  }, [active])
}

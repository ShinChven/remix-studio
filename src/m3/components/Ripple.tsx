import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../utils/hooks'

const PRESS_GROW_MS = 450
const MINIMUM_PRESS_MS = 225
const INITIAL_ORIGIN_SCALE = 0.2
const PADDING = 10
const SOFT_EDGE_MINIMUM_SIZE = 75
const SOFT_EDGE_CONTAINER_RATIO = 0.35

export interface RippleProps {
  disabled?: boolean
}

/**
 * State layer (hover, focus) and press ripple. Render it as the first child of a
 * `position: relative` interactive element; it listens to its parent element.
 */
export function Ripple({ disabled }: RippleProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const surface = ref.current
    const control = surface?.parentElement
    if (!surface || !control || disabled) return

    let pressToken = 0
    let pressStartedAt = 0
    let pointerDown = false
    let growAnimation: Animation | undefined

    const isDisabled = () => control.matches(':disabled, [aria-disabled="true"], [data-disabled]')

    const startPress = (clientX?: number, clientY?: number) => {
      pressToken++
      pressStartedAt = performance.now()
      surface.setAttribute('data-pressed', '')
      if (prefersReducedMotion() || typeof surface.animate !== 'function') return
      const rect = surface.getBoundingClientRect()
      const { width, height } = rect
      const maxDim = Math.max(width, height)
      const softEdge = Math.max(SOFT_EDGE_CONTAINER_RATIO * maxDim, SOFT_EDGE_MINIMUM_SIZE)
      const initialSize = Math.max(1, Math.floor(maxDim * INITIAL_ORIGIN_SCALE))
      const scale = (Math.hypot(width, height) + PADDING + softEdge) / initialSize
      const x = clientX === undefined ? width / 2 : clientX - rect.left
      const y = clientY === undefined ? height / 2 : clientY - rect.top
      const start = `translate(${x - initialSize / 2}px, ${y - initialSize / 2}px) scale(1)`
      const end = `translate(${width / 2 - initialSize / 2}px, ${height / 2 - initialSize / 2}px) scale(${scale})`
      growAnimation?.cancel()
      growAnimation = surface.animate(
        {
          top: ['0px', '0px'],
          left: ['0px', '0px'],
          right: ['auto', 'auto'],
          bottom: ['auto', 'auto'],
          width: [`${initialSize}px`, `${initialSize}px`],
          height: [`${initialSize}px`, `${initialSize}px`],
          transform: [start, end],
        },
        {
          pseudoElement: '::after',
          duration: PRESS_GROW_MS,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
          fill: 'forwards',
        },
      )
    }

    const endPress = () => {
      const token = pressToken
      const remaining = Math.max(0, MINIMUM_PRESS_MS - (performance.now() - pressStartedAt))
      window.setTimeout(() => {
        if (token === pressToken) surface.removeAttribute('data-pressed')
      }, remaining)
    }

    const onPointerEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && !isDisabled()) surface.setAttribute('data-hovered', '')
    }
    const onPointerLeave = () => {
      surface.removeAttribute('data-hovered')
      if (pointerDown) {
        pointerDown = false
        endPress()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || isDisabled()) return
      pointerDown = true
      startPress(e.clientX, e.clientY)
    }
    const onPointerUp = () => {
      if (!pointerDown) return
      pointerDown = false
      endPress()
    }
    const onClick = (e: MouseEvent) => {
      // Keyboard activation (Enter/Space) fires click without pointer events.
      if (e.detail === 0 && !isDisabled()) {
        startPress()
        endPress()
      }
    }

    control.addEventListener('pointerenter', onPointerEnter)
    control.addEventListener('pointerleave', onPointerLeave)
    control.addEventListener('pointerdown', onPointerDown)
    control.addEventListener('pointerup', onPointerUp)
    control.addEventListener('pointercancel', onPointerUp)
    control.addEventListener('contextmenu', onPointerUp)
    control.addEventListener('click', onClick)
    return () => {
      control.removeEventListener('pointerenter', onPointerEnter)
      control.removeEventListener('pointerleave', onPointerLeave)
      control.removeEventListener('pointerdown', onPointerDown)
      control.removeEventListener('pointerup', onPointerUp)
      control.removeEventListener('pointercancel', onPointerUp)
      control.removeEventListener('contextmenu', onPointerUp)
      control.removeEventListener('click', onClick)
      growAnimation?.cancel()
      surface.removeAttribute('data-hovered')
      surface.removeAttribute('data-pressed')
    }
  }, [disabled])

  return <span ref={ref} className="m3-ripple" aria-hidden="true" />
}

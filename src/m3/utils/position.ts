import { type CSSProperties, type RefObject, useState } from 'react'
import { useIsoLayoutEffect, useLatest } from './hooks'

export type Placement =
  | 'bottom-start'
  | 'bottom-end'
  | 'bottom'
  | 'top-start'
  | 'top-end'
  | 'top'
  | 'right-start'
  | 'left-start'
  | 'right'
  | 'left'

/** Anything with a bounding rect: an element or a virtual point (context menus). */
export interface AnchorLike {
  getBoundingClientRect():
    | DOMRect
    | { top: number; left: number; right: number; bottom: number; width: number; height: number }
}

export interface AnchorPositionOptions {
  anchor: AnchorLike | null | undefined
  floatingRef: RefObject<HTMLElement | null>
  open: boolean
  placement?: Placement
  /** Gap between anchor and floating element, in px. */
  offset?: number
  /** Minimum distance from the viewport edges, in px. */
  padding?: number
  /** Make the floating element at least as wide as the anchor. */
  matchWidth?: boolean
  /** Constrain the floating element's max height to the available space. */
  fitHeight?: boolean
}

export interface AnchorPosition {
  style: CSSProperties
  placement: Placement
}

type Side = 'top' | 'bottom' | 'left' | 'right'

function opposite(side: Side): Side {
  return ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const)[side]
}

function compute(
  a: { top: number; left: number; right: number; bottom: number; width: number; height: number },
  f: { width: number; height: number },
  requested: Placement,
  offset: number,
  padding: number,
  rtl: boolean,
  vw: number,
  vh: number,
) {
  let [side, align = 'center'] = requested.split('-') as [Side, string?]
  // Logical start/end in RTL for horizontal sides.
  if (rtl && (side === 'left' || side === 'right')) side = opposite(side)
  const space = {
    top: a.top - padding,
    bottom: vh - a.bottom - padding,
    left: a.left - padding,
    right: vw - a.right - padding,
  }
  const need = side === 'top' || side === 'bottom' ? f.height + offset : f.width + offset
  if (space[side] < need && space[opposite(side)] > space[side]) side = opposite(side)

  let top: number
  let left: number
  if (side === 'top' || side === 'bottom') {
    top = side === 'bottom' ? a.bottom + offset : a.top - offset - f.height
    const startEdge = rtl ? a.right - f.width : a.left
    const endEdge = rtl ? a.left : a.right - f.width
    left =
      align === 'start' ? startEdge : align === 'end' ? endEdge : a.left + a.width / 2 - f.width / 2
    left = Math.min(Math.max(left, padding), Math.max(padding, vw - padding - f.width))
  } else {
    left = side === 'right' ? a.right + offset : a.left - offset - f.width
    top = align === 'start' ? a.top : a.top + a.height / 2 - f.height / 2
    top = Math.min(Math.max(top, padding), Math.max(padding, vh - padding - f.height))
  }
  const available =
    side === 'bottom'
      ? vh - top - padding
      : side === 'top'
        ? a.top - offset - padding
        : vh - 2 * padding
  return { top, left, side, available }
}

/**
 * Positions a fixed floating element next to an anchor, flipping to the opposite side when
 * there is not enough room and shifting to stay inside the viewport.
 */
export function useAnchorPosition(options: AnchorPositionOptions): AnchorPosition {
  const { open, placement = 'bottom-start' } = options
  const optionsRef = useLatest(options)
  const [state, setState] = useState<AnchorPosition>({
    style: { position: 'fixed', top: 0, left: 0, visibility: 'hidden' },
    placement,
  })

  useIsoLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const update = () => {
      const {
        anchor,
        floatingRef,
        offset = 4,
        padding = 8,
        matchWidth,
        fitHeight,
      } = optionsRef.current
      const floating = floatingRef.current
      if (!anchor || !floating) return
      const a = anchor.getBoundingClientRect()
      const vw = document.documentElement.clientWidth || window.innerWidth
      const vh = document.documentElement.clientHeight || window.innerHeight
      const rtl = getComputedStyle(floating).direction === 'rtl'
      const f = { width: floating.offsetWidth, height: floating.offsetHeight }
      if (matchWidth) f.width = Math.max(f.width, a.width)
      const { top, left, side, available } = compute(
        a,
        f,
        optionsRef.current.placement ?? 'bottom-start',
        offset,
        padding,
        rtl,
        vw,
        vh,
      )
      const resolved = (side +
        (placement.includes('-') ? `-${placement.split('-')[1]}` : '')) as Placement
      const style: CSSProperties = { position: 'fixed', top, left }
      if (matchWidth) style.minWidth = a.width
      if (fitHeight) style.maxHeight = Math.max(available, 120)
      setState((prev) => {
        const p = prev.style
        if (
          prev.placement === resolved &&
          p.top === style.top &&
          p.left === style.left &&
          p.minWidth === style.minWidth &&
          p.maxHeight === style.maxHeight &&
          p.visibility === undefined
        ) {
          return prev
        }
        return { style, placement: resolved }
      })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule)
      const floating = optionsRef.current.floatingRef.current
      if (floating) ro.observe(floating)
      const anchor = optionsRef.current.anchor
      if (anchor instanceof Element) ro.observe(anchor)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [open, options.anchor, placement, optionsRef])

  return state
}

/** A virtual anchor at a point, e.g. for context menus opened at the pointer. */
export function pointAnchor(x: number, y: number): AnchorLike {
  return {
    getBoundingClientRect: () => ({ top: y, bottom: y, left: x, right: x, width: 0, height: 0 }),
  }
}

import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react'
import { BottomSheet } from '../components/Sheet'
import { cx, useControllableState } from '../utils/hooks'
import { isAtLeast, useWindowSizeClass, type WindowSizeClass } from './windowSize'

export interface PaneProps extends HTMLAttributes<HTMLElement> {
  /** `contained` panes sit on a surface container with rounded corners. */
  variant?: 'flat' | 'contained'
  /** Fixed width in px; otherwise the pane flexes. */
  width?: number
  /** The pane scrolls on its own. */
  scroll?: boolean
  /** Element to render. */
  as?: 'div' | 'section' | 'aside' | 'article'
}

/** A region of the body. Panes are separated by a 24dp spacer inside `PaneLayout`. */
export function Pane({
  variant = 'contained',
  width,
  scroll = true,
  as: Tag = 'section',
  className,
  style,
  ...rest
}: PaneProps) {
  return (
    <Tag
      {...rest}
      className={cx('m3-pane', className)}
      data-variant={variant}
      data-scroll={scroll ? '' : undefined}
      data-fixed={width ? '' : undefined}
      style={{ ...(width ? { flexBasis: width, width } : null), ...style }}
    />
  )
}

export interface PaneLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Remove the window margins (e.g. when nested). */
  flush?: boolean
}

/** Horizontal arrangement of panes with M3 window margins and spacers. */
export function PaneLayout({ flush, className, ...rest }: PaneLayoutProps) {
  return (
    <div
      {...rest}
      className={cx('m3-pane-layout', className)}
      data-flush={flush ? '' : undefined}
    />
  )
}

export interface ResizablePanesProps {
  /** Content of the start pane, which the handle resizes. */
  start: ReactNode
  /** Content of the end pane, which fills the remaining width. */
  end: ReactNode
  /** Width of the start pane in px. */
  size?: number
  /** Initial width of the start pane in px when `size` is not controlled. */
  defaultSize?: number
  /** Called with the new width while the user drags or presses keys on the handle. */
  onSizeChange?: (size: number) => void
  /** Smallest width of the start pane in px. */
  min?: number
  /** Largest width of the start pane in px. */
  max?: number
  /** Accessible name of the drag handle. */
  handleLabel?: string
  /** Extra class on the root element. */
  className?: string
}

/** Two panes with a drag handle in the spacer (M3 Expressive pane resizing). */
export function ResizablePanes({
  start,
  end,
  size: sizeProp,
  defaultSize = 360,
  onSizeChange,
  min = 240,
  max = 720,
  handleLabel = 'Resize panes',
  className,
}: ResizablePanesProps) {
  const [size, setSize] = useControllableState({
    value: sizeProp,
    defaultValue: defaultSize,
    onChange: onSizeChange,
  })
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)))

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const rtl = getComputedStyle(rootRef.current).direction === 'rtl'
    setSize(clamp(rtl ? rect.right - e.clientX - 12 : e.clientX - rect.left - 12))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step = e.shiftKey ? 64 : 16
    const delta = { ArrowLeft: rtl ? step : -step, ArrowRight: rtl ? -step : step }[e.key]
    if (delta !== undefined) {
      e.preventDefault()
      setSize(clamp(size + delta))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSize(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      setSize(max)
    }
  }
  return (
    <div
      ref={rootRef}
      className={cx('m3-resizable-panes', className)}
      data-dragging={dragging ? '' : undefined}
      style={{ '--_size': `${size}px` } as CSSProperties}
    >
      <div className="m3-resizable-panes__start">{start}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={handleLabel}
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max}
        className="m3-resizable-panes__handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
      >
        <span />
      </div>
      <div className="m3-resizable-panes__end">{end}</div>
    </div>
  )
}

export interface ListDetailLayoutProps {
  /** List pane content. */
  list: ReactNode
  /** Detail content; a function receives `compact` to decide whether to show a back button. */
  detail: ReactNode | ((context: { compact: boolean }) => ReactNode)
  /** On compact windows only one pane shows: the detail when true, the list otherwise. */
  showDetail: boolean
  /** List pane width (expanded windows and up). */
  listWidth?: number
  /** Let the user resize the list pane. */
  resizable?: boolean
  /** Extra class on the root element. */
  className?: string
}

/** Canonical list-detail layout: side by side from expanded windows, one at a time below. */
export function ListDetailLayout({
  list,
  detail,
  showDetail,
  listWidth = 360,
  resizable,
  className,
}: ListDetailLayoutProps) {
  const size = useWindowSizeClass()
  const twoPanes = isAtLeast(size, 'expanded')
  const detailNode = typeof detail === 'function' ? detail({ compact: !twoPanes }) : detail
  if (!twoPanes) {
    return (
      <PaneLayout className={cx('m3-list-detail', className)}>
        <Pane variant="flat">{showDetail ? detailNode : list}</Pane>
      </PaneLayout>
    )
  }
  if (resizable) {
    return (
      <PaneLayout className={cx('m3-list-detail', className)}>
        <ResizablePanes
          defaultSize={listWidth}
          start={<Pane className="m3-list-detail__list">{list}</Pane>}
          end={<Pane className="m3-list-detail__detail">{detailNode}</Pane>}
        />
      </PaneLayout>
    )
  }
  return (
    <PaneLayout className={cx('m3-list-detail', className)}>
      <Pane width={listWidth} className="m3-list-detail__list">
        {list}
      </Pane>
      <Pane className="m3-list-detail__detail">{detailNode}</Pane>
    </PaneLayout>
  )
}

export interface SupportingPaneLayoutProps {
  /** Main pane content. */
  main: ReactNode
  /** Supporting pane content. */
  supporting: ReactNode
  /** Supporting pane width in px (expanded windows and up). */
  supportingWidth?: number
  /** Compact/medium windows: show the supporting pane below the main pane, or in a bottom sheet. */
  compactMode?: 'below' | 'sheet'
  /** Sheet mode only: whether the bottom sheet is open. */
  supportingOpen?: boolean
  /** Sheet mode only: called with `false` when the user dismisses the sheet. */
  onSupportingOpenChange?: (open: boolean) => void
  /** Accessible name of the supporting pane or sheet. */
  supportingLabel?: string
  /** Extra class on the root element. */
  className?: string
}

/** Canonical supporting-pane layout: main content with a secondary pane beside or below it. */
export function SupportingPaneLayout({
  main,
  supporting,
  supportingWidth = 360,
  compactMode = 'below',
  supportingOpen = false,
  onSupportingOpenChange,
  supportingLabel,
  className,
}: SupportingPaneLayoutProps) {
  const size: WindowSizeClass = useWindowSizeClass()
  const side = isAtLeast(size, 'expanded')
  if (side) {
    return (
      <PaneLayout className={cx('m3-supporting-pane', className)}>
        <Pane className="m3-supporting-pane__main">{main}</Pane>
        <Pane
          width={supportingWidth}
          as="aside"
          aria-label={supportingLabel}
          className="m3-supporting-pane__side"
        >
          {supporting}
        </Pane>
      </PaneLayout>
    )
  }
  if (compactMode === 'sheet') {
    return (
      <PaneLayout className={cx('m3-supporting-pane', className)}>
        <Pane variant="flat">{main}</Pane>
        <BottomSheet
          open={supportingOpen}
          onClose={() => onSupportingOpenChange?.(false)}
          aria-label={supportingLabel}
        >
          {supporting}
        </BottomSheet>
      </PaneLayout>
    )
  }
  return (
    <PaneLayout className={cx('m3-supporting-pane', className)} data-stacked="">
      <Pane variant="flat" scroll={false}>
        {main}
      </Pane>
      <Pane as="aside" aria-label={supportingLabel} scroll={false}>
        {supporting}
      </Pane>
    </PaneLayout>
  )
}

export interface FeedLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Minimum card width in px; columns are added as space allows. */
  minItemWidth?: number
  /** Space between cards in px. */
  gap?: number
}

/** Canonical feed layout: a responsive grid of cards. */
export function FeedLayout({
  minItemWidth = 280,
  gap = 16,
  className,
  style,
  ...rest
}: FeedLayoutProps) {
  return (
    <div
      {...rest}
      className={cx('m3-feed', className)}
      style={{ '--_min': `${minItemWidth}px`, '--_gap': `${gap}px`, ...style } as CSSProperties}
    />
  )
}

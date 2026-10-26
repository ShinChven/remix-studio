import { type CSSProperties, type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { useM3Locale } from '../i18n/locale'
import { useFocusTrap } from '../utils/focus'
import { cx, usePresence, useStableId } from '../utils/hooks'
import { useLayer, useScrollLock } from '../utils/layers'
import { Portal } from '../utils/portal'
import { IconButton } from './Button'

export interface SideSheetProps {
  /** Shows the sheet. A closed standard sheet collapses to zero width. */
  open: boolean
  /** Called by the close button, and for modal sheets also by Escape and scrim clicks. */
  onClose: () => void
  /** Title in the sheet header; it also names the sheet for assistive technology. */
  headline?: ReactNode
  /** Shows a back button before the headline (multi-step sheets). */
  onBack?: () => void
  /** Footer actions, e.g. Save / Cancel. */
  actions?: ReactNode
  /** Sheet content. It scrolls between the header and the actions. */
  children?: ReactNode
  /** Modal sheets overlay the page with a scrim; standard sheets sit in the layout. */
  modal?: boolean
  /** Side the sheet attaches to. Defaults to `end`. */
  side?: 'start' | 'end'
  /** Width in px. Defaults to 360 (standard) / 400 (modal). */
  width?: number
  /** Hide the close button (standard sheets driven by their own toggle). */
  hideClose?: boolean
  /** Extra class on the sheet element. */
  className?: string
  /** Accessible name when there is no `headline`. */
  'aria-label'?: string
}

/** Side sheet: supplementary content anchored to the side of the screen. */
export function SideSheet({
  open,
  onClose,
  headline,
  onBack,
  actions,
  children,
  modal = false,
  side = 'end',
  width,
  hideClose,
  className,
  'aria-label': ariaLabel,
}: SideSheetProps) {
  const { messages } = useM3Locale()
  const { mounted, state } = usePresence(open, 300)
  const ref = useRef<HTMLElement>(null)
  const headlineId = useStableId('m3-side-sheet')
  const isTop = useLayer(open && modal, { onEscape: onClose })
  useFocusTrap(ref, open && modal && mounted, { isTop })
  useScrollLock(open && modal)

  const body = (
    <>
      {(headline || onBack || !hideClose) && (
        <div className="m3-side-sheet__header">
          {onBack && (
            <IconButton
              icon="arrow_back"
              label={messages.back}
              onClick={onBack}
              className="m3-mirror-rtl"
            />
          )}
          {headline && (
            <h2 id={headlineId} className="m3-side-sheet__headline">
              {headline}
            </h2>
          )}
          {!hideClose && <IconButton icon="close" label={messages.close} onClick={onClose} />}
        </div>
      )}
      <div className="m3-side-sheet__content">{children}</div>
      {actions && <div className="m3-side-sheet__actions">{actions}</div>}
    </>
  )
  const style = { '--_width': width ? `${width}px` : undefined } as CSSProperties

  if (!modal) {
    return (
      <aside
        ref={ref}
        aria-labelledby={headline ? headlineId : undefined}
        aria-label={headline ? undefined : ariaLabel}
        className={cx('m3-side-sheet', className)}
        data-side={side}
        data-state={open ? 'open' : 'closed'}
        inert={!open}
        style={style}
      >
        <div className="m3-side-sheet__inner">{body}</div>
      </aside>
    )
  }
  if (!mounted) return null
  return (
    <Portal>
      <div className="m3-sheet-root" data-state={state}>
        <div className="m3-scrim" data-state={state} onClick={onClose} />
        <section
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headline ? headlineId : undefined}
          aria-label={headline ? undefined : ariaLabel}
          tabIndex={-1}
          className={cx('m3-side-sheet', className)}
          data-modal=""
          data-side={side}
          data-state={state}
          style={style}
        >
          <div className="m3-side-sheet__inner">{body}</div>
        </section>
      </div>
    </Portal>
  )
}

export interface BottomSheetProps {
  /** Shows the sheet. It stays mounted until the closing animation ends. */
  open: boolean
  /** Called when people dismiss the sheet: Escape, drag down, the handle or the scrim. */
  onClose: () => void
  /** Sheet content. It scrolls when the sheet reaches its maximum height. */
  children?: ReactNode
  /** Hide the drag handle. */
  hideHandle?: boolean
  /** Allow Escape, drag down, the handle and scrim clicks to dismiss. Defaults to true. */
  dismissible?: boolean
  /** Extra class on the sheet element. */
  className?: string
  /** Accessible name of the sheet. Pass this or `aria-labelledby`. */
  'aria-label'?: string
  /** Id of a visible heading inside the sheet that names it. */
  'aria-labelledby'?: string
}

/** Modal bottom sheet with a drag handle; drag down or tap the scrim to dismiss. */
export function BottomSheet({
  open,
  onClose,
  children,
  hideHandle,
  dismissible = true,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
}: BottomSheetProps) {
  const { messages } = useM3Locale()
  const { mounted, state } = usePresence(open, 300)
  const ref = useRef<HTMLElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const dragStart = useRef<{ y: number; t: number } | null>(null)
  const isTop = useLayer(open, { onEscape: dismissible ? onClose : () => {} })
  useFocusTrap(ref, open && mounted, { isTop })
  useScrollLock(open)

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!dismissible || e.button !== 0) return
    const target = e.target as HTMLElement
    const content = ref.current?.querySelector('.m3-bottom-sheet__content')
    // Drag from the handle area, or from content that is scrolled to the top.
    if (content?.contains(target) && content.scrollTop > 0) return
    if (
      target.closest(
        'button:not(.m3-bottom-sheet__handle), a, input, textarea, select, [role="slider"]',
      )
    )
      return
    dragStart.current = { y: e.clientY, t: performance.now() }
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!dragStart.current) return
    const dy = Math.max(0, e.clientY - dragStart.current.y)
    if (dy <= 4 && drag === null) return
    // Capture only once a drag starts, so a plain click still reaches the handle button.
    if (drag === null) e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(dy)
  }
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const start = dragStart.current
    dragStart.current = null
    if (!start || drag === null) {
      setDrag(null)
      return
    }
    const height = ref.current?.offsetHeight ?? 1
    const velocity = (e.clientY - start.y) / Math.max(1, performance.now() - start.t)
    setDrag(null)
    if (drag > height * 0.3 || velocity > 0.6) onClose()
  }

  if (!mounted) return null
  return (
    <Portal>
      <div className="m3-sheet-root" data-state={state}>
        <div className="m3-scrim" data-state={state} onClick={() => dismissible && onClose()} />
        <section
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={cx('m3-bottom-sheet', className)}
          data-state={state}
          data-dragging={drag !== null ? '' : undefined}
          style={drag !== null ? { transform: `translateY(${drag}px)` } : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!hideHandle && (
            <button
              type="button"
              className="m3-bottom-sheet__handle"
              aria-label={messages.dismiss}
              onClick={() => dismissible && onClose()}
            >
              <span />
            </button>
          )}
          <div className="m3-bottom-sheet__content">{children}</div>
        </section>
      </div>
    </Portal>
  )
}

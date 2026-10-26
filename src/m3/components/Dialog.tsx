import { type ReactNode, type RefObject, useCallback, useRef, useState } from 'react'
import { useM3Locale } from '../i18n/locale'
import { useFocusTrap } from '../utils/focus'
import { cx, useIsoLayoutEffect, useMediaQuery, usePresence, useStableId } from '../utils/hooks'
import { useLayer, useScrollLock } from '../utils/layers'
import { Portal } from '../utils/portal'
import { IconButton } from './Button'
import { type IconSource, renderIcon } from './Icon'

export type DialogCloseReason = 'escape' | 'scrim' | 'close-button'

export interface DialogProps {
  /** Shows the dialog. It stays mounted until the closing animation ends. */
  open: boolean
  /** Called with the reason when Escape, the scrim or the close button asks to close. */
  onClose: (reason: DialogCloseReason) => void
  /** Title of the dialog; it also names the dialog for assistive technology. */
  headline?: ReactNode
  /** Hero icon above a centered headline. */
  icon?: IconSource
  /** Body content. It scrolls when the dialog is taller than the window. */
  children?: ReactNode
  /** Buttons, end-aligned. In full-screen dialogs pass the confirm action as `confirmAction`. */
  actions?: ReactNode
  /** `true`, or `'compact'` to go full-screen only on compact windows (< 600dp). */
  fullScreen?: boolean | 'compact'
  /** Trailing action in the full-screen top bar, e.g. a "Save" text button. */
  confirmAction?: ReactNode
  /** Allow Escape and scrim clicks to close. Turn off while a form has unsaved input. */
  dismissible?: boolean
  /** Use `alertdialog` for urgent or destructive decisions. */
  role?: 'dialog' | 'alertdialog'
  /** Element focused on open. Defaults to a `data-autofocus` element, or the first tabbable one. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Extra class on the dialog container. */
  className?: string
  /** Accessible name when there is no `headline`. */
  'aria-label'?: string
  /** Max width in px for basic dialogs. Defaults to 560. */
  maxWidth?: number
}

/** Basic or full-screen dialog with a modal scrim, focus trap and scroll lock. */
export function Dialog({
  open,
  onClose,
  headline,
  icon,
  children,
  actions,
  fullScreen = false,
  confirmAction,
  dismissible = true,
  role = 'dialog',
  initialFocus,
  className,
  'aria-label': ariaLabel,
  maxWidth,
}: DialogProps) {
  const { messages } = useM3Locale()
  const compact = useMediaQuery('(max-width: 599.98px)')
  const isFullScreen = fullScreen === true || (fullScreen === 'compact' && compact)
  const { mounted, state } = usePresence(open, 200)
  const containerRef = useRef<HTMLDivElement>(null)
  const headlineId = useStableId('m3-dialog-headline')
  const contentId = useStableId('m3-dialog-content')
  const isTop = useLayer(open, {
    onEscape: dismissible ? () => onClose('escape') : () => {},
  })
  useFocusTrap(containerRef, open && mounted, { initialFocus, isTop })
  useScrollLock(open)

  const [scroll, setScroll] = useState({ top: false, bottom: false })
  const contentRef = useRef<HTMLDivElement | null>(null)
  const measure = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const top = el.scrollTop > 0
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setScroll((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
  }, [])
  useIsoLayoutEffect(() => {
    if (!mounted) return
    measure()
    const el = contentRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mounted, measure])

  if (!mounted) return null
  return (
    <Portal>
      <div className="m3-dialog-root" data-state={state}>
        <div
          className="m3-scrim"
          data-state={state}
          onClick={() => dismissible && onClose('scrim')}
        />
        <div
          ref={containerRef}
          role={role}
          aria-modal="true"
          aria-labelledby={headline ? headlineId : undefined}
          aria-label={headline ? undefined : ariaLabel}
          aria-describedby={children ? contentId : undefined}
          tabIndex={-1}
          className={cx('m3-dialog', className)}
          data-state={state}
          data-fullscreen={isFullScreen ? '' : undefined}
          data-icon={icon && !isFullScreen ? '' : undefined}
          style={maxWidth && !isFullScreen ? { maxWidth } : undefined}
        >
          {isFullScreen ? (
            <div className="m3-dialog__bar">
              <IconButton
                icon="close"
                label={messages.close}
                onClick={() => onClose('close-button')}
              />
              {headline && (
                <h2 id={headlineId} className="m3-dialog__headline">
                  {headline}
                </h2>
              )}
              {confirmAction && <div className="m3-dialog__confirm">{confirmAction}</div>}
            </div>
          ) : (
            (icon || headline) && (
              <div className="m3-dialog__header">
                {icon && <span className="m3-dialog__icon">{renderIcon(icon)}</span>}
                {headline && (
                  <h2 id={headlineId} className="m3-dialog__headline">
                    {headline}
                  </h2>
                )}
              </div>
            )
          )}
          {children !== undefined && (
            <div
              ref={contentRef}
              id={contentId}
              className="m3-dialog__content"
              data-scroll-top={scroll.top ? '' : undefined}
              data-scroll-bottom={scroll.bottom ? '' : undefined}
              onScroll={measure}
            >
              {children}
            </div>
          )}
          {actions && (!isFullScreen || !confirmAction) && (
            <div className="m3-dialog__actions">{actions}</div>
          )}
        </div>
      </div>
    </Portal>
  )
}

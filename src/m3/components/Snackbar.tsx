import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useM3Locale } from '../i18n/locale'
import { cx, usePresence } from '../utils/hooks'
import { Portal } from '../utils/portal'
import { IconButton } from './Button'

export interface SnackbarAction {
  /** Short verb, e.g. “Undo” or “Retry”. */
  label: string
  /** Called when the action is pressed. A queued snackbar then closes. */
  onClick: () => void
}

export interface SnackbarOptions {
  /** The message: one or two short lines. */
  message: ReactNode
  /** One optional text action. */
  action?: SnackbarAction
  /** Shows a close icon button. */
  closable?: boolean
  /** Milliseconds before auto-dismiss (4000–10000 recommended). `null` keeps it until dismissed. */
  duration?: number | null
  /** Puts a long action label on its own line. */
  longerAction?: boolean
  /** Called after the snackbar closes by itself, by its action or by its close button. */
  onClose?: (reason: 'timeout' | 'action' | 'dismiss') => void
}

interface QueuedSnackbar extends SnackbarOptions {
  id: number
}

export interface SnackbarApi {
  /** Queues a snackbar; returns its id. Snackbars are shown one at a time. */
  show: (options: SnackbarOptions | string) => number
  /** Dismisses the snackbar with this id, or the visible one. */
  dismiss: (id?: number) => void
}

const SnackbarContext = createContext<SnackbarApi | null>(null)

export interface SnackbarProviderProps {
  /** The app. Snackbars render in a portal at the bottom of the window. */
  children: ReactNode
  /** Default auto-dismiss time in ms. */
  defaultDuration?: number
}

/** Hosts a queue of snackbars at the bottom of the window. Use `useSnackbar()` to show one. */
export function SnackbarProvider({ children, defaultDuration = 5000 }: SnackbarProviderProps) {
  const [queue, setQueue] = useState<QueuedSnackbar[]>([])
  const queueRef = useRef(queue)
  queueRef.current = queue
  const nextId = useRef(1)
  // Close function of the visible snackbar: dismissing it animates out and reports `onClose`.
  const closeVisible = useRef<((reason: 'dismiss') => void) | null>(null)
  const show = useCallback((options: SnackbarOptions | string) => {
    const id = nextId.current++
    const item = typeof options === 'string' ? { message: options } : options
    setQueue((q) => [...q, { ...item, id }])
    return id
  }, [])
  const remove = useCallback((id: number) => {
    setQueue((q) => q.filter((s) => s.id !== id))
  }, [])
  const dismiss = useCallback(
    (id?: number) => {
      const [visible] = queueRef.current
      if (visible && (id === undefined || id === visible.id)) {
        closeVisible.current?.('dismiss')
        return
      }
      const waiting = queueRef.current.find((s) => s.id === id)
      if (!waiting) return
      waiting.onClose?.('dismiss')
      remove(waiting.id)
    },
    [remove],
  )
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])
  const current = queue[0]
  return (
    <SnackbarContext.Provider value={api}>
      {children}
      <Portal>
        <div className="m3-snackbar-host" role="status" aria-live="polite" aria-atomic="true">
          {current && (
            <SnackbarView
              key={current.id}
              item={current}
              defaultDuration={defaultDuration}
              registerClose={(close) => {
                closeVisible.current = close
              }}
              onDone={(reason) => {
                current.onClose?.(reason)
                remove(current.id)
              }}
            />
          )}
        </div>
      </Portal>
    </SnackbarContext.Provider>
  )
}

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext)
  if (!api) throw new Error('useSnackbar() must be used inside <SnackbarProvider>')
  return api
}

function SnackbarView({
  item,
  defaultDuration,
  registerClose,
  onDone,
}: {
  item: QueuedSnackbar
  defaultDuration: number
  registerClose: (close: ((reason: 'dismiss') => void) | null) => void
  onDone: (reason: 'timeout' | 'action' | 'dismiss') => void
}) {
  const [open, setOpen] = useState(true)
  const reason = useRef<'timeout' | 'action' | 'dismiss'>('timeout')
  const { mounted, state } = usePresence(open, 150)
  const [paused, setPaused] = useState(false)
  const remaining = useRef(item.duration === undefined ? defaultDuration : item.duration)

  const close = useCallback((why: 'timeout' | 'action' | 'dismiss') => {
    reason.current = why
    setOpen(false)
  }, [])

  useEffect(() => {
    registerClose(close)
    return () => registerClose(null)
  }, [registerClose, close])

  const done = useRef(false)
  useEffect(() => {
    if (mounted || done.current) return
    done.current = true
    onDone(reason.current)
  }, [mounted, onDone])

  // Auto-dismiss, paused while hovered or focused.
  useEffect(() => {
    if (!open || paused || remaining.current === null) return
    const started = performance.now()
    const timer = window.setTimeout(() => close('timeout'), remaining.current)
    return () => {
      window.clearTimeout(timer)
      if (remaining.current !== null) remaining.current -= performance.now() - started
    }
  }, [open, paused, close])

  if (!mounted) return null
  return (
    <SnackbarSurface
      state={state}
      message={item.message}
      action={item.action}
      closable={item.closable}
      longerAction={item.longerAction}
      onAction={() => {
        item.action?.onClick()
        close('action')
      }}
      onDismiss={() => close('dismiss')}
      onPause={setPaused}
    />
  )
}

export interface SnackbarSurfaceProps {
  /** The message. */
  message: ReactNode
  /** Text action. Pressing it calls `onAction` when given, otherwise `action.onClick`. */
  action?: SnackbarAction | undefined
  /** Shows a close icon button that calls `onDismiss`. */
  closable?: boolean | undefined
  /** Puts the action on its own line below the message. */
  longerAction?: boolean | undefined
  /** `closed` plays the exit transition. */
  state?: 'open' | 'closed'
  /** Called when the action button is pressed. */
  onAction?: () => void
  /** Called when the close button is pressed. */
  onDismiss?: () => void
  /** Called with `true` while the pointer or focus is on the snackbar, and `false` after. */
  onPause?: (paused: boolean) => void
  /** Extra class on the container. */
  className?: string
}

/** The snackbar container itself (used by the provider; usable standalone in layouts). */
export function SnackbarSurface({
  message,
  action,
  closable,
  longerAction,
  state = 'open',
  onAction,
  onDismiss,
  onPause,
  className,
}: SnackbarSurfaceProps) {
  const { messages } = useM3Locale()
  return (
    <div
      className={cx('m3-snackbar', className)}
      data-state={state}
      data-longer-action={longerAction ? '' : undefined}
      onPointerEnter={() => onPause?.(true)}
      onPointerLeave={() => onPause?.(false)}
      onFocus={() => onPause?.(true)}
      onBlur={() => onPause?.(false)}
    >
      <div className="m3-snackbar__message">{message}</div>
      {(action || closable) && (
        <div className="m3-snackbar__actions">
          {action && (
            <button
              type="button"
              className="m3-snackbar__action m3-focus-ring"
              onClick={onAction ?? action.onClick}
            >
              {action.label}
            </button>
          )}
          {closable && (
            <IconButton
              icon="close"
              label={messages.close}
              onClick={onDismiss}
              className="m3-snackbar__close"
            />
          )}
        </div>
      )}
    </div>
  )
}

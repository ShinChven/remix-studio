import {
  cloneElement,
  type FocusEvent,
  type HTMLAttributes,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  cx,
  useEventCallback,
  useLatest,
  useMergedRefs,
  usePresence,
  useStableId,
} from '../utils/hooks'
import { useLayer } from '../utils/layers'
import { Portal } from '../utils/portal'
import { type Placement, useAnchorPosition } from '../utils/position'

type TriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }

interface TooltipTriggerOptions {
  enterDelay: number
  leaveDelay: number
  disabled: boolean
  /** Keep open while the pointer is over the tooltip itself (rich tooltips). */
  hoverable: boolean
  floatingRef: RefObject<HTMLElement | null>
  /** Called whenever hover, focus, long press or Escape opens or closes the tooltip. */
  onOpenChange?: ((open: boolean) => void) | undefined
}

/** Shared hover / focus / long-press logic for plain and rich tooltips. */
function useTooltipTrigger({
  enterDelay,
  leaveDelay,
  disabled,
  hoverable,
  floatingRef,
  onOpenChange,
}: TooltipTriggerOptions) {
  const [open, setOpenState] = useState(false)
  const openRef = useRef(false)
  const onOpenChangeRef = useLatest(onOpenChange)
  const setOpen = useCallback(
    (next: boolean) => {
      if (openRef.current === next) return
      openRef.current = next
      setOpenState(next)
      onOpenChangeRef.current?.(next)
    },
    [onOpenChangeRef],
  )
  const timer = useRef<number | undefined>(undefined)
  const clear = () => window.clearTimeout(timer.current)
  const show = (delay: number) => {
    clear()
    if (disabled) return
    timer.current = window.setTimeout(() => setOpen(true), delay)
  }
  const hide = (delay: number) => {
    clear()
    timer.current = window.setTimeout(() => setOpen(false), delay)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled, setOpen])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') show(enterDelay)
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (hoverable && floatingRef.current?.contains(e.relatedTarget as Node)) return
      hide(leaveDelay)
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch') {
        // Long press shows the tooltip on touch screens.
        show(500)
      } else {
        clear()
        setOpen(false)
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch') hide(1500)
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) show(0)
    },
    onBlur: () => hide(0),
  }
  const floatingHandlers = hoverable
    ? { onPointerEnter: clear, onPointerLeave: () => hide(leaveDelay) }
    : {}
  return { open, setOpen, handlers, floatingHandlers }
}

function chain<E>(a: ((e: E) => void) | undefined, b: (e: E) => void) {
  return (e: E) => {
    a?.(e)
    b(e)
  }
}

function useClonedTrigger(
  children: ReactElement,
  handlers: Record<string, (e: never) => void>,
  ref: Ref<HTMLElement>,
  extra: Record<string, unknown>,
) {
  const childProps = children.props as TriggerProps
  const mergedRef = useMergedRefs(childProps.ref, ref)
  const props: Record<string, unknown> = { ...extra, ref: mergedRef }
  for (const [key, handler] of Object.entries(handlers)) {
    props[key] = chain(
      (childProps as Record<string, unknown>)[key] as ((e: never) => void) | undefined,
      handler,
    )
  }
  return cloneElement(children, props)
}

export interface TooltipProps {
  /** Tooltip text. Keep it short; plain tooltips are a single line. */
  title: ReactNode
  /** The trigger: one element that accepts a ref, focus and pointer handlers. */
  children: ReactElement
  /** Preferred side. The tooltip flips to the other side when there is no room. */
  placement?: Placement
  /** Hover delay before it shows, in ms. Keyboard focus shows it at once. */
  enterDelay?: number
  /** Delay before it hides after the pointer leaves, in ms. */
  leaveDelay?: number
  /** Never shows the tooltip. */
  disabled?: boolean
  /**
   * Link the tooltip to the trigger with `aria-describedby`. Turn off when the tooltip repeats the
   * trigger's accessible name (icon buttons), so screen readers do not read it twice.
   */
  describeChild?: boolean
}

/** Plain tooltip: a short label shown on hover, keyboard focus or long press. */
export function Tooltip({
  title,
  children,
  placement = 'bottom',
  enterDelay = 500,
  leaveDelay = 0,
  disabled = false,
  describeChild = true,
}: TooltipProps) {
  const id = useStableId('m3-tooltip')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const { open, handlers } = useTooltipTrigger({
    enterDelay,
    leaveDelay,
    disabled,
    hoverable: false,
    floatingRef,
  })
  const { mounted, state } = usePresence(open, 150)
  const position = useAnchorPosition({ anchor, floatingRef, open: mounted, placement, offset: 4 })
  const trigger = useClonedTrigger(children, handlers, setAnchor, {
    'aria-describedby':
      open && describeChild ? id : (children.props as TriggerProps)['aria-describedby'],
  })
  return (
    <>
      {trigger}
      {mounted && (
        <Portal>
          <div
            ref={floatingRef}
            id={id}
            role="tooltip"
            className="m3-tooltip"
            data-state={state}
            data-placement={position.placement}
            style={position.style}
          >
            {title}
          </div>
        </Portal>
      )}
    </>
  )
}

export interface RichTooltipProps {
  /** The trigger: one element that accepts a ref, focus and pointer handlers. */
  children: ReactElement
  /** Optional title above the supporting text. */
  subhead?: ReactNode
  /** The main text: a few short sentences at most. */
  supportingText: ReactNode
  /** Text buttons shown at the bottom. */
  actions?: ReactNode
  /** Preferred side. The tooltip flips to the other side when there is no room. */
  placement?: Placement
  /** Opens on click and stays until dismissed, instead of on hover. */
  persistent?: boolean
  /** Open state (controlled). */
  open?: boolean
  /** Called when a persistent tooltip opens or closes. */
  onOpenChange?: (open: boolean) => void
  /** Hover delay before it shows, in ms. Keyboard focus shows it at once. */
  enterDelay?: number
  /** Delay before it hides after the pointer leaves the trigger and the tooltip, in ms. */
  leaveDelay?: number
  /** Never shows the tooltip. */
  disabled?: boolean
}

/** Rich tooltip: subhead, supporting text and optional actions. */
export function RichTooltip({
  children,
  subhead,
  supportingText,
  actions,
  placement = 'bottom-start',
  persistent = false,
  open: openProp,
  onOpenChange,
  enterDelay = 500,
  leaveDelay = 300,
  disabled = false,
}: RichTooltipProps) {
  const id = useStableId('m3-rich-tooltip')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  anchorRef.current = anchor
  const floatingRef = useRef<HTMLDivElement>(null)
  const hover = useTooltipTrigger({
    enterDelay,
    leaveDelay,
    disabled: disabled || persistent,
    hoverable: true,
    floatingRef,
    onOpenChange,
  })
  const [clickOpen, setClickOpen] = useState(false)
  // Controlled when `open` is given: hover and clicks only report through `onOpenChange`.
  const open = openProp ?? (persistent ? clickOpen : hover.open)
  const setOpen = useEventCallback((next: boolean) => {
    if (persistent) {
      setClickOpen(next)
      onOpenChange?.(next)
    } else hover.setOpen(next)
  })
  const { mounted, state } = usePresence(open, 150)
  const position = useAnchorPosition({ anchor, floatingRef, open: mounted, placement, offset: 4 })
  useLayer(open && persistent, {
    onEscape: () => setOpen(false),
    onOutsidePointerDown: () => setOpen(false),
    refs: [floatingRef, anchorRef],
  })
  const triggerHandlers = persistent
    ? { onClick: () => setOpen(!open) }
    : (hover.handlers as Record<string, (e: never) => void>)
  const trigger = useClonedTrigger(children, triggerHandlers, setAnchor, {
    'aria-describedby': open ? id : undefined,
    ...(persistent ? { 'aria-expanded': open } : {}),
  })
  return (
    <>
      {trigger}
      {mounted && (
        <Portal>
          <div
            ref={floatingRef}
            id={id}
            role={persistent ? 'dialog' : 'tooltip'}
            aria-label={persistent && typeof subhead === 'string' ? subhead : undefined}
            className="m3-rich-tooltip"
            data-state={state}
            data-placement={position.placement}
            style={position.style}
            {...hover.floatingHandlers}
          >
            {subhead && <div className={cx('m3-rich-tooltip__subhead')}>{subhead}</div>}
            <div className="m3-rich-tooltip__text">{supportingText}</div>
            {actions && <div className="m3-rich-tooltip__actions">{actions}</div>}
          </div>
        </Portal>
      )}
    </>
  )
}

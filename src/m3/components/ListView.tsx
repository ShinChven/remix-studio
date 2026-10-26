import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { cx, useControllableState } from '../utils/hooks'

export interface ListViewHandle {
  /** Scrolls the item at `index` into view. */
  scrollToIndex: (
    index: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => void
  /** Scrolls to a pixel offset. */
  scrollToOffset: (offset: number, options?: { behavior?: 'auto' | 'smooth' }) => void
  /** Moves keyboard focus to the list (and activates `index` when given). */
  focus: (index?: number) => void
  /** Underlying scroll container element. */
  readonly element: HTMLDivElement | null
}

export interface ListViewProps<T = unknown>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> {
  /** Array of items to render. */
  items: readonly T[]
  /** Returns a unique key for each item. Defaults to index. */
  getItemKey?: (item: T, index: number) => string | number
  /** Renders one item at the given index. */
  renderItem: (item: T, index: number, state: { selected: boolean; active: boolean }) => ReactNode
  /** Estimated row height in px. Defaults to 56. */
  estimateSize?: number | ((index: number) => number)
  /** Number of items to render beyond the visible viewport. Defaults to 5. */
  overscan?: number
  /** Standard list or segmented items with gaps. */
  variant?: 'standard' | 'segmented'
  /** Fixed container height. Defaults to 400. */
  height?: number | string
  /** Maximum container height. */
  maxHeight?: number | string
  /** Selection mode: none, single item or multiple. */
  selection?: 'none' | 'single' | 'multiple'
  /** Controlled selected item keys. */
  selectedKeys?: (string | number)[]
  /** Initial selected item keys. */
  defaultSelectedKeys?: (string | number)[]
  /** Called when the selection changes. */
  onSelectionChange?: (keys: (string | number)[]) => void
  /** Called when an item is clicked or activated with Enter/Space. */
  onItemClick?: (item: T, index: number) => void
  /** Called when the user scrolls near the end of the list. */
  onEndReached?: () => void
  /** Content to display when items is empty. */
  empty?: ReactNode
  /** Imperative handle for programmatic scrolling and focus. */
  ref?: Ref<ListViewHandle>
}

/**
 * Virtualized List View (M3 Expressive): smoothly renders large datasets (10,000+ items)
 * with 60fps scrolling, dynamic row measurement, item selection, keyboard navigation, and M3 list styling.
 */
export function ListView<T>({
  items,
  getItemKey = (_item, index) => index,
  renderItem,
  estimateSize = 56,
  overscan = 5,
  variant = 'standard',
  height = 400,
  maxHeight,
  selection = 'none',
  selectedKeys: selectedKeysProp,
  defaultSelectedKeys = [],
  onSelectionChange,
  onItemClick,
  onEndReached,
  empty,
  className,
  style,
  tabIndex = 0,
  onFocus,
  onKeyDown,
  ref,
  ...rest
}: ListViewProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const endReachedCountRef = useRef<number>(-1)

  const [selectedKeys, setSelectedKeys] = useControllableState({
    value: selectedKeysProp,
    defaultValue: defaultSelectedKeys,
    onChange: onSelectionChange,
  })

  const sizeFn = typeof estimateSize === 'function' ? estimateSize : () => estimateSize
  const numericHeight =
    typeof height === 'number'
      ? height
      : typeof maxHeight === 'number'
        ? maxHeight
        : Number.parseInt(String(height), 10) || 400
  const gap = variant === 'segmented' ? 2 : 0

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    getItemKey: (index) => getItemKey(items[index]!, index),
    estimateSize: sizeFn,
    overscan,
    paddingStart: 8,
    paddingEnd: 8,
    gap,
    initialRect: { width: 0, height: numericHeight },
    measureElement: (element, _entry, instance) => {
      const measured = (element as HTMLElement).offsetHeight
      if (measured > 0) return measured
      const index = instance.indexFromElement(element)
      return instance.options.estimateSize(index)
    },
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when variant or estimateSize changes
  useEffect(() => {
    virtualizer.measure()
  }, [variant, estimateSize, virtualizer])

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options) => {
        if (items.length === 0) return
        const clamped = Math.max(0, Math.min(items.length - 1, index))
        setActiveIndex(clamped)
        virtualizer.scrollToIndex(clamped, {
          align: options?.align ?? 'auto',
          behavior: options?.behavior,
        })
      },
      scrollToOffset: (offset, options) => {
        virtualizer.scrollToOffset(offset, options)
      },
      focus: (index) => {
        containerRef.current?.focus()
        if (typeof index === 'number' && items.length > 0) {
          const clamped = Math.max(0, Math.min(items.length - 1, index))
          setActiveIndex(clamped)
          virtualizer.scrollToIndex(clamped, { align: 'auto' })
        }
      },
      get element() {
        return containerRef.current
      },
    }),
    [items.length, virtualizer],
  )

  const selectedSet = new Set(selectedKeys)

  const toggleSelect = (key: string | number) => {
    if (selection === 'none') return
    if (selection === 'single') {
      const next = selectedSet.has(key) ? [] : [key]
      setSelectedKeys(next)
    } else {
      const next = new Set(selectedSet)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelectedKeys([...next])
    }
  }

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    if (!onEndReached || items.length === 0 || virtualItems.length === 0) return
    const last = virtualItems[virtualItems.length - 1]
    if (last && last.index >= items.length - 1 && endReachedCountRef.current !== items.length) {
      endReachedCountRef.current = items.length
      onEndReached()
    }
  }, [virtualItems, items.length, onEndReached])

  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    onFocus?.(e)
    if (e.target === e.currentTarget && activeIndex < 0 && items.length > 0) {
      const firstSelected = items.findIndex((item, idx) => selectedSet.has(getItemKey(item, idx)))
      setActiveIndex(Math.max(firstSelected, 0))
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(items.length - 1, activeIndex + 1)
      setActiveIndex(next)
      virtualizer.scrollToIndex(next, { align: 'auto' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(0, activeIndex <= 0 ? 0 : activeIndex - 1)
      setActiveIndex(prev)
      virtualizer.scrollToIndex(prev, { align: 'auto' })
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      const step = Math.max(1, Math.floor(numericHeight / sizeFn(Math.max(0, activeIndex))))
      const next = Math.min(items.length - 1, Math.max(0, activeIndex) + step)
      setActiveIndex(next)
      virtualizer.scrollToIndex(next, { align: 'auto' })
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      const step = Math.max(1, Math.floor(numericHeight / sizeFn(Math.max(0, activeIndex))))
      const prev = Math.max(0, Math.max(activeIndex, 0) - step)
      setActiveIndex(prev)
      virtualizer.scrollToIndex(prev, { align: 'auto' })
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
      virtualizer.scrollToIndex(0, { align: 'start' })
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(items.length - 1)
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
    } else if (
      (e.key === 'Enter' || e.key === ' ') &&
      activeIndex >= 0 &&
      activeIndex < items.length
    ) {
      e.preventDefault()
      const item = items[activeIndex]!
      const key = getItemKey(item, activeIndex)
      toggleSelect(key)
      onItemClick?.(item, activeIndex)
    }
  }

  const isInteractive = selection !== 'none' || Boolean(onItemClick)

  return (
    <div
      {...rest}
      ref={containerRef}
      role={selection !== 'none' ? 'listbox' : 'list'}
      aria-multiselectable={selection === 'multiple' ? true : undefined}
      tabIndex={tabIndex}
      className={cx('m3-list-view', className)}
      style={
        {
          height: typeof height === 'number' ? `${height}px` : height,
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          ...style,
        } as CSSProperties
      }
      data-variant={variant}
      data-interactive={isInteractive ? '' : undefined}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
    >
      {items.length === 0 ? (
        <div className="m3-list-view__empty">{empty ?? 'No items'}</div>
      ) : (
        <div className="m3-list-view__inner" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index]!
            const key = getItemKey(item, virtualItem.index)
            const isSelected = selectedSet.has(key)
            const isActive = activeIndex === virtualItem.index

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                data-first={virtualItem.index === 0 ? '' : undefined}
                data-last={virtualItem.index === items.length - 1 ? '' : undefined}
                data-selected={isSelected ? '' : undefined}
                data-active={isActive ? '' : undefined}
                role={selection !== 'none' ? 'option' : 'listitem'}
                aria-selected={selection !== 'none' ? isSelected : undefined}
                className="m3-list-view__item"
                style={{
                  minHeight: `${sizeFn(virtualItem.index)}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                onClick={(e: MouseEvent<HTMLDivElement>) => {
                  const target = e.target as HTMLElement | null
                  const nestedControl = target?.closest(
                    'button:not(.m3-list-item__action), a:not(.m3-list-item__action), [role="switch"]',
                  )
                  if (nestedControl && !e.currentTarget.isSameNode(nestedControl)) return
                  setActiveIndex(virtualItem.index)
                  toggleSelect(key)
                  onItemClick?.(item, virtualItem.index)
                }}
              >
                {renderItem(item, virtualItem.index, { selected: isSelected, active: isActive })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

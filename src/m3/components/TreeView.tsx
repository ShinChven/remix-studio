import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useM3Locale } from '../i18n/locale'
import { createTypeahead } from '../utils/focus'
import { cx, useControllableState, useLatest, useStableId } from '../utils/hooks'
import { Portal } from '../utils/portal'
import { Icon, type IconSource, renderIcon } from './Icon'
import { LoadingIndicator } from './LoadingIndicator'

export interface TreeItem {
  /** Unique id across the whole tree. */
  id: string
  /** Text of the row; also used for type-ahead. */
  label: string
  /** Leading icon: a Material Symbols name or an element. */
  icon?: IconSource
  /** Whether the item can be expanded (children are loaded on demand). */
  hasChildren: boolean
  /** Shows the item dimmed; it cannot be selected, activated or dragged. */
  disabled?: boolean
  /** Trailing content: status chip, count… */
  meta?: ReactNode
}

export interface TreePage {
  /** Children in display order. */
  items: TreeItem[]
  /** Cursor for the next page of siblings; null/undefined when there are no more. */
  nextCursor?: string | null
}

/** Loads one page of children. `parentId` is null for the root level. */
export type TreeLoader = (parentId: string | null, cursor: string | null) => Promise<TreePage>

export type DropPosition = 'before' | 'after' | 'inside'

export interface TreeMove {
  /** Id of the item that moves. */
  id: string
  /** Id of the item it moves next to or into. */
  targetId: string
  /** `before` or `after` the target as a sibling, or `inside` it as a child. */
  position: DropPosition
}

export interface TreeViewHandle {
  /** Reloads the children of a parent (root when omitted). */
  refresh: (parentId?: string | null) => Promise<void>
  /** Expands an item and loads its children if needed. */
  expand: (id: string) => void
  /** Collapses an item. */
  collapse: (id: string) => void
  /** Moves keyboard focus to the tree (and to an item when given). */
  focus: (id?: string) => void
}

export interface TreeViewProps {
  /** Loads one page of children of a parent (`null` for the root). */
  loadChildren: TreeLoader
  /** Row height in px. Defaults to 40. */
  rowHeight?: number
  /** Indent per level in px. Defaults to 24. */
  indent?: number
  /** Id of the selected item (controlled). */
  selectedId?: string | null
  /** Called when people click an item or press Space or Enter on it. */
  onSelect?: (item: TreeItem) => void
  /** Called on double-click or Enter, for example to open the item. */
  onActivate?: (item: TreeItem) => void
  /** Ids of the expanded items (controlled). */
  expanded?: string[]
  /** Ids of the items expanded at first (uncontrolled). */
  defaultExpanded?: string[]
  /** Called with the new list of expanded ids. */
  onExpandedChange?: (ids: string[]) => void
  /** Enables drag-and-drop and keyboard moves (Alt+Arrow keys). The tree refreshes after it resolves. */
  onMove?: (move: TreeMove, item: TreeItem) => Promise<void> | void
  /** Returns false for moves that are not allowed; the drop target shows as invalid. */
  canDrop?: (move: TreeMove) => boolean
  /** Called when `onMove` rejects. The tree announces the failure and reloads the affected branches. */
  onMoveError?: (error: unknown, move: TreeMove) => void
  /** Renders the label content in place of `item.label`. */
  renderLabel?: (item: TreeItem) => ReactNode
  /** Called on right-click of an item, for example to open a context menu. */
  onItemContextMenu?: (item: TreeItem, event: MouseEvent) => void
  /** Height of the scroll area. Defaults to filling the parent. */
  height?: number | string
  /** Extra class on the root element. */
  className?: string
  /** Accessible name of the tree. */
  'aria-label'?: string
  /** Gives access to `refresh`, `expand`, `collapse` and `focus`. */
  ref?: Ref<TreeViewHandle>
}

interface Branch {
  items: TreeItem[]
  nextCursor: string | null
  status: 'loading' | 'ready' | 'error'
  /** Increments on refresh so late responses from an older request are ignored. */
  generation: number
}

type Row =
  | {
      kind: 'item'
      key: string
      item: TreeItem
      depth: number
      parentId: string | null
      pos: number
      size: number
    }
  | { kind: 'loading' | 'more' | 'error'; key: string; depth: number; parentId: string | null }

const ROOT = '\u0000root'
const keyOf = (parentId: string | null) => parentId ?? ROOT

/** Lazy, virtualized tree for deep hierarchies, with keyboard navigation and drag-and-drop. */
export function TreeView({
  loadChildren,
  rowHeight = 40,
  indent = 24,
  selectedId,
  onSelect,
  onActivate,
  expanded: expandedProp,
  defaultExpanded = [],
  onExpandedChange,
  onMove,
  canDrop,
  onMoveError,
  renderLabel,
  onItemContextMenu,
  height = '100%',
  className,
  'aria-label': ariaLabel,
  ref,
}: TreeViewProps) {
  const { messages } = useM3Locale()
  const treeId = useStableId('m3-tree')
  const scrollRef = useRef<HTMLDivElement>(null)
  const branches = useRef(new Map<string, Branch>())
  const parents = useRef(new Map<string, string | null>())
  const items = useRef(new Map<string, TreeItem>())
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [expandedList, setExpandedList] = useControllableState({
    value: expandedProp,
    defaultValue: defaultExpanded,
    onChange: onExpandedChange,
  })
  const expanded = useMemo(() => new Set(expandedList), [expandedList])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const loaderRef = useLatest(loadChildren)
  const typeahead = useRef(createTypeahead())

  const load = useCallback(
    async (parentId: string | null, append: boolean) => {
      const key = keyOf(parentId)
      const current = branches.current.get(key)
      // A refresh (not append) starts a new generation that supersedes any load in flight.
      if (current?.status === 'loading' && append) return
      const generation = (current?.generation ?? 0) + (append ? 0 : 1)
      const cursor = append ? (current?.nextCursor ?? null) : null
      branches.current.set(key, {
        items: append ? (current?.items ?? []) : [],
        nextCursor: append ? (current?.nextCursor ?? null) : null,
        status: 'loading',
        generation,
      })
      bump()
      try {
        const page = await loaderRef.current(parentId, cursor)
        const latest = branches.current.get(key)
        if (!latest || latest.generation !== generation) return
        for (const item of page.items) {
          parents.current.set(item.id, parentId)
          items.current.set(item.id, item)
        }
        branches.current.set(key, {
          items: [...latest.items, ...page.items],
          nextCursor: page.nextCursor ?? null,
          status: 'ready',
          generation,
        })
      } catch {
        const latest = branches.current.get(key)
        if (latest && latest.generation === generation)
          branches.current.set(key, { ...latest, status: 'error' })
      }
      bump()
    },
    [bump, loaderRef],
  )

  // Load the root, and the children of expanded nodes when first shown.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` re-runs this after each load (branches live in a ref)
  useEffect(() => {
    if (!branches.current.has(ROOT)) void load(null, false)
    for (const id of expanded) {
      if (items.current.has(id) && !branches.current.has(id)) void load(id, false)
    }
  }, [expanded, load, version])

  // biome-ignore lint/correctness/useExhaustiveDependencies: branches live in a ref; `version` tracks their changes
  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (parentId: string | null, depth: number) => {
      const branch = branches.current.get(keyOf(parentId))
      if (!branch) {
        out.push({ kind: 'loading', key: `loading:${parentId}`, depth, parentId })
        return
      }
      branch.items.forEach((item, index) => {
        out.push({
          kind: 'item',
          key: item.id,
          item,
          depth,
          parentId,
          pos: index + 1,
          size: branch.items.length + (branch.nextCursor ? 1 : 0),
        })
        if (item.hasChildren && expanded.has(item.id)) walk(item.id, depth + 1)
      })
      if (branch.status === 'loading')
        out.push({ kind: 'loading', key: `loading:${parentId}`, depth, parentId })
      else if (branch.status === 'error')
        out.push({ kind: 'error', key: `error:${parentId}`, depth, parentId })
      else if (branch.nextCursor)
        out.push({ kind: 'more', key: `more:${parentId}`, depth, parentId })
    }
    walk(null, 1)
    return out
  }, [expanded, version])

  const itemRows = rows.filter((r): r is Extract<Row, { kind: 'item' }> => r.kind === 'item')
  // Keyboard focus moves over items and over "could not load" rows (which retry on Enter).
  const navRows = rows.filter((r) => r.kind === 'item' || r.kind === 'error')
  const indexOfId = (key: string | null) =>
    key ? rows.findIndex((r) => (r.kind === 'item' || r.kind === 'error') && r.key === key) : -1
  const activeId = focusedId && indexOfId(focusedId) >= 0 ? focusedId : (navRows[0]?.key ?? null)
  const domId = (key: string) => `${treeId}-${key}`

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (index) => rows[index]!.key,
    initialRect: { width: 0, height: 600 },
  })
  const virtualRows = virtualizer.getVirtualItems()

  // Fetch the next page when a "more" row scrolls into view.
  useEffect(() => {
    for (const v of virtualRows) {
      const row = rows[v.index]
      if (row?.kind === 'more') void load(row.parentId, true)
    }
  }, [virtualRows, rows, load])

  const setExpanded = (id: string, open: boolean) => {
    setExpandedList((list) =>
      open ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id),
    )
  }

  const focusItem = (id: string) => {
    setFocusedId(id)
    const index = indexOfId(id)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }

  const isDescendant = (id: string, ancestorId: string) => {
    let current = parents.current.get(id) ?? null
    while (current) {
      if (current === ancestorId) return true
      current = parents.current.get(current) ?? null
    }
    return false
  }

  const refresh = useCallback(
    async (parentId: string | null = null) => {
      await load(parentId, false)
    },
    [load],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: handle methods read the latest rows through `rows`
  useImperativeHandle(
    ref,
    () => ({
      refresh,
      expand: (id) => setExpanded(id, true),
      collapse: (id) => setExpanded(id, false),
      focus: (id) => {
        scrollRef.current?.focus()
        if (id) focusItem(id)
      },
    }),
    [refresh, rows],
  )

  const performMove = async (move: TreeMove) => {
    const item = items.current.get(move.id)
    const target = items.current.get(move.targetId)
    if (!item || !target || !onMove) return
    if (move.id === move.targetId || isDescendant(move.targetId, move.id)) return
    if (canDrop && !canDrop(move)) return
    const fromParent = parents.current.get(move.id) ?? null
    const targetParent = parents.current.get(move.targetId) ?? null
    const toParent = move.position === 'inside' ? move.targetId : targetParent
    // Reload every affected branch once. Moving inside an item also reloads the item's own parent,
    // so a former leaf picks up its new `hasChildren` from the data source.
    const reload = () => {
      const branches = new Map<string, string | null>()
      for (const id of [
        fromParent,
        toParent,
        move.position === 'inside' ? targetParent : fromParent,
      ])
        branches.set(keyOf(id), id)
      return Promise.all([...branches.values()].map((id) => load(id, false)))
    }
    try {
      await onMove(move, item)
    } catch (error) {
      setAnnouncement(messages.moveFailed(item.label))
      onMoveError?.(error, move)
      // The data source may have changed partly: show what it holds now.
      await reload()
      return
    }
    const where =
      move.position === 'inside'
        ? `→ ${target.label}`
        : `${move.position === 'before' ? '↑' : '↓'} ${target.label}`
    setAnnouncement(messages.moved(item.label, where))
    await reload()
    if (move.position === 'inside') setExpanded(move.targetId, true)
    focusItem(move.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const row = rows[indexOfId(activeId)]
    if (!row || (row.kind !== 'item' && row.kind !== 'error')) return
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const right = rtl ? 'ArrowLeft' : 'ArrowRight'
    const left = rtl ? 'ArrowRight' : 'ArrowLeft'
    const position = navRows.indexOf(row)

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        if (e.altKey && row.kind === 'item') break
        e.preventDefault()
        const target =
          e.key === 'ArrowDown'
            ? navRows[position + 1]
            : e.key === 'ArrowUp'
              ? navRows[position - 1]
              : e.key === 'Home'
                ? navRows[0]
                : navRows.at(-1)
        if (target) focusItem(target.key)
        return
      }
    }

    if (row.kind === 'error') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        void load(row.parentId, true)
      } else if (e.key === left && row.parentId) {
        e.preventDefault()
        focusItem(row.parentId)
      }
      return
    }
    if (row.kind !== 'item') return

    const item = row.item
    if (e.altKey && onMove) {
      // Disabled items cannot be dragged, so they cannot be moved with the keyboard either.
      if (item.disabled) return
      const siblings = itemRows.filter((r) => r.parentId === row.parentId)
      const sibIndex = siblings.indexOf(row)
      let move: TreeMove | null = null
      if (e.key === 'ArrowUp' && sibIndex > 0)
        move = { id: item.id, targetId: siblings[sibIndex - 1]!.item.id, position: 'before' }
      else if (e.key === 'ArrowDown' && sibIndex < siblings.length - 1)
        move = { id: item.id, targetId: siblings[sibIndex + 1]!.item.id, position: 'after' }
      else if (e.key === right && sibIndex > 0)
        move = { id: item.id, targetId: siblings[sibIndex - 1]!.item.id, position: 'inside' }
      else if (e.key === left && row.parentId)
        move = { id: item.id, targetId: row.parentId, position: 'after' }
      if (move) {
        e.preventDefault()
        void performMove(move)
      }
      return
    }

    switch (e.key) {
      case right:
        e.preventDefault()
        if (item.hasChildren && !expanded.has(item.id)) setExpanded(item.id, true)
        else if (item.hasChildren) {
          const child = navRows[position + 1]
          if (child && child.parentId === item.id) focusItem(child.key)
        }
        break
      case left:
        e.preventDefault()
        if (item.hasChildren && expanded.has(item.id)) setExpanded(item.id, false)
        else if (row.parentId) focusItem(row.parentId)
        break
      case 'Enter':
        e.preventDefault()
        if (item.disabled) break
        onSelect?.(item)
        onActivate?.(item)
        break
      case ' ':
        e.preventDefault()
        if (!item.disabled) onSelect?.(item)
        break
      case '*': {
        e.preventDefault()
        const siblings = itemRows.filter((r) => r.parentId === row.parentId && r.item.hasChildren)
        setExpandedList((list) => [...new Set([...list, ...siblings.map((s) => s.item.id)])])
        break
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const match = typeahead.current(
            e.key,
            navRows.map((r) => (r.kind === 'item' ? r.item.label : '')),
            position,
          )
          if (match >= 0) focusItem(navRows[match]!.key)
        }
    }
  }

  // ----- Pointer drag and drop -----
  const [drag, setDrag] = useState<{
    id: string
    label: string
    x: number
    y: number
    target: { id: string; position: DropPosition; valid: boolean } | null
  } | null>(null)
  const pending = useRef<{ id: string; x: number; y: number; pointerId: number } | null>(null)
  const dragRef = useLatest(drag)
  const performMoveRef = useLatest(performMove)
  const canDropRef = useLatest(canDrop)

  // biome-ignore lint/correctness/useExhaustiveDependencies: listeners read refs; they only need re-binding when DnD is toggled
  useEffect(() => {
    if (!onMove) return
    let frame = 0
    let edgeSpeed = 0
    const autoScroll = () => {
      if (edgeSpeed && scrollRef.current) scrollRef.current.scrollTop += edgeSpeed
      frame = requestAnimationFrame(autoScroll)
    }
    const onPointerMove = (e: PointerEvent) => {
      const start = pending.current
      if (!start || e.pointerId !== start.pointerId) return
      const current = dragRef.current
      if (!current && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return
      const item = items.current.get(start.id)
      if (!item) return
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-tree-row]')
      let target: { id: string; position: DropPosition; valid: boolean } | null = null
      if (el && scrollRef.current?.contains(el) && el.dataset.id) {
        const rect = el.getBoundingClientRect()
        const ratio = (e.clientY - rect.top) / rect.height
        const position: DropPosition = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
        const targetId = el.dataset.id
        const move = { id: start.id, targetId, position }
        const check = canDropRef.current
        const valid =
          targetId !== start.id && !isDescendant(targetId, start.id) && (!check || check(move))
        target = { id: targetId, position, valid }
      }
      const box = scrollRef.current?.getBoundingClientRect()
      edgeSpeed = box ? (e.clientY < box.top + 32 ? -8 : e.clientY > box.bottom - 32 ? 8 : 0) : 0
      setDrag({ id: start.id, label: item.label, x: e.clientX, y: e.clientY, target })
    }
    const finish = (commit: boolean) => {
      const current = dragRef.current
      pending.current = null
      edgeSpeed = 0
      setDrag(null)
      if (commit && current?.target?.valid) {
        void performMoveRef.current({
          id: current.id,
          targetId: current.target.id,
          position: current.target.position,
        })
      }
    }
    const onPointerUp = () => finish(true)
    const onPointerCancel = () => finish(false)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current) {
        e.preventDefault()
        finish(false)
      }
    }
    frame = requestAnimationFrame(autoScroll)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onMove])

  const onRowPointerDown = (e: ReactPointerEvent<HTMLDivElement>, item: TreeItem) => {
    if (!onMove || e.button !== 0 || item.disabled) return
    if ((e.target as HTMLElement).closest('[data-tree-toggle]')) return
    pending.current = { id: item.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  }

  const loading = rows.some((r) => r.kind === 'loading')
  return (
    <div className={cx('m3-tree', className)} style={{ height }}>
      <div
        ref={scrollRef}
        role="tree"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        aria-activedescendant={activeId ? domId(activeId) : undefined}
        className="m3-tree__scroll m3-focus-ring-inward"
        data-dragging={drag ? '' : undefined}
        onKeyDown={onKeyDown}
      >
        <div className="m3-tree__inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualRows.map((v) => {
            const row = rows[v.index]!
            const style = {
              height: rowHeight,
              transform: `translateY(${v.start}px)`,
              paddingInlineStart: (row.depth - 1) * indent + 8,
            }
            if (row.kind === 'error') {
              return (
                <div
                  key={row.key}
                  id={domId(row.key)}
                  role="treeitem"
                  aria-level={row.depth}
                  className="m3-tree__status m3-tree__error"
                  data-focused={row.key === activeId ? '' : undefined}
                  style={style}
                  onClick={() => {
                    setFocusedId(row.key)
                    void load(row.parentId, true)
                  }}
                >
                  <Icon name="error" size={18} />
                  <span>{messages.retry}</span>
                </div>
              )
            }
            if (row.kind !== 'item') {
              return (
                <div key={row.key} className="m3-tree__status" style={style} aria-hidden="true">
                  <LoadingIndicator size={24} aria-hidden />
                  <span>{row.kind === 'more' ? messages.loadMore : messages.loading}</span>
                </div>
              )
            }
            const { item } = row
            const isExpanded = item.hasChildren && expanded.has(item.id)
            const drop = drag?.target?.id === item.id ? drag.target : null
            return (
              <div
                key={row.key}
                id={domId(row.key)}
                role="treeitem"
                aria-level={row.depth}
                aria-posinset={row.pos}
                aria-setsize={row.size}
                aria-expanded={item.hasChildren ? isExpanded : undefined}
                aria-selected={item.id === selectedId}
                aria-disabled={item.disabled || undefined}
                className="m3-tree__row"
                data-tree-row=""
                data-id={item.id}
                data-focused={item.id === activeId ? '' : undefined}
                data-selected={item.id === selectedId ? '' : undefined}
                data-dragged={drag?.id === item.id ? '' : undefined}
                data-drop={drop ? drop.position : undefined}
                data-drop-invalid={drop && !drop.valid ? '' : undefined}
                style={style}
                onPointerDown={(e) => onRowPointerDown(e, item)}
                onClick={() => {
                  setFocusedId(item.id)
                  scrollRef.current?.focus({ preventScroll: true })
                  if (!item.disabled) onSelect?.(item)
                }}
                onDoubleClick={() => !item.disabled && onActivate?.(item)}
                onContextMenu={onItemContextMenu ? (e) => onItemContextMenu(item, e) : undefined}
              >
                <span
                  className="m3-tree__toggle"
                  data-tree-toggle=""
                  data-open={isExpanded ? '' : undefined}
                  aria-hidden="true"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (item.hasChildren) setExpanded(item.id, !isExpanded)
                    setFocusedId(item.id)
                    scrollRef.current?.focus({ preventScroll: true })
                  }}
                >
                  {item.hasChildren && (
                    <Icon name="chevron_right" size={20} className="m3-mirror-rtl-icon" />
                  )}
                </span>
                {item.icon && (
                  <span className="m3-tree__icon">
                    {renderIcon(item.icon, { size: 20, filled: item.id === selectedId })}
                  </span>
                )}
                <span className="m3-tree__label">
                  {renderLabel ? renderLabel(item) : item.label}
                </span>
                {item.meta && <span className="m3-tree__meta">{item.meta}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="m3-visually-hidden" aria-live="polite">
        {announcement}
      </div>
      {drag && (
        <Portal>
          <div
            className="m3-tree__ghost"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
            aria-hidden="true"
          >
            <Icon name="drag_indicator" size={18} />
            {drag.label}
          </div>
        </Portal>
      )}
    </div>
  )
}

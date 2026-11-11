import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Selection<T> {
  selected: ReadonlySet<string>;
  /** The selected rows that are in view, in list order. */
  items: T[];
  count: number;
  /** Something is selected: a plain click then toggles a row instead of opening it. */
  selecting: boolean;
  allSelected: boolean;
  isSelected: (id: string) => boolean;
  /** `range` extends from the last toggled row (shift). */
  toggle: (id: string, range?: boolean) => void;
  selectAll: () => void;
  /** Adds ids from beyond the rows in view, e.g. every match across pages. */
  add: (ids: Iterable<string>) => void;
  /** Takes ids out, e.g. rows that were just deleted. */
  remove: (ids: Iterable<string>) => void;
  clear: () => void;
}

export interface SelectionOptions {
  /** Keep ids that are no longer in view, for a selection that spans pages. */
  keepUnseen?: boolean;
}

/**
 * Selection over the rows in view: click toggles, shift extends a range from the last toggled row,
 * and it clears whenever any of `resetKeys` changes (search, filter, sort, page). Rows that leave
 * the list leave the selection too.
 */
export function useSelection<T>(items: readonly T[], getId: (item: T) => string, resetKeys: readonly unknown[] = [], { keepUnseen = false }: SelectionOptions = {}): Selection<T> {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchorId = useRef<string | null>(null);
  const getIdRef = useRef(getId);
  getIdRef.current = getId;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const clear = useCallback(() => {
    setSelected((current) => (current.size === 0 ? current : new Set()));
    anchorId.current = null;
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(clear, resetKeys);

  useEffect(() => {
    if (keepUnseen) return;
    setSelected((current) => {
      if (current.size === 0) return current;
      const visible = new Set(items.map((item) => getIdRef.current(item)));
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items, keepUnseen]);

  const toggle = useCallback((id: string, range = false) => {
    const list = itemsRef.current;
    const idOf = getIdRef.current;
    const anchor = anchorId.current;
    setSelected((current) => {
      const next = new Set(current);
      const from = anchor ? list.findIndex((item) => idOf(item) === anchor) : -1;
      const to = list.findIndex((item) => idOf(item) === id);
      if (range && from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (const item of list.slice(start, end + 1)) next.add(idOf(item));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorId.current = id;
  }, []);

  const selectAll = useCallback(() => setSelected((current) => new Set([...(keepUnseen ? current : []), ...itemsRef.current.map((item) => getIdRef.current(item))])), [keepUnseen]);
  const add = useCallback((ids: Iterable<string>) => setSelected((current) => new Set([...current, ...ids])), []);
  const remove = useCallback((ids: Iterable<string>) => {
    const gone = new Set(ids);
    setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
  }, []);
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const selectedItems = useMemo(() => items.filter((item) => selected.has(getIdRef.current(item))), [items, selected]);
  const allSelected = items.length > 0 && items.every((item) => selected.has(getIdRef.current(item)));

  return { selected, items: selectedItems, count: selected.size, selecting: selected.size > 0, allSelected, isSelected, toggle, selectAll, add, remove, clear };
}

export interface IdSelection {
  selected: ReadonlySet<string>;
  /** `range` extends from the last toggled id through `scopeIds`, the ids in view in their order. */
  toggle: (id: string, range: boolean, scopeIds: readonly string[]) => void;
  /** Selects every id in view, or clears them when all are already selected. */
  toggleAll: (scopeIds: readonly string[]) => void;
  remove: (ids: Iterable<string>) => void;
  clear: () => void;
}

/**
 * The same selection for a list whose rows are only known where it is drawn: the caller names the
 * ids in view with each call instead of handing the rows to the hook.
 */
export function useIdSelection(): IdSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchorId = useRef<string | null>(null);

  const toggle = useCallback((id: string, range: boolean, scopeIds: readonly string[]) => {
    const anchor = anchorId.current;
    setSelected((current) => {
      const next = new Set(current);
      const from = anchor ? scopeIds.indexOf(anchor) : -1;
      const to = scopeIds.indexOf(id);
      if (range && from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (const scoped of scopeIds.slice(start, end + 1)) next.add(scoped);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorId.current = id;
  }, []);

  const toggleAll = useCallback((scopeIds: readonly string[]) => {
    setSelected((current) => {
      const next = new Set(current);
      const all = scopeIds.length > 0 && scopeIds.every((id) => next.has(id));
      for (const id of scopeIds) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const remove = useCallback((ids: Iterable<string>) => {
    const gone = new Set(ids);
    setSelected((current) => ([...current].some((id) => gone.has(id)) ? new Set([...current].filter((id) => !gone.has(id))) : current));
  }, []);

  const clear = useCallback(() => {
    setSelected((current) => (current.size === 0 ? current : new Set()));
    anchorId.current = null;
  }, []);

  return useMemo(() => ({ selected, toggle, toggleAll, remove, clear }), [selected, toggle, toggleAll, remove, clear]);
}

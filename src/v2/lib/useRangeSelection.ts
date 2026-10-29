import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Selection over the rows in view: click toggles, shift extends a range from the last toggled row,
 * and it clears whenever any of `resetKeys` changes (search, filter, sort, page).
 */
export function useRangeSelection<T>(items: readonly T[], getId: (item: T) => string, resetKeys: readonly unknown[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorId = useRef<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
    anchorId.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetKeys);

  const clear = useCallback(() => setSelected(new Set()), []);
  const selectAll = () => setSelected(new Set(items.map(getId)));

  const toggle = (id: string, range: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      const from = anchorId.current ? items.findIndex((item) => getId(item) === anchorId.current) : -1;
      const to = items.findIndex((item) => getId(item) === id);
      if (range && from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (const item of items.slice(start, end + 1)) next.add(getId(item));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorId.current = id;
  };

  return { selected, setSelected, toggle, selectAll, clear };
}

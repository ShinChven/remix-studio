import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * Finds how much a row has to give up to fit its own width, by measuring rather than guessing a
 * breakpoint: labels differ per language, so no fixed width is right for all of them.
 *
 * The row starts at level 0 (everything shown) whenever its width or `signature` (whatever
 * changes its content) changes, then climbs one level at a time while its content still
 * overflows, up to `maxLevel`. Style each level from the `data-fit` attribute; the row itself
 * must not wrap below `maxLevel`, or it would never overflow.
 */
export function useFitLevel<E extends HTMLElement>(maxLevel: number, signature: string | number = ''): { ref: (element: E | null) => void; level: number } {
  const [element, setElement] = useState<E | null>(null);
  const [state, setState] = useState({ level: 0, width: -1, signature });

  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const width = Math.round(element.clientWidth);
      setState((current) => (current.width === width ? current : { ...current, level: 0, width }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  if (state.signature !== signature) setState({ ...state, level: 0, signature });

  useLayoutEffect(() => {
    if (!element || state.level >= maxLevel) return;
    if (element.scrollWidth > element.clientWidth + 1) setState((current) => (current.level >= maxLevel ? current : { ...current, level: current.level + 1 }));
  });

  const ref = useCallback((next: E | null) => setElement(next), []);
  return { ref, level: state.level };
}

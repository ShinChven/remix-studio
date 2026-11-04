import { useLayoutEffect, useRef, type RefObject } from 'react';
import { scrollElementToTop, scrollListToTop } from '../../lib/scroll';

interface PaginationScrollOptions {
  page: number;
  pageSize?: number | 'all';
  /** A separate results pane, such as the album or a picker grid. */
  containerRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

/**
 * Scroll once when paging changes, regardless of which control or URL update
 * changed it. Without a separate pane, attach the returned ref to the page.
 * Initial renders, refreshes, and changes in inactive tabs keep their position.
 */
export function usePaginationScroll({ page, pageSize, containerRef, enabled = true }: PaginationScrollOptions) {
  const pageRef = useRef<HTMLDivElement>(null);
  const previous = useRef({ page, pageSize });

  useLayoutEffect(() => {
    const changed = previous.current.page !== page || previous.current.pageSize !== pageSize;
    previous.current = { page, pageSize };
    if (!enabled || !changed) return;

    if (containerRef) scrollElementToTop(containerRef.current);
    else if (pageRef.current) scrollListToTop(pageRef.current);
  }, [page, pageSize, containerRef, enabled]);

  return pageRef;
}

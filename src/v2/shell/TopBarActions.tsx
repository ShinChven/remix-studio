import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Where a page may put its own actions in the phone top bar; null while that bar is not shown. */
export const TopBarSlotContext = createContext<HTMLElement | null>(null);

/**
 * Renders its children in the phone top bar. Without that bar (wider screens), it renders
 * `fallback` in place instead, or nothing.
 */
export function TopBarActions({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const slot = useContext(TopBarSlotContext);
  return slot ? createPortal(children, slot) : <>{fallback}</>;
}

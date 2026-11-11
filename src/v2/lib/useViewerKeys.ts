import { useEffect, useRef } from 'react';

export interface ViewerKeys {
  /** ← */
  onPrevious?: () => void;
  /** → */
  onNext?: () => void;
  /** Escape; omit where the dialog itself closes on Escape. */
  onClose?: () => void;
}

/**
 * Arrow keys step through what a viewer shows, and Escape closes it. Keys held with a modifier,
 * or pressed in a field or on a player that uses them itself, are left alone.
 */
export function useViewerKeys(active: boolean, keys: ViewerKeys) {
  const keysRef = useRef(keys);
  keysRef.current = keys;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, video, audio, [contenteditable="true"]')) return;
      const { onPrevious, onNext, onClose } = keysRef.current;
      const run = event.key === 'ArrowLeft' ? onPrevious : event.key === 'ArrowRight' ? onNext : event.key === 'Escape' ? onClose : undefined;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

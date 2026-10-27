import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Menu, useMediaQuery, type Placement } from '../../m3';

export interface HoverMenuTriggerProps {
  ref: (el: HTMLElement | null) => void;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
}

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 240;

/**
 * A menu that opens when the pointer rests on its trigger, and stays while the pointer is on the
 * trigger or on any open menu (submenus included). Clicking keeps it open; touch screens, which
 * cannot hover, open it with a tap.
 */
export function HoverMenuButton({ trigger, children, placement, 'aria-label': ariaLabel }: { trigger: (props: HoverMenuTriggerProps) => ReactElement; children: ReactNode; placement?: Placement; 'aria-label'?: string }) {
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<'first' | 'last' | 'none'>('first');
  // Opened by hovering and not clicked since: the only state in which leaving closes it.
  const [transient, setTransient] = useState(false);
  const timer = useRef<number | null>(null);
  const id = `m3-menu-${useId()}`;

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  // While open from a hover, close once the pointer has been away from the trigger and every menu for a moment.
  useEffect(() => {
    if (!open || !transient || !canHover) return;
    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const inside = (anchor && target && anchor.contains(target)) || target?.closest('[role="menu"]');
      if (inside) return cancel();
      if (timer.current === null) timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancel();
    };
  }, [open, transient, canHover, anchor]);

  const openSoon = () => {
    if (!canHover || open) return;
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setTransient(true);
      setFocus('none');
      setOpen(true);
    }, OPEN_DELAY_MS);
  };
  // Leaving the trigger before the menu has opened calls the opening off; once open, the pointer watcher decides.
  const cancelOpening = () => {
    if (!open) cancel();
  };

  return (
    <>
      {trigger({
        ref: setAnchor,
        onClick: () => {
          cancel();
          setFocus('first');
          if (open && transient) {
            setTransient(false);
            return;
          }
          setTransient(false);
          setOpen((o) => !o);
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setTransient(false);
            setFocus(e.key === 'ArrowDown' ? 'first' : 'last');
            setOpen(true);
          }
        },
        onMouseEnter: openSoon,
        onMouseLeave: cancelOpening,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
      })}
      <Menu
        id={id}
        open={open}
        anchor={anchor}
        placement={placement}
        initialFocus={focus}
        onClose={() => {
          cancel();
          setTransient(false);
          setOpen(false);
        }}
        aria-label={ariaLabel}
      >
        {children}
      </Menu>
    </>
  );
}

import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { Checkbox, cx, Ripple, Text } from '../../m3';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

/** Clicks and keys inside a control stay there instead of opening the row. */
export const keepInside = (event: SyntheticEvent) => event.stopPropagation();

/**
 * A stack of selectable entity rows. Lives inside a `pane` container, whose width decides which
 * cells stay (see `EntityCell.drop`). `selecting` shows every row's checkbox.
 */
export function EntityList({ children, selecting = false, busy = false, className }: { children: ReactNode; selecting?: boolean; busy?: boolean; className?: string }) {
  return (
    <ul className={cx('v2-erow-list', className)} data-selecting={selecting ? '' : undefined} aria-busy={busy}>
      {children}
    </ul>
  );
}

export interface EntityCell {
  key: string;
  /** Column width (CSS length). */
  width: string;
  /** Names the column for screen readers and the tooltip; omit when the content labels itself. */
  label?: string;
  title?: string;
  /** The cell leaves as the pane narrows: 1 below 1120px, 2 below 1040px, 3 below 900px, 4 below 820px, 5 below 720px. */
  drop?: 1 | 2 | 3 | 4 | 5;
  /** Below 600px the row stacks: the cell either moves under the name or leaves. Default leaves. */
  narrow?: 'below' | 'hide';
  /** Lets the column give way when the row is tight, instead of holding its width. */
  shrink?: boolean;
  className?: string;
  children: ReactNode;
}

export interface EntityRowProps {
  /** The picture on the left; `active` is true while the pointer or focus is on the row. */
  lead: (active: boolean) => ReactNode;
  title: ReactNode;
  /** After the title: status pills and marks. */
  badges?: ReactNode;
  subtitle?: ReactNode;
  /** Free-form lines under the subtitle (links, progress); clicks in it never open or select the row. */
  detail?: ReactNode;
  cells?: EntityCell[];
  /** Rows that can be selected pass all four; the rest show their picture and just open. */
  selected?: boolean;
  /** Something on the page is selected: a click then toggles the row instead of opening it. */
  selecting?: boolean;
  /** `range` extends the selection from the last toggled row (shift). */
  onToggleSelect?: (range: boolean) => void;
  selectLabel?: string;
  /** Without it a plain click does nothing (selection still works). */
  onOpen?: () => void;
  /** Names the row for screen readers. */
  ariaLabel: string;
  /** The row's menu; `actions` replaces it with buttons that stay in view. */
  menuLabel?: string;
  menuItems?: ActionMenuItem[];
  actions?: ReactNode;
  /** Keeps the checkbox beside the picture instead of swapping with it on hover. */
  checkAlways?: boolean;
  /** Marks the row as failed with an accent edge. */
  failed?: boolean;
  /** Quiet the title, e.g. for a disabled account. */
  dimmed?: boolean;
  className?: string;
}

/** One entity as a row: its picture (a checkbox while selecting), name, a few columns and a menu. */
export function EntityRow({ lead, title, badges, subtitle, detail, cells = [], selected = false, selecting = false, onToggleSelect, selectLabel, onOpen, ariaLabel, menuLabel, menuItems, actions, checkAlways, failed, dimmed, className }: EntityRowProps) {
  const [active, setActive] = useState(false);

  const activate = (event: MouseEvent | KeyboardEvent) => {
    if (onToggleSelect && (selecting || event.metaKey || event.ctrlKey || event.shiftKey)) onToggleSelect(event.shiftKey);
    else onOpen?.();
  };

  return (
    <li
      className={cx('v2-erow m3-focus-ring', className)}
      data-selectable={onToggleSelect ? '' : undefined}
      data-selected={selected ? '' : undefined}
      data-dimmed={dimmed ? '' : undefined}
      data-failed={failed ? '' : undefined}
      data-check-always={checkAlways ? '' : undefined}
      data-actions={actions ? '' : undefined}
      role={onOpen || onToggleSelect ? 'button' : undefined}
      tabIndex={onOpen || onToggleSelect ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={activate}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={(event) => event.target === event.currentTarget && setActive(true)}
      onBlur={(event) => event.target === event.currentTarget && setActive(false)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') activate(event);
        if (event.key === ' ') {
          event.preventDefault();
          if (onToggleSelect) onToggleSelect(event.shiftKey);
          else onOpen?.();
        }
      }}
    >
      <Ripple />
      <span className="v2-erow__lead">
        {onToggleSelect && (
          <span
            className="v2-erow__check"
            onClick={(event) => {
              event.stopPropagation();
              if (event.target instanceof HTMLInputElement) onToggleSelect(event.shiftKey);
            }}
          >
            <Checkbox checked={selected} aria-label={selectLabel} onChange={() => undefined} />
          </span>
        )}
        <span className="v2-erow__art">{lead(active)}</span>
      </span>

      <span className="v2-erow__identity">
        <span className="v2-erow__title-line">
          <Text as="span" variant="title-small" emphasized className="v2-erow__title">
            {title}
          </Text>
          {badges}
        </span>
        {subtitle && (
          <Text as="span" variant="body-small" className="v2-erow__sub">
            {subtitle}
          </Text>
        )}
        {detail && (
          <span className="v2-erow__detail" onClick={keepInside} onKeyDown={keepInside}>
            {detail}
          </span>
        )}
      </span>

      {cells.map((cell) => (
        <span
          key={cell.key}
          className={cx('v2-erow__cell', cell.className)}
          style={{ '--w': cell.width } as CSSProperties}
          title={cell.title ?? cell.label}
          data-drop={cell.drop}
          data-narrow={cell.narrow ?? 'hide'}
          data-shrink={cell.shrink ? '' : undefined}
        >
          {cell.label && <span className="sr-only">{cell.label}</span>}
          {cell.children}
        </span>
      ))}

      {actions ? (
        <span className="v2-erow__actions" onClick={keepInside} onKeyDown={keepInside}>
          {actions}
        </span>
      ) : (
        menuItems && (
          <span className="v2-erow__menu" onClick={keepInside} onKeyDown={keepInside}>
            <ActionMenu label={menuLabel ?? ''} items={menuItems} openOnHover />
          </span>
        )
      )}
    </li>
  );
}

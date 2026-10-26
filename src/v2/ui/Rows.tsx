import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx, Ripple, Text } from '../../m3';

/** A stack of surface rows separated by hairline gaps (segmented list), or a two-column grid. */
export function RowList({ children, columns = 1, className }: { children: ReactNode; columns?: 1 | 2; className?: string }) {
  return (
    <div className={cx('v2-rows', className)} data-columns={columns} role="list">
      {children}
    </div>
  );
}

export interface RowProps {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Extra content under the meta line. */
  children?: ReactNode;
  actions?: ReactNode;
  /** Makes the whole row navigate; inner buttons keep their own clicks. */
  to?: string;
  /** Receives the event so callers can read modifier keys. */
  onClick?: (e: MouseEvent | KeyboardEvent) => void;
  className?: string;
  selected?: boolean;
}

/** A list row: leading visual, title, metadata and trailing actions. */
export function Row({ lead, title, meta, children, actions, to, onClick, className, selected }: RowProps) {
  const navigate = useNavigate();
  const interactive = to !== undefined || onClick !== undefined;
  const activate = (e: MouseEvent | KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, label, [role="menu"]') && e.target !== e.currentTarget) return;
    if (onClick) onClick(e);
    else if (to) navigate(to);
  };
  return (
    <div
      role="listitem"
      className={cx('v2-row', interactive && 'm3-focus-ring', className)}
      data-interactive={interactive ? '' : undefined}
      data-selected={selected ? '' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault();
                activate(e);
              }
            }
          : undefined
      }
    >
      {interactive && <Ripple />}
      {lead && <span className="v2-row__lead">{lead}</span>}
      <div className="v2-row__body">
        <Text as="div" variant="title-small" emphasized className="truncate">
          {title}
        </Text>
        {meta && <div className="v2-row__meta">{meta}</div>}
        {children}
      </div>
      {actions && <div className="v2-row__actions">{actions}</div>}
    </div>
  );
}

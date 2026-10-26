import type { ReactNode } from 'react';
import { Button, ButtonGroup, cx, Fab, Icon, Text, type ButtonSize } from '../../m3';

/** A row of list controls (title with count, filters, search, actions) that wraps on narrow windows. */
export function ListToolbar({ title, icon, count, children, className }: { title?: ReactNode; icon?: string; count?: number; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('v2-list-toolbar', className)}>
      {title && (
        <div className="v2-list-toolbar__title">
          {icon && <Icon name={icon} className="text-primary" />}
          <Text as="h2" variant="title-large" emphasized>
            {title}
          </Text>
          {count !== undefined && count > 0 && <span className="v2-count">{count}</span>}
        </div>
      )}
      {children && <div className="v2-list-toolbar__controls">{children}</div>}
    </div>
  );
}

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: string;
}

/** Single-choice connected button group (the M3 Expressive segmented control). */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  size = 'xs',
  className,
  'aria-label': ariaLabel,
  fullWidth,
}: {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: ButtonSize;
  className?: string;
  'aria-label'?: string;
  fullWidth?: boolean;
}) {
  return (
    <ButtonGroup
      variant="connected"
      selection="single"
      size={size}
      value={value}
      onChange={(next) => next && onChange(next as V)}
      aria-label={ariaLabel}
      className={className}
      fullWidth={fullWidth}
    >
      {options.map((option) => (
        <Button key={option.value} value={option.value} variant="tonal" icon={option.icon}>
          {option.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

/** Floating action button pinned to the bottom of the window on phones only. */
export function MobileFab({ icon, label, onClick, href }: { icon: string; label: string; onClick?: () => void; href?: string }) {
  return (
    <div className="v2-mobile-fab">
      {href !== undefined ? <Fab icon={icon} aria-label={label} href={href} size="regular" /> : <Fab icon={icon} aria-label={label} onClick={onClick} size="regular" />}
    </div>
  );
}

/** Responsive card grid. */
export function CardGrid({ children, min = 280, className }: { children: ReactNode; min?: number; className?: string }) {
  return (
    <div className={cx('v2-card-grid', className)} style={{ ['--v2-card-min' as string]: `${min}px` }}>
      {children}
    </div>
  );
}

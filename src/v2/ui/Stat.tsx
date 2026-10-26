import type { ReactNode } from 'react';
import { cx, Icon, Text } from '../../m3';

export type Tone = 'neutral' | 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';

/** A labelled figure: counts, sizes and totals on overview pages. */
export function StatTile({ label, value, icon, tone = 'neutral', hint, className }: { label: ReactNode; value: ReactNode; icon?: string; tone?: Tone; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx('v2-stat', className)} data-tone={tone}>
      <div className="flex items-center gap-2">
        {icon && <Icon name={icon} size={18} />}
        <Text as="span" variant="label-medium" className="v2-stat__label">
          {label}
        </Text>
      </div>
      <Text as="span" variant="headline-small" emphasized className="v2-stat__value">
        {value}
      </Text>
      {hint && (
        <Text as="span" variant="body-small" className="v2-stat__hint">
          {hint}
        </Text>
      )}
    </div>
  );
}

/** A small status label with an optional icon, colored by tone. */
export function StatusPill({ tone = 'neutral', icon, children, className, title }: { tone?: Tone; icon?: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cx('v2-pill', className)} data-tone={tone} title={title}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/** A compact label–value pair for dense metric rows. */
export function MetricChip({ label, value, tone = 'neutral' }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <span className="v2-metric" data-tone={tone}>
      <span className="v2-metric__label">{label}</span>
      <span className="v2-metric__value">{value}</span>
    </span>
  );
}

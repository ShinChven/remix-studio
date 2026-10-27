import type { ReactNode } from 'react';
import { cx, Icon, Shape, Text, type MaterialShapeName } from '../../m3';

export interface PageHeroStat {
  key: string;
  value?: ReactNode;
  label: ReactNode;
  /** A status dot before the figure. */
  tone?: 'success' | 'warning' | 'error' | 'running';
  icon?: string;
  title?: string;
}

export interface PageHeroProps {
  title: ReactNode;
  description?: ReactNode;
  /** The destination's icon, on a small expressive shape. */
  icon: string;
  shape?: MaterialShapeName;
  /** A few figures under the description, as plain text. */
  stats?: PageHeroStat[];
  actions?: ReactNode;
  className?: string;
}

/** Header of a top-level destination: a shaped icon, the title, a line of figures and the actions. */
export function PageHero({ title, description, icon, shape = 'cookie-9', stats, actions, className }: PageHeroProps) {
  return (
    <header className={cx('v2-page-hero', className)}>
      <span className="v2-page-hero__badge" aria-hidden>
        <Shape name={shape} size={48} morph={false} className="v2-page-hero__badge-shape" />
        <Icon name={icon} size={24} filled className="v2-page-hero__badge-icon" />
      </span>
      <div className="v2-page-hero__titles">
        <Text as="h1" variant="headline-small" emphasized className="v2-page-hero__title">
          {title}
        </Text>
        {description && (
          <Text as="p" variant="body-medium" className="v2-page-hero__description">
            {description}
          </Text>
        )}
        {stats && stats.length > 0 && (
          <ul className="v2-page-hero__stats">
            {stats.map((stat) => (
              <li key={stat.key} data-tone={stat.tone} title={stat.title}>
                {stat.tone ? <span className="v2-page-hero__dot" aria-hidden /> : stat.icon && <Icon name={stat.icon} size={16} aria-hidden />}
                {stat.value !== undefined && <strong>{stat.value}</strong>}
                {stat.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {actions && <div className="v2-page-hero__actions">{actions}</div>}
    </header>
  );
}

import type { ReactNode } from 'react';
import { cx, Icon, Shape, Text, type MaterialShapeName } from '../../m3';
import type { PageHeroStat } from './PageHero';

export interface ShowcaseHeroProps {
  title: ReactNode;
  /** A short label above the title, in the hero's tone. */
  kicker?: ReactNode;
  description?: ReactNode;
  icon: string;
  shape?: MaterialShapeName;
  /** The large shape behind the hero's end. */
  backdrop?: MaterialShapeName;
  tone?: 'primary' | 'secondary' | 'tertiary';
  stats?: PageHeroStat[];
  actions?: ReactNode;
  /** Up to three things fanned out at the end of the hero, front one first. */
  fan?: ReactNode[];
  className?: string;
}

/** Header of a destination that shows what it holds: a tinted panel with the title, figures as chips, the actions and a small fan of its contents. */
export function ShowcaseHero({ title, kicker, description, icon, shape = 'cookie-9', backdrop = 'cookie-12', tone = 'primary', stats, actions, fan, className }: ShowcaseHeroProps) {
  const cards = fan?.slice(0, 3) ?? [];
  return (
    <header className={cx('v2-showcase-hero', className)} data-tone={tone}>
      <Shape name={backdrop} size={320} morph={false} className="v2-showcase-hero__backdrop" />
      <div className="v2-showcase-hero__main">
        <div className="v2-showcase-hero__heading">
          <span className="v2-showcase-hero__badge" aria-hidden>
            <Shape name={shape} size={56} morph={false} className="v2-showcase-hero__badge-shape" />
            <Icon name={icon} size={28} filled className="v2-showcase-hero__badge-icon" />
          </span>
          <div className="v2-showcase-hero__titles">
            {kicker && (
              <Text as="span" variant="label-large" emphasized className="v2-showcase-hero__kicker">
                {kicker}
              </Text>
            )}
            <Text as="h1" variant="headline-large" emphasized className="v2-showcase-hero__title">
              {title}
            </Text>
          </div>
        </div>
        {description && (
          <Text as="p" variant="body-large" className="v2-showcase-hero__description">
            {description}
          </Text>
        )}
        {stats && stats.length > 0 && (
          <ul className="v2-showcase-hero__stats">
            {stats.map((stat) => (
              <li key={stat.key} data-tone={stat.tone} title={stat.title}>
                {stat.tone ? <span className="v2-showcase-hero__dot" aria-hidden /> : stat.icon && <Icon name={stat.icon} size={16} aria-hidden />}
                {stat.value !== undefined && <strong>{stat.value}</strong>}
                {stat.label}
              </li>
            ))}
          </ul>
        )}
        {actions && <div className="v2-showcase-hero__actions">{actions}</div>}
      </div>
      {cards.length > 0 && (
        <div className="v2-showcase-hero__fan" data-count={cards.length} aria-hidden>
          {cards.map((card, index) => (
            <span key={index} className="v2-showcase-hero__fan-item" data-index={index}>
              {card}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

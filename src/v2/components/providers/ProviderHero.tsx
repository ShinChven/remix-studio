import { useState, type ReactNode } from 'react';
import { Button, cx, Shape, Text } from '../../../m3';
import type { ProviderType } from '../../../types';
import { ProviderMark } from './ProviderMark';
import { serviceMeta } from './providerMeta';

export interface ProviderHeroProps {
  type: ProviderType | string;
  backLink: { to: string; label: string };
  /** Small line above the title; the service's name by default. */
  kicker?: ReactNode;
  title: ReactNode;
  /** Quiet line under the title, e.g. the custom address. */
  subtitle?: ReactNode;
  /** Status pills beside the title. */
  badges?: ReactNode;
  description?: ReactNode;
  /** Figures under the description. */
  stats?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * The header of a single provider's pages, in its service's color: its mark and shape (which morph
 * when the service changes), name, status, figures and actions.
 */
export function ProviderHero({ type, backLink, kicker, title, subtitle, badges, description, stats, actions, className }: ProviderHeroProps) {
  const [active, setActive] = useState(false);
  const service = serviceMeta(type);
  return (
    <header className={cx('v2-provider-hero', className)} data-tone={service.tone} onPointerEnter={() => setActive(true)} onPointerLeave={() => setActive(false)}>
      <Shape name={service.shape} size={420} morph="slow" className="v2-provider-hero__backdrop" />
      <div className="v2-provider-hero__top">
        <Button variant="text" size="xs" icon="arrow_back" href={backLink.to} className="v2-provider-hero__back">
          {backLink.label}
        </Button>
        {actions && <div className="v2-provider-hero__actions">{actions}</div>}
      </div>
      <div className="v2-provider-hero__heading">
        <ProviderMark type={type} size={88} active={active} className="v2-provider-hero__mark" />
        <div className="v2-provider-hero__titles">
          <Text as="span" variant="label-large" emphasized className="v2-provider-hero__kicker">
            {kicker ?? service.label}
          </Text>
          <span className="v2-provider-hero__title-line">
            <Text as="h1" variant="headline-large" emphasized className="v2-provider-hero__title">
              {title}
            </Text>
            {badges}
          </span>
          {subtitle && (
            <Text as="span" variant="body-medium" className="v2-provider-hero__subtitle">
              {subtitle}
            </Text>
          )}
        </div>
      </div>
      {description && (
        <Text as="p" variant="body-large" className="v2-provider-hero__description">
          {description}
        </Text>
      )}
      {stats}
    </header>
  );
}

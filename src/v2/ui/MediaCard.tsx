import type { ReactNode } from 'react';
import { Artwork, Card, CardActionArea, cx, Text } from '../../m3';
import { seedOf } from './entityMeta';

export interface MediaCardProps {
  href?: string;
  onClick?: () => void;
  /** Background image; without one the card shows generated artwork seeded by `seed`. */
  image?: string | null;
  seed: string;
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Small metadata row under the description. */
  meta?: ReactNode;
  /** Trailing actions over the bottom of the card (outside the card's link). */
  actions?: ReactNode;
  /** Top-leading badge, e.g. "Archived". */
  badge?: ReactNode;
  className?: string;
  height?: number;
}

/** Image-led card: media fills the card, a scrim carries the title, actions sit at the bottom. */
export function MediaCard({ href, onClick, image, seed, kicker, title, description, meta, actions, badge, className, height = 260 }: MediaCardProps) {
  const body = (
    <>
      <div className="v2-media-card__media">
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" />
        ) : (
          <Artwork seed={seedOf(seed)} animated={false} width={480} height={360} aspectRatio="auto" style={{ height: '100%' }} />
        )}
      </div>
      <div className="v2-media-card__scrim" />
      <div className="v2-media-card__content">
        {kicker && (
          <Text as="div" variant="label-small" className="v2-media-card__kicker">
            {kicker}
          </Text>
        )}
        <Text as="h3" variant="title-large" emphasized className="v2-media-card__title">
          {title}
        </Text>
        {description && (
          <Text as="p" variant="body-small" className="v2-media-card__description">
            {description}
          </Text>
        )}
        {meta && <div className="v2-media-card__meta">{meta}</div>}
      </div>
    </>
  );
  return (
    <Card variant="filled" className={cx('v2-media-card', className)} style={{ height }}>
      {href !== undefined ? <CardActionArea href={href}>{body}</CardActionArea> : <CardActionArea onClick={onClick}>{body}</CardActionArea>}
      {badge && <div className="v2-media-card__badge">{badge}</div>}
      {actions && <div className="v2-media-card__actions">{actions}</div>}
    </Card>
  );
}

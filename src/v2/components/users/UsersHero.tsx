import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Shape, Text } from '../../../m3';
import type { UserSummary } from '../../../types';
import { UserAvatar } from './UserAvatar';

export interface UsersOverview {
  total: number;
  active: number;
  disabled: number;
  admins: number;
  /** The newest accounts, newest first. */
  newest: UserSummary[];
}

/** The page's header: the numbers that matter to an admin, the actions, and the newest members. */
export function UsersHero({ overview, actions }: { overview: UsersOverview | null; actions: ReactNode }) {
  const { t } = useTranslation();
  const newest = overview?.newest.slice(0, 5) ?? [];

  return (
    <header className="v2-users-hero" data-crowd={newest.length > 0 ? '' : undefined}>
      <Shape name="clover-8" size={360} morph={false} className="v2-users-hero__backdrop" />
      <div className="v2-users-hero__main">
        <div className="v2-users-hero__heading">
          <span className="v2-users-hero__badge" aria-hidden>
            <Shape name="cookie-9" size={64} morph={false} className="v2-users-hero__badge-shape" />
            <Icon name="shield_person" size={30} filled className="v2-users-hero__badge-icon" />
          </span>
          <div className="v2-users-hero__titles">
            <Text as="span" variant="label-large" emphasized className="v2-users-hero__kicker">
              {t('v2.shell.sections.manage')}
            </Text>
            <Text as="h1" variant="headline-large" emphasized className="v2-users-hero__title">
              {t('v2.users.title')}
            </Text>
          </div>
        </div>
        <Text as="p" variant="body-large" className="v2-users-hero__description">
          {t('adminUsers.description')}
        </Text>
        {overview && (
          <ul className="v2-users-hero__stats">
            <li>
              <strong>{overview.total.toLocaleString()}</strong> {t('v2.users.statMembers', { count: overview.total })}
            </li>
            <li data-tone="success">
              <span className="v2-users-hero__dot" aria-hidden />
              <strong>{overview.active.toLocaleString()}</strong> {t('v2.users.statActive')}
            </li>
            {overview.disabled > 0 && (
              <li data-tone="error">
                <span className="v2-users-hero__dot" aria-hidden />
                <strong>{overview.disabled.toLocaleString()}</strong> {t('v2.users.statDisabled')}
              </li>
            )}
            <li>
              <Icon name="shield_person" size={16} aria-hidden />
              <strong>{overview.admins.toLocaleString()}</strong> {t('v2.users.statAdmins', { count: overview.admins })}
            </li>
          </ul>
        )}
        <div className="v2-users-hero__actions">{actions}</div>
      </div>
      {newest.length > 0 && (
        <figure className="v2-users-hero__crowd">
          <div className="v2-users-hero__faces" aria-hidden>
            {newest.map((user, index) => (
              <span key={user.id} className="v2-users-hero__face" data-index={index} title={user.email}>
                <UserAvatar user={user} size={index === 0 ? 112 : 72} />
              </span>
            ))}
          </div>
          <figcaption className="v2-users-hero__caption">
            <Text as="span" variant="label-small" className="v2-users-hero__caption-label">
              {t('v2.users.newest')}
            </Text>
            <Text as="span" variant="label-large" emphasized className="v2-users-hero__caption-email">
              {newest[0].email}
            </Text>
          </figcaption>
        </figure>
      )}
    </header>
  );
}

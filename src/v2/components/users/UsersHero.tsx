import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserSummary } from '../../../types';
import type { PageHeroStat } from '../../ui/PageHero';
import { ShowcaseHero } from '../../ui/ShowcaseHero';
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

  const stats: PageHeroStat[] = [];
  if (overview) {
    stats.push({ key: 'total', value: overview.total.toLocaleString(), label: t('v2.users.statMembers', { count: overview.total }) });
    stats.push({ key: 'active', tone: 'success', value: overview.active.toLocaleString(), label: t('v2.users.statActive') });
    if (overview.disabled > 0) stats.push({ key: 'disabled', tone: 'error', value: overview.disabled.toLocaleString(), label: t('v2.users.statDisabled') });
    stats.push({ key: 'admins', icon: 'shield_person', value: overview.admins.toLocaleString(), label: t('v2.users.statAdmins', { count: overview.admins }) });
  }

  return (
    <ShowcaseHero
      icon="shield_person"
      shape="cookie-9"
      backdrop="clover-8"
      kicker={t('v2.shell.sections.manage')}
      title={t('v2.users.title')}
      description={t('adminUsers.description')}
      stats={stats}
      actions={actions}
      fan={overview?.newest.slice(0, 3).map((user, index) => <UserAvatar key={user.id} user={user} size={index === 0 ? 96 : 72} className="v2-users-face" />)}
    />
  );
}

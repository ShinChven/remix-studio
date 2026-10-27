import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserSummary } from '../../../types';
import { PageHero, type PageHeroStat } from '../../ui/PageHero';

export interface UsersOverview {
  total: number;
  active: number;
  disabled: number;
  admins: number;
  /** The newest accounts, newest first. */
  newest: UserSummary[];
}

/** The page's header: the numbers that matter to an admin and the actions. */
export function UsersHero({ overview, actions }: { overview: UsersOverview | null; actions: ReactNode }) {
  const { t } = useTranslation();

  const stats: PageHeroStat[] = [];
  if (overview) {
    stats.push({ key: 'total', value: overview.total.toLocaleString(), label: t('v2.users.statMembers', { count: overview.total }) });
    stats.push({ key: 'active', tone: 'success', value: overview.active.toLocaleString(), label: t('v2.users.statActive') });
    if (overview.disabled > 0) stats.push({ key: 'disabled', tone: 'error', value: overview.disabled.toLocaleString(), label: t('v2.users.statDisabled') });
    stats.push({ key: 'admins', icon: 'shield_person', value: overview.admins.toLocaleString(), label: t('v2.users.statAdmins', { count: overview.admins }) });
  }

  return <PageHero icon="shield_person" shape="cookie-9" title={t('v2.users.title')} description={t('adminUsers.description')} stats={stats} actions={actions} />;
}

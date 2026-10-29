import { useTranslation } from 'react-i18next';
import { Icon, Text } from '../../../m3';
import type { UserSummary } from '../../../types';
import { formatBytes, formatDateTime } from '../../lib/format';
import type { ActionMenuItem } from '../../ui/ActionMenu';
import { EntityRow } from '../../ui/EntityList';
import { StatusPill } from '../../ui/Stat';
import { UserAvatar } from './UserAvatar';
import { relativeTime, usageRatio, usageTone } from './userMeta';

export interface UserRowProps {
  user: UserSummary;
  isSelf: boolean;
  selected: boolean;
  /** Something on the page is selected: a click then toggles the row instead of opening it. */
  selecting: boolean;
  /** `range` extends the selection from the last toggled row (shift). */
  onToggleSelect: (range: boolean) => void;
  onOpen: () => void;
  menuItems: ActionMenuItem[];
}

/** One account: who it is, its standing, how much storage it uses, its work and its last sign-in. */
export function UserRow({ user, isSelf, selected, selecting, onToggleSelect, onOpen, menuItems }: UserRowProps) {
  const { t, i18n } = useTranslation();
  const ratio = usageRatio(user.usedStorage, user.storageLimit);
  const joined = relativeTime(user.createdAt, i18n.language);
  const lastSeen = relativeTime(user.lastLoginAt, i18n.language);

  return (
    <EntityRow
      lead={() => <UserAvatar user={user} size={44} />}
      title={user.email}
      badges={
        <>
          {isSelf && <StatusPill tone="primary">{t('v2.users.you')}</StatusPill>}
          {user.role === 'admin' && (
            <StatusPill tone="tertiary" icon="shield_person">
              {t('adminUsers.admin')}
            </StatusPill>
          )}
          {user.status === 'disabled' && (
            <StatusPill tone="error" icon="block">
              {t('adminUsers.disabled')}
            </StatusPill>
          )}
          {user.twoFactorEnabled && (
            <span className="v2-user-secure" title={t('v2.users.twoFactorOn')}>
              <Icon name="verified_user" size={16} filled aria-label={t('v2.users.twoFactorOn')} />
            </span>
          )}
        </>
      }
      subtitle={
        <>
          {t('v2.users.joined', { when: joined })}
          {' · '}
          {user.createdBy ? t('v2.users.addedBy', { email: user.createdBy.email }) : t('v2.users.signedUp')}
        </>
      }
      cells={[
        {
          key: 'storage',
          width: '168px',
          title: `${Math.round(ratio * 1000) / 10}%`,
          narrow: 'below',
          children: (
            <span className="v2-user-usage" data-tone={usageTone(ratio)}>
              <Text as="span" variant="label-medium" className="v2-user-usage__text">
                <strong>{formatBytes(user.usedStorage)}</strong> / {formatBytes(user.storageLimit || 0)}
              </Text>
              <span className="v2-user-usage__meter" aria-hidden>
                <span style={{ width: `${Math.max(ratio * 100, user.usedStorage > 0 ? 2 : 0)}%` }} />
              </span>
            </span>
          ),
        },
        {
          key: 'counts',
          width: '96px',
          drop: 2,
          children: (
            <span className="v2-user-counts">
              <span title={t('adminUsers.table.projects')}>
                <Icon name="folder" size={16} aria-hidden />
                <span className="sr-only">{t('adminUsers.table.projects')}</span>
                {user.projectCount}
              </span>
              <span title={t('adminUsers.table.libraries')}>
                <Icon name="library_books" size={16} aria-hidden />
                <span className="sr-only">{t('adminUsers.table.libraries')}</span>
                {user.libraryCount}
              </span>
            </span>
          ),
        },
        {
          key: 'seen',
          width: '128px',
          drop: 4,
          title: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined,
          children: (
            <span className="v2-user-seen">
              <Text as="span" variant="label-medium" className={user.lastLoginAt ? undefined : 'text-on-surface-variant'}>
                {user.lastLoginAt ? lastSeen : t('adminUsers.neverSignedIn')}
              </Text>
              {user.lastLoginAt && (
                <Text as="span" variant="body-small" className="text-on-surface-variant">
                  {t('v2.users.lastSignIn')}
                </Text>
              )}
            </span>
          ),
        },
      ]}
      selected={selected}
      selecting={selecting}
      onToggleSelect={onToggleSelect}
      onOpen={onOpen}
      ariaLabel={user.email}
      selectLabel={t('v2.users.selectUser', { email: user.email })}
      menuLabel={t('v2.users.actionsFor', { email: user.email })}
      menuItems={menuItems}
      dimmed={user.status === 'disabled'}
    />
  );
}

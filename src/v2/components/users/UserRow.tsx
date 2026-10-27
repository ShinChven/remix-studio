import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Icon, Ripple, Text } from '../../../m3';
import type { UserSummary } from '../../../types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
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

  const activate = (event: MouseEvent | KeyboardEvent) => {
    if (selecting || event.metaKey || event.ctrlKey || event.shiftKey) onToggleSelect(event.shiftKey);
    else onOpen();
  };

  return (
    <li
      className="v2-user-row m3-focus-ring"
      data-selected={selected ? '' : undefined}
      data-status={user.status}
      role="button"
      tabIndex={0}
      aria-label={user.email}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') activate(event);
        if (event.key === ' ') {
          event.preventDefault();
          onToggleSelect(event.shiftKey);
        }
      }}
    >
      <Ripple />
      <span className="v2-user-row__lead">
        <span
          className="v2-user-row__check"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target instanceof HTMLInputElement) onToggleSelect(event.shiftKey);
          }}
        >
          <Checkbox checked={selected} aria-label={t('v2.users.selectUser', { email: user.email })} onChange={() => undefined} />
        </span>
        <UserAvatar user={user} size={44} className="v2-user-row__avatar" />
      </span>

      <span className="v2-user-row__identity">
        <span className="v2-user-row__name">
          <Text as="span" variant="title-small" emphasized className="v2-user-row__email">
            {user.email}
          </Text>
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
            <span className="v2-user-row__secure" title={t('v2.users.twoFactorOn')}>
              <Icon name="verified_user" size={16} filled aria-label={t('v2.users.twoFactorOn')} />
            </span>
          )}
        </span>
        <Text as="span" variant="body-small" className="v2-user-row__meta">
          {t('v2.users.joined', { when: joined })}
          {' · '}
          {user.createdBy ? t('v2.users.addedBy', { email: user.createdBy.email }) : t('v2.users.signedUp')}
        </Text>
      </span>

      <span className="v2-user-row__storage" data-tone={usageTone(ratio)} title={`${Math.round(ratio * 1000) / 10}%`}>
        <Text as="span" variant="label-medium" className="v2-user-row__storage-text">
          <strong>{formatBytes(user.usedStorage)}</strong> / {formatBytes(user.storageLimit || 0)}
        </Text>
        <span className="v2-user-row__meter" aria-hidden>
          <span style={{ width: `${Math.max(ratio * 100, user.usedStorage > 0 ? 2 : 0)}%` }} />
        </span>
      </span>

      <span className="v2-user-row__counts">
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

      <span className="v2-user-row__seen" title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined}>
        <Text as="span" variant="label-medium" className={user.lastLoginAt ? undefined : 'text-on-surface-variant'}>
          {user.lastLoginAt ? lastSeen : t('adminUsers.neverSignedIn')}
        </Text>
        {user.lastLoginAt && (
          <Text as="span" variant="body-small" className="text-on-surface-variant">
            {t('v2.users.lastSignIn')}
          </Text>
        )}
      </span>

      <span className="v2-user-row__menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <ActionMenu label={t('v2.users.actionsFor', { email: user.email })} items={menuItems} openOnHover />
      </span>
    </li>
  );
}

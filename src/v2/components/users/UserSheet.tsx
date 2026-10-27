import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, IconButton, Text, TextField } from '../../../m3';
import type { UserDetail } from '../../../types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { StatTile, StatusPill } from '../../ui/Stat';
import { UserAvatar } from './UserAvatar';
import { GIGABYTE, relativeTime, STORAGE_TIERS, tierOf, usageRatio, usageTone, type StorageTierKey } from './userMeta';

export interface UserSheetProps {
  user: UserDetail;
  isSelf: boolean;
  onToggleStatus: () => void;
  onToggleRole: () => void;
  onResetPassword: () => void;
  /** Resolves to whether the new limit was saved. */
  onChangeStorage: (limit: number) => Promise<boolean>;
  onCopy: (text: string) => void;
}

const BREAKDOWN = ['projects', 'libraries', 'exports', 'trash'] as const;

/** Everything about one account, and the admin's controls over it. */
export function UserSheet({ user, isSelf, onToggleStatus, onToggleRole, onResetPassword, onChangeStorage, onCopy }: UserSheetProps) {
  const { t, i18n } = useTranslation();
  const limit = user.storageLimit || 0;
  const ratio = usageRatio(user.usedStorage, limit);
  const currentTier = tierOf(limit);
  const [tier, setTier] = useState<StorageTierKey | 'custom'>(currentTier ?? 'custom');
  const [customGb, setCustomGb] = useState(() => String(Math.round((limit / GIGABYTE) * 10) / 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTier(tierOf(limit) ?? 'custom');
    setCustomGb(String(Math.round((limit / GIGABYTE) * 10) / 10));
  }, [user.id, limit]);

  const applyLimit = async (bytes: number) => {
    setSaving(true);
    const saved = await onChangeStorage(bytes);
    setSaving(false);
    if (!saved) setTier(tierOf(limit) ?? 'custom');
  };

  const customBytes = Math.round(Number(customGb) * GIGABYTE);
  const customValid = Number.isFinite(customBytes) && customBytes > 0;

  const facts: { icon: string; label: string; value: string; hint?: string; copy?: string }[] = [
    { icon: 'calendar_today', label: t('v2.users.detail.joined'), value: formatDateTime(user.createdAt), hint: relativeTime(user.createdAt, i18n.language) },
    {
      icon: 'login',
      label: t('v2.users.detail.lastSignIn'),
      value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('adminUsers.neverSignedIn'),
      hint: user.lastLoginAt ? relativeTime(user.lastLoginAt, i18n.language) : undefined,
    },
    { icon: 'person_add', label: t('adminUsers.detail.createdBy'), value: user.createdBy?.email || t('adminUsers.detail.selfRegistered') },
    { icon: 'confirmation_number', label: t('adminUsers.detail.inviteCode'), value: user.inviteCode?.code || t('adminUsers.detail.notInviteBased'), copy: user.inviteCode?.code },
    ...(user.inviteCode ? [{ icon: 'sticky_note_2', label: t('adminUsers.detail.inviteNote'), value: user.inviteCode.note || t('adminUsers.detail.noNote') }] : []),
    { icon: 'verified_user', label: t('v2.users.detail.twoFactor'), value: user.twoFactorEnabled ? t('v2.users.detail.on') : t('v2.users.detail.off') },
  ];

  return (
    <div className="v2-user-sheet" data-density="compact">
      <section className="v2-user-sheet__hero" data-status={user.status}>
        <UserAvatar user={user} size={88} className="v2-user-sheet__avatar" />
        <div className="v2-user-sheet__who">
          <Text as="h2" variant="title-large" emphasized className="v2-user-sheet__email">
            {user.email}
          </Text>
          <span className="v2-user-sheet__id">
            <code>{user.id}</code>
            <IconButton icon="content_copy" size="xs" label={t('v2.users.copyId')} tooltip onClick={() => onCopy(user.id)} />
          </span>
          <span className="v2-user-sheet__pills">
            {isSelf && <StatusPill tone="primary">{t('v2.users.you')}</StatusPill>}
            <StatusPill tone={user.role === 'admin' ? 'tertiary' : 'neutral'} icon={user.role === 'admin' ? 'shield_person' : 'person'}>
              {user.role === 'admin' ? t('adminUsers.admin') : t('adminUsers.user')}
            </StatusPill>
            <StatusPill tone={user.status === 'active' ? 'success' : 'error'} icon={user.status === 'active' ? 'check_circle' : 'block'}>
              {user.status === 'active' ? t('adminUsers.active') : t('adminUsers.disabled')}
            </StatusPill>
          </span>
        </div>
      </section>

      {isSelf ? (
        <div className="v2-user-sheet__note">
          <Icon name="info" size={20} aria-hidden />
          <Text as="p" variant="body-medium">
            {t('v2.users.detail.selfNote')}
          </Text>
          <Button variant="text" size="xs" href="/account" trailingIcon="arrow_forward">
            {t('v2.users.detail.openAccount')}
          </Button>
        </div>
      ) : (
        <div className="v2-user-sheet__actions">
          <Button variant="tonal" icon={user.status === 'active' ? 'block' : 'check_circle'} className={user.status === 'active' ? 'v2-button-danger' : undefined} onClick={onToggleStatus}>
            {user.status === 'active' ? t('v2.users.disable') : t('v2.users.enable')}
          </Button>
          <Button variant="outlined" icon={user.role === 'admin' ? 'remove_moderator' : 'add_moderator'} onClick={onToggleRole}>
            {user.role === 'admin' ? t('adminUsers.confirm.demoteTitle') : t('adminUsers.confirm.promoteTitle')}
          </Button>
          <Button variant="outlined" icon="key" onClick={onResetPassword}>
            {t('v2.users.resetPassword')}
          </Button>
        </div>
      )}

      <section className="v2-user-sheet__card">
        <div className="v2-user-sheet__card-head">
          <Icon name="hard_drive" size={20} aria-hidden />
          <Text as="h3" variant="title-medium" emphasized>
            {t('v2.users.detail.storage')}
          </Text>
        </div>
        <div className="v2-user-storage" data-tone={usageTone(ratio)}>
          <div className="v2-user-storage__figures">
            <Text as="span" variant="display-small" emphasized className="v2-user-storage__used">
              {formatBytes(user.usedStorage)}
            </Text>
            <Text as="span" variant="body-medium" className="text-on-surface-variant">
              {t('v2.users.detail.ofLimit', { limit: formatBytes(limit), percent: Math.round(ratio * 1000) / 10 })}
            </Text>
          </div>
          <div className="v2-user-storage__bar" role="img" aria-label={t('v2.users.detail.ofLimit', { limit: formatBytes(limit), percent: Math.round(ratio * 1000) / 10 })}>
            {BREAKDOWN.map((key) => {
              const bytes = user.storageBreakdown[key];
              return bytes > 0 && limit > 0 ? <span key={key} data-part={key} style={{ width: `max(4px, ${(bytes / limit) * 100}%)` }} /> : null;
            })}
          </div>
          <ul className="v2-user-storage__legend">
            {BREAKDOWN.map((key) => (
              <li key={key} data-part={key}>
                <span className="v2-user-storage__swatch" aria-hidden />
                <span className="v2-user-storage__part">{t(`adminUsers.detail.${key}`)}</span>
                <strong>{formatBytes(user.storageBreakdown[key])}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="v2-user-sheet__tier">
          <Text as="span" variant="label-large" className="text-on-surface-variant">
            {t('adminUsers.detail.limit')}
          </Text>
          <ChoiceChips<StorageTierKey | 'custom'>
            aria-label={t('adminUsers.detail.limit')}
            value={tier}
            onChange={(next) => {
              setTier(next);
              if (next === 'custom') return;
              const bytes = STORAGE_TIERS.find((option) => option.key === next)!.bytes;
              if (bytes !== limit) void applyLimit(bytes);
            }}
            options={[
              ...STORAGE_TIERS.map((option) => ({ value: option.key, label: t('v2.users.tierLabel', { tier: t(`v2.users.tiers.${option.key}`), size: formatBytes(option.bytes) }) })),
              { value: 'custom' as const, label: t('v2.users.tiers.custom') },
            ]}
          />
          {tier === 'custom' && (
            <form
              className="v2-user-sheet__custom"
              onSubmit={(event) => {
                event.preventDefault();
                if (customValid && customBytes !== limit) void applyLimit(customBytes);
              }}
            >
              <TextField variant="outlined" type="number" min={0.1} step={0.1} label={t('v2.users.detail.customLimit')} suffixText="GB" value={customGb} onValueChange={setCustomGb} error={!customValid} />
              <Button type="submit" variant="filled" loading={saving} disabled={!customValid || customBytes === limit}>
                {t('v2.users.detail.apply')}
              </Button>
            </form>
          )}
        </div>
      </section>

      <section className="v2-user-sheet__section">
        <Text as="h3" variant="title-medium" emphasized>
          {t('v2.users.detail.activity')}
        </Text>
        <div className="v2-user-sheet__stats">
          <StatTile icon="folder" label={t('adminUsers.detail.projects')} value={user.projectCount} tone="primary" />
          <StatTile icon="library_books" label={t('adminUsers.detail.libraries')} value={user.libraryCount} tone="secondary" />
          <StatTile icon="hub" label={t('adminUsers.detail.providers')} value={user.providerCount} tone="tertiary" />
          <StatTile icon="archive" label={t('adminUsers.detail.exports')} value={user.exportCount} />
        </div>
      </section>

      <section className="v2-user-sheet__section">
        <Text as="h3" variant="title-medium" emphasized>
          {t('adminUsers.detail.account')}
        </Text>
        <ul className="v2-user-facts">
          {facts.map((fact) => (
            <li key={fact.label}>
              <span className="v2-user-facts__icon" aria-hidden>
                <Icon name={fact.icon} size={20} />
              </span>
              <span className="v2-user-facts__text">
                <Text as="span" variant="label-medium" className="text-on-surface-variant">
                  {fact.label}
                </Text>
                <Text as="span" variant="body-large" className="v2-user-facts__value">
                  {fact.value}
                  {fact.hint && <span className="v2-user-facts__hint"> · {fact.hint}</span>}
                </Text>
              </span>
              {fact.copy && <IconButton icon="content_copy" size="xs" label={t('v2.users.copy')} tooltip onClick={() => onCopy(fact.copy!)} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import { refreshSocialAccountProfile } from '../../../api';
import { applyAvatarFallback, defaultAvatar } from '../../../lib/avatar';
import { cx } from '../../../m3';
import { PlatformIcon } from '../../lib/platform';

export interface SocialAccountLike {
  id?: string;
  platform?: string;
  profileName?: string | null;
  avatarUrl?: string | null;
}

/** A channel's avatar with its platform mark; a broken X avatar asks the server to refresh the profile. */
export function AccountAvatar({ account, seed, size = 40, className, refreshOn = ['twitter', 'x'] }: { account?: SocialAccountLike | null; seed?: string; size?: number; className?: string; /** Platforms whose broken avatar triggers a profile refresh. */ refreshOn?: string[] }) {
  const platform = account?.platform || '';
  const name = account?.profileName || (account as { accountId?: string } | null | undefined)?.accountId || account?.platform || 'Unknown Account';
  const avatarSeed = account?.id || seed || name;
  return (
    <span className={cx('v2-account-avatar', className)} style={{ width: size, height: size }}>
      <img
        src={account?.avatarUrl || defaultAvatar(avatarSeed, name)}
        alt={name}
        referrerPolicy="no-referrer"
        onError={(e) => {
          if (applyAvatarFallback(e.currentTarget, avatarSeed, name) && account?.id && refreshOn.includes(platform)) {
            refreshSocialAccountProfile(platform, account.id).catch(console.error);
          }
        }}
      />
      {platform && (
        <span className="v2-account-avatar__badge">
          <PlatformIcon platform={platform} size={Math.max(10, Math.round(size / 3.4))} />
        </span>
      )}
    </span>
  );
}

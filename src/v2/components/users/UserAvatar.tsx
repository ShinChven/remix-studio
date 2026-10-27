import { Avatar, cx } from '../../../m3';
import type { User } from '../../../types';
import { avatarStyle, emailName } from './userMeta';

/** An account's initial in its own shape and color; dimmed while the account is disabled. */
export function UserAvatar({ user, size = 40, className }: { user: Pick<User, 'id' | 'email' | 'status'>; size?: number; className?: string }) {
  const { shape, tone } = avatarStyle(user.id);
  return <Avatar name={emailName(user.email).slice(0, 1)} shape={shape} size={size} className={cx('v2-user-avatar', className)} data-tone={tone} data-status={user.status} aria-hidden />;
}

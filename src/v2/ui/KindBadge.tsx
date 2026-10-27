import type { CSSProperties } from 'react';
import { cx, Icon, Shape } from '../../m3';
import { kindMeta } from './entityMeta';

export interface KindBadgeProps {
  /** text, image, video, audio, comfyui or civitai. */
  kind: string | undefined;
  size?: number;
  /** `container` for quiet places, `solid` on tinted or selected surfaces. */
  tone?: 'container' | 'solid';
  /** Accessible name; without one the badge is decorative. */
  label?: string;
  className?: string;
}

/**
 * A media kind's mark, the same everywhere: its icon on its own shape, in its color. The shape turns
 * one notch, back to the same silhouette, under the pointer on the card or button that holds it.
 */
export function KindBadge({ kind, size = 40, tone = 'container', label, className }: KindBadgeProps) {
  const meta = kindMeta(kind);
  return (
    <span
      className={cx('v2-kind', className)}
      data-kind={kind ?? 'text'}
      data-tone={tone}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, '--v2-kind-turn': `${meta.turn}deg` } as CSSProperties}
    >
      <Shape name={meta.shape} size={size} morph={false} className="v2-kind__shape" />
      <Icon name={meta.icon} size={Math.max(12, Math.round(size * 0.46))} filled className="v2-kind__icon" />
    </span>
  );
}

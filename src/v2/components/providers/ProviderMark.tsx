import { cx, Shape } from '../../../m3';
import type { ProviderType } from '../../../types';
import { ProviderLogo, providerMonogram } from '../ProviderLogo';
import { activeShape, serviceMeta } from './providerMeta';

export interface ProviderMarkProps {
  type: ProviderType | string;
  size?: number;
  /** Morphs the shape, e.g. while the pointer is on the card that holds the mark. */
  active?: boolean;
  /** Greyed, for a service that is not connected yet. */
  dimmed?: boolean;
  className?: string;
}

/** A service's brand mark (or its letters) on its own shape and color, the same wherever the service appears. */
export function ProviderMark({ type, size = 48, active = false, dimmed = false, className }: ProviderMarkProps) {
  const service = serviceMeta(type);
  const monogram = providerMonogram(type);
  return (
    <span className={cx('v2-provider-mark', className)} data-tone={service.tone} data-dimmed={dimmed ? '' : undefined} style={{ width: size, height: size }} aria-hidden>
      <Shape name={active ? activeShape(service.shape) : service.shape} size={size} className="v2-provider-mark__shape" />
      {monogram ? (
        <span className="v2-provider-mark__monogram" style={{ fontSize: Math.round(size * (monogram.length > 2 ? 0.26 : 0.34)) }}>
          {monogram}
        </span>
      ) : (
        <ProviderLogo type={type} size={Math.round(size * 0.44)} className="v2-provider-mark__logo" />
      )}
    </span>
  );
}

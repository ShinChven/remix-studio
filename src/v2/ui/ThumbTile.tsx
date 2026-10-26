import type { ReactNode } from 'react';
import { cx, Icon, Text } from '../../m3';

/** A square media thumbnail with a corner badge and a two-line caption. */
export function ThumbTile({ src, icon = 'image', badge, title, meta, trailing, className }: { src?: string | null; icon?: string; badge?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode; className?: string }) {
  return (
    <div className={cx('v2-thumb', className)}>
      <div className="v2-thumb__media">
        {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name={icon} size={32} />}
        {badge && <span className="v2-thumb__badge">{badge}</span>}
      </div>
      <div className="v2-thumb__caption">
        <Text as="div" variant="label-medium" emphasized className="truncate" title={typeof title === 'string' ? title : undefined}>
          {title}
        </Text>
        {(meta || trailing) && (
          <div className="flex items-center justify-between gap-2 text-on-surface-variant">
            <Text as="span" variant="label-small" className="truncate uppercase">
              {meta}
            </Text>
            {trailing && (
              <Text as="span" variant="label-small" className="shrink-0">
                {trailing}
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

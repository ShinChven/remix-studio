import type { MouseEvent, ReactNode } from 'react';
import { Checkbox, cx, Icon, Text } from '../../m3';

export interface MediaTileProps {
  /** Image or poster; without one the tile shows `icon`. */
  src?: string | null;
  icon?: string;
  /** Icon centered over the media, e.g. a play button on videos. */
  overlayIcon?: string;
  title: ReactNode;
  /** Makes the title a button, e.g. to rename. */
  onTitleClick?: () => void;
  titleHint?: string;
  kicker?: ReactNode;
  selected?: boolean;
  /** Shows the selection checkbox; it receives the click so shift-range selection works. */
  onToggleSelect?: (e: MouseEvent) => void;
  selectLabel?: string;
  /** Click on the media; callers check modifier keys themselves. */
  onOpen?: (e: MouseEvent) => void;
  /** Small icon buttons in the bottom row. */
  actions?: ReactNode;
  /** Square by default; `auto` for a grid that sets the height. */
  aspect?: 'square' | 'portrait' | 'landscape';
  className?: string;
}

/** Selectable media tile for album and library grids: media, a scrim with the title, and quick actions. */
export function MediaTile({ src, icon = 'image', overlayIcon, title, onTitleClick, titleHint, kicker, selected, onToggleSelect, selectLabel, onOpen, actions, aspect = 'square', className }: MediaTileProps) {
  return (
    <div className={cx('v2-tile', className)} data-selected={selected ? '' : undefined} data-aspect={aspect}>
      <button type="button" className="v2-tile__media m3-focus-ring" onClick={onOpen} tabIndex={onOpen ? 0 : -1}>
        {src ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <Icon name={icon} size={40} className="v2-tile__fallback" />}
        {overlayIcon && (
          <span className="v2-tile__overlay">
            <Icon name={overlayIcon} size={36} filled />
          </span>
        )}
      </button>
      <div className="v2-tile__scrim">
        {onTitleClick ? (
          <button type="button" className="v2-tile__title v2-tile__title--button" onClick={onTitleClick} title={titleHint}>
            <Text as="span" variant="label-medium" emphasized className="truncate">
              {title}
            </Text>
            <Icon name="edit" size={14} className="v2-tile__title-icon" />
          </button>
        ) : (
          <Text as="span" variant="label-medium" emphasized className="v2-tile__title truncate">
            {title}
          </Text>
        )}
        <div className="v2-tile__bottom">
          {kicker && (
            <Text as="span" variant="label-small" className="v2-tile__kicker">
              {kicker}
            </Text>
          )}
          {actions && <div className="v2-tile__actions">{actions}</div>}
        </div>
      </div>
      {onToggleSelect && (
        <span
          className="v2-tile__check"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e);
          }}
        >
          <Checkbox checked={!!selected} onChange={() => undefined} aria-label={selectLabel} tabIndex={-1} />
        </span>
      )}
    </div>
  );
}

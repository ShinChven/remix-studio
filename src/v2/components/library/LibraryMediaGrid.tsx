import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Checkbox, Icon, IconButton, useMediaQuery } from '../../../m3';
import type { LibraryItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { TagLine } from '../../ui/ResultFilters';
import { shortDate } from '../project/JobRow';

export type MediaFit = 'cover' | 'contain';
export type TileSize = 's' | 'm' | 'l';

export interface LibraryMediaGridProps {
  type: 'image' | 'video';
  items: LibraryItem[];
  selectedIds: Set<string>;
  fit: MediaFit;
  size: TileSize;
  /** Number of the first item on this page, for the index pills. */
  firstIndex: number;
  label: (item: LibraryItem, index: number) => string;
  menuItems: (item: LibraryItem) => ActionMenuItem[];
  onOpen: (item: LibraryItem, index: number) => void;
  onToggle: (item: LibraryItem, index: number, shift: boolean) => void;
  onRename: (item: LibraryItem) => void;
  onEditTags: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onTagClick: (tag: string) => void;
}

/** Pointer rest before a video starts its silent preview. */
const PREVIEW_DELAY_MS = 350;

/** Images and videos as a grid of frames; selecting insets the picture, and videos preview silently on hover. */
export function LibraryMediaGrid({ type, items, selectedIds, fit, size, firstIndex, label, menuItems, onOpen, onToggle, onRename, onEditTags, onDelete, onTagClick }: LibraryMediaGridProps) {
  const { t } = useTranslation();
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const selecting = selectedIds.size > 0;
  const isVideo = type === 'video';

  const cancelPreview = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPreviewId(null);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const schedulePreview = (id: string) => {
    if (!isVideo || !canHover || selecting) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPreviewId(id), PREVIEW_DELAY_MS);
  };

  const open = (item: LibraryItem, index: number, e: MouseEvent) => {
    if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onToggle(item, index, e.shiftKey);
    else {
      cancelPreview();
      onOpen(item, index);
    }
  };

  return (
    <div className="v2-shots v2-lib-shots" data-kind={type} data-fit={fit} data-size={size} data-selecting={selecting ? '' : undefined}>
      {items.map((item, index) => {
        const selected = selectedIds.has(item.id);
        const name = label(item, index);
        const poster = item.thumbnailUrl || (isVideo ? '' : item.content);
        return (
          <article key={item.id} id={`library-item-${item.id}`} className="v2-shot v2-lib-shot" data-selected={selected ? '' : undefined} onPointerEnter={() => schedulePreview(item.id)} onPointerLeave={cancelPreview}>
            <div className="v2-shot__frame">
              <button type="button" className="v2-shot__open" onClick={(e) => open(item, index, e)} aria-label={isVideo ? `${t('projectViewer.album.playVideo')} · ${name}` : name}>
                {poster ? (
                  <img src={imageDisplayUrl(poster)} alt={name} referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                ) : (
                  <Icon name={isVideo ? 'movie' : 'image'} size={40} className="v2-lib-shot__fallback" />
                )}
                {previewId === item.id && <video className="v2-lib-shot__preview" src={imageDisplayUrl(item.content)} muted loop autoPlay playsInline preload="auto" aria-hidden />}
                {isVideo && (
                  <span className="v2-shot__play">
                    <Icon name="play_arrow" size={28} filled />
                  </span>
                )}
              </button>
              <span
                className="v2-shot__check"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(item, index, e.shiftKey);
                }}
              >
                <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={`${t('libraryEditor.selectItem')} · ${name}`} />
              </span>
              <div className="v2-shot__tools">
                <IconButton icon="delete" size="xs" className="v2-shot__tool" label={t('libraryEditor.deleteItem')} tooltip onClick={() => onDelete(item)} />
                <IconButton icon="sell" size="xs" className="v2-shot__tool" label={t('libraryEditor.editTags')} tooltip onClick={() => onEditTags(item)} />
                <ActionMenu label={t('v2.project.moreActions')} items={menuItems(item)} size="xs" className="v2-shot__tool" />
              </div>
              <span className="v2-shot__index">
                {item.size ? <span>{formatBytes(item.size)}</span> : null}
                <span>#{String(firstIndex + index).padStart(2, '0')}</span>
              </span>
            </div>
            <div className="v2-shot__caption">
              <button type="button" className="v2-shot__name" title={`${name}\n${t('libraryEditor.clickToRename')}`} onClick={() => onRename(item)}>
                {name}
              </button>
              {item.createdAt ? <span className="v2-shot__sub">{shortDate(item.createdAt)}</span> : null}
              <TagLine tags={item.tags} onTagClick={onTagClick} limit={3} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

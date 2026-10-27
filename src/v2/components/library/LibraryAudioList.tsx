import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Checkbox, Icon, IconButton, LinearProgress, Shape } from '../../../m3';
import type { LibraryItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { TagLine } from '../../ui/ResultFilters';
import { shortDate } from '../project/JobRow';

export interface LibraryAudioListProps {
  items: LibraryItem[];
  selectedIds: Set<string>;
  label: (item: LibraryItem, index: number) => string;
  menuItems: (item: LibraryItem) => ActionMenuItem[];
  onToggle: (item: LibraryItem, index: number, shift: boolean) => void;
  onRename: (item: LibraryItem) => void;
  onEditTags: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onTagClick: (tag: string) => void;
}

/** `m:ss`, or `h:mm:ss` past an hour. */
function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** File extension of the item's name or address, e.g. `MP3`. */
function formatOf(item: LibraryItem) {
  const source = item.title || item.content.split('?')[0];
  const match = source.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toUpperCase() : '';
}

/** Audio as a list of tracks with one shared player: the current track shows its time and a wavy, seekable progress line. */
export function LibraryAudioList({ items, selectedIds, label, menuItems, onToggle, onRename, onEditTags, onDelete, onTagClick }: LibraryAudioListProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const selecting = selectedIds.size > 0;

  // The track playing left the page (deleted, filtered out, another page).
  useEffect(() => {
    if (currentId && !items.some((item) => item.id === currentId)) {
      audioRef.current?.pause();
      setCurrentId(null);
    }
  }, [items, currentId]);

  const toggle = (item: LibraryItem) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentId === item.id) {
      if (audio.paused) void audio.play().catch(() => undefined);
      else audio.pause();
      return;
    }
    audio.src = imageDisplayUrl(item.content);
    setCurrentId(item.id);
    setTime(0);
    setDuration(0);
    void audio.play().catch(() => undefined);
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setTime(value);
  };

  return (
    <div className="v2-tracks" data-selecting={selecting ? '' : undefined}>
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />
      {items.map((item, index) => {
        const name = label(item, index);
        const selected = selectedIds.has(item.id);
        const current = currentId === item.id;
        const isPlaying = current && playing;
        const format = formatOf(item);
        return (
          <div key={item.id} id={`library-item-${item.id}`} className="v2-track" data-selected={selected ? '' : undefined} data-current={current ? '' : undefined} data-playing={isPlaying ? '' : undefined}>
            <span
              className="v2-track__check"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(item, index, e.shiftKey);
              }}
            >
              <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={`${t('libraryEditor.selectItem')} · ${name}`} />
            </span>
            <button
              type="button"
              className="v2-track__play m3-focus-ring"
              aria-label={`${isPlaying ? t('projectViewer.album.pauseAudio') : t('projectViewer.album.playAudio')} · ${name}`}
              aria-pressed={isPlaying}
              onClick={(e) => (selecting || e.metaKey || e.ctrlKey || e.shiftKey ? onToggle(item, index, e.shiftKey) : toggle(item))}
            >
              <Shape name={isPlaying ? 'cookie-9' : 'circle'} size={48} morph="fast" className="v2-track__play-shape" />
              <Icon name={isPlaying ? 'pause' : 'play_arrow'} size={24} filled className="v2-track__play-icon" />
            </button>
            <div className="v2-track__body">
              <button type="button" className="v2-track__title" title={`${name}\n${t('libraryEditor.clickToRename')}`} onClick={() => onRename(item)}>
                {name}
              </button>
              {current ? (
                <div className="v2-track__progress">
                  <span className="v2-track__time">{clock(time)}</span>
                  <span className="v2-track__seek">
                    <LinearProgress value={duration > 0 ? time : 0} max={duration || 1} shape={isPlaying ? 'wavy' : 'flat'} aria-hidden />
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step={0.1}
                      value={Math.min(time, duration || 0)}
                      disabled={!duration}
                      aria-label={t('v2.library.seek')}
                      aria-valuetext={`${clock(time)} / ${clock(duration)}`}
                      onChange={(e) => seek(Number(e.target.value))}
                    />
                  </span>
                  <span className="v2-track__time">{clock(duration)}</span>
                </div>
              ) : (
                <span className="v2-track__meta">{[format, item.size ? formatBytes(item.size) : null, shortDate(item.createdAt)].filter(Boolean).join(' · ')}</span>
              )}
            </div>
            <span className="v2-track__tags">
              <TagLine tags={item.tags} onTagClick={onTagClick} limit={3} />
            </span>
            <span className="v2-track__actions">
              <IconButton icon="sell" size="xs" label={t('libraryEditor.editTags')} tooltip onClick={() => onEditTags(item)} />
              <IconButton icon="delete" size="xs" label={t('libraryEditor.deleteItem')} tooltip onClick={() => onDelete(item)} />
              <ActionMenu label={t('v2.project.moreActions')} items={menuItems(item)} size="xs" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

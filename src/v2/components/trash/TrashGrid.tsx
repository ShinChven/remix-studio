import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { Checkbox, Icon, IconButton, LinearProgress, Shape, Text, useMediaQuery } from '../../../m3';
import type { TrashItem } from '../../../types';
import { formatBytes } from '../../lib/format';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { kindMeta } from '../../ui/entityMeta';
import { KindBadge } from '../../ui/KindBadge';
import { timeAgo, trashBytes, trashKind, trashTitle, type TrashGroup } from './trashMeta';

export type TileSize = 's' | 'm' | 'l';
/** How an item leaves the grid: lifted out when restored, dropped when deleted. */
export type Leaving = 'restore' | 'delete';

export interface TrashGridProps {
  groups: TrashGroup[];
  selectedIds: Set<string>;
  size: TileSize;
  /** Off while the runs are projects, which already name it. */
  showProject: boolean;
  leaving: Map<string, Leaving>;
  menuItems: (item: TrashItem) => ActionMenuItem[];
  onOpen: (item: TrashItem) => void;
  onToggle: (item: TrashItem, shift: boolean) => void;
  onToggleGroup: (group: TrashGroup) => void;
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
  onProjectClick: (projectId: string) => void;
}

/** Pointer rest before a video starts its silent preview. */
const PREVIEW_DELAY_MS = 350;

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The playing track's position, as a wavy line; it follows the player on its own so the grid stays still. */
function TrackProgress({ audio, label }: { audio: HTMLAudioElement | null; label: string }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!audio) return;
    const sync = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    sync();
    audio.addEventListener('timeupdate', sync);
    return () => audio.removeEventListener('timeupdate', sync);
  }, [audio]);
  return <LinearProgress className="v2-trash-shot__progress" shape="wavy" value={progress} max={1} aria-label={label} />;
}

/** The bin's items in runs (by day or project), as frames: pictures, video posters, playable audio and text. */
export function TrashGrid({ groups, selectedIds, size, showProject, leaving, menuItems, onOpen, onToggle, onToggleGroup, onRestore, onDelete, onProjectClick }: TrashGridProps) {
  const { t, i18n } = useTranslation();
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const selecting = selectedIds.size > 0;

  // Video previews start once the pointer rests.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
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
  const schedulePreview = (item: TrashItem) => {
    if (trashKind(item) !== 'video' || !canHover || selecting) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPreviewId(item.id), PREVIEW_DELAY_MS);
  };

  // One player for every track; the frame shows its progress.
  const audioRef = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<{ id: string; playing: boolean } | null>(null);
  const toggleAudio = (item: TrashItem) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (track?.id === item.id) {
      if (audio.paused) void audio.play().catch(() => undefined);
      else audio.pause();
      return;
    }
    audio.src = imageDisplayUrl(item.imageUrl);
    setTrack({ id: item.id, playing: false });
    void audio.play().catch(() => setTrack(null));
  };
  // A track that leaves the bin stops.
  const trackId = track?.id;
  const trackShown = !trackId || groups.some((group) => group.items.some((item) => item.id === trackId));
  useEffect(() => {
    if (trackShown) return;
    audioRef.current?.pause();
    setTrack(null);
  }, [trackShown]);

  // Files can be gone already (their project was deleted); those frames show the kind instead.
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const markBroken = (id: string) => setBroken((current) => (current.has(id) ? current : new Set(current).add(id)));

  const open = (item: TrashItem, e: MouseEvent) => {
    if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onToggle(item, e.shiftKey);
    else if (trashKind(item) === 'audio') toggleAudio(item);
    else {
      cancelPreview();
      onOpen(item);
    }
  };

  return (
    <div className="v2-trash-groups" data-selecting={selecting ? '' : undefined}>
      {groups.map((group) => {
        const chosen = group.items.filter((item) => selectedIds.has(item.id)).length;
        return (
          <section key={group.key} className="v2-trash-group" aria-label={group.label || undefined}>
            {group.label && (
              <header className="v2-trash-group__head">
                <span className="v2-trash-group__check">
                  <Checkbox
                    checked={chosen > 0 && chosen === group.items.length}
                    indeterminate={chosen > 0 && chosen < group.items.length}
                    onChange={() => onToggleGroup(group)}
                    aria-label={t('v2.trash.selectGroup', { label: group.label })}
                  />
                </span>
                <Text as="h3" variant="title-small" emphasized className="v2-trash-group__label" title={group.label}>
                  {group.orphaned && <Icon name="folder_off" size={18} className="v2-trash-group__orphan" />}
                  <span className="truncate">{group.label}</span>
                </Text>
                <span className="v2-trash-group__meta">
                  {t('v2.project.itemCount', { count: group.items.length })}
                  {group.bytes > 0 && ` · ${formatBytes(group.bytes)}`}
                </span>
              </header>
            )}
            <div className="v2-shots v2-lib-shots v2-trash-shots" data-size={size} data-selecting={selecting ? '' : undefined}>
              {group.items.map((item) => {
                const kind = trashKind(item);
                const meta = kindMeta(kind);
                const selected = selectedIds.has(item.id);
                const orphan = item.projectExists === false;
                const isTrack = track?.id === item.id;
                const playing = isTrack && track.playing;
                const poster = broken.has(item.id) ? '' : item.thumbnailUrl || (kind === 'image' ? item.imageUrl : '');
                const title = trashTitle(item);
                const bytes = trashBytes(item);
                const corner = formatDuration(item.duration) || item.aspectRatio;
                return (
                  <article
                    key={item.id}
                    id={`trash-item-${item.id}`}
                    className="v2-shot v2-lib-shot v2-trash-shot"
                    data-kind={kind}
                    data-selected={selected ? '' : undefined}
                    data-leaving={leaving.get(item.id)}
                    data-playing={playing ? '' : undefined}
                    onPointerEnter={() => schedulePreview(item)}
                    onPointerLeave={cancelPreview}
                  >
                    <div className="v2-shot__frame">
                      <button
                        type="button"
                        className="v2-shot__open"
                        onClick={(e) => open(item, e)}
                        aria-label={kind === 'audio' ? `${playing ? t('projectViewer.album.pauseAudio') : t('projectViewer.album.playAudio')} · ${title}` : title}
                        title={kind === 'text' ? undefined : title}
                      >
                        {kind === 'text' ? (
                          <span className="v2-trash-shot__text">
                            <Icon name="format_quote" size={24} filled className="v2-trash-shot__quote" />
                            <span className="v2-trash-shot__excerpt">{item.textContent || item.prompt}</span>
                          </span>
                        ) : kind === 'audio' ? (
                          <span className="v2-trash-shot__art">
                            <Shape name={playing ? 'cookie-9' : meta.shape} size="62%" className="v2-trash-shot__art-shape" />
                            <Icon name={playing ? 'pause' : 'play_arrow'} size={36} filled className="v2-trash-shot__art-icon" />
                          </span>
                        ) : poster ? (
                          <img src={imageDisplayUrl(poster)} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => markBroken(item.id)} />
                        ) : (
                          <span className="v2-trash-shot__missing">
                            {broken.has(item.id) ? <Icon name="broken_image" size={40} /> : <KindBadge kind={kind} size={56} />}
                          </span>
                        )}
                        {previewId === item.id && <video className="v2-lib-shot__preview" src={imageDisplayUrl(item.imageUrl)} muted loop autoPlay playsInline preload="auto" aria-hidden />}
                        {kind === 'video' && (
                          <span className="v2-shot__play">
                            <Icon name="play_arrow" size={28} filled />
                          </span>
                        )}
                      </button>
                      <span
                        className="v2-shot__check"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(item, e.shiftKey);
                        }}
                      >
                        <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={`${t('libraryEditor.selectItem')} · ${title}`} />
                      </span>
                      <div className="v2-shot__tools">
                        <IconButton icon="restore" size="xs" className="v2-shot__tool" label={orphan ? t('v2.trash.orphanShort') : t('v2.trash.restore')} tooltip disabled={orphan} onClick={() => onRestore(item)} />
                        <IconButton icon="delete_forever" size="xs" className="v2-shot__tool" label={t('v2.trash.deleteForever')} tooltip onClick={() => onDelete(item)} />
                        <ActionMenu label={t('v2.project.moreActions')} items={menuItems(item)} size="xs" className="v2-shot__tool" />
                      </div>
                      <span className="v2-shot__index">
                        <span className="v2-trash-shot__pill">
                          <Icon name={meta.icon} size={12} />
                          {bytes > 0 ? formatBytes(bytes) : t(`v2.trash.kind.${kind}`)}
                        </span>
                        {corner && <span>{corner}</span>}
                      </span>
                      {isTrack && <TrackProgress audio={audioRef.current} label={title} />}
                    </div>
                    <div className="v2-shot__caption">
                      {showProject && (
                        <button
                          type="button"
                          className="v2-shot__name v2-trash-shot__project"
                          data-orphan={orphan ? '' : undefined}
                          title={orphan ? `${item.projectName} · ${t('v2.trash.projectGone')}` : t('v2.trash.showProject', { name: item.projectName })}
                          onClick={() => onProjectClick(item.projectId)}
                        >
                          <Icon name={orphan ? 'folder_off' : 'folder'} size={16} />
                          <span className="truncate">{item.projectName}</span>
                        </button>
                      )}
                      <span className="v2-shot__sub" title={new Date(item.deletedAt).toLocaleString()}>
                        {t('v2.trash.deletedAgo', { time: timeAgo(item.deletedAt, i18n.language) })}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <audio
        ref={audioRef}
        hidden
        onPlay={() => setTrack((current) => current && { ...current, playing: true })}
        onPause={() => setTrack((current) => current && { ...current, playing: false })}
        onEnded={() => setTrack(null)}
      />
    </div>
  );
}

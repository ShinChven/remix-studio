import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, ImageOff, Music, Play, X } from 'lucide-react';
import { useToolView } from './shared/runtime';
import { Header, StateMessage, Waiting, formatNumber, mount } from './shared/ui';
import type { Translator } from './shared/i18n';
import './media-grid.css';

/** get_album_items and get_library_items both render here; see server/mcp/apps/mcp-apps.ts. */
interface AlbumResult {
  projectId: string;
  projectUrl?: string;
  projectName: string;
  items: {
    id: string;
    filename?: string | null;
    prompt?: string;
    tags?: string[];
    storageKey?: string | null;
    thumbnailKey?: string | null;
    optimizedKey?: string | null;
    format?: string | null;
    aspectRatio?: string | null;
    duration?: number;
    sizeFormatted?: string | null;
  }[];
  total: number;
  page: number;
  pages: number;
  tagCounts?: { tag: string; count: number }[];
}

interface LibraryResult {
  libraryId: string;
  libraryUrl?: string;
  libraryName: string;
  libraryType: 'text' | 'image' | 'audio' | 'video' | string;
  items: {
    id: string;
    title?: string | null;
    text?: string;
    storageKey?: string;
    tags?: string[];
    thumbnailUrl?: string | null;
  }[];
  total: number;
  page: number;
  pages: number;
}

type MediaResult = AlbumResult | LibraryResult;
type TileKind = 'image' | 'video' | 'audio' | 'text';

interface Tile {
  id: string;
  kind: TileKind;
  title: string;
  text?: string;
  thumbUrl?: string;
  fullUrl?: string;
  tags: string[];
  details: string[];
}

const VIDEO_FORMATS = new Set(['mp4', 'webm', 'mov']);
const AUDIO_FORMATS = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac']);

function isAlbum(result: MediaResult): result is AlbumResult {
  return 'projectId' in result;
}

function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function toTiles(result: MediaResult, urls: Record<string, string>): Tile[] {
  const url = (key?: string | null) => (key ? urls[key] : undefined);

  if (isAlbum(result)) {
    return result.items.map((item) => {
      const format = (item.format ?? '').toLowerCase();
      const kind: TileKind = !item.storageKey
        ? 'text'
        : VIDEO_FORMATS.has(format)
          ? 'video'
          : AUDIO_FORMATS.has(format)
            ? 'audio'
            : 'image';
      const details = [
        item.aspectRatio,
        item.duration != null ? formatDuration(item.duration) : null,
        item.format?.toUpperCase(),
        item.sizeFormatted,
      ].filter(Boolean) as string[];
      return {
        id: item.id,
        kind,
        title: item.filename || item.prompt || item.id,
        text: item.prompt,
        thumbUrl: url(item.thumbnailKey) ?? (kind === 'image' ? url(item.optimizedKey) ?? url(item.storageKey) : undefined),
        fullUrl: kind === 'image' ? url(item.optimizedKey) ?? url(item.storageKey) : url(item.storageKey),
        tags: item.tags ?? [],
        details,
      };
    });
  }

  const kind: TileKind = (['image', 'video', 'audio', 'text'] as const).includes(result.libraryType as TileKind)
    ? (result.libraryType as TileKind)
    : 'image';
  return result.items.map((item) => ({
    id: item.id,
    kind,
    title: item.title || item.id,
    text: item.text,
    thumbUrl: url(item.thumbnailUrl) ?? (kind === 'image' ? url(item.storageKey) : undefined),
    fullUrl: url(item.storageKey),
    tags: item.tags ?? [],
    details: [],
  }));
}

function KindIcon({ kind, size = 22 }: { kind: TileKind; size?: number }) {
  if (kind === 'audio') return <Music size={size} aria-hidden />;
  if (kind === 'text') return <FileText size={size} aria-hidden />;
  if (kind === 'video') return <Play size={size} aria-hidden />;
  return <ImageOff size={size} aria-hidden />;
}

function Thumb({ tile }: { tile: Tile }) {
  const [failed, setFailed] = useState(false);
  if (tile.thumbUrl && !failed) {
    return <img src={tile.thumbUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <span className="mg-placeholder">
      <KindIcon kind={tile.kind} />
    </span>
  );
}

function Viewer({
  tile,
  index,
  count,
  onStep,
  onClose,
  t,
}: {
  tile: Tile;
  index: number;
  count: number;
  onStep: (delta: number) => void;
  onClose: () => void;
  t: Translator;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onStep(-1);
      if (event.key === 'ArrowRight') onStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);

  return (
    <section className="mg-viewer" aria-label={tile.title}>
      <div className="mg-viewer-bar">
        <span className="rs-truncate mg-viewer-title">{tile.title}</span>
        <span className="mg-viewer-count">{index + 1} / {count}</span>
        <button type="button" className="rs-button rs-icon-button" onClick={() => onStep(-1)} disabled={index === 0} aria-label={t('previous')}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button type="button" className="rs-button rs-icon-button" onClick={() => onStep(1)} disabled={index === count - 1} aria-label={t('next')}>
          <ChevronRight size={18} aria-hidden />
        </button>
        <button type="button" className="rs-button rs-icon-button" onClick={onClose} aria-label={t('close')}>
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="mg-stage" data-kind={tile.kind}>
        {tile.kind === 'image' && tile.fullUrl ? <img src={tile.fullUrl} alt={tile.title} /> : null}
        {tile.kind === 'video' && tile.fullUrl ? (
          <video key={tile.id} src={tile.fullUrl} poster={tile.thumbUrl} controls playsInline />
        ) : null}
        {tile.kind === 'audio' && tile.fullUrl ? (
          <div className="mg-audio">
            <KindIcon kind="audio" size={36} />
            <audio key={tile.id} src={tile.fullUrl} controls />
          </div>
        ) : null}
        {tile.kind === 'text' || !tile.fullUrl ? <p className="mg-stage-text">{tile.text || tile.title}</p> : null}
      </div>
      {tile.kind !== 'text' && tile.text ? <p className="mg-caption rs-clamp-4">{tile.text}</p> : null}
      {tile.details.length || tile.tags.length ? (
        <div className="mg-meta">
          {tile.details.map((detail) => <span key={detail} className="rs-badge">{detail}</span>)}
          {tile.tags.map((tag) => <span key={`#${tag}`} className="rs-badge" data-tone="info">{tag}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function MediaGrid() {
  const view = useToolView<MediaResult>('media-grid');
  const { data, mediaUrls, error, pending, t, canCallTools } = view;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const tiles = useMemo(() => (data ? toTiles(data, mediaUrls) : []), [data, mediaUrls]);

  // A new page invalidates the open index.
  useEffect(() => setOpenIndex(null), [data]);

  if (!data && error) {
    return <div className="rs-view"><StateMessage tone="danger">{error}</StateMessage></div>;
  }
  if (!data) return <Waiting t={t} />;

  const album = isAlbum(data);
  const toolName = album ? 'get_album_items' : 'get_library_items';
  const baseArgs: Record<string, unknown> = {
    ...(album ? { project_id: data.projectId } : { library_id: data.libraryId }),
    ...view.toolArgs,
  };
  const activeTags = Array.isArray(baseArgs.tags) ? (baseArgs.tags as string[]) : [];
  const fetchWith = (changes: Record<string, unknown>) => {
    void view.refetch(toolName, { ...baseArgs, ...changes });
  };

  const title = album ? data.projectName : data.libraryName;
  const url = album ? data.projectUrl : data.libraryUrl;
  const open = openIndex != null ? tiles[openIndex] : undefined;
  const tagCounts = album ? (data.tagCounts ?? []) : [];

  return (
    <div className={`rs-view${pending ? ' rs-busy' : ''}`}>
      <Header
        title={title}
        subtitle={t('items', { count: formatNumber(data.total, t.locale) })}
        url={url}
        onOpen={view.openLink}
        t={t}
      />

      {canCallTools && tagCounts.length > 0 ? (
        <div className="rs-chips" role="toolbar">
          <button
            type="button"
            className="rs-chip"
            aria-pressed={activeTags.length === 0}
            onClick={() => fetchWith({ tags: undefined, page: 1 })}
          >
            {t('allTags')}
          </button>
          {tagCounts.map(({ tag, count }) => {
            const active = activeTags.length === 1 && activeTags[0] === tag;
            return (
              <button
                key={tag}
                type="button"
                className="rs-chip"
                aria-pressed={active}
                onClick={() => fetchWith({ tags: active ? undefined : [tag], tag_match: 'all', page: 1 })}
              >
                {tag}
                <span className="rs-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? <StateMessage tone="danger">{error}</StateMessage> : null}

      {open && openIndex != null ? (
        <Viewer
          tile={open}
          index={openIndex}
          count={tiles.length}
          t={t}
          onClose={() => setOpenIndex(null)}
          onStep={(delta) => setOpenIndex((index) => Math.min(tiles.length - 1, Math.max(0, (index ?? 0) + delta)))}
        />
      ) : tiles.length === 0 ? (
        <StateMessage>{t('empty')}</StateMessage>
      ) : (
        <ul className={`mg-grid${tiles.every((tile) => tile.kind === 'text') ? ' mg-grid-text' : ''}`}>
          {tiles.map((tile, index) => (
            <li key={tile.id}>
              {tile.kind === 'text' ? (
                <button type="button" className="rs-tile mg-text-card" onClick={() => setOpenIndex(index)}>
                  <span className="mg-text-title rs-truncate">{tile.title}</span>
                  <span className="mg-text-body rs-clamp-4">{tile.text}</span>
                </button>
              ) : (
                <button type="button" className="rs-tile mg-tile" onClick={() => setOpenIndex(index)} title={tile.title}>
                  <Thumb tile={tile} />
                  {tile.kind === 'video' ? (
                    <span className="mg-tile-kind"><Play size={12} aria-hidden /></span>
                  ) : null}
                  <span className="mg-tile-label rs-truncate">{tile.title}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.pages > 1 ? (
        <nav className="rs-pager">
          <button
            type="button"
            className="rs-button"
            disabled={!canCallTools || pending || data.page <= 1}
            onClick={() => fetchWith({ page: data.page - 1 })}
          >
            <ChevronLeft size={16} aria-hidden />
            <span className="rs-label-collapsible">{t('previous')}</span>
          </button>
          <span className="rs-pager-label">{t('page', { page: data.page, pages: data.pages })}</span>
          <button
            type="button"
            className="rs-button"
            disabled={!canCallTools || pending || data.page >= data.pages}
            onClick={() => fetchWith({ page: data.page + 1 })}
          >
            <span className="rs-label-collapsible">{t('next')}</span>
            <ChevronRight size={16} aria-hidden />
          </button>
        </nav>
      ) : null}
    </div>
  );
}

mount(<MediaGrid />);

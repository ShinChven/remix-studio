import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Video as VideoIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface PostMediaItem {
  id?: string;
  type?: string | null;
  sourceUrl?: string | null;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
}

function resolveStorageUrl(value?: string | null) {
  if (!value) return '';
  if (/^(https?:|blob:|data:)/i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

/** Full-resolution URL for a media item — what the lightbox should display. */
export function postMediaUrl(media: PostMediaItem) {
  return resolveStorageUrl(media.processedUrl || media.sourceUrl || media.thumbnailUrl);
}

/** Small URL for grids and table cells; falls back to the full asset. */
export function postMediaThumbUrl(media: PostMediaItem) {
  if (media.thumbnailUrl) return resolveStorageUrl(media.thumbnailUrl);
  // Videos have no still to fall back to, so leave it to the caller's placeholder.
  if (media.type === 'video') return '';
  return resolveStorageUrl(media.processedUrl || media.sourceUrl);
}

interface PostMediaLightboxProps {
  media: PostMediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Full-screen viewer for a post's media. Shows the full-resolution asset
 * (thumbnails are only a fallback), with keyboard/arrow navigation and a
 * filmstrip when the post carries more than one item.
 */
export function PostMediaLightbox({ media, index, onIndexChange, onClose }: PostMediaLightboxProps) {
  const count = media.length;
  const boundedIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (count <= 1) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onIndexChange((boundedIndex + 1) % count);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onIndexChange((boundedIndex - 1 + count) % count);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [boundedIndex, count, onClose, onIndexChange]);

  if (count === 0) return null;

  const item = media[boundedIndex];
  const url = postMediaUrl(item);
  const isVideo = item.type === 'video';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[900] flex flex-col bg-black/95 backdrop-blur-md"
      onClick={onClose}
    >
      <div className="flex items-center justify-end gap-2 p-4" onClick={(event) => event.stopPropagation()}>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            title="Open original in a new tab"
          >
            <ExternalLink className="h-5 w-5" />
            <span className="hidden sm:inline">Open original</span>
          </a>
        )}
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Close media viewer"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-4">
        {count > 1 && (
          <button
            type="button"
            className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/70 transition hover:bg-black/80 hover:text-white sm:left-6 sm:h-12 sm:w-12"
            onClick={(event) => {
              event.stopPropagation();
              onIndexChange((boundedIndex - 1 + count) % count);
            }}
            aria-label="Previous media"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
          {!url ? (
            <div className="text-sm font-medium text-white/70">Media is not available</div>
          ) : isVideo ? (
            <video
              key={url}
              src={url}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <img
              key={url}
              src={url}
              alt={`Media ${boundedIndex + 1} of ${count}`}
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          )}
        </div>

        {count > 1 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/70 transition hover:bg-black/80 hover:text-white sm:right-6 sm:h-12 sm:w-12"
            onClick={(event) => {
              event.stopPropagation();
              onIndexChange((boundedIndex + 1) % count);
            }}
            aria-label="Next media"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="flex flex-col items-center gap-3 p-4" onClick={(event) => event.stopPropagation()}>
          <div className="flex max-w-full gap-2 overflow-x-auto px-1 py-1">
            {media.map((entry, entryIndex) => {
              const thumb = postMediaThumbUrl(entry);
              return (
                <button
                  key={entry.id || `${entryIndex}`}
                  type="button"
                  onClick={() => onIndexChange(entryIndex)}
                  aria-label={`View media ${entryIndex + 1}`}
                  aria-current={entryIndex === boundedIndex}
                  className={cn(
                    'h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-neutral-900 transition',
                    entryIndex === boundedIndex ? 'border-white ring-2 ring-white/60' : 'border-white/20 opacity-60 hover:opacity-100',
                  )}
                >
                  {thumb ? (
                    <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/50">
                      {entry.type === 'video' ? <VideoIcon className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="rounded-full bg-black/50 px-4 py-1.5 text-xs font-bold tracking-widest text-white/80">
            {boundedIndex + 1} / {count}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

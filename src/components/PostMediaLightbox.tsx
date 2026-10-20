import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxMedia {
  sourceUrl?: string | null;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
}

export function mediaFullUrl(media: LightboxMedia) {
  const value = media.processedUrl || media.sourceUrl || media.thumbnailUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

interface PostMediaLightboxProps {
  media: LightboxMedia[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function PostMediaLightbox({ media, index, onIndexChange, onClose }: PostMediaLightboxProps) {
  const count = media.length;
  const showPrevious = () => onIndexChange((index - 1 + count) % count);
  const showNext = () => onIndexChange((index + 1) % count);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (count < 2) return;
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % count);
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [count, index, onClose, onIndexChange]);

  const item = media[index];
  const url = item ? mediaFullUrl(item) : '';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md" onClick={onClose}>
      <button
        type="button"
        className="absolute right-5 top-5 z-[122] flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10"
        onClick={onClose}
        aria-label="Close media viewer"
      >
        <X className="h-6 w-6" />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            className="absolute left-4 top-1/2 z-[122] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:bg-white/10 md:flex"
            onClick={(event) => {
              event.stopPropagation();
              showPrevious();
            }}
            aria-label="Previous media"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 z-[122] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:bg-white/10 md:flex"
            onClick={(event) => {
              event.stopPropagation();
              showNext();
            }}
            aria-label="Next media"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </>
      )}

      <div className="flex h-full w-full items-center justify-center">
        {!url ? (
          <div className="text-sm font-medium text-white/70">Media is not available</div>
        ) : item.type === 'video' ? (
          <video key={url} src={url} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" controls autoPlay playsInline onClick={(event) => event.stopPropagation()} />
        ) : (
          <img src={url} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
        )}
      </div>

      {count > 1 && (
        <div className="absolute bottom-6 left-1/2 z-[122] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-2 text-xs font-bold text-white/80 backdrop-blur">
          {index + 1} / {count}
        </div>
      )}
    </div>
  );
}

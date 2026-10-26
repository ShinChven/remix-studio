import { useEffect } from 'react';
import { Icon, IconButton, Portal, Text } from '../../../m3';

export interface ViewerMedia {
  sourceUrl?: string | null;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
}

/** The URL a post's media item is served from: processed first, then the source, then the thumbnail. */
export function mediaFullUrl(media: ViewerMedia) {
  const value = media.processedUrl || media.sourceUrl || media.thumbnailUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

/** The poster of a video media item, when it has one. */
export function mediaPosterUrl(media: ViewerMedia) {
  const value = media.thumbnailUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

/** Full-screen viewer for a post's images and videos, with ← → between them. */
export function PostMediaViewer({ media, index, onIndexChange, onClose }: { media: ViewerMedia[]; index: number; onIndexChange: (index: number) => void; onClose: () => void }) {
  const count = media.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (count < 2) return;
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % count);
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, index, onClose, onIndexChange]);
  const item = media[index];
  const url = item ? mediaFullUrl(item) : '';
  return (
    <Portal>
      <div className="v2-media-viewer" role="dialog" aria-modal="true" onClick={onClose}>
        <IconButton icon="close" variant="tonal" label="Close media viewer" className="v2-media-viewer__close" onClick={onClose} />
        {count > 1 && (
          <>
            <IconButton icon="chevron_left" variant="tonal" size="md" label="Previous media" className="v2-media-viewer__prev m3-mirror-rtl" onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + count) % count); }} />
            <IconButton icon="chevron_right" variant="tonal" size="md" label="Next media" className="v2-media-viewer__next m3-mirror-rtl" onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % count); }} />
          </>
        )}
        <div className="v2-media-viewer__stage">
          {!url ? (
            <Text variant="body-large" className="flex items-center gap-2">
              <Icon name="broken_image" /> Media is not available
            </Text>
          ) : item.type === 'video' ? (
            <video key={url} src={url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={url} alt="" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
        {count > 1 && (
          <Text variant="label-large" className="v2-media-viewer__count">
            {index + 1} / {count}
          </Text>
        )}
      </div>
    </Portal>
  );
}

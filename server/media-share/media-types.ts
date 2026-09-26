/**
 * Media kinds and MIME types for album items served to TVs, WebDAV clients
 * and DLNA renderers. An album item's `imageUrl` holds the S3 key of the
 * original file whatever its kind; the extension of that key decides it.
 */

export type MediaKind = 'image' | 'video' | 'audio';

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

export function extensionOf(key: string): string {
  const clean = key.split('?')[0];
  const dot = clean.lastIndexOf('.');
  const slash = clean.lastIndexOf('/');
  if (dot <= slash) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export function mimeTypeForKey(key: string): string {
  return MIME_BY_EXT[extensionOf(key)] || 'application/octet-stream';
}

/**
 * The kind of an album item's original file, or null for items that are not
 * media (text results, or keys with an extension nothing can play).
 * `.webm` is ambiguous, so the project type breaks the tie.
 */
export function mediaKindForKey(key: string | null | undefined, projectType?: string | null): MediaKind | null {
  if (!key || key.startsWith('data:')) return null;
  const ext = extensionOf(key);
  if (ext === 'webm') return projectType === 'audio' ? 'audio' : 'video';
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

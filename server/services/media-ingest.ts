import type { S3Storage } from '../storage/s3-storage';
import { generateOptimized, generateThumbnail } from '../utils/image-utils';
import { extractFirstFramePng } from '../utils/video-utils';

/**
 * One place that turns uploaded bytes into the stored file set every media
 * record points at: the original, plus a `.thumb` and `.opt` JPEG for images
 * and videos (taken from the first frame for video). The browser upload routes
 * and staged uploads from MCP clients both go through here, so a file looks the
 * same in storage whichever way it arrived.
 */

export type MediaKind = 'image' | 'video' | 'audio';

/** Per-file limits, the same ones the browser upload routes enforce. */
export const MEDIA_SIZE_LIMIT_BYTES: Record<MediaKind, number> = {
  image: 50 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
};

const MEDIA_EXTENSIONS: Record<MediaKind, Record<string, string>> = {
  image: {
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/png': 'png',
  },
  video: {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
  },
  audio: {
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  },
};

const DEFAULT_EXTENSION: Record<MediaKind, string> = { image: 'png', video: 'mp4', audio: 'mp3' };

/** Storage extension for a mime type, falling back to the kind's default. */
export function mediaExtension(kind: MediaKind, mimeType: string): string {
  return MEDIA_EXTENSIONS[kind][mimeType] ?? DEFAULT_EXTENSION[kind];
}

/** The kind a mime type belongs to, when it is one Remix Studio stores. */
export function mediaKindForMimeType(mimeType: string | undefined): MediaKind | null {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return null;
  for (const kind of Object.keys(MEDIA_EXTENSIONS) as MediaKind[]) {
    if (MEDIA_EXTENSIONS[kind][normalized]) return kind;
  }
  return null;
}

export function normalizeMimeType(mimeType: string | undefined): string | undefined {
  const normalized = mimeType?.split(';')[0].trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'audio/mp3') return 'audio/mpeg';
  if (normalized === 'audio/x-m4a') return 'audio/mp4';
  return normalized;
}

/**
 * Bytes a file is expected to occupy once its variants exist — the same rough
 * multipliers the upload routes have always reserved against the quota.
 */
export function estimateStoredBytes(kind: MediaKind, size: number): number {
  if (kind === 'image') return size * 2.5;
  if (kind === 'video') return size * 1.5;
  return size;
}

/** Bytes of the file head that detectMediaType needs to see. */
export const MEDIA_SNIFF_BYTES = 128;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EBML_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
/** ISO-BMFF brands that are still images rather than video (AVIF, HEIF). */
const STILL_IMAGE_BRANDS = new Set(['avif', 'avis', 'heic', 'heix', 'hevc', 'mif1', 'msf1']);

/**
 * Identify a file from its first bytes. A declared type is only consulted to
 * pick between members of one container family (an MP4 box holds video or
 * audio, a Matroska stream holds video or webm audio); it never makes bytes
 * that look like nothing count as media.
 */
export function detectMediaType(
  head: Buffer,
  declaredMimeType?: string,
): { kind: MediaKind; mimeType: string } | null {
  const declared = normalizeMimeType(declaredMimeType);
  const ascii = (start: number, end: number) => head.subarray(start, end).toString('latin1');

  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIGNATURE)) return { kind: 'image', mimeType: 'image/png' };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg' };
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { kind: 'image', mimeType: 'image/gif' };

  if (ascii(0, 4) === 'RIFF') {
    const format = ascii(8, 12);
    if (format === 'WEBP') return { kind: 'image', mimeType: 'image/webp' };
    if (format === 'WAVE') return { kind: 'audio', mimeType: 'audio/wav' };
    return null;
  }

  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (STILL_IMAGE_BRANDS.has(brand)) return null;
    if (brand === 'qt  ') return { kind: 'video', mimeType: 'video/quicktime' };
    if (brand.startsWith('M4A') || brand.startsWith('M4B') || declared === 'audio/mp4') {
      return { kind: 'audio', mimeType: 'audio/mp4' };
    }
    return { kind: 'video', mimeType: 'video/mp4' };
  }

  if (head.length >= 4 && head.subarray(0, 4).equals(EBML_SIGNATURE)) {
    const isWebm = ascii(0, head.length).includes('webm');
    if (isWebm && declared === 'audio/webm') return { kind: 'audio', mimeType: 'audio/webm' };
    return { kind: 'video', mimeType: isWebm ? 'video/webm' : 'video/x-matroska' };
  }

  if (ascii(0, 4) === 'OggS') return { kind: 'audio', mimeType: 'audio/ogg' };
  if (ascii(0, 3) === 'ID3') return { kind: 'audio', mimeType: 'audio/mpeg' };
  // MPEG audio frame sync. Layer bits 00 mark an ADTS (AAC) stream; anything
  // else is an MP3 frame without an ID3 tag.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    const layer = (head[1] >> 1) & 0x03;
    return { kind: 'audio', mimeType: layer === 0 ? 'audio/aac' : 'audio/mpeg' };
  }

  return null;
}

export interface IngestedMedia {
  key: string;
  thumbnailKey?: string;
  optimizedKey?: string;
  /** Bytes of the original file. */
  size: number;
  /** Bytes of the original plus every variant written alongside it. */
  storedSize: number;
}

/**
 * Save `buffer` at `key` and, for images and videos, write the `.thumb` and
 * `.opt` variants next to it. `ext` is the extension `key` ends with.
 */
export async function ingestMedia(
  storage: S3Storage,
  input: { kind: MediaKind; key: string; ext: string; mimeType: string; buffer: Buffer },
): Promise<IngestedMedia> {
  const { kind, key, ext, mimeType, buffer } = input;
  const savedKey = await storage.save(key, buffer, mimeType);
  if (kind === 'audio') {
    return { key: savedKey, size: buffer.length, storedSize: buffer.length };
  }

  // Video variants are stills of the first frame, so they are always JPEGs;
  // image variants keep the original's extension, as they always have.
  const source = kind === 'video' ? await extractFirstFramePng(buffer) : buffer;
  const variantExt = kind === 'video' ? 'jpg' : ext;
  const extPattern = new RegExp(`\\.${ext}$`);

  const thumbBuffer = await generateThumbnail(source);
  const thumbnailKey = key.replace(extPattern, `.thumb.${variantExt}`);
  await storage.save(thumbnailKey, thumbBuffer, 'image/jpeg');

  const optBuffer = await generateOptimized(source);
  const optimizedKey = key.replace(extPattern, `.opt.${variantExt}`);
  await storage.save(optimizedKey, optBuffer, 'image/jpeg');

  return {
    key: savedKey,
    thumbnailKey,
    optimizedKey,
    size: buffer.length,
    storedSize: buffer.length + thumbBuffer.length + optBuffer.length,
  };
}

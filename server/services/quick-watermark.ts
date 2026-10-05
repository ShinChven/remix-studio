import { z } from 'zod';
import type { S3Storage } from '../storage/s3-storage';
import { stripToKey } from '../utils/storage-keys';
import { applyPostWatermark, normalizePostWatermarkPayload, postWatermarkSettingSchema } from '../utils/watermark';

/**
 * Quick watermark: stamp a single stored image and hand the result straight
 * back to the browser. The output is rendered in memory and never written to
 * storage, so it costs no quota and leaves nothing behind — fetching it again
 * means rendering it again.
 */

/** One stored image, resolved from an album item or a library item. */
export type QuickWatermarkSource = {
  /** Name of the project or library the image belongs to. */
  containerName: string;
  /** Display name of the image; the download name is derived from it. */
  filename: string;
  rawKey?: string;
  optimizedKey?: string;
  size?: number;
  optimizedSize?: number;
};

export class QuickWatermarkError extends Error {
  constructor(message: string, readonly status: 400 | 404) {
    super(message);
  }
}

const quickWatermarkRequestSchema = z.object({
  version: z.enum(['raw', 'optimized']).optional(),
  watermarkSettings: postWatermarkSettingSchema,
});

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|avif|heic|heif|tiff?|bmp)$/i;

/** The storage key behind a stored value, or undefined for anything outside the bucket. */
export function toStorageKey(value: string | undefined, storage: S3Storage): string | undefined {
  const key = stripToKey(value, storage.getBucketName());
  if (!key || key.startsWith('http') || key.startsWith('data:')) return undefined;
  return key;
}

/** Download name for a watermarked copy. The output is always a JPEG. */
export function getQuickWatermarkDownloadName(filename: string): string {
  const base = filename
    .trim()
    .replace(IMAGE_EXTENSION, '')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_')
    .trim();
  return `${base || 'image'}_watermark.jpg`;
}

/**
 * What the watermark page needs to show the image before it is rendered. Both
 * versions are signed so the page can preview the one it will render: an
 * optimized copy can differ from the raw file in more than size (it carries
 * no EXIF orientation, for one).
 */
export async function describeQuickWatermarkSource(source: QuickWatermarkSource, storage: S3Storage) {
  return {
    containerName: source.containerName,
    filename: source.filename,
    downloadName: getQuickWatermarkDownloadName(source.filename),
    rawUrl: source.rawKey ? await storage.getPresignedUrl(source.rawKey) : undefined,
    optimizedUrl: source.optimizedKey ? await storage.getPresignedUrl(source.optimizedKey) : undefined,
    size: source.size,
    optimizedSize: source.optimizedSize,
  };
}

/**
 * Render the watermarked JPEG for a request body of
 * `{ watermarkSettings, version? }` and return it as a one-off download.
 */
export async function renderQuickWatermark(
  source: QuickWatermarkSource,
  body: unknown,
  storage: S3Storage,
): Promise<Response> {
  const parsed = quickWatermarkRequestSchema.safeParse(body);
  if (!parsed.success) throw new QuickWatermarkError('Invalid watermark settings', 400);

  const settings = normalizePostWatermarkPayload({ ...parsed.data.watermarkSettings, enabled: true });
  if (!settings.text.trim()) throw new QuickWatermarkError('Watermark text is required', 400);

  const key = parsed.data.version === 'optimized'
    ? source.optimizedKey || source.rawKey
    : source.rawKey || source.optimizedKey;
  if (!key) throw new QuickWatermarkError('This image has no stored file to watermark', 404);

  let sourceBuffer: Buffer;
  try {
    sourceBuffer = await storage.read(key);
  } catch (error: any) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      throw new QuickWatermarkError('Image file not found in storage', 404);
    }
    throw error;
  }

  const output = await applyPostWatermark(sourceBuffer, settings);
  const downloadName = getQuickWatermarkDownloadName(source.filename);
  const asciiName = downloadName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(new Uint8Array(output), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(output.length),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      'Cache-Control': 'no-store',
    },
  });
}

import sharp from 'sharp';

const THUMBNAIL_MAX_DIMENSION = 768;
const OPTIMIZED_MAX_DIMENSION = 2048;

/**
 * Generate a thumbnail for list/grid views.
 * 768px keeps album cards sharper on high-density displays without
 * jumping all the way to the optimized asset size.
 */
export async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Generate an optimized image: max 2048px (2K), 90% JPEG quality.
 */
export async function generateOptimized(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(OPTIMIZED_MAX_DIMENSION, OPTIMIZED_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

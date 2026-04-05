import sharp from 'sharp';

/**
 * Generate a thumbnail: max 400px, 80% JPEG quality.
 */
export async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Generate an optimized image: max 2048px (2K), 90% JPEG quality.
 */
export async function generateOptimized(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

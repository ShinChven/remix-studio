/**
 * Reuse of reference images a provider already holds. Generators that must
 * upload an image before referencing it pass the bytes and their own upload
 * call; the cache answers with a URL the provider still serves, uploading only
 * when it has none.
 */
export interface UploadCache {
  reuse(endpoint: string, bytes: Buffer, upload: () => Promise<string>): Promise<string>;
}

/** Upload through the cache when the request carries one, directly otherwise. */
export function cachedUpload(
  cache: UploadCache | undefined,
  endpoint: string,
  bytes: Buffer,
  upload: () => Promise<string>,
): Promise<string> {
  return cache ? cache.reuse(endpoint, bytes, upload) : upload();
}

/** Raw bytes of a base64 image, with or without a data URI prefix. */
export function base64ImageBytes(base64: string): Buffer {
  return Buffer.from(base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''), 'base64');
}

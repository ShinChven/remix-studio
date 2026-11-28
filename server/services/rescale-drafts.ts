import crypto from 'crypto';
import sharp from 'sharp';
import type { Readable } from 'node:stream';
import {
  RESCALE_SOURCE,
  carryRatio,
  matchRatio,
  normalizeImageFormat,
  type RescaleImageFormat,
} from '../../src/lib/rescale-size';
import { resolveSupportedOption } from '../../src/types';
import { normalizeAlbumTags } from '../db/project-repository';
import type { AlbumItem, Job, ModelConfig, Project, WorkflowItem } from '../../src/types';
import { buildJobFilename } from './draft-jobs';

/** The tag rescaled results start with, on top of their source's tags. */
export const RESCALED_TAG = 'rescaled';

/** Image headers sit at the front of the file; this much is enough for PNG, WebP and nearly every JPEG. */
const HEADER_BYTES = 256 * 1024;

export interface ImageInfo {
  width: number;
  height: number;
  format?: RescaleImageFormat;
}

interface ImageSource {
  read(key: string): Promise<Buffer>;
  readStream(key: string): Promise<Readable>;
}

async function readHead(storage: ImageSource, key: string): Promise<Buffer> {
  const stream = await storage.readStream(key);
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      length += buffer.length;
      if (length >= HEADER_BYTES) break;
    }
  } finally {
    stream.destroy?.();
  }
  return Buffer.concat(chunks);
}

async function infoFrom(buffer: Buffer): Promise<ImageInfo | undefined> {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) return undefined;
  // EXIF orientations 5–8 turn the picture a quarter turn.
  const turned = (meta.orientation ?? 1) >= 5;
  return {
    width: turned ? meta.height : meta.width,
    height: turned ? meta.width : meta.height,
    format: normalizeImageFormat(meta.format),
  };
}

/** Pixel size and format of a stored image, read from its header (the whole file only when the header falls short). */
export async function readImageInfo(storage: ImageSource, key: string): Promise<ImageInfo | undefined> {
  try {
    const info = await infoFrom(await readHead(storage, key));
    if (info) return info;
  } catch {
    // A header cut short; read the whole file below.
  }
  try {
    return await infoFrom(await storage.read(key));
  } catch {
    return undefined;
  }
}

export interface RescaleRequest {
  prompt: string;
  providerId: string;
  model: ModelConfig;
  /** A ratio the model offers, or `source` to match each image. */
  aspectRatio: string;
  quality?: string;
  /** An image format, or `source` to keep each image's own. */
  format: string;
  background?: string;
}

/** The ratio a source image gets: its own shape matched per image, or the one chosen for all. */
export function resolveRescaleRatio(request: Pick<RescaleRequest, 'aspectRatio' | 'model'>, info: ImageInfo | undefined, item: Pick<AlbumItem, 'aspectRatio'>): string | undefined {
  const options = request.model.options.aspectRatios;
  if (request.aspectRatio !== RESCALE_SOURCE) return carryRatio(request.aspectRatio, options) ?? request.aspectRatio;
  if (info) return matchRatio(info.width / info.height, options, (info.width * info.height) / 1e6);
  // No readable header: fall back on the ratio the image was generated at.
  return item.aspectRatio ? carryRatio(item.aspectRatio, options) : matchRatio(undefined, options);
}

function filenameStem(item: AlbumItem): string {
  const name = decodeURIComponent((item.imageUrl || '').split('?')[0].split('/').pop() || '');
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/_rescale_[A-Za-z0-9_-]{8}$/, '');
}

/**
 * One draft per source image: image-to-image on the chosen model, with the
 * source as its input. Each draft keeps a two-step workflow snapshot (prompt,
 * image) so "reuse workflow" on its result brings the recipe back.
 */
export function buildRescaleJobs(
  project: Pick<Project, 'background'>,
  items: AlbumItem[],
  infos: Map<string, ImageInfo | undefined>,
  request: RescaleRequest,
): Job[] {
  const now = Date.now();
  const { model } = request;
  const quality = resolveSupportedOption(request.quality, model.options.qualities) || request.quality || 'standard';
  const background = resolveSupportedOption(request.background ?? project.background, model.options.backgrounds);
  return items.map((item, index) => {
    const info = infos.get(item.id);
    const format: RescaleImageFormat = request.format === RESCALE_SOURCE
      ? info?.format ?? normalizeImageFormat(item.format) ?? 'png'
      : normalizeImageFormat(request.format) ?? 'png';
    const workflowSnapshot: WorkflowItem[] = [
      { id: crypto.randomUUID(), type: 'text', value: request.prompt, order: 0 },
      { id: crypto.randomUUID(), type: 'image', value: item.imageUrl, order: 1 },
    ];
    return {
      id: crypto.randomUUID(),
      prompt: request.prompt,
      imageContexts: [item.imageUrl],
      status: 'draft',
      providerId: request.providerId,
      modelConfigId: model.id,
      aspectRatio: resolveRescaleRatio(request, info, item),
      quality,
      background,
      format,
      filename: buildJobFilename([filenameStem(item), 'rescale'], crypto.randomUUID().slice(0, 8)),
      tags: normalizeAlbumTags([...(item.tags || []), RESCALED_TAG]),
      sourceItems: item.sourceItems,
      workflowSnapshot,
      createdAt: now + index,
    };
  });
}

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import type { S3Storage } from '../storage/s3-storage';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import { generateOptimized, generateThumbnail } from '../utils/image-utils';
import { extractFirstFramePng } from '../utils/video-utils';
import { checkStorageLimit } from '../utils/storage-check';
import { applyPostWatermark, serializePostWatermarkSetting, type PostWatermarkConfig } from '../utils/watermark';

/**
 * Turning an existing stored file into a campaign draft post: the post gets its
 * own watermarked copy of the media under campaigns/{id}/posts/. Used by the
 * campaign import routes and by MCP tools that post staged uploads.
 */

const POST_IMAGE_RAW_MAX_DIMENSION = 4096;
const POST_IMAGE_RAW_QUALITY = 90;

export type ImportSource =
  | { kind: 'library'; libraryId: string; itemId: string }
  | { kind: 'album'; projectId: string; itemId: string };

/** A stored file to copy into a post, wherever it came from. */
export type ImportMediaInput = {
  mediaType: 'image' | 'video';
  rawValue?: string | null;
  thumbnailValue?: string | null;
  optimizedValue?: string | null;
  rawSize?: number | null;
};

export type ResolvedImportMedia = ImportMediaInput & { source: ImportSource };

export function stripToStorageKey(value: string | null | undefined, bucket: string): string | undefined {
  if (!value || value.startsWith('data:')) return value || undefined;
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    const pathStylePrefix = `/${bucket}/`;
    if (url.pathname.startsWith(pathStylePrefix)) {
      return decodeURIComponent(url.pathname.slice(pathStylePrefix.length));
    }
    if (url.hostname.startsWith(`${bucket}.`)) {
      return decodeURIComponent(url.pathname.slice(1));
    }
  } catch {
    return value;
  }

  return value;
}

function storageKeyExt(key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  const ext = path.extname(key.split('?')[0]).replace('.', '').toLowerCase();
  return ext || fallback;
}

function videoMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'mp4':
    default:
      return 'video/mp4';
  }
}

export function bufferFromDataUrl(value: string, expectedPrefix: 'image' | 'video'): Buffer | null {
  const match = value.match(new RegExp(`^data:${expectedPrefix}/[\\w+.-]+;base64,(.+)$`));
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

async function readMediaBuffer(storage: S3Storage, value: string | undefined, bucket: string, expectedPrefix: 'image' | 'video'): Promise<Buffer> {
  if (!value) throw new Error('Media source is missing');
  if (value.startsWith('data:')) {
    const buffer = bufferFromDataUrl(value, expectedPrefix);
    if (!buffer) throw new Error('Unsupported data URL media source');
    return buffer;
  }

  const key = stripToStorageKey(value, bucket);
  if (!key || /^https?:\/\//i.test(key)) {
    throw new Error('External media URLs cannot be imported');
  }
  return storage.read(key);
}

export async function processPostRawImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(POST_IMAGE_RAW_MAX_DIMENSION, POST_IMAGE_RAW_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: POST_IMAGE_RAW_QUALITY })
    .toBuffer();
}

async function copyIfStorageKey(
  storage: S3Storage,
  sourceValue: string | null | undefined,
  destinationKey: string,
  bucket: string,
): Promise<boolean> {
  const sourceKey = stripToStorageKey(sourceValue, bucket);
  if (!sourceKey || sourceKey.startsWith('data:') || /^https?:\/\//i.test(sourceKey)) return false;
  await storage.copy(sourceKey, destinationKey);
  return true;
}

async function getStorageValueSize(storage: S3Storage, value: string | null | undefined, bucket: string): Promise<number> {
  if (!value) return 0;
  if (value.startsWith('data:')) {
    const comma = value.indexOf(',');
    return comma >= 0 ? Buffer.byteLength(value.slice(comma + 1), 'base64') : 0;
  }
  const key = stripToStorageKey(value, bucket);
  if (!key || /^https?:\/\//i.test(key)) return 0;
  return (await storage.getSize(key)) || 0;
}

export class StorageLimitError extends Error {
  constructor(remainingMB: number, requiredMB: number) {
    super(`Storage limit exceeded. Remaining: ${remainingMB.toFixed(1)}MB. Required: ~${requiredMB.toFixed(1)}MB.`);
    this.name = 'StorageLimitError';
  }
}

export interface CampaignMediaDependencies {
  prisma: PrismaClient;
  storage: S3Storage;
  exportStorage: S3Storage;
  repository: IRepository;
  userRepository: UserRepository;
}

export function createCampaignMediaService(deps: CampaignMediaDependencies) {
  const { prisma, storage, exportStorage, repository, userRepository } = deps;

  const findPostWatermarkSetting = async (userId: string): Promise<PostWatermarkConfig | null> => {
    const setting = await prisma.postWatermarkSetting.findUnique({ where: { userId } });
    if (!setting) return null;
    return serializePostWatermarkSetting(setting);
  };

  const assertStorageAllowed = async (userId: string, storedSize: number) => {
    const { allowed, currentUsage, limit } = await checkStorageLimit(
      userId,
      storedSize,
      userRepository,
      storage,
      exportStorage,
      repository,
    );
    if (!allowed) {
      throw new StorageLimitError((limit - currentUsage) / (1024 * 1024), storedSize / (1024 * 1024));
    }
  };

  // Creates a single draft post + media from a resolved library/album source.
  // Shared by the synchronous import endpoint and the async batch worker.
  const createImportMediaPost = async (
    userId: string,
    campaignId: string,
    safeCampaignId: string,
    item: ImportMediaInput,
    watermarkSetting: PostWatermarkConfig | null,
    content?: string,
  ): Promise<{ postId: string; mediaId: string }> => {
    const bucket = storage.getBucketName();
    const postId = randomUUID();
    const mediaId = randomUUID();
    const baseKey = `campaigns/${safeCampaignId}/posts/${postId}/media/${mediaId}`;
    let rawKey: string;
    let optimizedKey: string;
    let thumbKey: string;
    let mimeType: string;
    let storedSize = 0;

    if (item.mediaType === 'image') {
      const sourceBuffer = await readMediaBuffer(storage, item.rawValue || undefined, bucket, 'image');
      const rawBuffer = await applyPostWatermark(await processPostRawImage(sourceBuffer), watermarkSetting);
      const optBuffer = await generateOptimized(rawBuffer);
      const thumbBuffer = await generateThumbnail(rawBuffer);

      storedSize = rawBuffer.length + optBuffer.length + thumbBuffer.length;
      await assertStorageAllowed(userId, storedSize);

      rawKey = `${baseKey}.raw.jpg`;
      optimizedKey = `${baseKey}.opt.jpg`;
      thumbKey = `${baseKey}.thumb.jpg`;
      mimeType = 'image/jpeg';

      await Promise.all([
        storage.save(rawKey, rawBuffer, 'image/jpeg'),
        storage.save(optimizedKey, optBuffer, 'image/jpeg'),
        storage.save(thumbKey, thumbBuffer, 'image/jpeg'),
      ]);
    } else {
      const sourceRawKey = stripToStorageKey(item.rawValue, bucket);
      if (!sourceRawKey || sourceRawKey.startsWith('data:') || /^https?:\/\//i.test(sourceRawKey)) {
        throw new Error('Video import requires an internal storage object');
      }

      const ext = storageKeyExt(sourceRawKey, 'mp4');
      mimeType = videoMimeFromExt(ext);
      rawKey = `${baseKey}.raw.${ext}`;
      optimizedKey = `${baseKey}.opt.jpg`;
      thumbKey = `${baseKey}.thumb.jpg`;

      const rawSize = item.rawSize || (await storage.getSize(sourceRawKey)) || 0;
      let optSize = await getStorageValueSize(storage, item.optimizedValue, bucket);
      let thumbSize = await getStorageValueSize(storage, item.thumbnailValue, bucket);

      let generatedOpt: Buffer | null = null;
      let generatedThumb: Buffer | null = null;
      const hasCopiedOpt = optSize > 0;
      const hasCopiedThumb = thumbSize > 0;

      if (!hasCopiedOpt || !hasCopiedThumb) {
        const rawBuffer = await storage.read(sourceRawKey);
        const posterPng = await extractFirstFramePng(rawBuffer);
        if (!hasCopiedOpt) {
          generatedOpt = await generateOptimized(posterPng);
          optSize = generatedOpt.length;
        }
        if (!hasCopiedThumb) {
          generatedThumb = await generateThumbnail(posterPng);
          thumbSize = generatedThumb.length;
        }
      }

      storedSize = rawSize + optSize + thumbSize;
      await assertStorageAllowed(userId, storedSize);

      await storage.copy(sourceRawKey, rawKey);

      if (!(await copyIfStorageKey(storage, item.optimizedValue, optimizedKey, bucket)) && generatedOpt) {
        await storage.save(optimizedKey, generatedOpt, 'image/jpeg');
      }

      if (!(await copyIfStorageKey(storage, item.thumbnailValue, thumbKey, bucket)) && generatedThumb) {
        await storage.save(thumbKey, generatedThumb, 'image/jpeg');
      }
    }

    await prisma.$transaction([
      prisma.post.create({
        data: {
          id: postId,
          userId,
          campaignId,
          textContent: content?.trim() || '',
          status: 'draft',
        },
      }),
      prisma.postMedia.create({
        data: {
          id: mediaId,
          postId,
          sourceUrl: rawKey,
          processedUrl: item.mediaType === 'video' ? rawKey : optimizedKey,
          thumbnailUrl: thumbKey,
          type: item.mediaType,
          status: 'ready',
          quality: 'high',
          mimeType,
          size: storedSize,
          position: 0,
        },
      }),
    ]);

    return { postId, mediaId };
  };

  return { findPostWatermarkSetting, assertStorageAllowed, createImportMediaPost };
}

export type CampaignMediaService = ReturnType<typeof createCampaignMediaService>;

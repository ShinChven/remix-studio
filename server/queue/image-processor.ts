import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { ProjectRepository } from '../db/project-repository';
import { Job, AlbumItem } from '../../src/types';
import { generateThumbnail, generateOptimized } from '../utils/image-utils';
import { getUserStorageUsage } from '../utils/storage-check';
import { formatError } from '../utils/error-handler';
import type { ProjectEventPublisher } from '../live/project-live-hub';
import sharp from 'sharp';

export interface ProcessCompletedImageParams {
  userId: string;
  projectId: string;
  job: Job;
  imageBytes: Buffer;
  format?: string;
  quality?: string;
  aspectRatio?: string;
  modelConfigId?: string;
  providerId?: string;
  // Further images from the same job (e.g. decomposed layers), each saved as
  // its own album item next to the main one.
  additionalImages?: Buffer[];
}

interface StoredImage {
  s3Url: string;
  imageUrl: string;
  thumbnailUrl: string;
  optimizedUrl: string;
  format: string;
  size: number;
  thumbnailSize: number;
  optimizedSize: number;
}

export class ImageProcessor {
  constructor(
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private userRepository: UserRepository,
    private exportStorage: S3Storage,
    private projectEvents?: ProjectEventPublisher
  ) {}

  async processCompletedImage(params: ProcessCompletedImageParams) {
    const { userId, projectId, job, imageBytes, additionalImages = [], format, quality, aspectRatio, modelConfigId, providerId } = params;
    
    try {
      // 1. Save to storage
      const targetFormat = format || job.format || 'png';
      const idPart = job.filename || job.id;
      const filename = `${userId}/${projectId}/${idPart}`;
      const primary = await this.storeImage(imageBytes, targetFormat, filename, job.prompt);
      // Extra outputs are layers cut out on transparency, so they stay PNG
      // whatever format the job asked for.
      const extras: StoredImage[] = [];
      for (let i = 0; i < additionalImages.length; i++) {
        extras.push(await this.storeImage(additionalImages[i], 'png', `${filename}.layer-${i + 1}`, job.prompt));
      }
      const stored = [primary, ...extras];

      // 2. Runtime quota check
      const totalNewSize = stored.reduce((sum, image) => sum + image.size + image.thumbnailSize + image.optimizedSize, 0);
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.storage, this.exportStorage, this.projectRepo as any);
      
      if (currentUsage + totalNewSize > limit) {
        // Clean up already-uploaded S3 files before failing
        for (const image of stored) {
          try { await this.storage.delete(image.s3Url); } catch (_) {}
          try { await this.storage.delete(image.thumbnailUrl); } catch (_) {}
          try { await this.storage.delete(image.optimizedUrl); } catch (_) {}
        }
        throw new Error(`Storage quota exceeded (${((currentUsage + totalNewSize - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Generated image was discarded.`);
      }

      // 3. Create album items. Layer ids derive from the job id so a retried
      // job overwrites its layers instead of adding a second set, and their
      // timestamps follow the base so the set stays together in either sort.
      const createdAt = Date.now();
      const albumItems: AlbumItem[] = stored.map((image, i) => ({
        id: i === 0 ? job.id : `${job.id}-layer-${i}`,
        jobId: job.id,
        prompt: job.prompt,
        imageUrl: image.imageUrl,
        thumbnailUrl: image.thumbnailUrl,
        optimizedUrl: image.optimizedUrl,
        providerId: providerId || job.providerId,
        modelConfigId: modelConfigId || job.modelConfigId,
        aspectRatio: aspectRatio || job.aspectRatio,
        quality: quality || job.quality,
        format: image.format as any,
        size: image.size,
        optimizedSize: image.optimizedSize,
        thumbnailSize: image.thumbnailSize,
        createdAt: createdAt + i,
      }));
      for (const albumItem of albumItems) {
        await this.projectRepo.addAlbumItem(userId, projectId, albumItem);
      }
      const albumItem = albumItems[0];

      // 4. Mark job as completed in DB
      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: primary.imageUrl,
        thumbnailUrl: primary.thumbnailUrl,
        optimizedUrl: primary.optimizedUrl,
        size: primary.size,
        optimizedSize: primary.optimizedSize,
        thumbnailSize: primary.thumbnailSize,
        error: undefined,
        taskId: null as any
      });
      this.projectEvents?.notifyProjectChanged({
        userId,
        projectId,
        jobId: job.id,
        itemId: albumItem.id,
        reason: 'job.completed',
      });

    } catch (e: any) {
      console.error(`[ImageProcessor] Job ${job.id} failed during image processing:`, e.message);
      await this.handleLocalFailure(userId, projectId, job, e);
    }
  }

  /** Encode one image, then save it with its thumbnail and optimized copy. */
  private async storeImage(imageBytes: Buffer, targetFormat: string, keyBase: string, prompt?: string): Promise<StoredImage> {
    let finalBytes: Buffer;
    let mimeType: string;
    let ext: string;

    // Create sharp instance and add metadata. sharp rejects an empty
    // UserComment, and a ComfyUI job with nothing typed has no prompt.
    let sharpInstance = sharp(imageBytes).withMetadata(prompt ? {
      exif: {
        IFD0: {
          UserComment: prompt
        }
      }
    } : {});

    if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
      finalBytes = await sharpInstance.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
      mimeType = 'image/jpeg';
      ext = 'jpg';
    } else if (targetFormat === 'webp') {
      finalBytes = await sharpInstance.webp({ quality: 100, lossless: true }).toBuffer();
      mimeType = 'image/webp';
      ext = 'webp';
    } else {
      finalBytes = await sharpInstance.png().toBuffer();
      mimeType = 'image/png';
      ext = 'png';
    }

    const imageUrl = `${keyBase}.${ext}`;
    const s3Url = await this.storage.save(imageUrl, finalBytes, mimeType);

    // Generate and save thumbnail/optimized versions
    const thumbBuffer = await generateThumbnail(finalBytes);
    const thumbnailUrl = `${keyBase}.thumb.jpg`;
    await this.storage.save(thumbnailUrl, thumbBuffer, 'image/jpeg');

    const optBuffer = await generateOptimized(finalBytes);
    const optimizedUrl = `${keyBase}.opt.jpg`;
    await this.storage.save(optimizedUrl, optBuffer, 'image/jpeg');

    return {
      s3Url,
      imageUrl,
      thumbnailUrl,
      optimizedUrl,
      format: targetFormat,
      size: finalBytes.length,
      thumbnailSize: thumbBuffer.length,
      optimizedSize: optBuffer.length,
    };
  }

  private async handleLocalFailure(userId: string, projectId: string, job: Job, error: any) {
    await this.projectRepo.updateJob(userId, projectId, job.id, {
      status: 'failed',
      error: formatError(error, 'Image processing error')
      // CRITICAL: We deliberately DO NOT clear taskId here.
      // If it was a detached task that succeeded remotely but failed locally (e.g. disk full),
      // keeping the taskId allows the user to 'Retry' and skip remote generation.
    });
    this.projectEvents?.notifyProjectChanged({
      userId,
      projectId,
      jobId: job.id,
      reason: 'job.failed',
    });
  }
}

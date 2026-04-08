import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { ProjectRepository } from '../db/project-repository';
import { Job, AlbumItem } from '../../src/types';
import { generateThumbnail, generateOptimized } from '../utils/image-utils';
import { getUserStorageUsage } from '../utils/storage-check';
import { formatError } from '../utils/error-handler';
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
}

export class ImageProcessor {
  constructor(
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private userRepository: UserRepository,
    private exportStorage: S3Storage
  ) {}

  async processCompletedImage(params: ProcessCompletedImageParams) {
    const { userId, projectId, job, imageBytes, format, quality, aspectRatio, modelConfigId, providerId } = params;
    
    try {
      // 1. Save to storage
      const targetFormat = format || job.format || 'png';
      let finalBytes: Buffer;
      let mimeType: string;
      let ext: string;

      // Create sharp instance and add metadata
      let sharpInstance = sharp(imageBytes).withMetadata({
        exif: {
          IFD0: {
            UserComment: job.prompt
          }
        }
      });

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

      const idPart = job.filename || job.id;
      const filename = `${userId}/${projectId}/${idPart}`;
      const s3Url = await this.storage.save(`${filename}.${ext}`, finalBytes, mimeType);

      // Generate and save thumbnail/optimized versions
      const thumbBuffer = await generateThumbnail(finalBytes);
      const thumbKey = `${filename}.thumb.jpg`;
      await this.storage.save(thumbKey, thumbBuffer, 'image/jpeg');

      const optBuffer = await generateOptimized(finalBytes);
      const optKey = `${filename}.opt.jpg`;
      await this.storage.save(optKey, optBuffer, 'image/jpeg');

      // 2. Runtime quota check
      const totalNewSize = finalBytes.length + thumbBuffer.length + optBuffer.length;
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.storage, this.exportStorage, this.projectRepo as any);
      
      if (currentUsage + totalNewSize > limit) {
        // Clean up already-uploaded S3 files before failing
        try { await this.storage.delete(s3Url); } catch (_) {}
        try { await this.storage.delete(thumbKey); } catch (_) {}
        try { await this.storage.delete(optKey); } catch (_) {}
        throw new Error(`Storage quota exceeded (${((currentUsage + totalNewSize - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Generated image was discarded.`);
      }

      // 3. Create album item
      const albumItem: AlbumItem = {
        id: job.id,
        jobId: job.id,
        prompt: job.prompt,
        imageUrl: `${filename}.${ext}`,
        thumbnailUrl: thumbKey,
        optimizedUrl: optKey,
        providerId: providerId || job.providerId,
        modelConfigId: modelConfigId || job.modelConfigId,
        aspectRatio: aspectRatio || job.aspectRatio,
        quality: quality || job.quality,
        format: targetFormat as any,
        size: finalBytes.length,
        optimizedSize: optBuffer.length,
        thumbnailSize: thumbBuffer.length,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      // 4. Mark job as completed in DB
      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: `${filename}.${ext}`,
        thumbnailUrl: thumbKey,
        optimizedUrl: optKey,
        size: finalBytes.length,
        optimizedSize: optBuffer.length,
        thumbnailSize: thumbBuffer.length,
        error: undefined,
        taskId: null as any
      });

    } catch (e: any) {
      console.error(`[ImageProcessor] Job ${job.id} failed during image processing:`, e.message);
      await this.handleLocalFailure(userId, projectId, job, e);
    }
  }

  private async handleLocalFailure(userId: string, projectId: string, job: Job, error: any) {
    await this.projectRepo.updateJob(userId, projectId, job.id, {
      status: 'failed',
      error: formatError(error, 'Image processing error')
      // CRITICAL: We deliberately DO NOT clear taskId here.
      // If it was a detached task that succeeded remotely but failed locally (e.g. disk full),
      // keeping the taskId allows the user to 'Retry' and skip remote generation.
    });
  }
}

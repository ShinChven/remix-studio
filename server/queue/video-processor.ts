import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { ProjectRepository } from '../db/project-repository';
import { Job, AlbumItem } from '../../src/types';
import { generateThumbnail, generateOptimized } from '../utils/image-utils';
import { extractFirstFramePng, probeVideo } from '../utils/video-utils';
import { getUserStorageUsage } from '../utils/storage-check';
import { formatError } from '../utils/error-handler';

export interface ProcessCompletedVideoParams {
  userId: string;
  projectId: string;
  job: Job;
  videoBytes: Buffer;
  mimeType?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  modelConfigId?: string;
  providerId?: string;
}

/**
 * Parallel to ImageProcessor but for video jobs.
 *
 * Saves the mp4 to S3 using the same path conventions the image pipeline uses,
 * then extracts a first-frame PNG via ffmpeg and feeds it through the existing
 * sharp-based generateThumbnail/generateOptimized helpers. The resulting
 * `.thumb.jpg` / `.opt.jpg` posters live alongside the mp4 so the existing
 * album grid renders them as if they were images.
 */
export class VideoProcessor {
  constructor(
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private userRepository: UserRepository,
    private exportStorage: S3Storage
  ) {}

  async processCompletedVideo(params: ProcessCompletedVideoParams) {
    const {
      userId,
      projectId,
      job,
      videoBytes,
      mimeType,
      aspectRatio,
      resolution,
      duration,
      modelConfigId,
      providerId,
    } = params;

    try {
      const idPart = job.filename || job.id;
      const filename = `${userId}/${projectId}/${idPart}`;
      const ext = 'mp4';
      const videoKey = `${filename}.${ext}`;
      const videoMime = mimeType || 'video/mp4';

      // 1. Save the mp4 itself
      await this.storage.save(videoKey, videoBytes, videoMime);

      // 2. Probe duration/dimensions (best-effort) + extract first-frame poster
      const probe = await probeVideo(videoBytes).catch(() => ({} as any));
      const posterPng = await extractFirstFramePng(videoBytes);

      // 3. Run the poster PNG through the existing thumbnail/optimized pipeline
      const thumbBuffer = await generateThumbnail(posterPng);
      const thumbKey = `${filename}.thumb.jpg`;
      await this.storage.save(thumbKey, thumbBuffer, 'image/jpeg');

      const optBuffer = await generateOptimized(posterPng);
      const optKey = `${filename}.opt.jpg`;
      await this.storage.save(optKey, optBuffer, 'image/jpeg');

      // 4. Runtime quota check — identical to image pipeline
      const totalNewSize = videoBytes.length + thumbBuffer.length + optBuffer.length;
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.storage, this.exportStorage, this.projectRepo as any);

      if (currentUsage + totalNewSize > limit) {
        try { await this.storage.delete(videoKey); } catch (_) {}
        try { await this.storage.delete(thumbKey); } catch (_) {}
        try { await this.storage.delete(optKey); } catch (_) {}
        throw new Error(
          `Storage quota exceeded (${((currentUsage + totalNewSize - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Generated video was discarded.`
        );
      }

      const resolvedDuration =
        typeof duration === 'number'
          ? duration
          : typeof probe.durationSeconds === 'number'
            ? probe.durationSeconds
            : job.duration;

      // 5. Create album item — same columns as image pipeline, imageUrl holds the mp4 key
      const albumItem: AlbumItem = {
        id: job.id,
        jobId: job.id,
        prompt: job.prompt,
        imageUrl: videoKey,
        thumbnailUrl: thumbKey,
        optimizedUrl: optKey,
        providerId: providerId || job.providerId,
        modelConfigId: modelConfigId || job.modelConfigId,
        aspectRatio: aspectRatio || job.aspectRatio,
        quality: job.quality,
        format: 'mp4' as any,
        duration: resolvedDuration,
        resolution: resolution || job.resolution,
        size: videoBytes.length,
        optimizedSize: optBuffer.length,
        thumbnailSize: thumbBuffer.length,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      // 6. Mark job as completed in DB
      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: videoKey,
        thumbnailUrl: thumbKey,
        optimizedUrl: optKey,
        format: 'mp4' as any,
        duration: resolvedDuration,
        resolution: resolution || job.resolution,
        size: videoBytes.length,
        optimizedSize: optBuffer.length,
        thumbnailSize: thumbBuffer.length,
        error: undefined,
        taskId: null as any,
      });
    } catch (e: any) {
      console.error(`[VideoProcessor] Job ${job.id} failed during video processing:`, e.message);
      await this.handleLocalFailure(userId, projectId, job, e);
    }
  }

  private async handleLocalFailure(userId: string, projectId: string, job: Job, error: any) {
    await this.projectRepo.updateJob(userId, projectId, job.id, {
      status: 'failed',
      error: formatError(error, 'Video processing error'),
      // CRITICAL: DO NOT clear taskId here — matches ImageProcessor policy so
      // a user can retry a detached task that finished remotely but failed locally.
    });
  }
}

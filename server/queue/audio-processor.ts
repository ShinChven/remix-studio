import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { ProjectRepository } from '../db/project-repository';
import { AlbumItem, Job } from '../../src/types';
import { getUserStorageUsage } from '../utils/storage-check';
import { formatError } from '../utils/error-handler';

export interface ProcessCompletedAudioParams {
  userId: string;
  projectId: string;
  job: Job;
  audioBytes: Buffer;
  mimeType?: string;
  modelConfigId?: string;
  providerId?: string;
}

function resolveAudioFormat(mimeType?: string): { ext: 'wav' | 'mp3' | 'm4a' | 'ogg' | 'webm'; mimeType: string } {
  switch (mimeType) {
    case 'audio/mpeg':
      return { ext: 'mp3', mimeType };
    case 'audio/mp4':
      return { ext: 'm4a', mimeType };
    case 'audio/ogg':
      return { ext: 'ogg', mimeType };
    case 'audio/webm':
      return { ext: 'webm', mimeType };
    case 'audio/wav':
    case 'audio/x-wav':
    default:
      return { ext: 'wav', mimeType: 'audio/wav' };
  }
}

export class AudioProcessor {
  constructor(
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private userRepository: UserRepository,
    private exportStorage: S3Storage
  ) {}

  async processCompletedAudio(params: ProcessCompletedAudioParams) {
    const { userId, projectId, job, audioBytes, mimeType, modelConfigId, providerId } = params;

    try {
      const { ext, mimeType: resolvedMimeType } = resolveAudioFormat(mimeType);
      const idPart = job.filename || job.id;
      const filename = `${userId}/${projectId}/${idPart}`;
      const audioKey = `${filename}.${ext}`;

      await this.storage.save(audioKey, audioBytes, resolvedMimeType);

      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.storage, this.exportStorage, this.projectRepo as any);

      if (currentUsage + audioBytes.length > limit) {
        try { await this.storage.delete(audioKey); } catch (_) {}
        throw new Error(`Storage quota exceeded (${((currentUsage + audioBytes.length - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Generated audio was discarded.`);
      }

      const albumItem: AlbumItem = {
        id: job.id,
        jobId: job.id,
        prompt: job.prompt,
        imageUrl: audioKey,
        providerId: providerId || job.providerId,
        modelConfigId: modelConfigId || job.modelConfigId,
        quality: job.quality,
        background: job.background,
        format: ext,
        size: audioBytes.length,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: audioKey,
        format: ext,
        size: audioBytes.length,
        error: undefined,
        taskId: null as any,
      });
    } catch (e: any) {
      console.error(`[AudioProcessor] Job ${job.id} failed during audio processing:`, e.message);
      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'failed',
        error: formatError(e, 'Audio processing error'),
      });
    }
  }
}

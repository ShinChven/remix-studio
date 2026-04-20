import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';
import { ProjectRepository } from '../db/project-repository';
import { AlbumItem, Job } from '../../src/types';
import { getUserStorageUsage } from '../utils/storage-check';
import { formatError } from '../utils/error-handler';
import { resolveAudioOutput, transcodeAudioBuffer } from '../utils/audio-utils';

export interface ProcessCompletedAudioParams {
  userId: string;
  projectId: string;
  job: Job;
  audioBytes: Buffer;
  text?: string;
  mimeType?: string;
  modelConfigId?: string;
  providerId?: string;
}

export class AudioProcessor {
  constructor(
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private userRepository: UserRepository,
    private exportStorage: S3Storage
  ) {}

  async processCompletedAudio(params: ProcessCompletedAudioParams) {
    const { userId, projectId, job, audioBytes, text, mimeType, modelConfigId, providerId } = params;

    try {
      const requestedFormat = job.format === 'mp3' || job.format === 'aac' || job.format === 'wav'
        ? job.format
        : 'wav';
      const { ext, mimeType: resolvedMimeType } = resolveAudioOutput(requestedFormat);
      const finalAudioBytes = await transcodeAudioBuffer(audioBytes, requestedFormat, mimeType);
      const idPart = job.filename || job.id;
      const filename = `${userId}/${projectId}/${idPart}`;
      const audioKey = `${filename}.${ext}`;

      await this.storage.save(audioKey, finalAudioBytes, resolvedMimeType);

      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.storage, this.exportStorage, this.projectRepo as any);

      if (currentUsage + finalAudioBytes.length > limit) {
        try { await this.storage.delete(audioKey); } catch (_) {}
        throw new Error(`Storage quota exceeded (${((currentUsage + finalAudioBytes.length - limit) / (1024 * 1024)).toFixed(1)}MB over limit). Generated audio was discarded.`);
      }

      const albumItem: AlbumItem = {
        id: job.id,
        jobId: job.id,
        prompt: job.prompt,
        textContent: text,
        imageUrl: audioKey,
        providerId: providerId || job.providerId,
        modelConfigId: modelConfigId || job.modelConfigId,
        quality: job.quality,
        background: job.background,
        format: ext,
        size: finalAudioBytes.length,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'completed',
        imageUrl: audioKey,
        resultText: text,
        format: ext,
        size: finalAudioBytes.length,
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

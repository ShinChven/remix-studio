import { ProjectRepository } from '../db/project-repository';
import { Job, AlbumItem } from '../../src/types';

export interface ProcessCompletedTextParams {
  userId: string;
  projectId: string;
  job: Job;
  text: string;
  modelConfigId?: string;
  providerId?: string;
}

export class TextProcessor {
  constructor(
    private projectRepo: ProjectRepository,
  ) {}

  async processCompletedText(params: ProcessCompletedTextParams) {
    const { userId, projectId, job, text, modelConfigId, providerId } = params;

    try {
      // Create album item with text content
      const albumItem: AlbumItem = {
        id: job.id,
        jobId: job.id,
        prompt: job.prompt,
        textContent: text,
        imageUrl: '', // Not used for text generation
        providerId: providerId || job.providerId,
        modelConfigId: modelConfigId || job.modelConfigId,
        createdAt: Date.now(),
      };
      await this.projectRepo.addAlbumItem(userId, projectId, albumItem);

      // Mark job as completed
      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'completed',
        resultText: text,
        error: undefined,
        taskId: null as any,
      });

    } catch (e: any) {
      console.error(`[TextProcessor] Job ${job.id} failed:`, e.message);
      await this.projectRepo.updateJob(userId, projectId, job.id, {
        status: 'failed',
        error: e.message || 'Text processing error',
      });
    }
  }
}

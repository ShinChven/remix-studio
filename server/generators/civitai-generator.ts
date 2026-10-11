import { CheckStatusResult, GenerateRequest, GenerateResult, ImageGenerator } from './image-generator';
import {
  CIVITAI_PENDING_STATUSES,
  CivitaiApiError,
  CivitaiClient,
  CivitaiWorkflow,
  buildCivitaiWorkflow,
} from '../civitai/civitai-client';

/**
 * Runs Civitai project jobs on Civitai's generation service. Each job submits
 * a one-step workflow and hands its id to the detached poller, which keeps the
 * provider's concurrency slot until the image is downloaded or the workflow
 * fails.
 */
export class CivitaiGenerator extends ImageGenerator {
  private client: CivitaiClient;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.client = new CivitaiClient(apiKey, apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!req.civitai?.model?.air) {
      return { ok: false, error: 'Choose a Civitai checkpoint for this project first' };
    }
    try {
      const workflow = await this.client.submitWorkflow(buildCivitaiWorkflow(req.prompt, req.civitai, req.format));
      if (!workflow.id) return { ok: false, error: 'Civitai did not return a workflow id' };
      if (workflow.status && !CIVITAI_PENDING_STATUSES.has(workflow.status) && workflow.status !== 'succeeded') {
        return { ok: false, error: describeFailure(workflow) };
      }
      return { ok: true, status: 'processing', taskId: workflow.id };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Submitting the generation to Civitai failed' };
    }
  }

  /**
   * Never throws: a network blip or a 5xx keeps the job processing for the
   * next poll; only an answer that the workflow is gone or failed ends it.
   */
  async checkStatus(taskId: string): Promise<CheckStatusResult> {
    let workflow: CivitaiWorkflow;
    try {
      workflow = await this.client.getWorkflow(taskId);
    } catch (e: any) {
      if (e instanceof CivitaiApiError && (e.status === 401 || e.status === 403)) {
        return { status: 'failed', error: e.message };
      }
      if (e instanceof CivitaiApiError && e.status === 404) {
        return { status: 'failed', error: 'Civitai no longer knows this generation. Retry the job to run it again.' };
      }
      console.warn(`[CivitaiGenerator] Checking workflow ${taskId} failed, retrying on the next poll: ${e?.message}`);
      return { status: 'processing' };
    }

    const status = workflow.status;
    if (!status || CIVITAI_PENDING_STATUSES.has(status)) return { status: 'processing' };
    if (status !== 'succeeded') return { status: 'failed', error: describeFailure(workflow) };

    const images = (workflow.steps || []).flatMap((step) => step.output?.images || []);
    const image = images.find((blob) => blob.available && blob.url);
    if (!image) {
      const blocked = images.find((blob) => blob.blockedReason);
      if (blocked) return { status: 'failed', error: describeBlocked(blocked.blockedReason!) };
      // The workflow is done but its image is still being stored; the
      // poller's stuck timeout ends a wait that never resolves.
      if (images.length > 0) return { status: 'processing' };
      return { status: 'failed', error: 'Civitai finished the generation without returning an image' };
    }

    try {
      return { status: 'completed', imageBytes: await this.client.download(image.url!) };
    } catch (e: any) {
      // Blob URLs are signed and expire; the next poll fetches a fresh one.
      console.warn(`[CivitaiGenerator] Downloading the image of workflow ${taskId} failed, retrying on the next poll: ${e?.message}`);
      return { status: 'processing' };
    }
  }
}

function describeBlocked(reason: string): string {
  const hint = /mature|nsfw/i.test(reason)
    ? ' Turn on "Allow mature content" in the project settings to receive it.'
    : '';
  return `Civitai blocked the image: ${reason}.${hint}`;
}

function describeFailure(workflow: CivitaiWorkflow): string {
  const errors = (workflow.steps || []).flatMap((step) => step.output?.errors || []).filter(Boolean);
  if (errors.length > 0) return `Civitai could not generate the image: ${errors.join('; ')}`;
  switch (workflow.status) {
    case 'expired':
      return 'The generation expired on Civitai before a worker picked it up. Retry the job to run it again.';
    case 'canceled':
      return 'The generation was canceled on Civitai';
    default:
      return 'Civitai reported the generation as failed. Retry the job to run it again.';
  }
}

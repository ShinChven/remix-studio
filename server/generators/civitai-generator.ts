import sharp from 'sharp';
import { CheckStatusResult, GenerateRequest, GenerateResult, ImageGenerator } from './image-generator';
import {
  CIVITAI_PENDING_STATUSES,
  CivitaiApiError,
  CivitaiClient,
  CivitaiImageBlob,
  CivitaiSourceImage,
  CivitaiVideoFrames,
  CivitaiWorkflow,
  buildCivitaiVideoWorkflow,
  buildCivitaiWorkflow,
} from '../civitai/civitai-client';
import type { CivitaiGenerationConfig } from '../../src/types';
import { civitaiVideoEngine, isCivitaiVideo, resolveCivitaiVideoSettings } from '../../src/lib/civitai';

/** Longest side a video frame is uploaded at when the engine sizes the video itself. */
const MAX_FRAME_SIDE = 2048;

/**
 * Runs Civitai project jobs on Civitai's generation service. Each job submits
 * a workflow — one text-to-image step for an image, the engine's video steps
 * for a video — and hands its id to the detached poller, which keeps the
 * provider's concurrency slot until the result is downloaded or the workflow
 * fails.
 */
export class CivitaiGenerator extends ImageGenerator {
  private client: CivitaiClient;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.client = new CivitaiClient(apiKey, apiUrl);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!req.civitai) return { ok: false, error: 'This job has no Civitai settings' };
    const video = isCivitaiVideo(req.civitai);
    if (!video && !req.civitai.model?.air) {
      return { ok: false, error: 'Choose a Civitai checkpoint for this project first' };
    }
    try {
      let body: Record<string, unknown>;
      if (video) {
        body = buildCivitaiVideoWorkflow(req.prompt, req.civitai, await this.uploadFrames(req.refImagesBase64 || [], req.civitai));
      } else {
        const source = req.refImagesBase64?.[0]
          ? await this.uploadSource(Buffer.from(req.refImagesBase64[0], 'base64'), req.civitai)
          : undefined;
        body = buildCivitaiWorkflow(req.prompt, req.civitai, req.format, source);
      }
      const workflow = await this.client.submitWorkflow(body);
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
   * Image-to-image: fit the source to the job's size — the queue has already
   * shaped that size after the source — and upload it to Civitai. Phone
   * pictures are turned upright first, as their EXIF orientation says.
   */
  private async uploadSource(bytes: Buffer, params: CivitaiGenerationConfig): Promise<CivitaiSourceImage> {
    const width = params.width || 1024;
    const height = params.height || 1024;
    const png = await sharp(bytes).rotate().resize(width, height, { fit: 'cover' }).png().toBuffer();
    return { url: await this.uploadImage(png, 'source image'), width, height };
  }

  /**
   * Image-to-video: upload the first image as the start frame and, for
   * engines that take one, the second as the end frame. An engine that renders
   * at a set frame size gets the frames cut to it — the queue picked that size
   * after the start frame's shape — and one that sizes the video itself gets
   * them upright and at most 2048 px.
   */
  private async uploadFrames(images: string[], params: CivitaiGenerationConfig): Promise<CivitaiVideoFrames> {
    if (images.length === 0) return {};
    const engine = civitaiVideoEngine(params.video?.engine);
    if (!engine.imageToVideo) {
      throw new Error(`${engine.label} only makes videos from text. Remove the image items from the workflow or pick another engine.`);
    }
    const settings = resolveCivitaiVideoSettings(params.video);
    const prepare = (bytes: Buffer) => {
      const image = sharp(bytes).rotate();
      return (engine.frameSize && settings.width && settings.height
        ? image.resize(settings.width, settings.height, { fit: 'cover' })
        : image.resize(MAX_FRAME_SIDE, MAX_FRAME_SIDE, { fit: 'inside', withoutEnlargement: true })
      ).png().toBuffer();
    };
    const frames: CivitaiVideoFrames = {
      start: await this.uploadImage(await prepare(Buffer.from(images[0], 'base64')), 'start frame'),
    };
    if (engine.endFrame && images[1]) {
      frames.end = await this.uploadImage(await prepare(Buffer.from(images[1], 'base64')), 'end frame');
    }
    return frames;
  }

  private async uploadImage(png: Buffer, what: string): Promise<string> {
    let blob;
    try {
      blob = await this.client.uploadBlob(png, 'image/png');
    } catch (e: any) {
      throw new Error(`Uploading the ${what} to Civitai failed: ${e?.message || e}`);
    }
    if (blob.blockedReason) {
      const hint = /mature|nsfw/i.test(blob.blockedReason) ? ' Turn on "Allow mature content" in the project settings to use it.' : '';
      throw new Error(`Civitai blocked the ${what}: ${blob.blockedReason}.${hint}`);
    }
    if (!blob.url) throw new Error(`Civitai did not return a URL for the uploaded ${what}`);
    return blob.url;
  }

  async cancel(taskId: string): Promise<void> {
    await this.client.deleteWorkflow(taskId);
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

    const steps = workflow.steps || [];
    const isVideo = steps.some((step) => step.$type === 'videoGen' || step.$type === 'videoInterpolation');
    // A video workflow's last step holds the finished video (Wan 2.2's first
    // step holds the 12 fps render its interpolation step doubles).
    const blobs: CivitaiImageBlob[] = isVideo
      ? [...steps].reverse().flatMap((step) => [step.output?.video, ...(step.output?.additionalVideos || [])].filter((blob): blob is CivitaiImageBlob => !!blob))
      : steps.flatMap((step) => step.output?.images || []);
    const what = isVideo ? 'video' : 'image';
    const result = blobs.find((blob) => blob.available && blob.url);
    if (!result) {
      const blocked = blobs.find((blob) => blob.blockedReason);
      if (blocked) return { status: 'failed', error: describeBlocked(blocked.blockedReason!, what) };
      // The workflow is done but its result is still being stored; the
      // poller's stuck timeout ends a wait that never resolves.
      if (blobs.length > 0) return { status: 'processing' };
      return { status: 'failed', error: `Civitai finished the generation without returning ${isVideo ? 'a video' : 'an image'}` };
    }

    try {
      const { bytes, contentType } = await this.client.download(result.url!, what);
      return isVideo
        ? { status: 'completed', videoBytes: bytes, mimeType: contentType?.startsWith('video/') ? contentType : 'video/mp4' }
        : { status: 'completed', imageBytes: bytes };
    } catch (e: any) {
      // Blob URLs are signed and expire; the next poll fetches a fresh one.
      console.warn(`[CivitaiGenerator] Downloading the ${what} of workflow ${taskId} failed, retrying on the next poll: ${e?.message}`);
      return { status: 'processing' };
    }
  }
}

function describeBlocked(reason: string, what: string): string {
  const hint = /mature|nsfw/i.test(reason)
    ? ' Turn on "Allow mature content" in the project settings to receive it.'
    : '';
  return `Civitai blocked the ${what}: ${reason}.${hint}`;
}

function describeFailure(workflow: CivitaiWorkflow): string {
  const errors = (workflow.steps || []).flatMap((step) => step.output?.errors || []).filter(Boolean);
  const what = (workflow.steps || []).some((step) => step.$type === 'videoGen') ? 'video' : 'image';
  if (errors.length > 0) return `Civitai could not generate the ${what}: ${errors.join('; ')}`;
  switch (workflow.status) {
    case 'expired':
      return 'The generation expired on Civitai before a worker picked it up. Retry the job to run it again.';
    case 'canceled':
      return 'The generation was canceled on Civitai';
    default:
      return 'Civitai reported the generation as failed. Retry the job to run it again.';
  }
}

import { createHash, randomInt } from 'node:crypto';
import { ProjectRepository } from '../db/project-repository';
import { S3Storage } from '../storage/s3-storage';
import { ImageProcessor } from './image-processor';
import { VideoProcessor } from './video-processor';
import {
  COMFY_UPLOAD_SUBFOLDER,
  ComfyApiError,
  ComfyClient,
  ComfyOutputFile,
  collectOutputFiles,
  formatExecutionError,
} from '../comfyui/comfy-client';
import {
  ComfyValue,
  applyComfyValues,
  coerceComfyValue,
  getComfyInputValue,
  isComfySeedInput,
  isSameComfyTarget,
} from '../../src/lib/comfyWorkflow';
import type { ComfyInputTarget, ComfyJobInput, Job, Project } from '../../src/types';
import { assertSafeReferenceImageUrl } from '../utils/url-safety';
import { transcodeToMp4 } from '../utils/video-utils';
import type { ProjectEventPublisher, ProjectLiveEventReason } from '../live/project-live-hub';

// Prompts waiting or running in one project's ComfyUI at a time. Two keep the
// GPU busy without queueing a whole batch on an instance whose address may
// change before it gets to them. A prompt ComfyUI has finished stops counting
// while its result downloads, so a slow download never leaves the GPU idle.
const MAX_IN_FLIGHT_PER_PROJECT = 2;
const POLL_INTERVAL_MS = 2_000;
// A finished prompt leaves the queue a moment before its history is written,
// so a prompt found in neither gets a few polls before it counts as lost.
const MISSING_PROMPT_GRACE_POLLS = 3;
// How long ComfyUI may stay unreachable before its in-flight jobs fail.
const UNREACHABLE_TIMEOUT_MS = 10 * 60_000;
// A check that keeps throwing — most often a result that won't download over
// a slow link — fails its job after this many attempts in a row, instead of
// leaving it processing, with its slot taken, for good.
const MAX_CHECK_ERRORS = 3;

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'gif']);

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

function extensionOf(value: string): string {
  const clean = value.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function extensionForMime(mime: string): string {
  const entry = Object.entries(MIME_BY_EXTENSION).find(([, m]) => m === mime);
  return entry ? entry[0] : 'bin';
}

interface InFlightJob {
  userId: string;
  projectId: string;
  jobId: string;
  promptId: string;
  missingPolls: number;
  unreachableSince?: number;
  checkErrors?: number;
  /** ComfyUI has finished the prompt and its result is being collected. */
  collecting?: boolean;
}

/**
 * Runs ComfyUI project jobs. ComfyUI projects have no provider: each project
 * carries its own instance address and workflow, so these jobs bypass the
 * provider queue. Jobs are submitted a couple at a time per project, then
 * polled until ComfyUI reports a result, which goes through the same image /
 * video processors as every other generation.
 */
export class ComfyUIRunner {
  private waiting = new Map<string, Array<{ userId: string; jobId: string }>>();
  private submitting = new Map<string, number>();
  private inFlight = new Map<string, InFlightJob>();
  private tracked = new Set<string>();
  private pumping = new Set<string>();
  // Jobs being checked right now. Each job is checked on its own, so one slow
  // download does not hold up every other job.
  private checking = new Set<string>();
  private intervalId?: NodeJS.Timeout;

  constructor(
    private projectRepo: ProjectRepository,
    private storage: S3Storage,
    private imageProcessor: ImageProcessor,
    private videoProcessor: VideoProcessor,
    private projectEvents?: ProjectEventPublisher,
  ) {}

  public start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.pollInFlight(), POLL_INTERVAL_MS);
  }

  public stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  /** Whether the runner currently owns this job (waiting, submitting or in flight). */
  public isTracking(jobId: string): boolean {
    return this.tracked.has(jobId);
  }

  public enqueue(userId: string, projectId: string, jobIds: string[]) {
    let queue = this.waiting.get(projectId);
    if (!queue) {
      queue = [];
      this.waiting.set(projectId, queue);
    }
    for (const jobId of jobIds) {
      if (this.tracked.has(jobId)) continue;
      this.tracked.add(jobId);
      queue.push({ userId, jobId });
    }
    void this.pump(projectId);
  }

  /** Resume polling a job that was already submitted before a restart. */
  public adopt(userId: string, projectId: string, jobId: string, promptId: string) {
    if (this.tracked.has(jobId)) return;
    this.tracked.add(jobId);
    this.inFlight.set(jobId, { userId, projectId, jobId, promptId, missingPolls: 0 });
  }

  private activeCount(projectId: string): number {
    let count = this.submitting.get(projectId) || 0;
    for (const job of this.inFlight.values()) {
      if (job.projectId === projectId && !job.collecting) count++;
    }
    return count;
  }

  private async pump(projectId: string) {
    if (this.pumping.has(projectId)) return;
    this.pumping.add(projectId);
    try {
      const queue = this.waiting.get(projectId) || [];
      while (queue.length > 0 && this.activeCount(projectId) < MAX_IN_FLIGHT_PER_PROJECT) {
        const next = queue.shift()!;
        this.submitting.set(projectId, (this.submitting.get(projectId) || 0) + 1);
        void this.submit(next.userId, projectId, next.jobId)
          .catch((e) => console.error(`[ComfyUIRunner] Submit crashed for job ${next.jobId}:`, e))
          .finally(() => {
            this.submitting.set(projectId, Math.max(0, (this.submitting.get(projectId) || 1) - 1));
            void this.pump(projectId);
          });
      }
      if (queue.length === 0) this.waiting.delete(projectId);
    } finally {
      this.pumping.delete(projectId);
    }
  }

  private async submit(userId: string, projectId: string, jobId: string) {
    const job = await this.projectRepo.getJob(userId, projectId, jobId);
    if (!job || job.status !== 'pending') {
      this.tracked.delete(jobId);
      return;
    }

    let comfyUrl: string | undefined;
    try {
      const project = await this.projectRepo.getProject(userId, projectId);
      if (!project) throw new Error('Project not found');
      comfyUrl = project.comfyUrl;
      await this.updateJobStatus(userId, projectId, jobId, { status: 'processing', error: undefined });

      if (!project.comfyUrl) throw new Error('Set the ComfyUI address on this project first');
      if (!project.comfyWorkflow) throw new Error('Load a ComfyUI workflow (API format) on this project first');
      const client = new ComfyClient(project.comfyUrl, project.comfyPassword);

      // A job that finished in ComfyUI but failed afterwards (e.g. storage quota)
      // keeps its prompt id; on retry, collect that result instead of re-running.
      if (job.taskId && (await this.isPromptAlive(client, job.taskId))) {
        this.inFlight.set(jobId, { userId, projectId, jobId, promptId: job.taskId, missingPolls: 0 });
        return;
      }

      const { values, seedInputs } = await this.resolveValues(client, project, job);
      const prompt = applyComfyValues(project.comfyWorkflow, values);
      const promptId = await client.queuePrompt(prompt, `remix-studio-${jobId}`);

      await this.updateJobStatus(userId, projectId, jobId, {
        taskId: promptId,
        // Record the seeds rolled for this run so the result can be reproduced.
        ...(seedInputs.length > 0 ? { comfyInputs: [...(job.comfyInputs || []), ...seedInputs] } : {}),
      });
      this.inFlight.set(jobId, { userId, projectId, jobId, promptId, missingPolls: 0 });
      console.log(`[ComfyUIRunner] Job ${jobId} queued in ComfyUI as ${promptId}`);
    } catch (e: any) {
      console.warn(`[ComfyUIRunner] Job ${jobId} failed to submit: ${e?.message}`);
      this.tracked.delete(jobId);
      await this.updateJobStatus(userId, projectId, jobId, {
        status: 'failed',
        error: this.describeError(e, comfyUrl),
        taskId: null as any,
      });
    }
  }

  private async isPromptAlive(client: ComfyClient, promptId: string): Promise<boolean> {
    try {
      const entry = await client.getHistory(promptId);
      if (entry) return entry.status?.status_str !== 'error' && collectOutputFiles(entry).length > 0;
      return await client.isQueued(promptId);
    } catch {
      return false;
    }
  }

  /**
   * Turn the job's bound inputs into workflow values: text is coerced to the
   * type of the value it replaces, media is uploaded to ComfyUI's input folder,
   * and integer seeds the project left unbound are re-rolled so a batch does
   * not render the same image over and over.
   */
  private async resolveValues(client: ComfyClient, project: Project, job: Job) {
    const workflow = project.comfyWorkflow!;
    const inputs = job.comfyInputs || [];
    const values: Array<ComfyInputTarget & { value: ComfyValue }> = [];
    const uploaded = new Map<string, string>();

    for (const input of inputs) {
      const original = getComfyInputValue(workflow, input);
      if (original === undefined) {
        throw new Error(`Input "${input.input}" on node #${input.nodeId} is no longer in the workflow`);
      }
      if (input.kind === 'text') {
        try {
          values.push({ nodeId: input.nodeId, input: input.input, value: coerceComfyValue(original, input.value) });
        } catch (e: any) {
          throw new Error(`#${input.nodeId} ${input.input}: ${e.message}`);
        }
        continue;
      }

      let name = uploaded.get(input.value);
      if (!name) {
        const media = await this.loadMedia(input.value);
        // Name uploads by content so the same reference is stored once and
        // ComfyUI can reuse its cached load across a batch.
        const hash = createHash('sha1').update(media.bytes).digest('hex').slice(0, 16);
        name = await this.ensureUploaded(client, media, `remix-${hash}.${media.ext}`);
        uploaded.set(input.value, name);
      }
      values.push({ nodeId: input.nodeId, input: input.input, value: name });
    }

    const seedInputs: ComfyJobInput[] = [];
    for (const [nodeId, node] of Object.entries(workflow)) {
      for (const [inputName, value] of Object.entries(node.inputs)) {
        if (!isComfySeedInput(inputName, value)) continue;
        const target = { nodeId, input: inputName };
        if (inputs.some((input) => isSameComfyTarget(input, target))) continue;
        const seed = randomInt(0, 2 ** 32);
        values.push({ ...target, value: seed });
        seedInputs.push({ ...target, kind: 'text', value: String(seed) });
      }
    }

    return { values, seedInputs };
  }

  /**
   * Upload a reference unless ComfyUI already holds it. Uploads are named by
   * content, so a file of that name is this file, and a batch sends each
   * reference once rather than once per job — over a slow link, repeating a
   * large upload is what times out.
   */
  private async ensureUploaded(client: ComfyClient, media: { bytes: Buffer; mimeType: string }, filename: string): Promise<string> {
    const existing = `${COMFY_UPLOAD_SUBFOLDER}/${filename}`;
    if (await client.hasInputFile(existing).catch(() => false)) return existing;
    return client.uploadFile(media.bytes, filename, media.mimeType);
  }

  private async loadMedia(value: string): Promise<{ bytes: Buffer; mimeType: string; ext: string }> {
    const dataUrl = value.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataUrl) {
      return { bytes: Buffer.from(dataUrl[2], 'base64'), mimeType: dataUrl[1], ext: extensionForMime(dataUrl[1]) };
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
      await assertSafeReferenceImageUrl(value);
      const res = await fetch(value, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`Failed to download reference file: HTTP ${res.status}`);
      const mimeType = res.headers.get('content-type')?.split(';')[0] || MIME_BY_EXTENSION[extensionOf(value)] || 'application/octet-stream';
      return { bytes: Buffer.from(await res.arrayBuffer()), mimeType, ext: extensionOf(value) || extensionForMime(mimeType) };
    }

    const ext = extensionOf(value) || 'png';
    return { bytes: await this.storage.read(value), mimeType: MIME_BY_EXTENSION[ext] || 'application/octet-stream', ext };
  }

  private pollInFlight() {
    for (const entry of this.inFlight.values()) {
      if (this.checking.has(entry.jobId)) continue;
      this.checking.add(entry.jobId);
      void this.checkJob(entry)
        .then(() => { entry.checkErrors = 0; })
        .catch((e) => this.recordCheckError(entry, e))
        .catch((e) => console.error(`[ComfyUIRunner] Failing job ${entry.jobId} failed:`, e))
        .finally(() => this.checking.delete(entry.jobId));
    }
  }

  /**
   * A check threw: retried on the next poll, and after MAX_CHECK_ERRORS in a
   * row the job fails with the error. The prompt id is kept, so retrying the
   * job collects a result ComfyUI already finished instead of running it again.
   */
  private async recordCheckError(entry: InFlightJob, e: any) {
    entry.checkErrors = (entry.checkErrors || 0) + 1;
    console.error(`[ComfyUIRunner] Checking job ${entry.jobId} failed (${entry.checkErrors}/${MAX_CHECK_ERRORS}):`, e?.message || e);
    if (entry.checkErrors < MAX_CHECK_ERRORS || !this.inFlight.has(entry.jobId)) return;
    const message = e?.message || 'Checking the job in ComfyUI failed';
    await this.fail(entry, `${message}. Retry the job to try again — a result ComfyUI already finished is downloaded, not generated again.`, true);
  }

  private async checkJob(entry: InFlightJob) {
    const { userId, projectId, jobId, promptId } = entry;
    const job = await this.projectRepo.getJob(userId, projectId, jobId);
    const project = await this.projectRepo.getProject(userId, projectId);

    if (!job || !project) {
      // Deleted while running: drop it from ComfyUI's queue if it hasn't started.
      if (project?.comfyUrl) await new ComfyClient(project.comfyUrl, project.comfyPassword).deleteFromQueue(promptId).catch(() => {});
      this.release(entry);
      return;
    }
    if (job.status !== 'processing') {
      this.release(entry);
      return;
    }
    if (!project.comfyUrl) {
      await this.fail(entry, 'The ComfyUI address was removed from this project');
      return;
    }

    const client = new ComfyClient(project.comfyUrl, project.comfyPassword);
    let history;
    try {
      history = await client.getHistory(promptId);
    } catch (e: any) {
      // A wrong or missing password won't fix itself by waiting.
      if (e instanceof ComfyApiError && (e.status === 401 || e.status === 403)) {
        await this.fail(entry, e.message);
        return;
      }
      entry.unreachableSince ??= Date.now();
      if (Date.now() - entry.unreachableSince > UNREACHABLE_TIMEOUT_MS) {
        await this.fail(entry, this.describeError(e, project.comfyUrl));
      }
      return;
    }
    entry.unreachableSince = undefined;

    if (!history) {
      let queued = false;
      try {
        queued = await client.isQueued(promptId);
      } catch {
        return;
      }
      if (queued) {
        entry.missingPolls = 0;
        return;
      }
      entry.missingPolls++;
      if (entry.missingPolls > MISSING_PROMPT_GRACE_POLLS) {
        await this.fail(entry, 'ComfyUI no longer knows this prompt — the instance may have restarted or the address changed. Retry the job to run it again.');
      }
      return;
    }

    if (history.status?.status_str === 'error') {
      await this.fail(entry, formatExecutionError(history));
      return;
    }
    if (history.status && history.status.completed === false && history.status.status_str !== 'success') {
      return;
    }

    const files = collectOutputFiles(history);
    const wantsVideo = job.format === 'mp4';
    const file = files.find((f) => (wantsVideo ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS).has(extensionOf(f.filename)))
      || files.find((f) => VIDEO_EXTENSIONS.has(extensionOf(f.filename)) || IMAGE_EXTENSIONS.has(extensionOf(f.filename)));
    if (!file) {
      await this.fail(entry, 'The workflow finished without saving an image or video. Add a Save Image or video-saving node.');
      return;
    }

    // The GPU is done with this prompt: send the next job while the result
    // downloads, which over a slow link can take longer than generating it.
    if (!entry.collecting) {
      entry.collecting = true;
      void this.pump(projectId);
    }
    await this.complete(entry, job, client, file);
  }

  private async complete(entry: InFlightJob, job: Job, client: ComfyClient, file: ComfyOutputFile) {
    const { userId, projectId } = entry;
    let download: { bytes: Buffer; contentType: string };
    try {
      download = await client.view(file);
    } catch (e) {
      // ComfyUI answered but won't serve the file; polling again won't help.
      // Network failures fall through and are retried on the next poll.
      if (e instanceof ComfyApiError) {
        await this.fail(entry, e.message);
        return;
      }
      throw e;
    }
    const { bytes, contentType } = download;
    console.log(`[ComfyUIRunner] Job ${entry.jobId} downloaded ${file.filename} (${(bytes.length / 1024 ** 2).toFixed(1)} MB)`);
    const ext = extensionOf(file.filename);
    const isVideo = ext === 'gif' ? job.format === 'mp4' : VIDEO_EXTENSIONS.has(ext);

    if (isVideo) {
      let videoBytes = bytes;
      let mimeType = 'video/mp4';
      if (ext !== 'mp4') {
        try {
          videoBytes = await transcodeToMp4(bytes, ext);
        } catch (e: any) {
          console.warn(`[ComfyUIRunner] Could not transcode ${file.filename} to mp4, storing as is: ${e?.message}`);
          mimeType = contentType.startsWith('video/') ? contentType : (MIME_BY_EXTENSION[ext] || 'video/mp4');
        }
      }
      await this.videoProcessor.processCompletedVideo({ userId, projectId, job, videoBytes, mimeType });
    } else {
      await this.imageProcessor.processCompletedImage({
        userId,
        projectId,
        job,
        imageBytes: bytes,
        format: job.format || 'png',
      });
    }
    this.release(entry);
  }

  /** Fail a job. `keepPrompt` keeps its prompt id, for a retry to collect the result. */
  private async fail(entry: InFlightJob, error: string, keepPrompt = false) {
    console.warn(`[ComfyUIRunner] Job ${entry.jobId} failed: ${error}`);
    await this.updateJobStatus(entry.userId, entry.projectId, entry.jobId, {
      status: 'failed',
      error,
      ...(keepPrompt ? {} : { taskId: null as any }),
    });
    this.release(entry);
  }

  private release(entry: InFlightJob) {
    this.inFlight.delete(entry.jobId);
    this.tracked.delete(entry.jobId);
    void this.pump(entry.projectId);
  }

  private describeError(e: any, comfyUrl?: string): string {
    const message = e?.message || 'ComfyUI request failed';
    const isNetwork = e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.cause || message === 'fetch failed';
    if (isNetwork && comfyUrl) {
      const cause = e?.cause?.code || e?.cause?.message || message;
      return `Cannot reach ComfyUI at ${comfyUrl} (${cause}). Check the address — it changes whenever the instance restarts.`;
    }
    return message;
  }

  private async updateJobStatus(userId: string, projectId: string, jobId: string, updates: Partial<Job>) {
    await this.projectRepo.updateJob(userId, projectId, jobId, updates);
    let reason: ProjectLiveEventReason = 'job.updated';
    if (updates.status === 'completed') reason = 'job.completed';
    if (updates.status === 'failed') reason = 'job.failed';
    this.projectEvents?.notifyProjectChanged({ userId, projectId, jobId, reason });
  }
}

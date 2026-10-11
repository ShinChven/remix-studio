import type { CivitaiGenerationConfig, CivitaiResource } from '../../src/types';
import {
  CIVITAI_WEB_URL,
  isCivitaiEmbedding,
  normalizeCivitaiAir,
  parseCivitaiAir,
  parseCivitaiModelUrl,
} from '../../src/lib/civitai';

/**
 * Client for the two Civitai APIs a Civitai project uses, both authorised with
 * the user's Civitai API token:
 *
 * - the orchestration API, which runs generations as workflows
 *   (`POST /v2/consumer/workflows`, then `GET /v2/consumer/workflows/{id}`) and
 *   bills them in Buzz to the token's account;
 * - the public REST API, which describes a model version (its AIR, base model
 *   and trigger words) when a resource is added by link or AIR.
 */

export const CIVITAI_ORCHESTRATION_URL = 'https://orchestration.civitai.com';

const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 1500;

/** Statuses a workflow and its steps move through, as Civitai spells them. */
export type CivitaiWorkflowStatus =
  | 'unassigned' | 'preparing' | 'scheduled' | 'processing'
  | 'succeeded' | 'failed' | 'expired' | 'canceled';

export interface CivitaiImageBlob {
  id: string;
  available: boolean;
  url?: string | null;
  blockedReason?: string | null;
}

export interface CivitaiWorkflowStep {
  $type: string;
  name?: string;
  status?: CivitaiWorkflowStatus;
  output?: { images?: CivitaiImageBlob[]; errors?: string[] | null } | null;
}

export interface CivitaiWorkflow {
  id?: string | null;
  status?: CivitaiWorkflowStatus;
  steps?: CivitaiWorkflowStep[];
}

/** Raised for a response Civitai returned; network failures surface as plain errors. */
export class CivitaiApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'CivitaiApiError';
  }
}

function truncate(text: string): string {
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text;
}

/**
 * Pull a readable message out of an error body. The orchestrator answers with
 * ASP.NET problem details — `detail`/`title`, plus `errors` as either
 * `{ messages: [...] }` or per-field lists — and the REST API with `{ error }`.
 */
export function formatCivitaiError(status: number, text: string): string {
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  const parts: string[] = [];
  if (typeof body === 'string') parts.push(body);
  const errors = body?.errors;
  if (Array.isArray(errors?.messages)) {
    parts.push(...errors.messages.filter((m: unknown) => typeof m === 'string'));
  } else if (errors && typeof errors === 'object') {
    for (const [field, messages] of Object.entries<any>(errors)) {
      for (const message of Array.isArray(messages) ? messages : [messages]) {
        if (typeof message === 'string') parts.push(field ? `${field}: ${message}` : message);
      }
    }
  }
  if (parts.length === 0) {
    const detail = body?.detail || body?.error?.message || body?.error || body?.message || body?.title;
    if (typeof detail === 'string') parts.push(detail);
  }
  if (parts.length === 0) {
    const plain = text.trim();
    if (plain && !/^<(!doctype|html)/i.test(plain)) parts.push(plain);
  }

  const detail = parts.join('\n');
  if (status === 401) {
    return truncate(`Civitai rejected the API token (HTTP 401)${detail ? `: ${detail}` : ''} — check the token on the Civitai provider`);
  }
  if (status === 429) {
    return truncate(`Civitai is rate limiting requests (HTTP 429)${detail ? `: ${detail}` : ''}`);
  }
  return truncate(detail ? `${detail} (HTTP ${status})` : `Civitai returned HTTP ${status}`);
}

/** Civitai's edge images take a resize step in place of `original=true`. */
function previewSized(url: string): string {
  return url.replace(/\/original=true\//, '/width=450/');
}

/** A model version as the REST API describes it, reduced to what a project keeps. */
function resourceFromVersion(version: any, air?: string): CivitaiResource {
  const resolvedAir = air || (typeof version?.air === 'string' ? normalizeCivitaiAir(version.air) : null);
  if (!resolvedAir) throw new Error('Civitai did not report an AIR for this model version');

  // Only a safe-for-work example goes on the project's settings card.
  const preview = Array.isArray(version?.images)
    ? version.images.find((image: any) => typeof image?.url === 'string'
      && (image.type === undefined || image.type === 'image')
      && (typeof image.nsfwLevel !== 'number' || image.nsfwLevel <= 2))
    : undefined;

  const resource: CivitaiResource = { air: resolvedAir };
  if (typeof version?.model?.name === 'string') resource.name = version.model.name;
  if (typeof version?.name === 'string') resource.versionName = version.name;
  if (typeof version?.model?.type === 'string') resource.type = version.model.type;
  if (typeof version?.baseModel === 'string') resource.baseModel = version.baseModel;
  if (Array.isArray(version?.trainedWords)) {
    const words = version.trainedWords.filter((word: unknown) => typeof word === 'string' && word.trim());
    if (words.length > 0) resource.trainedWords = words;
  }
  if (preview) resource.previewUrl = previewSized(preview.url);
  return resource;
}

const URN_TYPE_TO_MODEL_TYPE: Record<string, string> = {
  checkpoint: 'Checkpoint',
  lora: 'LORA',
  lycoris: 'LoCon',
  dora: 'DoRA',
  embedding: 'TextualInversion',
  hypernet: 'Hypernetwork',
  vae: 'VAE',
};

export class CivitaiClient {
  private readonly orchestrationUrl: string;
  private readonly webUrl: string;

  constructor(private token: string, orchestrationUrl?: string | null) {
    this.orchestrationUrl = (orchestrationUrl || process.env.CIVITAI_ORCHESTRATION_URL || CIVITAI_ORCHESTRATION_URL).replace(/\/+$/, '');
    this.webUrl = (process.env.CIVITAI_WEB_URL || CIVITAI_WEB_URL).replace(/\/+$/, '');
  }

  private async request(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/json');
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) throw new CivitaiApiError(formatCivitaiError(res.status, text), res.status);
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Civitai returned a response that is not JSON (HTTP ${res.status})`);
    }
  }

  /** Start a workflow. Civitai answers right away with its id and status. */
  async submitWorkflow(body: Record<string, unknown>): Promise<CivitaiWorkflow> {
    return this.request(`${this.orchestrationUrl}/v2/consumer/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async getWorkflow(workflowId: string): Promise<CivitaiWorkflow> {
    return this.request(`${this.orchestrationUrl}/v2/consumer/workflows/${encodeURIComponent(workflowId)}`);
  }

  /** The orchestrator's record of a resource; it knows every AIR it can run. */
  async getResource(air: string): Promise<any> {
    return this.request(`${this.orchestrationUrl}/v2/resources/${encodeURIComponent(air)}`);
  }

  async getModelVersion(versionId: number): Promise<any> {
    return this.request(`${this.webUrl}/api/v1/model-versions/${versionId}`);
  }

  async getModel(modelId: number): Promise<any> {
    return this.request(`${this.webUrl}/api/v1/models/${modelId}`);
  }

  /**
   * Turn what a user pasted — a model page link or an AIR — into a resource.
   * A link without `modelVersionId` picks the model's newest version.
   */
  async resolveResource(input: string): Promise<CivitaiResource> {
    const air = normalizeCivitaiAir(input);
    if (air) {
      const parsed = parseCivitaiAir(air)!;
      if (parsed.source === 'civitai' && parsed.version && /^\d+$/.test(parsed.version)) {
        try {
          return resourceFromVersion(await this.getModelVersion(Number(parsed.version)), air);
        } catch (e) {
          // The REST API hides some versions the orchestrator still runs;
          // anything other than "not there" is worth reporting.
          if (!(e instanceof CivitaiApiError) || e.status !== 404) throw e;
        }
      }
      const info = await this.getResource(air);
      return {
        air,
        ...(typeof info?.resourceName === 'string' ? { name: info.resourceName } : {}),
        ...(typeof info?.versionName === 'string' ? { versionName: info.versionName } : {}),
        ...(URN_TYPE_TO_MODEL_TYPE[parsed.type] ? { type: URN_TYPE_TO_MODEL_TYPE[parsed.type] } : {}),
      };
    }

    const link = parseCivitaiModelUrl(input);
    if (!link) throw new Error('Paste a Civitai model link or an AIR (urn:air:…)');
    let versionId = link.versionId;
    if (versionId === undefined) {
      const model = await this.getModel(link.modelId!);
      versionId = Array.isArray(model?.modelVersions) ? model.modelVersions[0]?.id : undefined;
      if (typeof versionId !== 'number') throw new Error('This Civitai model has no published version');
    }
    return resourceFromVersion(await this.getModelVersion(versionId));
  }

  /** Fetch a finished image. Blob URLs are signed, so no token goes with them. */
  async download(url: string): Promise<Buffer> {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) throw new CivitaiApiError(`Downloading the image from Civitai failed (HTTP ${res.status})`, res.status);
    return Buffer.from(await res.arrayBuffer());
  }
}

const OUTPUT_FORMATS: Record<string, string> = { jpeg: 'jpeg', jpg: 'jpeg', webp: 'webP', png: 'png' };

/**
 * The workflow one job submits: a single text-to-image step producing one
 * image with the job's checkpoint, resources and parameters.
 */
export function buildCivitaiWorkflow(prompt: string, params: CivitaiGenerationConfig, format?: string): Record<string, unknown> {
  if (!params.model?.air) throw new Error('Choose a Civitai checkpoint for this project first');

  const additionalNetworks: Record<string, { strength?: number; triggerWord?: string }> = {};
  for (const resource of params.resources || []) {
    if (resource.air === params.model.air) continue;
    additionalNetworks[resource.air] = isCivitaiEmbedding(resource)
      ? (resource.trainedWords?.[0] ? { triggerWord: resource.trainedWords[0] } : {})
      : { strength: resource.strength ?? 1 };
  }

  const input: Record<string, unknown> = {
    model: params.model.air,
    prompt,
    quantity: 1,
    outputFormat: OUTPUT_FORMATS[format || 'png'] || 'png',
  };
  if (Object.keys(additionalNetworks).length > 0) input.additionalNetworks = additionalNetworks;
  if (params.negativePrompt) input.negativePrompt = params.negativePrompt;
  if (params.scheduler) input.scheduler = params.scheduler;
  if (params.steps !== undefined) input.steps = params.steps;
  if (params.cfgScale !== undefined) input.cfgScale = params.cfgScale;
  if (params.width !== undefined) input.width = params.width;
  if (params.height !== undefined) input.height = params.height;
  if (params.clipSkip !== undefined) input.clipSkip = params.clipSkip;
  if (params.seed !== undefined) input.seed = params.seed;

  return {
    steps: [{ $type: 'textToImage', name: 'image', input }],
    allowMatureContent: !!params.allowMatureContent,
    tags: ['remix-studio'],
  };
}

export const CIVITAI_PENDING_STATUSES: ReadonlySet<string> = new Set(['unassigned', 'preparing', 'scheduled', 'processing']);

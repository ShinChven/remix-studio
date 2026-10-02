import type { ComfyWorkflow } from '../../src/types';

/** A file ComfyUI reports in a prompt's history outputs. */
export interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyHistoryEntry {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: Array<[string, any]>;
  };
  outputs?: Record<string, Record<string, unknown>>;
}

/** Raised for a response ComfyUI returned; network failures surface as plain errors. */
export class ComfyApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ComfyApiError';
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 1500;

function truncate(text: string): string {
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text;
}

/**
 * Format the body ComfyUI sends when it rejects a prompt: a top-level error
 * plus per-node validation errors, e.g. a checkpoint that isn't installed.
 */
function formatPromptError(body: any, fallback: string): string {
  const parts: string[] = [];
  const error = body?.error;
  if (typeof error === 'string') parts.push(error);
  else if (error?.message) parts.push(error.details ? `${error.message}: ${error.details}` : error.message);

  const nodeErrors = body?.node_errors;
  if (nodeErrors && typeof nodeErrors === 'object') {
    for (const [nodeId, info] of Object.entries<any>(nodeErrors)) {
      for (const err of info?.errors || []) {
        const detail = err?.details ? ` (${err.details})` : '';
        parts.push(`#${nodeId} ${info?.class_type || ''}: ${err?.message || 'invalid'}${detail}`.replace(/\s+:/, ':'));
      }
    }
  }
  return truncate(parts.length > 0 ? parts.join('\n') : fallback);
}

/** Pull a readable error out of a failed prompt's history status messages. */
export function formatExecutionError(entry: ComfyHistoryEntry): string {
  for (const [type, data] of entry.status?.messages || []) {
    if (type === 'execution_error') {
      const where = data?.node_id ? `#${data.node_id} ${data.node_type || ''}`.trim() : 'ComfyUI';
      return truncate(`${where}: ${data?.exception_message || data?.exception_type || 'execution failed'}`.trim());
    }
    if (type === 'execution_interrupted') return 'The prompt was interrupted in ComfyUI';
  }
  return 'ComfyUI reported the prompt as failed';
}

function compareNodeIds(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Every file a finished prompt produced, saved outputs before temporary
 * previews, in node order.
 */
export function collectOutputFiles(entry: ComfyHistoryEntry): ComfyOutputFile[] {
  const files: ComfyOutputFile[] = [];
  const outputs = entry.outputs || {};
  for (const nodeId of Object.keys(outputs).sort(compareNodeIds)) {
    for (const value of Object.values(outputs[nodeId] || {})) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (item && typeof item === 'object' && typeof (item as any).filename === 'string') {
          files.push({
            filename: (item as any).filename,
            subfolder: typeof (item as any).subfolder === 'string' ? (item as any).subfolder : '',
            type: typeof (item as any).type === 'string' ? (item as any).type : 'output',
          });
        }
      }
    }
  }
  return [...files.filter((f) => f.type === 'output'), ...files.filter((f) => f.type !== 'output')];
}

/** Minimal client for the HTTP API a ComfyUI server exposes. */
export class ComfyClient {
  constructor(private baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    return fetch(this.url(path), { ...init, signal: AbortSignal.timeout(timeoutMs) });
  }

  private async json(path: string, init: RequestInit = {}): Promise<any> {
    const res = await this.request(path, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ComfyApiError(truncate(`ComfyUI ${path} returned HTTP ${res.status}${text ? `: ${text}` : ''}`), res.status);
    }
    return res.json();
  }

  /** Version and device info; doubles as the connection test. */
  async systemStats(): Promise<any> {
    return this.json('/system_stats');
  }

  /**
   * Put a file into ComfyUI's input folder and return the name a Load node
   * takes. `/upload/image` stores any file type, so videos and audio go through
   * it too.
   */
  async uploadFile(bytes: Buffer, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
    form.append('type', 'input');
    form.append('subfolder', 'remix-studio');
    form.append('overwrite', 'true');

    const res = await this.request('/upload/image', { method: 'POST', body: form }, TRANSFER_TIMEOUT_MS);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ComfyApiError(truncate(`ComfyUI upload failed with HTTP ${res.status}${text ? `: ${text}` : ''}`), res.status);
    }
    const body: any = await res.json();
    if (!body?.name) throw new Error('ComfyUI upload response did not include a file name');
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  /** Queue a prompt and return its prompt id. */
  async queuePrompt(prompt: ComfyWorkflow, clientId: string): Promise<string> {
    const res = await this.request('/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: clientId }),
    });
    const text = await res.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = undefined;
    }
    if (!res.ok) {
      throw new ComfyApiError(formatPromptError(body, `ComfyUI rejected the prompt (HTTP ${res.status})${text && !body ? `: ${text}` : ''}`), res.status);
    }
    if (body?.node_errors && Object.keys(body.node_errors).length > 0) {
      throw new ComfyApiError(formatPromptError(body, 'ComfyUI rejected the prompt'), res.status);
    }
    if (!body?.prompt_id) throw new Error('ComfyUI did not return a prompt id');
    return body.prompt_id;
  }

  /** The prompt's history entry, or null while it has not finished. */
  async getHistory(promptId: string): Promise<ComfyHistoryEntry | null> {
    const body = await this.json(`/history/${encodeURIComponent(promptId)}`);
    return body?.[promptId] ?? null;
  }

  /** Whether the prompt is running or waiting in ComfyUI's queue. */
  async isQueued(promptId: string): Promise<boolean> {
    const body = await this.json('/queue');
    const entries = [...(body?.queue_running || []), ...(body?.queue_pending || [])];
    return entries.some((entry: any) => Array.isArray(entry) && entry[1] === promptId);
  }

  /** Drop a prompt that has not started yet from ComfyUI's queue. */
  async deleteFromQueue(promptId: string): Promise<void> {
    await this.request('/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: [promptId] }),
    });
  }

  async view(file: ComfyOutputFile): Promise<{ bytes: Buffer; contentType: string }> {
    const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
    const res = await this.request(`/view?${params.toString()}`, {}, TRANSFER_TIMEOUT_MS);
    if (!res.ok) {
      throw new ComfyApiError(`Failed to download ${file.filename} from ComfyUI (HTTP ${res.status})`, res.status);
    }
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  }
}

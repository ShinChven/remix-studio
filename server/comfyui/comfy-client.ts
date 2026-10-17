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
// A download over a slow link — a rented GPU behind a proxy — can take many
// minutes for a large PNG, so it is given up when it stalls rather than after
// a fixed time, within a generous overall limit.
const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_ERROR_LENGTH = 1500;

/** Where uploads go in ComfyUI's input folder. */
export const COMFY_UPLOAD_SUBFOLDER = 'remix-studio';

function truncate(text: string): string {
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * What an error response adds to its message. A proxy in front of the
 * instance answers with an HTML page — Cloudflare's 524 when the instance took
 * longer than 100 s — which only clutters a job's error, so it is replaced by
 * what the status means.
 */
function httpErrorDetail(status: number, text: string): string {
  if (status === 524) {
    return ': the proxy in front of ComfyUI gave up after 100 s without an answer — the link to the instance is too slow for this transfer, or the instance is busy';
  }
  const body = text.trim();
  return !body || /^<(!doctype|html)/i.test(body) ? '' : `: ${body}`;
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

// The API token ComfyUI-Login prints at startup ("For direct API calls, use
// token=…"): the bcrypt hash its login/PASSWORD file holds.
const COMFY_LOGIN_TOKEN_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Session cookies from logging in with a ComfyUI-Login password, per instance
// and password, shared by every client so a batch logs in once.
const sessionCookies = new Map<string, string>();
const pendingLogins = new Map<string, Promise<void>>();

/**
 * Minimal client for the HTTP API a ComfyUI server exposes.
 *
 * `password` is optional and only for instances protected by ComfyUI-Login.
 * Its API token is sent as a Bearer header. A plain login password is used
 * the way the browser uses it: when ComfyUI answers 401, log in at `/login`
 * and send the session cookie it returns.
 */
export class ComfyClient {
  private readonly bearerToken?: string;
  private readonly loginPassword?: string;

  constructor(private baseUrl: string, password?: string | null) {
    if (password && COMFY_LOGIN_TOKEN_PATTERN.test(password)) this.bearerToken = password;
    else if (password) this.loginPassword = password;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private get sessionKey(): string {
    return `${this.baseUrl}\n${this.loginPassword}`;
  }

  private send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.bearerToken) headers.set('Authorization', `Bearer ${this.bearerToken}`);
    const cookie = this.loginPassword ? sessionCookies.get(this.sessionKey) : undefined;
    if (cookie) headers.set('Cookie', cookie);
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(this.url(path), { ...init, headers, signal });
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    let res = await this.send(path, init, timeoutMs);
    if (res.status === 401 && this.loginPassword) {
      // No session yet, or it expired (ComfyUI-Login rotates its key monthly).
      sessionCookies.delete(this.sessionKey);
      await this.login();
      res = await this.send(path, init, timeoutMs);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ComfyApiError(this.bearerToken || this.loginPassword
        ? `ComfyUI rejected the access password (HTTP ${res.status})`
        : `ComfyUI requires an access password (HTTP ${res.status}) — set it on the project`, res.status);
    }
    return res;
  }

  private login(): Promise<void> {
    const key = this.sessionKey;
    let pending = pendingLogins.get(key);
    if (!pending) {
      pending = this.performLogin().finally(() => pendingLogins.delete(key));
      pendingLogins.set(key, pending);
    }
    return pending;
  }

  private async performLogin(): Promise<void> {
    // Posting to /login on an instance without a password would create one.
    // Leave that to the browser, where the user picks it deliberately.
    const page = await fetch(this.url('/login'), {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const html = await page.text().catch(() => '');
    if (/For your first login|Please also set a username/.test(html)) {
      throw new ComfyApiError('ComfyUI-Login has no password set up yet — log in once in the browser to create it, then retry', 401);
    }

    const res = await fetch(this.url('/login'), {
      method: 'POST',
      body: new URLSearchParams({ password: this.loginPassword! }),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if ((res.headers.get('location') || '').includes('wrong_password')) {
      throw new ComfyApiError('Wrong ComfyUI access password', 401);
    }
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).filter(Boolean).join('; ');
    if (!cookie) {
      throw new ComfyApiError(`ComfyUI login failed (HTTP ${res.status})`, res.status || 401);
    }
    sessionCookies.set(this.sessionKey, cookie);
  }

  private async json(path: string, init: RequestInit = {}): Promise<any> {
    const res = await this.request(path, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ComfyApiError(truncate(`ComfyUI ${path} returned HTTP ${res.status}${httpErrorDetail(res.status, text)}`), res.status);
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
    form.append('subfolder', COMFY_UPLOAD_SUBFOLDER);
    form.append('overwrite', 'true');

    const res = await this.request('/upload/image', { method: 'POST', body: form }, TRANSFER_TIMEOUT_MS);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ComfyApiError(truncate(`ComfyUI upload of ${megabytes(bytes.length)} failed with HTTP ${res.status}${httpErrorDetail(res.status, text)}`), res.status);
    }
    const body: any = await res.json();
    if (!body?.name) throw new Error('ComfyUI upload response did not include a file name');
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  /**
   * Whether ComfyUI's input folder already holds a file, given the name a Load
   * node takes (`subfolder/name`). Asks with HEAD, so nothing is downloaded.
   */
  async hasInputFile(name: string): Promise<boolean> {
    const slash = name.lastIndexOf('/');
    const params = new URLSearchParams({
      filename: name.slice(slash + 1),
      subfolder: slash >= 0 ? name.slice(0, slash) : '',
      type: 'input',
    });
    const res = await this.request(`/view?${params.toString()}`, { method: 'HEAD' });
    return res.ok;
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
      throw new ComfyApiError(formatPromptError(body, `ComfyUI rejected the prompt (HTTP ${res.status})${body ? '' : httpErrorDetail(res.status, text)}`), res.status);
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

  /**
   * Download an output file. It is abandoned when no data has arrived for a
   * minute, however long it has been running; see DOWNLOAD_STALL_TIMEOUT_MS.
   */
  async view(file: ComfyOutputFile): Promise<{ bytes: Buffer; contentType: string }> {
    const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
    const stalled = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const waitForData = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stalled.abort(), DOWNLOAD_STALL_TIMEOUT_MS);
    };
    let received = 0;
    waitForData();
    try {
      const res = await this.request(`/view?${params.toString()}`, { signal: stalled.signal }, DOWNLOAD_TIMEOUT_MS);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ComfyApiError(`Failed to download ${file.filename} from ComfyUI (HTTP ${res.status})${httpErrorDetail(res.status, text)}`, res.status);
      }
      const chunks: Uint8Array[] = [];
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          waitForData();
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
        }
      }
      return {
        bytes: Buffer.concat(chunks),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      };
    } catch (e: any) {
      if (stalled.signal.aborted) {
        throw new Error(`Downloading ${file.filename} from ComfyUI stalled: nothing arrived for ${DOWNLOAD_STALL_TIMEOUT_MS / 1000} s, after ${megabytes(received)}`);
      }
      if (e?.name === 'TimeoutError') {
        throw new Error(`Downloading ${file.filename} from ComfyUI took longer than ${DOWNLOAD_TIMEOUT_MS / 60_000} minutes (${megabytes(received)} received)`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

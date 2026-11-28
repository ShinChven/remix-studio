export interface GoogleInteractionContent {
  type: string;
  text?: string;
  data?: string;
  mime_type?: string;
}

interface GoogleInteraction {
  id?: string;
  status?: string;
  steps?: { type: string; content?: GoogleInteractionContent[] }[];
  error?: { message?: string };
}

export class GoogleInteractionsClient {
  private readonly url: string;

  constructor(private readonly apiKey: string, base: string) {
    const url = new URL(base);
    const path = url.pathname.replace(/\/v1beta(?:\/.*)?$/, '').replace(/\/+$/, '');
    this.url = `${url.origin}${path}/v1beta/interactions`;
  }

  async create(payload: Record<string, unknown>): Promise<GoogleInteraction> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, background: true, store: true }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  }

  async check(id: string): Promise<
    | { status: 'processing' }
    | { status: 'failed'; error: string }
    | { status: 'completed'; content: GoogleInteractionContent[] }
  > {
    try {
      const response = await fetch(`${this.url}/${encodeURIComponent(id)}`, {
        headers: { 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 404) return { status: 'failed', error: 'Google interaction not found' };
      if (!response.ok) return { status: 'processing' };
      const result: GoogleInteraction = await response.json();
      if (result.error || ['failed', 'cancelled', 'incomplete', 'requires_action'].includes(result.status || '')) {
        return { status: 'failed', error: result.error?.message || `Google interaction ${result.status}` };
      }
      if (result.status !== 'completed') return { status: 'processing' };
      const content = (result.steps || []).filter((step) => step.type === 'model_output').flatMap((step) => step.content || []);
      return { status: 'completed', content };
    } catch {
      return { status: 'processing' };
    }
  }
}

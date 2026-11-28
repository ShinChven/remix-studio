import { JWT } from 'google-auth-library';

export function vertexProjectRoot(apiUrl?: string | null): string | undefined {
  if (!apiUrl) return undefined;
  const url = new URL(apiUrl);
  const path = url.pathname.match(/^\/(v1(?:beta1)?\/projects\/[^/]+\/locations\/[^/]+)(?:\/|$)/);
  return path ? `${url.origin}/${path[1]}` : undefined;
}

/** Project-scoped Google Cloud requests use the credential from the selected provider. */
export class VertexProjectClient {
  private readonly auth?: JWT;

  constructor(private readonly credential: string, readonly root: string) {
    if (!credential.trim().startsWith('{')) return;
    let credentials: { client_email?: string; private_key?: string; type?: string };
    try {
      credentials = JSON.parse(credential);
    } catch {
      throw new Error('Invalid Vertex AI service account JSON');
    }
    const { client_email, private_key, type } = credentials || {};
    if (type !== 'service_account' || typeof client_email !== 'string' || typeof private_key !== 'string') {
      throw new Error('Vertex AI requires a Google Cloud service account or OAuth access token');
    }
    this.auth = new JWT({ email: client_email, key: private_key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }

  modelUrl(model: string, method: string): string {
    return `${this.root}/publishers/google/models/${encodeURIComponent(model)}:${method}`;
  }

  async post(url: string, payload: unknown, timeout = 60_000): Promise<Response> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = this.auth ? (await this.auth.getAccessToken()).token : this.credential;
    if (!token) throw new Error('Missing Vertex AI access token');
    if (token.startsWith('AIza')) {
      headers.set('x-goog-api-key', token);
    } else {
      headers.set('Authorization', `Bearer ${token.replace(/^Bearer\s+/i, '')}`);
    }
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
  }
}

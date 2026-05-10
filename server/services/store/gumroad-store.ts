import { IStore, StoreProfile, StoreTokenSet } from './index';
import { randomUUID } from 'crypto';

const GUMROAD_AUTH_URL = 'https://gumroad.com/oauth/authorize';
const GUMROAD_TOKEN_URL = 'https://api.gumroad.com/oauth/token';
const GUMROAD_REVOKE_URL = 'https://api.gumroad.com/oauth/revoke';
const GUMROAD_USER_URL = 'https://api.gumroad.com/v2/user';
const GUMROAD_API_BASE = 'https://api.gumroad.com/v2';

// Gumroad's multipart upload uses 100 MB parts (per their docs).
const GUMROAD_PART_SIZE = 100 * 1024 * 1024;

export interface GumroadCreateProductInput {
  name: string;
  priceCents: number;
  currency?: string;
  description?: string | null;
  tags?: string[];
  taxonomyId?: string | null;
  fileUrl: string;
}

export interface GumroadCreatedProduct {
  id: string;
  name: string;
  price: number;
  short_url?: string | null;
}

export interface PresignedPart {
  partNumber: number;
  presignedUrl: string;
}

export interface PresignResult {
  uploadId: string;
  key: string;
  fileUrl: string;
  parts: PresignedPart[];
}

export class GumroadStore implements IStore {
  platformName = 'gumroad';
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scope: string;

  constructor() {
    this.clientId = process.env.GUMROAD_CLIENT_ID!;
    this.clientSecret = process.env.GUMROAD_CLIENT_SECRET!;
    this.redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/stores/gumroad/callback`;
    this.scope = process.env.GUMROAD_SCOPE || 'edit_products view_profile view_sales';
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      response_type: 'code',
      state,
    });
    return `${GUMROAD_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<StoreTokenSet> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
      grant_type: 'authorization_code',
    });

    const response = await fetch(GUMROAD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange Gumroad code: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Gumroad token response missing access_token');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scopes: typeof data.scope === 'string' ? data.scope.split(' ') : undefined,
    };
  }

  async fetchProfile(accessToken: string): Promise<StoreProfile> {
    const response = await fetch(GUMROAD_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Gumroad profile: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const user = data?.user ?? {};
    return {
      accountId: String(user.id ?? user.user_id ?? ''),
      profileName: user.name || user.display_name || user.url,
      email: user.email,
      avatarUrl: user.profile_url || user.avatar_url || undefined,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    const params = new URLSearchParams({ access_token: accessToken });
    const response = await fetch(`${GUMROAD_REVOKE_URL}?${params.toString()}`, {
      method: 'PUT',
    });
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Failed to revoke Gumroad token: ${response.status} ${errorText}`);
    }
  }

  // ─── Product publish flow ────────────────────────────────────────────────

  static get partSize() {
    return GUMROAD_PART_SIZE;
  }

  async presignUpload(accessToken: string, filename: string, fileSize: number): Promise<PresignResult> {
    const body = new URLSearchParams({
      access_token: accessToken,
      filename,
      file_size: String(fileSize),
    });
    const res = await fetch(`${GUMROAD_API_BASE}/files/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Gumroad presign failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error(`Gumroad presign returned success=false: ${JSON.stringify(data)}`);
    }
    return {
      uploadId: data.upload_id,
      key: data.key,
      fileUrl: data.file_url,
      parts: (data.parts ?? []).map((p: any) => ({ partNumber: p.part_number, presignedUrl: p.presigned_url })),
    };
  }

  async uploadPart(presignedUrl: string, body: Buffer): Promise<string> {
    // IMPORTANT: convert Buffer → Uint8Array. Passing a Buffer directly to undici-based
    // fetch can serialize wrong (empty body, wrong length) — S3 still 200s the upload,
    // returns an ETag for an empty part, and the resulting file ends up zero bytes.
    const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    const res = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(bytes.length),
      },
      body: bytes as any,
    });
    if (!res.ok) {
      throw new Error(`Gumroad part upload failed: ${res.status} ${await res.text()}`);
    }
    const etag = res.headers.get('etag') || res.headers.get('ETag');
    if (!etag) {
      throw new Error('Gumroad part upload returned no ETag');
    }
    return etag;
  }

  async completeUpload(
    accessToken: string,
    uploadId: string,
    key: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<string> {
    const body = new URLSearchParams();
    body.append('access_token', accessToken);
    body.append('upload_id', uploadId);
    body.append('key', key);
    for (const p of parts) {
      body.append('parts[][part_number]', String(p.partNumber));
      body.append('parts[][etag]', p.etag);
    }
    const res = await fetch(`${GUMROAD_API_BASE}/files/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Gumroad complete failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.success || !data.file_url) {
      throw new Error(`Gumroad complete returned no file_url: ${JSON.stringify(data)}`);
    }
    return data.file_url as string;
  }

  async abortUpload(accessToken: string, uploadId: string, key: string): Promise<void> {
    const body = new URLSearchParams({ access_token: accessToken, upload_id: uploadId, key });
    // Loop while status === 'accepted' (per docs).
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${GUMROAD_API_BASE}/files/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        // Best-effort cancel — log via throw so caller can swallow it.
        throw new Error(`Gumroad abort failed: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      if (data.status === 'already_gone') return;
      // Wait briefly before retrying
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async createProduct(accessToken: string, input: GumroadCreateProductInput): Promise<GumroadCreatedProduct & { files?: any[] }> {
    const fileId = `cli-upload-${randomUUID()}`;
    const embedUid = randomUUID();

    const payload: any = {
      access_token: accessToken,
      native_type: 'digital',
      name: input.name,
      price: input.priceCents,
      price_currency_type: input.currency ?? 'usd',
      files: [
        {
          id: fileId,
          url: input.fileUrl,
        },
      ],
      rich_content: [
        {
          title: 'Page 1',
          description: {
            type: 'doc',
            content: [
              {
                type: 'fileEmbed',
                attrs: {
                  id: fileId,
                  uid: embedUid,
                  collapsed: false,
                },
              },
              {
                type: 'paragraph',
              },
            ],
          },
        },
      ],
    };

    if (input.description) payload.description = input.description;
    if (input.taxonomyId) payload.taxonomy_id = input.taxonomyId;
    if (input.tags?.length) payload.tags = input.tags;

    const res = await fetch(`${GUMROAD_API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Gumroad create product failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.success || !data.product?.id) {
      throw new Error(`Gumroad create product returned no id: ${JSON.stringify(data)}`);
    }
    return data.product;
  }

  async getProduct(accessToken: string, productId: string): Promise<any> {
    const params = new URLSearchParams({ access_token: accessToken });
    const res = await fetch(`${GUMROAD_API_BASE}/products/${encodeURIComponent(productId)}?${params.toString()}`, {
      method: 'GET',
    });
    if (!res.ok) {
      throw new Error(`Gumroad get product failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data?.product;
  }

  async addCover(accessToken: string, productId: string, coverUrl: string): Promise<void> {
    const body = new URLSearchParams({
      access_token: accessToken,
      url: coverUrl,
    });
    const res = await fetch(`${GUMROAD_API_BASE}/products/${encodeURIComponent(productId)}/covers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Gumroad add cover failed: ${res.status} ${await res.text()}`);
    }
  }

  async enableProduct(accessToken: string, productId: string): Promise<{ short_url?: string | null }> {
    const body = new URLSearchParams({ access_token: accessToken });
    const res = await fetch(`${GUMROAD_API_BASE}/products/${encodeURIComponent(productId)}/enable`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Gumroad enable product failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return { short_url: data?.product?.short_url ?? null };
  }
}

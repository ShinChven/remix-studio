import type { Readable } from 'node:stream';
import { chunkReadable, toFetchBody } from '../../utils/stream-chunks';
import {
  DriveAuthError,
  type DriveConnectResult,
  type DriveSession,
  type DriveUploadInput,
  type DriveUploadResult,
  type IDriveProvider,
} from './index';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access User.Read Files.ReadWrite';

// Microsoft Graph requires every chunk except the last to be a multiple of
// 320 KiB. 25 × 320 KiB ≈ 7.8 MB.
const UPLOAD_CHUNK_SIZE = 320 * 1024 * 25;

export const ONEDRIVE_CALLBACK_PATH = '/api/releases/drives/onedrive/callback';

function tenant(): string {
  return process.env.MICROSOFT_TENANT_ID || 'common';
}

export function oneDriveRedirectUri(): string {
  const base = process.env.MICROSOFT_REDIRECT_URI;
  if (base) return base;
  const url = new URL(process.env.APP_URL || 'http://localhost:3000');
  url.pathname = ONEDRIVE_CALLBACK_PATH;
  url.search = '';
  return url.toString();
}

/** Graph reports progress as the ranges it still wants, e.g. ["8192000-104857599"]. */
function nextExpectedStart(ranges: unknown): number | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return null;
  const first = String(ranges[0]);
  const start = Number(first.split('-')[0]);
  return Number.isFinite(start) ? start : null;
}

export class OneDriveProvider implements IDriveProvider {
  readonly provider = 'onedrive' as const;
  readonly label = 'OneDrive';
  readonly authKind = 'oauth' as const;

  isConfigured(): boolean {
    return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }

  private credentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be configured to connect OneDrive.');
    }
    return { clientId, clientSecret };
  }

  getAuthUrl(state: string): string {
    const { clientId } = this.credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: oneDriveRedirectUri(),
      response_mode: 'query',
      scope: SCOPE,
      state,
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  private async requestToken(body: Record<string, string>) {
    const { clientId, clientSecret } = this.credentials();
    const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: oneDriveRedirectUri(),
        scope: SCOPE,
        ...body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 400 || res.status === 401) {
        console.error('[OneDrive] Token request rejected:', errText);
        throw new DriveAuthError('OneDrive authorization expired. Please reconnect it on the Releases page.');
      }
      throw new Error(`OneDrive token request failed: ${res.status} ${errText}`);
    }

    return (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
  }

  async exchangeCode(code: string): Promise<DriveConnectResult> {
    const data = await this.requestToken({ code, grant_type: 'authorization_code' });
    const profile = await this.fetchProfile(data.access_token);
    return {
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scopes: data.scope ? data.scope.split(' ') : undefined,
      },
      profile,
    };
  }

  private async fetchProfile(accessToken: string) {
    const res = await fetch(`${GRAPH_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      throw new Error(`Failed to read OneDrive profile: ${res.status} ${await res.text()}`);
    }
    const me = (await res.json()) as {
      id?: string;
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
    };
    const email = me.mail || me.userPrincipalName;
    if (!me.id && !email) throw new Error('Could not determine the OneDrive account id');
    return {
      accountId: me.id || email!,
      displayName: me.displayName || email,
      email: email ?? undefined,
    };
  }

  async upload(session: DriveSession, input: DriveUploadInput): Promise<DriveUploadResult> {
    if (!session.refreshToken) {
      throw new DriveAuthError('This OneDrive connection has no refresh token. Please reconnect it.');
    }

    // Microsoft rotates the refresh token on every exchange, so hand the new one
    // back to the caller before spending time on the upload itself.
    const refreshed = await this.requestToken({
      refresh_token: session.refreshToken,
      grant_type: 'refresh_token',
    });
    await input.onTokenRefresh?.({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? session.refreshToken,
      expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : undefined,
      scopes: refreshed.scope ? refreshed.scope.split(' ') : undefined,
    });
    const accessToken = refreshed.access_token;

    const encodedName = encodeURIComponent(input.fileName);
    const target = session.folderId
      ? `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(session.folderId)}:/${encodedName}:/createUploadSession`
      : `${GRAPH_BASE}/me/drive/root:/${encodedName}:/createUploadSession`;

    const sessionRes = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: { '@microsoft.graph.conflictBehavior': 'rename', name: input.fileName },
      }),
    });
    if (!sessionRes.ok) {
      throw new Error(`OneDrive upload session failed: ${sessionRes.status} ${await sessionRes.text()}`);
    }
    const { uploadUrl } = (await sessionRes.json()) as { uploadUrl?: string };
    if (!uploadUrl) throw new Error('OneDrive did not return an upload URL');

    const stream: Readable = await input.openStream();
    let bytesTransferred = 0;
    let completed: { id?: string; webUrl?: string } | null = null;

    try {
      for await (const chunk of chunkReadable(stream, UPLOAD_CHUNK_SIZE)) {
        const rangeStart = bytesTransferred;
        const rangeEnd = rangeStart + chunk.length - 1;
        // The upload URL is pre-authorized; sending the bearer token with it is
        // rejected by Graph.
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${input.totalBytes}`,
          },
          body: toFetchBody(chunk) as any,
        });

        if (!response.ok) {
          throw new Error(`OneDrive upload failed (${response.status}): ${await response.text()}`);
        }

        if (response.status === 202) {
          const body = (await response.json()) as { nextExpectedRanges?: unknown };
          const expected = nextExpectedStart(body.nextExpectedRanges);
          if (expected != null && expected !== rangeEnd + 1) {
            throw new Error(`OneDrive expects to resume at ${expected}, but ${rangeEnd + 1} bytes were sent`);
          }
          bytesTransferred = rangeEnd + 1;
          await input.onProgress(bytesTransferred);
          continue;
        }

        bytesTransferred = rangeEnd + 1;
        await input.onProgress(bytesTransferred);
        completed = (await response.json()) as { id?: string; webUrl?: string };
        break;
      }
    } finally {
      stream.destroy();
    }

    if (bytesTransferred !== input.totalBytes) {
      throw new Error(`OneDrive upload ended early at ${bytesTransferred} of ${input.totalBytes} bytes`);
    }
    if (!completed?.id) {
      throw new Error('OneDrive upload did not return a completed file');
    }

    return { fileId: completed.id, url: completed.webUrl ?? null };
  }
}

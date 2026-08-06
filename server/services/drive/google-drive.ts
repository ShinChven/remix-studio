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

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';

const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Kept on the historical path so Google Cloud console redirect URIs registered
 * before drives became multi-connection keep working.
 */
export const GOOGLE_DRIVE_CALLBACK_PATH = '/api/auth/google-drive/callback';

export function googleDriveRedirectUri(): string {
  const base = process.env.GOOGLE_REDIRECT_URI || process.env.APP_URL || 'http://localhost:3000';
  const url = new URL(base);
  url.pathname = GOOGLE_DRIVE_CALLBACK_PATH;
  url.search = '';
  return url.toString();
}

function ackedBytes(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = /^bytes=0-(\d+)$/.exec(rangeHeader.trim());
  if (!match) return null;
  return Number(match[1]) + 1;
}

export class GoogleDriveProvider implements IDriveProvider {
  readonly provider = 'google-drive' as const;
  readonly label = 'Google Drive';
  readonly authKind = 'oauth' as const;

  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  private credentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured to connect Google Drive.');
    }
    return { clientId, clientSecret };
  }

  getAuthUrl(state: string): string {
    const { clientId } = this.credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleDriveRedirectUri(),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      state,
      prompt: 'consent',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<DriveConnectResult> {
    const { clientId, clientSecret } = this.credentials();
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleDriveRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!data.refresh_token) {
      throw new Error('Google did not return a refresh token. Revoke the app under your Google account and try again.');
    }

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

  private async fetchProfile(accessToken?: string) {
    if (!accessToken) return { accountId: `google-drive:${Date.now()}` };
    try {
      const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return { accountId: `google-drive:${Date.now()}` };
      const info = (await res.json()) as { sub?: string; name?: string; email?: string; picture?: string };
      return {
        accountId: info.sub || info.email || `google-drive:${Date.now()}`,
        displayName: info.name || info.email,
        email: info.email,
        avatarUrl: info.picture,
      };
    } catch {
      return { accountId: `google-drive:${Date.now()}` };
    }
  }

  /** Exchange the stored refresh token for a short-lived access token. */
  private async accessToken(session: DriveSession): Promise<string> {
    if (!session.refreshToken) {
      throw new DriveAuthError('This Google Drive connection has no refresh token. Please reconnect it.');
    }
    const { clientId, clientSecret } = this.credentials();
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: session.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[GoogleDrive] Token refresh failed:', errText);
      if (res.status === 400 || res.status === 401) {
        throw new DriveAuthError('Google Drive authorization expired. Please reconnect it on the Releases page.');
      }
      throw new Error(`Google Drive token refresh failed: ${res.status}`);
    }

    const { access_token } = (await res.json()) as { access_token: string };
    return access_token;
  }

  async upload(session: DriveSession, input: DriveUploadInput): Promise<DriveUploadResult> {
    const accessToken = await this.accessToken(session);

    const metadata: Record<string, unknown> = { name: input.fileName, mimeType: 'application/zip' };
    if (session.folderId) metadata.parents = [session.folderId];

    const initRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/zip',
        'X-Upload-Content-Length': String(input.totalBytes),
      },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) {
      throw new Error(`Drive resumable init failed: ${await initRes.text()}`);
    }

    const resumableUri = initRes.headers.get('Location');
    if (!resumableUri) throw new Error('No resumable URI returned from Drive');

    const stream: Readable = await input.openStream();
    let bytesTransferred = 0;
    let finalResponse: Response | null = null;

    try {
      for await (const chunk of chunkReadable(stream, UPLOAD_CHUNK_SIZE)) {
        const rangeStart = bytesTransferred;
        const rangeEnd = rangeStart + chunk.length - 1;
        const response = await fetch(resumableUri, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/zip',
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${input.totalBytes}`,
          },
          body: toFetchBody(chunk) as any,
        });

        if (response.status !== 308 && !response.ok) {
          throw new Error(`Drive upload failed (${response.status}): ${await response.text()}`);
        }

        if (response.status === 308) {
          const acked = ackedBytes(response.headers.get('Range'));
          if (acked == null) throw new Error('Drive did not acknowledge the uploaded chunk');
          if (acked !== rangeEnd + 1) {
            throw new Error(`Drive acknowledged ${acked} bytes, expected ${rangeEnd + 1}`);
          }
          bytesTransferred = acked;
        } else {
          bytesTransferred = rangeEnd + 1;
        }

        await input.onProgress(bytesTransferred);

        if (response.status !== 308) {
          finalResponse = response;
          break;
        }
      }
    } finally {
      stream.destroy();
    }

    if (bytesTransferred !== input.totalBytes) {
      throw new Error(`Drive upload ended early at ${bytesTransferred} of ${input.totalBytes} bytes`);
    }
    if (!finalResponse) {
      throw new Error('Drive upload did not return a completion response');
    }

    const file = (await finalResponse.json()) as { id: string };
    return { fileId: file.id, url: `https://drive.google.com/file/d/${file.id}/view` };
  }
}

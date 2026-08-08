import type { Readable } from 'node:stream';
import { GoogleDriveProvider } from './google-drive';
import { OneDriveProvider } from './onedrive';

/** Providers a finished export can be released to as a plain file. */
export const DRIVE_PROVIDERS = ['google-drive', 'onedrive'] as const;
export type DriveProviderId = (typeof DRIVE_PROVIDERS)[number];

export function isDriveProviderId(value: string): value is DriveProviderId {
  return (DRIVE_PROVIDERS as readonly string[]).includes(value);
}

export interface DriveTokenSet {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export interface DriveProfile {
  accountId: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface DriveConnectResult {
  tokens: DriveTokenSet;
  profile: DriveProfile;
}

/** Decrypted secrets of a stored connection, handed to a provider at upload time. */
export interface DriveSession {
  accessToken?: string;
  refreshToken?: string;
  folderId?: string | null;
}

export interface DriveUploadInput {
  fileName: string;
  totalBytes: number;
  /** Opens the archive stream. Called once, and the provider consumes it fully. */
  openStream: () => Promise<Readable>;
  onProgress: (bytesTransferred: number) => Promise<void> | void;
  /**
   * Called when a provider rotates its stored secrets mid-upload (Microsoft
   * hands out a fresh refresh token on every exchange), so the connection can
   * be updated instead of going stale after one upload.
   */
  onTokenRefresh?: (tokens: DriveTokenSet) => Promise<void> | void;
}

export interface DriveUploadResult {
  fileId: string;
  url: string | null;
}

/**
 * Thrown when a connection's stored authorization no longer works. The caller
 * marks the connection expired so the UI can prompt for a reconnect instead of
 * silently retrying a dead token.
 */
export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export interface IDriveProvider {
  readonly provider: DriveProviderId;
  readonly label: string;
  /** False when the server is missing the env vars this provider needs. */
  isConfigured(): boolean;

  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<DriveConnectResult>;

  upload(session: DriveSession, input: DriveUploadInput): Promise<DriveUploadResult>;
}

const registry: Record<DriveProviderId, () => IDriveProvider> = {
  'google-drive': () => new GoogleDriveProvider(),
  onedrive: () => new OneDriveProvider(),
};

export class DriveFactory {
  static getProvider(provider: string): IDriveProvider {
    if (!isDriveProviderId(provider)) {
      throw new Error(`Unsupported drive provider: ${provider}`);
    }
    return registry[provider]();
  }

  /** Every provider, whether or not this server has it configured. */
  static list(): IDriveProvider[] {
    return DRIVE_PROVIDERS.map((id) => registry[id]());
  }
}

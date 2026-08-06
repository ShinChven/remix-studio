import type { Readable, Writable } from 'node:stream';
import {
  DriveAuthError,
  type DriveConnectResult,
  type DriveSession,
  type DriveUploadInput,
  type DriveUploadResult,
  type IDriveProvider,
} from './index';

/**
 * MEGA has no OAuth: an account is connected with its email + password (plus a
 * 2FA code when the account has it enabled). The credentials are stored
 * encrypted because MEGA's key derivation needs the password on every login.
 *
 * `megajs` is imported lazily so a server that never touches MEGA doesn't pay
 * for loading it, and so the dependency stays external to the server bundle.
 */
async function loadMega() {
  const mod = await import('megajs');
  return mod;
}

type MegaCredentials = { email: string; password: string; secondFactorCode?: string };

/** The subset of megajs' MutableFile this provider touches. */
type MegaFile = {
  nodeId?: string;
  name: string | null;
  link: (options: Record<string, unknown>) => Promise<string>;
};

function readCredentials(source: Record<string, string> | undefined): MegaCredentials {
  const email = source?.email?.trim();
  const password = source?.password;
  if (!email || !password) {
    throw new DriveAuthError('This MEGA connection is missing its stored credentials. Please reconnect it.');
  }
  return { email, password, secondFactorCode: source?.secondFactorCode || undefined };
}

/**
 * MEGA reports a bad email, a bad password, a blocked account, and a missing
 * 2FA code as API error codes rather than status codes.
 */
function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ENOENT|EARGS|EBLOCKED|EMFAREQUIRED|EFAILED|multi.?factor|two.?factor|wrong password|login/i.test(
    message,
  );
}

export class MegaProvider implements IDriveProvider {
  readonly provider = 'mega' as const;
  readonly label = 'MEGA';
  readonly authKind = 'credentials' as const;

  /** MEGA needs no server-side app registration. */
  isConfigured(): boolean {
    return true;
  }

  private async login(credentials: MegaCredentials) {
    const { Storage } = await loadMega();
    const storage = new Storage({
      email: credentials.email,
      password: credentials.password,
      ...(credentials.secondFactorCode ? { secondFactorCode: credentials.secondFactorCode } : {}),
      autoload: true,
      autologin: true,
      keepalive: false,
    });
    try {
      await storage.ready;
    } catch (error) {
      if (isAuthFailure(error)) {
        throw new DriveAuthError(
          `MEGA sign-in failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    }
    return storage;
  }

  async connectWithCredentials(input: Record<string, string>): Promise<DriveConnectResult> {
    // A 2FA code is single-use, so it is only used to prove the login here and
    // deliberately not stored — MEGA does not require it on later logins from
    // the same session key material.
    const credentials = readCredentials(input);
    const storage = await this.login(credentials);
    try {
      const email = storage.email || credentials.email;
      return {
        tokens: {
          credentials: { email: credentials.email, password: credentials.password },
        },
        profile: {
          accountId: storage.user || email,
          displayName: storage.name || email,
          email,
        },
      };
    } finally {
      await storage.close().catch(() => {});
    }
  }

  async upload(session: DriveSession, input: DriveUploadInput): Promise<DriveUploadResult> {
    const storage = await this.login(readCredentials(session.credentials));

    try {
      const target = session.folderId ? storage.files[session.folderId] : storage.root;
      if (!target) {
        throw new Error('The configured MEGA folder no longer exists');
      }

      const uploadStream = target.upload({
        name: input.fileName,
        size: input.totalBytes,
      }) as Writable;

      // megajs only settles its own `complete` promise while the stream has no
      // 'error' listener — and piping into it installs one — so the outcome is
      // taken from the events directly instead.
      const completed = new Promise<MegaFile>((resolve, reject) => {
        uploadStream.once('complete', (file: MegaFile) => resolve(file));
        uploadStream.once('error', reject);
      });

      uploadStream.on('progress', (progress: { bytesUploaded?: number }) => {
        if (typeof progress?.bytesUploaded === 'number') {
          void input.onProgress(Math.min(progress.bytesUploaded, input.totalBytes));
        }
      });

      const source: Readable = await input.openStream();
      source.on('error', (err) => uploadStream.destroy(err));
      source.pipe(uploadStream);

      let file: MegaFile;
      try {
        file = await completed;
      } finally {
        source.destroy();
      }
      await input.onProgress(input.totalBytes);

      // A share link is what makes the release usable elsewhere; if the account
      // can't create one the upload still counts as delivered.
      const url = await file.link({}).catch(() => null);
      return { fileId: file.nodeId || String(file.name ?? input.fileName), url };
    } finally {
      await storage.close().catch(() => {});
    }
  }
}

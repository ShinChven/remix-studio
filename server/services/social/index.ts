import { TwitterChannel } from './twitter-channel';
import { ThreadsChannel } from './threads-channel';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  /** OAuth scopes granted by the provider, when reported. */
  scopes?: string[];
}

/** Normalized social profile, provider-neutral. */
export interface SocialProfile {
  accountId: string;
  profileName: string;
  avatarUrl?: string;
  username?: string;
}

/**
 * Provider-neutral media payload passed to publish().
 *
 * Some providers (X) consume the raw `buffer`; others (Threads) require a
 * publicly reachable `publicUrl` that the platform will fetch server-side.
 * `PostManager` populates whichever fields a given channel needs.
 */
export interface PreparedSocialMedia {
  type: 'image' | 'video' | 'gif';
  mimeType: string;
  buffer?: Buffer;
  publicUrl?: string;
  storageKey?: string;
  altText?: string;
}

/** Structured result of a publish, provider-neutral. */
export interface PublishResult {
  externalId: string;
  externalUrl?: string;
}

export interface ISocialChannel {
  platformName: string;
  getAuthUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  /** Look up the connected account's profile from an access token. */
  getProfile(accessToken: string): Promise<SocialProfile>;
  publish(text: string, media: PreparedSocialMedia[], tokens: TokenSet): Promise<PublishResult>;
}

export class SocialChannelFactory {
  static getChannel(platform: string): ISocialChannel {
    switch (platform) {
      case 'twitter':
        // Validation logic for X
        if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
          throw new Error('X_CLIENT_ID and X_CLIENT_SECRET must be configured to use the X channel.');
        }
        return new TwitterChannel();
      case 'threads':
        if (!process.env.THREADS_APP_ID || !process.env.THREADS_APP_SECRET) {
          throw new Error('THREADS_APP_ID and THREADS_APP_SECRET must be configured to use the Threads channel.');
        }
        return new ThreadsChannel();
      default:
        throw new Error(`Unsupported social platform: ${platform}`);
    }
  }
}

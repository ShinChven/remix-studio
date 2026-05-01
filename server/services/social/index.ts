import { TwitterChannel } from './twitter-channel';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface ISocialChannel {
  platformName: string;
  getAuthUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  publish(text: string, media: { buffer: Buffer; mimeType: string }[], tokens: TokenSet): Promise<string>;
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
      default:
        throw new Error(`Unsupported social platform: ${platform}`);
    }
  }
}

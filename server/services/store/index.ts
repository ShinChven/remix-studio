import { GumroadStore } from './gumroad-store';

export interface StoreTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export interface StoreProfile {
  accountId: string;
  profileName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface IStore {
  platformName: string;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<StoreTokenSet>;
  fetchProfile(accessToken: string): Promise<StoreProfile>;
  revokeToken?(accessToken: string): Promise<void>;
}

export class StoreFactory {
  static getStore(platform: string): IStore {
    switch (platform) {
      case 'gumroad':
        if (!process.env.GUMROAD_CLIENT_ID || !process.env.GUMROAD_CLIENT_SECRET) {
          throw new Error('GUMROAD_CLIENT_ID and GUMROAD_CLIENT_SECRET must be configured to use the Gumroad store.');
        }
        return new GumroadStore();
      default:
        throw new Error(`Unsupported store platform: ${platform}`);
    }
  }
}

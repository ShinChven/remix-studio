import { IStore, StoreProfile, StoreTokenSet } from './index';

const GUMROAD_AUTH_URL = 'https://gumroad.com/oauth/authorize';
const GUMROAD_TOKEN_URL = 'https://api.gumroad.com/oauth/token';
const GUMROAD_REVOKE_URL = 'https://api.gumroad.com/oauth/revoke';
const GUMROAD_USER_URL = 'https://api.gumroad.com/v2/user';

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
}

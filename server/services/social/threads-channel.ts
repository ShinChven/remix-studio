import { ISocialChannel, TokenSet, SocialProfile, PreparedSocialMedia, PublishResult } from './index';

/**
 * Threads (Meta) social channel adapter.
 *
 * Verified against Meta's official Threads developer docs and Postman workspace
 * on 2026-06-07. See agent/threads-channel-in-campaign-plan.md for sources.
 *
 * Notable differences from the X adapter:
 * - Threads OAuth does NOT use PKCE, so the `codeChallenge`/`codeVerifier`
 *   arguments from the shared social router are ignored here. CSRF protection
 *   still relies on the `state` cookie handled by the router.
 * - Publishing is container-based and Meta fetches media from public URLs, so
 *   `publish()` requires `PreparedSocialMedia.publicUrl` rather than a buffer.
 */
export class ThreadsChannel implements ISocialChannel {
  platformName = 'threads';
  private appId: string;
  private appSecret: string;
  private redirectUri: string;

  private static readonly GRAPH = 'https://graph.threads.net';
  private static readonly MVP_SCOPES = ['threads_basic', 'threads_content_publish'];

  constructor() {
    this.appId = process.env.THREADS_APP_ID!;
    this.appSecret = process.env.THREADS_APP_SECRET!;
    this.redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/threads/callback`;
  }

  // Threads has no PKCE; codeChallenge is intentionally unused.
  getAuthUrl(state: string, _codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      // Threads accepts a comma-separated scope list.
      scope: ThreadsChannel.MVP_SCOPES.join(','),
      response_type: 'code',
      state,
    });
    return `https://threads.net/oauth/authorize?${params.toString()}`;
  }

  // Threads has no PKCE; codeVerifier is intentionally unused.
  async exchangeCode(code: string, _codeVerifier: string): Promise<TokenSet> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(`${ThreadsChannel.GRAPH}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange code: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const shortLivedToken: string = data.access_token;
    const grantedScopes = this.parseScopes(data);

    // Immediately upgrade the short-lived token to a long-lived one (~60 days).
    const longLived = await this.exchangeForLongLivedToken(shortLivedToken);
    return { ...longLived, scopes: grantedScopes ?? longLived.scopes };
  }

  /** Exchange a short-lived token for a long-lived (~60 day) token. */
  private async exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenSet> {
    const params = new URLSearchParams({
      grant_type: 'th_exchange_token',
      client_secret: this.appSecret,
      access_token: shortLivedToken,
    });

    const response = await fetch(`${ThreadsChannel.GRAPH}/access_token?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to exchange for long-lived token: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    // Threads "refresh" re-exchanges the current long-lived token; the stored
    // accessToken IS the long-lived token. PostManager passes the refresh token
    // slot, which for Threads we keep equal to the access token.
    const params = new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: refreshToken,
    });

    const response = await fetch(`${ThreadsChannel.GRAPH}/refresh_access_token?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  private parseTokenResponse(data: any): TokenSet {
    const accessToken: string = data.access_token;
    return {
      accessToken,
      // Threads long-lived tokens are refreshed by re-presenting themselves, so
      // mirror the access token into the refresh slot to drive PostManager's
      // proactive/reactive refresh flow.
      refreshToken: accessToken,
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : undefined,
      scopes: this.parseScopes(data),
    };
  }

  private parseScopes(data: any): string[] | undefined {
    if (Array.isArray(data.scope)) return data.scope.map(String);
    if (typeof data.scope === 'string') return data.scope.split(/[,\s]+/).filter(Boolean);
    return undefined;
  }

  async getProfile(accessToken: string): Promise<SocialProfile> {
    const params = new URLSearchParams({
      fields: 'id,username,name,threads_profile_picture_url,threads_biography',
      access_token: accessToken,
    });
    const response = await fetch(`${ThreadsChannel.GRAPH}/me?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Threads profile: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return {
      accountId: data.id,
      profileName: data.name || data.username,
      avatarUrl: data.threads_profile_picture_url ?? undefined,
      username: data.username ?? undefined,
    };
  }

  async publish(text: string, media: PreparedSocialMedia[], tokens: TokenSet): Promise<PublishResult> {
    const accessToken = tokens.accessToken;

    let creationId: string;
    if (media.length === 0) {
      creationId = await this.createTextContainer(text, accessToken);
    } else if (media.length === 1) {
      creationId = await this.createSingleMediaContainer(text, media[0], accessToken);
      await this.waitForContainerReady(creationId, accessToken);
    } else {
      creationId = await this.createCarouselContainer(text, media, accessToken);
      await this.waitForContainerReady(creationId, accessToken);
    }

    const publishedId = await this.publishContainer(creationId, accessToken);
    const externalUrl = await this.fetchPermalink(publishedId, accessToken);
    return { externalId: publishedId, externalUrl };
  }

  private async createTextContainer(text: string, accessToken: string): Promise<string> {
    return this.createContainer({ media_type: 'TEXT', text }, accessToken);
  }

  private async createSingleMediaContainer(
    text: string,
    item: PreparedSocialMedia,
    accessToken: string,
  ): Promise<string> {
    const params = this.mediaParams(item);
    params.text = text;
    return this.createContainer(params, accessToken);
  }

  private async createCarouselContainer(
    text: string,
    media: PreparedSocialMedia[],
    accessToken: string,
  ): Promise<string> {
    if (media.length > 20) {
      throw new Error(`Threads carousels support at most 20 items (got ${media.length}).`);
    }

    const childIds: string[] = [];
    for (const item of media) {
      const params = this.mediaParams(item);
      params.is_carousel_item = 'true';
      const childId = await this.createContainer(params, accessToken);
      childIds.push(childId);
    }

    // Children must finish processing before the carousel parent can publish.
    for (const childId of childIds) {
      await this.waitForContainerReady(childId, accessToken);
    }

    return this.createContainer(
      { media_type: 'CAROUSEL', children: childIds.join(','), text },
      accessToken,
    );
  }

  private mediaParams(item: PreparedSocialMedia): Record<string, string> {
    if (!item.publicUrl) {
      throw new Error('Threads requires a publicly reachable media URL (publicUrl was missing).');
    }
    if (item.type === 'video') {
      return { media_type: 'VIDEO', video_url: item.publicUrl };
    }
    // Threads treats GIFs as images for publishing.
    const params: Record<string, string> = { media_type: 'IMAGE', image_url: item.publicUrl };
    if (item.altText) params.alt_text = item.altText;
    return params;
  }

  private async createContainer(
    fields: Record<string, string>,
    accessToken: string,
  ): Promise<string> {
    const params = new URLSearchParams({ ...fields, access_token: accessToken });
    const response = await fetch(`${ThreadsChannel.GRAPH}/me/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) {
      throw new Error(`Failed to create Threads container: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.id;
  }

  private async publishContainer(creationId: string, accessToken: string): Promise<string> {
    const params = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
    const response = await fetch(`${ThreadsChannel.GRAPH}/me/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) {
      throw new Error(`Failed to publish Threads container: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.id;
  }

  /**
   * Poll a media container until it reports FINISHED. Meta fetches media from
   * the supplied URL asynchronously, so containers start IN_PROGRESS.
   */
  private async waitForContainerReady(
    creationId: string,
    accessToken: string,
    { attempts = 30, intervalMs = 3000 }: { attempts?: number; intervalMs?: number } = {},
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      const params = new URLSearchParams({ fields: 'status,error_message', access_token: accessToken });
      const response = await fetch(`${ThreadsChannel.GRAPH}/${creationId}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to check container status: ${response.status} ${await response.text()}`);
      }
      const data = await response.json();
      const status: string = data.status;

      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new Error(`Threads media processing ${status}: ${data.error_message || 'unknown error'}`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Threads media container ${creationId} did not finish processing in time.`);
  }

  /** Best-effort permalink lookup for the published post. */
  private async fetchPermalink(mediaId: string, accessToken: string): Promise<string | undefined> {
    try {
      const params = new URLSearchParams({ fields: 'permalink', access_token: accessToken });
      const response = await fetch(`${ThreadsChannel.GRAPH}/${mediaId}?${params.toString()}`);
      if (!response.ok) return undefined;
      const data = await response.json();
      return data.permalink ?? undefined;
    } catch {
      return undefined;
    }
  }
}

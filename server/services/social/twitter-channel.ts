import crypto from 'crypto';
import { ISocialChannel, TokenSet } from './index';

export class TwitterChannel implements ISocialChannel {
  platformName = 'twitter';
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.X_CLIENT_ID!;
    this.clientSecret = process.env.X_CLIENT_SECRET!;
    this.redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/social/twitter/callback`;
  }

  getAuthUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'tweet.read tweet.write users.read media.write offline.access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: this.clientId,
    });

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  private parseTokenResponse(data: any): TokenSet {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  }

  async publish(text: string, media: { buffer: Buffer; mimeType: string }[], tokens: TokenSet): Promise<string> {
    // 1. Upload media first (Best effort: max 4 media items per tweet)
    const mediaIds: string[] = [];
    const bestEffortMedia = media.slice(0, 4);
    
    for (const item of bestEffortMedia) {
      const mediaId = await this.uploadMedia(item, tokens.accessToken);
      mediaIds.push(mediaId);
    }

    // 2. Publish tweet
    const payload: any = {};
    if (text) payload.text = text;
    if (mediaIds.length > 0) {
      payload.media = { media_ids: mediaIds };
    }

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to publish tweet: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data.id;
  }

  private async uploadMedia(item: { buffer: Buffer; mimeType: string }, accessToken: string): Promise<string> {
    const { buffer: fileBuffer, mimeType } = item;
    // Strictly route GIFs to chunked upload per documentation
    const isImage = mimeType.startsWith('image/') && mimeType !== 'image/gif';
    
    if (isImage) {
      const response = await fetch('https://api.x.com/2/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media: fileBuffer.toString('base64'),
          media_category: 'tweet_image',
          media_type: mimeType,
          shared: false
        })
      });
      if (!response.ok) throw new Error(`Image upload failed: ${await response.text()}`);
      const data = await response.json();
      return data.data.id;
    }

    const totalBytes = fileBuffer.length;
    // INIT
    const initRes = await fetch('https://api.x.com/2/media/upload/initialize', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        total_bytes: totalBytes,
        media_type: mimeType,
        media_category: mimeType.startsWith('video/') ? 'tweet_video' : 'tweet_gif'
      })
    });
    if (!initRes.ok) throw new Error(`INIT failed: ${await initRes.text()}`);
    const initData = await initRes.json();
    const mediaId = initData.data.id;

    // APPEND
    const chunkSize = 2 * 1024 * 1024; // 2MB
    let segmentIndex = 0;
    for (let i = 0; i < totalBytes; i += chunkSize) {
      const chunk = fileBuffer.subarray(i, i + chunkSize);
      
      const appendRes = await fetch(`https://api.x.com/2/media/upload/${mediaId}/append`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          media: chunk.toString('base64'),
          segment_index: segmentIndex
        })
      });
      if (!appendRes.ok) throw new Error(`APPEND failed: ${await appendRes.text()}`);
      segmentIndex++;
    }

    // FINALIZE
    const finalizeRes = await fetch(`https://api.x.com/2/media/upload/${mediaId}/finalize`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!finalizeRes.ok) throw new Error(`FINALIZE failed: ${await finalizeRes.text()}`);
    
    const finalizeData = await finalizeRes.json();
    let processingInfo = finalizeData.data?.processing_info;
    
    // STATUS POLLING
    while (processingInfo && processingInfo.state !== 'succeeded') {
      if (processingInfo.state === 'failed') {
        throw new Error(`Media processing failed: ${processingInfo.error?.message}`);
      }
      
      const checkAfterSecs = processingInfo.check_after_secs || 5;
      await new Promise(resolve => setTimeout(resolve, checkAfterSecs * 1000));
      
      const statusRes = await fetch(`https://api.x.com/2/media/upload?command=STATUS&media_id=${mediaId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!statusRes.ok) throw new Error(`STATUS polling failed: ${await statusRes.text()}`);
      const statusData = await statusRes.json();
      processingInfo = statusData.data?.processing_info;
    }

    return mediaId;
  }
}


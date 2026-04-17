import { ImageGenerator, GenerateRequest, GenerateResult, CheckStatusResult } from './image-generator';

const SUBMIT_URL = 'https://www.runninghub.ai/openapi/v2/rhart-image-n-g31-flash/image-to-image';
const QUERY_URL  = 'https://www.runninghub.ai/openapi/v2/query';
const UPLOAD_URL = 'https://www.runninghub.cn/openapi/v2/media/upload/binary';

const MAX_POLL_ATTEMPTS = 60;  // 60 × 5 s = 5 min
const POLL_INTERVAL_MS  = 5_000;

// Qwen Image 2 Pro accepts a discrete set of width*height values. Map our
// (quality, aspectRatio) selections onto that enum.
const QWEN_SIZE_MAP: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024*1024',
    '4:3': '1280*960',
    '3:4': '960*1280',
    '16:9': '1280*720',
    '9:16': '720*1280',
    '3:2': '1152*768',
    '2:3': '768*1152',
    '21:9': '1344*576',
  },
  '2K': {
    '1:1': '1536*1536',
    '4:3': '1440*1080',
    '3:4': '1080*1440',
    '16:9': '1920*1080',
    '9:16': '1080*1920',
    '3:2': '1536*1024',
    '2:3': '1024*1536',
    '21:9': '2048*872',
  },
};

function resolveQwenSize(aspectRatio?: string, imageSize?: string): string {
  const quality = (imageSize || '1K').toUpperCase();
  const bucket = QWEN_SIZE_MAP[quality] || QWEN_SIZE_MAP['1K'];
  return bucket[aspectRatio || '1:1'] || bucket['1:1'];
}

function isQwenImage2Pro(modelId?: string, apiUrl?: string): boolean {
  const target = `${modelId || ''} ${apiUrl || ''}`;
  return target.includes('qwen-image-2.0-pro');
}

export class RunningHubGenerator extends ImageGenerator {
  private apiKey: string;
  private submitUrl: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.submitUrl = apiUrl || SUBMIT_URL;
  }

  private get authHeaders() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  /** Upload a PNG buffer to RunningHub and return the CDN URL. */
  private async uploadImage(base64Data: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    try {
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const form = new FormData();
      form.append('file', blob, 'input.png');

      const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { ...this.authHeaders },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Upload HTTP ${res.status}: ${text}` };
      }

      const json: any = await res.json();
      if (json.code !== 0) {
        return { ok: false, error: `Upload API error ${json.code}: ${json.message ?? json.msg}` };
      }

      const data = json.data ?? {};
      const url: string | undefined =
        data.download_url ||
        (data.fileName ? `https://www.runninghub.cn/view?filename=${data.fileName}&type=input` : undefined) ||
        (data.filename ? `https://www.runninghub.cn/view?filename=${data.filename}&type=input` : undefined);

      if (!url) return { ok: false, error: 'No URL in upload response' };
      return { ok: true, url };
    } catch (e: any) {
      return { ok: false, error: `Upload exception: ${e?.message}` };
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const { prompt, aspectRatio = '2:3', imageSize = '1K', refImagesBase64, modelId, apiUrl: reqApiUrl } = req;

    // --- Step 1: optional image upload ---
    const imageUrls: string[] = [];
    if (refImagesBase64 && refImagesBase64.length > 0) {
      for (const base64 of refImagesBase64) {
        const up = await this.uploadImage(base64);
        if (up.ok === false) {
          return { ok: false, error: up.error };
        }
        imageUrls.push(up.url);
      }
    }

    const isTextToImage = imageUrls.length === 0;
    const isQwen = isQwenImage2Pro(modelId, reqApiUrl);
    // Qwen uses `/image-edit` while the rhart model uses `/image-to-image`.
    const refEndpointType = isQwen ? 'image-edit' : 'image-to-image';
    const endpointType = isTextToImage ? 'text-to-image' : refEndpointType;

    let actualSubmitUrl = reqApiUrl;
    if (!actualSubmitUrl) {
      if (modelId) {
        actualSubmitUrl = `https://www.runninghub.ai/openapi/v2/${modelId}/${endpointType}`;
      } else {
        // Fallback to this.submitUrl but swap the type if needed
        actualSubmitUrl = this.submitUrl;
        if (isTextToImage && actualSubmitUrl.endsWith('/image-to-image')) {
          actualSubmitUrl = actualSubmitUrl.replace('/image-to-image', '/text-to-image');
        } else if (!isTextToImage && actualSubmitUrl.endsWith('/text-to-image')) {
          actualSubmitUrl = actualSubmitUrl.replace('/text-to-image', '/image-to-image');
        }
      }
    }

    // --- Step 2: submit task ---
    let payload: any;
    if (isQwen) {
      payload = {
        prompt,
        size: resolveQwenSize(aspectRatio, imageSize),
        imageNum: '1',
      };
      if (!isTextToImage) {
        payload.imageUrls = imageUrls;
      }
    } else {
      payload = {
        prompt,
        aspectRatio,
        resolution: imageSize.toLowerCase(), // API expects "1k", not "1K"
      };
      if (!isTextToImage) {
        payload.imageUrls = imageUrls;
      }
    }

    let taskId: string;
    try {
      const res = await fetch(actualSubmitUrl, {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // @ts-ignore — node-fetch timeout
        timeout: 300_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Submit HTTP ${res.status}: ${text}` };
      }

      const submitResult: any = await res.json();
      
      // Check for API-level error
      if (submitResult.errorCode && submitResult.errorCode !== '0' && submitResult.errorCode !== '') {
        return { ok: false, error: `Submit API error ${submitResult.errorCode}: ${submitResult.errorMessage}` };
      }

      taskId = submitResult.taskId;
      if (!taskId) {
        return { ok: false, error: `No taskId in submit response: ${JSON.stringify(submitResult)}` };
      }
    } catch (e: any) {
      return { ok: false, error: `Submit exception: ${e?.message}` };
    }

    // --- Step 3: Return immediately for detached polling ---
    return { ok: true, status: 'processing', taskId };
  }

  async checkStatus(taskId: string): Promise<CheckStatusResult> {
    try {
      const queryRes = await fetch(QUERY_URL, {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
        // @ts-ignore — node-fetch timeout
        timeout: 60_000,
      });

      if (!queryRes.ok) {
        return { status: 'processing' }; // transient error, assume still processing
      }

      const result: any = await queryRes.json();

      // Check for API-level error in query
      if (result.errorCode && result.errorCode !== '0' && result.errorCode !== '') {
        return { status: 'failed', error: `Query API error ${result.errorCode}: ${result.errorMessage}` };
      }

      const status: string = result.status;
      
      if (status !== 'SUCCESS' && status !== 'RUNNING' && status !== 'QUEUED' && status !== 'FAILED') {
        console.log(`[RunningHubGenerator] Unexpected status: ${status}`, JSON.stringify(result));
      }

      if (status === 'SUCCESS') {
        const imageUrl: string | undefined = result.results?.[0]?.url;
        if (!imageUrl) return { status: 'failed', error: 'Task succeeded but no image URL in results' };

        const imgRes = await fetch(imageUrl, { timeout: 60_000 } as any);
        if (!imgRes.ok) {
          return { status: 'failed', error: `Failed to download result image: HTTP ${imgRes.status}` };
        }

        const arrayBuffer = await imgRes.arrayBuffer();
        return { status: 'completed', imageBytes: Buffer.from(arrayBuffer) };
      }

      if (status === 'FAILED') {
        let msg = result.errorMessage || result.errorCode || 'Unknown failure';
        const reason = result.failedReason;
        if (reason && typeof reason === 'string' && reason.trim()) msg += ` (Reason: ${reason})`;
        return { status: 'failed', error: `Task failed: ${msg}` };
      }

      // RUNNING / QUEUED
      return { status: 'processing' };
    } catch (e: any) {
      // transient network error, keep processing
      return { status: 'processing' };
    }
  }
}

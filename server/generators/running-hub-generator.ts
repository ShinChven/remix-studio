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

// Grok Imagine Quality's reference endpoint is `/edit`, which takes one
// `imageUrl` rather than a list.
const GROK_MAX_REF_IMAGES = 1;

function isGrokImagineQuality(modelId?: string, apiUrl?: string): boolean {
  const target = `${modelId || ''} ${apiUrl || ''}`;
  return target.includes('rhart-imagine-image-quality');
}

// rhart-image-n-pro shares the default rhart payload shape but its
// reference-image endpoint is `/edit` (imageUrls, max 10) instead of
// `/image-to-image`.
function isRhartImageNPro(modelId?: string, apiUrl?: string): boolean {
  const target = `${modelId || ''} ${apiUrl || ''}`.toLowerCase();
  return target.includes('rhart-image-n-pro');
}

// rhart-image-g-2-official shares the default rhart payload shape but requires
// an explicit quality tier alongside the resolution. Both live in the model's
// single quality picker as one value ("2K Medium"), so split it back apart.
const GPT_IMAGE_2_RESOLUTIONS = ['1k', '2k', '4k'];
const GPT_IMAGE_2_QUALITIES = ['low', 'medium', 'high'];

function isGptImage2Official(modelId?: string, apiUrl?: string): boolean {
  const target = `${modelId || ''} ${apiUrl || ''}`.toLowerCase();
  return target.includes('rhart-image-g-2-official');
}

function resolveGptImage2OfficialSize(imageSize?: string): { resolution: string; quality: string } {
  const parts = (imageSize || '').toLowerCase().split(/[\s_/-]+/).filter(Boolean);
  return {
    resolution: parts.find((p) => GPT_IMAGE_2_RESOLUTIONS.includes(p)) || '1k',
    quality: parts.find((p) => GPT_IMAGE_2_QUALITIES.includes(p)) || 'medium',
  };
}

// Seedream 5.0 Pro takes explicit width/height (240 - 8192). Its `resolution`
// enum overrides width*height when present, so we only send width/height to
// preserve the user's aspect-ratio choice.
const SEEDREAM_SIZE_MAP: Record<string, Record<string, [number, number]>> = {
  '1K': {
    '1:1': [1024, 1024],
    '4:3': [1152, 864],
    '3:4': [864, 1152],
    '16:9': [1280, 720],
    '9:16': [720, 1280],
    '3:2': [1248, 832],
    '2:3': [832, 1248],
    '21:9': [1512, 648],
  },
  '2K': {
    '1:1': [2048, 2048],
    '4:3': [2304, 1728],
    '3:4': [1728, 2304],
    '16:9': [2560, 1440],
    '9:16': [1440, 2560],
    '3:2': [2496, 1664],
    '2:3': [1664, 2496],
    '21:9': [3024, 1296],
  },
};

function resolveSeedreamSize(aspectRatio?: string, imageSize?: string): [number, number] {
  const quality = (imageSize || '1K').toUpperCase();
  const bucket = SEEDREAM_SIZE_MAP[quality] || SEEDREAM_SIZE_MAP['1K'];
  return bucket[aspectRatio || '1:1'] || bucket['1:1'];
}

function isSeedream5Pro(modelId?: string, apiUrl?: string): boolean {
  const target = `${modelId || ''} ${apiUrl || ''}`.toLowerCase();
  return target.includes('dola-seedream-5.0-pro') || target.includes('seedream-v5-pro');
}

// Wan 2.7 Pro also takes explicit width/height and uses `-pro` endpoint
// suffixes (`text-to-image-pro`, `image-edit-pro`). The Seedream size buckets
// satisfy its pixel constraints (>= 768*768 total, each side 512 - 4096).
function isWan27Pro(modelId?: string, apiUrl?: string): boolean {
  const target = `${modelId || ''} ${apiUrl || ''}`.toLowerCase();
  return target.includes('wan-2.7');
}

// Wan 2.7 rejects prompts longer than 2048 characters (API error 1007).
const WAN_MAX_PROMPT_LENGTH = 2048;

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
    const { prompt, aspectRatio = '2:3', imageSize = '1K', format, refImagesBase64, modelId, apiUrl: reqApiUrl } = req;

    const isQwen = isQwenImage2Pro(modelId, reqApiUrl);
    const isGrok = isGrokImagineQuality(modelId, reqApiUrl);
    const isSeedream = isSeedream5Pro(modelId, reqApiUrl);
    const isWan = isWan27Pro(modelId, reqApiUrl);
    const isNanoPro = isRhartImageNPro(modelId, reqApiUrl);
    const isGptOfficial = isGptImage2Official(modelId, reqApiUrl);

    // --- Step 1: optional image upload ---
    // Grok Imagine Quality's /edit carries a single imageUrl, so uploading the
    // rest costs a round trip each for bytes the request cannot hold.
    const refImages = isGrok
      ? (refImagesBase64 || []).slice(0, GROK_MAX_REF_IMAGES)
      : (refImagesBase64 || []);
    const imageUrls: string[] = [];
    for (const base64 of refImages) {
      const up = await this.uploadImage(base64);
      if (up.ok === false) {
        return { ok: false, error: up.error };
      }
      imageUrls.push(up.url);
    }

    const isTextToImage = imageUrls.length === 0;
    // Qwen uses `/image-edit`, Grok Imagine Quality and rhart-image-n-pro use
    // `/edit`, Wan 2.7 uses `/image-edit-pro`, the rhart flash model uses
    // `/image-to-image`.
    const refEndpointType = isQwen ? 'image-edit' : (isGrok || isNanoPro) ? 'edit' : isWan ? 'image-edit-pro' : 'image-to-image';
    const endpointType = isTextToImage ? (isWan ? 'text-to-image-pro' : 'text-to-image') : refEndpointType;

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
    } else if (isGrok) {
      payload = {
        prompt,
        resolution: imageSize.toLowerCase(), // API expects "1k", not "1K"
        numImages: '1',
      };
      // aspectRatio is optional on both endpoints. `/edit` also takes `auto`
      // to keep the source framing; `/text-to-image` has no such value, so
      // the field is omitted there and the API picks the framing.
      if (!isTextToImage) {
        payload.aspectRatio = aspectRatio || 'auto';
      } else if (aspectRatio !== 'auto') {
        payload.aspectRatio = aspectRatio;
      }
      if (format) {
        payload.outputFormat = format.toLowerCase() === 'jpg' ? 'jpeg' : format.toLowerCase();
      }
      if (!isTextToImage) {
        // Grok Imagine Quality /edit accepts a single imageUrl (max 1 image).
        payload.imageUrl = imageUrls[0];
      }
    } else if (isSeedream || isWan) {
      const [width, height] = resolveSeedreamSize(aspectRatio, imageSize);
      let wanPrompt = prompt;
      if (isWan && prompt.length > WAN_MAX_PROMPT_LENGTH) {
        console.log(`[RunningHubGenerator] Truncating Wan 2.7 prompt from ${prompt.length} to ${WAN_MAX_PROMPT_LENGTH} chars`);
        wanPrompt = prompt.slice(0, WAN_MAX_PROMPT_LENGTH);
      }
      payload = {
        prompt: wanPrompt,
        width,
        height,
      };
      // Wan 2.7 does not document an outputFormat parameter.
      if (isSeedream && format) {
        payload.outputFormat = format.toLowerCase() === 'jpg' ? 'jpeg' : format.toLowerCase();
      }
      if (!isTextToImage) {
        payload.imageUrls = imageUrls;
      }
    } else {
      payload = {
        prompt,
        resolution: imageSize.toLowerCase(), // API expects "1k", not "1K"
      };
      if (isGptOfficial) {
        const { resolution, quality } = resolveGptImage2OfficialSize(imageSize);
        payload.resolution = resolution;
        payload.quality = quality;
      }
      // aspectRatio is optional; "auto" means letting the API decide, so omit the field.
      if (aspectRatio !== 'auto') {
        payload.aspectRatio = aspectRatio;
      }
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

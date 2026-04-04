import { ImageGenerator, GenerateRequest, GenerateResult } from './image-generator';

const SUBMIT_URL = 'https://www.runninghub.ai/openapi/v2/rhart-image-n-g31-flash/image-to-image';
const QUERY_URL  = 'https://www.runninghub.ai/openapi/v2/query';
const UPLOAD_URL = 'https://www.runninghub.cn/openapi/v2/media/upload/binary';

const MAX_POLL_ATTEMPTS = 60;  // 60 × 5 s = 5 min
const POLL_INTERVAL_MS  = 5_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
    const { prompt, aspectRatio = '2:3', imageSize = '1K', refImagesBase64 } = req;

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

    // --- Step 2: submit task ---
    const payload = {
      imageUrls,
      prompt,
      aspectRatio,
      resolution: imageSize.toLowerCase(), // API expects "1k", not "1K"
    };

    let taskId: string;
    try {
      const res = await fetch(this.submitUrl, {
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
      taskId = submitResult.taskId;
      if (!taskId) {
        return { ok: false, error: `No taskId in submit response: ${JSON.stringify(submitResult)}` };
      }
    } catch (e: any) {
      return { ok: false, error: `Submit exception: ${e?.message}` };
    }

    // --- Step 3: poll for completion ---
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      try {
        const queryRes = await fetch(QUERY_URL, {
          method: 'POST',
          headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
          // @ts-ignore — node-fetch timeout
          timeout: 60_000,
        });

        if (!queryRes.ok) continue; // transient error, retry

        const result: any = await queryRes.json();
        const status: string = result.status;

        if (status === 'SUCCESS') {
          const imageUrl: string | undefined = result.results?.[0]?.url;
          if (!imageUrl) return { ok: false, error: 'Task succeeded but no image URL in results' };

          const imgRes = await fetch(imageUrl, { timeout: 60_000 } as any);
          if (!imgRes.ok) {
            return { ok: false, error: `Failed to download result image: HTTP ${imgRes.status}` };
          }

          const arrayBuffer = await imgRes.arrayBuffer();
          return { ok: true, imageBytes: Buffer.from(arrayBuffer) };
        }

        if (status === 'FAILED') {
          let msg = result.errorMessage || result.errorCode || 'Unknown failure';
          const reason = result.failedReason;
          if (reason && typeof reason === 'string' && reason.trim()) msg += ` (Reason: ${reason})`;
          return { ok: false, error: `Task failed: ${msg}` };
        }

        // RUNNING / QUEUED — continue polling
      } catch {
        // network hiccup, keep polling
      }
    }

    return { ok: false, error: `Polling timed out for taskId: ${taskId!}` };
  }
}

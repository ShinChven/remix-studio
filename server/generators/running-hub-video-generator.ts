import { VideoGenerator, VideoGenerateRequest, VideoGenerateResult, VideoCheckStatusResult } from './video-generator';

const SUBMIT_URL_BASE = 'https://www.runninghub.ai/openapi/v2/run/ai-app';
const QUERY_URL  = 'https://www.runninghub.ai/openapi/v2/query';
const UPLOAD_URL = 'https://www.runninghub.cn/openapi/v2/media/upload/binary';

export class RunningHubVideoGenerator extends VideoGenerator {
  private apiKey: string;
  private submitUrlBase: string;

  constructor(apiKey: string, apiUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.submitUrlBase = apiUrl || SUBMIT_URL_BASE;
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
      // According to API, download_url may be present, or we may just upload file and runninghub takes the result.
      // Wait, if the video api takes downloadUrl, we use that.
      const url: string | undefined = data.download_url;

      if (!url) return { ok: false, error: 'No download_url in upload response' };
      return { ok: true, url };
    } catch (e: any) {
      return { ok: false, error: `Upload exception: ${e?.message}` };
    }
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    const { prompt, aspectRatio = '16:9', resolution = '720p', duration = 5, refImagesBase64, modelId } = req;
    
    // We assume modelId implies the AI App ID on RunningHub. E.g., '2037063826180415490'
    const appId = modelId || '2037063826180415490';
    const actualSubmitUrl = `${this.submitUrlBase}/${appId}`;

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

    const nodeInfoList: any[] = [];

    // Configuration Node
    nodeInfoList.push({ nodeId: '1', fieldName: 'prompt', fieldValue: prompt, description: 'Input text' });
    nodeInfoList.push({ nodeId: '1', fieldName: 'real_person_mode', fieldValue: 'true', description: 'Support real person switch' });
    nodeInfoList.push({ nodeId: '1', fieldName: 'duration', fieldValue: duration.toString(), description: 'Duration (seconds)' });
    nodeInfoList.push({ nodeId: '1', fieldName: 'ratio', fieldValue: aspectRatio, description: 'Ratio' });
    nodeInfoList.push({ nodeId: '1', fieldName: 'resolution', fieldValue: resolution.toLowerCase(), description: 'Resolution' });

    // Image Input Nodes (up to 3 images typically supported by this workflow)
    const imageNodeIds = ['2', '9', '10'];
    for (let i = 0; i < imageUrls.length && i < imageNodeIds.length; i++) {
      nodeInfoList.push({
        nodeId: imageNodeIds[i],
        fieldName: 'image',
        fieldValue: imageUrls[i],
        description: `Upload image ${i + 1}`,
      });
    }

    // Video Input Node (Seedance nodeId 3, fieldName 'file')
    if (req.refVideoUrls && req.refVideoUrls.length > 0) {
      nodeInfoList.push({
        nodeId: '3',
        fieldName: 'file',
        fieldValue: req.refVideoUrls[0],
        description: 'Upload video (optional)'
      });
    }

    // Audio Input Node (Seedance nodeId 11, fieldName 'audio')
    if (req.refAudioUrls && req.refAudioUrls.length > 0) {
      nodeInfoList.push({
        nodeId: '11',
        fieldName: 'audio',
        fieldValue: req.refAudioUrls[0],
        description: 'Upload audio (optional)'
      });
    }

    const payload = {
      nodeInfoList,
      instanceType: 'default', // Fallback, could be customized via config later if multiple instance types needed
      usePersonalQueue: 'false',
    };

    let taskId: string;
    try {
      const res = await fetch(actualSubmitUrl, {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // @ts-ignore
        timeout: 300_000,
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Submit HTTP ${res.status}: ${text}` };
      }

      const submitResult: any = await res.json();
      
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

    return { ok: true, status: 'processing', taskId };
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const queryRes = await fetch(QUERY_URL, {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
        // @ts-ignore
        timeout: 60_000,
      });

      if (!queryRes.ok) {
        return { status: 'processing' };
      }

      const result: any = await queryRes.json();

      if (result.errorCode && result.errorCode !== '0' && result.errorCode !== '') {
        return { status: 'failed', error: `Query API error ${result.errorCode}: ${result.errorMessage}` };
      }

      const status: string = result.status;

      if (status === 'SUCCESS') {
        const videoUrl: string | undefined = result.results?.[0]?.url;
        if (!videoUrl) return { status: 'failed', error: 'Task succeeded but no result URL found' };

        const vidRes = await fetch(videoUrl, { timeout: 300_000 } as any);
        if (!vidRes.ok) {
          return { status: 'failed', error: `Failed to download result video: HTTP ${vidRes.status}` };
        }

        const arrayBuffer = await vidRes.arrayBuffer();
        return { 
          status: 'completed', 
          videoBytes: Buffer.from(arrayBuffer),
          mimeType: 'video/mp4' // Assuming mp4 based on video generation standard
        };
      }

      if (status === 'FAILED') {
        let msg = result.errorMessage || result.errorCode || 'Unknown failure';
        const reason = result.failedReason;
        if (reason && typeof reason === 'string' && reason.trim()) msg += ` (Reason: ${reason})`;
        return { status: 'failed', error: `Task failed: ${msg}` };
      }

      return { status: 'processing' };
    } catch (e: any) {
      return { status: 'processing' };
    }
  }
}

import { VertexProjectClient, vertexProjectRoot } from '../utils/vertex-project';
import { VideoGenerator, type VideoCheckStatusResult, type VideoGenerateRequest, type VideoGenerateResult } from './video-generator';

const DEFAULT_MODEL = 'veo-3.1-generate-001';

interface VertexVideoOperation {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    videos?: { bytesBase64Encoded?: string; mimeType?: string }[];
    raiMediaFilteredReasons?: string[];
  };
}

export class VertexAIVideoGenerator extends VideoGenerator {
  private readonly client?: VertexProjectClient;

  constructor(credential: string, apiUrl?: string) {
    super();
    const root = vertexProjectRoot(apiUrl);
    if (root) this.client = new VertexProjectClient(credential, root);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    if (!this.client) return { ok: false, error: 'Set the Vertex AI API URL to an endpoint with /v1/projects/PROJECT/locations/LOCATION to use Veo' };
    try {
      const model = req.modelId || DEFAULT_MODEL;
      const refs = req.refImagesBase64 || [];
      if (refs.length > 2) return { ok: false, error: 'Vertex Veo accepts a first frame and an optional last frame' };
      const image = (data: string) => ({ bytesBase64Encoded: data, mimeType: 'image/png' });
      const duration = [4, 6, 8].includes(req.duration || 0) ? req.duration : 8;
      const result = await this.request(model, 'predictLongRunning', {
        instances: [{
          prompt: req.prompt,
          ...(refs[0] ? { image: image(refs[0]) } : {}),
          ...(refs[1] ? { lastFrame: image(refs[1]) } : {}),
        }],
        parameters: {
          sampleCount: 1,
          durationSeconds: duration,
          aspectRatio: req.aspectRatio === '9:16' ? '9:16' : '16:9',
          resolution: req.resolution || '720p',
          generateAudio: req.sound !== 'off',
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        },
      });
      if (!result.name) throw new Error(result.error?.message || 'Vertex Veo did not return an operation name');
      return { ok: true, status: 'processing', taskId: result.name };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    const model = taskId.match(/\/publishers\/google\/models\/([^/]+)\/operations\/[^/]+$/)?.[1];
    if (!model || !this.client) return { status: 'failed', error: 'Invalid Vertex Veo operation or API URL' };
    try {
      const result = await this.request(model, 'fetchPredictOperation', { operationName: taskId });
      if (result.error) return { status: 'failed', error: result.error.message || 'Vertex Veo operation failed' };
      if (!result.done) return { status: 'processing' };
      const video = result.response?.videos?.[0];
      if (!video?.bytesBase64Encoded) {
        return { status: 'failed', error: result.response?.raiMediaFilteredReasons?.join(', ') || 'Vertex Veo returned no inline video' };
      }
      return {
        status: 'completed',
        videoBytes: Buffer.from(video.bytesBase64Encoded, 'base64'),
        mimeType: video.mimeType || 'video/mp4',
      };
    } catch {
      return { status: 'processing' };
    }
  }

  private async request(model: string, method: string, payload: Record<string, unknown>): Promise<VertexVideoOperation> {
    const client = this.client!;
    const response = await client.post(client.modelUrl(model, method), payload);
    if (!response.ok) {
      const error = `HTTP ${response.status}: ${await response.text()}`;
      if (method === 'fetchPredictOperation' && response.status === 404) return { error: { message: error } };
      throw new Error(error);
    }
    return response.json();
  }
}

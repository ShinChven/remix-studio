import { APIMART_VIDEO_MODELS } from '../../src/lib/apimart-models';
import { resolveSupportedAspectRatio, resolveSupportedOption } from '../../src/types';
import {
  APIMartClient, apimartError, apimartMediaUrl, apimartTaskId, apimartTaskState, downloadAPIMartMedia,
} from '../utils/apimart';
import { VideoGenerator, type VideoGenerateRequest, type VideoGenerateResult, type VideoCheckStatusResult } from './video-generator';

export class APIMartVideoGenerator extends VideoGenerator {
  private client: APIMartClient;
  constructor(private apiKey: string, private apiUrl?: string) {
    super();
    this.client = new APIMartClient(apiKey, apiUrl);
  }

  async generate(req: VideoGenerateRequest): Promise<VideoGenerateResult> {
    try {
      const client = new APIMartClient(this.apiKey, req.apiUrl || this.apiUrl);
      const model = req.modelId || 'seedance-2.5';
      const options = APIMART_VIDEO_MODELS.find((m) => m.modelId === model)?.options;
      const videos = req.refVideoUrls || [];
      const audios = req.refAudioUrls || [];
      if (videos.length && !options?.supportsReferenceVideo) throw new Error(`${model} does not support reference video`);
      if (audios.length && !options?.supportsReferenceAudio) throw new Error(`${model} does not support reference audio`);
      const rawImages = req.refImageUrls?.length ? req.refImageUrls : (req.refImagesBase64 || []).map((s) => `data:image/png;base64,${s}`);
      const images: string[] = [];
      for (const raw of rawImages) images.push(raw.startsWith('data:') ? await client.uploadImage(raw) : raw);
      const payload: Record<string, unknown> = { model, prompt: req.prompt };
      const ratio = resolveSupportedAspectRatio(req.aspectRatio, options?.aspectRatios);
      const resolution = options?.resolutions ? resolveSupportedOption(req.resolution, options.resolutions) || options.resolutions[0] : undefined;
      const duration = options?.durations
        ? (req.duration !== undefined && options.durations.includes(req.duration) ? req.duration : options.durations.includes(5) ? 5 : options.durations[0])
        : undefined;
      const usesSize = /^(seedance-2\.|wan(?:2\.[57]|3\.)|happyhorse|grok-imagine-1\.5-video-ext)/.test(model);
      if (ratio && options?.aspectRatios) payload[usesSize ? 'size' : 'aspect_ratio'] = ratio;
      if (resolution) payload.resolution = resolution;
      if (duration !== undefined) payload.duration = duration;
      if (images.length) payload.image_urls = images;
      if (videos.length) payload.video_urls = videos;
      if (audios.length) payload.audio_urls = audios;
      if (req.seed !== undefined) payload.seed = req.seed;
      if (req.sound && options?.sounds) {
        const field = /^seedance-2\.|^veo3\.1-.*official$/.test(model) ? 'generate_audio' : 'audio';
        payload[field] = options.sounds.includes(req.sound) ? req.sound === 'on' : options.sounds[0] === 'on';
      }

      if (/^MiniMax-Hailuo|^kling-3\.0-turbo/.test(model)) {
        if (images.length > 2 || (model !== 'MiniMax-Hailuo-02' && images.length > 1)) throw new Error(`${model} accepts only ${model === 'MiniMax-Hailuo-02' ? 'two' : 'one'} frame image(s)`);
        delete payload.image_urls;
        if (images[0]) payload.first_frame_image = images[0];
        if (images[1]) payload.last_frame_image = images[1];
        if (model.endsWith('-Fast') && !images.length) throw new Error(`${model} requires a first-frame image`);
        if (resolution === '1080p' && duration !== (model === 'MiniMax-Hailuo-02' ? 5 : 6)) {
          throw new Error(`${model} at 1080p requires ${model === 'MiniMax-Hailuo-02' ? 5 : 6} seconds`);
        }
      }
      if (model.startsWith('veo3.1-') && model.endsWith('-official')) {
        if (images.length > 2) throw new Error(`${model} accepts at most two frame images`);
        delete payload.image_urls;
        if (images[0]) payload.first_frame_image = images[0];
        if (images[1]) payload.last_frame_image = images[1];
      }
      if (model.includes('motion-control')) {
        if (images.length !== 1 || videos.length !== 1) throw new Error(`${model} requires one image and one reference video`);
        delete payload.image_urls;
        delete payload.video_urls;
        payload.image_url = images[0];
        payload.video_url = videos[0];
      }
      if (model === 'kling-v2-6' && images.length > 1) payload.mode = 'pro';
      if (model === 'kling-v3-omni' && videos.length) {
        if (videos.length > 1) throw new Error(`${model} accepts one reference video`);
        delete payload.video_urls;
        delete payload.audio;
        payload.video_list = [{ video_url: videos[0], refer_type: 'base', keep_original_sound: 'yes' }];
      }
      if (model === 'wan2.7-r2v') {
        delete payload.image_urls;
        if (images.length) payload.image_with_roles = images.map((url) => ({ url, role: 'reference_image' }));
        if (!images.length && !videos.length) throw new Error(`${model} requires reference images or video`);
        if (videos.length && duration! > 10) throw new Error(`${model} with video references supports at most 10 seconds`);
      }
      if (model === 'wan2.7-videoedit' && !videos.length) throw new Error(`${model} requires a source video`);
      if (model === 'wan2.7' && audios.length) {
        if (audios.length !== 1 || images.length || videos.length) throw new Error(`${model} audio input requires one audio and no image/video references`);
        delete payload.audio_urls;
        payload.audio_url = audios[0];
      }
      if (model.startsWith('wan2.6-i2v') && images.length !== 1) throw new Error(`${model} requires exactly one first-frame image`);
      if (model.startsWith('viduq')) {
        if (/^(viduq3|viduq3-mix|viduq4-preview)$/.test(model) && !images.length) throw new Error(`${model} requires reference images`);
        if (/^viduq3-(pro|turbo)$/.test(model) && images.length) delete payload.aspect_ratio;
      }
      if (model === 'grok-imagine-video' && videos.length) {
        if (videos.length !== 1 || images.length) throw new Error(`${model} editing requires one video and no image references`);
        for (const key of ['video_urls', 'duration', 'resolution', 'aspect_ratio']) delete payload[key];
        payload.video = { url: videos[0] };
      }
      if (model === 'gemini-omni-1.1-flash-ext' && videos.length) delete payload.duration;
      if (/^(happyhorse-1\.0|flux-3-video)$/.test(model) && videos.length) {
        if (videos.length !== 1) throw new Error(`${model} accepts one reference video`);
        delete payload.video_urls;
        payload.video_url = videos[0];
      }
      if (model.startsWith('skyreels-v4')) {
        delete payload.image_urls;
        delete payload.video_urls;
        delete payload.audio_urls;
        if (images.length > 3 || videos.length > 1 || audios.length > 1) throw new Error(`${model} accepts at most 3 reference subjects, one video and one audio`);
        if (audios.length && !images.length) throw new Error(`${model} audio requires an image reference`);
        if (images.length || videos.length) {
          // SkyReels requires tags to appear in the prompt for Omni references.
          payload.prompt = `${images.map((_, i) => `@Image${i + 1}`).join(' ')}${videos.length ? ' @Video1' : ''} ${req.prompt}`.trim();
          if (images.length) payload.ref_images = images.map((url, i) => ({ tag: `@Image${i + 1}`, type: 'image', image_urls: [url], ...(i === 0 && audios[0] ? { audio_url: audios[0] } : {}) }));
          if (videos.length) payload.ref_videos = [{ tag: '@Video1', type: 'reference', video_url: videos[0] }];
        }
      }
      if (/^(MiniMax-H3(?:-Max)?|seedance-2\.0(?:-fast|-mini)?)$/.test(model) && audios.length && !images.length && !videos.length) {
        throw new Error(`${model} audio references require images or video`);
      }
      if ((model === 'wan2.6' || model === 'wan2.5-preview') && images.length) {
        delete payload.aspect_ratio;
        delete payload.size;
      }
      if (model === 'pixverse-v6-max' && images.length > 1) throw new Error(`${model} accepts exactly one image`);
      const json = await client.json('videos/generations', payload);
      const taskId = apimartTaskId(json);
      if (!taskId) throw new Error('No task_id in APIMart video response');
      return { ok: true, status: 'processing', taskId };
    } catch (e: any) {
      return { ok: false, error: e.message || 'APIMart video generation failed' };
    }
  }

  async checkStatus(taskId: string): Promise<VideoCheckStatusResult> {
    try {
      const json = await this.client.json(`tasks/${encodeURIComponent(taskId)}`);
      const status = apimartTaskState(json);
      if (status === 'failed') return { status, error: apimartError(json.data) || apimartError(json) || 'APIMart video task failed' };
      if (status !== 'completed') return { status };
      const result = json.data?.result || json.result;
      const url = apimartMediaUrl(result?.videos?.[0]?.url) || apimartMediaUrl(result?.url);
      if (!url) return { status: 'failed', error: 'APIMart completed without a video URL' };
      const media = await downloadAPIMartMedia(url);
      return { status: 'completed', videoBytes: media.bytes, mimeType: media.mimeType || 'video/mp4' };
    } catch {
      // A temporary query/download failure must not trigger a second paid submission.
      return { status: 'processing' };
    }
  }
}

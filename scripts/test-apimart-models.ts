// Mocked contract tests: no credentials, database, or paid API calls.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { PROVIDER_MODELS_MAP, parseAudioProjectConfig, serializeAudioProjectConfig } from '../src/types';
import { APIMART_TEXT_MODELS, APIMART_VIDEO_MODELS, APIMART_AUDIO_MODELS } from '../src/lib/apimart-models';
import { APIMartGenerator } from '../server/generators/apimart-generator';
import { buildTextGenerator } from '../server/generators/build-text-generator';
import { buildVideoGenerator } from '../server/generators/build-video-generator';
import { buildAudioGenerator } from '../server/generators/build-audio-generator';
import { buildChatProvider, isAssistantCapableProviderType } from '../server/assistant/chat-provider-factory';
import { listProviderModels } from '../server/services/provider-model-lister';
import { DetachedPoller } from '../server/queue/detached-poller';
import { QueueManager } from '../server/queue/queue-manager';
import { apimartBaseUrl } from '../server/utils/apimart';

type Call = { url: string; init: RequestInit; body: any };
async function withFetch(respond: (call: Call) => Response, run: (calls: Call[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), init: init || {}, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return respond(call);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}
const accepted = () => Response.json({ code: 202, data: { id: 'task-1', status: 'pending' } }, { status: 202 });
const chatResponse = () => Response.json({ choices: [{ message: { content: 'A response' }, finish_reason: 'stop' }] });
const musicConfig = { kind: 'remix-audio-music', mode: 'with-lyrics' } as const;
const aliases: Record<string, string> = {
  'seedream-4-0': 'seedream-4.0', 'seedream-4-5': 'seedream-4.5',
  'grok-imagine-1.5-edit-apimart': 'grok-imagine-1.5-apimart',
  'grok-imagine-1.5-video-apimart': 'grok-imagine-1.5-video-ext',
  'Omni-Flash-Ext': 'gemini-omni-1.1-flash-ext',
};

test('catalog covers every generation model in the public marketplace snapshot', () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL('./fixtures/apimart-catalog.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.models.length, 213);
  const models = PROVIDER_MODELS_MAP.APIMart;
  assert.equal(new Set(models.map((m) => m.id)).size, models.length);
  for (const item of snapshot.models) {
    if (item.excluded) continue;
    const id = aliases[item.id] || item.id;
    assert.ok(models.some((m) => m.modelId === id && m.category === (item.category === 'chat' ? 'text' : item.category)), item.id);
  }
  for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr']) {
    const descriptions = JSON.parse(fs.readFileSync(new URL(`../src/locales/${locale}/models.json`, import.meta.url), 'utf8')).modelDescriptions;
    for (const model of models) assert.ok(descriptions[model.id], `${locale}/${model.id}`);
  }
});

test('endpoint normalization preserves configured proxy roots', () => {
  for (const suffix of ['', '/v1', '/v1/images/generations', '/v1/videos/generations', '/v1/chat/completions', '/v1/music/generations', '/v1/audio/speech']) {
    assert.equal(apimartBaseUrl(`https://proxy.example/gateway${suffix}`), 'https://proxy.example/gateway/v1');
  }
  assert.equal(apimartBaseUrl(), 'https://api.apimart.ai/v1');
});

test('every bundled text model uses APIMart chat and its declared sampling contract', async () => {
  await withFetch(chatResponse, async (calls) => {
    const generator = buildTextGenerator('APIMart', 'key');
    for (const model of APIMART_TEXT_MODELS) {
      assert.deepEqual(await generator.generate({ modelId: model.modelId, prompt: 'hello', systemPrompt: 'system', temperature: 0.7, maxTokens: 2048 }), { ok: true, text: 'A response' });
      const call = calls.at(-1)!;
      assert.equal(call.url, 'https://api.apimart.ai/v1/chat/completions');
      assert.equal(call.body.model, model.modelId);
      assert.equal(call.body.stream, false);
      assert.equal('temperature' in call.body, !!model.options.temperatures?.length, model.modelId);
      assert.equal(call.body.max_tokens, 2048);
    }
  });
});

test('text images, assistant tools, and custom endpoint are supported', async () => {
  await withFetch(chatResponse, async (calls) => {
    const generator = buildTextGenerator('APIMart', 'key', 'https://proxy.example/api/v1/images/generations');
    assert.equal((await generator.generate({ modelId: 'gpt-4o', prompt: 'describe', refImagesBase64: ['aGk='] })).ok, true);
    assert.equal(calls[0].url, 'https://proxy.example/api/v1/chat/completions');
    assert.equal(calls[0].body.messages[0].content[0].image_url.url, 'data:image/png;base64,aGk=');
    assert.equal((await generator.generate({ modelId: 'deepseek-v4-pro', prompt: 'describe', refImagesBase64: ['aGk='] })).ok, false);
    assert.equal(calls.length, 1);
    assert.ok(isAssistantCapableProviderType('APIMart'));
    const assistant = buildChatProvider('APIMart', 'key');
    assert.equal((await assistant.chat({ modelId: 'gpt-6.1-sol', messages: [{ role: 'user', content: 'hello' }], tools: [], temperature: 0.7 })).text, 'A response');
    assert.equal(calls[1].url, 'https://api.apimart.ai/v1/chat/completions');
    assert.equal('temperature' in calls[1].body, false);
  });
});

test('every video model submits with the documented endpoint and required media', async () => {
  await withFetch(accepted, async (calls) => {
    const generator = buildVideoGenerator('APIMart', 'key');
    for (const model of APIMART_VIDEO_MODELS) {
      const needsImage = /motion-control|^viduq(?:3$|3-mix|4-preview)|^wan2.6-i2v|Hailuo-2.3-Fast/.test(model.modelId);
      const needsVideo = /motion-control|^wan2.7-videoedit/.test(model.modelId);
      const result = await generator.generate({ modelId: model.modelId, prompt: 'A cat',
        aspectRatio: model.options.aspectRatios?.[0], resolution: model.options.resolutions?.[0], duration: model.options.durations?.[0],
        ...(needsImage ? { refImageUrls: ['https://example.com/cat.png'] } : {}),
        ...(needsVideo ? { refVideoUrls: ['https://example.com/cat.mp4'] } : {}),
        ...(model.modelId === 'wan2.7-r2v' ? { refImageUrls: ['https://example.com/cat.png'] } : {}),
      });
      assert.deepEqual(result, { ok: true, status: 'processing', taskId: 'task-1' }, model.modelId);
      const call = calls.at(-1)!;
      assert.equal(call.url, 'https://api.apimart.ai/v1/videos/generations');
      assert.equal(call.body.model, model.modelId);
      assert.equal('duration' in call.body, !!model.options.durations, model.modelId);
      assert.equal('resolution' in call.body, !!model.options.resolutions, model.modelId);
    }
  });
});

test('video parameter families map image, video, audio, sound and framing fields', async () => {
  await withFetch(accepted, async (calls) => {
    const generator = buildVideoGenerator('APIMart', 'key');
    await generator.generate({ modelId: 'seedance-2.5', prompt: 'cat', aspectRatio: '9:16', resolution: '1080p', duration: 12, sound: 'on', refAudioUrls: ['https://example.com/a.mp3'] });
    assert.deepEqual(calls.at(-1)!.body, { model: 'seedance-2.5', prompt: 'cat', size: '9:16', resolution: '1080p', duration: 12, generate_audio: true, audio_urls: ['https://example.com/a.mp3'] });
    await generator.generate({ modelId: 'veo3.1-fast-official', prompt: 'cat', refImageUrls: ['https://example.com/first.png', 'https://example.com/last.png'] });
    assert.equal(calls.at(-1)!.body.first_frame_image, 'https://example.com/first.png');
    assert.equal(calls.at(-1)!.body.last_frame_image, 'https://example.com/last.png');
    assert.equal('image_urls' in calls.at(-1)!.body, false);
    await generator.generate({ modelId: 'grok-imagine-video', prompt: 'edit', duration: 5, refVideoUrls: ['https://example.com/a.mp4'] });
    assert.deepEqual(calls.at(-1)!.body, { model: 'grok-imagine-video', prompt: 'edit', video: { url: 'https://example.com/a.mp4' } });
    await generator.generate({ modelId: 'gemini-omni-1.1-flash-ext', prompt: 'edit', duration: 8, refVideoUrls: ['https://example.com/a.mp4'] });
    assert.equal('duration' in calls.at(-1)!.body, false);
    await generator.generate({ modelId: 'wan2.7-r2v', prompt: 'cat', refImageUrls: ['https://example.com/cat.png'] });
    assert.deepEqual(calls.at(-1)!.body.image_with_roles, [{ url: 'https://example.com/cat.png', role: 'reference_image' }]);
  });
});

test('video uploads data images and rejects incompatible combinations before paid submission', async () => {
  await withFetch((call) => call.url.endsWith('/uploads/images') ? Response.json({ data: { url: 'https://example.com/ref.png' } }) : accepted(), async (calls) => {
    const generator = buildVideoGenerator('APIMart', 'key');
    assert.equal((await generator.generate({ modelId: 'seedance-2.5', prompt: 'cat', refImagesBase64: ['aGk='] })).ok, true);
    assert.ok(calls[0].init.body instanceof FormData);
    assert.deepEqual(calls[1].body.image_urls, ['https://example.com/ref.png']);
    const count = calls.length;
    for (const req of [
      { modelId: 'viduq4-preview' }, { modelId: 'kling-v3-motion-control' },
      { modelId: 'wan2.7-videoedit' }, { modelId: 'MiniMax-Hailuo-2.3-Fast' },
      { modelId: 'MiniMax-Hailuo-2.3', resolution: '1080p', duration: 10 },
      { modelId: 'wan2.7', refAudioUrls: ['https://example.com/a.mp3'], refImageUrls: ['https://example.com/a.png'] },
    ]) assert.equal((await generator.generate({ prompt: 'cat', ...req })).ok, false, req.modelId);
    assert.equal(calls.length, count);
  });
});

test('video task completion handles nested URL arrays, failures and temporary query failures', async () => {
  let status = 'completed';
  await withFetch((call) => call.url.includes('/tasks/')
    ? (status === 'http-error' ? new Response('temporary', { status: 503 }) : Response.json({ code: 200, data: { status, result: { videos: [{ url: ['https://example.com/a.mp4'] }] }, error: { message: 'upstream failure' } } }))
    : new Response('video-bytes', { headers: { 'content-type': 'video/mp4' } }), async () => {
    const generator = buildVideoGenerator('APIMart', 'key');
    const result = await generator.checkStatus('task/1');
    assert.equal(result.status, 'completed');
    assert.equal(result.videoBytes?.toString(), 'video-bytes');
    status = 'failed';
    assert.deepEqual(await generator.checkStatus('task/1'), { status: 'failed', error: 'upstream failure' });
    status = 'http-error';
    assert.deepEqual(await generator.checkStatus('task/1'), { status: 'processing' });
  });
});

test('Suno and Flow Music submit each selected version with API IDs unchanged', async () => {
  await withFetch(accepted, async (calls) => {
    const generator = buildAudioGenerator('APIMart', 'key');
    for (const model of APIMART_AUDIO_MODELS.filter((m) => m.modelId !== 'gpt-4o-mini-tts')) {
      const result = await generator.generate({ prompt: 'A warm jazz ballad', modelId: model.modelId, modelVariant: model.modelVariant, audioConfig: musicConfig });
      assert.deepEqual(result, { ok: true, status: 'processing', taskId: 'task-1' });
      assert.equal(calls.at(-1)!.url, 'https://api.apimart.ai/v1/music/generations');
      assert.equal(calls.at(-1)!.body.model, model.modelId);
      assert.equal(calls.at(-1)!.body.version, model.modelVariant);
    }
    await generator.generate({ prompt: '[Verse]\nHello world', modelId: 'suno', audioConfig: musicConfig });
    assert.equal(calls.at(-1)!.body.custom, true);
    await generator.generate({ prompt: 'Jazz', modelId: 'suno', audioConfig: { kind: 'remix-audio-music', mode: 'instrumental' } });
    assert.equal(calls.at(-1)!.body.instrumental, true);
    const count = calls.length;
    assert.equal((await generator.generate({ prompt: 'x'.repeat(3001), modelId: 'suno', audioConfig: musicConfig })).ok, false);
    assert.equal(calls.length, count);
  });
});

test('TTS preserves saved voices and reconciles voice selection when switching providers', async () => {
  const model = APIMART_AUDIO_MODELS.find((m) => m.modelId === 'gpt-4o-mini-tts')!;
  const config = parseAudioProjectConfig(serializeAudioProjectConfig({ kind: 'remix-audio-tts', mode: 'single', speakers: [{ name: 'Narrator', voice: 'nova' }] }));
  assert.equal(config.kind === 'remix-audio-tts' && config.speakers[0].voice, 'nova');
  assert.equal((parseAudioProjectConfig(undefined, model) as any).speakers[0].voice, 'alloy');
  const gemini = PROVIDER_MODELS_MAP.GoogleAI.find((m) => m.options.voices?.length)!;
  assert.ok(gemini.options.voices!.includes((parseAudioProjectConfig(serializeAudioProjectConfig(config), gemini) as any).speakers[0].voice));
  await withFetch(() => new Response('audio', { headers: { 'content-type': 'audio/aac' } }), async (calls) => {
    const result = await buildAudioGenerator('APIMart', 'key').generate({ prompt: 'hello', modelId: model.modelId, audioConfig: config, outputFormat: 'aac' });
    assert.ok(result.ok && 'audioBytes' in result);
    assert.equal(calls[0].url, 'https://api.apimart.ai/v1/audio/speech');
    assert.equal(calls[0].body.voice, 'nova');
    assert.equal(calls[0].body.response_format, 'aac');
  });
});

test('music tasks use their separate polling endpoint and prefer lossless audio', async () => {
  await withFetch((call) => call.url.includes('/music/tasks/') ? Response.json({ data: { status: 'completed', result: { music: [{ audio_url: 'https://example.com/a.mp3', wav_url: 'https://example.com/a.wav', lyrics: 'lyrics' }] } } }) : new Response('audio'), async (calls) => {
    const generator = buildAudioGenerator('APIMart', 'key');
    const result = await generator.checkStatus!('task-1');
    assert.equal(result.status, 'completed');
    assert.equal(result.audioBytes?.toString(), 'audio');
    assert.equal(calls[0].url, 'https://api.apimart.ai/v1/music/tasks/task-1');
    assert.equal(calls[1].url, 'https://example.com/a.wav');
  });
});

test('API model listing honors key scope, categories, channel aliases and version deduplication', async () => {
  await withFetch(() => Response.json({ data: ['gpt-6.1-sol', 'suno', 'Omni-Flash-Ext', 'seedream-4-5', 'unimplemented-model'].map((id) => ({ id })) }), async (calls) => {
    const result = await listProviderModels('APIMart', 'key', 'https://proxy.example/v1');
    assert.equal(result.error, undefined);
    assert.equal(calls[0].url, 'https://proxy.example/v1/models?expand=category');
    assert.deepEqual(result.models.map((m) => m.category).sort(), ['audio', 'image', 'text', 'video']);
    assert.equal(result.models.filter((m) => m.id === 'suno').length, 1);
  });
});

test('new image models submit their exact parameter contracts', async () => {
  await withFetch(accepted, async (calls) => {
    const generator = new APIMartGenerator('key');
    assert.equal((await generator.generate({ modelId: 'gpt-image-2.6', prompt: 'cat', aspectRatio: '1:1', imageSize: '2K High' })).ok, true);
    assert.equal(calls[0].body.resolution, '2k');
    assert.equal(calls[0].body.quality, 'high');
    assert.equal((await generator.generate({ modelId: 'mai-image-2.7', prompt: 'edit', aspectRatio: '1:1', imageSize: '2K', refImageUrls: ['https://example.com/a.png'] })).ok, true);
    assert.equal('size' in calls[1].body, false);
    assert.equal('resolution' in calls[1].body, false);
    assert.equal((await generator.generate({ modelId: 'mai-image-2.7', prompt: 'edit' })).ok, false);
    await generator.generate({ modelId: 'seedream-5.5', prompt: 'cat', aspectRatio: 'auto', imageSize: '1.5K' });
    assert.equal(calls[2].body.size, 'auto');
    assert.equal(calls[2].body.resolution, '1.5K');
  });
});

test('audio queue persists the task and recovered tasks never repeat the paid POST', async () => {
  const updates: any[] = [];
  const manager = new QueueManager({} as any, {} as any, { updateJob: async (...args: any[]) => updates.push(args[3]) } as any,
    {} as any, {} as any, {} as any, {} as any, {} as any, { start() {} } as any);
  await withFetch(accepted, async (calls) => {
    const model = APIMART_AUDIO_MODELS.find((m) => m.modelVariant === 'v6-wild')!;
    const job = { id: 'job', prompt: 'Jazz', modelConfigId: model.id };
    const provider = { id: 'provider', type: 'APIMart' };
    const run = () => (manager as any).executeAudioJob('user', 'project', job, { systemPrompt: serializeAudioProjectConfig(musicConfig) }, provider, 'key');
    assert.equal(await run(), true);
    assert.equal(updates[0].taskId, 'task-1');
    assert.equal(calls[0].body.version, 'v6-wild');
    Object.assign(job, { taskId: 'task-1' });
    assert.equal(await run(), true);
    assert.equal(calls.length, 1);
  });
});

test('detached music completion reaches the audio processor and releases its slot', async () => {
  const processed: any[] = [], finalized: any[] = [];
  const poller = new DetachedPoller({ job: { findUnique: async () => ({ status: 'processing', taskId: 'task-1' }) } } as any,
    { getProvider: async () => ({ id: 'provider', type: 'APIMart' }), getDecryptedApiKey: async () => 'key' } as any,
    {} as any, {} as any, {} as any, undefined, { processCompletedAudio: async (p: any) => processed.push(p) } as any);
  poller.setOnJobFinalize((...args) => finalized.push(args));
  await withFetch((call) => call.url.includes('/music/tasks/') ? Response.json({ data: { status: 'completed', result: { music: [{ wav_url: 'https://example.com/a.wav' }] } } }) : new Response('music'), async () => {
    await (poller as any).checkJobStatus('user', 'project', { id: 'job', providerId: 'provider', taskId: 'task-1' }, 'audio');
    assert.equal(processed[0].audioBytes.toString(), 'music');
    assert.deepEqual(finalized, [['provider', 'job']]);
  });
});

test('failed detached music tasks clear their task ID and release the slot', async () => {
  const updates: any[] = [], finalized: any[] = [];
  const poller = new DetachedPoller({ job: { findUnique: async () => ({ status: 'processing', taskId: 'task-1' }) } } as any,
    { getProvider: async () => ({ id: 'provider', type: 'APIMart' }), getDecryptedApiKey: async () => 'key' } as any,
    { updateJob: async (...args: any[]) => updates.push(args[3]) } as any, {} as any, {} as any, undefined,
    { processCompletedAudio: async () => { throw new Error('Must not process failed audio'); } } as any);
  poller.setOnJobFinalize((...args) => finalized.push(args));
  await withFetch(() => Response.json({ data: { status: 'failed', error: { message: 'Music generation failed upstream' } } }), async (calls) => {
    await (poller as any).checkJobStatus('user', 'project', { id: 'job', providerId: 'provider', taskId: 'task-1' }, 'audio');
    assert.deepEqual(updates, [{ status: 'failed', error: 'Music generation failed upstream', taskId: null }]);
    assert.deepEqual(finalized, [['provider', 'job']]);
    assert.equal(calls.length, 1);
  });
});

test('temporary music query failure keeps the task and slot for the next poll', async () => {
  const generator = buildAudioGenerator('APIMart', 'key');
  await withFetch(() => new Response('try again', { status: 503 }), async (calls) => {
    assert.deepEqual(await generator.checkStatus!('task-1'), { status: 'processing' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, 'GET');
  });
});

// Provider contract tests use mock responses only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { buildChatProvider } from '../server/assistant/chat-provider-factory';
import { buildAudioGenerator } from '../server/generators/build-audio-generator';
import { buildGenerator } from '../server/generators/build-generator';
import { buildVideoGenerator } from '../server/generators/build-video-generator';
import { buildTextGenerator } from '../server/generators/build-text-generator';
import { PROVIDER_MODELS_MAP, createDefaultAudioProjectConfig } from '../src/types';

type Call = { url: string; method: string; body: any; headers: Headers };
const bytes = Buffer.from('mock media');
const data = bytes.toString('base64');

async function mockFetch(
  respond: (call: Call) => Response,
  run: (calls: Call[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const raw = await request.text();
    const call = { url: request.url, method: request.method, headers: request.headers, body: raw ? JSON.parse(raw) : undefined };
    calls.push(call);
    return respond(call);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test('saved model IDs resolve to supported replacements', () => {
  for (const id of ['google-veo-3.1-video', 'google-veo-3.1-lite-video']) {
    assert.equal(PROVIDER_MODELS_MAP.GoogleAI.find((model) => model.id === id)?.modelId, 'gemini-omni-1.2-flash');
  }
  assert.equal(PROVIDER_MODELS_MAP.GoogleAI.find((model) => model.id === 'google-gemini-3.1-flash-tts-audio')?.modelId, 'gemini-3.8-flash-lite-tts');
  assert.equal(PROVIDER_MODELS_MAP.BytePlus.find((model) => model.id === 'byteplus-seedance-1-5-pro-video')?.modelId, 'dreamina-seedance-2-0-mini-260615');
});

test('Google Omni can resume a background task after a generator is recreated', async () => {
  await mockFetch((call) => {
    if (call.method === 'POST') return Response.json({ id: 'omni-1', status: 'in_progress' });
    return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', data, mime_type: 'video/mp4' }] }] });
  }, async (calls) => {
    const result = await buildVideoGenerator('GoogleAI', 'key').generate({
      modelId: 'veo-3.1-generate-preview',
      prompt: 'A city at dusk',
      refVideoUrls: ['https://media.example/source.mp4'],
      refImagesBase64: [data],
      duration: 15,
      aspectRatio: '9:16',
    });
    assert.deepEqual(result, { ok: true, status: 'processing', taskId: 'omni:omni-1' });
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.deepEqual(calls[0].body.response_format, { type: 'video', aspect_ratio: '9:16', resolution: '720p', duration: '10s' });
    assert.equal(calls[0].body.background, true);
    assert.equal(calls[0].body.input[1].uri, 'https://media.example/source.mp4');
    assert.deepEqual(await buildVideoGenerator('GoogleAI', 'key').checkStatus('omni:omni-1'), {
      status: 'completed', videoBytes: bytes, mimeType: 'video/mp4',
    });
    assert.match(calls[1].url, /\/interactions\/omni-1$/);
  });
});

test('Vertex Veo submits and polls the configured project endpoint', async () => {
  const taskId = 'projects/project/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/task';
  await mockFetch((call) => call.url.endsWith(':predictLongRunning')
    ? Response.json({ name: taskId })
    : Response.json({ done: true, response: { videos: [{ bytesBase64Encoded: data, mimeType: 'video/mp4' }] } }), async (calls) => {
    const generator = buildVideoGenerator('VertexAI', 'token', 'https://us-central1-aiplatform.googleapis.com/v1/projects/project/locations/us-central1');
    assert.deepEqual(await generator.generate({ modelId: 'veo-3.1-fast-generate-001', prompt: 'A city', refImagesBase64: [data, data], duration: 6, sound: 'off' }),
      { ok: true, status: 'processing', taskId });
    assert.equal(calls[0].headers.get('authorization'), 'Bearer token');
    assert.equal(calls[0].body.parameters.generateAudio, false);
    assert.equal(calls[0].body.instances[0].lastFrame.bytesBase64Encoded, data);
    assert.deepEqual(await generator.checkStatus(taskId), { status: 'completed', videoBytes: bytes, mimeType: 'video/mp4' });
    assert.match(calls[1].url, /:fetchPredictOperation$/);
    assert.deepEqual(calls[1].body, { operationName: taskId });
  });
});

test('Lyria 3.5 polls music and retains associated lyrics', async () => {
  await mockFetch((call) => call.method === 'POST'
    ? Response.json({ id: 'music-1' })
    : Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [
      { type: 'text', text: 'Lyrics' }, { type: 'audio', data, mime_type: 'audio/wav' },
    ] }] }), async (calls) => {
    const generator = buildAudioGenerator('GoogleAI', 'key');
    assert.deepEqual(await generator.generate({
      modelId: 'lyria-3.5',
      prompt: 'A folk song',
      audioConfig: createDefaultAudioProjectConfig('music'),
      outputFormat: 'wav',
    }), { ok: true, status: 'processing', taskId: 'music-1' });
    assert.deepEqual(calls[0].body.response_format, { type: 'audio', mime_type: 'audio/wav' });
    assert.deepEqual(await generator.checkStatus!('music-1'), {
      status: 'completed', audioBytes: bytes, mimeType: 'audio/wav', text: 'Lyrics',
    });
  });
});

test('GPT-6.2 assistant tool calls round-trip their Responses IDs and reasoning', async () => {
  await mockFetch(() => Response.json({
    id: 'resp_test',
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_test', encrypted_content: 'opaque', summary: [] },
      { type: 'function_call', call_id: 'call_test', name: 'lookup', arguments: '{"value":"hi"}' },
      { type: 'message', content: [{ type: 'output_text', text: 'Found it' }] },
    ],
  }), async (calls) => {
    const provider = buildChatProvider('OpenAI', 'key');
    const tools: Parameters<typeof provider.chat>[0]['tools'] = [{
      name: 'lookup',
      title: 'Lookup',
      description: 'Look up a value',
      inputSchema: { value: z.string() },
      category: 'read',
      annotations: { readOnlyHint: true, destructiveHint: false },
      handler: async () => ({ text: 'Found it' }),
    }];
    const user = { role: 'user', content: 'find it' } as const;
    const first = await provider.chat({ modelId: 'gpt-6.2-sol', messages: [user], tools, temperature: 0.5 });
    assert.equal(first.stopReason, 'tool_use');
    assert.equal(first.toolCalls[0].id, 'call_test');
    assert.match(calls[0].url, /\/v1\/responses$/);
    assert.equal(calls[0].body.temperature, undefined);
    await provider.chat({ modelId: 'gpt-6.2-sol', tools, messages: [
      user,
      { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
      { role: 'tool', toolCallId: 'call_test', name: 'lookup', content: '{"ok":true}' },
    ] });
    assert.deepEqual(calls[1].body.input.filter((item: any) => item.type === 'reasoning' || item.type === 'function_call_output'), [
      { type: 'reasoning', id: 'rs_test', encrypted_content: 'opaque', summary: [] },
      { type: 'function_call_output', call_id: 'call_test', output: '{"ok":true}' },
    ]);
  });
});

test('GPT Image 2.6 sends high quality and transparent background through the configured endpoint', async () => {
  await mockFetch(() => Response.json({ data: [{ b64_json: data }] }), async (calls) => {
    const generator = buildGenerator('OpenAI', 'key', 'https://provider.example/v1');
    const result = await generator.generate({ modelId: 'gpt-image-2.6-flare', prompt: 'A coat', imageSize: 'max', background: 'transparent', format: 'png' });
    assert.deepEqual(result, { ok: true, imageBytes: bytes });
    assert.equal(calls[0].url, 'https://provider.example/v1/images/generations');
    assert.equal(calls[0].body.quality, 'max');
    assert.equal(calls[0].body.background, 'transparent');
  });
});

test('Gemini 4 Neon omits unsupported sampling', async () => {
  await mockFetch(() => Response.json({ candidates: [{ content: { parts: [{ text: 'response' }] }, finishReason: 'STOP' }] }), async (calls) => {
    for (const type of ['GoogleAI', 'VertexAI'] as const) {
      assert.equal((await buildTextGenerator(type, 'key').generate({ modelId: 'gemini-4-neon', prompt: 'hello', temperature: 0.7 })).ok, true);
    }
    for (const call of calls) {
      assert.match(call.url, /\/models\/gemini-4-neon:generateContent/);
      assert.equal(call.body.generationConfig.temperature, undefined);
    }
  });
});

test('replicate new official models use model-specific prediction endpoints', async () => {
  await mockFetch(() => Response.json({ id: 'prediction', status: 'starting' }), async (calls) => {
    await buildGenerator('Replicate', 'key').generate({ modelId: 'black-forest-labs/flux-3-image', prompt: 'A tree', imageSize: '2k', refImagesBase64: [data] });
    assert.match(calls[0].url, /\/models\/black-forest-labs\/flux-3-image\/predictions$/);
    assert.equal(calls[0].body.version, undefined);
    assert.deepEqual(calls[0].body.input.images, [`data:image/png;base64,${data}`]);
    await buildVideoGenerator('Replicate', 'key').generate({ modelId: 'bytedance/seedance-2.5', prompt: 'Animate', refImagesBase64: [data, data] });
    assert.match(calls[1].url, /\/models\/bytedance\/seedance-2.5\/predictions$/);
    assert.equal(calls[1].body.input.aspect_ratio, 'adaptive');
    assert.ok(calls[1].body.input.last_frame_image);
  });
});

test('MiniMax routes H3 image edits and Speech 2.8 to their own endpoints', async () => {
  await mockFetch((call) => call.method === 'GET' ? new Response(bytes)
    : call.url.endsWith('/t2a_v2') ? Response.json({ data: { audio: bytes.toString('hex') } })
    : Response.json({ data: [{ url: 'https://media.example/result' }] }), async (calls) => {
    assert.equal((await buildGenerator('MiniMax', 'key').generate({
      modelId: 'MiniMax-H3-Image', prompt: 'recolor', refImageUrls: ['https://media.example/source.png'], aspectRatio: '16:9', imageSize: '2K',
    })).ok, true);
    assert.match(calls[0].url, /\/v1\/images\/edits$/);
    assert.deepEqual(calls[0].body.images, [{ image_url: 'https://media.example/source.png' }]);
    assert.equal(calls[0].body.area, '2K');
    assert.equal((await buildAudioGenerator('MiniMax', 'key').generate({
      modelId: 'speech-2.8-hd', prompt: 'Hello', audioConfig: createDefaultAudioProjectConfig('tts'),
    })).ok, true);
    assert.match(calls[2].url, /\/v1\/t2a_v2$/);
    assert.equal(calls[2].body.voice_setting.voice_id, 'English_expressive_narrator');
  });
});

test('APIMart distinguishes Kling long-image variants and Seedance Flash fields', async () => {
  await mockFetch(() => Response.json({ code: 202, data: { id: 'task', status: 'pending' } }), async (calls) => {
    const image = buildGenerator('APIMart', 'key');
    const url = 'https://media.example/product.png';
    assert.equal((await image.generate({ modelId: 'kling-v4-long-image', modelVariant: 'webpage', prompt: 'Coffee', imageSize: '2K', refImageUrls: [url] })).ok, true);
    assert.deepEqual(calls[0].body, {
      model: 'kling-v4-long-image', prompt: 'Coffee', resolution: '2K', skill: 'webpage',
      image_with_roles: [{ url, role: 'style' }],
    });
    assert.equal((await image.generate({ modelId: 'kling-v4-long-image', modelVariant: 'ecommerce', prompt: 'Coffee', refImageUrls: [url] })).ok, true);
    assert.deepEqual(calls[1].body.image_urls, [url]);
    assert.equal(calls[1].body.skill, 'ecommerce');
    const video = buildVideoGenerator('APIMart', 'key');
    assert.equal((await video.generate({ modelId: 'seedance-2-5-flash', prompt: 'A city', aspectRatio: '9:16', resolution: '1080p', sound: 'off' })).ok, true);
    assert.equal(calls[2].body.size, '9:16');
    assert.equal(calls[2].body.resolution, '720p');
    assert.equal(calls[2].body.generate_audio, false);
  });
});

test('BytePlus sends Seedream 5.5 dimensions and routes Seedance 2.5 Flash', async () => {
  await mockFetch((call) => call.url.includes('/images/generations')
    ? Response.json({ data: [{ b64_json: data }] })
    : Response.json({ id: 'task' }), async (calls) => {
    await buildGenerator('BytePlus', 'key').generate({ modelId: 'dola-seedream-5-5-261028', prompt: 'A sketch', aspectRatio: '1:1', imageSize: '1.5K' });
    assert.equal(calls[0].body.model, 'dola-seedream-5-5-261028');
    assert.equal(calls[0].body.size, '1536x1536');
    const result = await buildVideoGenerator('BytePlus', 'key').generate({ modelId: 'dreamina-seedance-2-5-flash-261115', prompt: 'A dog', resolution: '480p' });
    assert.deepEqual(result, { ok: true, status: 'processing', taskId: 'task' });
    assert.equal(calls[1].body.model, 'dreamina-seedance-2-5-flash-261115');
    assert.equal(calls[1].body.resolution, '480p');
  });
});

test('FLUX 3 uses its native image array instead of FLUX.2 fields', async () => {
  await mockFetch(() => Response.json({ polling_url: 'https://api.bfl.ai/v1/get_result?id=job' }), async (calls) => {
    const generator = buildGenerator('BlackForestLabs', 'key');
    assert.equal((await generator.generate({ modelId: 'flux-3-image', prompt: 'A tree', imageSize: '2k', aspectRatio: '16:9', refImagesBase64: [data] })).ok, true);
    assert.equal(calls[0].url, 'https://api.bfl.ai/v1/flux-3-image');
    assert.deepEqual(calls[0].body, { prompt: 'A tree', resolution: '2k', aspect_ratio: '16:9', images: [`data:image/png;base64,${data}`] });
  });
});

test('Gemini 3.8 TTS sends individual turns with the matching speaker and voice', async () => {
  await mockFetch(() => Response.json({ candidates: [{
    content: { parts: [{ inlineData: { data, mimeType: 'audio/L16;rate=24000' } }] },
    finishReason: 'STOP',
  }] }), async (calls) => {
    const generator = buildAudioGenerator('VertexAI', 'token', 'https://aiplatform.googleapis.com/v1/projects/project/locations/global');
    assert.equal((await generator.generate({
      modelId: 'gemini-3.8-flash-tts',
      prompt: 'Read in a calm tone.\nAlice: Good morning.\nBob: Good morning to you.',
      audioConfig: { kind: 'remix-audio-tts', mode: 'multi', speakers: [{ name: 'Alice', voice: 'Kore' }, { name: 'Bob', voice: 'Puck' }] },
    })).ok, true);
    assert.equal(calls[0].headers.get('authorization'), 'Bearer token');
    assert.match(calls[0].url, /\/v1\/projects\/project\/locations\/global\/publishers\/google\/models\/gemini-3\.8-flash-tts:generateContent$/);
    assert.deepEqual(calls[0].body.contents[0].parts, [
      { text: 'Good morning.', speechMetadata: { speaker: 'Alice', style: 'Read in a calm tone.' } },
      { text: 'Good morning to you.', speechMetadata: { speaker: 'Bob' } },
    ]);
    assert.deepEqual(calls[0].body.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[1], {
      speaker: 'Bob', voiceConfig: { voice: 'Puck' },
    });
  });
});

test('Kimi K3.1 omits fixed sampling and retains reasoning with tool calls', async () => {
  await mockFetch(() => Response.json({ choices: [{ message: {
    content: null,
    reasoning_content: 'Plan the lookup.',
    tool_calls: [{ id: 'call_kimi', type: 'function', function: { name: 'lookup', arguments: '{ "value": "hi" }' } }],
  }, finish_reason: 'tool_calls' }] }), async (calls) => {
    const provider = buildChatProvider('Kimi', 'key');
    const user = { role: 'user', content: 'find it' } as const;
    const first = await provider.chat({ modelId: 'kimi-k3.1-pro', messages: [user], tools: [], temperature: 0.5 });
    assert.equal(first.stopReason, 'tool_use');
    assert.equal(calls[0].body.temperature, undefined);
    await provider.chat({ modelId: 'kimi-k3.1-pro', tools: [], messages: [
      user,
      { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
      { role: 'tool', toolCallId: 'call_kimi', name: 'lookup', content: 'hi' },
    ] });
    assert.equal(calls[1].body.messages[1].reasoning_content, 'Plan the lookup.');
    assert.equal(calls[1].body.messages[1].tool_calls[0].function.arguments, '{ "value": "hi" }');
  });
});

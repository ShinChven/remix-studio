// Run without credentials or a database: node --import tsx --test scripts/test-apimart-generator.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { APIMartGenerator } from '../server/generators/apimart-generator';
import type { GenerateRequest } from '../server/generators/image-generator';
import { PROVIDER_MODELS_MAP } from '../src/types';

type Call = { url: string; init: RequestInit };

async function withFetch(
  respond: (call: Call) => Response,
  run: (calls: Call[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), init: init || {} };
    calls.push(call);
    return respond(call);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const accepted = () => Response.json(
  { code: 202, data: { id: 'task_test', status: 'pending' } },
  { status: 202 },
);

const contracts: Array<{
  model: string;
  quality?: string;
  ratio?: string;
  refs?: string[];
  expected: Record<string, unknown>;
  omitted?: string[];
}> = [
  { model: 'gemini-nano-banana-2.1', quality: '4K', ratio: '1:8', expected: { resolution: '4K', size: '1:8' } },
  { model: 'gemini-nano-banana-2.1-ext', quality: '2K', expected: { resolution: '2K' } },
  { model: 'gemini-3.1-flash-image-preview-official', quality: '0.5K', expected: { resolution: '0.5K' } },
  { model: 'gemini-3.1-flash-lite-image-ext', quality: '1K', expected: { resolution: '1K' } },
  { model: 'gemini-3-pro-image-preview-official', quality: '4K', expected: { resolution: '4K' } },
  { model: 'gemini-2.5-flash-image-preview-official', quality: '1K', expected: {}, omitted: ['resolution'] },
  { model: 'gpt-image-1-official', quality: 'high', expected: { quality: 'high' }, omitted: ['resolution'] },
  { model: 'gpt-image-1.5-official', quality: 'auto', expected: { quality: 'auto' }, omitted: ['resolution'] },
  { model: 'gpt-image-2-official', quality: '4K Auto', expected: { resolution: '4k', quality: 'auto' } },
  { model: 'gpt-image-2.5-sunburst', quality: '2K Max', ratio: '1:3', expected: { resolution: '2k', quality: 'max', size: '1:3' } },
  { model: 'gpt-image-2.5-ext', quality: '4K Sunburst', expected: { resolution: '4K', version: 'sunburst' }, omitted: ['quality'] },
  { model: 'gpt-image-2.5-ext', quality: '1K Flare', expected: { resolution: '1K', version: 'flare' }, omitted: ['quality'] },
  { model: 'seedream-4.0', quality: '2K', ratio: 'auto', expected: { resolution: '2K' }, omitted: ['size'] },
  { model: 'seedream-5-0-pro', quality: '1.5K', ratio: 'auto', expected: { resolution: '1.5K', size: 'auto' } },
  { model: 'seedream-5-0-flash', quality: '2K', expected: { resolution: '2K' } },
  { model: 'seedream-5-0-lite', quality: '4K', expected: { resolution: '4K' } },
  { model: 'flux-2-max', quality: '3MP', expected: { resolution: '3MP' } },
  { model: 'flux-3-image', quality: '768sq', ratio: '5:7', expected: { resolution: '768SQ', aspect_ratio: '5:7' }, omitted: ['size'] },
  { model: 'flux-3-image-klein', quality: '1.5K', ratio: 'auto', expected: { resolution: '1.5K', aspect_ratio: 'auto' }, omitted: ['size'] },
  { model: 'hy-image-v3.5-preview', quality: '4K', expected: { resolution: '4K' } },
  { model: 'muse-image-ext', quality: '1K', ratio: 'auto', expected: {}, omitted: ['resolution', 'size', 'aspect_ratio'] },
  { model: 'muse-image-ext', ratio: '3:2', expected: { aspect_ratio: '3:2' }, omitted: ['size'] },
  { model: 'mai-image-2.6-flash', quality: '2K', ratio: '4:1', expected: { resolution: '2K', size: '4:1' } },
  { model: 'mai-image-2.6', quality: '2K', refs: ['https://example.com/ref.png'], expected: {}, omitted: ['size', 'resolution'] },
  { model: 'qwen-image-2.0-pro', quality: '2K', expected: { resolution: '2K' } },
  { model: 'qwen-image-3.0-pro', quality: '1K', expected: { resolution: '1K' } },
  { model: 'z-image-turbo', quality: '2K', expected: { resolution: '2K' } },
  { model: 'grok-imagine-image-2.0', quality: '2K Low', ratio: '9:19.5', expected: { resolution: '2k', quality: 'low', aspect_ratio: '9:19.5' }, omitted: ['size'] },
  { model: 'grok-imagine-image-2.0', quality: '2K Low', refs: ['https://example.com/ref.png'], expected: { resolution: '2k' }, omitted: ['size', 'quality'] },
  { model: 'grok-imagine-image-quality', quality: '2K', expected: { resolution: '2k' }, omitted: ['quality', 'size'] },
  { model: 'grok-imagine-image', quality: '1K', expected: { resolution: '1k' }, omitted: ['quality', 'size'] },
  { model: 'grok-imagine-2.0-ext', quality: '1K', expected: {}, omitted: ['resolution'] },
  { model: 'grok-imagine-1.5-apimart', quality: '1K', expected: {}, omitted: ['resolution'] },
  { model: 'wan2.7-image-pro', quality: '4K', expected: { resolution: '4K' } },
  { model: 'wan2.7-image-pro', quality: '4K', refs: ['https://example.com/ref.png'], expected: { resolution: '2K' } },
  { model: 'wan2.7-image', quality: '2K', expected: { resolution: '2K' } },
  { model: 'imagen-4.0-apimart', quality: '2K', expected: {}, omitted: ['resolution'] },
  { model: 'midjourney', quality: '1K', expected: {}, omitted: ['model', 'n', 'resolution', 'quality'] },
];

for (const contract of contracts) {
  test(`APIMart request: ${contract.model}, ${contract.quality || 'default'}${contract.refs ? ', editing' : ''}`, async () => {
    const model = PROVIDER_MODELS_MAP.APIMart.find((m) => m.modelId === contract.model);
    assert.ok(model, 'Model must be selectable from the bundled catalog');
    await withFetch(accepted, async (calls) => {
      const request: GenerateRequest = {
        modelId: model.modelId,
        prompt: 'A cat by a window',
        imageSize: contract.quality,
        aspectRatio: contract.ratio || '1:1',
        refImageUrls: contract.refs,
      };
      const result = await new APIMartGenerator('test-key').generate(request);
      assert.deepEqual(result, { ok: true, status: 'processing', taskId: 'task_test' });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, `https://api.apimart.ai/v1/${contract.model === 'midjourney' ? 'midjourney' : 'images'}/generations`);
      const payload = JSON.parse(String(calls[0].init.body));
      assert.equal(payload.prompt, request.prompt);
      if (contract.model !== 'midjourney') {
        assert.equal(payload.model, contract.model);
        assert.equal(payload.n, 1);
      }
      for (const [key, value] of Object.entries(contract.expected)) assert.deepEqual(payload[key], value, key);
      for (const key of contract.omitted || []) assert.equal(key in payload, false, key);
      if (contract.refs) assert.deepEqual(payload.image_urls, contract.refs);
    });
  });
}

test('default uses Nano Banana 2.1 and accepts legacy asynchronous responses', async () => {
  await withFetch(() => Response.json({ code: 200, data: [{ task_id: 'task_legacy', status: 'submitted' }] }), async (calls) => {
    assert.deepEqual(await new APIMartGenerator('key').generate({ prompt: 'A cat' }), {
      ok: true, status: 'processing', taskId: 'task_legacy',
    });
    assert.equal(JSON.parse(String(calls[0].init.body)).model, 'gemini-nano-banana-2.1');
  });
});

test('text-only models reject references before uploading or submitting', async () => {
  await withFetch(() => { throw new Error('No network request expected'); }, async (calls) => {
    for (const modelId of ['imagen-4.0-apimart', 'z-image-turbo', 'grok-imagine-2.0-ext']) {
      const result = await new APIMartGenerator('key').generate({ prompt: 'A cat', modelId, refImagesBase64: ['aGVsbG8='] });
      assert.equal(result.ok, false);
      if (result.ok === false) assert.match(result.error, /text-to-image only/);
    }
    assert.equal(calls.length, 0);
  });
});

test('uploads local references, then submits Grok editing without quality', async () => {
  await withFetch((call) => call.url.endsWith('/uploads/images')
    ? Response.json({ data: { url: 'https://example.com/upload.png' } }) : accepted(), async (calls) => {
    await new APIMartGenerator('key').generate({
      prompt: 'Add a red hat', modelId: 'grok-imagine-image-2.0', imageSize: '2K Low', refImagesBase64: ['aGVsbG8='],
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api.apimart.ai/v1/uploads/images');
    assert.ok(calls[0].init.body instanceof FormData);
    const payload = JSON.parse(String(calls[1].init.body));
    assert.deepEqual(payload.image_urls, ['https://example.com/upload.png']);
    assert.equal('quality' in payload, false);
  });
});

test('Midjourney endpoint overrides use the unified poller and retain every output', async () => {
  const apiUrl = 'https://proxy.example/v1/midjourney/generations';
  await withFetch((call) => {
    if (call.init.method === 'POST') return accepted();
    if (call.url.includes('/tasks/')) return Response.json({ code: 200, data: {
      status: 'completed', result: { images: [{ url: ['https://example.com/one.png', 'https://example.com/two.png'] }] },
    } });
    return new Response(call.url.endsWith('one.png') ? 'first-image' : 'second-image');
  }, async (calls) => {
    const generator = new APIMartGenerator('key', apiUrl);
    await generator.generate({ prompt: 'A cat --v 8.2', modelId: 'midjourney', apiUrl, aspectRatio: '16:9' });
    assert.equal(calls[0].url, apiUrl);
    const payload = JSON.parse(String(calls[0].init.body));
    assert.equal(payload.prompt, 'A cat --v 8.2');
    assert.equal(payload.size, '16:9');
    const result = await generator.checkStatus('task_test', { apiUrl });
    assert.equal(calls[1].url, 'https://proxy.example/v1/tasks/task_test');
    assert.equal(result.status, 'completed');
    assert.equal(result.imageBytes?.toString(), 'first-image');
    assert.deepEqual(result.additionalImages?.map((b) => b.toString()), ['second-image']);
  });
});

test('provider submission failures remain failures', async () => {
  await withFetch(() => Response.json({ code: 400, error: { message: 'Unsupported resolution' } }, { status: 400 }), async () => {
    const result = await new APIMartGenerator('key').generate({ prompt: 'A cat' });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.match(result.error, /Unsupported resolution/);
  });
});

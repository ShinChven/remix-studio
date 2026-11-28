// Size matching for album rescale: pure functions, no I/O.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  carryQuality,
  carryRatio,
  describeRatio,
  estimateOutputSize,
  matchRatio,
  normalizeImageFormat,
  parseQualityOption,
  parseRatioOption,
  pickRescaleQuality,
} from '../src/lib/rescale-size';
import { PROVIDER_MODELS_MAP } from '../src/types';

const GEMINI_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '4:5', '5:4', '21:9'];
const GPT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', 'auto'];
const PIXEL_RATIOS = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '2048x1152', '1152x2048', '3840x2160', '2160x3840', 'auto'];
const OFFICIAL_QUALITIES = ['1K Auto', '1K High', '2K Auto', '2K High', '4K Auto', '4K High'];

test('parses ratio options', () => {
  assert.deepEqual(parseRatioOption('3:2'), { ratio: 1.5, megapixels: undefined, flexible: false });
  assert.equal(parseRatioOption('1536x1024').megapixels?.toFixed(3), '1.573');
  assert.equal(parseRatioOption('auto').flexible, true);
  assert.equal(parseRatioOption('match_input_image').flexible, true);
  assert.equal(parseRatioOption('weird').ratio, undefined);
});

test('parses quality tiers and words', () => {
  assert.equal(parseQualityOption('2K').megapixels?.toFixed(2), '4.19');
  assert.deepEqual(parseQualityOption('2K High'), { megapixels: (2048 ** 2) / 1e6, qualifier: 'high' });
  assert.deepEqual(parseQualityOption('low/1k'), { megapixels: (1024 ** 2) / 1e6, qualifier: 'low' });
  assert.deepEqual(parseQualityOption('2 MP'), { megapixels: 2, qualifier: '' });
  assert.deepEqual(parseQualityOption('4MP'), { megapixels: 4, qualifier: '' });
  assert.equal(parseQualityOption('768sq').megapixels?.toFixed(3), '0.590');
  assert.deepEqual(parseQualityOption('high'), { megapixels: undefined, qualifier: 'high' });
});

test('matches the source ratio, falling back to a free ratio when nothing fixed is close', () => {
  assert.equal(matchRatio(3000 / 2000, GEMINI_RATIOS), '3:2');
  assert.equal(matchRatio(1.47, GEMINI_RATIOS), '3:2');
  // 1.2:1 is between 5:4 and 4:3, with no free option: nearest wins.
  assert.equal(matchRatio(1.2, GEMINI_RATIOS), '5:4');
  // 2.5:1 has no close fixed ratio; auto lets the model follow the input.
  assert.equal(matchRatio(2.5, GPT_RATIOS), 'auto');
  assert.equal(matchRatio(16 / 9, GPT_RATIOS), '16:9');
  assert.equal(matchRatio(undefined, GPT_RATIOS), 'auto');
  assert.equal(matchRatio(undefined, GEMINI_RATIOS), '1:1');
  assert.equal(matchRatio(1.5, undefined), undefined);
});

test('picks a pixel size one step above the target among the same shape', () => {
  assert.equal(matchRatio(1, PIXEL_RATIOS, 1.0), '1024x1024');
  assert.equal(matchRatio(1, PIXEL_RATIOS, 1.2), '2048x2048');
  assert.equal(matchRatio(1, PIXEL_RATIOS, 9), '2048x2048');
  assert.equal(matchRatio(16 / 9, PIXEL_RATIOS, 2.1), '2048x1152');
  assert.equal(matchRatio(16 / 9, PIXEL_RATIOS, 2.6), '3840x2160');
  assert.equal(matchRatio(16 / 9, PIXEL_RATIOS), '2048x1152');
});

test('carries a ratio to another model', () => {
  assert.equal(carryRatio('3:2', GEMINI_RATIOS), '3:2');
  assert.equal(carryRatio('auto', GEMINI_RATIOS), '1:1');
  assert.equal(carryRatio('auto', GPT_RATIOS), 'auto');
  assert.equal(carryRatio('1536x1024', GEMINI_RATIOS), '3:2');
  assert.equal(carryRatio('21:9', ['1:1', '16:9', '9:16']), '16:9');
});

test('carries a quality to another model', () => {
  assert.equal(carryQuality('2K', ['1K', '2K', '4K']), '2K');
  assert.equal(carryQuality('2k', ['1K', '2K', '4K']), '2K');
  assert.equal(carryQuality('2K High', ['1K', '2K', '4K']), '2K');
  assert.equal(carryQuality('2K', OFFICIAL_QUALITIES), '2K Auto');
  assert.equal(carryQuality('4K High', ['1K Low', '2K Low', '2K High']), '2K High');
  assert.equal(carryQuality('2K', ['1 MP', '2 MP', '4 MP']), '4 MP');
  assert.equal(carryQuality('high', ['low', 'medium', 'high']), 'high');
  assert.equal(carryQuality('2K', ['low', 'medium', 'high']), 'low');
  assert.equal(carryQuality(undefined, ['1K', '2K']), '1K');
  assert.equal(carryQuality('2K', undefined), undefined);
});

test('starts a rescale one tier above the source', () => {
  assert.equal(pickRescaleQuality(['1K', '2K', '4K'], 1.0, '1K'), '2K');
  assert.equal(pickRescaleQuality(['1K', '2K', '4K'], 4.5, '1K'), '4K');
  assert.equal(pickRescaleQuality(['1K', '2K', '4K'], 20, '1K'), '4K');
  assert.equal(pickRescaleQuality(OFFICIAL_QUALITIES, 1.0, '1K High'), '2K High');
  assert.equal(pickRescaleQuality(OFFICIAL_QUALITIES, 1.0), '2K Auto');
  assert.equal(pickRescaleQuality(['low', 'medium', 'high'], 1.0, 'medium'), 'medium');
  assert.equal(pickRescaleQuality(['1K', '2K'], undefined, '1K'), '1K');
});

test('estimates the output size', () => {
  assert.deepEqual(estimateOutputSize(1.5, '1536x1024', '2K'), { width: 1536, height: 1024 });
  const square = estimateOutputSize(1, '1:1', '2K');
  assert.deepEqual(square, { width: 2048, height: 2048 });
  const auto = estimateOutputSize(1.5, 'auto', '2 MP');
  assert.ok(auto && Math.abs(auto.width / auto.height - 1.5) < 0.01 && Math.abs(auto.width * auto.height - 2e6) < 5e3);
  assert.equal(estimateOutputSize(1.5, '3:2', 'high'), undefined);
});

test('describes source ratios and formats', () => {
  assert.equal(describeRatio(3000, 2000), '3:2');
  assert.equal(describeRatio(1920, 1080), '16:9');
  assert.equal(describeRatio(1376, 768), '16:9');
  assert.equal(describeRatio(768, 1376), '9:16');
  assert.equal(describeRatio(1000, 3000), '1:3');
  assert.equal(describeRatio(1471, 1000), '1.47:1');
  assert.equal(normalizeImageFormat('JPG'), 'jpeg');
  assert.equal(normalizeImageFormat('webp'), 'webp');
  assert.equal(normalizeImageFormat('gif'), undefined);
});

test('every built-in image model resolves a ratio and a quality', () => {
  for (const models of Object.values(PROVIDER_MODELS_MAP)) {
    for (const model of models) {
      if (model.category !== 'image') continue;
      const ratio = matchRatio(1.5, model.options.aspectRatios, 4);
      const quality = pickRescaleQuality(model.options.qualities, 1, model.options.qualities?.[0]);
      if (model.options.aspectRatios?.length) assert.ok(model.options.aspectRatios.includes(ratio!), `${model.id}: ratio ${ratio}`);
      if (model.options.qualities?.length) assert.ok(model.options.qualities.includes(quality!), `${model.id}: quality ${quality}`);
    }
  }
});

test('reads image size from the file header and builds one draft per image', async () => {
  const sharp = (await import('sharp')).default;
  const { Readable } = await import('node:stream');
  const { buildRescaleJobs, readImageInfo, resolveRescaleRatio } = await import('../server/services/rescale-drafts');
  // Noise so the JPEG runs well past the header window.
  const raw = Buffer.alloc(1500 * 1000 * 3).map(() => Math.floor(Math.random() * 256));
  const files = new Map<string, Buffer>([
    ['u/p/album/a.jpg', await sharp(raw, { raw: { width: 1500, height: 1000, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()],
    ['u/p/album/b.png', await sharp({ create: { width: 900, height: 1600, channels: 3, background: '#888' } }).png().toBuffer()],
  ]);
  const reads: string[] = [];
  const fullReads: string[] = [];
  const storage = {
    read: async (key: string) => { fullReads.push(key); return files.get(key)!; },
    // 64 KB chunks, so only the head of the large JPEG is read.
    readStream: async (key: string) => {
      const file = files.get(key)!;
      reads.push(key);
      return Readable.from(Array.from({ length: Math.ceil(file.length / 65536) }, (_, i) => file.subarray(i * 65536, (i + 1) * 65536)));
    },
  };
  const a = await readImageInfo(storage, 'u/p/album/a.jpg');
  const b = await readImageInfo(storage, 'u/p/album/b.png');
  assert.deepEqual(a, { width: 1500, height: 1000, format: 'jpeg' });
  assert.deepEqual(b, { width: 900, height: 1600, format: 'png' });
  assert.ok(files.get('u/p/album/a.jpg')!.length > 1_000_000);
  assert.deepEqual(fullReads, [], 'headers were enough');
  assert.equal(await readImageInfo({ read: async () => Buffer.from('nope'), readStream: async () => Readable.from([Buffer.from('nope')]) }, 'x'), undefined);

  const model = PROVIDER_MODELS_MAP.GoogleAI.find((m) => m.id === 'google-nano-banana-2')!;
  const items = [
    { id: 'a', jobId: 'j1', prompt: '', imageUrl: 'u/p/album/a.jpg', tags: ['hero'], createdAt: 0, format: 'jpeg' as const },
    { id: 'b', jobId: 'j2', prompt: '', imageUrl: 'u/p/album/b_rescale_abcd1234.png', tags: ['Rescaled'], createdAt: 0 },
  ];
  const infos = new Map([['a', a], ['b', b]]);
  const jobs = buildRescaleJobs({}, items, infos, { prompt: 'Upscale', providerId: 'prov', model, aspectRatio: 'source', quality: '2K', format: 'source' });
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((j) => [j.aspectRatio, j.quality, j.format, j.status]), [['3:2', '2K', 'jpeg', 'draft'], ['9:16', '2K', 'png', 'draft']]);
  assert.deepEqual(jobs[0].imageContexts, ['u/p/album/a.jpg']);
  assert.equal(jobs[0].modelConfigId, model.id);
  assert.equal(jobs[0].providerId, 'prov');
  assert.deepEqual(jobs[0].tags, ['hero', 'rescaled']);
  assert.deepEqual(jobs[1].tags, ['Rescaled']);
  assert.match(jobs[0].filename!, /^a_rescale_[a-f0-9]{8}$/);
  assert.match(jobs[1].filename!, /^b_rescale_[a-f0-9]{8}$/);
  assert.deepEqual(jobs[0].workflowSnapshot!.map((w) => [w.type, w.value]), [['text', 'Upscale'], ['image', 'u/p/album/a.jpg']]);

  const fixed = buildRescaleJobs({}, items, new Map(), { prompt: 'x', providerId: 'p', model, aspectRatio: '16:9', quality: '9K', format: 'webp' });
  assert.deepEqual(fixed.map((j) => [j.aspectRatio, j.quality, j.format]), [['16:9', '1K', 'webp'], ['16:9', '1K', 'webp']]);
  // Unreadable source: the ratio it was generated at.
  assert.equal(resolveRescaleRatio({ aspectRatio: 'source', model }, undefined, { aspectRatio: '1536x1024' }), '3:2');
});

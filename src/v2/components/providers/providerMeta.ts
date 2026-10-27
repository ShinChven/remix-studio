import type { MaterialShapeName } from '../../../m3';
import { PROVIDER_MODELS_MAP, type ModelConfig, type Provider, type ProviderType } from '../../../types';

export const PROVIDER_KINDS = ['text', 'image', 'video', 'audio'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export interface ServiceMeta {
  /** The service's own name; brand names are not translated. */
  label: string;
  shape: MaterialShapeName;
  tone: 'primary' | 'secondary' | 'tertiary';
}

/** Every service a provider can connect to, in the order the new-provider form lists them. */
export const SERVICES: Record<ProviderType, ServiceMeta> = {
  GoogleAI: { label: 'Google AI', shape: 'sunny', tone: 'primary' },
  VertexAI: { label: 'Vertex AI', shape: 'cookie-6', tone: 'tertiary' },
  OpenAI: { label: 'OpenAI', shape: 'flower', tone: 'secondary' },
  Claude: { label: 'Claude', shape: 'soft-burst', tone: 'tertiary' },
  Grok: { label: 'Grok', shape: 'gem', tone: 'secondary' },
  Alibabacloud: { label: 'Alibaba Cloud', shape: 'cookie-9', tone: 'primary' },
  Kimi: { label: 'Kimi', shape: 'clover-4', tone: 'tertiary' },
  MiniMax: { label: 'MiniMax', shape: 'puffy', tone: 'secondary' },
  RunningHub: { label: 'RunningHub', shape: 'pentagon', tone: 'primary' },
  KlingAI: { label: 'Kling AI', shape: 'cookie-12', tone: 'secondary' },
  BytePlus: { label: 'BytePlus', shape: 'clamshell', tone: 'tertiary' },
  Replicate: { label: 'Replicate', shape: 'puffy-diamond', tone: 'primary' },
  BlackForestLabs: { label: 'Black Forest Labs', shape: 'arch', tone: 'secondary' },
  Civitai: { label: 'Civitai', shape: 'clover-8', tone: 'tertiary' },
};

export const SERVICE_TYPES = Object.keys(SERVICES) as ProviderType[];

/** Where each service hands out API keys. */
export const KEY_PAGES: Record<ProviderType, string> = {
  GoogleAI: 'https://aistudio.google.com/apikey',
  VertexAI: 'https://console.cloud.google.com/vertex-ai',
  OpenAI: 'https://platform.openai.com/api-keys',
  Claude: 'https://console.anthropic.com/settings/keys',
  Grok: 'https://console.x.ai',
  Alibabacloud: 'https://modelstudio.console.alibabacloud.com',
  Kimi: 'https://platform.moonshot.ai',
  MiniMax: 'https://platform.minimax.io',
  RunningHub: 'https://www.runninghub.ai',
  KlingAI: 'https://app.klingai.com/global/dev',
  BytePlus: 'https://console.byteplus.com/ark',
  Replicate: 'https://replicate.com/account/api-tokens',
  BlackForestLabs: 'https://dashboard.bfl.ai',
  Civitai: 'https://civitai.com/user/account',
};

export function serviceMeta(type: string): ServiceMeta {
  return SERVICES[type as ProviderType] ?? { label: type, shape: 'circle', tone: 'primary' };
}

/** The shape a mark morphs into under the pointer. */
export function activeShape(shape: MaterialShapeName): MaterialShapeName {
  return shape === 'cookie-12' ? 'sunny' : 'cookie-12';
}

/** Kling AI signs requests with an access key and a secret; every other service takes one key. */
export function providerHasCredentials(provider: Provider) {
  return provider.type === 'KlingAI' ? provider.hasKey && provider.hasSecret : provider.hasKey;
}

/** Built-in and custom models of a provider, counted by what they make. */
export function modelCounts(provider: Pick<Provider, 'models'>): Record<ProviderKind, number> {
  const counts: Record<ProviderKind, number> = { text: 0, image: 0, video: 0, audio: 0 };
  for (const model of provider.models ?? []) {
    if (model.category in counts) counts[model.category as ProviderKind] += 1;
  }
  return counts;
}

/** What a service makes. Civitai brings its own catalog of image checkpoints instead of a model list. */
export function serviceKinds(type: ProviderType): ProviderKind[] {
  if (type === 'Civitai') return ['image'];
  const models = PROVIDER_MODELS_MAP[type] ?? [];
  return PROVIDER_KINDS.filter((kind) => models.some((model) => model.category === kind));
}

export function providerKinds(provider: Provider): ProviderKind[] {
  if (provider.type === 'Civitai') return ['image'];
  const counts = modelCounts(provider);
  return PROVIDER_KINDS.filter((kind) => counts[kind] > 0);
}

export function projectCount(provider: Provider): number {
  return provider.usage?.projectCount ?? 0;
}

export function activeJobCount(provider: Provider): number {
  return provider.usage?.activeJobCount ?? 0;
}

/** The host of a custom API address, or the address itself when it does not parse. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export type ProviderStatus = 'all' | 'ready' | 'missing' | 'used' | 'running';
export const PROVIDER_STATUSES: ProviderStatus[] = ['all', 'ready', 'missing', 'used', 'running'];

export function matchesStatus(provider: Provider, status: ProviderStatus): boolean {
  switch (status) {
    case 'ready':
      return providerHasCredentials(provider);
    case 'missing':
      return !providerHasCredentials(provider);
    case 'used':
      return projectCount(provider) > 0;
    case 'running':
      return activeJobCount(provider) > 0;
    default:
      return true;
  }
}

/** Name, service, model names and custom address, against every word of the search. */
export function matchesQuery(provider: Provider, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [provider.name, provider.type, serviceMeta(provider.type).label, provider.apiUrl, ...(provider.models ?? []).map((model) => model.name)]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export type ProviderSort = 'service' | 'name' | 'newest' | 'oldest' | 'usage';

export const PROVIDER_SORTS: Record<ProviderSort, { icon: string; compare: (a: Provider, b: Provider) => number }> = {
  service: { icon: 'category', compare: (a, b) => serviceMeta(a.type).label.localeCompare(serviceMeta(b.type).label) || a.name.localeCompare(b.name) },
  name: { icon: 'sort_by_alpha', compare: (a, b) => a.name.localeCompare(b.name) },
  newest: { icon: 'south', compare: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) },
  oldest: { icon: 'north', compare: (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) },
  usage: { icon: 'trending_up', compare: (a, b) => activeJobCount(b) - activeJobCount(a) || projectCount(b) - projectCount(a) || a.name.localeCompare(b.name) },
};

/** Distinct models across the providers that are ready, by what they make. */
export function readyModelCounts(providers: Provider[]): Record<ProviderKind, { providers: number; models: number }> {
  const seen: Record<ProviderKind, Set<string>> = { text: new Set(), image: new Set(), video: new Set(), audio: new Set() };
  const owners: Record<ProviderKind, number> = { text: 0, image: 0, video: 0, audio: 0 };
  for (const provider of providers) {
    if (!providerHasCredentials(provider)) continue;
    for (const kind of providerKinds(provider)) owners[kind] += 1;
    for (const model of provider.models ?? []) {
      if (model.category in seen) seen[model.category as ProviderKind].add(`${model.generatorId}:${model.modelId}`);
    }
  }
  return {
    text: { providers: owners.text, models: seen.text.size },
    image: { providers: owners.image, models: seen.image.size },
    video: { providers: owners.video, models: seen.video.size },
    audio: { providers: owners.audio, models: seen.audio.size },
  };
}

/** A model's main options in a few words: resolutions, durations and qualities, which need no translation. */
export function modelTraits(model: ModelConfig): string[] {
  const { resolutions, durations, qualities } = model.options ?? {};
  const traits: string[] = [];
  if (resolutions?.length) traits.push(resolutions.join(' · '));
  if (durations?.length) traits.push(durations.length > 1 ? `${Math.min(...durations)}–${Math.max(...durations)} s` : `${durations[0]} s`);
  if (qualities?.length) traits.push(qualities.join(' · '));
  return traits;
}

/** Models grouped by what they make, in the usual kind order. */
export function modelsByKind<T extends { kind: ProviderKind }>(models: T[]): { kind: ProviderKind; models: T[] }[] {
  return PROVIDER_KINDS.map((kind) => ({ kind, models: models.filter((model) => model.kind === kind) })).filter((group) => group.models.length > 0);
}

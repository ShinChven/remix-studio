import type { ProviderType } from '../../src/types';

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  category: 'text' | 'image' | 'video';
}

export interface ProviderModelsResult {
  models: ProviderModel[];
  error?: string;
}

/**
 * Fetch the list of available models from a provider's API,
 * categorised into text / image / video generation.
 */
export async function listProviderModels(
  type: ProviderType,
  apiKey: string,
  apiUrl?: string | null,
): Promise<ProviderModelsResult> {
  switch (type) {
    case 'GoogleAI':
      return listGoogleAIModels(apiKey, apiUrl);
    case 'VertexAI':
      return listVertexAIModels(apiKey, apiUrl);
    case 'Claude':
      return listClaudeModels(apiKey, apiUrl);
    case 'OpenAI':
      return listOpenAIModels(apiKey, apiUrl);
    case 'Grok':
      return listGrokModels(apiKey, apiUrl);
    case 'RunningHub':
      return { models: [] }; // RunningHub doesn't expose a model listing API
    default:
      return { models: [], error: `Unsupported provider type: ${type}` };
  }
}

// ---------------------------------------------------------------------------
// Google AI (Gemini)
// ---------------------------------------------------------------------------

async function listGoogleAIModels(
  apiKey: string,
  apiUrl?: string | null,
): Promise<ProviderModelsResult> {
  const base = (apiUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const url = `${base}/v1beta/models?key=${apiKey}&pageSize=100`;

  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      const text = await res.text();
      return { models: [], error: `HTTP ${res.status}: ${text}` };
    }
    const data: any = await res.json();
    const models: ProviderModel[] = (data.models || []).map((m: any) => ({
      id: (m.name || '').replace('models/', ''),
      name: m.displayName || m.name || '',
      description: m.description || '',
      category: categorizeGoogleModel(m),
    }));
    return { models };
  } catch (e: any) {
    return { models: [], error: e.message };
  }
}

function categorizeGoogleModel(m: any): 'text' | 'image' | 'video' {
  const methods: string[] = m.supportedGenerationMethods || [];
  const name = ((m.name || '') + ' ' + (m.displayName || '')).toLowerCase();

  if (name.includes('veo') || name.includes('video')) return 'video';
  if (name.includes('imagen') || name.includes('image-generation')) return 'image';

  // Models supporting generateContent with "image" in the name might generate images
  if (name.includes('flash-image') || name.includes('pro-image')) return 'image';

  if (methods.includes('generateContent') || methods.includes('streamGenerateContent')) return 'text';

  return 'text';
}

// ---------------------------------------------------------------------------
// Vertex AI — uses same Google models list API but different base
// ---------------------------------------------------------------------------

async function listVertexAIModels(
  apiKey: string,
  apiUrl?: string | null,
): Promise<ProviderModelsResult> {
  // Vertex AI with API key can use the same generativelanguage endpoint
  const base = (apiUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const url = `${base}/v1beta/models?key=${apiKey}&pageSize=100`;

  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      const text = await res.text();
      return { models: [], error: `HTTP ${res.status}: ${text}` };
    }
    const data: any = await res.json();
    const models: ProviderModel[] = (data.models || []).map((m: any) => ({
      id: (m.name || '').replace('models/', ''),
      name: m.displayName || m.name || '',
      description: m.description || '',
      category: categorizeGoogleModel(m),
    }));
    return { models };
  } catch (e: any) {
    return { models: [], error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Claude (Anthropic)
// ---------------------------------------------------------------------------

async function listClaudeModels(
  apiKey: string,
  apiUrl?: string | null,
): Promise<ProviderModelsResult> {
  const base = (apiUrl || 'https://api.anthropic.com').replace(/\/$/, '');

  try {
    const allModels: any[] = [];
    let hasMore = true;
    let afterId: string | undefined;

    while (hasMore) {
      const params = new URLSearchParams({ limit: '100' });
      if (afterId) params.set('after_id', afterId);

      const res = await fetch(`${base}/v1/models?${params}`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const text = await res.text();
        return { models: [], error: `HTTP ${res.status}: ${text}` };
      }
      const data: any = await res.json();
      allModels.push(...(data.data || []));
      hasMore = data.has_more === true;
      if (hasMore && data.data?.length) {
        afterId = data.data[data.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    const models: ProviderModel[] = allModels.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      description: '',
      category: 'text' as const, // Claude models are text-only currently
    }));
    return { models };
  } catch (e: any) {
    return { models: [], error: e.message };
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function listOpenAIModels(
  apiKey: string,
  apiUrl?: string | null,
): Promise<ProviderModelsResult> {
  let base = (apiUrl || 'https://api.openai.com').replace(/\/$/, '');
  // Ensure /v1 suffix
  if (!base.includes('/v1') && !base.includes('openai.azure.com') && !base.includes('localhost') && !base.includes('127.0.0.1')) {
    base = `${base}/v1`;
  }

  try {
    const res = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { models: [], error: `HTTP ${res.status}: ${text}` };
    }
    const data: any = await res.json();
    const models: ProviderModel[] = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      description: '',
      category: categorizeOpenAIModel(m.id),
    }));
    // Sort by name
    models.sort((a, b) => a.id.localeCompare(b.id));
    return { models };
  } catch (e: any) {
    return { models: [], error: e.message };
  }
}

function categorizeOpenAIModel(id: string): 'text' | 'image' | 'video' {
  const lower = id.toLowerCase();
  if (lower.includes('dall-e') || lower.includes('image') || lower.includes('imagen')) return 'image';
  if (lower.includes('sora') || lower.includes('video')) return 'video';
  return 'text';
}

// ---------------------------------------------------------------------------
// Grok (xAI) — OpenAI-compatible API
// ---------------------------------------------------------------------------

async function listGrokModels(
  apiKey: string,
  apiUrl?: string | null,
): Promise<ProviderModelsResult> {
  const base = (apiUrl || 'https://api.x.ai/v1').replace(/\/$/, '');

  try {
    const res = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { models: [], error: `HTTP ${res.status}: ${text}` };
    }
    const data: any = await res.json();
    const models: ProviderModel[] = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      description: '',
      category: categorizeGrokModel(m.id),
    }));
    models.sort((a, b) => a.id.localeCompare(b.id));
    return { models };
  } catch (e: any) {
    return { models: [], error: e.message };
  }
}

function categorizeGrokModel(id: string): 'text' | 'image' | 'video' {
  const lower = id.toLowerCase();
  if (lower.includes('imagine') || lower.includes('image') || lower.includes('aurora')) return 'image';
  if (lower.includes('video')) return 'video';
  return 'text';
}

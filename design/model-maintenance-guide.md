# Model Maintenance Guide

How AI provider models are configured, used, and updated in Remix Studio.

---

## Architecture Overview

```
src/types.ts                          -- Model definitions (PROVIDER_MODELS_MAP)
    |
    +-- src/components/.../SettingsPanel.tsx   -- UI reads options (temps, maxTokens, etc.)
    +-- src/components/.../ModelSelectorModal.tsx -- UI lists models filtered by project type
    +-- server/db/provider-repository.ts      -- Attaches models to provider responses
    |
server/generators/                    -- One generator class per provider per category
    +-- build-text-generator.ts       -- Factory: provider type -> text generator
    +-- build-generator.ts            -- Factory: provider type -> image generator
    +-- claude-text-generator.ts      -- Default model: claude-sonnet-4-6
    +-- openai-text-generator.ts      -- Default model: gpt-5.4
    +-- grok-text-generator.ts        -- Default model: grok-4.20-0309-non-reasoning
    +-- google-ai-text-generator.ts   -- Default model: gemini-3-flash-preview
    +-- vertex-ai-text-generator.ts   -- Default model: gemini-3-flash-preview
    +-- google-ai-generator.ts        -- Image gen (GoogleAI)
    +-- vertex-ai-generator.ts        -- Image gen (VertexAI)
    +-- openai-generator.ts           -- Image gen (OpenAI)
    +-- grok-generator.ts             -- Image gen (Grok/xAI)
    +-- running-hub-generator.ts      -- Image gen (RunningHub)
    |
server/services/provider-model-lister.ts -- Fetches models from provider APIs,
                                            filters to only supported ones
```

---

## Where Models Are Defined

### `src/types.ts` — `PROVIDER_MODELS_MAP`

This is the single source of truth. Each entry is a `ModelConfig`:

```ts
{
  id: string;           // Internal unique ID (e.g. 'openai-gpt-5.4-text')
  name: string;         // Display name shown in UI
  generatorId: ProviderType; // Which generator to use
  modelId: string;      // Exact API model ID string sent to the provider
  category: 'image' | 'text'; // Determines which project type can use it
  options: {
    // Image models:
    aspectRatios?: string[];
    qualities?: string[];
    backgrounds?: string[];
    // Text models:
    temperatures?: number[];
    maxTokenOptions?: number[];
  };
}
```

### What Each Field Controls

| Field | Where It's Used | Effect |
|---|---|---|
| `modelId` | Generator classes | Sent as the `model` param in API calls |
| `category` | `ModelSelectorModal.tsx` | Filters models shown for image vs text projects |
| `temperatures` | `SettingsPanel.tsx` | Temperature picker buttons |
| `maxTokenOptions` | `SettingsPanel.tsx` | Max tokens picker buttons |
| `aspectRatios` | `SettingsPanel.tsx` | Aspect ratio grid (image projects) |
| `qualities` | `SettingsPanel.tsx` | Quality picker (image projects) |
| `backgrounds` | `SettingsPanel.tsx` | Background picker (OpenAI image only) |

---

## How to Add or Update a Model

### Adding a new model to an existing provider

1. Add an entry to `PROVIDER_MODELS_MAP[ProviderType]` in `src/types.ts`
2. That's it — the UI and generators pick it up automatically via `modelId`

### Adding a new model category to a provider (e.g. adding text to an image-only provider)

1. Create `server/generators/<provider>-text-generator.ts` (implement `TextGenerator`)
2. Add the case in `server/generators/build-text-generator.ts`
3. Add text model entries to `PROVIDER_MODELS_MAP` in `src/types.ts`

### Updating model IDs (e.g. new model version)

1. Update `modelId` in `PROVIDER_MODELS_MAP` entries
2. Update the default fallback in the corresponding generator class
3. If the model ID format changed, update categorization in `server/services/provider-model-lister.ts`

### Adding an entirely new provider

1. Add the type to `ProviderType` union in `src/types.ts`
2. Add `PROVIDER_MODELS_MAP[NewProvider]` entries
3. Create generator class(es) in `server/generators/`
4. Register in `build-text-generator.ts` and/or `build-generator.ts`
5. Add model listing in `server/services/provider-model-lister.ts`
6. Add color config in `src/pages/Providers.tsx` (`TYPE_COLORS`) and `src/pages/ProviderProfile.tsx`
7. Add to `VALID_TYPES` in `server/routes/providers.ts`

---

## Provider API Details for Model Listing

Used by `server/services/provider-model-lister.ts` to fetch available models from provider APIs and filter to supported ones.

| Provider | API Endpoint | Auth Method |
|---|---|---|
| Google AI | `GET {base}/v1beta/models?key={apiKey}` | Query param |
| Vertex AI | Same as Google AI (with API key) | Query param |
| Claude | `GET {base}/v1/models` | `x-api-key` header + `anthropic-version: 2023-06-01` |
| OpenAI | `GET {base}/v1/models` | `Authorization: Bearer {apiKey}` |
| Grok (xAI) | `GET {base}/v1/models` | `Authorization: Bearer {apiKey}` |
| RunningHub | No listing API | N/A |

The lister fetches all models, then filters to only those whose `id` matches a `modelId` in `PROVIDER_MODELS_MAP`.

---

## Current Model Inventory (April 2026)

### Google AI / Vertex AI
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| nano banana 2 | `gemini-3.1-flash-image-preview` | image | 32,768 |
| Gemini 3 Flash | `gemini-3-flash-preview` | text | 65,536 |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | text | 65,536 |
| Gemini 3.1 Flash Lite | `gemini-3.1-flash-lite-preview` | text | 65,536 |

### OpenAI
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| GPT Image 1.5 | `gpt-image-1.5` | image | - |
| GPT Image 1 Mini | `gpt-image-1-mini` | image | - |
| GPT-5.4 | `gpt-5.4` | text | 128,000 |
| GPT-5.4 Mini | `gpt-5.4-mini` | text | 128,000 |
| GPT-5.4 Nano | `gpt-5.4-nano` | text | 128,000 |

### Grok (xAI)
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| Grok Imagine | `grok-imagine-image` | image | - |
| Grok Imagine Pro | `grok-imagine-image-pro` | image | - |
| Grok 4.20 | `grok-4.20-0309-non-reasoning` | text | - |
| Grok 4.1 Fast | `grok-4-1-fast-non-reasoning` | text | - |

### Claude (Anthropic)
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| Claude Opus 4.6 | `claude-opus-4-6` | text | 128,000 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | text | 64,000 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | text | 64,000 |

### RunningHub
| Name | Model ID | Category |
|---|---|---|
| nano banana 2 | `rhart-image-n-g31-flash` | image |

---

## Temperature Ranges by Provider

| Provider | Max Temperature | Notes |
|---|---|---|
| Google AI / Vertex AI | 2.0 | |
| OpenAI | 2.0 | |
| Grok (xAI) | 2.0 | |
| Claude | 1.0 | Anthropic API hard limit |

---

## Verification Checklist

When updating models, verify against official docs:

- [ ] **Model ID**: exact string from provider docs (aliases like `gpt-5.4` vs dated `gpt-5.4-2026-03-05`)
- [ ] **Max output tokens**: check provider docs, set as highest `maxTokenOptions` value
- [ ] **Temperature range**: Claude caps at 1.0, others at 2.0
- [ ] **Default model in generator**: update fallback in the generator constructor
- [ ] **Provider profile filter**: if model ID format changed, update categorization in `provider-model-lister.ts`

### Official Docs Links

- OpenAI: https://developers.openai.com/api/docs/models
- Claude: https://docs.anthropic.com/en/docs/about-claude/models/overview
- Gemini: https://ai.google.dev/gemini-api/docs/models
- Grok: https://docs.x.ai/developers/models

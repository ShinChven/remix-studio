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
    +-- build-video-generator.ts      -- Factory: provider type -> video generator
    +-- build-audio-generator.ts      -- Factory: provider type -> audio generator
    +-- claude-text-generator.ts      -- Default model: claude-sonnet-4-6
    +-- openai-text-generator.ts      -- Default model: gpt-5.6
    +-- grok-text-generator.ts        -- Default model: grok-4.6
    +-- minimax-text-generator.ts     -- Default model: MiniMax-M3
    +-- google-ai-text-generator.ts   -- Default model: gemini-3.8-flash
    +-- vertex-ai-text-generator.ts   -- Default model: gemini-3.8-flash
    +-- google-ai-generator.ts        -- Image gen (GoogleAI)
    +-- vertex-ai-generator.ts        -- Image gen (VertexAI)
    +-- google-ai-audio-generator.ts  -- Gemini TTS (GoogleAI)
    +-- vertex-ai-audio-generator.ts  -- Gemini TTS (VertexAI)
    +-- openai-generator.ts           -- Image gen (OpenAI)
    +-- grok-generator.ts             -- Image gen (Grok/xAI)
    +-- running-hub-generator.ts      -- Image gen (RunningHub)
    +-- minimax-generator.ts          -- Image gen (MiniMax)
    +-- minimax-video-generator.ts    -- Video gen (MiniMax H3)
    +-- minimax-audio-generator.ts    -- Music gen (MiniMax)
    |
server/queue/                         -- Category-specific output processors
    +-- image-processor.ts
    +-- text-processor.ts
    +-- video-processor.ts
    +-- audio-processor.ts
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
  category: 'image' | 'text' | 'video' | 'audio'; // Determines which project type can use it
  options: {
    // Image models:
    aspectRatios?: string[];
    qualities?: string[];
    backgrounds?: string[];
    // Text models:
    temperatures?: number[];
    maxTokenOptions?: number[];
    // Video models:
    durations?: number[];
    resolutions?: string[];
    supportsReferenceVideo?: boolean;
    supportsReferenceAudio?: boolean;
    // Audio/TTS models:
    voices?: string[];
    supportsMultiSpeaker?: boolean;
  };
}
```

### What Each Field Controls

| Field | Where It's Used | Effect |
|---|---|---|
| `modelId` | Generator classes | Sent as the `model` param in API calls |
| `promptLimit` | `ProjectViewer.tsx` shared draft validation | Drives over-limit prompt warning/truncation in the workflow UI |
| `category` | `ModelSelectorModal.tsx` | Filters models shown for image vs text projects |
| `temperatures` | `SettingsPanel.tsx` | Temperature picker buttons |
| `maxTokenOptions` | `SettingsPanel.tsx` | Max tokens picker buttons |
| `aspectRatios` | `SettingsPanel.tsx` | Aspect ratio grid (image projects) |
| `qualities` | `SettingsPanel.tsx` | Quality picker (image projects) |
| `backgrounds` | `SettingsPanel.tsx` | Background picker (OpenAI image only) |
| `durations` / `resolutions` | `SettingsPanel.tsx` | Video controls |
| `supportsReferenceVideo` / `supportsReferenceAudio` | `WorkflowPanel.tsx` | Enables video/audio reference inputs for video projects |
| `voices` / `supportsMultiSpeaker` | `SettingsPanel.tsx` | Gemini TTS voice picker and single vs multi-speaker controls |

---

## Prompt Limit Rule

When a model has an input-length limit, declare it in `src/types.ts` as `promptLimit` on the model entry.

- Use the existing shared workflow validation in `src/components/ProjectViewer.tsx`.
- Do not add new cross-model backend validation just to enforce prompt length.
- Do not create provider-specific prompt-limit code when the goal is only to make a model follow the existing shared UI behavior.
- Inline the actual limit value on the model entry unless there is already an established shared constant pattern in the file.

This repo's current pattern is model metadata first: `promptLimit` is the source of truth, and `ProjectViewer` is the shared place that applies it during draft generation.

---

## How to Add or Update a Model

### Adding a new model to an existing provider

1. Add an entry to `PROVIDER_MODELS_MAP[ProviderType]` in `src/types.ts`
2. That's it — the UI and generators pick it up automatically via `modelId`

### Adding a new model category to a provider (e.g. adding audio to a text/image provider)

1. Create the matching generator class, e.g. `server/generators/<provider>-audio-generator.ts`
2. Register it in the right factory, e.g. `build-audio-generator.ts`
3. Add model entries to `PROVIDER_MODELS_MAP` in `src/types.ts`
4. If the category introduces new output handling, add or reuse the matching queue processor

### Updating model IDs (e.g. new model version)

1. Update `modelId` in `PROVIDER_MODELS_MAP` entries
2. Update the default fallback in the corresponding generator class
3. If the model ID format changed, update categorization in `server/services/provider-model-lister.ts`

### Adding an entirely new provider

1. Add the type to `ProviderType` union in `src/types.ts`
2. Add `PROVIDER_MODELS_MAP[NewProvider]` entries
3. Create generator class(es) in `server/generators/`
4. Register in the relevant factory files (`build-text-generator.ts`, `build-generator.ts`, `build-video-generator.ts`, `build-audio-generator.ts`)
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
| MiniMax | No listing API | N/A |

The lister fetches all models, then filters to only those whose `id` matches a `modelId` in `PROVIDER_MODELS_MAP`.

---

## Current Model Inventory (September 2026)

### Google AI / Vertex AI
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| nano banana Pro | `gemini-3-pro-image` | image | 32,768 |
| nano banana 2 | `gemini-3.1-flash-image` | image | 32,768 |
| nano banana 2 Lite | `gemini-3.1-flash-lite-image` | image | 32,768 |
| Gemini 3.8 Flash | `gemini-3.8-flash` | text | 65,536 |
| Gemini 3.7 Flash | `gemini-3.7-flash` | text | 65,536 |
| Gemini 3.6 Flash | `gemini-3.6-flash` | text | 65,536 |
| Gemini 3.5 Flash | `gemini-3.5-flash` | text | 65,536 |
| Gemini 3.5 Flash Lite | `gemini-3.5-flash-lite` | text | 65,536 |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | text | 65,536 |
| Gemini 3.1 Flash Lite | `gemini-3.1-flash-lite` | text | 65,536 |
| Gemma 4 | `gemma-4-31b-it` | text | 65,536 |
| Veo 3.1 | `veo-3.1-generate-preview` | video | 720p/1080p/4k, 4-8s |
| Veo 3.1 Lite | `veo-3.1-lite-generate-preview` | video | 720p/1080p, 4-8s |
| Lyria 3 Clip | `lyria-3-clip-preview` | audio | Music generation |
| Lyria 3 Pro | `lyria-3-pro-preview` | audio | Music generation |
| Gemini 3.1 Flash TTS Preview | `gemini-3.1-flash-tts-preview` | audio | 32k context window |
| Gemini 2.5 Flash Preview TTS | `gemini-2.5-flash-preview-tts` | audio | 32k context window |
| Gemini 2.5 Pro Preview TTS | `gemini-2.5-pro-preview-tts` | audio | 32k context window |

Gemini 3.x is progressively dropping the legacy sampling knobs (`temperature`,
`topP`, `topK`) — the newer models are tuned for their defaults and either reject
the fields (3.7 Flash) or accept and ignore them (3.8 Flash), so a request that
sends them is at best misleading about what it asked for. `geminiSupportsSamplingParameters` in
`server/utils/gemini.ts` holds that list, and the assistant chat adapter plus
both REST text generators read it before putting `temperature` on a request. A
new Gemini release that drops the knobs gets added there, not to a per-caller
check. The Veo rows are video-only and the Lyria rows are music, so neither
takes the text sampling fields at all.

Google drops the `-preview` suffix rather than aliasing it when a model reaches
GA, and the preview endpoint stops serving some time after — `gemini-3.1-flash-image`
(May 28, 2026) and `gemini-3.1-flash-lite` (May 8, 2026) both went that way, and
the retired `gemini-3-flash-preview` is why `resolveRealGeminiModelId` in the
assistant's Google adapter maps its stale aliases onto a live GA flash. A preview
ID in this catalog is a thing to re-check, not a stable pin. The Veo and Lyria
rows are still preview-only on the Gemini API this app calls, so they keep the
suffix; the `-001` GA IDs published for Veo 3.1 belong to Vertex's own endpoint,
not this one.

### OpenAI
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| GPT Image 2 | `gpt-image-2` | image | - |
| GPT Image 1.5 | `gpt-image-1.5` | image | - |
| GPT Image 1 Mini | `gpt-image-1-mini` | image | - |
| GPT-5.6 | `gpt-5.6` | text | 131,072 |
| GPT-5.6 Terra | `gpt-5.6-terra` | text | 131,072 |
| GPT-5.6 Luna | `gpt-5.6-luna` | text | 131,072 |
| GPT-5.5 | `gpt-5.5` | text | 131,072 |
| GPT-5.4 | `gpt-5.4` | text | 131,072 |
| GPT-5.4 Mini | `gpt-5.4-mini` | text | 128,000 |
| GPT-5.4 Nano | `gpt-5.4-nano` | text | 128,000 |

OpenAI has no video row: Sora 2 and Sora 2 Pro were dropped when OpenAI set the
Sora API's shutdown for September 24, 2026 with no successor model, so
`buildVideoGenerator` now throws for `OpenAI` the way it does for the other
providers that generate no video, and `openai-video-generator.ts` is gone.

### Grok (xAI)
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| Grok Imagine Image 2.0 | `grok-imagine-image-2.0` | image | - |
| Grok Imagine | `grok-imagine-image` | image | - |
| Grok Imagine Quality | `grok-imagine-image-quality` | image | - |
| Grok 4.6 | `grok-4.6` | text | 500K context |
| Grok 4.5 | `grok-4.5` | text | 500K context |
| Grok 4.20 | `grok-4.20-0309-non-reasoning` | text | 2M context |
| Grok 4.3 | `grok-4.3` | text | 2M context |
| Grok 4.1 Fast | `grok-4-1-fast-non-reasoning` | text | 2M context |
| Grok Imagine Video 1.5 | `grok-imagine-video-1.5` | video | 720p/1080p, 4-15s |

`grok-imagine-image-2.0` is the current Imagine image generation (API since
August 8, 2026) and the generator's fallback. It keeps the request shape of the
1.x tiers — the same `quality` plus `resolution` pair — so it is a plain extra
entry rather than a migration, and the 1.x tiers stay listed for projects pinned
to them. Imagine Video 1.5 did supersede the unversioned `grok-imagine-video`,
which is why that entry's `modelId` moved to `grok-imagine-video-1.5` (720p and
1080p, 1-15s, `duration` defaulting to 8 upstream) while its `id` stayed put.

xAI retired `grok-imagine-image-pro` in May 2026 and points it at the quality
tier. Both take the same `quality` (`low`/`medium`/`high`) plus `resolution`
(`1k`/`2k`) pair that `parseQualityPreset` in `grok-generator.ts` splits out of
the project's single quality picker, so the migration was a `modelId` swap. The
model entry keeps its original `id` (`grok-imagine-image-pro`) because projects
persist `modelConfigId` — renaming it would orphan saved selections.

### Claude (Anthropic)
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | text | 128,000 |
| Claude Fable 5 | `claude-fable-5` | text | 128,000 |
| Claude Opus 5 | `claude-opus-5` | text | 128,000 |
| Claude Opus 4.8 | `claude-opus-4-8` | text | 128,000 |
| Claude Sonnet 5 | `claude-sonnet-5` | text | 128,000 |
| Claude Opus 4.7 | `claude-opus-4-7` | text | 128,000 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | text | 64,000 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | text | 64,000 |

### RunningHub
| Name | Model ID | Category |
|---|---|---|
| nano banana 2 | `rhart-image-n-g31-flash` | image |
| nano banana Pro | `rhart-image-n-pro` | image |
| GPT Image 2 | `rhart-image-g-2` | image |
| GPT Image 2 Official | `rhart-image-g-2-official` | image |
| Qwen Image 2 Pro | `alibaba/qwen-image-2.0-pro` | image |
| Grok Imagine Quality | `rhart-imagine-image-quality` | image |
| Seedream 5.0 Pro | `dola-Seedream-5.0-pro` | image |
| Seedream V5 Pro | `seedream-v5-pro` | image |
| Wan 2.7 Pro | `alibaba/wan-2.7` | image |
| Seedance 2.0 Global | `bytedance/seedance-2.0-global` | video |
| Seedance 2.0 Global Multimodal Reference | `bytedance/seedance-2.0-global/multimodal-video` | video |
| MiniMax Hailuo H3 | `minimax/hailuo-h3/image-to-video` | video |
| MiniMax Hailuo H3 Multimodal Reference | `minimax/hailuo-h3/multimodal-to-video` | video |

`rhart-image-g-2-official` is the official-tier sibling of the economy
`rhart-image-g-2`. It uses the same endpoints and payload, except that the API
requires a `quality` tier (`low`, `medium`, `high`) on top of the `resolution`
tier. Image projects only have one quality picker, so the model's `qualities`
list carries both in each value (`2K Medium`) and
`resolveGptImage2OfficialSize` in `running-hub-generator.ts` splits it back into
the two request fields.

`rhart-imagine-image-quality` caps prompts at 4,000 characters and rejects a
longer one outright (error 1007) instead of truncating, so the entry carries a
`promptLimit` and the shared draft validation catches it before submission. Its
reference endpoint is `/edit`, which takes a single `imageUrl` rather than a
list — extra reference images are dropped before upload, not after. `auto` is
an `/edit`-only aspect ratio: the `/text-to-image` enum has no such value, so
the generator omits the optional field there rather than sending it.

RunningHub model IDs may carry an endpoint suffix. When present it pins the
request to that endpoint; otherwise the video generator picks `image-to-video`
when the job has reference images and `text-to-video` when it does not. The
suffix names are per-model — Seedance calls its reference endpoint
`multimodal-video` while Hailuo H3 calls its own `multimodal-to-video` — so a
new suffix has to be added to `VIDEO_ENDPOINTS` in
`running-hub-video-generator.ts` before a model ID can use it. Models whose
request body differs from the Seedance shape (Hailuo H3) get their own payload
branch in the same file.

### MiniMax
| Name | Model ID | Category | Notes |
|---|---|---|---|
| MiniMax M3 | `MiniMax-M3` | text | 1,000,000-token context |
| MiniMax M2.7 | `MiniMax-M2.7` | text | 204,800-token context |
| MiniMax M2.7 Highspeed | `MiniMax-M2.7-highspeed` | text | Same weights, ~100 tps |
| MiniMax M2.5 | `MiniMax-M2.5` | text | |
| MiniMax M2.5 Highspeed | `MiniMax-M2.5-highspeed` | text | |
| MiniMax M2.1 | `MiniMax-M2.1` | text | |
| MiniMax M2.1 Highspeed | `MiniMax-M2.1-highspeed` | text | |
| MiniMax M2 | `MiniMax-M2` | text | |
| MiniMax Image 01 | `image-01` | image | 1K / 2K tiers |
| MiniMax Hailuo H3 | `MiniMax-H3` | video | 768P / 2K, 4-15s |
| MiniMax Music 3.0 | `music-3.0` | audio | Music generation |

Text runs on the OpenAI Chat Completions protocol (`https://api.minimax.io/v1`),
so `minimax-text-generator.ts` and the assistant adapter both drive the OpenAI
client. The M-series always reasons before answering: requests set
`reasoning_split` so the reasoning lands in `reasoning_details` instead of
`content`, and `stripThinkTags` in `server/utils/minimax.ts` covers a model that
ignores the flag and inlines a `<think>` block anyway. That file also holds the
base-URL normalizer — video is the one API served from `/v2`, everything else
from `/v1`, and both roots are derived from whatever URL the provider carries.

`image-01` takes either a named `aspect_ratio` or an explicit `width`/`height`
pair, and the ratio wins when both are sent. Dimensions are the only way to
reach the `2K` tier, so the generator resolves quality + ratio against its own
size table (every value inside the documented [512, 2048] range and divisible by
8) and omits the ratio field. Its reference input is a `character` subject
reference — one front-facing portrait, JPG or PNG only, so other formats are
re-encoded to PNG — not general image-to-image.

`MiniMax-H3` has one endpoint for every mode, and image-to-video and
reference-to-video are mutually exclusive: one or two images become
`first_frame` / `last_frame`, while any reference video or audio (or a third
image) switches every image to `reference_image`. Ratio handling follows the
three modes — text-to-video rejects `adaptive` so a text-only job falls back to
`16:9`, a framed job sends no ratio because the output follows the input image,
and reference mode passes the project's choice through.

`music-3.0` splits a song into a style `prompt` and `lyrics`, but a project
carries one composed prompt. Instrumental mode sends the prompt as the style
description with `is_instrumental`. Vocal mode looks for the documented
structure tags (`[Verse]`, `[Chorus]`, …): a tagged prompt is split at the first
tag into style + lyrics, and an untagged one is sent as a style description with
`lyrics_optimizer` so the platform writes the lyrics. Speech synthesis (T2A) and
voice cloning are deliberately not bundled — they require system voice IDs the
API reference does not publish.

### BytePlus (image)
| Name | Model ID | Category | Resolution tiers |
|---|---|---|---|
| Seedream 5.0 Pro | `dola-seedream-5-0-pro-260628` | image | 1K, 1.5K, 2K |
| Seedream 5.0 Lite | `seedream-5-0-260128` | image | 2K, 3K, 4K |
| Seedream 4.5 | `seedream-4-5-251128` | image | 2K, 4K |
| Seedream 4.0 | `seedream-4-0-250828` | image | 1K, 2K, 4K |
| Seedream 3.0 T2I | `seedream-3-0-t2i-250415` | image | 1K only |
| Seededit 3.0 I2I | `seededit-3-0-i2i-250628` | image | adaptive |

All six share one endpoint (`POST {base}/images/generations`), but they do not
share one request body, and Ark rejects a request outright when it carries a
field the model does not take. `resolveTraits` in `byteplus-generator.ts` holds
that per-model contract in one place — resolution tiers, reference-image
ceiling, and which of `output_format`, `sequential_image_generation`, `seed` and
`guidance_scale` may be sent — and the rest of the generator reads it rather
than testing model IDs inline. A new Seedream model needs a branch there next to
its `PROVIDER_MODELS_MAP` entry.

Two traits are easy to get wrong. Seedream 5.0 Pro is capped at 4,624,220 total
pixels, so it has no 3K or 4K tier and its own pixel table (16:9 at 1K is
`1424x800`, not the `1280x720` the other models use) — that is `SIZE_MAP_5_PRO`,
separate from the shared `SIZE_MAP`. And it is the one model that rejects
`sequential_image_generation` and `stream` instead of ignoring them, so those
fields are gated on the trait rather than sent everywhere. Model IDs are matched
by pattern, not equality, so a dated release, the `dola-` prefix BytePlus puts
on its international listings, and a custom endpoint ID all resolve to the right
traits; an ID that matches nothing falls back to the fields every Ark image
model accepts.

Batch output (`sequential_image_generation: auto`, up to 15 images from one
request) is deliberately not wired up: a job carries exactly one image through
`GenerateResult` and the image processor, so the generator pins the field to
`disabled` on the models that accept it. Streaming and `optimize_prompt_options`
are unused for the same reason — nothing downstream consumes a partial result,
and the default `standard` prompt-optimization mode is the higher-quality one.

The `eu-west-1` region needs no code: set the model's API URL to
`https://ark.eu-west.bytepluses.com/api/v3` and `normalizeBaseUrl` trims
whatever form of the URL was pasted back to the API root.

---

## Temperature Ranges by Provider

| Provider | Max Temperature | Notes |
|---|---|---|
| Google AI / Vertex AI | 2.0 | |
| OpenAI | 2.0 | |
| Grok (xAI) | 2.0 | |
| MiniMax | 2.0 | |
| Claude | 1.0 | Anthropic API hard limit. Fable 5.1, Fable 5, Opus 5, Opus 4.8 and Sonnet 5 reject any non-default value — list only `[1.0]` and skip the parameter in `claude-text-generator.ts`, whose guard matches on model-ID prefix so a point release is covered by its family |

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
- MiniMax: https://platform.minimax.io/docs/api-reference/text-openai-api

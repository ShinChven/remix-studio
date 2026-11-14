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
    +-- claude-text-generator.ts      -- Default model: claude-sonnet-5-5
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

## Option Enums Are Enforced, Not Just Displayed

A project stores one `aspectRatio`, `quality`, `background` and `resolution`,
and keeps them across a model switch, but the enums differ per model: OpenAI's
GPT Image entries spell sizes in pixels (`1024x1536`) where RunningHub's spell
the same framing as a ratio (`2:3`), and quality is `1K`/`2K`/`4K` on one
provider and `low`/`medium`/`high` on the next. A leftover value reaches the
provider verbatim and the job fails at submit — RunningHub answers a pixel size
with `error 1007: the 'size' parameter only supports 'auto' or ... ratios`.

So the enums declared on a model entry are also what gets sent:

- `resolveSupportedOption` / `resolveSupportedAspectRatio` in `src/types.ts`
  resolve a stored value against a model's list. The aspect-ratio one keeps the
  framing across spellings (`1024x1536` resolves to `2:3`, not to whatever heads
  the list); both leave a value untouched when the model publishes no enum, as
  custom model aliases may not.
- `prepareGenerateRequest` / the video request builder in
  `server/queue/queue-manager.ts` apply them to every job before it reaches a
  generator. That is the backstop: whatever a job was drafted with, the request
  carries a value this model offers.
- `buildJobSettings` in `server/mcp/tool-definitions.ts` drafts jobs the same
  way, and `create_project_with_workflow` / `update_project` reject a setting
  the model does not offer and reconcile the project's stored ones when its
  model changes — the reconciliation `ProjectViewer.tsx` already does in the UI.

Declaring an enum a model's API does not accept is therefore a real bug, not a
cosmetic one: the picker offers the value and the request sends it.

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
2. Add its explanation, keyed by the entry's `id`, to `modelDescriptions` in
   `src/locales/<locale>/models.json` for all six locales (see below)
3. The UI and generators pick the model up automatically via `modelId`

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

### Model explanations

Every bundled model has a one- or two-sentence explanation, shown under the
**AI model** button in the project settings and on its card in
`ModelSelectorModal.tsx` (whose search matches it too). They live in
`src/locales/<locale>/models.json` under `modelDescriptions`, keyed by the model
entry's `id`, and `npm run i18n:check` fails when a locale is missing one that
`en` has. Model ids contain dots (`openai-gpt-5.4-text`), which i18next reads as
key nesting, so `useModelDescriptions` in
`src/components/ProjectViewer/modelDescriptions.ts` fetches the block whole with
`returnObjects` and indexes it — never look one up as
`t('modelDescriptions.<id>')`. Custom aliases (`custom-<modelId>`) have no entry
and show nothing.

Write what a user choosing between neighbouring entries needs: what the model is
for, what sets it apart from its siblings (tier, channel, Omni vs standard), and
limits that would otherwise surprise (prompt cap, required source image, a
temperature that is not sent). Keep claims to what the entry, its generator or
the provider's docs establish. When a model is renamed, retired or repointed,
update its explanation in all six files with it.

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
| APIMart | `GET {base}/v1/models?expand=category` | `Authorization: Bearer {apiKey}` |

The lister fetches all models, then filters to only those whose `id` matches a `modelId` in `PROVIDER_MODELS_MAP`.

### APIMart catalog (verified November 5, 2026)

The APIMart entries in `src/types.ts` include the text, video and audio
subcatalogs from `src/lib/apimart-models.ts`. Together they expose 232 selectable
configurations: 51 image, 121 text, 54 video and 6 audio. Existing image IDs are
preserved. Suno V6 / Wild / Mini and Flow Music Lyria 3.5 use `modelVariant` to
send `version` while keeping their real API `model` value (`suno` / `flowmusic`).

Sources used for the inventory and request contracts:

- [Public marketplace](https://apimart.ai/api/marketplace/models?page_size=100&page=1)
  (all three pages, 213 entries); the compact snapshot is
  `scripts/fixtures/apimart-catalog.json`.
- [Public pricing metadata](https://apimart.ai/api/pricing/models/all) for text
  input/output limits. A pricing entry alone is not evidence of a supported
  generation endpoint.
- [Official API manual index](https://docs.apimart.ai/_llms/en/api-manual.txt),
  including official / Ext channels, TTS, Suno versions and Flow Music Lyria 3.5.
- Official workspaces for [GPT Image 2.6](https://apimart.ai/model/gpt-image-2-6),
  [MAI Image 2.7](https://apimart.ai/model/mai-image-2-7),
  [Seedream 5.5](https://apimart.ai/model/seedream-5-5), and
  [Gemini Omni 1.2 Flash](https://apimart.ai/model/gemini-omni-1-2-flash).

The snapshot contains three embedding models and two transcription models.
They are explicitly excluded because Remix Studio has generation projects,
not embedding or transcription tasks. Announcements without an available API
(such as Kling 4.0 Flash) are also excluded. Compatibility aliases such as
`Omni-Flash-Ext` and `grok-imagine-1.5-video-apimart` resolve to their documented
canonical IDs rather than separate model cards. The model-list endpoint respects
the configured key’s group/model restrictions, retains only implemented models,
and deduplicates versions that share one API model ID.

Text projects and assistant chat both use APIMart Chat Completions. Image input
is declared per model. Reasoning and newer Gemini models omit temperature
when their catalog entry does not expose sampling controls. The video adapter
maps per-family field names (`size` / `aspect_ratio`, frame images, motion-control
inputs, SkyReels tags and audio fields); models that require source media fail
before a paid generation submission when it is missing. Hailuo 1080p requires
its shorter duration. Gemini Omni omits duration unless using the Ext channel;
Ext editing omits it when a source video is present.

APIMart music submits to `/v1/music/generations` and persists its task ID.
`DetachedPoller` queries `/v1/music/tasks/{id}` and hands completed audio to the
audio processor, retaining the concurrency slot until completion or failure.
Recovered music tasks continue polling without another paid submission. The
current audio pipeline stores the first returned track; music operations such
as extension, separation and custom voice training are not model entries.
Suno interprets section-tagged prompts as custom lyrics (5,000 characters);
inspiration descriptions have a separate 3,000-character limit. TTS uses
`/v1/audio/speech`, one speaker and six voices. Voice settings survive saving
and reconcile against the selected model’s supported voices.

Run all APIMart contract tests without credentials, a database or paid requests:

```sh
node --import tsx --test scripts/test-apimart-generator.ts scripts/test-apimart-models.ts
```

The tests cover inventory completeness, all text/video submissions, API/model
version routing, image upload, field mappings, invalid media combinations,
completed/failed tasks and asynchronous music handoff/recovery.

#### Image catalog

The APIMart catalog includes all image-generation model IDs documented in the
[image API reference](https://docs.apimart.ai/en/api-reference/images/gemini-nano-banana-2.1/generation),
including official and Ext channels. Compatibility aliases are not separate
entries. Existing internal IDs and their API model selections stay intact;
Nano Banana 2.1 and its Ext channel are new entries, and 2.1 is the generator's
fallback. Unlike Nano Banana 2, 2.1 does not accept 0.5K.

Most models send `size` and `resolution`, but the generator handles these
exceptions:

- GPT Image 1/1.5 use `quality` without `resolution`. GPT Image 2 Official and
  2.5 combine resolution and quality in the picker, such as `2K High`.
- GPT Image 2.5 Ext uses one model ID plus `version`. Its picker combines
  resolution and version (`2K Flare` / `2K Sunburst`), and sends no `quality`.
- Official Grok and FLUX 3 use `aspect_ratio`. Grok resolution is lowercase;
  only Grok Image 2.0 takes a quality field, and only without reference images.
- Muse has aspect-ratio control but no resolution control. Imagen 4.0, Z Image
  Turbo and Grok 2.0 Ext only accept text-to-image requests in this integration.
- Wan 2.7 Pro supports 4K for text-to-image; editing a reference at a selected
  4K uses 2K. MAI editing lets the model determine output dimensions.
- Midjourney submits to `/v1/midjourney/generations`, then uses the same task
  poller. Native prompt flags select MJ versions and Niji. Its quality is not
  an image resolution; stale values such as `1K` are omitted.

Successful submissions can use either the legacy `200` array response or the
unified `202` object response. Run the mocked request and polling checks with
`node --import tsx --test scripts/test-apimart-generator.ts`; they require no
credentials, database, or paid generation requests.

---

## Current Model Inventory (November 2026)

### Google AI / Vertex AI
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| nano banana Pro | `gemini-3-pro-image` | image | 32,768 |
| nano banana 2.1 | `gemini-nano-banana-2.1` | image | 32,768 |
| nano banana 2 Lite | `gemini-3.1-flash-lite-image` | image | 32,768 |
| Gemini 4 Carbon | `gemini-4-carbon` | text | 65,536 |
| Gemini 4 Argon | `gemini-4-argon` | text | 65,536 |
| Gemini 4 Hydrogen | `gemini-4-hydrogen` | text | 65,536 |
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

Gemini 4 (`gemini-4-carbon`, `gemini-4-argon`, `gemini-4-hydrogen`) is listed
on both Google AI and Vertex AI with the 3.8 Flash request shape. All three are
in `MODELS_WITHOUT_SAMPLING_PARAMETERS`, and the thought flags in the REST
generator and the assistant adapter match `gemini-4` alongside `gemini-3`. The
`gemini-4-argon` ID is on Google's model docs and Carbon has an official
launch post; `gemini-4-hydrogen` was confirmed only through gateways
(OpenRouter, APIMart-style catalogs), so re-check it against ai.google.dev. The
REST generators' fallback stays `gemini-3.8-flash` until Hydrogen's ID and
pricing are confirmed.

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

Nano Banana 2.1 (`gemini-nano-banana-2.1`, GA on October 6, 2026, on both the
Gemini API and Vertex) replaced `gemini-3.1-flash-image`, which Google deprecated
the same day and stops serving on October 29, 2026. The request shape is the same
`generateContent` call with `imageConfig.aspectRatio` and `imageSize`, so the
move was a `modelId` swap on the `google-nano-banana-2` and `vertex-nano-banana-2`
entries plus both image generators' fallbacks. The entries keep their `id`s so
projects pinned to nano banana 2 carry over instead of falling back. The new ID
drops the `gemini-<version>-<tier>-image` naming, and `categorizeGoogleModel` in
`provider-model-lister.ts` recognised image models only by `flash-image` and
`pro-image`, so it now matches `nano-banana` as well — check that predicate
again when Google ships the next image model. The aspect ratios, quality tiers,
prompt limit and max output were carried over from nano banana 2 rather than
re-verified: Vertex documents the same 15 ratios, but one Gemini API listing
omits `9:21`, and the 131,072-token prompt limit has not been checked against
the 2.1 docs.

### OpenAI
| Name | Model ID | Category | Max Output |
|---|---|---|---|
| GPT Image 2.5 Sunburst | `gpt-image-2.5-sunburst` | image | - |
| GPT Image 2.5 Flare | `gpt-image-2.5-flare` | image | - |
| GPT Image 2 | `gpt-image-2` | image | - |
| GPT Image 1 Mini | `gpt-image-1-mini` | image | - |
| GPT-6 Astra | `gpt-6-astra` | text | 128,000 |
| GPT-6.1 Sol | `gpt-6.1-sol` | text | 128,000 |
| GPT-6.1 Terra | `gpt-6.1-terra` | text | 128,000 |
| GPT-6 Sol | `gpt-6-sol` | text | 128,000 |
| GPT-6 Luna | `gpt-6-luna` | text | 128,000 |
| GPT-5.6 | `gpt-5.6` | text | 131,072 |
| GPT-5.6 Terra | `gpt-5.6-terra` | text | 131,072 |
| GPT-5.6 Luna | `gpt-5.6-luna` | text | 131,072 |
| GPT-5.5 | `gpt-5.5` | text | 131,072 |
| GPT-5.4 | `gpt-5.4` | text | 131,072 |
| GPT-5.4 Mini | `gpt-5.4-mini` | text | 128,000 |
| GPT-5.4 Nano | `gpt-5.4-nano` | text | 128,000 |

GPT Image 2.5 ships as two model IDs rather than one — `gpt-image-2.5-flare` is
the small, speed-tuned tier (quality comparable to GPT Image 2) and
`gpt-image-2.5-sunburst` the base, quality-tuned one — so both are listed and a
project picks the tier it wants. They inherit GPT Image 2's size contract
exactly (edges a multiple of 16px, max edge 3840px, 655,360-8,294,400 total
pixels, ratios up to 3:1), which is why `usesGptImage2Geometry` in
`openai-generator.ts` matches on the `gpt-image-2` prefix and covers all three.
Two traits do not carry over. GPT Image 2.5 restores the transparent background
that GPT Image 2 dropped, so the transparency guard is
`supportsTransparentBackground` — the narrower `isGptImage25Model` check — and
not the geometry predicate it used to share; the png-or-webp requirement for a
transparent output still applies. And 2.5 adds two quality tiers above `high`,
`xhigh` and `max`, which the older models reject, so `resolveQuality` takes the
model and degrades both to `high` for anything that is not 2.5 rather than
sending a value the API refuses. The size and geometry errors name the model
they were raised for, since three model families now share that code path.

`gpt-image-1.5` was removed from the catalog ahead of its December 1, 2026
shutdown. `gpt-image-1-mini` retires on the same date and is still listed, so it
is the next entry to drop. OpenAI names `gpt-image-2` as the replacement for all
three retiring image models (`gpt-image-1.5`, `gpt-image-1-mini` and
`chatgpt-image-latest`), but the generator's `defaultModel` tracks the current
generation instead and is `gpt-image-2.5-flare`.

That default matters more than a fallback usually would. It covers a request
that carries no `modelId` — the legacy `POST /api/generate` route, whose
contract is a `1K`/`2K`/`4K` tier and a plain aspect ratio — but it also covers
a project pinned to a `modelConfigId` that no longer resolves. Removing a model
entry does not fail such a project: `getAllModels(...).find(...)` returns
`undefined`, the queue sends no `modelId`, and the generator quietly falls back.
So the default is what orphaned projects generate with, and dropping an entry
means checking that the fallback is still a model those projects should land on.

Between the two 2.5 tiers the default is Flare, not Sunburst, precisely because
it is reached silently: Flare is the everyday tier, and a project that lands
here got there by losing a pin to a cheaper model. Keep this on the newest
everyday tier as the catalog moves — the legacy route's `1K`/`2K`/`4K` parameter
only takes effect on a model that uses the gpt-image-2 geometry path, which the
retired `gpt-image-1.5` did not.

OpenAI has no video row: Sora 2 and Sora 2 Pro were dropped when OpenAI set the
Sora API's shutdown for September 24, 2026 with no successor model, so
`buildVideoGenerator` now throws for `OpenAI` the way it does for the other
providers that generate no video, and `openai-video-generator.ts` is gone.

The GPT-6 family (`gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-sol`,
`gpt-6-luna`) has reasoning always on and takes only the default sampling, so
`openai-text-generator.ts` omits `temperature` for any `gpt-6*` model. Both it
and the assistant's OpenAI adapter send `max_completion_tokens` instead of
`max_tokens` for `gpt-5*`, `gpt-6*` and the o-series. The ~922K-token prompt
limit comes from APIMart's catalog of the same IDs. The generator fallback
stays `gpt-5.6`.

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
| Claude Fable 5.2 | `claude-fable-5-2` | text | 128,000 |
| Claude Opus 5.5 | `claude-opus-5-5` | text | 128,000 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | text | 128,000 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | text | 128,000 |
| Claude Fable 5.1 | `claude-fable-5-1` | text | 128,000 |
| Claude Fable 5 | `claude-fable-5` | text | 128,000 |
| Claude Opus 5 | `claude-opus-5` | text | 128,000 |
| Claude Opus 4.8 | `claude-opus-4-8` | text | 128,000 |
| Claude Sonnet 5 | `claude-sonnet-5` | text | 128,000 |
| Claude Opus 4.7 | `claude-opus-4-7` | text | 128,000 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | text | 64,000 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | text | 64,000 |

Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 all reject non-default sampling
parameters, so they carry the single-value `[1.0]` temperature list and
`claude-text-generator.ts` omits `temperature` for them. The existing
`claude-fable-5`, `claude-opus-5` and `claude-sonnet-5` prefixes already cover
the point releases; `claude-haiku-5` was added for Haiku 5.5. Opus 5.5 cannot
disable thinking at all — the generator never sends a `thinking` field, so it
runs adaptive at the model's default `medium` effort.

### RunningHub
| Name | Model ID | Category |
|---|---|---|
| nano banana 2 | `rhart-image-n-g31-flash` | image |
| nano banana Pro | `rhart-image-n-pro` | image |
| GPT Image 2.5 Sunburst | `rhart-image-g-2.5/sunburst` | image |
| GPT Image 2.5 Flare | `rhart-image-g-2.5/flare` | image |
| GPT Image 2.5 Sunburst Official | `rhart-image-g-2.5-official-token/sunburst` | image |
| GPT Image 2.5 Flare Official | `rhart-image-g-2.5-official-token/flare` | image |
| GPT Image 2 | `rhart-image-g-2` | image |
| GPT Image 2 Official | `rhart-image-g-2-official` | image |
| Qwen Image 3 Pro | `alibaba/qwen-image-3.0-pro` | image |
| Qwen Image 3 | `alibaba/qwen-image-3.0` | image |
| Grok Imagine Quality | `rhart-imagine-image-quality` | image |
| Dola Seedream 5.0 Pro | `dola-Seedream-5.0-pro` | image |
| Dola Seedream 5.0 Pro Layer Decomposition | `dola-Seedream-5.0-pro/layer-decomposition` | image |
| Seedream V5 Pro | `seedream-v5-pro` | image |
| Wan 2.7 Pro | `alibaba/wan-2.7` | image |
| Seedance 2.0 Global | `bytedance/seedance-2.0-global` | video |
| Seedance 2.0 Global Multimodal Reference | `bytedance/seedance-2.0-global/multimodal-video` | video |
| MiniMax Hailuo H3 | `minimax/hailuo-h3/image-to-video` | video |
| MiniMax Hailuo H3 Multimodal Reference | `minimax/hailuo-h3/multimodal-to-video` | video |

RunningHub serves GPT Image 2.5 under a two-segment path — a model plus a
`sunburst` or `flare` tier — rather than the flat slug the older rhart models
use, so each entry carries its tier in the `modelId` and the generator appends
the endpoint suffix to it unchanged
(`.../rhart-image-g-2.5/sunburst/text-to-image`). It comes in two billing
tiers, and they are *not* the same API: `rhart-image-g-2.5` is the economy one
and `rhart-image-g-2.5-official-token` the official-token one, each with both
model tiers, so four entries in all. Watch the prefixes when adding a
predicate — `rhart-image-g-2-official` (the GPT Image 2 official tier) is not a
substring of `rhart-image-g-2.5-official-token`, and the economy
`rhart-image-g-2.5` is not a substring of it either, which is what keeps
`isGptImage2Official` and `isGptImage25OfficialToken` from matching each
other's models.

The economy tier needed no generator code: its request body is the default
rhart shape (`prompt`, `resolution`, optional `aspectRatio`, `imageUrls` on the
reference endpoint) and its reference endpoint is the default
`/image-to-image`. The official-token tier differs in four ways and has its own
branch. It edits through `/edit` rather than `/image-to-image`; it takes
`background` (`auto`/`transparent`/`opaque`) and `outputFormat`
(`jpeg`/`png`/`webp`) on top; `resolution` is required rather than optional;
and its `quality` enum adds the two tiers 2.5 puts above `high` (`xhigh`,
`max`) plus `auto`. Quality and resolution share the project's single quality
picker the same way `rhart-image-g-2-official` does — 18 combined values rather
than 9 — and `resolveTieredSize` splits a value back into the two fields for
both tiers, parameterised by the quality list. That splitter tokenises on
whitespace, `_`, `/` and `-`, so a multi-word tier has to be spelled without a
separator: the picker says `XHigh`, because `X-High` would tokenise to `high`.
It also accepts 32,000-character prompts against the economy tier's 20,000.

The aspect ratios come from the API rather than from RunningHub's docs. The
docs list 15 and no `auto`; a submitted job answered with

```
Query API error 1007: Parameter validation failed. The 'size' parameter only
supports 'auto' or the following ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3,
5:4, 4:5, 21:9. Pixel sizes are not supported.
```

so all four entries offer exactly those ten plus `auto`, and the five the docs
add — `1:2`, `2:1`, `1:3`, `3:1`, `9:21` — are not offered. `auto` is a value
these endpoints take rather than a field to leave off, so `isGptImage25` makes
the generator send it instead of dropping it the way the other rhart models do.
That error also named the field as `size`: RunningHub takes `aspectRatio` and
reports the upstream name, which is worth remembering when reading its
validation errors. All four take the same `1k`/`2k`/`4k` tiers. The GPT Image 2
entries were left as they are — this error says nothing about a different
model — so if `rhart-image-g-2-official` rejects one of those five ratios too,
this is the precedent for trimming it.

Neither tier is guarded against a transparent background on a `jpeg` output,
which cannot hold an alpha channel — RunningHub documents the two fields as
independent optionals and its coercion behaviour is unknown, so the request is
sent as configured rather than rejected client-side the way
`openai-generator.ts` rejects its own. If it turns out to fail upstream, that
guard is the fix.

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

Qwen Image 3 replaced Qwen Image 2 Pro (`alibaba/qwen-image-2.0-pro`), which
is gone from the catalog. The Pro entry keeps the old `id`
(`runninghub-qwen-image-2-pro`) so projects pinned to 2 Pro land on its
successor; dropping the `id` would instead make the generator fall back to its
default rhart model, a different family. Both 3.0 tiers share one request shape
and one predicate, `isQwenImage3`: `/text-to-image` and `/image-edit` (1-3
`imageUrls`, extra references dropped before upload), and `size` from a
discrete `width*height` enum that `QWEN_SIZE_MAP` resolves from the ratio and
`1K`/`2K` tier. That enum has no 21:9, so neither entry offers it. The prompt
limit is Alibaba's published 4,500 tokens; RunningHub documents none of its
own. `negativePrompt`, `seed`, `promptExtend`, `promptExtendMode` and
`enableThinking` are optional and left at RunningHub's defaults.

`Dola-Seedream-5.0-pro` and `seedream-v5-pro` are separate RunningHub listings,
and the entries are named the way RunningHub names them — **Dola Seedream 5.0
Pro** and **Seedream V5 Pro** — so the picker tells them apart. Both take the
same body through `isSeedream5Pro`; V5 Pro caps prompts at 2,000 characters to
Dola's 5,000.

`dola-Seedream-5.0-pro/layer-decomposition` splits one source image into a base
image plus up to 16 transparent PNG layers. Its `modelId` carries the endpoint,
so the generator submits to `.../openapi/v2/<modelId>` without appending a
suffix, and since it also contains `dola-seedream-5.0-pro`,
`isLayerDecomposition` is tested first. The body is a single `imageUrl`, a
`resolution` tier (`auto`/`1k`/`1.5k`/`2k`), `outputFormat` for the base only
(`jpeg`/`png`), and the prompt only when non-empty (2,000 characters). A job
without an image fails before upload.

It is the one image model whose task returns several images, so the multi-output
path exists for it. `ImageGenerator.checkStatus` takes an optional
`CheckStatusContext` (the job's `modelId`/`apiUrl`, resolved by the detached
poller with `getProviderRecordModels`), and `CheckStatusResult` may carry
`additionalImages` next to `imageBytes`. The generator takes the result that is
not PNG as the base — the layers are always PNG — or the first when all are, and
returns the rest in order. `ImageProcessor.processCompletedImage` saves the base
in the job's format and every additional image as PNG (`<name>.layer-<n>.png`
plus thumbnail and optimized copies), creates one album item each with the id
`<job id>-layer-<n>` so a retry overwrites rather than duplicates, offsets their
`createdAt` by a millisecond each so the set stays together in either sort
order, and checks the quota against the whole set. The job itself records only
the base. Every other model still reads `results[0]` alone; the queue manager's
stale-task pre-check passes no context, which only matters for the status it
reads. Which result is the base has not been confirmed against a live response —
check one when touching this.

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

# Civitai Projects

How the `civitai` project type is put together, for anyone changing it.

## Pieces

| Piece | Where |
| :--- | :--- |
| Shared helpers (AIR parsing, link parsing, defaults, limits, size presets, `resolveCivitaiParams`, `sanitizeCivitaiConfig`) | `src/lib/civitai.ts` |
| Types (`CivitaiResource`, `CivitaiGenerationConfig`, `Project.civitaiConfig`, `Job.civitaiParams`) | `src/types.ts` |
| Orchestration + REST client, workflow body builder, error formatting | `server/civitai/civitai-client.ts` |
| Generator (`generate` submits, `checkStatus` polls and downloads) | `server/generators/civitai-generator.ts` |
| Model lookup route (`POST /api/civitai/resolve`) | `server/routes/civitai.ts` |
| Settings panel / job details | `src/components/ProjectViewer/CivitaiSettingsPanel.tsx`, `CivitaiJobParams.tsx` |

## Invariants

- **The API key is a provider.** `ProviderType` has `Civitai` with an empty `PROVIDER_MODELS_MAP` entry, so it never shows in the regular model selector. The project's `providerId` names the account; there is no per-project credential.
- **Jobs go through the normal provider queue.** Unlike ComfyUI (own runner, no provider), a Civitai job is an image job whose generator has `checkStatus`, so `QueueManager.executeAsyncHandoff` submits and `DetachedPoller` polls every 30 s. The provider's concurrency limits in-flight workflows.
- **Jobs carry their own settings.** `addCivitaiDraftsToQueue` snapshots `resolveCivitaiParams(project.civitaiConfig)` onto `job.civitaiParams`; the server never reads the project's config at run time.
- **The seed is rolled server-side and kept.** `QueueManager.prepareGenerateRequest` fills a missing `civitaiParams.seed` and persists it before submitting. `ProjectRepository.saveJobs` only lets a client overwrite `civitaiParams` while the job is still a draft, so a stale client copy cannot drop the rolled seed.
- **`modelConfigId` holds the checkpoint AIR** for Civitai jobs and album items. Nothing server-side resolves it against provider models; the viewer maps it back to a name (`civitaiModelNames`), and the queue monitor reads the name from `civitaiParams`.
- **Every stored config is sanitized** with `sanitizeCivitaiConfig` (project create/update, job saves, bundle import): unknown keys dropped, AIRs normalized to `urn:air:…`, numbers clamped, sizes snapped to multiples of 8.

## Civitai APIs used

- `POST https://orchestration.civitai.com/v2/consumer/workflows` with one `textToImage` step (`model`, `additionalNetworks` keyed by AIR, `prompt`, `negativePrompt`, `scheduler`, `steps`, `cfgScale`, `width`, `height`, `clipSkip`, `seed`, `quantity: 1`, `outputFormat`) plus `allowMatureContent`. `currencies` is left out so Civitai picks the Buzz account.
- `GET /v2/consumer/workflows/{id}` — status `unassigned | preparing | scheduled | processing` keeps polling; `succeeded` reads `steps[].output.images[]` (`available`, `url`, `blockedReason`); `failed | expired | canceled` fails the job.
- `GET /v2/resources/{air}` — fallback name lookup for an AIR.
- `GET https://civitai.com/api/v1/model-versions/{id}` and `/api/v1/models/{id}` — resource metadata; the version response includes a ready-made `air`.

The shapes follow the official `@civitai/client` package's generated types. The provider's API URL overrides the orchestration base; `CIVITAI_ORCHESTRATION_URL` and `CIVITAI_WEB_URL` override the defaults server-wide (useful for a local mock).

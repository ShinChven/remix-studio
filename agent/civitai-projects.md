# Civitai Projects

How the `civitai` project type is put together, for anyone changing it.

## Pieces

| Piece | Where |
| :--- | :--- |
| Shared helpers (AIR and link parsing, defaults, limits, size presets, `resolveCivitaiParams`, `civitaiImageToImageSize`, `sanitizeCivitaiConfig`, `sanitizeCivitaiBinding`) | `src/lib/civitai.ts` |
| Types (`CivitaiResource`, `CivitaiBinding`, `CivitaiGenerationConfig`, `WorkflowItem.civitai`, `Project.civitaiConfig`, `Job.civitaiParams`) | `src/types.ts` |
| Remix engine: model slots as axes, negative routing, `Combination.civitai` | `src/lib/remixEngine.ts` |
| Orchestration + REST client (submit/get/delete workflow, blob upload, resource lookup, search), workflow body builder | `server/civitai/civitai-client.ts` |
| Generator (`generate` uploads the source and submits, `checkStatus` polls and downloads, `cancel`) | `server/generators/civitai-generator.ts` |
| Lookup and search routes (`POST /api/civitai/resolve`, `POST /api/civitai/search`) | `server/routes/civitai.ts` |
| Workflow model card, settings panel, job details, shared resource parts | `src/components/ProjectViewer/Civitai*.tsx` |
| MCP support | `server/mcp/tool-definitions.ts` (`resolveCivitaiItems`, `civitaiWorkflowItem`) |

## Invariants

- **Everything that varies is a workflow item.** The checkpoint and LoRAs are `type: 'model'` items whose `civitai.options` each job picks one of; text and text libraries feed the prompt unless `civitai.slot === 'negative'`; images are the source for image-to-image (first one used). A project has one checkpoint item; several checkpoints go in its options. The project's `civitaiConfig` holds only shared sampling settings.
- **A model item's `value` is its options' AIRs**, one per line. `ProjectRepository.saveWorkflow` sanitizes the binding and rewrites the value, so every path (routes, MCP, bundles) stores the same shape and empty slots read as "missing info".
- **The API key is a provider.** `ProviderType` has `Civitai` with an empty `PROVIDER_MODELS_MAP` entry, so it never shows in the regular model selector.
- **Jobs go through the normal provider queue.** Unlike ComfyUI, a Civitai job is an image job whose generator has `checkStatus`; `QueueManager.executeAsyncHandoff` submits and `DetachedPoller` polls — on its 30 s cycle and a 5 s lane for `FAST_POLL_PROVIDER_TYPES`. `checkJobStatus` re-reads the job first so the two cycles never both finish one job.
- **Jobs carry their own settings.** Drafting (viewer and MCP `draft_jobs`) snapshots `resolveCivitaiParams(project.civitaiConfig, combo.civitai)` onto `job.civitaiParams`; the server never reads the project's settings at run time.
- **What is only known at run time is stored on the job.** `QueueManager.settleCivitaiParams` rolls a missing seed and, with a source image, reshapes the size after it (`civitaiImageToImageSize`), writing `civitaiParams` and `aspectRatio`. `ProjectRepository.saveJobs` only lets a client overwrite `civitaiParams` while the job is a draft.
- **Source images go through Civitai's blob storage**, uploaded by the generator, so a private bucket works.
- **`modelConfigId` holds the checkpoint AIR** for Civitai jobs and album items; the viewer maps it back to a name and the queue monitor reads it from `civitaiParams`.
- **Deleting a project cancels its running remote tasks** through the optional `ImageGenerator.cancel` (only Civitai implements it). Running jobs cannot be deleted on their own.

## Civitai APIs used

- `POST https://orchestration.civitai.com/v2/consumer/workflows` with one `textToImage` step (`model`, `additionalNetworks` keyed by AIR, `prompt`, `negativePrompt`, `scheduler`, `steps`, `cfgScale`, `width`, `height`, `clipSkip`, `seed`, `quantity: 1`, `outputFormat`, and for image-to-image `sourceImage` + `sourceImageDenoiseStrenght` — sic) plus `allowMatureContent`. `currencies` is left out so Civitai picks the Buzz account.
- `GET` / `DELETE /v2/consumer/workflows/{id}` — status `unassigned | preparing | scheduled | processing` keeps polling; `succeeded` reads `steps[].output.images[]` (`available`, `url`, `blockedReason`); `failed | expired | canceled` fails the job.
- `POST /v2/consumer/blobs` — raw image bytes with their content type, as Civitai's own site uploads source images; returns a blob whose `url` workflow inputs take.
- `GET /v2/resources/{air}` — fallback name lookup for an AIR.
- `GET https://civitai.com/api/v1/model-versions/{id}`, `/api/v1/models/{id}` and `/api/v1/models?query=&types=` — resource metadata (the version response includes a ready-made `air`) and search.

The shapes follow the official `@civitai/client` package's generated types and Civitai's own source. The provider's API URL overrides the orchestration base; `CIVITAI_ORCHESTRATION_URL` and `CIVITAI_WEB_URL` override the defaults server-wide (useful for a local mock).

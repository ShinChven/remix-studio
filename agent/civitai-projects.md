# Civitai Projects

How the `civitai` project type is put together, for anyone changing it.

## Pieces

| Piece | Where |
| :--- | :--- |
| Shared helpers (AIR and link parsing, defaults, limits, size presets, video engine table `CIVITAI_VIDEO_ENGINES`, `resolveCivitaiParams`, `resolveCivitaiVideoSettings`, `civitaiDraftFields`, `civitaiImageToImageSize`, `sanitizeCivitaiConfig`, `sanitizeCivitaiBinding`, `civitaiWorkflowItemsFromParams`) | `src/lib/civitai.ts` |
| Whether a project's album holds images or videos (`projectMediaType`, `VISUAL_PROJECT_TYPES`) | `src/lib/project-media.ts` |
| Types (`CivitaiResource`, `CivitaiBinding`, `CivitaiGenerationConfig` with `mediaType` and `video`, `CivitaiVideoSettings`, `WorkflowItem.civitai`, `Project.civitaiConfig`, `Job.civitaiParams`, `AlbumItem.civitaiParams`) | `src/types.ts` |
| Remix engine: model slots as axes, negative routing, `Combination.civitai` | `src/lib/remixEngine.ts` |
| Orchestration + REST client (submit/get/delete workflow, blob upload, resource lookup, search), workflow body builders (`buildCivitaiWorkflow`, `buildCivitaiVideoWorkflow`) | `server/civitai/civitai-client.ts` |
| Generator (`generate` uploads the source or frames and submits, `checkStatus` polls and downloads an image or a video, `cancel`) | `server/generators/civitai-generator.ts` |
| Lookup and search routes (`POST /api/civitai/resolve`, `POST /api/civitai/search`) | `server/routes/civitai.ts` |
| Workflow model card, settings panel, video settings, job and album details, shared resource parts | `src/components/ProjectViewer/Civitai*.tsx` |
| MCP support | `server/mcp/tool-definitions.ts` (`resolveCivitaiItems`, `civitaiWorkflowItem`) |

## Invariants

- **Everything that varies is a workflow item.** The checkpoint and LoRAs are `type: 'model'` items whose `civitai.options` each job picks one of; text and text libraries feed the prompt unless `civitai.slot === 'negative'`; images are the source for image-to-image (first one used), or a video's start frame (and, for engines with `endFrame`, the second its end frame). A project has one checkpoint item; several checkpoints go in its options. The project's `civitaiConfig` holds only shared settings.
- **Images or videos is a project-level choice.** `civitaiConfig.mediaType === 'video'` makes a video project: no checkpoint (the engine brings its model), `civitaiConfig.video` holds the engine and its settings, and `projectMediaType` makes the viewer, album, posts, copy-to-library and watermarking treat the project as a video one. The project routes and MCP `update_project` refuse to change the media type once the project has jobs or album items, so an album never mixes the two.
- **The engine table is the single source of truth for video.** `CIVITAI_VIDEO_ENGINES` lists what each engine takes and its choices and defaults, mirroring Civitai's `wan.graph.ts` / `hunyuan.graph.ts`; `resolveCivitaiVideoSettings` coerces stored settings to them, and `buildCivitaiVideoWorkflow` builds each engine's input the way Civitai's `wan.handler.ts` / `hunyuan.handler.ts` do (Wan 2.2: a `videoGen` step at 12 fps with `metadata.suppressOutput` plus a `videoInterpolation` step referencing `$0` — so video steps stay unnamed). A video job's `resources` hold only LoRAs the engine takes, up to its limit, and its negative prompt only when the engine takes one.
- **A model item's `value` is its options' AIRs**, one per line. `ProjectRepository.saveWorkflow` sanitizes the binding and rewrites the value, so every path (routes, MCP, bundles) stores the same shape and empty slots read as "missing info".
- **The API key is a provider.** `ProviderType` has `Civitai` with an empty `PROVIDER_MODELS_MAP` entry, so it never shows in the regular model selector.
- **Jobs go through the normal provider queue.** Unlike ComfyUI, a Civitai job is an image job whose generator has `checkStatus`; `QueueManager.executeAsyncHandoff` submits and `DetachedPoller` polls — on its 30 s cycle and a 5 s lane for `FAST_POLL_PROVIDER_TYPES`. `checkJobStatus` re-reads the job first so the two cycles never both finish one job.
- **Jobs carry their own settings.** Drafting (viewer and MCP `draft_jobs`) snapshots `resolveCivitaiParams(project.civitaiConfig, combo.civitai)` onto `job.civitaiParams`; the server never reads the project's settings at run time.
- **What is only known at run time is stored on the job.** `QueueManager.settleCivitaiParams` rolls a missing seed (below 2^31: some engines read it as a signed 32-bit number) and, with a source image, reshapes the size after it (`civitaiImageToImageSize`) — or for a video, takes the engine's aspect ratio closest to the start frame — writing `civitaiParams` and `aspectRatio`. `ProjectRepository.saveJobs` only lets a client overwrite `civitaiParams` while the job is a draft.
- **Results keep their params.** The image and video processors copy `job.civitaiParams` onto the album item; it is carried through the trash, moves and bundles (sanitized on the way in), shown in the album's prompt view, returned by MCP `get_album_items`, and used to rebuild model and negative items when a result whose job is gone is reused.
- **A video result goes through the video pipeline.** `checkStatus` returns `videoBytes` for a workflow with video steps (the last step's `output.video`), and `DetachedPoller` hands those to `VideoProcessor` — mp4, poster frame, probed duration — instead of `ImageProcessor`.
- **Source images go through Civitai's blob storage**, uploaded by the generator, so a private bucket works.
- **`modelConfigId` holds the checkpoint AIR**, or for a video the engine (`wan-2.2`…), for Civitai jobs and album items (`civitaiJobModelId`); the viewer maps it back to a name from the workflow, album records and jobs, and the queue monitor reads it from `civitaiParams`.
- **Deleting a project cancels its running remote tasks** through the optional `ImageGenerator.cancel` (only Civitai implements it). Running jobs cannot be deleted on their own.

## Civitai APIs used

- Video: `POST https://orchestration.civitai.com/v2/consumer/workflows` with a `videoGen` step (`engine: 'wan'` with `version` `v2.1` / `v2.2` / `v2.2-5b` / `v2.5` / `v2.7` / `v3.0` and the matching `provider` — `civitai`, `comfy` or `fal`, none for 3.0 — and `operation` `text-to-video` / `image-to-video` where the engine takes one; or `engine: 'hunyuan'`), LoRAs as `loras: [{ air, strength }]`, frames as `images: [url]` or `startImage` / `endImage`. Output: `steps[].output.video`.
- Images: `POST https://orchestration.civitai.com/v2/consumer/workflows` with one `textToImage` step (`model`, `additionalNetworks` keyed by AIR, `prompt`, `negativePrompt`, `scheduler`, `steps`, `cfgScale`, `width`, `height`, `clipSkip`, `seed`, `quantity: 1`, `outputFormat`, and for image-to-image `sourceImage` + `sourceImageDenoiseStrenght` — sic) plus `allowMatureContent`. `currencies` is left out so Civitai picks the Buzz account.
- `GET` / `DELETE /v2/consumer/workflows/{id}` — status `unassigned | preparing | scheduled | processing` keeps polling; `succeeded` reads `steps[].output.images[]` (`available`, `url`, `blockedReason`); `failed | expired | canceled` fails the job.
- `POST /v2/consumer/blobs` — raw image bytes with their content type, as Civitai's own site uploads source images; returns a blob whose `url` workflow inputs take.
- `GET /v2/resources/{air}` — fallback name lookup for an AIR.
- `GET https://civitai.com/api/v1/model-versions/{id}`, `/api/v1/models/{id}` and `/api/v1/models?query=&types=` — resource metadata (the version response includes a ready-made `air`) and search.

The shapes follow the official `@civitai/client` package's generated types and Civitai's own source. The provider's API URL overrides the orchestration base; `CIVITAI_ORCHESTRATION_URL` and `CIVITAI_WEB_URL` override the defaults server-wide (useful for a local mock).

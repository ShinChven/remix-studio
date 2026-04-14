# Image Format Passthrough — Skipping the sharp Re-encode

Memo, not an implementation plan yet. Written to evaluate whether we can drop the
full-size `sharp` re-encode in `server/queue/image-processor.ts` by asking each
generation provider to return the target format directly.

Related: `design/image-handling.md`, `design/queue-architecture-design.md`.

---

## 1. Current Behaviour

`ImageProcessor.processCompletedImage` (`server/queue/image-processor.ts:30-127`) runs
three separate `sharp` passes on every completed job:

| Pass | Purpose | Output |
|------|---------|--------|
| A. Full-size re-encode | Normalise provider output into `targetFormat` (png / jpeg / webp) and inject EXIF `UserComment = prompt` | `{filename}.{ext}` |
| B. Thumbnail | Resize to 768 px, JPEG q=80 | `{filename}.thumb.jpg` |
| C. Optimized | Resize to 2048 px, JPEG q=90 | `{filename}.opt.jpg` |

Pass A exists because **sharp was added originally to unify output quality** across
providers that return different default formats. It has a real memory and CPU cost:

- `sharp(imageBytes).withMetadata(...).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer()`
  decodes the full image to a raw raster (~`width × height × 4` bytes — for a 4K image
  that's ~48 MB), then re-encodes.
- Peak memory for this pass is roughly **2× the raw raster** (input decoded + output
  buffer being built), so ~100 MB transient for a single 4K image.
- On a 4 GB VPS with several concurrent generations, these transients stack and are
  the single biggest memory risk in the generation pipeline (see
  `export-streaming-architecture.md §5.2` for context).

Passes B and C are genuine derivative assets that the UI needs and cannot be skipped.

---

## 2. The Observation

**Most image generation providers already accept a requested output format.** If we
pass that configuration through from the provider profile to the API call, the raw
bytes coming back from the provider are already in the format we want to store — Pass
A becomes a no-op round trip through sharp.

Skipping Pass A would:

- Remove the largest transient allocation in the generation pipeline.
- Preserve the original provider output byte-for-byte (no quality loss from a
  decode/re-encode cycle, however lossless the re-encode claims to be — JPEG quality 100
  is still not identity).
- Make concurrent generation capacity predictable: memory per job drops from
  ~100 MB peak to ~20–30 MB (just Passes B and C, which run on smaller images).

---

## 3. What Pass A Actually Does (and What We'd Lose)

Pass A isn't purely format conversion. It has three side effects:

### 3.1 Format normalisation

Re-encodes whatever the provider returned into the user-selected format. **This is
what we'd delegate to the provider.** Whether it works depends on §4.

### 3.2 EXIF injection (`UserComment = prompt`)

`withMetadata({ exif: { IFD0: { UserComment: job.prompt } } })` writes the prompt into
the image file itself. Useful for files that leave the platform (exports, direct
downloads, drag-and-drop to disk) so the generation prompt travels with the pixels.

If we drop Pass A, we lose this injection unless we replace it with something else.
Options, cheapest first:

| Option | Cost | Tradeoff |
|--------|------|----------|
| **Drop the feature.** Prompt lives in the DB / export manifest only. | Zero | Files lose prompt provenance once downloaded. |
| **Inject metadata without re-encoding.** Use `piexifjs` or `exifr` to patch the existing JPEG/WebP binary in-place. No decode/encode pass. | Small dependency, ~a few lines | Works only for formats that support EXIF (JPEG, WebP, PNG via `tEXt` chunks). Untested for provider-returned bytes but is pure-JS and fast. |
| **Keep sharp for metadata only.** Run sharp's `withMetadata` on the provider bytes and `.toBuffer()` without changing format. | Same transient memory cost as today | Solves nothing. Don't do this. |

**Recommendation: option 2** (`piexifjs` or similar). Keeps the feature, removes the
memory cost. Needs a spike to verify it handles WebP and PNG cleanly — JPEG is trivial.

### 3.3 Re-compression to a known quality level

Pass A currently emits `jpeg({ quality: 100, chromaSubsampling: '4:4:4' })` or
`webp({ lossless: true })`. If a provider returns JPEG at quality 85, we currently
re-encode to 100 — which **does not recover detail**, it just bloats the file and
stores the artifacts more faithfully. The perceived-quality benefit here is zero.

So this "quality unification" is illusory. What matters is what the **provider**
emits, and that's controllable via the provider's own output parameters. This bucket
is a non-loss.

---

## 4. Provider Capability Matrix

Not every provider supports every target format. Rough state of the world:

| Provider | Native output formats | Notes |
|----------|----------------------|-------|
| OpenAI `gpt-image-1` | png, jpeg, webp | `output_format` parameter. Full control. |
| OpenAI DALL-E 3 | png only | No format option. |
| Google Vertex Imagen | png, jpeg | `outputOptions.mimeType`. |
| xAI Grok | png (default); some models jpeg | Limited. |
| RunningHub / ComfyUI | arbitrary | Workflow-controlled — depends on the user's workflow node setup. |
| Stable Diffusion (various hosts) | png usually | Depends on host. |

**Implication**: passthrough cannot be universal. Some providers will always need a
fallback. The design must accept both a passthrough path and a fallback path.

---

## 5. Proposed Design

### 5.1 Provider capability declaration

Extend the provider / model config to declare supported output formats:

```ts
interface ModelConfig {
  // ...existing fields
  supportedOutputFormats: ('png' | 'jpeg' | 'webp')[];
  defaultOutputFormat: 'png' | 'jpeg' | 'webp';
}
```

Populated per provider type in the generator adapter (`server/generators/*`). Not
user-configurable — it's a capability, not a preference.

### 5.2 Request-side: pass the target format through

In `QueueManager.prepareGenerateRequest` (`server/queue/queue-manager.ts:367-408`),
resolve the target format once:

```ts
const requestedFormat = queued.format || job.format || 'png';
const canPassthrough = modelConfig.supportedOutputFormats.includes(requestedFormat);
const providerFormat = canPassthrough ? requestedFormat : modelConfig.defaultOutputFormat;
```

Pass `providerFormat` to the generator. Each generator adapter maps it to that
provider's specific parameter (`output_format`, `outputOptions.mimeType`, etc).

### 5.3 Response-side: two paths in ImageProcessor

```ts
if (providerFormat === requestedFormat) {
  // Passthrough path — store bytes as-is
  finalBytes = injectPromptExif(imageBytes, providerFormat);  // piexifjs, no re-encode
  ext = extensionFor(providerFormat);
  mimeType = mimeFor(providerFormat);
} else {
  // Fallback path — one sharp re-encode (today's behaviour)
  finalBytes = await sharpReencode(imageBytes, requestedFormat, job.prompt);
}
```

Passes B and C run from `imageBytes` (or `finalBytes`) regardless — they always need
sharp because they involve resize. Passing the raw provider bytes to sharp for thumb
and optimized is arguably cleaner anyway (avoids compounding re-encode artifacts).

### 5.4 Thumbnail and optimized inputs

A subtle improvement that comes for free: `generateThumbnail` and `generateOptimized`
in `server/utils/image-utils.ts` currently take `finalBytes` (the sharp-re-encoded
full-size). Switching them to take `imageBytes` (raw provider bytes) gives slightly
higher-quality derivatives because they start from a single decode of the cleanest
source instead of decode → JPEG100 encode → decode → resize encode.

This is a one-line change in `ImageProcessor`. Do it as part of the rework regardless
of whether passthrough is enabled for the provider.

---

## 6. Memory Impact (Estimate)

Per generation job, peak transient memory:

| | Pass A (full re-encode) | Pass B (thumbnail) | Pass C (optimized) | Total peak |
|---|---|---|---|---|
| **Today** | ~100 MB | ~20 MB | ~50 MB | ~100 MB (dominated by A) |
| **Passthrough** | 0 (bytes handed to storage directly) | ~20 MB | ~50 MB | **~50 MB** |
| **Fallback (provider can't match)** | ~100 MB | ~20 MB | ~50 MB | ~100 MB (unchanged) |

Best case (OpenAI, Vertex, etc where passthrough is available): **50% drop in peak
memory per job.** This roughly doubles the number of concurrent generations the VPS
can run before memory becomes the binding constraint.

CPU savings are similar magnitude — sharp re-encode of a 4K image at JPEG q=100 is
not free.

---

## 7. Risks and Open Questions

1. **EXIF injection on provider bytes.** Needs a spike: does `piexifjs` cleanly write
   `UserComment` into JPEG bytes from OpenAI, Vertex, and RunningHub? What about WebP?
   If PNG metadata support is flaky, we might have to drop prompt-in-file for PNG
   outputs and rely on DB + export manifest.

2. **Provider output drift.** Some providers quietly return different bytes than
   their docs claim (e.g. colour profile differences, stripped EXIF, unusual chroma
   subsampling). Passthrough means whatever quirks they have become user-visible.
   Mitigation: a small compatibility test per provider that verifies the round-trip
   format and basic integrity before enabling passthrough for that provider.

3. **Format negotiation UX.** Currently the user picks a format per project. If they
   pick JPEG but their chosen provider is DALL-E 3 (PNG-only), today we silently
   convert. With passthrough, we'd either:
   - (a) Silently fall back to sharp re-encode (current behaviour),
   - (b) Warn the user "this provider can only output PNG",
   - (c) Refuse the job.

   **Recommendation: (a).** Fallback is invisible. The user doesn't need to learn the
   capability matrix. The memory win is opportunistic.

4. **RunningHub workflows.** These are user-defined — the generator has no idea what
   format will come back until the workflow runs. Two options:
   - (i) Let the user declare the workflow's output format in the model config, and
     trust it. Fall back to sharp detection if wrong.
   - (ii) Always fall back to sharp re-encode for RunningHub.
   **Recommendation: (ii) for now.** RunningHub is a power-user feature; the
   passthrough optimisation is mostly for the common providers.

5. **Thumbnail correctness.** If we switch Passes B and C to read from raw provider
   bytes, make sure sharp handles every provider's output variant (colour spaces,
   embedded ICC profiles, etc). Probably fine — sharp/libvips is battle-tested — but
   worth a sanity test per provider.

---

## 8. Rough Plan (when we decide to do this)

| Step | Change |
|------|--------|
| 1 | Spike: verify `piexifjs` (or alternative) can write `UserComment` into JPEG/WebP/PNG bytes from each supported provider without corrupting them. Decision gate — if this fails, the whole idea falls back to "keep sharp for EXIF only". |
| 2 | Add `supportedOutputFormats` and `defaultOutputFormat` to `ModelConfig` type and provider definitions. |
| 3 | Each generator adapter maps the requested format into its provider-specific parameter. |
| 4 | `QueueManager.prepareGenerateRequest` resolves `providerFormat` and passes it to the generator. |
| 5 | `ImageProcessor.processCompletedImage` gains the passthrough branch. |
| 6 | `generateThumbnail` / `generateOptimized` take raw provider bytes (not the re-encoded `finalBytes`). |
| 7 | Per-provider sanity tests for thumbnail + optimized correctness. |
| 8 | Leave the sharp re-encode fallback in place — do not delete it. Providers without passthrough still need it. |

No schema migration needed (the change is behavioural). No user-facing change.

---

## 9. When to Do This

**Not urgent.** The current sharp-based path works. This memo exists so we remember
the option when:

- Generation memory becomes a real constraint on the 4 GB VPS (it is not today —
  see `export-streaming-architecture.md §5.6`).
- We want to stop generation and export from competing for the same memory headroom.
- A user reports that their 100-job batches pause mid-way due to memory pressure.

Until then, this is a future optimisation. The operational safety measures in
`export-streaming-architecture.md §5.6` (`MemoryMax`, RSS watchdog) are the first
line of defence; passthrough is the structural fix that makes those watchdogs much
less likely to fire.

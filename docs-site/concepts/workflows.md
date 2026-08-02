# Workflows & Combinations

A **workflow** is the ordered recipe used to compose generation drafts. It contains direct text/media steps and references to reusable [libraries](/concepts/libraries). The workflow is resolved into drafts first; only the drafts you start consume provider calls.

## Workflow Inputs

Workflow steps can be:

- **Direct text** — fixed text added to every generated prompt.
- **Direct image, video, or audio** — a fixed media context added to every generated draft, when the project/model accepts that modality.
- **Library reference** — one eligible item is chosen from a text, image, video, or audio library.

Direct steps contribute one fixed choice. A library step contributes all of its non-empty, tag-matching items. Disabled steps are skipped entirely without being deleted.

Text choices are joined in workflow order with a blank line between them. Media choices are collected into the corresponding image, video, and audio context arrays. This means workflow order is significant for composed text even though a library's own items are sorted only for browsing.

## Filtering a Library Step

A library step can select tags and choose an **OR** or **AND** match mode:

- **OR** includes items containing at least one selected tag.
- **AND** includes only items containing every selected tag.
- No selected tags means every non-empty item is eligible.

If filtering leaves a library step with no eligible items, that step contributes no choice. Use the library preview from the workflow to check the effective item set before creating drafts.

## Combination Mode

With shuffle disabled, the engine calculates the Cartesian product of all contributing choice groups.

> 3 subjects × 4 styles × 2 reference images = **24 possible combinations**.

The **Job Quantity** field controls how many drafts are actually created. The total shown beside it is the number of possible combinations, and the total can be copied into the quantity field for a complete sweep.

Combination order is deterministic. If the requested quantity exceeds the number of unique combinations, the engine cycles from the beginning and creates repeated combinations with new job IDs and filename suffixes. Set the quantity to the displayed total or less when you require unique drafts.

## Shuffle Mode

With shuffle enabled, the engine creates exactly the requested number of samples. For every sample it:

1. Keeps every non-empty direct step.
2. Picks one random eligible item independently from each library step.
3. Composes the resulting text and media contexts.

Sampling is with replacement, so the same combination can appear more than once. Shuffle is useful for exploration or when a full Cartesian product is too large; it is not a guarantee of unique or evenly distributed combinations.

| Mode | Draft selection | Best for |
| :--- | :--- | :--- |
| Combination | Deterministic sequence through the Cartesian product | Exhaustive or reproducible coverage |
| Shuffle | Independent random pick per library step for each draft | Fast exploration and bounded sample sizes |

## Draft Composition and Filenames

Creating drafts stores the resolved values, not only a pointer to the workflow:

- Composed prompt text.
- Image, video, and audio context arrays.
- Provider and model selection.
- Output options such as aspect ratio, quality, format, duration, resolution, or sound.
- A workflow snapshot for later inspection and reuse.

Library item titles and tags become filename parts. The project filename prefix is prepended when configured, and a short unique suffix prevents collisions.

If a model declares a prompt limit, Remix Studio checks the composed drafts. When one or more exceed that limit, you can cancel or allow the app to truncate affected prompts before they are saved.

## Drafts, Queue, and Completed Results

The project separates preparation from execution:

1. **Draft** — review the prompt, contexts, model, and output settings. Start one, selected drafts, or all drafts.
2. **Queue** — pending, processing, and failed jobs appear here. Retry or remove jobs individually or in a selection.
3. **Done** — completed job records, including the configuration that produced each result.
4. **Album / Texts / Audios** — durable output items used for viewing, copying, exporting, or campaign media.

Starting a draft changes it into a pending server-side job. A storage estimate is checked before this transition. See [Queue & Concurrency](/concepts/queue) for dispatch and recovery behavior.

## Editing Workflow Steps

The workflow editor supports:

- Reordering steps.
- Temporarily disabling a step.
- Changing the library used by an existing library step.
- Previewing a library and editing its tag filter.
- Dragging files into the workflow or pasting text/media with `Cmd+V` / `Ctrl+V`.
- Cropping or drawing on direct workflow images, with reset support.
- Saving direct inputs into compatible libraries.

Project updates replace the stored workflow with the submitted ordered list. The UI serializes rapid saves, and assistant/MCP callers must fetch the latest project immediately before replacing a workflow so that unchanged steps are deliberately carried forward.

## Output Type and Model Compatibility

The project type determines the output processor: text, image, video, or audio. Input support is then constrained by the selected model's declared capabilities. For example, an audio project accepts text and only offers reference images when that audio model declares image support.

The presence of an input control does not make every provider/model combination valid. Select the provider and model first, then use the options the project editor exposes for that model. See [Supported Workflows](/concepts/supported-workflows).

## Related

- [Libraries & Prompts](/concepts/libraries) — reusable choice groups and tag filters.
- [Projects & Albums](/concepts/projects) — project tabs, outputs, and reuse.
- [Queue & Concurrency](/concepts/queue) — how selected drafts execute.

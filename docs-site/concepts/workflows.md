# Workflows & Combinations

A **workflow** is the heart of Remix Studio. It defines the inputs that get combined into generation drafts. Instead of writing each prompt variant by hand, you assemble reusable and direct inputs, and the engine expands them.

## Inputs

A workflow is built from two kinds of inputs across text, image, video, and audio slots:

- **Library-backed inputs** — pulled from reusable [libraries](/concepts/libraries) (prompt fragments, reference images, etc.).
- **Direct inputs** — pinned or manually entered text/image/audio/video values inline in the workflow.

You can mix both freely. You can also change the source library on a workflow item, and filter library items by tags using an **AND/OR tag match mode**.

## The Combination Engine

When you run the workflow, the engine expands your inputs into draft permutations.

> If you have **3** subject prompts, **4** style prompts, and **2** reference-image sets, Remix Studio produces **3 × 4 × 2 = 24** drafts from one workflow — before you send anything to a provider.

This is the full Cartesian product across the selected inputs.

## Shuffle Mode

When `shuffle` is enabled, the workflow **samples** from those libraries instead of enumerating the full Cartesian product. Use it for exploratory sampling when the full combination set would be too large.

| Mode | Behavior | Use when |
| :--- | :--- | :--- |
| Combination (default) | Enumerates every permutation | You want exhaustive coverage |
| Shuffle | Randomly samples permutations | You want exploratory variety without thousands of drafts |

## Drafts → Queue

Expanding a workflow creates **drafts**. Drafts are not executed automatically — you choose which to run:

1. Expand the workflow into drafts (all permutations, or a shuffle sample).
2. Review and select the drafts you actually want.
3. Queue all or selected drafts. Only jobs marked `pending` are enqueued.

This separation lets you generate a large draft set cheaply, then spend API calls only on the runs you care about. Execution is handled by the [queue](/concepts/queue) with provider-level concurrency.

## Editing Workflow Items

The workflow list supports productivity features:

- **Drag and drop** media files directly into the workflow list.
- **Paste** text and media with `Cmd+V` / `Ctrl+V`.
- The list **auto-scrolls** to the bottom as new items are added.
- An **Image Editor** lets you crop and draw directly on workflow images, with a reset option to revert edits.

Workflow state is synchronized carefully: the app fetches fresh project state before applying updates and serializes rapid updates with database locks to avoid overwriting concurrent changes.

## Related

- [Supported Workflows](/concepts/supported-workflows) — the full matrix of input → output types.
- [Projects & Albums](/concepts/projects) — where workflows live and outputs land.

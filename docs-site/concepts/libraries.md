# Libraries & Prompts

**Libraries** are reusable collections that keep common prompt fragments and media references out of individual projects. Build them once, reuse them across every [workflow](/concepts/workflows).

## Library Types

Remix Studio supports reusable libraries for each modality:

- **Text libraries** — reusable prompt fragments, style blocks, subject ideas, and prompt-building templates.
- **Image libraries** — reference images, moodboards, style references, and reusable visual inputs.
- **Video and audio libraries** — reusable video and audio inputs.

## Items, Titles & Tags

- Each library contains **ordered items**.
- Items can include **titles** and **tags** for easier filtering and reuse.
- The [workflow engine](/concepts/workflows) can filter library items by tags using an **AND/OR tag match mode**.

## Editing & Reuse

- Libraries are edited **independently from projects**, so you can improve a shared collection once and have the change reflected across multiple workflows.
- Libraries can be created, updated, deleted, and duplicated.
- A **Library Cleanup** view helps remove unused or orphaned items.
- A refreshed **Library Preview** modal gives a responsive view of library contents.

## Import & Export

Text libraries support **import and export as Markdown-style lists**, so you can bulk-edit prompt collections outside the app and paste them back in.

## Prompt Editor

Individual text prompts open in a dedicated **Prompt Editor** with rendered Markdown content, so longer prompt templates stay readable.

## Building Libraries Programmatically

Both the in-app [assistant](/concepts/assistant) and external [MCP clients](/integrations/mcp) can create libraries and prompts (including batch prompt creation), search items across libraries, and update or delete individual text prompts — all through the same shared tool layer used by the UI.

## Related

- [Workflows & Combinations](/concepts/workflows) — how library inputs get expanded.
- [Browser Extension](/integrations/chrome-extension) — send images and text from any web page straight into a library.

# Libraries & Prompts

**Libraries** are reusable, typed collections of text or media. A workflow can point at a library instead of embedding a particular item, allowing one project step to expand into every matching item in that collection.

Libraries belong to the signed-in user and can be reused across projects, campaign posts, the in-app assistant, and MCP automation.

## Library Types

| Type | What an item stores | Typical uses |
| :--- | :--- | :--- |
| **Text** | Prompt text, with an optional title and tags | Subjects, styles, instructions, templates, campaign ideas |
| **Image** | An uploaded image storage key and derived preview data | Reference images, moodboards, products, characters |
| **Video** | An uploaded video storage key and preview metadata | Motion references and source clips |
| **Audio** | An uploaded audio storage key and metadata | Voice, music, and other supported audio references |

The library type matters when a workflow is expanded: text items are joined into the generated prompt, while media items become image, video, or audio context arrays.

## Browsing and Organizing

The library list supports search, pagination, and pinning. Up to the UI's pin limit can be kept at the top for quick access.

Inside a library you can:

- Search items and filter them by tags.
- Sort by newest/oldest or by name in ascending/descending order.
- Edit an item's title and tags; text items can also be edited in the Prompt Editor.
- Let a vision model tag image and text items with the wand button, for the selection, the matching items or the whole library. See [Auto-Tagging](/concepts/projects#auto-tagging).
- Watermark a single image with the stamp button on its card and download the result, without saving a copy. See [Watermarking a Single Image](/concepts/projects#watermarking-a-single-image).
- Copy an item's reference for the assistant or another AI chat with **Copy ID for AI**. The copied text, `library:<libraryId>/item:<itemId>`, names both the library and the item, which is what every tool that acts on an item needs.
- Select items with the checkbox on each card — Shift-click a second checkbox to select the range between — for batch tagging, copying, moving, or deletion.
- Copy or move items only to a library of the same media type.
- Duplicate a whole library, including its items.
- Export media libraries as ZIP archives.

Items do **not** have a manually maintained sequence. Their display order comes from the selected sort mode.

## Titles, Tags, and Generated Filenames

Titles make long prompts and opaque media keys easier to recognize. Tags serve two separate purposes:

1. The library editor can filter the items you see.
2. A workflow library step can select tags to restrict which items participate in generation.
3. Results drafted from an item start with its tags in the album, so the album can be filtered by the same tags as the libraries behind it.

Workflow tag matching can use:

- **OR** — an item is eligible when it has any selected tag.
- **AND** — an item is eligible only when it has every selected tag.

Matching is case-insensitive. Items without any selected tag are excluded. The filter in a workflow step's library preview leads with the current selection and the most-used tags; **All tags (N)** opens a panel with search, a most-used / A–Z sort and a count beside each tag, which is a bottom sheet on a phone. When a library item becomes a draft, its title and tags are also used as candidate filename parts; the project prefix and a short random suffix complete the filename.

## Adding and Reusing Items

Text items can be created in the library editor, imported in batches, or created through the assistant/MCP tool layer. Media files can be uploaded directly, and an external MCP client can upload images, videos and audio into a library too (see [file uploads](/integrations/mcp#file-uploads)).

From a project you can also:

- Save a direct workflow input into a compatible library.
- Copy or move selected album results — or the whole album, for a copy — into a new or existing compatible library with **Copy to…** or **Move to…**. A move sends the results to the recycle bin once the library has its copies.
- Choose the raw or optimized asset version when copying generated media.

Changing a library later changes the choices available to workflows that reference it. Drafts already created keep their resolved prompt, contexts, provider/model settings, and workflow snapshot; they are not silently regenerated.

## Import & Export for Text Libraries

The **Import / Export** screen is available for text libraries and supports plain list text and JSON.

List format:

```text
- A prompt with no title
- Portrait lighting: soft window light | tags: portrait, soft
```

- Every non-empty list line must begin with `- `.
- Text before the first colon becomes the optional title.
- `| tags:` adds comma-separated tags.
- Shared tags entered in the screen are merged into every imported item.
- The preview reports malformed lines before anything is created.

JSON format is an array of objects:

```json
[
  {
    "title": "Portrait lighting",
    "content": "soft window light",
    "tags": ["portrait", "soft"]
  }
]
```

Export can include titles and tags or produce a simpler plain list. Import appends items; it does not replace the existing library.

## Deleting a Referenced Library

A library can be referenced by workflow items in more than one project. If it is still referenced, deletion opens **Library Cleanup**.

Cleanup lists the projects that use the library and lets you remove those workflow references one project at a time, or remove all references and then delete the library. It does **not** scan for or delete “orphaned” items inside the library.

::: warning
Removing a reference changes the affected project's workflow. Deleting the library and its stored media is permanent; library items do not go to the project recycle bin.
:::

## Assistant and MCP Access

The shared tool layer can list and search libraries, browse their items or read one item by ID (`get_library_item`, which takes the reference **Copy ID for AI** copies), create and update libraries, create prompts individually or in batches, and update item metadata one item or many at a time. Text prompts can also be deleted through the explicitly confirmed destructive tool. External MCP clients can also upload media files into a library.

See [The Assistant](/concepts/assistant) for the in-app approval flow and [MCP Support](/integrations/mcp) for external clients.

Open library pages and the libraries list refresh on their own when the assistant, an MCP client or another tab adds, edits or removes items, so there is no need to reload the page to see an agent's work.

## Related

- [Workflows & Combinations](/concepts/workflows) — how library choices become drafts.
- [Projects & Albums](/concepts/projects) — copy results back into libraries.
- [Browser Extension](/integrations/chrome-extension) — import page content into a library.

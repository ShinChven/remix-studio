# Project page (v2): feature inventory

Every capability of `/v2/project/:id` (`src/v2/pages/ProjectViewer.tsx` and
`src/v2/components/project/*`). A redesign of the page must keep each item.

## Page shell
- [x] Two panes: workflow (left) and results (right); results sections Drafts · Queue · Done · Album (Texts / Audios for text and audio projects), each with a live count; section kept in `?tab=`.
- [x] Workflow full-screen mode (steps in a grid, results hidden); not offered on compact widths.
- [x] Compact widths: one pane at a time with a floating toggle between workflow and results; choosing a section shows results.
- [x] Live refresh from the project event stream (jobs, album, workflow/project edits made elsewhere).
- [x] `H` toggles the visibility of disabled steps (ignored while typing, with modifiers, or under a dialog).
- [x] Paste and drop files onto the workflow to add image/video/audio steps.

## Project menu and header
- [x] Project name; opens a Project info dialog (title, description, id, storage usage).
- [x] Archived badge.
- [x] Start an assistant chat bound to the project.
- [x] Show / hide disabled steps (count + `H` hint; disabled when none).
- [x] Import a workflow from an album result (not for ComfyUI).
- [x] Edit project info, Duplicate project, Manage orphan files, Archive / Unarchive, Delete project (confirmed).

## Workflow steps (regular, Civitai)
- [x] Add step: Text, Image (when the model takes reference images), Library; Video / Audio reference (video models that take them); Civitai: Checkpoint (one slot, not for video) and LoRA (not when the video engine has none).
- [x] Drag to reorder; drop indicator; dragged state.
- [x] Enable / disable a step; disabled look.
- [x] Delete a step (confirmed).
- [x] Text: open the editor dialog, character count, pick text from a library, save to a library.
- [x] Image: upload, pick from library/album, edit in the image editor, save to a library, preview in the lightbox, uploading state.
- [x] Video / Audio: upload, pick from library, inline player.
- [x] Library: preview dialog (tag filter + match mode), item count, filtered-tag count, change library.
- [x] Civitai: prompt / negative switch on text and text-library steps; model steps (checkpoint/LoRA search, options, strength).
- [x] ComfyUI: its own panel (connection, workflow JSON, node bindings) and settings.
- [x] Empty workflow hint; "all steps hidden" hint; loading state.

## Run dock (generation settings)
- [x] Model picker (provider + model, description), attention state without a model.
- [x] Per type: image (ratio, quality, background, format, steps, guidance); video (ratio, resolution, duration, sound); text (system prompt, temperature, max tokens); audio (music mode / TTS single-multi speaker, names, voices, format); Civitai and ComfyUI settings.
- [x] Shuffle workflow.
- [x] Collapsed summary of the settings.
- [x] Job quantity with stepper; "of N" sets it to the combination count.
- [x] Notices: pick a model, workflow error.
- [x] Add to drafts with upload / composing / saving progress; prompt-limit dialog (truncate / keep / cancel).

## Jobs (Drafts, Queue, Done)
- [x] Row: prompt, provider + model, settings (ratio, quality, format, video/audio contexts), status (draft / queued / running / failed / completed).
- [x] Expand a row: full prompt, ComfyUI inputs, Civitai params, generated text, reference images (lightbox), videos, audio, error details, metadata.
- [x] Select rows, shift-click ranges, select all (checked / indeterminate).
- [x] Reuse a job's configuration (confirmed).
- [x] Drafts: run one, start selected / start all, delete one / selected / all (confirmed), starting progress. Empty: stack of the newest results opening the album, or a build-your-workflow hint.
- [x] Queue: retry one failed, retry selected failed, delete one / selected (confirmed), clear all failed (confirmed), retry progress. Empty state.
- [x] Done: delete one / selected record (confirmed), sort newest/oldest, paging with page size. Empty state.

## Album
- [x] Image/video grid; text list; audio list with play/pause and expandable details.
- [x] Total size; loading spinner without covering the grid.
- [x] Search (debounced, IME-safe), aspect-ratio filter with counts, tag filter with counts and all/any match, page size (remembered per project), sort newest/oldest; all in the URL.
- [x] Click a tag on an item to filter by it; no-match empty state; empty album state.
- [x] Select (shift ranges, select page), bulk actions scoped to selection, or filter results, or the whole album: Export (zip / watermark export), Tag (add/remove/replace), Auto-tag (image, text) with progress strip, Copy to…, Move to… (selection only), Compare (text, 2+), Delete (confirmed, `D` dismisses).
- [x] Per item: open in lightbox (image, with delete/reuse/next scrolling into view) or video dialog, open original, quick watermark (images), rename filename (duplicate check), edit tags, reuse workflow (loading), copy resource reference, view full prompt (+ Civitai params), delete.
- [x] Item info: index, aspect ratio, date, filename, tags, prompt, provider/model, raw/optimized/thumbnail sizes, resolution/quality, duration, format.
- [x] Text: detail dialog with paging, image contexts count.
- [x] Paging footer.

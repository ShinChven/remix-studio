# Library page (v2): feature inventory

Every capability of `/v2/library/:id` (`src/v2/pages/LibraryEditor.tsx` and
`src/v2/components/library/*`). A redesign of the page must keep each item.

## Page shell
- [x] Hero tinted with the kind color (text primary, image tertiary, video secondary, audio success): back to Libraries, kind shape and icon, kind label, name, description (three lines), stats (items, tags, total size for media, last update), cover stack of the three newest pictures (image and video, wide windows).
- [x] Live refresh of the library and its items (renamed, deleted, refilled elsewhere); "not found" state.
- [x] Media libraries: drop files anywhere on the page to upload; files of another kind are skipped with a notice.

## Library actions
- [x] Text: Add item (opens the prompt editor). Media: Upload (multiple files, accept by kind) with "Uploading n of m" and a wavy progress line.
- [x] Start an assistant chat bound to the library.
- [x] Auto-tag the library, or the matching items while filtered (image, text); disabled when empty.
- [x] Edit library settings.
- [x] More: Duplicate (name prompt), Import / Output (text), Export ZIP (media, file name prompt, opens Exports), Delete library (reference check → references dialog → cleanup page, else confirm).

## Items bar
- [x] Count, or the number of matches while filtered; spinner while a page reloads.
- [x] Search (debounced, IME-safe; folds into an icon in a narrow pane), tag filter with counts (items must carry every chosen tag), active filters as removable chips with Clear filters; all in the URL (`q`, `tag`).
- [x] View options: layout (media: fill frames / whole pictures, tile size S/M/L; text: cards / list; remembered on the device), sort (newest, oldest, name A–Z, Z–A), page size (25 … 500, All); in the URL (`sortBy`, `sortOrder`, `size`, `page`).
- [x] Overflow: Select all, Auto-tag all/results, Export ZIP.
- [x] Selection turns the bar into a selection bar: count, select all / deselect all, Batch tag, Auto-tag (image, text), Copy to…, Move to…, Delete (confirmed); Escape clears. Selection covers the items in view and clears when the page or filters change.

## Items
- [x] Select by checkbox, ctrl/cmd/shift-click, shift ranges; while selecting, clicks toggle.
- [x] Image: square frames, open in the lightbox (delete from it, scrolls the grid to the current image); size and index pills; hover tools: delete, tags, menu.
- [x] Video: 16:9 frames, silent preview while hovered, player dialog with previous / next and Open original.
- [x] Audio: track rows with one shared player; play button morphs while playing; current track shows elapsed / total time and a wavy, seekable progress line; format, size and date otherwise.
- [x] Text: cards (title, start of the text, tags, date) or one-line rows; open the full text dialog (dates, tags, previous / next, Copy, Refine in full editor); copy and refine on hover.
- [x] Per item menu: Rename (media), Edit tags, Copy AI reference, Open original (media), Quick watermark (image), Delete (confirmed).
- [x] Tags on items filter the page when clicked.
- [x] Empty library (with the main action), no matches (with Clear filters), loading.
- [x] Paging footer with range, page size and page navigation.

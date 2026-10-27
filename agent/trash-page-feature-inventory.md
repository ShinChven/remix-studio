# Recycle bin page (v2): feature inventory

Every capability of `/v2/trash` (`src/v2/pages/Trash.tsx` and
`src/v2/components/trash/*`). A redesign of the page must keep each item.

## Page shell
- [x] Hero in the tertiary colors: Manage kicker, title, description; item, project and oldest-deletion counts; the space the bin takes, split by kind (images, videos, audio) with a legend; the three most recently deleted items sticking out of a bin, lifting out on hover, with the last deletion time (wide windows). Empty: the bin alone.
- [x] Restore all (confirmed; items whose project is gone stay) and Empty bin (confirmed with count and size).
- [x] Loading, load errors with Retry, empty bin, no matches (Clear filters).

## Items bar
- [x] Kind switcher: All, Images, Videos, Audio, Text, with counts that follow the search and project; kinds with nothing in them are left out.
- [x] Search (debounced, IME-safe; folds into an icon in a narrow pane) over prompt, text, project, tags, file name and format; project filter with counts (deleted projects marked); active search and project as removable chips with Clear filters.
- [x] View options: sort (recently deleted, deleted longest ago, largest first, by project), tile size S/M/L (remembered on the device), page size (25 … 500, All).
- [x] Everything in the URL: `kind`, `q`, `project`, `sort`, `size`, `page`, and `item` for the open item (opening it adds a history entry, so Back closes it).
- [x] Overflow: Select all, Restore all, Refresh, Empty bin. Summary of the count and size in view.
- [x] Selection turns the bar into a selection bar: count, select all / deselect all, Restore (items whose project is gone are skipped and reported), Delete forever (confirmed with count and size). Escape clears; selection clears when the list changes.
- [x] Phones: the kinds span the first row, the tools end the second.

## Items
- [x] Runs by deletion day (Today, Yesterday, weekday, date) or by project (deleted projects marked), each with its count, size and a check that selects the whole run.
- [x] Square frames per kind: pictures; video posters with a play badge and a silent preview on hover; audio as the kind shape that plays in place, morphing and spinning with a wavy progress line; text as its opening lines under a quote mark. Missing files show a placeholder.
- [x] Pills: kind and size; duration or aspect ratio. Caption: project (filters the bin; red when the project is gone) and how long ago it was deleted (exact time on hover).
- [x] Select by checkbox, ctrl/cmd/shift-click, shift ranges; while selecting, clicks toggle. Selected frames draw in.
- [x] Hover tools: Restore (disabled when the project is gone), Delete forever, menu (Details, Select, Restore, Open project, Only this project, Open original, Copy prompt / text, Delete forever).
- [x] Restored items lift out of the grid, deleted ones drop away. Restoring offers Undo (moves them back to the bin); deleting forever reports the space freed.

## Viewers
- [x] Pictures open in the lightbox, paging through every picture in view; R restores and D deletes forever from it, keeping its place.
- [x] Videos, audio and text open the item dialog: the player or full text beside where it goes back to (filters the bin; a note when the project is gone), the prompt with Copy, and details (kind and format, deleted, created, file name, aspect ratio, resolution or quality, duration, file sizes, tags); previous / next with the arrow keys; Restore and Delete forever.

## Server
- [x] The trash list says whether each item's project still exists and carries the project's current name.

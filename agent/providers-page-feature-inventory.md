# Providers pages (v2): feature inventory

Every capability of `/v2/providers`, `/v2/provider/new`, `/v2/provider/:id`,
`/v2/provider/:id/edit` and `/v2/provider/:id/custom-models`
(`src/v2/pages/Providers.tsx`, `ProviderForm.tsx`, `ProviderProfile.tsx`,
`ProviderCustomModels.tsx` and `src/v2/components/providers/*`). A redesign of
these pages must keep each item. They use only the existing provider endpoints.

## Shared
- [x] Every service has its own mark: its logo (or letters) on its own shape and color, the same on every page; the shape morphs under the pointer.
- [x] Kind colors for what a model makes: text primary, image tertiary, video secondary, audio success.
- [x] Parallel tasks step in place (1–1000) and save once the stepping stops, with a snackbar; anything still waiting saves when the page goes away; a failed save reloads the true value.

## Providers list
- [x] Hero in the secondary colors: Manage kicker, title, description; provider, ready, need-a-key (when any), jobs running (pulsing, when any) and project counts.
- [x] What you can make: one tile per kind with the number of distinct models the ready providers offer, greyed with Not connected when nothing makes it; a tile filters the list to that kind and scrolls to it.
- [x] Connected services' marks orbit a key (greyed suggestions when nothing is connected); the orbit turns and widens on hover; caption names them. Only where the hero has room.
- [x] New provider and Queues (provider view).
- [x] Results bar: kind switcher with counts that follow the search and status, a running dot on All; search (name, service, model names, address); status filter (ready, needs a key, used by projects, running jobs); sort (by service, name, newest, oldest, most used) and layout (cards or rows) in Sort and view; filter chips and Clear filters. Search, kind, status and sort live in the URL; the layout is remembered on the device.
- [x] Overflow: Select all, New provider, Queues, Refresh.
- [x] Cards: mark, name with a verified mark, service and custom host; kind chips with model counts, Civitai's catalog and custom variants; parallel stepper, projects and running jobs; a warning strip with Add key when the key (or Kling's secret) is missing. Rows: the same in columns that drop out as the pane narrows, with icons instead of labels.
- [x] Click opens the provider; while selecting, or with ctrl/cmd/shift, click toggles; shift extends a range; Space toggles; Enter opens. In cards the checkbox is a badge on the mark's corner; in rows it replaces the mark.
- [x] Item menu: Open, Edit (Add key when missing), Rename, Custom models (BytePlus), Queues (while running), Select, Copy provider ID, Delete.
- [x] Selection bar with Delete; deleting (one or several) confirms with the projects and active jobs that reference them, and reports what was deleted and the first failure.
- [x] Usage refreshes every 15 s while jobs are running and the page is visible.
- [x] Connect a service tile at the end of the unfiltered card grid.
- [x] Empty: every service to connect, each opening the form with it chosen. A kind nothing connected makes: the services that make it. No matches: Clear filters. Loading, and load errors with Retry.

## New / edit form
- [x] Hero in the chosen service's color; its mark and backdrop morph when the service changes; New provider kicker and the service's name, or Edit and the provider's name; what the service makes.
- [x] Step 1, Service (new only): every service with what it makes; `?type=` preselects one.
- [x] Step 2, Key: name (follows the service until typed), API key, or access key and secret for Kling AI; masked without offering itself to password managers, with Show / Hide; stored keys can be kept by leaving the field empty; a link to where the service hands out keys.
- [x] Step 3, Requests: parallel tasks (1–1000) and the optional API address.
- [x] The same validation as before; errors under the steps; Cancel and Connect / Save changes in a bar that stays at the bottom of the window; Enter submits.
- [x] Beside the form: what the service makes, by kind, with each model's description, main options and copyable model ID; Civitai's catalog note.
- [x] Creating returns to the list with a snackbar that opens the new provider; saving returns to the provider.

## Profile
- [x] Hero: back to Providers, mark, service, name, key stored / missing, custom host; Edit (Add key when missing), Custom models (BytePlus), and Rename, Queues, Copy provider ID, Delete in its menu.
- [x] Figures: parallel tasks (stepper), projects, jobs running (refreshing while any run), models, added.
- [x] Models pane: every built-in and custom model with description, main options and copyable model ID; kind switcher and search in the URL; for services that list their models, each is marked reachable or not with this key, with a count and Check again; built-in services say so; a missing key offers Add key; check errors with Retry.
- [x] Not found and load errors with a way back.

## Custom models (BytePlus)
- [x] Hero in the service's color with the provider's name and New variant.
- [x] Variants: name, copyable model ID, the base model with its main options, Edit and Delete (confirmed).
- [x] Variant dialog: base model (with its description and options), name and model ID; saves the whole list as before.
- [x] Base models beside the list, with descriptions and copyable IDs.
- [x] Empty state with New variant; save errors in a snackbar.

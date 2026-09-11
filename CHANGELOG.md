# Changelog

All notable changes to Remix Studio are documented here by version number.

## [1.23.0] - 2026-09-12

### Added

- **GPT Image 2.5**: OpenAI's newest image models are selectable on any OpenAI provider. GPT Image 2.5 ships as two API models rather than one, and both are listed so a project picks the tier it wants: **GPT Image 2.5 Flare** (`gpt-image-2.5-flare`) is the small, speed-tuned model, at roughly GPT Image 2's quality with up to half the latency, and **GPT Image 2.5 Sunburst** (`gpt-image-2.5-sunburst`) is the base model tuned for quality, for work where editing precision and subject preservation matter most. Both inherit GPT Image 2's size contract exactly — edges a multiple of 16px, a 3,840px maximum edge, between 655,360 and 8,294,400 total pixels, and ratios up to 3:1 — so they offer the same aspect ratio grid, from 1024x1024 up to 3840x2160, and the request builder's geometry checks already covered them by prefix. Two things did have to change. GPT Image 2 dropped transparent backgrounds and GPT Image 2.5 restores them, so the transparency guard is no longer the same predicate as the size handling: 2.5 offers the full **transparent / opaque / auto** background picker, GPT Image 2 keeps the **opaque / auto** pair it had, and a transparent output still requires png or webp rather than jpeg. And 2.5 adds two quality tiers above `high` — `xhigh` and `max` — which the older models reject outright, so the quality picker shows all six (`low`, `medium`, `high`, `xhigh`, `max`, `auto`) on the 2.5 entries only, and a project carrying one of the two new values onto an older model sends `high` instead of a value the API refuses. The size and aspect-ratio errors now name the model they were raised for, since three GPT Image generations share that code path. Nothing about the remaining older entries moved: GPT Image 2 and GPT Image 1 Mini keep their model IDs, options and behaviour, and projects already pinned to them are untouched.

- **GPT Image 2.5 on RunningHub**: RunningHub now serves GPT Image 2.5, in two billing tiers that each carry both of OpenAI's model tiers — four entries, selectable on any RunningHub provider, giving the same models through RunningHub's wallet instead of an OpenAI key. The economy tier is **GPT Image 2.5 Sunburst** (`rhart-image-g-2.5/sunburst`), the base model tuned for quality, and **GPT Image 2.5 Flare** (`rhart-image-g-2.5/flare`), the small, speed-tuned one. **GPT Image 2.5 Sunburst Official** and **GPT Image 2.5 Flare Official** (`rhart-image-g-2.5-official-token/…`) are the official-token tier of the same two models, and they are not merely a price difference: they accept 32,000-character prompts rather than 20,000, take up to sixteen reference images rather than ten, and expose two controls the economy tier does not. **Background** returns as a picker — `auto`, `transparent` or `opaque` — the first RunningHub image model to offer it, and the **quality** tier is selectable across the full `auto` / `low` / `medium` / `high` / `xhigh` / `max` range, including the two levels GPT Image 2.5 puts above `high`. An image project has one quality control, so, exactly as **GPT Image 2 Official** already does, the resolution tier and the quality tier are carried together in each picker value (`2K XHigh`) and split back into the two request fields on submission — eighteen combinations rather than that model's nine. All four offer fifteen aspect ratios (`1:1` through `3:1` and `1:3`, including the `2:1`, `1:2`, `21:9` and `9:21` wide formats), the `1K` / `2K` / `4K` resolution tiers, and text-to-image as well as reference-image editing; the prompt caps are enforced by the shared draft validation before a job is submitted. The economy tier needed no generator code at all. RunningHub addresses GPT Image 2.5 as a two-segment path — the model plus its tier — rather than the flat slug its older `rhart-` models use, and the generator already builds a submit URL by appending the endpoint to whatever the model ID is, so `rhart-image-g-2.5/sunburst` resolves to `.../rhart-image-g-2.5/sunburst/text-to-image` unchanged; its request body is the default RunningHub image shape and its reference endpoint the default `/image-to-image`. The official-token tier does have its own branch, since it edits through `/edit` instead and carries the extra fields. One option is deliberately missing from all four: the documented ratio enum has no `auto` value on any of these endpoints, unlike nano banana 2 and Grok Imagine Quality, so the pickers do not offer it — the generator treats `auto` as "omit the field", which here would quietly drop the choice rather than report it. The existing RunningHub entries are untouched: `GPT Image 2` and `GPT Image 2 Official` keep their model IDs, their tiered quality picker and their behaviour — the splitter they share was generalised rather than replaced — and projects pinned to them are unaffected.

- **The Assistant Survives a Refresh**: A chat turn lived and died with the HTTP request that carried it. The runner was awaited inside the response stream, so reloading the page — or a phone locking its screen, or a proxy timing out a long agentic loop — dropped the only handle on work that carried on running server-side: tools kept firing, the transcript kept growing, and the browser came back to a conversation that looked idle and finished. The confirmation card was worse than idle; it existed only in the memory of the tab that raised it, so a refresh at exactly the wrong moment left a conversation stuck waiting on a decision it no longer offered anywhere. Turns are now decoupled from the requests that watch them. Sending a message, editing one, or answering a confirmation registers the turn with an in-process hub and then only subscribes to it; every status event it emits — provider call, thinking title, tool started, tool finished, confirmation required — is buffered with a sequence number and fanned out to whoever is attached at that moment. `GET /api/assistant/conversations/:id` now reports the running turn alongside the messages, so a page that loads into a working conversation reattaches through `GET .../turn?since=`: the frames it missed are replayed, the progress line lands on whatever the loop is doing right now, and the stream follows it to its result. The same path covers a connection that breaks rather than a page that reloads — the client reattaches from the last sequence number it saw, six times with a growing gap, showing **Reconnecting to the assistant...** while it does — and a tab coming back from the background or a device coming back online, where a streaming fetch dies without ever raising an error, re-checks the conversation on `focus`, `visibilitychange` and `online`. Frames from a finished turn stay readable for five minutes so a client that reconnects a moment too late still collects the result instead of an empty stream, and a client that is fully caught up gets `{"type":"idle"}` rather than a hang. The pending confirmation moved with it: it was always stored in `AssistantPendingConfirmation`, and the conversation endpoint now returns the live, unexpired row, so the confirm/cancel card comes back with the transcript in any tab and any browser. Two things fall out of the same change. A second send into a conversation that is already running a turn answers `409` with the live turn rather than stacking a second loop on top of the first — the client says so and attaches to what is already running. And because the turn writes its rows as it goes, a finished tool call now pulls the transcript in mid-flight, debounced to one fetch per burst, so the assistant messages and tool result cards appear as the loop works rather than all at once when it ends. Nothing about the loop itself changed: the circuit rules, the per-user concurrency guard, and the confirmation gate are all where they were. State is per process, so a server restart still loses an in-flight turn — clients see `idle` and fall back to the transcript in the database, which is exactly what they did before. Translated into all six locales.

- **Conversation Resources in the Assistant Sidebar**: When a tool call touched a library, project, campaign or post, the assistant announced it with a large card wedged into the message stream — one card per tool call, repeated every time the same library was written to, and gone from view the moment the conversation scrolled past it. There was no list of what a conversation had actually worked on, and nothing survived a reload, so returning to a chat the next day meant scrolling it back to find the library it had built. The right-hand sidebar now splits: chats above, and beneath them a **Resources** area that opens as soon as a conversation has touched something. Each entity is one compact row — an icon coloured by kind, its name, and underneath it the reason the row is there: the tool behind its most recent mention, named the way the tool approvals dialog names it (**Create Prompt**, **Tag Album Items**, **Update Post Text**). The reason gets that line to itself rather than sharing it with the entity type, which only truncated it — the icon carries the kind, and hovering the row gives the full sentence (`Library "Gravure Poses" was updated.`). Rows link into the app, most recently mentioned at the top. Re-mentioning an entity bumps its row rather than adding a second one, and the reason follows the newest mention — a library created and then written to reads **Create Prompt**, not **Create Library**. Hovering a row reveals two actions that stay collapsed to zero width at rest so long names get the whole row: **@** drops the entity into the composer as a bound context, exactly as typing `@` and picking it does, and **×** removes the row from the list. The rows are stored per conversation in a new `AssistantConversationResource` table, keyed uniquely on conversation plus entity so the upsert bumps `lastMentionedAt` and a mention counter instead of duplicating, and cascading with the conversation when it is deleted — so the list is there on the next load, in the same order, in any browser. The list is what the conversation **changed**, not everything it looked at: recording is gated on the tool's own `category`, so a `read` tool — asking what is in a library, listing campaigns, fetching a project — never adds a row, while every `mutate` and `destructive` one does. Detection moved server-side with the storage: the tool name, its arguments and its result are read in `executeToolCallInner` the moment a call succeeds, which is also the only place that sees a result before it is wrapped for the model, and the recording is best-effort so bookkeeping can never fail a turn. Most tools return their JSON as `text` and skip `structuredContent` entirely — `create_library` among them — so both are read to find the payload, and the name is taken from whichever field the tool reports it under (`name`, or the `projectName`/`libraryName`/`campaignName` used by tools that act on an entity rather than rename it) so no row falls back to showing a bare UUID. Because a tool that creates something is not necessarily creating the entity the row points at — `create_prompt` creates a prompt, but what it does to the library holding it is an update — each kind names its own constructor, and the row reads "is ready" only for that one. `GET /api/assistant/conversations/:id` now returns the list alongside the messages, with `GET`/`DELETE .../resources` for refreshes and removals. Bound contexts learned two new kinds along the way — campaigns and posts, which previously could not be mentioned at all — so the chips inside a sent message render all four types with the right icon and link. What the assistant writes in its replies is untouched: a markdown link to a library in the answer still renders as a link, in place.

- **Move Album Items to Another Project**: Results could be copied out of an album into a library, but there was no way to move them into another project — a batch generated in the wrong project, or a slice of an album that had grown into two separate bodies of work, could only be exported and re-imported, which left the originals behind and lost the history behind each result. Selecting album items now offers **Move to Project**, which hands the items to another project of the same type and takes everything that hangs off them: the album rows and their files (generated asset, thumbnail and optimized version), the job record that produced each one, and the workflow snapshot on that job together with the reference media it points at — so **Reuse workflow** keeps working from the destination project rather than falling back to a reconstruction. The action opens a confirmation page rather than a dialog, at `project/:id/album/move`: it shows the selected items, their combined size, a plain list of what travels with them, and the destination picker, all in one column on a phone and in two from a large screen. The destination is either an existing project of the same type — searchable by name, with each candidate's album count beside it — or a new project created on the spot, which inherits this project's type and generation settings since the results were generated under them. The selection reaches the page through `sessionStorage` rather than the query string, so a batch of any size survives the navigation. Server-side, `POST /api/projects/:id/album/move-to-project` copies each file into the destination project's storage folder before the records move, grouping a result's asset, thumbnail and optimized keys by stem so a name already taken in the destination renames the three together and the filename endpoint keeps finding them. Source files are deleted only once nothing left in the project still references them — a reference shared with a workflow step, a job that stayed behind, or a protected trash record keeps its copy on both sides — and a job still `processing` is left where it is, since its worker would otherwise write the result into a project the job had left. Both projects get an `album.moved` live event so an open viewer refreshes on either side. Translated into all six locales.

- **Album Search and a Single Actions Menu**: With items selected the album toolbar carried nine separate controls, which left no room for anything else. Export, copy to library, move to project, tag and delete now live behind one **Actions** menu, and the space that frees up holds a search box matching an item's name and its prompt. The search runs on the server across the whole album rather than the page on screen, is debounced so typing does not fire a request per keystroke, and waits for a committed character when the text is being composed through an IME. A search or filter that matches nothing now says so instead of leaving the grid blank.

- **Paged Media Picker**: The picker loaded a flat 500 items per source and did all of its searching, sorting and filtering in the browser, so anything past the 500th item was silently unreachable and every open pulled the whole slice down. The grid is paged on the server now, through the same pagination bar the album tab uses — page nav, page-size selector, range label, hidden when a single page covers the set, and a scroll back to the top on a page change. Changing the source, search, sort, aspect ratio or page size returns to page one, and the item search is debounced now that it costs a request. The album endpoint gained what this needed: `q` matches the prompt and the text output case-insensitively, and the sort options widen to the four orderings the picker offers, with the name orderings applying to the prompt — the field shown as an item's label. The union widened rather than changed, so the album tab is unaffected.

- **Searchable Tag Filter in the Library Preview**: The workflow item's library filter rendered every tag as one capped row with its scrollbar hidden, so in a library with more than about three rows of tags the rest were scrollable but invisible — they read as missing. It is now a filter bar that leads with the current selection followed by the most-used tags, with an **All tags (N)** button stating how many exist. That opens a panel holding all of them: a search box where Enter picks the first match, a most-used / A-Z sort collated in the interface language, a count beside each tag, the current selection pinned to the top, and a real scrollbar. On a phone the panel is a bottom sheet with done and clear actions, and its search box does not take focus so the keyboard stays down. Escape closes the panel without also closing the dialog behind it, and whether the panel was open is remembered per library. Translated into all six locales.

- **The Same Library in Several Workflow Steps**: A library a workflow step already referenced was greyed out in the selector, so a project could never draw two independent items from one library — two subjects from one subject library, or a foreground and a background from one image library. Every library is selectable now however many times the workflow already holds it, and the **Added** badge is a hint rather than a block, carrying an occurrence count (**Added ×2**) once a library appears more than once. Each reference stays its own choice group with its own tag filter and match mode, so it contributes an independent factor to the combination count and an independent draw in shuffle mode.

### Removed

- **GPT Image 1.5**: OpenAI announced on June 2 that `gpt-image-1.5` shuts down on December 1, 2026, and the model entry is retired from the catalog ahead of that date, leaving GPT Image 2.5 Sunburst, GPT Image 2.5 Flare, GPT Image 2 and GPT Image 1 Mini on the OpenAI provider. The generator's fallback model moved with it, from `gpt-image-1.5` to `gpt-image-2.5-flare`, so a request that names no model now tracks the current generation rather than a superseded one; Flare rather than Sunburst because the fallback is reached silently and Flare is the everyday tier. That fallback covers more than it looks like it does: it is what the legacy `POST /api/generate` route uses when a request carries no model, and it is also what a project pinned to a removed model generates with, since an unresolvable `modelConfigId` sends no model ID rather than failing the job. A project still set to GPT Image 1.5 therefore keeps working and quietly generates on GPT Image 2.5 Flare; its aspect ratio and quality pickers fall back to their defaults until the project is pointed at a current model, and it keeps the transparent background option, which 2.5 supports and GPT Image 2 does not. **GPT Image 1 Mini retires on the same December 1 date** and is deliberately still listed rather than removed in the same change.

### Fixed

- **Moving Album Items Reported a Failure After It Had Worked**: The move endpoint did its housekeeping — sweeping up the source copies of the files it had just moved — inside the same `try` as the move itself, so anything that went wrong in that tail turned a completed move into `Failed to move album items`. The items really had moved, and the confirmation page stayed put reporting an error over work that had already succeeded. The move through the repository is now the point of no return: the sweep sits in its own `try` and a failure in it is logged and swallowed, leaving at worst a few source files for the orphan tool, while the live events are published in a `try` of their own so a failed sweep does not also cost both projects their refresh. A second, harder failure had the same message: an album row can reference a file that is no longer in the bucket — a reference image replaced in the workflow, a step deleted, a result already cleaned up — and `CopyObject` throws on a missing source, so one stale reference aborted the whole move before anything had moved. A copy that fails specifically because the object is not there is now tolerated: the key drops out of the rewrite map, the row keeps the key it had, and the sweep leaves the source alone. Every other storage error — refused, throttled, a broken connection — still fails the request, since skipping one of those would strand a file that is really there. Three smaller faults went with them. The selection is now resolved and validated before the destination is created, so a request that matches no items answers 400 without leaving an empty project behind, and a destination created for a move that then fails is deleted again when nothing landed in it. A row that had stored a full presigned URL rather than a bare key was not rewritten by the move while its file was still swept away; the stored value is normalised before the lookup, so it is rewritten like any other. And the storage round trips — a copy and a delete per file, three files per item — ran strictly one at a time, so a few hundred images meant thousands of sequential requests and a wait long enough for a proxy to give up on the request while the server carried on; they now run sixteen at a time.

- **Album Card Overlays Painted Over the Selection Toolbar**: A card's checkbox and action buttons sat at the same stacking level as the sticky selection toolbar, and an album card only establishes its own stacking context where its backdrop blur takes effect — so elsewhere those overlays competed with the bar directly and won on document order. A row scrolling under the toolbar left its checkbox and delete button drawn on top of it. The toolbar now sits above the grid, and the grid is isolated so nothing inside a card can reach past it.

- **The Album Loading Overlay Covered the Grid**: Unlike the drafts, queue and completed tabs, which unmount their content while it loads, the album list stays on screen — so its loading overlay dimmed the rows the user was still looking at. The overlay was also positioned inside the tab's scroll container, which anchored it to the top of the scrolled content rather than to the viewport, so once the list had been scrolled the dimmed panel and its spinner drifted into the middle of the grid. The overlay is now used only for the first load, when there is nothing underneath it; every later refresh shows a small spinner in the album toolbar, which is always on screen and never covers a row.

- **Select-All Checkboxes Sat Left of the Row Checkboxes**: The header checkbox was misaligned with the column of item checkboxes below it in three places, by 4 to 8px each. The project viewer's selection toolbar used narrower horizontal padding than the job rows and album cards below it on a narrow pane; the Exports toolbar card is less padded than each task card; and the text-library editor's toolbar checkbox carried extra padding and was drawn a size larger than the rows it heads. All three line up now at every width.

- **Rename and Tool Approvals Dialogs Were Muddy in Light Mode**: Both painted a translucent white panel over a dark backdrop, which resolved to grey rather than white in light mode, and both applied the heavy dark-mode drop shadow unconditionally. They now use the same panel treatment as the other dialogs in the app — an opaque white surface with a solid border and a normal shadow in light mode, with the translucency, blur and heavy shadow scoped to dark mode. Dark mode renders exactly as before.

### Changed

- **Shorter Album Toolbar Actions**: With items selected, the album toolbar carries nine controls, and the labels were long enough — **Export Selected**, **Copy to Library**, **Move to Project**, **Delete Selected** — that the row could not fit on one line until the pane was about 1,600px wide. Measured against the compiled stylesheet across seventeen pane widths, the sticky bar went from 49px at 890px (icons only) to 137px at 900px, where the labels switch on: a wider pane produced a bar nearly three times taller, and the wrap dropped a lone sort button onto a second line. The visible label on each action is now the short form — **Export**, **Tag**, **To Library**, **Compare**, **Move**, **Delete**, and **All to Library** when nothing is selected — while `title` and `aria-label` keep the full name, so the hover tooltip and screen readers still say **Move to Project** rather than **Move**. The row now fits on one line from 900px up: the bar is 97px between 900 and 1,200px (was 137px) and 57px from 1,300px (was 97px until 1,600px). Below 896px the labels were already hidden and the buttons icon-only, so narrow panes are unchanged. Nothing moved, and no wording changed anywhere else — the copy-to-library dialog's own heading and button, and the Delete Selected label shared with the drafts and completed tabs, keep their full names. Translated into all six locales.

- **Media Grid in the Post Editor on Phones**: The post editor listed each attached media item as a full-width row carrying a drag handle, filename, badges and a delete button, which overflowed a narrow screen and left the thumbnails tiny. Media is now a responsive grid of square tiles — two columns on a phone, three at small widths, four at large — with the order number, remove button, type pill and reorder controls as overlays on each tile. Left and right move buttons make reordering work on touch, where HTML5 drag-and-drop is unavailable; dragging to reorder on the desktop is unchanged.

## [1.22.0] - 2026-09-03

### Added

- **Album Tags**: A project album could be filtered by aspect ratio and nothing else, so a few hundred results were only ever browsable in the order they were generated — there was no way to mark which ones were approved, which belonged to a campaign, or which round they came from without copying them into a separate library. Album items now carry a free-form tag list, stored as a JSON string array exactly the way `LibraryItem.tags` already is, and the trash record keeps a copy so tags survive a delete and restore. Tag a single item from the control beside its filename on a media card or in its row in the text and audio lists; tag many at once from the toolbar, where one dialog offers **Add** (keep existing tags), **Remove** (take only the named ones away) and **Replace** (the items end up with exactly this list, empty to clear). A batch with nothing selected applies to every item the current filters select rather than the page on screen, so filtering to one tag and adding another retags that whole slice in a single request — the filters travel with the call instead of being resolved to a page of ids in the browser. The toolbar's tag filter lists every tag in the album with a count beside it, and because two selected tags can reasonably mean either thing, a **Match All** / **Match Any** switch sits in the same dropdown; **All** is the default, matching how library tag filters already behave. Both live in the URL (`albumTags`, `albumTagMatch`) alongside the existing album view parameters, so a filtered album can be linked. Clicking a tag chip on an item filters to that tag. The facet counts come from SQL rather than from the loaded page — Prisma cannot group by a value inside a JSON column, so a raw query unnests the array — which means the filter list describes the whole album and not just the 500 rows on screen, and stays stable as filters narrow the view. Tags are normalised on write (trimmed, de-duplicated case-insensitively keeping the first spelling, capped at 64 characters each and 30 per item) so a stray space or a difference in capitalisation cannot split one tag into two facets. Tags follow the item everywhere it goes: they are written into project bundles and read back on import, and they are copied onto the resulting library items when album items are copied to a library. Translated into all six locales.
- **Upload History per Export**: The Exports list showed whether an upload was running right now, but once it finished the row went back to looking exactly like one that had never been released — the only record was the account-wide history page, where the release for one archive had to be found among everyone else's. Each finished export whose account has a store or a drive connected now carries a history button beside its download, drive and sell actions, opening a dialog with just that archive's releases: the destination and account, when it happened, the provider-side URL, and the full error text on a failure. `GET /api/store-uploads` takes an optional `exportTaskId` and filters both the page and its count by it, so the dialog asks for one export's rows rather than paging the whole account. Nothing is fetched until the button is clicked — the rows land in a per-export cache in page state, so reopening the same archive is instant and never hits the API again. A drive upload or a Gumroad publish that completes or fails while the page is open drops that export's cached rows, which refetches if its dialog happens to be open and otherwise leaves the next open to load the newer list. Translated into all six locales.

- **Album Tags over MCP and the Assistant**: `get_album_items` now returns each item's tags plus a `tagCounts` roll-up of the whole album, and takes `tags` / `tag_match` to filter, so an agent can discover what a project is tagged with before asking for a slice of it. `tag_album_items` writes them, with the same three operations as the dialog: pass `item_ids` for a specific set, or `all_items` with optional `filter_tags` and `aspect_ratios` to retag a whole slice in one call. Exactly one of `add`, `remove` or `replace` per call — the tool refuses a call carrying more than one, since the same tag list means something different under each. It is a confirmation-gated write whose approval summary spells out the operation, the tags, and the scope, and names replacement as discarding the items' other tags.

- **Claude Fable 5.1, Gemini 3.8 Flash, Qwen3.8 Max and Grok Imagine Image 2.0**: Four provider releases landed since the catalog was last refreshed, and all four are additive — the models they succeed stay listed so pinned projects keep working. **Claude Fable 5.1** (`claude-fable-5-1`, released September 1, 2026) joins the Claude text models with the same 1M context, 128K output and always-on adaptive thinking as Fable 5, so it inherits the single-value `[1.0]` temperature list; `claude-text-generator.ts` needed no change because its no-sampling-parameters guard matches on the `claude-fable-5` prefix, which a point release keeps. **Gemini 3.8 Flash** (`gemini-3.8-flash`, GA September 2, 2026) joins both the Google AI and Vertex AI text models with a 1M-token context and 64K output, and becomes the default fallback in both REST text generators in place of 3.7 Flash. Google deprecated `temperature`, `topP` and `topK` on it — ignored rather than rejected this time, so the failure would have been silently unsteerable output rather than an error — so it joins the list in `server/utils/gemini.ts` that all three callers read, and the assistant's model resolver learned the 3.8 alias. **Qwen3.8 Max** (`qwen3.8-max`) becomes the DashScope flagship with its 1M-token context. **Grok Imagine Image 2.0** (`grok-imagine-image-2.0`, on the xAI API since August 8, 2026) joins the Grok image models and becomes that generator's fallback; it takes the same `quality` plus `resolution` pair the 1.x tiers do, so `parseQualityPreset` splits the project's single quality picker for it unchanged.

- **App Version and Commit Hash in the Sidebar**: A deployment could not be identified from the running app — the only way to tell which build was serving a page was to ask the host. The bottom of the sidebar now shows the package version and the short git commit on one line, the commit linking to its page on GitHub. The commit is stamped into the frontend bundle at build time next to the existing version define; the Docker build context excludes `.git`, so it arrives through a `GIT_COMMIT` build arg wired to `github.sha` in the docker workflow, and the Vite config falls back to `git rev-parse` for a local build. Translated into all six locales.

- **Scheduled Post Totals**: The Scheduled Posts page fetched the total count with every page of results and then never showed it, so there was no way to tell whether a filter matched twelve posts or twelve hundred. The header now carries the total in both the list and calendar views, a **Showing X-Y of N** summary sits beside the search box, and the count repeats in the pagination footer; the calendar additionally reports how many posts fall in the month on screen. The Campaigns page shows the same total next to its **Scheduled Posts** heading, in the style the **All Campaigns** count already used, and takes it from the response that page already fetches rather than issuing another request.

### Fixed

- **Grok Imagine Quality Rejected Long Prompts (RunningHub)**: `rhart-imagine-image-quality` caps a prompt at 4,000 characters and rejects a longer one outright with error 1007 rather than truncating it, but the model entry declared no `promptLimit` — so an over-length prompt was only discovered as a failed job after submission. The entry now carries the limit, which puts it behind the same truncate/keep/cancel dialog every other limited model uses at draft time. Two further gaps in the same entry closed alongside it. `auto` is an aspect ratio the `/edit` endpoint accepts to preserve the source framing and the `/text-to-image` enum does not; the ratio was sent on both, so a project set to `auto` failed on a text-only job — the optional field is now omitted there instead. And `auto` was never reachable in the first place, since the model's ratio list did not offer it; it does now. Reference images beyond the first are also dropped before upload rather than after: `/edit` carries one `imageUrl`, so the extra uploads paid a round trip each for bytes the request could not hold.

- **Paging Left the List Scrolled Mid-Page**: Every paginated view except the project viewer's album and completed tabs kept the scroll position where the pager was clicked, so the next page opened partway down its own results. `PageNav` now returns the list to the top after a page change. The window is not the scroller on these pages — `MainLayout` owns an `overflow-y-auto` pane and some views nest another scroller inside it — so a `scrollListToTop` helper walks up to the nearest ancestor that actually scrolls vertically and falls back to the window when there is none. It honours `prefers-reduced-motion` and takes a `scrollToTop={false}` opt-out. Fixes paging in Projects, Libraries, the library editor, Exports, release history, chat history, admin users, Campaigns, campaign detail, campaign history, campaign batch actions and Scheduled Posts.

- **Campaign Dates Read as Running Backwards Across a Year Boundary**: Campaign cards formatted Start and End as "Mar 3, 10:00 AM" with no year, so a campaign running December 2026 to February 2027 looked like it ended two months before it began, and one from a past year was indistinguishable from one running now. A new `src/lib/date.ts` holds year-aware formatters, and a campaign's start and end share one show-year decision so a range never mixes a bare date with a dated one. The same formatter fixes the scheduled-post dates in the Campaigns sidebar and on the Scheduled Posts list, which had the identical problem, and the Recently Posted feed — which showed only a clock time, making a post from a previous year look like it went out this morning — now falls back to a short date for anything that is not today.

- **Campaign Dates and Calendar Counts on Small Screens**: Rendering both pages at 320, 390 and 1440px surfaced three faults a build and a typecheck cannot see. The year added to campaign card dates overflowed the fixed half-width Start and End chips, clipping the value; it now wraps rather than truncating, so the whole date survives at any width and the desktop layout is unchanged. The calendar's month summary sat in a `justify-between` row that could not wrap, so on a phone it collided with the next-month button and pushed the month heading onto two lines; that header now stacks below the nav on small screens. And the per-day count chip was wider than a roughly 50px day cell, clipping the POSTS label and hiding the number entirely — the label drops out below `sm` so the count itself stays visible, while desktop keeps both.

### Changed

- **Gemini Preview Model IDs Replaced by Their GA Names**: Google drops the `-preview` suffix rather than aliasing it when a Gemini model reaches GA, and eventually stops serving the preview endpoint — so three IDs in the catalog were pointing at models that had moved or gone. `gemini-3.1-flash-image-preview` (nano banana 2, GA since May 28, 2026) is now `gemini-3.1-flash-image` across both the Google AI and Vertex AI entries, the two image generators and the hardcoded Google AI endpoint URL. `gemini-3.1-flash-lite-preview` (GA since May 8, 2026, and reported shut down since) is now `gemini-3.1-flash-lite` in both text entries, in the assistant's conversation-summarization model and in the voice-transcription default — the last two would have failed on every call. And `resolveRealGeminiModelId`, which exists to map stale aliases onto IDs the current API accepts, was itself mapping three of them onto `gemini-3-flash-preview`, shut down in March 2026; those now land on `gemini-3.5-flash`. Model entry `id`s are untouched throughout, so saved project selections still resolve.
- **Grok Imagine Video Moved to 1.5**: `grok-imagine-video` was superseded by Imagine Video 1.5, GA on the xAI API since June 16, 2026, so the entry's `modelId` moves to `grok-imagine-video-1.5` and the generator fallback with it. The payload is unchanged — the same `aspect_ratio`, `resolution` and `duration` fields — but the model's range is wider, so the entry now offers 1080p alongside 720p and durations from 4 to 15 seconds rather than just 6 and 10. The entry keeps its original `id` because projects persist `modelConfigId`.

- **Tighter Corners on Export Rows**: The rows in the Exports list used the app's 20px `--radius-card`, a radius meant for the large panels and grid cards it is shared with. On a dense, mostly full-width list row that read as a rounded pill rather than a row, so the export cards drop to a 12px corner. The radius token is untouched, so every other card in the app keeps the corner it had.

- **Campaigns Page Is Paginated**: `GET /api/campaigns` returned every campaign a user owned in one response, each carrying its 20 newest posts with every media row presigned — so an account with sixty campaigns loaded sixty cards and well over a thousand signed URLs before the page could paint, and the two `groupBy` aggregates behind the post counts scanned the account's whole post table on every visit. The endpoint now takes `page`, `pageSize` (default 25, capped at 100), `q` and `status`, and answers with the usual `{ items, total, page, pageSize, totalPages }` envelope the history and scheduled-post lists already use. The posts included per campaign are selected down to the fields the card actually reads — a thumbnail and the schedule fallback — instead of whole post rows, and the aggregates are scoped to the campaign ids on the page. The Campaigns page shows 12 cards at a time with the shared `PageNav` control beneath the grid; `page` and `pageSize` live in the URL next to `q`, so a page of campaigns can be linked and survives a refresh, and deleting the last card on a page steps back rather than leaving an empty grid. Search is now the server's job: the box matches campaign name and description across the whole account instead of filtering whichever campaigns happened to be loaded, and a search resets to page 1. The command palette drops its local name filter and passes the query through, which was the outstanding half of its campaign search; the home page asks for the eight campaigns it displays rather than all of them.

- **RunningHub's Grok Imagine Model Renamed to Grok Imagine Quality**: The RunningHub entry was listed as "Grok Imagine Pro" while the model it actually calls is `rhart-imagine-image-quality`, the quality tier. Since xAI retired the Pro tier the two names no longer described the same thing, and the catalog showed a Pro model on RunningHub next to a Quality model on the Grok provider that were in fact the same tier. The display name is now **Grok Imagine Quality**. Nothing about the request changes — the model ID, both endpoints (`/text-to-image` and `/edit`, the latter taking a single `imageUrl`), and the `aspectRatio` / `resolution` / `numImages` / `outputFormat` payload are as they were. The entry keeps its original `id` (`runninghub-grok-imagine-pro`) because projects persist `modelConfigId`, so saved selections continue to resolve.

- **Confirmation Before the Remaining Destructive Actions**: Batch **Send Now** on the campaign batch actions page published every selected post the moment it was clicked, with none of the confirmation its neighbouring batch delete had. It now opens a dialog naming the campaign and the number of posts, shows send progress as the batch runs, and disables the trigger until it finishes. An audit of the rest of the interface closed the other gaps where an irreversible action fired straight off a click: publishing a single post (**Send Now** / **Send Again**) on the campaign detail and post detail pages, where the confirmation names the channel count and warns about the duplicate when the post has already gone out; removing attached media from a post; batch unschedule; removing a passkey in account security, which can be the last sign-in method on an account; deleting a project import record; and granting or revoking admin on a user, which applied straight from the role dropdown while enable and disable already asked. Translated into all six locales.

- **Campaign Card Layout and Dates**: The overflow menu moves to the card's top-right corner and the post progress sits inline to the right of the title, which lets the title fill the remaining width; the bottom action row that held them is gone. The cards also drop the time of day from Start and End — "Dec 20, 2026" rather than "Dec 20, 2026, 10:00 AM" — since the year is what disambiguates a range and the shorter value fits on one line down to a 320px viewport. The campaign detail page still carries the time. `formatDateTime` went with the change, having lost its last caller.

### Removed

- **Sora 2 and Sora 2 Pro**: OpenAI is discontinuing the Sora API on September 24, 2026, and has published no successor video model, so unlike every earlier model retirement in this catalog there was nothing to repoint the entries at. Both are gone from `PROVIDER_MODELS_MAP`, `buildVideoGenerator` now throws for `OpenAI` the way it already did for the provider types that generate no video, and `openai-video-generator.ts` is deleted along with the `sora` term in the model lister's OpenAI categorizer — `video` still covers anything OpenAI ships later. OpenAI keeps its text and image models; it simply no longer appears under video generation. A project still pinned to a Sora profile loses its model selection and has to pick another provider's video model, which is the same outcome the shutdown forces a few weeks from now.

## [1.21.1] - 2026-08-16

### Added

- **Grok 4.6 and Gemini 3.7 Flash**: xAI shipped Grok 4.6 and Google shipped Gemini 3.7 Flash since the catalog was last refreshed. **Grok 4.6** (`grok-4.6`) joins the text models with the 500K context it documents, and becomes the fallback in its own generator. **Gemini 3.7 Flash** (`gemini-3.7-flash`) joins both the Google AI and Vertex AI text models with a 1M-token context and 64K output, and becomes the default fallback in both REST text generators. Gemini 3.x is progressively dropping the legacy sampling knobs, and 3.7 Flash rejects `temperature` outright rather than ignoring it — which would have broken text jobs the moment it became the default. The assistant adapter already guarded that for 3.6 Flash and 3.5 Flash-Lite while both REST generators sent the field unconditionally, so the list of affected models moved to `server/utils/gemini.ts` and all three callers now read it.
- **Appearance Switches (Glass Effects, Hover Animations)**: Account preferences gained two switches, both on by default. **Glass effects** controls whether translucent panels and dialog overlays blur what is behind them; **Hover animations** controls whether cards lift and scale under the pointer. They exist because Chrome on macOS 27 tore the interface apart when the pointer swept a grid or a polled list refreshed — an artifact that cannot be seen in a screenshot, on pages behind a login, which two earlier fixes had guessed at without ever observing. The switches turned that into a measurement: `backdrop-filter` was the cause. Both hook the Tailwind class names through `[class*="…"]` rather than editing the 331 blurred and 83 hover-transformed call sites, and sit outside `@layer` so they beat `@layer utilities` on `:hover` without `!important`. No element in the app carries both a base and a hover transform, so the transform variables are pinned unconditionally rather than under `:hover`, which is what lets one rule also cover the `group-hover:` variants where the hovered element is the ancestor rather than the transformed one.

### Changed

- **Send a Voice Transcript in One Click**: The assistant composer's Send button now works while the mic is recording — it stops the recording, transcribes the audio, and sends the resulting message without a second click. Send stays enabled during recording even with an empty composer and shows a spinner while the transcript is fetched; Cmd/Ctrl+Enter and Enter follow the same path. If transcription fails or no speech is detected, nothing is sent and the composer keeps its content so the attempt can be retried. Tapping the mic button to stop still just fills the input, unchanged. The recorder's `onstop` routes through a ref so the transcript merges with text and attachments added while the mic was live, rather than with the values captured when recording started.
- **Grok Imagine Pro Retired**: xAI deactivated `grok-imagine-image-pro` in May 2026, so an image project pinned to it had no working upstream model. The entry now points at `grok-imagine-image-quality`, the tier xAI names as its migration target: both take the same `quality` plus `resolution` pair that `parseQualityPreset` already splits out of the project's single quality picker, so only the model ID and the display name move. The entry keeps its original `id` because projects persist `modelConfigId` — renaming it would orphan saved selections.
- **One Flat Surface Colour in the Project Pane**: The tab bar, the SELECT ALL bar and the job rows each carried a different translucent background stacked over the body gradient, so the pane read as three mismatched bands. All of them, plus the scroll area behind the rows, are now pinned to a single colour. The row's base colour moved to the row wrapper and off the header, so the selected and expanded state backgrounds layer on top of it rather than competing with it — as sibling `bg-*` utilities of equal specificity, which of the two won would otherwise have depended on their order in the generated stylesheet rather than on the order they appear in the class attribute. The backdrop blurs on those surfaces went with it, since they cannot show through an opaque background.

### Fixed

- **Dark Mode Fallback for Opaque Surfaces**: A custom property meant to give sticky bars a solid background in dark mode resolved to its light value in both themes, painting them white. `:root` and the theme class both match `<html>`, and `:where(.dark)` contributes zero specificity, so `:root` won regardless of theme. The override now out-specifies it. The forced opaque background was subsequently dropped altogether: an opaque colour cannot match surroundings that are a gradient varying across the viewport, so the bars keep the same translucent background as everything around them instead.

## [1.21.0] - 2026-08-12

### Added

- **MiniMax Provider (Text, Image, Video and Music)**: MiniMax was reachable only through RunningHub's resale of Hailuo H3, so a direct MiniMax key bought nothing. **MiniMax** is now a provider type of its own, covering all four modalities the platform serves. Text bundles the eight M-series profiles — `MiniMax-M3` with its 1,000,000-token context, plus `MiniMax-M2.7`, `M2.5`, `M2.1` and `M2` at 204,800, each of the 2.x releases also in its `-highspeed` form — over the OpenAI Chat Completions protocol at `https://api.minimax.io/v1`, so the API URL can be pointed at the mainland China endpoint or a proxy. The M-series always reasons before answering, so requests carry `reasoning_split` to keep that reasoning in `reasoning_details` rather than in `content`, and any `<think>` block from a model that ignores the flag is stripped before the text is stored. MiniMax providers are accepted by the in-app assistant, tool calls included. **MiniMax Image 01** (`image-01`) generates from a prompt with an optional `character` subject reference — a single front-facing portrait, re-encoded to PNG when the reference is stored as WebP, which the API rejects. Its quality picker offers `1K` and `2K`: the named `aspect_ratio` field cannot reach the larger tier, so the tier and ratio are resolved into explicit `width`/`height` values inside the [512, 2048] range the model accepts. **MiniMax Hailuo H3** (`MiniMax-H3`) is the direct route to the model RunningHub resells, at `768P` or `2K` for 4 to 15 seconds. Its one endpoint covers every mode: one or two images pin the first and last frame, while a reference video, a reference audio, or more than two images switch the request into reference mode where every image is a plain reference (up to 9 images, 3 videos and 3 audio clips). Text-to-video rejects `adaptive`, so a text-only job falls back to `16:9`, and a framed job sends no ratio at all because the output follows the input image. Video tasks are asynchronous and finish through the existing detached poller. **MiniMax Music 3.0** (`music-3.0`) covers music projects in both modes. The API wants a style description and lyrics as separate fields where a project carries one composed prompt, so an instrumental job sends the prompt as the style description, and a vocal job whose prompt uses the documented structure tags (`[Verse]`, `[Chorus]`, …) is split at the first tag — the text ahead of it is the style, the rest is the lyrics — while a prompt without tags stays a style description that the lyrics optimizer turns into lyrics. MiniMax speech synthesis and voice cloning are not bundled: they key on system voice IDs that the platform does not publish in its API reference.
- **Seedream 5.0 Pro (BytePlus)**: BytePlus serves Seedream 5.0 in a pro and a lite tier and only the lite one was bundled, so the flagship was reachable through RunningHub but not through a direct ModelArk key. **Seedream 5.0 Pro** adds `dola-seedream-5-0-pro-260628` to the BytePlus provider, with the `1K`, `1.5K` and `2K` tiers it accepts — `1.5K` is billed at the `1K` rate — and up to 10 reference images. It is capped at 4,624,220 total pixels, which is why it has no 3K or 4K tier, and its pixel table is its own: 16:9 at 1K is `1424x800` where the other Seedream models render `1280x720`, so a second size table sits beside the shared one instead of the tiers being reused. The generator now derives every model-specific field from one traits table rather than testing model IDs field by field, because Ark rejects a request outright when it carries a parameter the model does not take: 5.0 Pro is the only image model that errors on `sequential_image_generation` and `stream`, `guidance_scale` belongs to the 3.0 pair alone, `seed` to `seedream-3-0-t2i` alone, and `output_format` to the 5.0 models alone. Model IDs are matched by pattern instead of by exact string, so a dated release, the `dola-` prefix BytePlus puts on its international listings, and a custom endpoint ID all reach the right traits; an unrecognised ID falls back to the fields every Ark image model accepts. Seedream 5.0 Lite gains the `4K` tier it supports alongside `2K` and `3K`.
- **Faithful BytePlus output and reference images**: Three fixes to how the BytePlus provider builds a request. The project's format choice now reaches the API as `output_format` on the models that accept it, so a PNG project no longer starts from a JPEG the model already compressed — a WebP project asks for PNG too, since PNG is the lossless source the image processor re-encodes from and WebP is not an Ark output format. Reference images are labelled with the type they actually are: the data URI hard-coded `image/png` for bytes that are just as often JPEG or WebP, and the format is now sniffed from the image header. Reference counts are clamped to what each model takes (10 for 5.0 Pro, 14 for 5.0 Lite, 4.5 and 4.0, 1 for Seededit, none for `seedream-3-0-t2i`, which is text-to-image only) instead of being sent through and rejected. A response whose first entry carries a content-filter error rather than an image no longer reports "no image data" when a later entry has one.
- **GPT Image 2 Official (RunningHub)**: RunningHub serves GPT Image 2 in two tiers, and only the economy one (`rhart-image-g-2`) was bundled. **GPT Image 2 Official** adds `rhart-image-g-2-official` beside it, so the cheaper and the full-price route to the same model can be picked per project. It runs on the same standard-model API — submit to `/text-to-image` or `/image-to-image`, then poll `/query` from the detached poller — and takes the same payload, with one addition: the official endpoint requires a `quality` tier (`low`, `medium`, `high`) alongside the `resolution` tier, where the economy one takes resolution alone. An image project has a single quality control, so the model's options list the nine combinations (`1K Low` through `4K High`) as one value each and the generator splits it back into the two fields the request wants; a value that names only one of the two (a job carried over from another model) falls back to `1K` and `medium` for whichever is missing. The quality picker now wraps onto more than one row so the nine options stay readable — models with two to four options are unaffected. The official tier also accepts the four extreme ratios the economy entry omits (`1:2`, `2:1`, `1:3`, `3:1`), and the 20,000-character prompt limit is unchanged.
- **MiniMax Hailuo H3 Video (RunningHub)**: Added `minimax/hailuo-h3` as a RunningHub video model, in both of the forms it exposes. **MiniMax Hailuo H3** animates a first and optional last frame; **MiniMax Hailuo H3 Multimodal Reference** takes up to 9 reference images, 3 videos, and 3 audio clips alongside an aspect ratio. Both run on the standard-model API the other RunningHub models use — submit, then poll `/query` from the detached poller — but their request bodies are much narrower than Seedance's: a prompt, the references, resolution (`2K` or `768P`), and a duration of 5 to 15 seconds. Sound, real-person mode, and the conversion slots Seedance takes are not part of either, so the generator builds a dedicated payload for Hailuo instead of stripping fields off the Seedance one. A prompt is required on every request; the frame-based model fixes the aspect ratio to `adaptive` because the output follows the first frame, while the multimodal one offers the ratios the endpoint accepts. A resolution, duration, or ratio carried over from another video model is mapped onto the nearest value Hailuo accepts rather than being sent through and rejected. Endpoint suffixes on a model ID are now matched against a list rather than one hardcoded pattern, since Hailuo names its reference endpoint `multimodal-to-video` where Seedance uses `multimodal-video`, and a configured API URL is trimmed back to the API root, so a URL pasted from any model's endpoint page still addresses the model the project selected.
- **Current Account Tool for the Assistant and MCP**: Every tool in the registry acts on the account behind the token, but nothing reported which account that is — an agent connected over MCP could read the user's libraries and never be able to answer "who am I signed in as?", and had no way to check whether a token belonged to the expected account before writing with it. `get_current_account` returns the identity the session resolves to: user id, email, role, account status, storage limit, whether a password and two-factor are set, and the created/updated/last-login timestamps. It takes no arguments, reads only the caller's own record — it cannot look up another user — and exposes no password hash or token material. Storage consumption still belongs to `get_storage_usage`; this tool reports the limit only.
- **Job Tools for the Assistant and MCP**: The tool registry could build a project but not run one — jobs appeared only as a count on `get_project`, so drafting and starting generation stayed a UI-only errand. Three tools close that gap. `draft_jobs` stages drafts the same way the project viewer's queue button does: it runs the project's own workflow through the remix engine (honouring shuffle, tag filters, and disabled items), resolves the referenced libraries, and writes each combination as a draft carrying the project's provider, model, generation settings, and a filename built from the prompt's tags and titles — up to 10,000 per call. `start_jobs` moves drafts into the queue oldest first, either all of them or the number asked for, and hands them to the generation queue. `get_project_job_counts` reports drafts, pending, processing, completed, failed, and album totals in one read. Both writes are confirmation-gated with summaries that name the project and the count, and the storage quota is checked before drafting and before starting, exactly as the REST routes do. Drafts append rather than replace: the bulk project save deletes any draft missing from the list it is given, so the new tools go through a dedicated append path instead.
- **Queue Status Tool for the Assistant and MCP**: Asking how busy generation is meant opening the queue monitor — the tool registry only counted one project at a time, and nothing exposed the totals across all of them. `get_queue_status` returns exactly the numbers the monitor page shows and nothing else: running (detached runs included), queued, pending, failed, and the provider slots in use against the combined concurrency limit, plus the page's own link. A `breakdown` of `projects` or `providers` adds per-row counts matching the page's two tabs — `providers` reports every configured provider queue with its slots in use, concurrency limit, queue depth, and failures; `projects` reports one row per project holding jobs — each capped by `limit`, ordered busiest first, and carrying a link to the project or provider it describes. Jobs themselves, their prompts, and their errors stay out of the response in every mode.
- **Clear Failed Jobs from the Assistant and MCP**: `get_queue_status` could report how many jobs had failed but nothing could act on them, so an agent watching a project stall had to hand the user back to the queue monitor to press the clear button. `clear_failed_jobs` performs that same action: it deletes failed job records for one project (`projectId`), for one provider queue (`providerId`), or across the whole account when neither is given — the two scopes are alternatives and the tool refuses a call carrying both, matching the REST endpoint the monitor page already uses. Only jobs in `failed` are touched; drafts, queued, running, and completed jobs stay, and album items saved by earlier successful runs survive because clearing removes the job record and not the result. Any job still pending in an affected project is re-enqueued afterwards, so a project stalled behind failures resumes on its own, and the response reports how many projects that restarted alongside the number deleted. The tool is destructive and confirmation-gated: the approval summary names the project or provider queue by name and states that cleared failures cannot be retried. Provider ids now resolve to provider names in confirmation summaries, the way project and library ids already did.
- **Batch Set Post Text**: Campaign Batch Actions could only fill post text through the model — useful when each post needs its own wording, wasteful when they should all carry the same caption. A **Set Text** action next to AI Generate takes one block of text and writes it to every selected post in a single request, with no provider, prompt, or background task involved. Existing text on those posts is replaced, and posts that no longer exist are reported as skipped the way the other batch operations report them.
- **Posting Trend Chart**: Whether posts were actually going out could only be reconstructed by reading down the history list. A daily delivery chart now sits above **Recently Posted** on the Campaigns page showing the last 7 days, and the campaign history page gains a list/chart view switch — held in the `view` query param — with its own quick ranges. A new `GET /api/campaigns/posted-counts` aggregates execution records into per-day posted and failed counts, bucketed by the caller's local date rather than UTC. The chart is inline SVG sized by a `ResizeObserver` with no charting dependency: a crosshair and tooltip follow the pointer or a touch, the peak day is labelled, and a second red line appears only when the range actually contains failures. The two line colours were checked for colourblind separation and for contrast against both the light and dark surfaces. Narrow viewports get a shorter plot, a tighter axis gutter, thinned-out date labels, and no dots past 14 days, and the list request is skipped entirely while the chart is showing. Translated into all six locales.
- **Longer Ranges on the History Chart**: The posting trend chart offered 7, 14, and 30 days and nothing beyond, so a campaign's shape across a season or a year was invisible. The range picker now also covers **90 days**, **180 days**, **1 year**, and **All time**, the last starting at the first day that carries a post rather than at a fixed cut-off. Plotting a year one day at a time would be unreadable, so buckets widen with the span: up to 120 days stays daily, up to 500 days rolls into weeks, and anything longer into calendar months, with a **Weekly**/**Monthly** badge next to the legend so the unit is never in doubt. A bucket's tooltip names the days it covers (`May 29 – Jun 4`, or the month by name) instead of a single date, and the axis switches to month labels — carrying the year when the range crosses one. The chosen range lives in the URL as `?range=90d`, so a view can be linked or bookmarked.
- **Export Tools for the Assistant and MCP**: Agents could read album items and mint a URL per file, but had no way to hand over a whole album or move a project to another installation. `export_project` builds the portable project bundle — settings, workflow, album metadata, and the media those reference — and `export_project_album` packs the album's media as a ZIP, the whole album unless a subset is named. Both are confirmation-gated, both queue the same background jobs the web export uses, and both wait up to `wait_seconds` for the archive before returning either a presigned `downloadUrl` or a `task_id` to resume waiting on. The route bodies behind `/export` and `/export-bundle` moved into a shared service so the web and tool surfaces run one code path rather than two.
- **Campaign Post Listing over MCP**: Every post tool takes a `postId`, and nothing returned one — `list_campaigns` reports a post count and no ids, so a client could read a campaign and never reach the posts inside it. `list_posts` takes a `campaignId` and returns each post's id and link alongside its status, schedule, media count, and a short text preview, paginated like the other list tools. Ownership is checked against the campaign before any post is read, and the status filter accepts the engine-set states (`completed`, `failed`) that the write tools cannot set.
- **App Links in Tool Results**: Tool results carried ids and nothing else, so an agent could only quote an id back rather than link to the thing it had found. Every tool that reads or writes a library, project, campaign, or post now returns an absolute Remix Studio link beside the id — `url` for the record the call is about, and `libraryUrl` / `projectUrl` / `campaignUrl` when that record is context for something else, such as a search hit, an album item, or a post tool. Tool descriptions name the field so the model surfaces it, and the in-app assistant is told to use the returned link rather than assembling one. The origin comes from `APP_URL` when it is configured, and otherwise from the incoming MCP request, honouring forwarded proto and host headers behind a proxy; the in-process assistant, which has no request to read, falls back to `APP_URL` or the local dev default.
- **Bulk Export Selection and Deletion**: Clearing out old export records meant deleting them one at a time. Exports now carry per-row checkboxes with a select-page and clear-selection control, a count of what is selected, and a **Delete selected** action whose confirmation names how many records will go. Translated into all six locales.
- **Page Size on the Library Item List**: The library editor was pinned to 25 items a page. A `size` search param (25, 50, 100, or 200) now drives the fetch, with a selector beside the sort control in the sticky toolbar, so the choice survives a reload and travels in a shared link. Changing the size returns to page 1, since the old offset no longer points at the same items.
- **Full Release Error Messages**: A failed release showed a truncated reason in the history row with no way to read the rest. The row's error now opens a dialog carrying the full message, with labels translated into all six locales.
- **The Media Picker Remembers the Last Source**: The picker always opened on the first library in the list, so the same source had to be found again on every open. The last active library or album is now remembered per feature — the workflow item picker keeps its own record per item type, campaign media keeps its own — and the record is shared across projects rather than stored per project. A remembered source that has since been deleted or filtered out falls back to the first entry. Pickers pinned to one fixed source are unaffected.
- **One-Step Sharing from the PWA**: Sharing into the app offered **Save to Library or Project**, which only led to a second destination choice on the import page. The share sheet now offers **Save to Library** and **Save to Project** as separate buttons that carry the chosen destination to `/import` as a query param, so a share takes one selection instead of two.

### Changed

- **Release History Moved Beside Releases, Project Import Moved to Projects**: Two pages sat under the wrong parent. Release history lived at `/exports/releases/history`, as if it were a detail of the destinations screen, when it records what happened to exports rather than anything about a connection — it is now `/exports/history`, a sibling of `/exports/releases` under Exports, and its back link goes to Exports. Project bundle importing was on the Exports page, which put an action that creates a project in the middle of a list of archives; it now has its own page at `/projects/import`, reached from an import button in the top right of the **Projects** header, and the Exports page carries only exports. The old paths (`/exports/releases/history`, `/releases/history`, and the pre-rebrand `/exports/uploads`) redirect to `/exports/history`, query string and hash intact.
- **Batch AI Text Generation Is a Full-Screen Editor**: The batch generation dialog stacked the model picker, the prompt library, and the prompt list above the textarea, so the field people actually type in was pushed off the bottom of a scrolling box. It is now a full-screen workspace: configuration — model, image context, prompt library — sits in a fixed left rail, and the prompt editor fills the right pane at full height. Phones get their own layout rather than a squeezed desktop one, with the two panes as a Prompt/Options tab pair so each has the full width; picking a saved prompt jumps back to the editor with the text loaded, the Generate action spans a footer that clears the bottom safe area, and autofocus is skipped so the keyboard does not cover the editor on open. Escape closes, Cmd/Ctrl+Enter submits, and a live character count and the selected prompt's name sit above the editor.
- **Dependencies Upgraded**: Every direct dependency was bumped, majors included — TypeScript, Vite, sharp, archiver, lucide-react, openai, `@google/genai`, `@anthropic-ai/sdk`, google-auth-library, and `@hono/node-server`. This clears the high-severity sharp/libvips advisory and both moderate advisories; the one remaining low is esbuild's Windows-only dev-server issue, reachable only through the version Vite pins. Four upstream removals needed code changes: archiver 8 dropped its callable default export, so the ZIP export pipeline constructs `ZipArchive` directly; TypeScript 7 defaults `strict` to true, which this codebase predates, so `tsconfig` now sets it to false explicitly rather than fold a 106-site null-safety migration into a dependency bump; lucide-react 1.x removed its brand icons, so the social platform marks come from `react-icons/fa6`; and react-icons 5.7 removed `SiOpenai`, so the provider icon inlines that mark the way it already does for RunningHub, KlingAI, and Kimi. The deprecated `@types/bcryptjs` and `@types/sharp` stubs are gone, both superseded by types their packages now ship.
- **Documentation**: Added a guide for calling MCP tools over plain HTTP, for clients with no MCP support — the required headers, the SSE response framing, the stateless behaviour (no session, no `initialize` handshake), the two-call write confirmation handshake, curl/Python/Node examples, and an error table — linked from the MCP page and the Integrations sidebar.

### Fixed

- **The History Date Filter Half-Applied Itself**: The from/to inputs on the campaign history page behaved differently depending on which view was open and how many of the two boxes were filled. The list applied whatever was set, including a single bound; the chart ignored the filter entirely unless *both* dates were present and instead followed its own quick-range picker, so the same page could show a filtered list and an unfiltered chart at once. Nothing applied until the funnel button was pressed, and an end date before the start date was accepted and silently returned nothing. The two controls are now one range that both views read: the quick ranges and a **Custom** option write to the same state, changing a date applies immediately, a single bound means genuinely open on that side, and an inverted range is swapped rather than left to return nothing. The picker is visible in both views, so switching between list and chart no longer changes what is being filtered. Day bounds are also resolved in the viewer's own timezone — previously a bare `YYYY-MM-DD` was cut at UTC midnight, so anyone east or west of UTC saw hours of posts fall outside the day they picked.
- **Number Fields Could Not Be Cleared**: The last digit in a number box refused to be deleted, so replacing a value meant selecting it and overtyping rather than clearing and starting fresh. Each of these fields fed the raw input straight back through a parse that treats an empty box as nothing to do — `parseInt('')` is `NaN`, and the guard around it dropped the change, or `Number('') || fallback` snapped the field to `0`, `1`, or `8` — while the number prop re-rendered the old value back into the box. The affected inputs (the queue's job quantity, a provider's parallel task count, the watermark padding and font size, and the slideshow interval) now share a `NumberInput` component that keeps the text being typed as its own state: the box may be empty or mid-edit while focused, values commit as soon as they parse inside the field's range, and leaving the box resolves what is left — empty restores the previous value, out of range clamps to the nearest bound.
- **Drawing on a Workflow Image Changed Its Dimensions**: Saving from the workflow image editor without cropping first — which is every draw-only edit — wrote the picture back at an inflated, arbitrary size. With no crop selected the export fell back to the image's natural width and height but then scaled those by the ratio between the natural and on-screen sizes anyway, so a 1024×1536 reference shown at 405px wide came back as 2589×3880, upscaled and re-encoded. The export rectangle is now resolved once: no crop means the natural size used as-is, and a real crop is scaled up from screen pixels, rounded to whole pixels, and clamped to the image so a selection dragged past an edge cannot ask for pixels that do not exist. Cropped saves keep the dimensions the toolbar reports instead of landing a pixel or two off.
- **Light Mode Was Unreadable in the Model Selector and Other Dialogs**: The model selection dialog composited a translucent `bg-white/40` panel over a `bg-black/90` scrim into a muddy grey, and the selected model card painted near-white text on a 10%-opacity blue fill. The dialog now has an opaque light surface behind a lighter scrim, and the selected state is blue on a light blue fill; the glass treatment is kept behind `dark:` variants, so dark mode is unchanged throughout. The same class of fault was repaired across the rest of the interface: muddy panels on dark scrims in the copy/move, duplicate-library, export-filename, and tag dialogs; unguarded `hover:text-white` across 14 components, which faded text to invisible on a light surface; unguarded dark hover borders across 12 components, which snapped a light border to near-black; the text album detail and compare dialogs, whose panes carried full light/dark pairs while the surrounding chrome stayed pinned dark; and low-contrast blue text in Library Import & Export. Overlays that are dark in both themes — the image lightbox, media tiles — were left alone.
- **Campaign Batch Text Generation Failing on the Model Id**: A batch could die against the provider with an opaque "model not found" because the queued task carried the local model config id rather than the id the upstream API understands. Both forms are now accepted and resolved to the provider's own id before the request goes out, so a selection restored from an earlier session still runs. The Gemini id map was also stale — it rewrote 3.1 Flash Lite to a preview model and knew nothing of the 3.6 and 3.5 releases — and Gemini 3.6 Flash and 3.5 Flash-Lite reject the legacy sampling options, so temperature is no longer sent to them. When a batch fails, the reason now reaches the toast instead of only a count: a run where every post failed is reported as failed rather than completed, the first error is carried on the task, and a partial failure shows the message beneath the warning. Failures are logged server-side with the batch, post, provider, and model ids.
- **Two Cramped Album Cards per Row on Phones**: The album grid picks its column count from the pane's own width, and on a phone the pane spans the whole viewport — wide enough to trip the 26rem step, so portrait phones got two squeezed cards per row. Every multi-column step is now gated on `sm:` as well, so phones stay single column while the pane-width steps keep driving the desktop layout unchanged.
- **The Jobs Pane Measured the Viewport Instead of Itself**: The album/jobs pane is the third column of a three-column desktop layout, so on a ~1100px window it is only ~460px wide — but every `sm:`/`md:`/`lg:` utility inside it was matching the viewport, so it was handed full-desktop chrome it had no room for. The selection toolbar's two groups slid over each other (EXPORT ALL printed on top of SELECT ALL) and the album rendered four columns of ~95px cards where the delete button, the ratio and date pills, and the filename no longer fit. The pane and the workflow panel are now container query contexts driven by their own width: the toolbar wraps rather than overflows and reveals button labels only once there is room for them on one row, the album grid keeps cards at ~200px or wider at every step, and album cards are their own container so overlay buttons, corner pills, and padding scale with the card — the date pill dropping out before it can collide with the sequence number. Job rows, pagination, and the reference-image grids follow the pane container too.

## [1.20.0] - 2026-08-08

### Added

- **Project Bundles (Export & Import a Whole Project)**: A project can now be packaged into one portable ZIP and brought back later, or into another Remix Studio installation. **Export Project** on a project card's menu builds the bundle through the existing export worker, so it lands on the **Exports** page — marked *Project Bundle* — where it can be downloaded, released to a drive, or sold like any other archive. The bundle holds a `project.json` manifest (settings, workflow, album metadata) and a `media/` directory carrying every file those reference — originals, optimized versions, and thumbnails — with each storage key rewritten to its path inside the archive, so nothing about the exporting installation's bucket layout leaks into it. A file referenced twice (a library image pinned in the workflow that is also an album item's context) is stored once. Importing is on the Exports page: pick or drop a `.zip` and it streams straight into storage, then a background worker validates the manifest, checks the unpacked media against the storage quota, creates a **new** project — the original's id is never reused, so a bundle can be imported beside its source — unpacks the media, and rewrites every reference to the new keys. Progress is reported per file and the finished entry links to the imported project. Import tasks use the same claim/heartbeat/reap machinery as exports, and the uploaded ZIP is deleted once the import ends either way. Jobs are not carried over: bundles hold finished work, not generation history.
- **Releases**: The store settings screen is now **Releases**, a sub-page of Exports at `/exports/releases` reached from the link in the Exports header, and it holds every destination a finished export can go to — cloud drives as well as storefronts. Google Drive moved here from the Exports header, and it is no longer a single slot: any number of drives can be connected, including several accounts on the same provider. **OneDrive** (Microsoft Graph, resumable upload sessions) joins Google Drive as a supported drive. Releasing an export asks which drive to use when more than one is connected, and the release history now covers drive uploads alongside storefront publishes. Existing Google Drive connections are migrated automatically; the old `/exports/stores` and `/exports/uploads` paths redirect to the new pages.
- **Kimi (Moonshot AI) Provider**: Added Kimi as a provider type, bundled with the `Kimi K3` text profile — a 1M-token context window with native vision, so reference images can be attached to a text workflow. Kimi speaks the OpenAI Chat Completions protocol, so the text generator and chat adapter reuse the OpenAI implementations against `https://api.moonshot.ai/v1`; the API URL can be overridden to reach the mainland China endpoint. Kimi providers are also accepted by the in-app assistant, and the provider screen lists the account's models. The K2 series and `moonshot-v1` models are deliberately not bundled: K2 was discontinued in May 2026, and `kimi-k2.5` plus the `moonshot-v1` family are already closed to new accounts ahead of their August 31, 2026 sunset.
- **Seedance 2.5 Video (BytePlus)**: Added the Dreamina Seedance 2.5 model (`dreamina-seedance-2-5-260628`) and generalized the BytePlus video generator to the Seedance 2.x request surface. Alongside the existing image frame roles, a job can now carry `reference_video` and `reference_audio` items; whenever a video or audio reference is present — or more than two images are supplied — the request switches to omni-reference mode and every image is sent as a plain reference. Reference caps follow the tier (2.5: 30 images, 10 videos, 10 audios; 2.0: 9 / 3 / 3). Audio generation now follows the project's sound setting instead of being hardcoded for Seedance 1.5 Pro, and the 2.x family passes the seed through and disables the watermark.
- **Content Edits in `batch_update_library_items`**: The batch MCP tool only accepted a title and tags, so rewriting the text of several library items meant one `update_library_item` call each — which the assistant would take literally, reporting that it could not update the rest and handing back a half-finished job. Each entry now takes an optional `content` field. The approval prompt for both update tools also names the item count and the fields being changed instead of "Run write tool", and the assistant's bulk-work guidance covers edits as well as creations.
- **Reuse a Workflow from the Album**: Reusing a configuration no longer means hunting for the right row in Done. Album, text, and audio entries now carry their own reuse control, and the image lightbox has one too (shortcut `R`), so a setup can be picked while looking at the finished piece. The settings are resolved through the job behind the item, the same confirmation applies before the project workflow is replaced, and the lightbox closes once it is. When no snapshot was stored for a result — its Done record was deleted, or the job predates snapshots — the workflow is rebuilt from the result's own prompt and media references, and the confirmation states that the rebuild reproduces that one result rather than the recipe that varied it.

### Fixed

- **Cropped Image References on Phones**: The workflow image preview forced every reference into a 16:9 tile with `object-cover`. That reads well in the narrow desktop panel, but on a phone the panel is full width and portrait references — the common case — were cropped to a thin horizontal slice. Below `lg` the preview now scales the image to fit on a neutral backdrop, capped at 50vh, and carries an explicit expand button since the hover affordance does nothing on touch. Desktop and the expanded grid view keep their compact tiles.
- **Text Library Actions Hidden Behind Hover**: Text library rows hid their copy, tag, edit, and delete buttons behind a hover state from the `sm` breakpoint up. The actions are now visible at every breakpoint.
- **Reuse Reporting "No Longer Available" on Untouched Results**: Adding a second batch of drafts erased the workflow snapshot of every draft, pending, and failed job already in the project, so results those jobs went on to produce could not be reused even though nothing had been deleted. Job lists are served without the snapshot (only the configuration endpoint includes it), and the bulk project save was writing that absence back to the database as `null`. Bulk saves now leave the snapshot alone unless the client actually sends one. Snapshots are also stored as bare storage keys rather than the presigned URLs the client was holding, so a reused workflow does not carry links that have since expired.

### Removed

- **MEGA Drive Releases**: MEGA has been dropped as a release destination. It has no OAuth API, so a connection could only be made by storing the account's email and password — MEGA derives the account master key from the password, so it is needed in full on every upload. Unlike an OAuth token, that secret cannot be scoped to a folder, cannot be revoked without changing the password, and grants the holder the whole account. Google Drive and OneDrive, which both authorize over OAuth, remain. Any existing MEGA connections are deleted on upgrade along with their stored passwords, queued MEGA releases are marked failed, and past MEGA releases stay listed in Release History.

### Changed

- **Interface Flicker and Repaint Cost**: Moving the pointer across the app caused visible flicker in Chrome on macOS and a milder version in Safari. Two compositing problems were behind it: `html, body` used a fixed-attachment gradient, which the compositor cannot cache, so every `backdrop-filter` layer above it was re-read and re-blurred from the main thread on each repaint — and the app shell never scrolls its body, so the fixed attachment bought nothing. Meanwhile Tailwind's `transition-all` includes the filter properties, so hovering any of the 67 elements that also carried `backdrop-blur-*` animated the blur radius itself, re-rasterizing the whole blurred region frame by frame — worst on the full-height sidebar and assistant panel. A `transition-ui` utility (Tailwind's default property list minus the filter properties) now covers those elements, and a pointless `will-change: transform` on the Starfield canvas is gone. Backdrop blur has since been dropped from entity cards, the main layout, the album tab, the recycle bin, and the orphaned-files page, with background opacities raised to keep the same contrast. Progress bars across Exports, the queue monitor, and campaign detail render at full width and animate a left-origin `scaleX` instead of their `width`, so a progress tick no longer forces layout and paint.
- **Documentation**: The README was rewritten around AI-native content operations, and the docs site was audited end to end — the model matrix and feature mindmap now list Kimi and Seedance 2.5, and the guides were expanded and corrected against the current behaviour.
- **Media Picker Works on a Phone**: Picking a workflow image opened a dialog built for a desktop window: a fixed `88vh` box whose header, source controls, filter row, and footer stacked into roughly 560px of permanent chrome, leaving about one and a half tiles visible in a single-column grid on a 390px screen. On phones the picker is now a full-height sheet with a compact header, the source kind and source list share one row, sorting and search share the next, and the tile grid is two columns with the badges and file-path line dropped, so around six references are in view at once. Tiles honour their declared aspect ratio instead of stretching to the image's natural height, the footer respects the home indicator, and the type and source-kind filters are hidden when there is only one of them to pick. From `md` the picker is unchanged.
- **Dialogs Fit Small Screens**: Several dialogs were sized only for a desktop viewport. The prompt editor and project preview now fill the phone screen instead of floating in a `80/85vh` box, the workflow library selector, model selector, and tag editor use `dvh` heights so browser chrome cannot push their buttons out of reach, and the duplicate, copy/move, export-filename, and prompt-limit dialogs scroll rather than clip when they outgrow a short viewport. Phone padding, title sizes, and footer buttons were tightened across the same set, and footers clear the home indicator. Desktop layouts are unchanged.
- **Compact Page Headers on Phones**: Page headers were sized for the desktop layout and pushed the actual content of a screen well below the fold on a phone. The shared header now uses a smaller title, tighter back link, and denser description below `md`, and the gap between it and the first content block shrank on the pages that stack their sections. The screens with hand-built headers follow the same rhythm: Import & Export drops its badge and oversized display title, the provider form's sticky bar keeps its title and buttons on one row, and Storage, Custom Models, two-factor setup, and the library editor's chips all scale down. Page padding on phones drops from 24px to 16px. Desktop layouts are unchanged.
- **Headers Scroll Away on Phones**: The library editor and the orphaned-files cleanup kept their header on screen permanently and scrolled only the list beneath it, so a fixed band of title, description, and controls ate a quarter of a phone screen. On phones the whole page now scrolls and the header leaves with it, while the list's selection toolbar still pins to the top; from `lg` the pinned-header layout is unchanged. The Recycle Bin's pinned toolbar also stays on one row instead of stacking — roughly half its previous height — hiding the item totals only while a selection is active, and the prompt editor's header is tighter on small screens.

## [1.19.0] - 2026-08-02

### Added

- **Claude Opus 5**: Added Claude Opus 5 to the Claude provider's text models, with a 1M-token prompt limit and 128K max output. Like Fable 5, Opus 4.8, and Sonnet 5, it accepts only the default temperature.
- **Hide Disabled Workflow Items**: The project workflow's three-dot menu can now hide disabled items, with a count of how many are hidden, and the `H` key toggles them from anywhere in the project view (the menu entry shows the shortcut). The choice is saved with the project, so it carries across reloads and devices. Hiding is view-only — drag-and-drop reordering still uses each item's real position.
- **Signed File URLs for MCP & Assistant**: Added a `get_file_urls` tool that turns internal storage keys — from albums, libraries, and campaign post media — into temporary presigned URLs so connected agents can actually view, fetch, or download a file, with an optional `download` mode that returns a save-as link. Keys are only signed when they still belong to the authenticated user's own media; anything else is refused with a reason.
- **Album Item Browsing over MCP**: Added a `get_album_items` tool that pages through one project's album and returns each item's prompt, format, aspect ratio, size, and storage keys, so an agent can pick a specific generated image before requesting a URL for it.
- **Numbered Pagination**: Replaced previous/next-only controls across projects, libraries, exports, store uploads, chats, users, campaigns, scheduled posts, and project tabs with a shared page-number navigator. It includes first/last jumps and compact ellipsis controls that skip five pages at a time.
- **Assistant Truncation Recovery**: The assistant can now detect responses or tool arguments cut off by a model's output limit and ask the model to continue automatically. Bulk tasks also have higher iteration and tool-call ceilings, longer provider timeouts, clearer batch progress, and the correct completion-token parameter for OpenAI reasoning models.

### Changed

- **Mobile Pagination & Library Editing**: Pagination now uses larger touch targets and a compact phone layout, surrounding status rows can wrap instead of overflowing, and the Library Editor uses the shared navigator. Text library rows stack their title and preview on small screens and keep their actions accessible without hover.
- **Dashboard Navigation**: Recent Projects, Libraries, and Campaigns headings now link to their full list pages, with hover and chevron cues that make the navigation discoverable.
- **Documentation**: Refined the user-facing What's New history, documented the new MCP album and file URL tools, and expanded the MCP OAuth and model-maintenance notes.

### Fixed

- **Gemini Batch Tool Calls in the Assistant**: Assistant turns that ran several tools at once — creating a run of campaign posts, for example — died mid-batch on Gemini 3.5 Flash Lite. Gemini issues an id with each parallel function call and, from 3.5 onwards, rejects the follow-up turn unless every function response carries the id back; the adapter was dropping them. Those ids are now kept with the tool call and echoed on both the replayed call and its response. Two calls to the same tool with identical arguments are also no longer merged into one, so a batch containing repeats still creates every item.
- **Flash Lite Stopping Part-Way Through a Batch**: Flash Lite models default to minimal thinking, which is tuned for one-shot extraction rather than multi-step tool loops. The assistant now asks for a medium thinking level on those models whenever tools are available, so they work through a batch instead of trailing off.
- **Session Refresh Reliability**: Concurrent refreshes from multiple browser tabs and refresh responses lost to a network interruption no longer sign the user out. Session rotation now keeps a short-lived recovery chain, retries safely inside a grace window, and logs de-identified rejection reasons for diagnosis.
- **OAuth Refresh Reliability**: MCP and other OAuth clients can recover when a rotated refresh-token response is lost. Token rotation is now transactional, permits a short replay grace window, detects reuse outside that window, revokes the affected chain, and returns safe diagnostic error codes.
- **Mobile Assistant Drawer**: The conversation drawer now starts below the fixed app header on phones, keeping search and new-chat controls visible.
- **Drafts Added from Fullscreen Workflow**: After workflow items are successfully added as drafts, the expanded workflow now closes so the newly created drafts are visible immediately; a failed request leaves the workflow view unchanged.

## [1.18.0] - 2026-07-24

### Added

- **New Text Models**: Added Gemini 3.6 Flash and Gemini 3.5 Flash Lite (Google AI & Vertex AI), the GPT-5.6 family — GPT-5.6, GPT-5.6 Terra, and GPT-5.6 Luna (OpenAI), Claude Sonnet 5 (Claude), and Grok 4.5 (Grok). The default Gemini text model is now Gemini 3.6 Flash.
- **New Image Models**: Added nano banana Pro, Seedream 5.0 Pro, Seedream V5 Pro, and Wan 2.7 Pro to the RunningHub provider, and nano banana 2 Lite to the Google AI and Vertex AI providers.
- **Auto Aspect Ratio**: RunningHub's nano banana 2 now offers an "auto" aspect ratio option that lets the model pick the output ratio itself.
- **Image Version Selection**: When picking album images in the media picker, you can now choose between the optimized version and the original file.
- **Media Picker Aspect Ratio Filtering**: Album images and videos in the media picker can now be filtered by one or more aspect ratios, with item counts shown for each available ratio.
- **Save to Library**: Added a save-to-library button to text and image workflow items.
- **Cover Image Reordering**: Cover images on the sell/export page can now be reordered.
- **Text Library JSON Import/Export**: Added a lossless JSON mode for text library import and export, so prompts containing newlines, colons, or list-like lines survive round-trips intact; the plain-text format remains available.

### Changed

- **Project Tab Data Loading**: Reworked how the project tabs (Draft, Queue, Done, Album) load and cache their data. Album pages and completed jobs are fetched on demand per tab and cached across tab switches, deleting album items updates the album, its counts, and pagination instantly without waiting for a server refetch, and the Draft canvas keeps its own always-loaded preview of the newest album items so it appears as soon as the project opens. Confirmation dialogs now show progress and block double-submission while their action is running.
- **Library Editor**: Updated the Library Editor's typography, refined its toolbar styling, and internationalized the timestamp labels.
- **Package Registry**: Lockfiles now resolve packages from registry.npmjs.org instead of npmmirror.com.

### Fixed

- **Lightbox Deletion Refresh**: The album lightbox now switches to the next image immediately after deleting the current one, instead of keeping a stale image on screen.
- **Wan 2.7 Prompt Length**: Prompts longer than Wan 2.7's 2048-character limit are now truncated before submission instead of failing the job.
- **Image Editor Coordinates**: Drawing and cropping in the workflow image editor now land exactly under the cursor — edits are composed in the image's natural pixel space, so saved results are no longer offset or downscaled.
- **Mobile Assistant Buttons**: Message copy/edit and attachment-remove buttons in the assistant are now visible on touch devices instead of requiring hover.

## [1.17.1] - 2026-07-10

### Changed

- **Case-Insensitive Tag Matching**: Library tag filtering now matches tags case-insensitively, in both the filtering logic and tag selection UI.
- **Pagination**: The pagination bar in the project Album and Done tabs is hidden when all items fit on a single page.

### Fixed

- **Light Mode Theming**: Fixed a wide range of light mode issues across pages and modals — colored action buttons now always use white labels, controls over dark image overlays stay visible, leftover dark-only text colors and hover states received light equivalents, and the login card is consistently styled over its dark backdrop.
- **Light Mode Shadows**: Softened the heavy black shadows on selection toolbars and filter dropdowns in light mode to match the rest of the interface.
- **Draft Canvas Centering**: The empty draft canvas is now vertically centered in the tab area instead of sitting at the top.
- **Fullscreen Workflow Cards**: Workflow item cards now fill their grid cells properly in the fullscreen workflow view — text content expands with inner scrolling, and images and videos fill the remaining card height instead of overflowing.
- **Library Hover Border**: Removed the harsh border that appeared when hovering library item cards in light mode.

## [1.17.0] - 2026-07-05

### Added

- **Fullscreen Workflow View**: Added a fullscreen toggle button to the workflow panel header, next to the assistant button. It expands the workflow across the entire project view, hiding the Draft, Queue, Done, and Album area, and lays out all workflow items in a grid of equal-sized, individually scrollable cards. Toggling again restores the split view.
- **Slideshow Wake Lock**: Added the `useWakeLock` hook to prevent the screen from going to sleep during ImageLightbox slideshows.

### Changed

- **Model Availability Documentation**: Restructured model documentation into category-specific tables, added a provider summary matrix, and expanded the Chat Assistant capabilities section.

### Fixed

- **Posts Route**: Removed a failed status check that prevented correctly skipping posts in the posts route.

## [1.16.1] - 2026-06-22

### Added

- **Immersive Fullscreen Slideshow**: In fullscreen the image now fills the entire screen and the on-screen controls fade away after a few seconds without mouse or keyboard activity, reappearing the instant you interact.
- **Confirmation Keyboard Shortcuts**: The image deletion confirmation can now be dismissed with Escape, and pressing D again cancels it.

### Fixed

- **Delete Confirmation in Fullscreen**: Fixed the deletion confirmation dialog not appearing while viewing an image in fullscreen.

## [1.16.0] - 2026-06-22

### Added

- **Image Slideshow**: Added a slideshow mode to the image lightbox with play/pause controls, a circular interval countdown, and an adjustable interval that is remembered for next time.
- **Slideshow Transitions**: Added selectable transition effects between slides — fade, slide, zoom, blur, and an Android-style ripple — with the choice saved across sessions.
- **Lightbox Fullscreen & Shortcuts**: Added a fullscreen toggle and keyboard shortcuts to the image lightbox for playback, fullscreen, deletion, and adjusting the slideshow interval, with hotkey hints shown on hover.
- **Documentation Site**: Added a VitePress documentation site, published to GitHub Pages, covering guides, concepts, integrations, and operations.

## [1.15.0] - 2026-06-21

### Added

- **Image Editor**: Added an Image Editor modal for cropping and drawing directly on workflow images, including a reset option to revert edits.

### Changed

- **Assistant Settings Navigation**: Consolidated the assistant settings routes to use a query parameter for return paths, so navigating back lands you where you started.
- **Prompt Editor**: Removed the split view mode from the Prompt Editor and improved the styling of rendered markdown content.

## [1.14.1] - 2026-06-15

### Added

- **Drag-and-Drop Workflow Items**: Added the ability to drag and drop media files directly into the workflow list.
- **Workflow Paste Support**: Added support for pasting text and media files directly into the workflow using Cmd+V / Ctrl+V.
- **Auto-Scroll Workflow**: The workflow list now automatically scrolls to the bottom when new items are added.

### Changed

- **Orphan Files Layout**: Adjusted the responsive grid column counts and spacing in the Project Orphans view for better readability.

### Fixed

- **Workflow State Synchronization**: Optimized workflow state synchronization using functional updaters and implemented blob URL revocation to fix a memory leak with media items.
- **Database Concurrency Locks**: Fixed a race condition where rapid workflow updates could cause unique constraint violations by serializing updates with database locks.

## [1.14.0] - 2026-06-14

### Added

- **Threads Platform Support**: Integrated Threads as a campaign channel with a dedicated Threads channel implementation, unified platform icon and link logic, and OAuth connection status surfaced through UI toasts.
- **Threads Error Handling**: Added granular parsing of Threads API errors so connection and publishing problems are reported clearly.
- **Album Export Watermarking**: Added watermarking support for album exports with a new configuration panel and backend watermark utility.
- **Product Cover Watermarking**: Added per-product watermark settings for listing covers with automated image processing in the delivery queue.
- **Library Tag Match Mode**: Added an AND/OR tag match mode for library filtering and the workflow engine.
- **Workflow Library Switching**: Added the ability to change the source library on workflow items.
- **Album Page Size Selector**: Added a page size selector to the Album tab toolbar.
- **CLI Setup Guide**: Added a Claude Code and Codex CLI setup guide to the MCP Connections page.
- **Privacy Policy Page**: Added a privacy policy page to the public assets.
- **GHCR Image Cleanup**: Added a manual workflow to delete legacy SHA-tagged GHCR images.

### Changed

- **Async Campaign Media**: Migrated campaign media creation to asynchronous batch processing with status polling.
- **Campaign Batch Thumbnails**: Replaced the media button with a thumbnail preview for campaign batch actions.
- **Shareable Album Views**: Migrated album view state to URL search parameters so views persist and can be shared.
- **Library Preview Modal**: Refreshed the Library Preview modal with a responsive layout and updated design.

### Fixed

- **Stale Workflow Updates**: Fetch fresh project state before applying workflow updates to avoid overwriting concurrent changes.

## [1.13.0] - 2026-06-07

### Added

- **Project Live Updates**: Added real-time project status updates over WebSockets through a new project live hub publisher.
- **Social Profile Refresh**: Added social account profile refresh and automatic profile image synchronization when image loading fails.

### Changed

- **Project Job Start Flow**: Replaced global project updates with a targeted job start API to improve queue management reliability.
- **Project Live Refresh**: Added debounced and rate-limited project live refresh handling to reduce unnecessary data fetching.
- **Avatar Fallbacks**: Replaced remote DiceBear avatar fallback usage with a local SVG avatar generator utility.
- **X Platform Icons**: Replaced Lucide Twitter icon usage with a custom `XIcon` component across platform views.

## [1.12.1] - 2026-06-06

### Added

- **Lazy Job Configuration Loading**: Added a focused API endpoint and repository method for fetching a specific job configuration so workflow snapshots can load only when a job is reused.
- **Complete Album Media Migration**: Added repository support for fetching all project album items and expanded S3 key migration to cover all album media fields.

### Fixed

- **Project Viewer Split Regressions**: Restored affected project viewer, library, assistant, extension import, export, and media picker flows after the project data loading split.
- **Album Pagination Counts**: Updated album pagination and aspect ratio totals immediately after batch item deletion.
- **Image Lightbox Synchronization**: Improved index safety and state synchronization when navigating project images.

### Changed

- **Project Viewer Caching**: Added cache-based fetching with stale-time validation for album and completed job tabs.
- **Project Workflow Loading**: Decoupled project workflow fetching and standardized storage normalization logic for project form and project route payloads.
- **Post Count Lookup**: Optimized scheduled post count lookups with map-based aggregation and consistent local date formatting.
- **Job Filename Sanitization**: Centralized sanitized filename truncation logic for project job exports.
- **Architecture Diagram Docs**: Added Mermaid class definitions and styling to the architecture diagram in the README.

## [1.12.0] - 2026-06-04

### Added

- **Project Data Pagination**: Added server-side pagination and sorting for project albums and completed jobs, including reusable pagination controls in the Project Viewer.
- **Job Update Timestamps**: Added `updatedAt` tracking for jobs with a database migration to support more accurate job metadata and ordering.
- **Async Confirm Actions**: Added loading state and async action support to `ConfirmModal`.
- **Campaign Schedule Metadata**: Included campaign schedule date ranges in API responses and updated campaign UI display logic.

### Fixed

- **Done Job Preservation**: Prevented partial project job saves from removing completed job records that are now loaded through a separate paginated endpoint.
- **Completed Job Deletion**: Added a dedicated API and repository path for deleting individual project job records without using full project job synchronization.
- **Startup Healthchecks**: Deferred queue task recovery until after the server starts listening, preventing detached task recovery from blocking `/healthz` and marking containers unhealthy.

### Changed

- **Project Viewer Loading**: Refactored project workflow, queue jobs, completed jobs, and album data to load through focused API endpoints instead of a single large project payload.
- **Queue Recovery**: Kept task recovery as a background startup process while preserving detached polling and queue resumption behavior.

## [1.11.0] - 2026-05-30

### Added

- **S3 Custom Domains**: Added configuration variables and support for S3 export public endpoints and custom domains via environment variables.

### Changed

- **Workflow Reuse**: Updated workflow reuse logic to sync provider, model state, and navigation.

## [1.10.3] - 2026-05-26

### Added

- **Model Updates**: Added support for Grok Imagine Pro model and updated Google and Vertex Gemini model configurations to version 3.5 flash.
- **Completed Jobs Media**: Display job context media in the CompletedTab.

### Fixed

- **Extension Import**: Improved selection logic in ExtensionImport.

### Changed

- **Orphan Projects Layout**: Render all orphan projects in a responsive grid.
- **Watermarks**: Replaced sharp text rendering with SVG overlay to improve watermark positioning and rendering consistency.
- **Docker Fonts**: Installed additional system fonts and refreshed font cache in Dockerfile.

## [1.10.2] - 2026-05-17

### Added

- **Reuse Job Configuration**: Added the ability to restore a historical job's exact workflow snapshot and generation settings (model, provider, aspect ratio, etc.) back to the active project.
- **Workflow Snapshots**: Implemented database support for capturing and storing the raw JSON workflow structure at the moment of job creation.
- **Send to Chat (Chrome Extension)**: Added new context menu items "Send image to Remix Studio Chat" and "Send text to Remix Studio Chat" that open the Assistant page and pre-fill the composer to start a new conversation.
- **Android PWA Share Target**: The installed PWA now appears in the Android share sheet for text and images. A `/share` landing page lets the user pick between saving to a library/project or starting a new chat. Powered by a new service worker that intercepts the share POST and stashes the payload.

## [1.10.1] - 2026-05-17

### Changed

- **Extension Import**: Separate persistent destination preference by import type (text vs image).

## [1.10.0] - 2026-05-17

### Added

- **Extension Import Name Extraction**: Added Chrome Extension support for extracting imported image name from the `alt` tag or URL.
- **Extension Import Persistence**: Added automatic persistent configuration for the Chrome Extension import's destination selection via local storage.
- **Extension Release Asset**: Configured GitHub Actions to automatically zip and include the Chrome Extension as a release asset in the Docker workflow.

### Fixed

- **Extension Import Infinite Loading**: Fixed an issue where refreshing the Extension Import page without Chrome Extension data would result in an infinite loading state.

### Changed

- **Extension Import UI**: Updated the Chrome Extension Import page UI design language to match the workspace library creation layout.

## [1.9.0] - 2026-05-15

### Added

- **Digital Store Integration**: Introduced a digital store integration framework with Gumroad authentication and a product management system for selling exports, including database schema, API routes, and UI.
- **Store Upload History**: Added a store upload history page with tracking for product publishing activity.
- **Publish Immediately**: Added a publish-immediately toggle to product export configuration.
- **Assistant Tool Approvals**: Added persistent per-conversation tool approval management with backend support and a dedicated UI.
- **New Models**: Added GPT Image 2, GPT-5.5, and Grok 4.3 to the supported model configurations; reordered image generator quality options.
- **Google Drive Upload Confirmation**: Added a confirmation modal for Google Drive uploads and redesigned the exports header navigation.
- **Media Picker Source Locking**: Added `fixedSourceId` support to `UniversalMediaPicker` to restrict and pre-select a specific media source.
- **Name-Only Search**: Added a `nameOnly` filter to library and project search endpoints and repositories.

### Fixed

- **Command Palette**: Allow closing the command palette with the Escape key.

### Changed

- **Job State Integrity**: Protected server-controlled job states from client-driven overwrites and added S3 key migration support.
- **Export Pagination**: Replaced cursor-based pagination with page-based navigation for export tasks across server and UI layers.
- **Album Cover Presigning**: Injected main storage into `DeliveryManager` to handle album cover presigned URLs.
- **Album Grid Layout**: Migrated album cover and selection grids to a masonry layout using CSS columns.

## [1.8.0] - 2026-05-05

### Added

- **Command Palette**: Added command palette for navigation and entity creation with ⌘K shortcut.

## [1.7.5] - 2026-05-03

### Added

- **Campaign Post Detail**: Added a dedicated post detail view with scheduling controls, AI generation, and post management actions.
- **Campaign Analytics**: Added campaign post status counts, summary metadata, and URL-synced pagination and filtering.
- **Batch Watermarking**: Added configurable batch image post watermarking with a live preview.
- **Campaign MCP Tools**: Added campaign and post management MCP tools with assistant-side mutation handling.
- **Universal Media Picker**: Introduced a shared `UniversalMediaPicker` for standardized asset selection in project and campaign workflows.

### Fixed

- **Media Display**: Prioritized processed and source URLs over thumbnails when resolving media display assets.
- **Media Layout**: Improved truncation titles and flexible button spacing for media items.
- **Project Deletion Dialog**: Replaced browser-native project deletion confirmation with `ConfirmDialog`.

### Changed

- **Manual Sorting**: Removed the `LibraryItem` order column and implemented manual sorting for library and project picker lists.
- **Media Picker UX**: Streamlined single-item selection and optimized hook dependencies in `UniversalMediaPicker`.

## [1.7.4] - 2026-05-03

### Added

- **Media Source Filtering**: Added source filtering with search inputs to `MediaPickerModal`.

### Fixed

- **Campaign Execution Validation**: Added campaign status validation to prevent posts from executing when their campaign is inactive.
- **Campaign Link Layout**: Updated campaign post link styling to use truncation for long links.

### Changed

- **Provider Configuration**: Removed redundant `maxTokens` configuration from campaign execution flows.

## [1.7.3] - 2026-05-03

### Added

- **Memory Monitoring**: Added a server memory monitoring endpoint, logging, and dedicated documentation.

### Changed

- **Campaign List UI**: Refined campaign list item layout and related UI behavior.

## [1.7.2] - 2026-05-02

### Added

- **Feature Mindmap**: Added a Remix Studio architecture and capabilities mindmap.
- **Range Selection**: Added shift-click range selection for project jobs and media picker items.

### Fixed

- **Batch Upload Reliability**: Improved batch uploads with per-item error handling.
- **Media Thumbnails**: Updated media thumbnails to use top-aligned cropping.

### Changed

- **Campaign Batch Creation**: Refined batch campaign creation selection behavior and related campaign UI details.

## [1.7.1] - 2026-05-02

### Added

- **Smooth Theme Transitions**: Implemented circular ripple animation for theme switching using the browser's View Transitions API.
- **Theme-Aware Thumbnails**: Enhanced `ProjectCard` with theme-aware border styling.

### Fixed

- **Theme Synchronization**: Implemented automated system theme resolution and synchronization in `ThemeContext` to ensure the UI matches the OS preference.

### Changed

- **UX Refinement**: Replaced browser-native `window.confirm` with a custom `ConfirmDialog` for project deletions.
- **Provider Settings**: Updated assistant provider settings to auto-save on toggle, removing the manual save button.

## [1.7.0] - 2026-05-02

### Added

- **Media-Focused Home**: Replaced the legacy Dashboard with a modernized Home component featuring horizontal scrolling media carousels.
- **New Card Designs**: Completely redesigned `ProjectCard` and `LibraryCard` with image backgrounds, glassmorphism overlays, and quick-action context menus.
- **Geometric Fallbacks**: Implemented color-coded geometric placeholders (DiceBear) for projects and campaigns based on content type.
- **Campaign i18n**: Full internationalization support for the Campaigns module in English, French, Japanese, Korean, and Chinese (Simplified/Traditional).
- **Enhanced Media Picker**: Added aspect ratio filtering and bulk selection support to the `CampaignBatchCreate` media picker.
- **Project Deletion**: Added direct project deletion functionality from the project list and card menus.
- **Documentation**: Added dedicated `BACKUP_AND_RESTORE.md` documentation.

### Fixed

- **API Serialization**: Fixed a `TypeError: Do not know how to serialize a BigInt` in the campaign API response.
- **Image Alignment**: Fixed background cropping on portrait images by anchoring covers to the top.
- **Theme Persistence**: Set default theme to "System" for better user integration.

### Changed

- **Campaign API Optimization**: Implemented server-side aggregation for accurate post counts and S3 URL presigning for media covers.
- **UI Consistency**: Standardized padding and scrolling behavior across all main containers.
- **Terminology Refactor**: Renamed "Prompt Fragments" to "Items" across the codebase and localized strings for better clarity.
- **Layout Migration**: Moved export controls and statistics to the `PageHeader` actions slot for a cleaner interface.
- **User Management**: Redesigned the admin user filtering interface with modernized inputs.

## [1.6.0] - 2026-05-02

### Added

- Added `ConfirmDialog` component and replaced browser `window.confirm` with it for better UX.
- Implemented polling for batch AI text generation with status tracking and progress visualization.
- Added persistent prompt library integration and storage to `BatchAiGenerateModal`.
- Added `includeThoughts` toggle to assistant provider and automatic reasoning tag stripping from generated posts.
- Implemented polling for AI text generation status and integrated image processing for LLM context.
- Implemented paginated post fetching for campaigns.
- Added copy-to-clipboard functionality to library content.
- Added queue clear functionality and refactored the Queue Monitor UI.

### Changed

- Standardized UI component corners with a consistent `rounded-card` utility class.

## [1.5.3] - 2026-05-02

### Added

- Added database backup and restore scripts with automated retention support.
- Added `APP_URL` and X (Twitter) OAuth environment variables to docker configurations.

### Changed

- Migrated all Twitter API endpoints and branding to X (formerly Twitter) domain.

## [1.5.2] - 2026-05-02

### Added

- Introduced PM2-based deployment upgrade workflow.

### Changed

- Automated Prisma migrations on container startup.

## [1.5.1] - 2026-05-02 (This version is broken)

### Added

- Added validation and security constraints to campaign and post MCP tools.

## [1.5.0] - 2026-05-02 (This version is broken)

### Added

- Added social campaign management with campaign lists, detail pages, history, channel configuration, scheduled posts, and post creation flows.
- Added backend campaign, post, social account, and post execution models with API routes and repository support.
- Added X/Twitter channel integration foundations for social posting workflows.
- Added batch campaign post creation, batch AI generation, and batch scheduling UI flows.
- Added campaign media imports from libraries and projects with associated storage cleanup.
- Added media storage tracking and scheduling timeline support for campaigns.
- Added MCP tool support for campaign-oriented workflows.

### Changed

- Updated the assistant system prompt and planning docs for social campaign orchestration.
- Added release and Docker image status badges to the README.

## [1.4.2] - 2026-05-01

### Added

- Enabled automated GitHub releases from the Docker workflow.

### Changed

- Updated README deployment and support guidance.
- Updated package metadata for the 1.4.2 release.

## [1.4.1] - 2026-05-01

### Fixed

- Fixed failed task error text being cut off in Queue Monitor by adding click-to-expand functionality.

### Added

- Added detailed generation options (resolution, quality, aspect ratio, etc.) to the expanded view of jobs in the Queue Monitor.

## [1.4.0] - 2026-05-01

### Added

- Introduced a comprehensive Queue Monitoring system with a dedicated UI for tracking projects and providers.
- Modularized internationalization files into domain-specific JSON schemas (admin, app, libraries, etc.) for better maintainability.

### Changed

- Migrated MCP connections to the assistant settings tab.

## [1.3.0] - 2026-05-01

### Added

- Implemented robust concurrency slot management and orphaned job reconciliation in `QueueManager`.
- Added server-side configurable sorting for library items, replacing manual drag-and-drop.

### Changed

- Modernized RunningHub video generator with improved API integration and endpoint management.
- Updated pinned state icon to use a filled Pin component.

## [1.2.0] - 2026-04-30

### Added

- Added Alibaba Cloud DashScope provider support, including Qwen model profiles.
- Added batch copy and move support for library items, with frontend dialog and backend API support.

### Fixed

- Prevented a null selection error in the assistant page when no providers are available.

## [1.1.1] - 2026-04-30

### Added

- Added description fields for projects and libraries, including database migrations and UI support.
- Added timestamp fields to the library schema.

### Changed

- Improved project and library card layouts.

## [1.1.0] - 2026-04-30

### Added

- Added an assistant settings tools tab with capability overview and list view.
- Added aspect ratio filtering for project albums.
- Added scoped selection support for album bulk operations.
- Added the `get_project` MCP tool and improved project update workflows with explicit assistant prompts.
- Added library-specific assistant chat triggers.
- Added assistant chat history search.
- Added timestamp fields to library items.

### Changed

- Trigger workflows automatically after clearing failed jobs.
- Updated Docker image handling so the default branch tracks the `latest` tag.
- Switched add buttons to icon-only variants.
- Extracted the library card into a reusable component.
- Updated album lightbox state to use album item IDs for more reactive deletion behavior.

## [1.0.0] - 2026-04-25

### Added

- Initial release of Remix Studio.
- Self-hosted AI assistant workspace for orchestration and batch content generation.
- Project workflows built from reusable text, image, video, and audio libraries.
- Draft generation through permutation and shuffle workflows.
- Background generation queue with provider-specific execution.
- Provider credential, model profile, custom alias, and concurrency management.
- S3-compatible asset storage and ZIP export workflows.
- Built-in assistant and MCP support for operating libraries, projects, albums, models, and storage.
- Authentication, admin controls, 2FA, passkeys, and user storage limits.
- Internationalized UI for English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.

[1.7.1]: https://github.com/ShinChven/remix-studio/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/ShinChven/remix-studio/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/ShinChven/remix-studio/compare/v1.5.3...v1.6.0
[1.5.3]: https://github.com/ShinChven/remix-studio/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/ShinChven/remix-studio/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/ShinChven/remix-studio/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/ShinChven/remix-studio/compare/v1.4.2...v1.5.0
[1.4.2]: https://github.com/ShinChven/remix-studio/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/ShinChven/remix-studio/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/ShinChven/remix-studio/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ShinChven/remix-studio/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ShinChven/remix-studio/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/ShinChven/remix-studio/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ShinChven/remix-studio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ShinChven/remix-studio/releases/tag/v1.0.0

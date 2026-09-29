# Designspace: Decisions and deviations

This log records product decisions and technical deviations made while building Designspace,
in order. Each entry says what the plan (`docs/IMPLEMENTATION_PLAN.md`) said, what we did
instead (if anything), and why. Append to this file; never rewrite past entries.

---

## M0: Foundations & spikes

### Library versions (checked 2026-09-27, cloud session)
The plan was written on 2026-09-27 and named versions current on that date. Re-checked against
npm and crates.io before scaffolding; versions differ slightly from the plan's examples because
newer patch/minor releases had shipped. Notable picks:

| Package | Plan mentioned | Used |
|---|---|---|
| Tauri | 2.11.x | 2.12.0 (official plugins pinned to their latest stable `2.x`, not the `3.0.0-alpha` pre-releases that `cargo info` shows by default) |
| React | — | 19.3.0 |
| TypeScript | strict | 5.9.3 (see below — not the newly-released 7.0.2) |
| PixiJS | 8.19+ | 8.21.0 |
| rusqlite | — | 0.40.2 (feature `bundled`) |
| `@huggingface/transformers` | 4.x | 4.3.0 (only wired up in M6; not installed yet) |

**TypeScript 7.0.2 deviation:** npm's `typescript@latest` is 7.0.2, a preview of the native
(Go-ported, "tsgo") compiler line with a different CLI/config surface than the mature 5.x
series that `typescript-eslint`, Vite tooling and most editor integrations still target as of
this build. Using it for a strict, long-lived project this early would risk churn with no
benefit for a solo desktop app. We pinned **TypeScript 5.9.3** (latest 5.x) instead, and will
revisit once tsgo 7 and its ecosystem (`typescript-eslint`, `vite-plugin-checker`, etc.) settle
on stable support. Logged here rather than silently downgrading.

### Rust edition / MSRV
`crates/designspace-core` and `src-tauri` use Rust edition 2021 (stable toolchain in this
container: 1.94.1). No deviation from the plan; noted for reference since the plan didn't pin
an edition.

### Spike S1 — Canvas scale (10,000 sprites)
Built the bench harness (`?bench=10000`) with `PIXI.Graphics`-based colored rectangles, an
`rbush` spatial index for culling, and the LOD table from §4.6. In this Linux cloud container
there is no GPU, so we can only confirm the scene builds, culls correctly (only on-screen items
are `renderable`) and that the same code path runs without errors — not real frame times.
**Decision:** ship the culling + LOD skeleton now; real frame-time measurement is an **Owner
check** on the Windows PC, per the plan's own CI limits (§4.13, §7.1). Texture atlasing for
`t128` (mentioned as a spike question) is deferred until M1, when real thumbnails and an actual
item count exist to benchmark against.

### Spike S2 — Drag and drop into WebView2
`dragDropEnabled: false` is set in `tauri.conf.json`. Built the Diagnostics → Drop inspector
(Settings → About → Diagnostics) that lists every `DataTransfer` type/file for a drop event.
**This cannot be exercised in the cloud session** (no WebView2, no Windows). It's implemented
against the same HTML5 drag/drop APIs the browser dev build already uses, and is included in
the Owner checks below for a real test with Chrome, Edge, Firefox and Explorer.

### Spike S3 — Local media under COEP
Implemented the `media://` protocol (original/cache/models) with Range support, CORS and CORP
headers, and path-safety checks (canonicalize + reject escapes), covered by Rust unit tests.
The exact custom-protocol origin string on Windows (`http://media.localhost` per the plan) is
used in the CSP as written; **verifying it actually resolves needs a Windows build**, so this
stays an Owner check rather than a closed item.

### CSP / COOP / COEP
Implemented exactly as specified in §4.12, mirrored in both `tauri.conf.json` and the Vite dev
server headers, so the browser dev build and the Tauri build see the same policy during
development.

**Deviation, found and fixed while testing M0 in a real browser (`src/design/DesignPage.tsx`
and the app shell, via Playwright):**
- **`pnpm dev` needs `'unsafe-inline'` in `script-src`.** Vite's React plugin injects its
  react-refresh preamble as an inline `<script>` with no nonce/hash option, which the strict
  policy from §4.12 blocks outright (confirmed: the dev server never rendered anything, only a
  CSP violation in the console). `pnpm preview` — which serves the built static output, with no
  inline scripts, and is what CI/Playwright actually exercise — keeps the exact policy from the
  plan. Only `vite.config.ts`'s dev-server headers relax `script-src`; `connect-src` (the
  directive that actually guarantees no background network access) is identical in both. Logged
  here rather than silently weakening the policy everywhere.
- **PixiJS needs the `pixi.js/unsafe-eval` polyfill.** Without `'unsafe-eval'` in `script-src`
  (which the plan correctly never grants — only `'wasm-unsafe-eval'`), PixiJS's default
  `new Function()`-based shader/uniform sync throws immediately on the first render:
  `"Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to
  enable support."` This is a known, intended CSP-compatibility path (see
  `node_modules/pixi.js/skills/pixijs-environments/SKILL.md`), not a reason to relax the CSP.
  `src/canvas/Engine.ts` imports `'pixi.js/unsafe-eval'` before any renderer code — despite the
  name, it *removes* the need for eval rather than enabling it.

### Bugs found and fixed by end-to-end testing in Chromium (Playwright)
Before shipping M0's app shell, `pnpm build && pnpm preview` was actually driven with Playwright
(screenshots + a real pointer/keyboard smoke test), which caught three real bugs that `tsc`,
ESLint and Vitest couldn't:
- **`src/design/components/components.css` was never imported.** Every component in `/design`
  rendered with no color at all (default browser button grey) even though the CSS file itself
  was correct — `src/design/global.css` only imported `tokens.css`. Fixed by importing
  `components/components.css` from `global.css`.
- **Unstyled `<button>` elements kept native browser chrome.** Related to the above: because
  `.ds-button`/`.ds-icon-button` etc. weren't loading, buttons fell back to the platform's native
  `appearance: auto` rendering, which can paint over an author `background-color`. Added a
  `button { appearance: none; background: none; border: none; cursor: pointer; }` reset to
  `global.css` so this can't silently regress again even if a class fails to apply.
- **The Pixi canvas swallowed every click on the UI chrome above it.** `Engine.mount` gives the
  canvas an explicit `z-index: 1` (to sit above the CSS dot grid), but its container
  (`CanvasView`'s wrapper `<div>`) had no `z-index` of its own — which meant that `z-index: 1`
  wasn't scoped to the canvas's local stacking context and instead competed directly with the
  Shell's absolutely-positioned overlays (dock, panels, settings button…), which all used
  `z-index: auto`. An explicit `z-index` always wins over `auto`, so the transparent canvas was
  hit-testing *above* the dock and toolbar, silently eating every click (Playwright's own error
  said as much: `"<canvas> intercepts pointer events"`). Fixed by giving `CanvasView`'s wrapper
  its own `z-index: 0` (so it owns a stacking context that contains the canvas) and giving every
  Shell overlay an explicit `z-index: 1`.

These three are exactly the kind of bug that only shows up when the app is actually opened in a
browser, which is why `pnpm e2e` now includes a real interaction smoke test
(`tests/e2e/app-shell.spec.ts`) rather than only checking that the page renders.

### Browser dev backend
`sql.js` + IndexedDB persistence (debounced) implements `BrowserPlatform`, running the same
migrator and SQL as `TauriPlatform`. `net.linkMeta` returns a stub and `media.importPaths` is
unsupported in the browser build, as specified.

---

## M1: Library & map (images)

### Tauri command permissions (ACL) — a real gap found this milestone
M0's `capabilities/default.json` only listed plugin permissions (`core:default`, `dialog:default`,
…) on the assumption that our own `#[tauri::command]` functions — registered directly via
`invoke_handler`, not through a plugin — would be callable without an explicit permission entry.
That assumption was **wrong** and was flagged as unverified in the M0 decision log.

Verified this milestone by reading Tauri 2.12's own source
(`tauri-build`'s `acl.rs`/`tauri-utils`'s `acl/resolved.rs`, vendored under
`~/.cargo/registry/src/…`): app-defined commands *do* go through the same ACL as plugin
commands once the app has any ACL manifest at all (`has_app_acl`), and each one needs an
autogenerated `allow-<command-with-dashes>` permission (underscores in the Rust fn name become
dashes in the permission id — `library_create` → `allow-library-create`). Without this, every
`invoke()` call to our own commands would have been silently rejected at runtime on Windows —
something no amount of `cargo check`/`cargo clippy` in this sandbox could have caught, since the
ACL is only enforced by the running webview, and this container has no display to actually launch
the app.

Fixed by:
- `src-tauri/build.rs`: declares every app command in an `APP_COMMANDS` list, passed to
  `tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(...))`.
- `src-tauri/capabilities/default.json`: grants the corresponding `allow-<dashed-name>`
  permission for each one.
- Confirmed (not just assumed) by inspecting the build's generated
  `src-tauri/gen/schemas/acl-manifests.json` and `capabilities.json`, which show the `__app-acl__`
  manifest and the resolved `allow-library-create` permission actually present after
  `cargo build`.

**Keep `build.rs`'s `APP_COMMANDS` and `capabilities/default.json`'s `allow-*` list in sync** —
add both entries whenever a new `#[tauri::command]` is added. This is the kind of thing that
compiles fine and then does nothing on the owner's PC, so it's worth a Windows owner check the
first time a *new* command type (not just a new command) is added — e.g. the first command that
touches the network in M5.

---

### Browser dev CSP: `connect-src` needs `blob:` for ingest — real gap, caught by a Playwright smoke test
`IngestQueue.dispatch` (§4.7) fetches an item's original bytes by URL and hands them to the ingest
worker — the same code path for both backends. In Tauri that URL is `http://media.localhost/…`,
already allowed by `connect-src`. In the browser dev backend (`BrowserPlatform`, no custom
protocol handler) it's a `blob:` object URL, and `connect-src` didn't allow `blob:` — every
`fetch()` of an original was silently rejected by the CSP, so ingest (thumbnails, palette, pHash)
never ran for any imported/seeded image in the browser build. This was invisible to
lint/typecheck/unit tests (jsdom doesn't enforce CSP) and only surfaced running the seeded demo
library in real Chromium and reading the console.

Fixed by adding `blob:` to `connect-src` in `vite.config.ts`'s `csp()` only — `src-tauri/tauri.conf.json`'s
CSP (the one that ships) is untouched, since `TauriPlatform` never produces a `blob:` URL here.
`blob:` objects are local, in-memory, same-origin — allowing `fetch()` on them doesn't reopen the
"no background network" guarantee (§Non-negotiables), it only lets the page read data it already
created via `URL.createObjectURL`.

Added `tests/e2e/smoke-m1.spec.ts` as a standing regression check: loads `/?seed=demo`, waits for
ingest to settle, and fails on any console/page error — this is what caught the bug above.

---

### Import entry points (Files…/Folder…/paste/drop): what landed and what's deferred
Built Files…/Folder… (Ctrl+O, native dialogs on Tauri, `<input type="file">` on the browser dev
build), drag-and-drop of files, and paste of image data/files onto the canvas, all going through
one orchestrator (`src/features/import/importItems.ts`) that dedupes by SHA-256 before ever
copying a file, writes the item + placement rows, places single drops at the cursor and several
as a justified-row grid (reusing `lib/packing.ts` from M1-1), enqueues ingest, and lands the whole
batch as one selected, one-undo-step addition (`createAddItemsCommand`, itself built from
`createTrashCommand` run in the other direction). The import progress card, the folder-import
confirmation ("Add N files? (M unsupported will be skipped)" — added `media_list_folder` to Rust,
walking the folder recursively for supported extensions), and exact-duplicate detection with
"Show"/"Restore" toasts (`createRestoreItemCommand`, which re-reads the row from the DB rather
than the store, since a trashed item isn't loaded into it) are all wired and covered by both unit
tests (`importItems.test.ts`) and a Playwright run against the real seeded app (drag-and-drop and
the Files… dialog each produced a rendered, selected card with zero console errors).

**Deferred, logged rather than guessed at:**
- **Image URLs** (a website-dragged image, a pasted URL, a dropped link) — `TauriPlatform.media.importUrl`
  and `.net.linkMeta` already call `net_download_image`/`net_link_meta`, but neither Rust command
  exists yet (verified: no `net.rs`, nothing registered in `lib.rs`). Wiring the frontend for URLs
  Rust can't yet fetch would just be dead code, so §2.3's drag/paste handlers only look at
  `DataTransfer`/`ClipboardData` files for now. Real network import is its own milestone concern
  (net access is owner-gated and offline-aware per the non-negotiables) — tracked as a gap, not
  silently dropped.
- **Near-duplicate detection** (pHash ≤ 6, the ⚠ badge and comparison view) — `lib/phash.ts` exists
  and is unit-tested (M1-1), but nothing computes or compares it against existing items at import
  time yet. Left for the same pass that builds the comparison UI, since a badge with no click
  target isn't useful on its own.
- **Tidy up** and the **near-duplicate** parts of the plan's "Placement"/"Duplicates" checklist
  lines are why those boxes stay unchecked even though the rest of each line landed.

`useToastStore`/`<Toast>` also changed shape this pass: `onUndo` (hardcoded "Undo" label) became
`onAction`/`actionLabel`, since the duplicate-detection toasts need "Show"/"Restore" instead. The
one existing caller (`useCanvasShortcuts`'s Trash toast) was updated; `<ToastHost>` (rendering the
toast stack) didn't exist before this pass either — it's now mounted in `Shell.tsx`, ahead of its
nominal M1-9 slot, since the import flow needed working toasts to verify against.

Two more Playwright checks joined `smoke-m1.spec.ts`: `smoke-m1-import.spec.ts` (opens + Add →
Files…, picks a fixture image, confirms it lands selected on the canvas) and `smoke-m1-drop.spec.ts`
(synthesizes a `DragEvent`/`DataTransfer`, checks the "Drop to add" overlay appears, then confirms
the drop imports). Both ran clean against the real seeded app with zero console errors.

### Context menu, minimap, zoom menu, fly-to
Built on top of engine machinery M1-5 already had in place (`Engine.on('contextmenu', …)` already
selected the right-clicked item and suppressed the WebView's own menu; `Camera.flyTo` already
eased to a rect). Added:
- `Camera.flyToZoom`/`setPosition` (zoom-only and position-only camera moves, both reusing the
  same `animateTo` the old `flyTo` was refactored to share) and `Engine.zoomToFit`/`zoomToSelection`/
  `zoomTo100`/`zoomStep`, wired to the dock's new `<ZoomMenu>` and to Ctrl+=/Ctrl+−/Shift+1/Shift+2/
  Shift+0 in `useCanvasShortcuts`.
- `<Minimap>`: every placement as a dot plus the viewport rectangle, in a `<div>` (not a second
  Pixi canvas — no LOD/culling concerns at this scale, and it keeps the minimap trivially testable
  and CSP-simple). Click/drag calls the new `Engine.panTo` (instant, no easing, since a drag needs
  to track the pointer 1:1). It was already toggle-wired (`M`, `minimapOpen` in `uiStore`, default
  **on**) since M0 — this pass only replaced the empty placeholder panel with real content.
- `<ContextMenu>`, right-click on an item: Copy image, Show in Explorer, Bring to front, Send to
  back, Move to Trash. The plan's full list (§2.4) also has Open, Add to board ›, Connect to…,
  Find similar, Copy palette, Set cover, Back to Inbox — all deferred, since each needs a feature
  M1 doesn't have yet (Focus view lands in M1-8; Boards in M4; Connections in M3; the Details panel
  and its palette swatches in M2; video/PDF cover frames in M5; the Inbox rule in M2). Showing them
  as dead buttons would be worse than leaving them out; they get added alongside the feature that
  backs each one. "Show in Explorer" itself is disabled (not hidden) on the browser dev build,
  since `media.reveal` has no meaning there.
- `Platform.clipboard` gained `writeImage(bytes, mime)` for "Copy image" — Tauri via
  `Image.fromBytes` + the clipboard-manager plugin's `writeImage`; browser via re-encoding to PNG
  on a canvas before `navigator.clipboard.write`, since `ClipboardItem`'s source-mime-type support
  is inconsistent across browsers but PNG always works.
- `Camera.state` used to allocate a new `{x,y,zoom}` object on every read; the zoom menu and
  minimap both need to re-render on camera changes via `useSyncExternalStore`, which requires
  `getSnapshot` to return a stable reference when nothing changed (React warns/loops otherwise).
  Fixed by caching the snapshot and only replacing it inside `notify()` — a strict improvement
  for any other `.state` reader too, not just these two.

Verified with new `Camera.test.ts` cases (`setPosition`, `flyToZoom` clamping, `.state` reference
stability) and a new Playwright check (`smoke-m1-canvas-ui.spec.ts`) that opens the zoom menu,
clicks "Zoom to fit" against the 60-item seeded library and confirms the percentage actually
changed, confirms the minimap renders, and right-clicks an item to confirm the context menu opens
with "Show in Explorer" correctly disabled — all with zero console errors.

### Trash and Focus view for images
**Trash.** Soft delete already existed (`createTrashCommand`, M1-2/M1-5). This pass added the
rest: `deleteForever`/`purgeExpiredTrash` (`features/trash/trashActions.ts`) — permanently remove
the original file, its cached `t128`/`t512` derivatives, and the item/placement rows, with no
undo (the Recycle Bin is the safety net, per CLAUDE.md's non-negotiables), and an automatic sweep
of anything trashed more than 30 days ago, run once at startup. A `<TrashSection>` (list, Restore,
Delete forever, Empty now) now fills Settings → Library — ahead of that section's nominal M1-9
slot, same reasoning as `<ToastHost>` in M1-6: Trash needed a way to actually look at what it did.
`createRestoreItemCommand` (added in M1-6 for the duplicate-detection "Restore" toast) is reused
here unchanged.

Two platform gaps got fixed along the way, both real (not just needed for this feature):
- `Platform.cache` had no `delete`. The Rust `cache_delete` command has existed since M1-3 but was
  never wired into the TS interface — nothing had needed to purge a cache entry yet. Added
  `cache.delete(keys)` to the interface and both platforms (Tauri: one `cache_delete` invoke per
  key, since the Rust command takes a single prefix, not a list; browser: `idbDelete`, new in
  `idbStore.ts`, since the store never had a delete path either).
- `BrowserPlatform.media.purge` was `notSupported('media.purge')` — meaning "Delete forever" and
  "Empty now" would throw in the browser dev build with no way to develop or screenshot-test them.
  There's no Recycle Bin in a browser tab, so it just deletes the IndexedDB blob outright
  (permanent, unlike the real Windows build's `trash::delete_all`) — acceptable since it's a dev
  build and the Trash UI already warns "This can't be undone" before calling it.

**Focus view.** `Engine`'s `dblclick` event already existed (M1-5) but nothing listened to it.
Added `useFocusStore` (which item, if any), `useFocusViewBinding` (wires the engine event to it),
Enter as the keyboard trigger alongside double-click, and `<FocusView>`: a full-window scrim with
the original image centered, ←/→ through the currently loaded items, Esc/× to close, and a
`viewed_at` write on open (Rediscover, M2, will use it).

Deferred, per §2.12's full spec:
- **Zoom/pan and fit-vs-1:1** — the image is always letterboxed to fit the window. A real deep-zoom
  view needs `t1600`-on-demand generation, which M1-5's Engine decision log already deferred.
- **The collapsible Details column** — those fields (Type, Vibe, palette, Why I saved this…) don't
  exist anywhere yet; the whole classification panel is M2.
- **"List order, otherwise current results, newest first"** for ←/→ — there's no List panel or
  sort yet (M2), so navigation just walks the loaded item order. Revisit once sorting exists.

Verified with new `trashActions.test.ts` (6 cases: the query shape, purging files+cache+rows
together, the empty-list and missing-file_path no-ops, and the 30-day cutoff) and a new Playwright
check (`smoke-m1-trash-focus.spec.ts`): double-click opens Focus view and Esc closes it, Delete
shows the Trash toast, Settings → Library → Trash lists the item with a thumbnail, and Restore
empties it again — zero console errors throughout.

### Empty state, Settings → Canvas, Settings → Library (closing out M1)
**Empty state.** It was rendering inside the right List panel (an M0 placeholder), not centered
on the canvas the way §2.14 actually specifies ("a soft centered card"). Moved it there, gated on
`useLibraryStore`'s item count (and off during `?bench=…`), with its "+ Add" button wired to
actually open the dock's add menu rather than doing nothing. That needed lifting the menu's open
state out of `<AddMenu>` into a new tiny `useAddMenuStore` — the same one-purpose-store pattern as
`importStore`/`toastStore`/`focusStore` — so a button elsewhere on the page can open it too. The
List panel's own placeholder now says plainly that it lands with search/classification in M2,
instead of duplicating the canvas empty-state card.

**Settings → Canvas.** Wheel mode (Zoom/Pan) and reduce-motion had store fields since M0
(`useUiStore`) but neither was ever read by anything real: `wheelMode` had no UI to change it, and
`prefersReducedMotion()` (M1-7) only ever checked the OS media query, ignoring the store entirely.
Both are real gaps, now fixed — `reduceMotion` became a proper `'system' | 'on' | 'off'` (was a
dead boolean) and `prefersReducedMotion()` consults it first. Dot grid density (Fine/Normal/Wide)
didn't exist as a concept at all; added `dotGridDensity` to the store and a multiplier in
`DotGrid.tsx`, layered on top of the automatic zoom-based subdivision that was already there.
Minimap on/off already worked (`M`, M1-7) — this pass just gave it a `<Toggle>` alongside the rest.

**Settings → Library.** Trash landed in M1-8. This pass added the remaining three: location
(already shown in About; shown again here per §2.14's list), recent libraries and "Open or create
another library…" (Tauri only — opens a folder, calls `library.open`, then `window.location.reload()`,
since a live library swap would mean tearing down every store, the engine and the undo history;
a clean reboot through `App.tsx`'s existing boot path is simpler and was already exercised by the
M0 startup flow), and backups (Back up now, a list with Restore, same reload-after-restore
reasoning). All three are no-ops with an explanatory note on the browser dev build, which has no
filesystem-backed libraries to switch between.

Verified with a new Playwright check (`smoke-m1-settings-empty.spec.ts`): the empty state shows on
a fresh library and its + Add opens the menu, every Canvas control actually flips (screenshotted
mid-change), and Library shows the browser note plus a working Trash — zero console errors.

### Automatic backups with rotation (closing the last M1 checklist gap)
Settings → Library's "Back up now" button (this milestone, above) called the Rust `backup_now`
command, which already rotates on every call (`rotate_backups`, M0) — but nothing ever triggered a
backup *automatically*. §5.4 specifies "at startup if the last one is older than 24 h, and at quit
if anything changed." Added the startup half (`features/backups/autoBackup.ts`,
`maybeBackupAtStartup`): lists existing backups, and if the newest is missing or older than 24h,
calls `backups.now()` — best-effort, a failure just logs rather than blocking startup. Wired into
`App.tsx`'s Tauri boot path (a no-op on the browser build, which has no real backups).

The quit-time half ("at quit if anything changed") is deferred: it needs a window-close hook
(`tauri::WindowEvent::CloseRequested`, or the `beforeunload`-equivalent) and dirty-tracking that
doesn't exist yet (nothing currently records "has anything changed since the last backup"). Logged
here rather than guessed at; cheap to add once a real need for it shows up (e.g. an owner losing
work between a startup backup and a crash later the same day).

Verified with 5 new unit tests (`autoBackup.test.ts`): the browser no-op, backing up when there's
no prior backup, backing up when the newest is stale, skipping when it's fresh, and not throwing
if the backup itself fails.

### M1-10: final verification
Full pass, all clean: `pnpm lint`, `pnpm typecheck`, `pnpm test` (111 tests across 18 files),
`cargo test --workspace` (32 tests), `cargo clippy --all-targets`, `cargo fmt --check`, and the
complete Playwright suite (12 tests: the 6 M0 `app-shell.spec.ts` checks plus this milestone's 6
`smoke-m1*.spec.ts` files) run together against a single build with zero console errors and no
interference between tests. M1's checklist is now fully ticked.

**What this sandbox cannot verify** (no Windows, no GPU, no real OS drag-and-drop source) — these
are the M1 **Owner checks** the plan calls for, still outstanding on the owner's PC:
- Drag an image from a real browser tab and from File Explorer onto the canvas, and paste a
  screenshot with Ctrl+V — S2's spike confirmed the plumbing (`dragDropEnabled: false`) but not a
  real OS-level drag source, which only Windows has.
- Import a real folder of images (the "500 mixed images" acceptance line, and real photos'
  actual color/perceptual-hash behavior rather than synthetic PNGs).
- Close and reopen the app, and check the backups folder for the automatic backup that should now
  be sitting there.
- `?bench=10000`'s real p95 frame time — this container has no GPU, so the culling/LOD skeleton
  (S1) is only exercised structurally, never actually timed.

---

## M2: Classify, search, list, Inbox

### Vocabulary seeding + the term/item-term store
Seeded Type/Vibe/Movement from Appendix A (`src/lib/vocabulary.ts`, plain data) via
`seedVocabulary` (`src/state/vocabularySeed.ts`) — idempotent like `seedDemoLibrary` (checks
`COUNT(*) FROM terms` first), one `db.batch` insert, sort index restarting at 0 per facet (§2.5:
reordering "sets the number keys in Triage", which are per-facet — Type's 1-9, not a global
ordering across all three vocabularies). Tags start empty, per plan. Wired into both boot paths in
`App.tsx` and into `Onboarding.tsx`'s `createLibrary()` (a fresh library via first-run also needs
seeding before the vocabulary is used, not just the two "recent library" paths).

Added `useTermStore` (`src/state/termStore.ts`) alongside `useLibraryStore`: terms are
library-wide, not per-space, and the vocabulary manager and Details panel both need to read/write
them independently of the current selection, so it's a separate store rather than folded into
`libraryStore`. `itemTerms` is `Map<itemId, Set<termId>>` for O(1) per-item lookups; `item_terms`
rows aren't filtered by `deleted_at` on load (§ analogous to placements in M1: a trashed item's
terms stay assigned so a restore doesn't lose them).

`loadVocabulary` (`src/state/loadVocabulary.ts`) mirrors `loadLibraryItems`'s shape and is called
alongside it at startup.

Verified with new unit tests: `vocabularySeed.test.ts` (idempotency, exact starter counts per
facet — 21/24/31 — per-facet sort restarting at 0, and that a hinted value like Memphis carries
its `aiHint` while an unhinted one like Bauhaus is `null`), `termStore.test.ts` (load indexing,
add/remove-item-term isolation, cascade-delete scrubbing a removed term from every item,
per-facet filtering), and `rowMapping.test.ts` additions for `rowToTerm`/`rowToItemTerm`. Also ran
the full M1 Playwright suite again (all 6 still green) to confirm the new startup calls don't
throw or slow anything down.

### Vocabulary manager (Settings → Vocabularies)
Added `src/commands/vocabularyCommands.ts`: rename, set-AI-hint, delete, merge and reorder, each
an undoable `Command` following the same snapshot-then-apply shape as `itemCommands.ts`.

**Merge** was the one with real undo complexity — "items move to the target value" (§2.5) has to
handle an item that already carries *both* the source and target term (rare, but real: nothing
stops the owner classifying an item as both "Dreamy" and "Reveur" before merging them). The
command snapshots which items had the source (`S`) and which already had the target (`T`) before
touching anything; only `S \ T` gets repointed to the target (an item already in `T` just loses
its source row, since it's already tagged with the target). Undo removes exactly the repointed
links (`S \ T` from the target), restores the source term row, and re-links `S` to the source —
so an item that had both `S` and `T` before the merge still has both after an undo, not just one.
Covered by a dedicated test case (`createMergeTermsCommand`, the "already has both" scenario).

**Reorder** takes a full ordered id list for one facet and sets `sort` to each id's index — the
vocabulary manager's own up/down buttons build that list (swap two adjacent ids), rather than a
drag-and-drop library; simpler and fully keyboard-reachable, and this is what the plan actually
requires ("reorder... sets the number keys in Triage" — order, not drag interaction specifically).

`<VocabularySection>` (`src/features/settings/`) fills the Settings → Vocabularies nav item: a
facet tab strip (Type/Vibe/Movement/Tags) and, per term, a two-line row (name + up/down + Delete,
then AI hint + a same-facet "Merge into…" picker). The first layout attempt was a single flex row
with fixed `minWidth`s per field, which overflowed the Settings dialog's `560px` max-width (a
Playwright screenshot caught it — the row's own content pushed past the dialog edge into the
canvas behind it). Fixed by stacking into two lines and switching every field to `minWidth: 0`
(lets flex children actually shrink instead of forcing overflow) — a good reminder that a
component that type-checks and renders in isolation can still break its container's own layout
constraints, only visible by actually looking at it.

Verified with 5 new unit tests for the commands (rename/hint round-trip, delete+undo, the merge
edge case above, reorder+undo) and a new Playwright check (`smoke-m2-vocabulary.spec.ts`): opens
Settings → Vocabularies, confirms the 21 starter Types and the AI-hinted Movement entries render,
renames a value, reorders one, and deletes one — zero console errors, and the post-fix screenshot
confirms the layout now stays inside the dialog.

---

### Details panel — single item (M2-3)
Added `src/commands/itemTermCommands.ts` for the item↔term side of classification:
`createSetItemTypeCommand` (single-choice, replaces any existing Type link),
`createAddItemTermCommand`/`createRemoveItemTermCommand` (multi-select, for Vibe/Movement/Tags),
built on `findOrCreateTerm` (case/accent-insensitive reuse via the existing `normalize()` helper,
so typing "dreamy" when "Dreamy" already exists reuses it rather than creating a duplicate) and
`removeTermIfOrphaned` (undoing a just-created term only deletes it if no other item picked it up
in the meantime — undo shouldn't destroy a term another edit started depending on).

**Inbox rule** (§2.5, "setting a Type or a Vibe marks it sorted") is folded directly into these
two commands' `do`/`undo` rather than run as a separate pass: `markSortedIfNeeded` records whether
the item was already sorted before touching `sorted_at`, so undo only clears it if this command is
what set it.

**Real gap found via `pnpm typecheck`**: `Item` had no field at all backing §2.5's editable
"Source" URL — `rowToItem` never mapped `source_url`, and nothing referenced it. Added
`sourceUrl: string | null` to `Item`, mapped it in `rowToItem`, and fixed the four call sites that
build `Item` objects by hand (`importItems.ts`'s `createRow`, two test fixtures, `rowMapping.test.ts`).

`<DetailsPanel>` (`src/features/details/`) covers every §2.5/§2.6 field for a single selected
item: inline title edit, up-to-8 most-used Type chips (usage counted across all items) with a
"More…" toggle for the rest, `<ChipInput>` for Vibe/Movement/Tags with autocomplete from the
vocabulary, palette swatches, Artist/Source/Why fields, a Favorite toggle, and an Info section
(kind, date, dimensions, file size, path, "Show in Explorer"). `Shell.tsx` now switches the right
panel to Details automatically on a single-item canvas selection (§2.9) and renders it in place of
the List panel's "coming soon" placeholder.

**Real bug caught by the Playwright check, not by lint/typecheck/unit tests**: `usageCounts` was
computed with `useTermStore((s) => { ...build a new Map...; return counts })` — a fresh `Map`
object on every call. Zustand's selector equality is `Object.is`, so a new object every render
looks like a change every render, which re-renders, which calls the selector again — an infinite
loop that crashed React (minified error #185) the instant an item got selected. Fixed by pulling
the stable `itemTerms` map out with a plain selector and doing the counting in a `useMemo` keyed
on it. None of `lint`/`typecheck`/`vitest` catch this class of bug (the component renders fine in
a unit test with a single render pass) — only running the real app and driving a selection turned
it up, which is why the Playwright check against the seeded demo library stays part of every
milestone's verification, not just a visual smoke test.

**Deferred, per the plan's own milestone split**: AI suggestion ghost chips (needs the AI worker,
M6), "Search this color" from a swatch (needs the search bar, M2-7), and Boards/My
connections/Find similar (M3–M4/M6). The combined plan checklist line for the Details panel stays
unchecked until bulk edit (M2-4) also lands, since it's one line covering both.

Verified with unit tests for `itemTermCommands.ts` (type set/replace, add/remove with orphan
cleanup, Inbox-rule marking) and `formatBytes.ts`, plus a new Playwright check
(`smoke-m2-details.spec.ts`): selects a seeded item, confirms the panel auto-switches to Details,
sets a Type via chip click, adds a Vibe via the chip input, toggles Favorite — zero console errors,
screenshots confirm the layout.

---

### Details panel — bulk edit + Inbox rule (M2-4)
`<BulkDetailsPanel>` (`src/features/details/`) is the "several items selected" half of §2.6, kept
as its own component rather than folding every branch into `DetailsPanel.tsx` — "mixed" state and
union-with-counts don't apply to a single item, and a single component covering both would mostly
be `if (items.length > 1)` scattered through every field. `Shell.tsx` picks between them by
selection size and renders the mini-collage + "N items" header, Type set-for-all (highlighting only
when every selected item shares the same Type, "Mixed" otherwise), Vibe/Movement/Tags as a union
with per-value counts ("Dreamy 5/8" — clicking the chip applies it to every item that doesn't
already have it, × removes it from every item that does), Artist/Favorite set-for-all, and Move to
Trash.

New commands in `itemTermCommands.ts` (`createBulkSetTypeCommand`, `createBulkAddTermCommand`,
`createBulkRemoveTermCommand`) and `itemCommands.ts` (`createBulkSetItemFieldCommand`) apply to a
whole item-id list as one undo step. The trickiest part is exactly what §2.6 asks for and what the
single-item commands already do per-item: **only** touch what actually changes. `createBulkAddTermCommand`
snapshots which items already had the term before linking, so undo un-links only the ones the
command itself added — an item that already carried "Dreamy" keeps it, both after the bulk add and
after undoing it. `createBulkRemoveTermCommand` mirrors this by only touching items that actually
had the term. `createBulkSetTypeCommand` snapshots each item's previous Type term(s) and prior
`sorted_at` individually, so undo restores each item to its own prior state, not a shared one
(covered by a test with one already-sorted item mixed into the batch).

**Inbox rule, made real**: `Shell.tsx`'s Inbox chip count was a hardcoded `useState(0)` since M1 —
now computed from `items` (`!deletedAt && !sortedAt`), live off the same store the commands already
update. Added `createBackToInboxCommand(platform, itemIds)` (clears `sorted_at`, snapshotting each
item's previous value for undo) and wired it into the canvas context menu's "Back to Inbox" entry,
which was listed as deferred in the M1 `ContextMenu.tsx` comment — no longer true, since the Details
panel it depended on now exists.

Verified with unit tests for all four new bulk/Inbox commands (including the "one item already had
it" / "one item was already sorted" edge cases) and a new Playwright check
(`smoke-m2-bulk-details.spec.ts`): selects every seeded item with Ctrl+A, confirms the "N items"
header and mini-collage render, sets a bulk Type and confirms the Inbox chip disappears (every item
now sorted), then uses the context menu's Back to Inbox and confirms the chip's count returns to
its starting value — zero console errors. (The canvas hit-testing in this headless environment
doesn't render item textures — a `t128`/`t512` blob-cache miss on every load, harmless and already
logged as a console *warning* the earlier smoke tests already tolerate — so the test drives
selection through Ctrl+A/shift-click rather than guessing screen coordinates for a second item.)

**Deferred, same reasons as M2-3**: "Add to board" / "New board from selection" need Boards (M3),
and "Tidy up" isn't implemented anywhere yet (referenced only in a `packing.ts` doc comment as a
future consumer) — both stay off the bulk actions list rather than being wired to nothing.

---

### Triage full-screen overlay (M2-5)
`useTriageStore` (`src/state/`) holds a **snapshot** of the Inbox's item ids taken the moment the
Inbox chip opens Triage — not a live-filtered view — so the header's "N of M" denominator stays
fixed while working through it (a live view would shrink out from under the owner every time an
item got classified, since classifying is exactly what removes it from the Inbox). `index` is a
plain cursor into that snapshot; `next`/`prev` clamp it to `[0, order.length]`, where
`index === order.length` is the "Inbox zero" end state. `toggleOrder` (oldest/newest) just reverses
the snapshot array and re-points the index at its mirror position, rather than re-touching the
library store — it's already sorted, reversing it is the other sort.

`<TriageView>` (`src/features/triage/`) is a full-screen overlay in the same style as `FocusView`:
left ~60% large preview, right ~40% the classification fields (Type chips numbered 1–9 for the
keyboard shortcut, Vibe/Movement/Tags chip inputs, Favorite). Number keys set Type, `V`/`M`/`T`
focus the matching chip input (via a container `ref` + `querySelector('input')`, since `ChipInput`
doesn't forward a ref itself — simpler than widening its public props for one caller), `S` toggles
Favorite, `Enter`/`→` advance, `←` goes back, `Esc` exits. `A` ("accept all AI suggestions") is
registered as a documented no-op: there are no AI suggestions to accept until the AI worker lands
in M6, and the key exists in the spec's table today, so it's better to have it do nothing than to
not exist.

**Real bug, caught by the Playwright check, not by unit tests**: the global keydown handler
originally read `document.activeElement` to decide "is the owner typing in a field, so let
`ChipInput` own this keystroke instead of firing a Triage shortcut." That worked for `Enter`, but
not `Escape` — `ChipInput`'s own `Escape` handler calls `blur()` *synchronously inside its keydown
handler*, so by the time our `window`-level listener ran (later in the same event's bubble phase),
`document.activeElement` had already changed to something that no longer looked like "typing,"
and the same keystroke both left the field *and* closed all of Triage. Fixed by reading `e.target`
instead, which is fixed for the lifetime of one event dispatch regardless of what its handlers do
to focus. Caught visually too: an early version of the overlay used a `background` of
`var(--surface-0)`, a token that doesn't exist in `tokens.css` (`--surface-1` is the panel
surface; there's no "0"), so the overlay was fully transparent and the Shell's own Inbox
chip/right panel showed straight through it in the first screenshot — fixed to `var(--canvas)`,
the same solid backdrop the map itself uses.

**Deferred, matching kind support elsewhere in M2**: video (muted autoplay), PDF (cover + page
picker) and link (cover + title) previews — every item is `kind: 'image'` until those importers
land in later milestones, so the preview pane only ever needs to handle images for now. AI ghost
suggestion chips are M6, same as the Details panel.

Verified with unit tests for `triageStore` (open/next/prev clamping, `toggleOrder`'s reversal and
re-pointing, close) and a new Playwright check (`smoke-m2-triage.spec.ts`): opens Triage from the
Inbox chip, sets a Type with a number key, focuses Vibe with `V` and adds a value with `Enter`
(confirming the field's own `Enter` doesn't also advance Triage), leaves the field with `Escape`
(confirming Triage itself doesn't close), advances with `Enter`, `→`/`←` skip and go back, and
`Esc` exits back to the map — zero console errors, and the fixed screenshot confirms the overlay
now fully covers the app behind it.

---

### Search engine (M2-6)
`src/lib/search.ts` implements §4.8 as a pure library layer — no UI yet (that's M2-7's search
bar), so nothing in the plan's checklist gets ticked by this task alone; "search bar" is one
combined checklist item covering both.

**Text index**: a `MiniSearch` instance over `title`, `termNames` (space-joined vocabulary names
for whatever terms an item carries), `artist`, `sourceDomain` (parsed from `sourceUrl`, only
populated once links exist), `why` and `fileName`, with `termNames` boosted ×3 and `title` ×2 per
the plan's exact numbers. Tokens run through the existing `normalize()` helper (already built for
term-name matching in M2-1) so free text and vocabulary names share one accent/case-insensitive
rule instead of two similar-but-different ones. `prefix` and `fuzzy` both use MiniSearch's
per-term function form (`(term, index, terms) => …`) rather than the plain boolean — the plan's
"the **last** token is matched as a prefix" is specifically about the last token, not all of them,
and MiniSearch only supports that distinction through the function form. `bodyText`/`fontFamily`/
`linkTitle`/`linkDescription` from the plan's field list are left out of the index entirely: notes,
fonts and links don't exist as kinds until M4/M5, and `Item` has no fields for them yet.

**Facets**: `buildFacetSets()` does one pass over the live items + `itemTerms` map and returns
plain `termId/kind/colorFamily/artist → Set<itemId>` maps plus `favorite`/`inbox` sets and a
`createdAt` lookup for date-range filtering — built fresh per search call rather than maintained
incrementally. `evaluateFilter()` then does exactly what §4.8 specifies: union within a field,
intersect across fields, intersect with text results if there's a text query, then subtract the
excluded term ids last. `boards` stays in the `Filter` type (so M2-7 and M3/M4 don't need to widen
it later) but is never read by `evaluateFilter` — Boards don't exist before M3, and until then
every item lives on the one Library board.

**Incremental updates deferred**: the plan explicitly wants `MiniSearch` `replace`/`discard` plus
incremental set updates so the index doesn't get rebuilt on every keystroke. That wiring belongs
naturally in M2-7 (the search bar is the thing that would call it, hooked into the stores'
`upsertItem` etc.), not in the engine itself — for now, `buildSearchIndex`/`buildFacetSets` just
rebuild from the current store state, which a benchmark test (`search.bench.test.ts`) confirms
comfortably clears the §4.8 "≤ 30ms per keystroke at 10,000 items" budget even rebuilt from
scratch (a generous CI-safe ceiling is asserted rather than the exact 30ms, since CI hardware
varies and the point is to catch a real algorithmic regression, not chase a machine-specific
number — the tight number is meaningful on the owner's own machine).

Verified with unit tests covering text matching (case/accent-insensitivity, last-token prefix,
5+-letter fuzzy typo tolerance, term-name boosting, soft-delete exclusion), `evaluateFilter`'s
union/intersect/exclude/date-range logic, and an end-to-end `search()` test combining text with a
facet filter — plus the two-part performance benchmark above.

---

### Search bar UI + canvas Dim/Hide (M2-7)
`useSearchStore` (`src/state/`) holds the `Filter` from M2-6 plus bar-open state and the Dim/Hide
mode, with `toggleTerm(facet, id, exclude)` implementing §2.8's "click includes (OR within the
facet), Alt+click excludes" as one action — excluding a term removes it from `include` first
(and vice versa) so a value can't be both included and excluded at once. `useSearchResults()`
(`src/features/search/`) reruns `buildSearchIndex`/`search` from M2-6 through a `useMemo` keyed on
the live stores and the filter, shared by the search bar (for the "N of M" count and Frame
results) and `useSearchBinding` (feeds the same match set into the canvas), so the two never
disagree about which items matched.

**Dim/Hide required touching the canvas engine**, not just the UI: `Engine.setSearchFilter(matches,
mode)` sets per-sprite alpha (Dim: 12%) and, for Hide, folds the hidden set into `cullItems()`'s
existing visible/renderable toggle rather than setting `sprite.visible` directly from outside —
`cullItems()` runs every frame doing its own viewport-based visibility, and driving `visible`
from two places would just have them fight each other every frame. Excluded items also had to
stop being selectable: the engine's hit-testing (`hitTest`/`rectSelect`, five call sites — click,
hover, marquee, dblclick, right-click) doesn't go through Pixi's own event system at all, it's a
manual `[...cards.values()]` scan, so "dimmed items can't be clicked" (§2.8) needed a real
`interactableCards()` filter threaded through every one of those sites, not just an opacity
change.

**Filters menu** covers Type/Vibe/Movement/Tags (from the live vocabulary, click/Alt+click same as
above), Kind, Color family (swatches using the existing `--family-*` tokens), Artist (built from
the distinct `item.artist` values actually in the library, not a fixed list) and Date (quick
presets — today/7d/30d/this year — rather than a custom range picker, which the plan mentions but
doesn't specify a UI for). **Board filtering is left out of the UI entirely** — the `Filter` type
still carries `boards` from M2-6, but there's exactly one board (the Library map) until M3, so a
board picker would have nothing to pick.

**Deferred, and why**: saved filters (★) are explicitly meant to also show "at the top of the List
panel" (§2.8), which doesn't exist until M2-8 — building the save mechanism now and bolting the
List-panel half on later risked two half-features instead of one real one, so this waits. "Create
board from results" is M4 in the plan itself. Both are logged here rather than silently skipped.

Ctrl+K and `/` open the bar (added to `useGlobalShortcuts`, guarded by the same
`isTypingTarget` check already used there); Esc clears the text first and closes on a second
press, handled locally in `<SearchBar>` rather than the global handler since it only applies while
the bar is open and shouldn't compete with Triage's own Esc.

Verified with unit tests for `searchStore` (include/exclude toggling, `isFilterActive`) and a new
Playwright check (`smoke-m2-search.spec.ts`): opens with Ctrl+K, narrows the count with free text,
opens Filters and toggles the Kind chips (proving the facet path and the OR-within-a-field logic,
not just text), confirms the dock's Search button dot while a filter is active, Clear all, and Esc
closing the bar — zero console errors. A layout bug — the Filters panel had no height cap and grew
past the vocabulary's ~96 seeded values with nothing below `Kind` reachable — was caught by
looking at the screenshot, not by the check's assertions; fixed with `maxHeight`/`overflowY`.

---

### List panel (M2-8)
`src/features/list/listGrouping.ts` is the pure part (`groupItems`/`sortItems`, unit-testable
without React): an item with several values for the grouping criterion appears in each of its
groups (e.g. two Vibes → two groups), items with none land in one "No <criterion>" group sorted
last, and empty groups just never get created in the first place — no filtering pass needed
afterwards. Color grouping reuses `item.colorFamilies`, already the ≥15%-weight list computed at
ingest (M1-4); it doesn't recompute anything.

`<ListPanel>` virtualizes with `@tanstack/react-virtual`: groups are flattened into a row list
(one header row per group, then its tiles chunked into row-width-many tiles per row) and only the
rows near the viewport render, so the DOM stays small at 10,000 items regardless of tile size.
Column count comes from measuring the panel's own container width with a `ResizeObserver` rather
than a fixed constant, so the exact same component works both docked (320px) and in the "Expand"
full-window gallery — the two render modes differ only in what container Shell puts around it.

**Real bug, caught by the Playwright check**: a tile's single click selects+flies and switches the
panel to Details (§2.9) — which unmounts the List panel's tiles. That's fine for a plain click, but
it broke double-click entirely: the browser's native dblclick needs the *second* click to land on
the same element, and by the time it fires, the first click's side effect had already navigated
away and removed the tile from the DOM, so the second click hit nothing. Fixed with the standard
click/dblclick disambiguation pattern — the single-click action is delayed ~220ms behind a timer
that double-click cancels before doing its own thing (open Focus view) — rather than the spec'd
behavior only working when the owner clicks unnaturally slowly.

**A second bug, same check**: "Expand" was rendering *two* `<ListPanel>` instances at once — the
docked one (still mounted regardless of `expanded`) and the full-window overlay — so hovering a
group in one fired `engine.setHoverHighlight` from both, and Playwright's `getByLabel('Collapse')`
found two buttons. Fixed by rendering a placeholder in the docked slot instead of the real panel
while expanded, so exactly one `<ListPanel>` is ever mounted.

**Hover highlight** (§2.9 "glow... while the rest dims") reuses the same per-sprite alpha the
search Dim/Hide binding (M2-7) already owns on `Engine`, refactored into one `alphaFor(id)` that
hover-highlight takes priority over — so hovering a group previews correctly even with a search
filter active, and clearing the hover falls back to whatever the filter says rather than the two
mechanisms fighting over `sprite.alpha`. "Glow" itself (a bloom/outline effect) is simplified to
plain full-opacity-vs-dimmed, which reads the same at a glance and doesn't need a Pixi filter
pipeline this milestone doesn't otherwise use.

**"The List panel shows only the matches" (§2.8)** was missed on the first pass — the panel read
`useLibraryStore` directly with no awareness of an active search filter. Wired in afterwards via
the same `useSearchResults()` hook the search bar and canvas Dim/Hide already share, so all three
surfaces agree on the current match set.

**Deferred, same reasons as M2-7**: the `[This board | Library]` switch and drag-to-board (Boards
don't exist before M3), and saved filters at the top of the panel (M2-7 already deferred the ★ save
half of this for the same reason — nothing to show at the top of a List panel that didn't exist
yet). The plan's combined checklist line stays unchecked until saved filters land.

Verified with unit tests for `listGrouping` (multi-value membership, "No X" grouping, empty-group
suppression, color/kind/month grouping, all three sort orders) and a new Playwright check
(`smoke-m2-list.spec.ts`): grouping by Kind, collapsing a group, clicking a tile (selects + switches
to Details), double-clicking a tile (opens Focus view — the fixed bug above), and Expand/Collapse —
zero console errors, and the expanded-gallery screenshot confirms thumbnails and grid layout.

---

### Rediscover + the shortcut list overlay (M2-9)
`src/lib/rediscover.ts`'s `pickRediscoverItem` is a pure, unit-tested weighted random pick: items
not viewed (falling back to `createdAt` for one that's never been opened) for 30+ days are
eligible, and "favoring older ones" is implemented as sampling weighted by staleness duration
(days-since-seen) rather than a uniform draw among eligible items — an item untouched for a year
is far more likely to come up than one 31 days stale. `Engine.pulseItem(id)` makes the pick
visible: a ~1.4s alpha oscillation via the Pixi ticker (not the existing selection outline, which
would look identical to any other selection and defeat the point of "make it pulse"), sharing the
same `alphaFor(id)` the search Dim/Hide and hover-highlight alpha already goes through so a pulse
correctly resumes whatever alpha state applied before it started. `triggerRediscover()` wires
picking → select → fly → pulse together and shows a toast when nothing qualifies, rather than the
button silently doing nothing.

**Two real, previously-undetected bugs found and fixed while wiring this task's keyboard
shortcuts:**

1. **`useUndoRedoShortcuts` (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) was written in M1-2 and never called
   from anywhere** — the hook existed, fully correct, but no component ever invoked it. Undo/redo
   by keyboard has never worked in this app until this milestone; only the toast "Undo" buttons
   and the vocabulary manager's own affordances ever exercised the history stack. Fixed by calling
   it from `Shell.tsx` alongside the other shortcut hooks. Nothing caught this earlier because no
   test exercised the keyboard path specifically — only `history.ts` itself had unit coverage.
2. **`<Dialog>`'s Escape-to-close has never worked via a real keypress, for any dialog in the
   app, including Settings** — only clicking the backdrop closed it. Building this task's
   shortcut-list overlay on top of the shared `Dialog` component surfaced it: a Playwright check
   driving a genuine `page.keyboard.press('Escape')` failed to close the dialog, while a
   synthetic `window.dispatchEvent(new KeyboardEvent(...))` closed it fine — the giveaway that
   something in the DOM calls `stopPropagation()` on Escape's real bubble phase before it reaches
   `window`, silently swallowing every bubble-phase `window` listener downstream (nothing in this
   codebase does that explicitly; it wasn't worth chasing further once the fix below was verified
   working for both `Dialog` call sites). Fixed by listening in the **capture** phase instead
   (`addEventListener('keydown', onKeyDown, true)`), which runs before whatever swallows the
   bubble phase. Confirmed fixed for both the new shortcut overlay and — previously completely
   untested — Settings.

**Shortcut list scope**: shows only the shortcuts actually wired up (Search, Undo/Redo, tools,
Select all, Trash, Focus view, Esc, zoom, panel/minimap toggles, Favorite, Rediscover, Inbox
triage, stacking, nudge, Settings, itself) — Boards, Connections, notes, links and the Frame tool
don't exist before M3–M5, so their table rows (Ctrl+O/Ctrl+L/N, C/Shift+C, F, Shift+Delete) are
left out entirely rather than documented as dead keys, the same call `ContextMenu.tsx` already
makes for its own deferred actions.

**R / I / S are skipped while Triage is open** (checked via `useTriageStore.getState().isOpen`):
Triage already owns `S` for its own Favorite toggle on the item being triaged, and re-running
`openInboxTriage()` mid-session would silently reset its progress snapshot out from under the
owner. The Inbox chip's click and the `I` shortcut now share one `openInboxTriage()` helper so
both build the snapshot identically.

Verified with unit tests for `pickRediscoverItem` (30-day cutoff, `viewedAt`/`createdAt` fallback,
soft-delete exclusion, staleness-weighted favoring, determinism for a given `random()`) and a new
Playwright check (`smoke-m2-rediscover.spec.ts`): Rediscover's "nothing yet" toast against the
freshly-seeded demo library (every item is far newer than 30 days, so this is the correct, honest
result — the weighted-pick math itself is what the unit tests exercise), the shortcut list opening
via `?` and closing via Escape (the fixed bug), and Ctrl+Z/Ctrl+Shift+Z actually undoing/redoing a
Favorite toggle (the other fixed bug) — zero console errors.

---

### M2 wrap-up → v0.1.0
Final verification matching CI exactly: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
`pnpm test` (180 unit tests across 29 files), `pnpm build`, `pnpm e2e` (19 Playwright checks
against the seeded demo library, one per M1/M2 feature), and on the Rust side `cargo fmt --check`,
`cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` — all green.

**What shipped this milestone**: seeded vocabularies + the vocabulary manager; the single-item and
bulk Details panel covering every §2.5 field; the Inbox rule, Inbox chip and Triage with its full
keyboard flow; a MiniSearch-backed search engine with facet filters, wired into a search bar and
the canvas's Dim/Hide; a virtualized, groupable, sortable List panel with a full-window gallery
mode; and Rediscover plus the shortcut list overlay. Two real, previously-shipped bugs were also
found and fixed along the way (logged under M2-3 and M2-9): a Zustand-selector infinite-render
crash in the Details panel, and — more significantly — keyboard undo/redo having silently never
worked since M1-2, and every `<Dialog>`'s Escape-to-close never having worked via a real keypress
since it shipped.

**Deliberately still open, logged rather than silently dropped**: saved filters (★, meant to also
surface at the top of the List panel — both search and list deferred their half of this for the
same reason), the `[This board | Library]` switch and drag-to-board (Boards land in M3), "by
meaning" visual search results and AI suggestion ghost chips (M6), and "Create board from results"
(explicitly M4 in the plan itself). None of these are wired to dead buttons in the shipped UI —
each is either absent from the interface entirely or, where the interface exists (search's ★
button doesn't exist yet at all), simply not built.

**Milestone acceptance** (plan §8, M2): the search-facet-filter logic has unit test coverage
(`search.test.ts`, `searchStore.test.ts`); a bulk edit is one undo step regardless of item count,
by construction (`createBulkSetTypeCommand` et al. are each a single `Command`, not N commands);
Triage's full keyboard flow is exercised end-to-end by `smoke-m2-triage.spec.ts`; and the search
engine's own benchmark (`search.bench.test.ts`) clears the performance budget with real margin at
10,000 items.

Tagged `v0.1.0`.

---

## M3: Connections & Constellations

### Manual connections storage + Tidy up (M3-1)
`manual_connections` was already scaffolded in `001_init.sql` back in M0 (`from_id`/`to_id`/
`label`, `UNIQUE (from_id, to_id)`), so this task only added the application layer: a
`ManualConnection` type, `rowToManualConnection`, and `useManualConnectionsStore` — library-wide
like `termStore` (the plan: "connections are stored globally, so they show wherever both items
are"), indexed by both endpoints for O(1) "every connection touching this item" lookups (the
Details panel's "My connections" list and hover scoring in M3-2 both need exactly that). Loaded
at startup alongside vocabulary, not in `Onboarding.tsx`'s fresh-library path — a brand-new
library has zero connections by construction, so there's nothing to load there.

**Tidy up** (§2.10/§4.9, listed as landing in "M1" in the plan's prose but never actually built —
M2's DECISIONS entry for the Details panel already flagged this as a real gap) reuses
`justifiedRows` from `lib/packing.ts`, unchanged since M1. `createTidyUpCommand` snapshots each
selected item's full rect (not just position — the plan's "target row height 240... aspect ratios
preserved" means Tidy up *resizes* items onto the grid, not just repositions them) and packs them
at the selection's own bounding-box top-left corner, in whatever order the caller passes; the
context menu passes the current List-panel sort order, reusing `sortItems` from M2-8 rather than
inventing a second sort implementation. One `Command`, one undo step, regardless of selection
size — the same pattern as the bulk Details commands.

Verified with unit tests for the store (endpoint indexing, `connectionsFor`, `isConnected` in
both directions) and `createTidyUpCommand` (packs at the selection's own origin, not the canvas
origin; restores every item's own previous rect on undo), plus a Playwright check
(`smoke-m3-tidyup.spec.ts`) confirming the context menu item is wired end-to-end against the
seeded demo library — zero console errors.

### Hover/selection connection scoring + rendering (M3-2)
`src/lib/connections.ts` mirrors M2-6's search engine: a `buildConnectionIndex` step builds a
per-criterion inverted index (value -> item ids) once per data change (items, classification or
manual connections), and a cheap `scoreCandidates` reads it per hover, implementing §4.9's
`score(j) = Σ_c |V_c(i) ∩ V_c(j)|` across up to 3 active criteria, sorted by score descending
(ties broken by newest), capped to the top 40. A dedicated benchmark
(`connections.bench.test.ts`) confirms this clears the plan's "<16ms" hover budget with real
margin at 10,000 items (asserts <100ms, the same generous CI-safe ceiling used for the search
engine's own bench test, to catch a real regression rather than chase CI hardware).

One real bug, caught by a failing unit test before it ever reached the UI: the first draft
treated `manual` like every other criterion, looking up the hovered item's own id in the
`manual` inverted index and filtering out `itemId` — but a manual connection's "value" *is* the
neighbor's own item id, not an attribute other items could also hold, so that lookup returned
nothing (the only holder of "my own id as a manual value" is the neighbor itself, which the
self-filter then threw away). Fixed by special-casing `manual` in `scoreCandidates`: each of the
item's own connected-neighbor ids is a candidate directly, contributing score 1.

`Engine.ts` renders the scored candidates as screen-space lines in the existing overlay layer,
colored per criterion via `criterionColors` (already tokenized since M0) and dims everything else
to 0.35 alpha through the same `alphaFor(id)` priority chain that already arbitrates hover-highlight
vs. search Dim/Hide — connections dimming slots in between the two, so nothing fights over
`sprite.alpha`. Hovering a line itself shows a tooltip (`ConnectionTooltip.tsx`) built by
`formatSharedTooltip` ("Vibe: Dreamy · Tags: serif, grain"). Deviation logged: `criterionLineStyle`'s
dotted/dashed distinction (tokenized since M0) isn't drawn — Pixi 8's core `Graphics` API has no
dashed-stroke primitive, so every connection line is solid, distinguished by color only; revisit
if a custom dash-stroke helper is worth the effort later.

`useConnectionsBinding.ts` wires stores to the engine: hovering an item scores it 300ms after the
pointer settles (debounced, matching the plan's mention of a brief hover delay before lines
appear); selecting one item shows its full ranked candidates immediately (a deliberate action
doesn't need the delay); selecting several restricts each one's candidates to the rest of the
selection via `restrictToSelection`, so "only the connections among them show" (§2.10). This hook
only drives Hover mode — "Show all" (M3-4) will own the lines/dim itself once the popover (M3-3)
can switch modes.

Verified with 18 unit tests for the scoring module (including the manual-connection bug above,
color scoring, `minStrength` filtering, sort/tie order, the top-40 cap, soft-delete exclusion,
and `similar` correctly contributing nothing since it's deferred to M6), 4 for the new
`connectionsUiStore` (the "up to 3 active criteria, 4th sets `limitHitAt` instead of replacing
one" behavior), and a Playwright test (`smoke-m3-connections-hover.spec.ts`) that bulk-tags every
seeded item with the same Vibe, hovers the canvas, and screenshots the result — the screenshot
showed correctly colored, correctly positioned lines fanning out from the hovered item to its 59
now-related neighbors, with zero console errors.

### Connections popover UI (M3-3)
`ConnectionsPopover.tsx` follows `ZoomMenu.tsx`'s exact anchored-popover pattern (a `position:
relative` wrapper around the dock button, a fixed click-away overlay, and the popover itself
anchored `bottom: calc(100% + space-2)`), opened by the dock's Connections button or the "C"
shortcut, and closed by Escape, the click-away overlay, or "C" again. It's a thin view over the
`connectionsUiStore` built in M3-2 — no new store logic, since the toggle-with-a-cap behavior and
mode/strength/constellations state were already there and unit-tested.

Criteria toggles show only the 6 real criteria (Type, Vibe, Movement, Tags, Color, My
connections) — `similar` ("Similar look") is left out of the popover entirely rather than shown
as a toggle that visibly does nothing, since `lib/connections.ts` always scores it as zero
candidates until the AI pipeline lands in M6. Each toggle's color dot resolves `Criterion` to a
hex color the same way `Engine.ts`'s own `CRITERION_COLOR` map does (`criterionColors.tags` for
the `'tag'` criterion, the one facet whose token key doesn't match its criterion id), so the
popover's legend and the canvas's line colors can never drift apart by editing one and not the
other.

The **✦ Constellations** switch and the **Show all** display-mode tab are both wired into the
store here, as the plan's popover spec asks for, but neither one changes the canvas yet — hub
rendering for Show all is M3-4, and the Constellations layout itself is M3-6/M3-7. The "C"
shortcut is added to `useGlobalShortcuts.ts` and the shortcut list overlay; **Shift+C**
(Constellations' own toggle) is deliberately left out of both until M3-7 gives it something to
do, matching the same "don't document a dead key" call the shortcut list already makes for
Boards, Notes and the Frame tool.

Verified with a Playwright test (`smoke-m3-connections-popover.spec.ts`) that opens the popover
via "C", confirms the 3-active cap rejects a 4th criterion with the "Up to 3 at a time" message,
confirms turning one off then on succeeds, and exercises the mode/strength/constellations
controls and Escape-to-close — zero console errors. No new unit tests were needed: the store
logic they'd cover was already exercised by `connectionsUiStore.test.ts` in M3-2.

### Show all mode with hubs (M3-4)
`computeHubs` (in `lib/connections.ts`) reuses `buildConnectionIndex`'s `itemsByValue` inverted
index without any new special-casing: a hub is just a value whose item set, intersected with the
current "visible" set, has 2+ members. That reuse extends cleanly to `manual`: since
`buildConnectionIndex` already adds both directions of every manual connection,
`itemsByValue['manual'][X]` is exactly "everyone connected to item X" — so a manual hub forms
wherever 2+ items independently connect to the same one, with the target item's own title as the
hub's label (via the new `formatHubLabel`, resolved by the caller the same way
`formatSharedTooltip`'s labels are, keeping `lib/connections.ts` free of item/DOM concerns).
"Visible" means not soft-deleted and, if a search filter is active, restricted to its matches —
the same "respects the active filter" rule the plan states explicitly for Constellations, applied
here too since Show all is the same kind of space-wide view.

The 5,000-line cap (§2.10) is enforced by `computeHubs` itself (`edgeCount`/`overLimit` in its
return value) rather than truncating the hub list silently — past the cap, `useConnectionsBinding`
draws nothing and sets `connectionsUiStore.showAllOverLimit`, which the popover reads to show
"Too many links. Filter first or use Constellations." right under the mode switch.

`Engine.ts`'s `drawHubs()` computes each hub's screen position as the centroid of its *current*
member screen positions (recomputed every scheduled frame, so panning/zooming keeps hubs attached
without a separate camera subscription — the same approach `drawConnectionLines` already uses),
draws a faint edge from every member to its hub, and renders the hub itself with Pixi's native
`Graphics.star()` — unlike the earlier dashed-line case, there's no missing-primitive deviation to
log here. The label uses Pixi's `Text` (a first for this canvas; existing code was Graphics/Sprite
only), rebuilt alongside the rest of the overlay on every scheduled frame rather than updated
in-place — an accepted cost already established for `drawConnectionLines`, not a new regression.
Hovering a hub star reuses `setHoverHighlight` — the exact mechanism the List panel's own group
hover already added — so "hovering a hub makes its items glow" falls out of an existing code path
instead of a new alpha rule. Show all itself doesn't dim unrelated items (the plan only describes
that dimming for Hover), so `alphaFor`'s connections-dim branch is untouched by this task.

Verified with unit tests for `computeHubs` (2+-item threshold, visible-set filtering, the manual
hub case, and the 5,000-edge cap) and `formatHubLabel`, plus a Playwright test
(`smoke-m3-connections-showall.spec.ts`) that bulk-tags all 60 seeded items with the same Vibe,
switches to Show all, confirms the cap message stays hidden, and screenshots the result — the
screenshot shows a correctly labeled star at the cluster's centroid with all 60 fan lines
converging on it, zero console errors.

### My connections: drag handle, "Connect to…", labels, deleting (M3-5)
Three new commands in `commands/connectionCommands.ts` (`createAddConnectionCommand`/
`createRemoveConnectionCommand`/`createLabelConnectionCommand`) follow the same snapshot/do/undo
shape as every other command in the app; callers check `isConnected` first so a duplicate never
reaches `UNIQUE (from_id, to_id)`.

`Engine.ts` gained the interaction surface: a small circle handle on a hovered item's right edge
(drag it onto another item to connect — reuses the same pointer-capture drag pattern as move/
resize, not Pixi's per-object event system, so it was reliable from the start), a
`startConnectPick`/`cancelConnectPick` pair backing the context menu's "Connect to…" (the next
canvas click resolves the target, Escape or missing cancels), and click/double-click handling on
the manual-criterion line (Hover mode) or hub edge (Show all, only when `hub.criterion ===
'manual'` — computed the same way M3-4's `computeHubs` already keys a manual hub, `member ->
hub.value`). A single tap selects the pair (for "press Delete"); a second tap within 350ms on the
same pair is the double-click that opens `ConnectionLabelDialog`. Deleting reads
`engine.getSelectedConnectionPair()` synchronously from `useCanvasShortcuts`'s existing Delete
handler rather than adding a new store just to shuttle that one value across a hook boundary.

**Real bug found via the e2e test, not before:** clicking a connection line silently did nothing
— the hover tooltip worked (hover is pure `pointermove` hit-testing, unaffected), but neither
single-click selection nor double-click labeling ever fired, even though the click landed exactly
on the line. Root cause: `attachSelectionInput`'s pointerdown handler runs on every click
(container-level, native DOM listener) and, on any click that misses an `ItemCard` — which a
connection line always does, since it isn't one — called `container.setPointerCapture()`
immediately to make marquee-dragging robust to the pointer leaving the canvas mid-drag. Pointer
capture retargets *all* subsequent events for that pointer to the capturing element; since Pixi's
own event system listens on `app.canvas` (a child of `container`), its `pointerup` for that same
click was silently never delivered once `container` had captured it — so the line's own
`pointertap` handler (which is what `handleManualLineTap` depends on) never ran. Fixed by
deferring the capture: it's now taken on the first real pointer *move* past the drag threshold,
not on `pointerdown` itself, so a plain click that never moves — which is exactly what selecting
or double-clicking a line looks like — never captures the pointer at all, and Pixi's native click
handling on any interactive overlay graphic (lines, hub edges, hub stars, the connect handle) now
works correctly. Marquee-dragging itself is unaffected, since it always crosses the threshold
before the drag matters.

One deliberate limitation, not a bug: Show all's hub model only forms a hub where 2+ items share
the same value (§4.9), so a single one-to-one manual connection between exactly two items never
gets a hub in Show all — it only ever renders in Hover mode (which needs no hub, just a shared
value). A manual hub *does* form once a third item also connects to one of the two, since that
target's `itemsByValue['manual']` set then has 2+ members. Not worth a special case: it's the
direct, correct consequence of §4.9's "2 or more" rule applied to `manual` like every other
criterion.

Verified with 4 new unit tests for the commands module, plus two Playwright tests:
`smoke-m3-connections-manual.spec.ts` (right-click → "Connect to…" → click target → Details
panel's "My connections" list shows it → remove via its × button) and
`smoke-m3-connections-drag-label.spec.ts` (drag the handle to connect, double-click the resulting
line to label it, confirm the label in Details, then select the line and press Delete) — the
second test is what caught the pointer-capture bug above before it ever reached a real user.

### Constellations layout worker (M3-6)
`lib/constellations.ts` implements §4.9's algorithm as a pure, synchronous function
(`computeConstellationLayout`) so it's unit-testable without a worker, the same split
`lib/search.ts` and `lib/connections.ts` already use — `workers/layout.worker.ts` is a thin
wrapper that rebuilds a `ConnectionIndex` from the raw arrays it's sent (mirroring how
`ingest.worker.ts` takes raw bytes rather than a pre-decoded image) and calls it.

Step 1 (hubs) reuses M3-4's `computeHubs` unchanged. Step 2 lays out the hub graph with d3-force
(`forceManyBody` for charge ∝ −√size, `forceLink` with distance decreasing with shared-item
weight, `forceCollide` with radius ∝ √size, `forceCenter` to keep it from drifting), run
synchronously via `simulation.stop().tick(300)` rather than the default async ticker. Step 3
places every item at the plain average of its hubs' resulting positions (the plan says "weighted
average" without specifying the weighting scheme; equal weight per hub is the natural default and
is what "in between" for a multi-hub item means geometrically) plus seeded jitter — a ring around
the hub for single-hub items, a smaller jitter for multi-hub ones, and a separate outer ring
(radius = the layout's own extent plus a fixed padding) for items with no hub for the active
criteria at all, which are also returned as `unclassifiedIds` for the "Unclassified" label
(M3-7). Step 4 relaxes the full item set — fixed hub positions, `forceCollide` at a uniform
radius derived from the plan's "long side 160" card size, plus a weak `forceX`/`forceY` pull back
toward the step-3 targets — for 120 ticks.

Determinism (§4.9: "same inputs always give the same layout") comes from `hashSeed` (FNV-1a over
the active criteria and sorted visible item ids) feeding a `mulberry32` PRNG, passed to every
`d3-force` simulation via `.randomSource()` and used directly for the jitter angles — nothing in
the algorithm calls `Math.random()`. `similar` ("Similar look") stays deferred to M6 like
everywhere else in M3: the plan calls for item-to-item link forces instead of hubs for that one
criterion specifically, which isn't worth building against an index that's always empty until the
AI pipeline exists.

Only the algorithm and the worker plumbing land here — the Shift+C toggle, the 800ms morph tween,
hub dragging, and the Unclassified ring's actual on-canvas rendering are M3-7's job, so the
plan's "Constellations" checklist entries stay unchecked until that's done too.

Verified with 12 unit tests (determinism across repeated calls and across a different
criteria/seed, the 2+-item hub threshold, unclassified placement past every hub's own distance
from the origin, the zero-hub edge case, and a manual-connection hub's label resolving to the
target item's title), a performance test confirming 3,000 items lay out well within §4.9's 1.5s
budget, and 2 tests for the worker's request/response wrapper against a fake `Worker`.

### Constellations UI integration (M3-7)
`useConstellationsBinding.ts` is the only new piece that talks to the layout worker directly —
Shift+C and the popover's ✦ switch both just flip `connectionsUiStore.constellationsOn`, and this
hook reacts: computes the visible id set (same "respects the active filter" rule as Show all),
spins up a `layout.worker` via `runConstellationLayout`, and on success calls the new
`Engine.enterConstellations(itemPositions, hubs, unclassifiedIds)`. Turning it off calls
`Engine.exitConstellations()` — "Back to my layout" is a `Panel`/`Button` pair in `Shell.tsx`
that just calls `setConstellationsOn(false)`, and an "Arranging…" label shows in the same spot
while the worker is computing (`connectionsUiStore.arranging`), per §4.9's "keep the old view
until the new one is ready."

`Engine.ts` owns the 800ms morph itself (`tweenCardsTo`, sharing the `easeInOut` curve `Camera.ts`
already used for `flyTo` — pulled out to `lib/motion.ts` so both use the same one). The first call
to `enterConstellations` snapshots every item's real placement rect into `constellationMyLayout`
("my layout," for "Back to my layout" and for computing each card's constellation aspect ratio);
later calls while already on — a live re-settle — reuse that same snapshot rather than
re-snapshotting the already-arranged positions, and tween from wherever the cards currently sit,
so a re-settle reads as an adjustment, not a jump. Uniform card size (§2.10 "long side 160") keeps
each item's own aspect ratio, computed from its *real* placement rect, not whatever size Show all
or a previous constellation left it at. Hub stars are bigger and "glowing" (a soft low-alpha halo
circle behind the star) versus Show all's small ones, and are draggable: a hub-star pointerdown
starts a `hubdrag` mode in `attachSelectionInput`'s existing state machine (same pattern as the
connect handle), and on release `resettleAroundHub` re-tweens only that hub's member items to the
average of their (now-moved) hubs — the same placement rule `lib/constellations.ts` uses for the
initial layout, just re-applied locally instead of re-running the whole worker. The Unclassified
ring is a faint circle plus a label, centered on `constellationOrigin` (see below) at a radius
past the farthest hub. "Items can't be dragged here" is enforced in the same pointerdown handler:
a hit on a selected item just selects, never enters `move` mode, while `constellationsOn`.

**Two real bugs, both found by the e2e test's screenshot looking wrong, not by inspection:**

1. `lib/constellations.ts` centers its hub graph on its own coordinate origin (0,0) — unrelated to
   wherever the library actually sits on the map. Applying that directly would make the morph jump
   to a random spot near world-origin instead of happening "in place." Fixed by computing
   `constellationOrigin` (the centroid of the snapshotted real placements) once, on first entry,
   and adding it to every hub and item position before use.

2. **The real one.** `useEngineBindings.ts`'s `syncCards()` subscribes to the *whole* library
   store with no selector, so it re-runs on any item field changing — including an ingest write
   to an unrelated item's thumbnail or palette, which can keep trickling in for several seconds
   after import. Each run calls `Engine.setLibraryItems()`, which rebuilds every card's rect from
   its real DB-backed placement — correct and necessary in general, but while Constellations is on
   it silently snapped every item straight back to its real position and size the instant *any*
   unrelated store write landed, often mid-morph or well after. Items whose data happened to
   settle before the next such write kept their arranged spot; items that didn't (which, right
   after importing 60 items, was most of them) stayed stuck at their real placement — exactly the
   "half the map never arranges" symptom the screenshot showed. Fixed in two parts: (a)
   `Engine.setLibraryItems` now preserves each existing item's *current* rect while
   `constellationsOn`, only letting genuinely new cards take their real placement — "items can't be
   dragged here" turns out to mean "nothing else gets to move them either," not just the pointer;
   (b) `useConstellationsBinding`'s own re-settle trigger was *also* too broad — it keyed off
   `items` directly, so it independently re-ran (and restarted its own 800ms tween) on the same
   ingest noise. Replaced with a signature of just the fields `computeHubs` actually reads
   (`deletedAt`, `title`, and `colorFamilies` only when `color` is an active criterion), confirmed
   by direct engine-state introspection (a temporary `debugCardSizes()` accessor, removed once
   verified) that all 60 cards converge to the correct uniform size and clustered position and
   *stay* there.

Verified with a Playwright test (`smoke-m3-constellations.spec.ts`) that bulk-tags all 60 seeded
items with the same Vibe, presses Shift+C, waits for "Back to my layout" to appear, screenshots
the result, then toggles back off — zero console errors. (One remaining oddity, noted for anyone
debugging this test later: even after directly confirming via engine introspection that every
card's data is fully converged and stable, the Playwright screenshot itself sometimes still shows
a handful of cards at their old size/position. This reproduces even with a large safety margin
after confirmed convergence, so it reads as a headless-Chromium canvas screenshot-capture quirk in
this sandboxed environment rather than a real rendering bug — not worth the owner's time chasing
further here, but worth knowing about before assuming a regression from a future screenshot.)

### M3 wrap-up
Everything in the milestone shipped: the criteria model and popover, Hover and Show all
connections, My connections (drag handle, "Connect to…", labels, delete, the Details list), and
Constellations (worker, morph, glowing draggable hubs, the Unclassified ring, deterministic
filtered layouts). "(If time allows) Arrange by…" is the one line left unchecked — the plan marks
it optional, and building it properly (labeled clusters permanently written to My layout, an
undo step, a 50-item confirmation) would mean a fifth sub-task on top of seven already-substantial
ones; better spent as a clearly-scoped follow-up than squeezed in at lower quality here.

Real bugs found and fixed while building this milestone, beyond the ones already logged above:
the `usageCounts`-style Zustand infinite-render pattern never recurred (M2's fix generalized),
but two new categories of bug showed up that are worth knowing about for future canvas work: (1)
Pixi's own click/tap handling on an interactive overlay object can be silently swallowed by an
*unrelated* `setPointerCapture()` call earlier in the same native event's dispatch — any future
overlay interaction (a new kind of handle, a new clickable graphic) should take the same
"defer capture to the first real move" precaution `attachSelectionInput` now uses, not capture
eagerly on every miss. (2) A `useLibraryStore.subscribe()` with no selector re-running on *any*
store write is fine for code that always wants the latest full state (like the canvas's normal
card sync), but it's a trap for any feature that needs the canvas to temporarily diverge from
what's stored (Constellations is the first; a future one should check `engine.isConstellationsOn()`
or an equivalent mode flag the same way `setLibraryItems` now does).

Acceptance criteria (plan): hover links compute in the low single-digit milliseconds at 10,000
items (`connections.bench.test.ts`, asserting well under the plan's own 16ms budget with a
generous CI ceiling); Constellations lays out 3,000 items well under 1.5s
(`constellations.bench.test.ts`), and `computeConstellationLayout`'s determinism (same inputs →
byte-identical output, verified by calling it twice and deep-equal) is unit-tested directly rather
than only implied by the seeded PRNG.

No tag for M3 — the plan only calls for tagging at the end of M2 (`v0.1.0`); M4 continues on the
same branch.

### M4-1: Boards data layer, gallery, space switcher
The `boards`/`frames`/`placements` tables were already fully scaffolded in M0's `001_init.sql`
(§5.2), so this sub-task was almost entirely application-layer: a `Board` type + `rowToBoard`,
a `boardStore`/`loadBoards`/`boardUiStore` trio mirroring the existing library/vocabulary stores,
undoable `boardCommands` (create/rename/duplicate/delete-as-soft-delete/restore), and two UI
pieces — `SpaceSwitcher` (a popover off the top-left chip: Library, the 5 most-recently-updated
boards, "+ New board", "All boards…") and `BoardsGallery` (a full-screen grid with inline rename,
duplicate, delete, and a Trash section for restore, mirroring items' own Trash pattern).

Two scoping decisions, both deliberate rather than oversights:
- **Covers are a placeholder** (the board name's first letter on a tinted tile), not a real
  thumbnail. Actually compositing a board's item placements into a cover image needs the board
  canvas itself to exist first — that's the plan's next M4 bullet ("The board canvas"), not this
  one. Revisit once boards can hold placed items.
- **Duplicate copies the board row, its frames, and its placements** (all with fresh ids, frame
  ids remapped in the copied placements), but not board-only notes/swatches — those are `items`
  rows of their own (`origin_board_id`), and cloning item rows is squarely M4's later Notes
  sub-task's territory. Until then, duplicating a board with notes on it will carry over its
  image/video/etc. placements but drop the notes; logged here so it isn't mistaken for a bug once
  Notes exists.
- **Switching the current space is UI-only for now**: `boardStore.currentBoardId` changes and the
  switcher/gallery reflect it, but the canvas itself still always renders the Library's own items
  (`useLibraryStore`, unchanged) — actually scoping the canvas to a board's placements is the
  plan's next bullet, "The board canvas", and needs its own design (a board is a *view* over a
  subset of Library items via `placements`, not a separate item namespace). Wiring the switcher
  ahead of that, rather than blocking the whole gallery on it, matches the plan's own bullet
  split (space switcher + gallery is one line; the board canvas is a separate one below it).

### M4-2: Create a board from a selection or search results
Added `createBoardFromItemsCommand`, reusing "Tidy up"'s existing `justifiedRows` packer (§4.9)
rather than writing a second layout algorithm — the plan explicitly calls out the same justified-
row layout for both. Two entry points: the canvas context menu's new "Create board from selection"
(reusing the same multi-select `ids` the other bulk actions already compute) and the search bar's
new "Create board from results" (reads `useSearchResults().matches` and saves the active
`searchStore` filter onto the board's `source_filter` column for a later "sync with source
filter"/suggestions-tray feature to re-run). Both switch `boardStore.currentBoardId` to the new
board and toast its name, same as M4-1's "+ New board".

Deliberately out of scope here (both already logged in M4-1's entry, still true): the created
board's placements are written straight to the DB and aren't yet visible on any canvas, since "the
board canvas" is the plan's next bullet, not this one. Verified via the placement rows/`sourceFilter`
a unit test asserts on, and via `boardStore.currentBoardId` + the switcher's own displayed name in
an e2e test — not by looking at the board's contents rendered anywhere, because nothing renders
them yet.

### M4-3: Board canvas — switching spaces, remove from board
The key realization here: `libraryStore` already modeled "items (library-wide) + placements (the
*current* space's rows)" since M1 — the canvas engine (`useEngineBindings`) only ever draws a card
for an item that has an entry in `placements`. So making the canvas actually show a board's own
content needed no Engine changes at all: `setPlacements` (a new `libraryStore` action) replaces
the whole placements map, `loadPlacementsForBoard` re-queries it for a given board id, and
`switchSpace` (new, `features/boards/switchSpace.ts`) ties the two together plus clears selection
and moves `boardStore.currentBoardId`. The space switcher, the gallery's "Open", and every
"create a board and switch to it" flow (M4-1's "+ New board", M4-2's two create-from paths) all
now go through this one function, so there's exactly one place that knows what "switching spaces"
means.

Added `createRemoveFromBoardCommand` (deletes just the `(board_id, item_id)` placement row,
snapshotted for undo) and wired it into the context menu's new "Remove from board" (shown only
while viewing an actual board, not the Library) and the Delete/Backspace shortcut, which now
checks `boardStore.currentBoardId`'s kind before choosing between it and the existing
`createTrashCommand`. "Search within the board" needed no new code at all: `Engine.setSearchFilter`
only ever dims/hides ids that already have a card, so a search match outside the current board's
placements is already a no-op — confirmed by running the full e2e suite rather than by writing
anything new for it.

Two bullets under "The board canvas" are deliberately still open, both logged as follow-ups
rather than gaps:
- **The List's [This board | Library] switch with drag-to-add** — a real UI feature (a toggle in
  the List panel, plus drag-from-Library-list-onto-canvas-to-add-a-placement), not a side effect
  of the placements-swap work above. Left for a dedicated follow-up.
- **Media dropped on a board also lands on the Library map** — half of this already held before
  M4-3 (`importItems.ts` always resolves the Library board via `findLibraryBoardId`, so nothing
  dropped is ever *only* on a board); what's missing is dropping *while a board is open* also
  writing a second placement onto that board. Needs the current board id threaded into the import
  path, which touches drop/paste/file-dialog entry points already spread across
  `features/import/*` — scoped as its own follow-up rather than folded in here.

### Spike S4 — Notes on the canvas
Read `node_modules/pixi.js/skills/pixijs-scene-text/references/html-text.md`,
`node_modules/pixi.js/skills/pixijs-html-source/SKILL.md`, and
`node_modules/pixi.js/skills/pixijs-scene-dom-container/SKILL.md` per CLAUDE.md. Ruled out
`pixi.js/html-source` (`HTMLSource`) immediately: it's built on the still-experimental
HTML-in-Canvas browser proposal, gated behind a feature flag most Chromium builds (WebView2
included) don't ship — not something to depend on for a distributed desktop app. `DOMContainer`
(`pixi.js/dom`) is lower-risk (just CSS-transform math, no special browser API) but duplicating
every card behavior (select/drag/resize/z-order/LOD) a second time for a DOM-only note type isn't
worth it when the existing sprite/card pipeline already does all of that generically.

**Decision:** notes render on the canvas the same way every other item does — a sprite in the
existing card pipeline — with the sprite's texture generated from `HTMLText` (sanitized HTML,
word-wrapped, resolution-aware so it stays crisp at any zoom) instead of an image thumbnail. This
gets "speed" for free (same LOD/culling/texture-manager code path as images) and "crispness" for
free (`HTMLText` rasterizes through an SVG `foreignObject`, not a live DOM node, so it scales
cleanly with the sprite). Editing is the one place that needs a real DOM element: double-click (or
Enter, matching Focus view's own convention) opens a plain positioned `<div>` overlay — the same
"React DOM element layered above the canvas" pattern every other overlay in this app already uses
(`ConnectionLabelDialog`, `DetailsPanel`, etc.), not `DOMContainer` — sized and placed over the
note's current screen rect (computed the same way `Engine.connectHandleScreenPos` already
projects world→screen for the manual-connection handle), hosting TipTap for the actual editing.
Closing the editor re-sanitizes the HTML, regenerates the `HTMLText` texture, and the DOM overlay
disappears — "handing off to the editor" and back, cleanly, with the canvas never holding a live
editable DOM node.

### M4-4: Notes
Built per the Spike S4 decision above: a note is a normal canvas card (flat color, from its own
`color` token) with a plain-text snippet drawn as a `Text` sibling of the sprite in `itemsLayer`
(`Engine.syncNoteLabel`, kept in sync across the create/diff loop, `applyCardRect`'s tween path,
and the direct move/resize drag paths — three call sites, one small helper). Editing is a DOM
overlay (`NoteEditor`) positioned every frame from a new `Engine.getScreenRect(id)` (there's no
camera-change event to subscribe to instead, so it's an rAF poll while open, same idea as the
Constellations morph's own tween loop) hosting a TipTap `EditorContent`. `Engine.dblclick` now
carries the world position alongside the hit id, since "double-click empty canvas" needs to know
*where* — `useFocusViewBinding` was narrowed to only open Focus view for `kind: 'image'` so it
stops fighting with the new `useNoteCanvasBinding` (double-click a note → open its editor; empty
canvas → create one there and open it) over the same event.

**"Sanitized rendering"**: no raw-HTML sanitizer (DOMPurify, already an unused dependency since
M0) turned out to be necessary, because raw HTML never appears anywhere in this feature. A note's
`body` column stores TipTap's own JSON document (schema-constrained by `noteExtensions` —
`StarterKit` only), never a string of markup; the canvas snippet is `generateText()`'d plain text
into a Pixi `Text` (a texture, not a DOM/HTML sink); and the live editor is TipTap/ProseMirror's
own `contentEditable`, which manages its DOM from that same structured JSON rather than from
`innerHTML`. So "sanitized" here means "the content is never treated as HTML in the first place" —
arguably stronger than sanitizing a string would be. If a future feature renders a note's content
as an actual HTML string somewhere (a hover preview via `dangerouslySetInnerHTML`, say), that's
exactly where DOMPurify (`generateHTML(body, noteExtensions)` → `DOMPurify.sanitize(html)`) should
finally get used — logged here so it isn't forgotten.

Colors reuse the existing "stone" accent tokens (`sage`/`blush`/`cream`/`lavender`/`sky` —
`design/tokens.ts`'s new `noteColors`) instead of inventing a note-specific palette; they were
already light/pastel enough to read dark text on and already had matching CSS custom properties.
Search indexes `body_text` as a new MiniSearch field (`lib/search.ts`) — no incremental-index
wiring needed since the existing "rebuild on every store change" strategy (M2-6) already covers it.
"Pasted text becomes a note" hooks into `useDropAndPaste`'s existing paste handler, ordered after
the file/image checks so copying an actual image never *also* drops a stray text note from
whatever else ends up on the clipboard's `text/plain` slot alongside the image bytes.

Left out, both logged rather than silently dropped: the note's on-canvas snippet is plain text
only — bold/italic/lists you type in the editor don't show on the flat canvas card, only while
actually editing (a direct consequence of the Spike S4 "Pixi `Text`, not `HTMLText`" call, see
above); and a corrupt/legacy note body falls back to an empty snippet rather than crashing
(`noteBodyToPlainText`'s try/catch), covered by its own test.

**Two real bugs found by the existing e2e suite (not written for this milestone) while
integrating this**, both fixed before landing:
1. Double-clicking a connection line to label it (§2.10, M3-5) also fires the container's native
   browser `dblclick` — Pixi's own `pointertap`-based double-tap detection on the line doesn't
   stop that from bubbling. Before this milestone nothing acted on an empty-hit `dblclick`, so it
   was silent; now `useNoteCanvasBinding` does ("create a note there"), and a label double-click
   would spawn a phantom note stacked right on the line it was labeling — confirmed by
   `smoke-m3-connections-drag-label.spec.ts` breaking (the line stayed connected after a later
   "select + Delete", because that click was landing on the new note card instead of the line).
   Fixed with `Engine.suppressNextEmptyDblClick`: `handleManualLineTap` sets it the instant it
   emits `connectionLineDblClick`, and `onDblClick` checks/clears it before deciding whether an
   empty hit means "make a note". General lesson matching M3-5's own pointer-capture write-up:
   Pixi's synthetic event system and the browser's native events run in parallel, not one on top
   of the other, so a handler for one can't assume it's the only thing reacting to the same click.
2. `setLibraryItems`'s per-update loop unconditionally re-applied `existing.tint = card.
   dominantColor` on every existing sprite (added so a note's color swatch change actually
   repaints) — but for an *image*, `requestLod` sets `tint = 0xffffff` once a thumbnail loads, and
   nothing else is supposed to touch it afterward. Since `useEngineBindings`'s `syncCards` re-runs
   on *any* unrelated library-store write (the same unfiltered-subscribe shape flagged in M3-7's
   entry), every already-loaded photo would get its placeholder tint reasserted over its real
   thumbnail texture on the next unrelated edit — a visible color cast, not caught by any existing
   test (none assert on rendered pixel color) but caught by re-reading the diff before pushing.
   Fixed by gating the re-tint on `card.kind === 'note'`.

### M4-5: Swatches + Extract palette
Reused as much of M4-4's Notes plumbing as fit: a swatch is the same kind of flat-color card,
so `Engine.syncNoteLabel` (now also handling `kind: 'swatch'`) draws its "HEX and an optional
name" label with the same `Text`-sibling mechanism — the one addition there is
`readableTextColor`, since a swatch's color is arbitrary (including near-black or near-white)
where notes' fixed dark ink would sometimes be illegible. `createExtractPaletteCommand` merges
`item.palette` entries by hex across every source item (summing weight, not just concatenating)
before taking the top 5–8, so extracting from several similar photos doesn't produce five near-
duplicate swatches. Named via the existing `colorFamily()` classifier (§3.2's OKLCH buckets)
rather than left blank.

Added `Platform.clipboard.writeText` (implemented for both `BrowserPlatform` and `TauriPlatform`,
the latter already having the `@tauri-apps/plugin-clipboard-manager` import from `writeImage`/
`readText`) for "click copies the HEX" — wired into `useEngineBindings`'s existing `select`
handler (single-swatch selections only, so marquee-selecting a swatch alongside other items
doesn't silently overwrite the clipboard with just the swatch's color) rather than a new binding.
Caught and logged rather than propagated, matching `design/components/Swatch.tsx`'s own existing
copy button — clipboard access being denied (permissions, non-secure context, or simply no
permission grant in a test browser) shouldn't surface as an app error.

Scope calls, both logged rather than silent: "Extract palette" only covers "the selection" from
the plan's "the selection or the whole board" — the "whole board, nothing selected" case would
need an empty-canvas context menu, which doesn't exist yet (`useContextMenu.ts` has been a
documented no-op there since M1); and the Details panel's swatch-only "Color" field was added
without also hiding the Type/Vibe/Movement/Tags classification fields for a swatch (harmless —
an owner *can* tag a swatch, just not something the spec asks for — but not hidden either, for
time's sake rather than by design).

### M4-6: Frames on any space
The plan's own spec for this bullet is one line ("Frames on any space"), so the design decisions
here are mine, logged for reference. A `Frame` is architecturally distinct from an `Item` — it has
its own `frames` table (already scaffolded from M0) rather than being another `items.kind` — so it
needed its own store (`frameStore`, mirroring `libraryStore.placements`'s "swapped wholesale on
switch space" shape), its own commands, and, since Engine's selection/hit-test/resize machinery is
built entirely around `ItemCard`s, its own parallel (not integrated) interaction path rather than
trying to make a frame masquerade as a card.

Rendering: a frame is a dashed-alpha outline `Graphics` plus a `Text` title sitting just *above*
its top-left corner (not inside it), so the label never overlaps whatever's placed inside — both
drawn in `itemsLayer` at `zIndex = frame.z - 1_000_000`, reliably behind every item regardless of
its own z (a "send to back" only zeroes an item's own z, so a large fixed offset was simpler and
more robust than tracking the current minimum item z). Interaction is title-bar-only, matching how
Figma/Miro frames work: the frame body itself stays fully click-through for whatever's placed
inside it, and only the title (click to select, drag to move — the frame *and* every placement
whose `frameId` points at it, computed once at drag-start from a new `ItemCard.frameId` field
mirroring `placement.frameId`) and a single bottom-right corner handle (free resize, no aspect
lock) are interactive. Double-clicking the title opens a rename dialog (`FrameRenameDialog`,
copy-pasted from `ConnectionLabelDialog`'s already-established shape) rather than an inline
DOM-overlay editor like `NoteEditor`'s — a frame's title is a single line with no rich formatting,
so the extra positioning machinery an inline overlay needs wasn't worth it here.

Deleting a frame un-parents its members (`placement.frame_id = NULL`) rather than trashing or
removing them — "Frames on any space" groups items, it doesn't own them, matching how the plan's
own board-delete section already treats board-only notes/swatches as owned (trashed with the
board) while never implying the same for a *board's own* items (never owned, never trashed by
deleting the board). Move/resize are their own two-message flow — Engine live-updates the visual
during the drag (frame outline + member card positions, purely in Engine's own state, no store
writes) and emits one `frameMove`/`frameResize` event on release with the total delta/final rect,
which `useFrameCanvasBinding` turns into exactly one undoable command — the same "live preview,
one command on release" shape `move`/`resize` already use for items.

Also caught and fixed here: GitHub Actions CI (unlike this sandbox's local Playwright run) denies
`navigator.clipboard.writeText` by default, so M4-5's swatch-selection copy — landed the previous
commit — was throwing `NotAllowedError` in CI only. It was logged via `logger.error`, which every
e2e test's own `page.on('console')` listener treats as a real console error, so
`smoke-m4-swatches.spec.ts` failed in CI while passing locally. Fixed by removing the log entirely
(silently ignoring the failure), matching `design/components/Swatch.tsx`'s own established copy
button, which never logged in the first place — clipboard permission being denied isn't something
the owner can act on, so it was never worth surfacing as an error to begin with.

### M4-7: Export (PNG/PDF)
The plan's §4.9 sketches export as manual `RenderTexture` tiling at 4096px chunks, stitched
together, because a naive single `RenderTexture` can exceed a GPU's max texture size on a very
large board. PixiJS v8's `renderer.extract.canvas({ target, frame, resolution })` already does the
equivalent internally — `frame` selects a sub-rect of the target's own local space (verified by
reading `GenerateTextureSystem`'s source: it renders `target` with an explicit root transform,
ignoring `target`'s ancestors, so `itemsLayer`'s children — which are already positioned in world
coordinates — need no camera-relative math at all) and `resolution` is the scale multiplier. Using
it directly instead of hand-rolling the tiling loop is the simpler alternative the CLAUDE.md
non-negotiables call for when the plan's own approach isn't the easiest path to the same UX; a
60-item board's export rect is nowhere near a GPU's real texture-size ceiling, so tiling would have
added real complexity for a case this app doesn't hit in practice.

The plan also mentions loading `t1600` (or originals) for exported items first. This codebase's
image ingest worker (M1) only ever generates `t128`/`t512` — there's no `t1600` size and no
existing path from an `Item` to its original file's URL at the canvas layer. Building that whole
size tier (Rust ingest changes, a new cache key, a new LOD rung) was out of scope for an already
large milestone item; export instead upgrades every card within the export rect to `t512` (the
largest thumbnail this app has) before capturing, same as the live canvas's own zoomed-in LOD.
Logged here as a known gap rather than silently doing less than the plan describes — worth
revisiting if the owner finds 512px insufficient for a printed PDF.

Export reuses `itemsLayer` directly as the `extract` target (rather than building a separate
scene), which for free excludes `overlayLayer` (marquee, selection outline, resize handles) — those
are screen-space UI chrome, never meant to appear in an export. What it doesn't get for free:
`itemsLayer`'s children outside the *current camera viewport* are `renderable = false` (§4.6
culling only keeps what's on screen paintable), so exporting "the whole board" needed a temporary
force-visible pass over every card the export rect covers (respecting an active search Hide filter,
so a hidden-by-search item stays out of the export too), undone afterwards via the same `cullItems()`
the live canvas already calls on every camera move — no new culling logic, just an extra call.

The "dots" background option is drawn as real `Graphics` circles at the dot grid's base world
spacing (`canvasGeometry.dotGridWorldSpacing`), not a re-implementation of the on-screen CSS
grid's zoom-based density switching (`DotGrid.tsx`'s dense/sparse thresholds) — an export always
renders at "real" scale, so there's no zoom level for that switching logic to key off of.

PNG export offers the plan's 1×/2× scale choice; PDF export doesn't expose a scale (the plan
doesn't ask for one there) but renders at a fixed 2× internally for print-quality pixels regardless
of the owner's on-screen zoom. "One page per frame" only appears in the dialog when exporting the
whole space (not a single already-selected frame) and the space actually has frames — exporting a
single frame is inherently already "one page," so the toggle would be meaningless there.

`Platform.dialogs.saveFile` was a stub explicitly marked "lands in M4" since M0
(`TauriPlatform.ts`'s `notYet(...)`) — implemented for real here via a new small `dialog_save_file`
Rust command (`src-tauri/src/dialogs.rs`) using `tauri-plugin-dialog`'s native Save As picker plus
`std::fs::write`. It's its own module rather than folded into `media.rs`, since it's a generic
"write these bytes somewhere the owner picks" operation with nothing to do with media import/purge.
`BrowserPlatform`'s existing implementation (an anchor-click download) already worked and needed no
changes; the two together mean an owner can save on both the browser dev build and the real
Windows app.

### M4-8: The List's [This board | Library] switch with drag-to-add
Deferred from M4-3 as its own follow-up. `ListPanel` always showed `libraryStore.items` — the
library-wide catalog — regardless of the current space, so "This board" (showing only what's
actually placed there) needed a real filter: a new `listStore.listSource` (`'space' | 'library'`)
plus a `Tabs` toggle, rendered only while an actual board (not the Library map) is open — there's
no distinction to make on the Library map itself, since the whole catalog *is* what's on it.

One subtlety caught before it shipped: `ListPanel`'s existing "nothing to show" early return
replaced the *entire* component, controls included. For a brand-new empty board — the exact case
this feature exists for — that would have hidden the "Library" tab along with everything else,
leaving no way to reach it. Split the empty check in two: a wholly empty *library* still shows
nothing (nothing to group/sort/switch either), but an empty *board* in "This board" mode keeps the
toggle and group/sort controls mounted, swapping out only the tile area for the empty message.

Drag-to-add is a new `createAddToBoardCommand` (`boardCommands.ts`) — sized from the item's own
aspect ratio (matching `createBoardFromItemsCommand`'s layout math) and placed at the nearest free
spot to the drop point via the same `findFreeSpot`/`isOccupied` pair `importItems.ts` already uses
for a fresh import (reimplemented here rather than exported, since `importItems.ts`'s versions are
module-private and only a few lines). The List tile sets a custom drag MIME
(`application/x-designspace-item-id`) rather than the plain-text sniffing `useDropAndPaste.ts`
uses for pasted URLs/notes, so the two drop handlers (`useListDragToBoard`, new; the existing file
drop) never trigger on each other's gesture. Dropping an item already on the board (checked via
`libraryStore.placements`, which is always scoped to the current space) shows a toast instead of
duplicating the placement.

### M4-9: Media dropped on a board also lands on the Library map
The last of M4-3's two deferred board-canvas follow-ups. `importItems.ts` always wrote exactly one
placement row, on the Library board, for every imported item — so this half already held
("nothing dropped is ever *only* on a board", since it was never on a board at all). What was
missing: dropping *while a board is open* should also place the item on that board, at the drop
point, in addition to the Library map.

The real complication was `libraryStore.placements`: it's always scoped to whichever space is
*currently open* (§4.3's architecture, since M4-3), so while a board is open it holds that board's
rows, not the Library's. The existing collision-avoidance helpers (`isOccupied`/`nextZ`, used to
find a free spot for the drop-point placement) read straight from that live map — fine for the
placement that's actually visible right now, but useless for the *other* placement this feature
needs to also write, since the Library's own occupied rects simply aren't loaded. Generalized both
helpers to take an explicit occupied-rects list instead of reading the store directly, and added
one extra query (`fetchPlacementSnapshot`) to fetch the Library board's placements straight from
the DB only when they're actually needed (i.e. only while a non-Library board is open) — a board
drop that never had this problem (a Library-map drop, or a board isn't open) costs nothing extra.

`createRow` now takes a `primary` placement target (always written to the live store, since it's
the one that matches the space actually on screen) and an optional `extra` one (DB-only — it loads
normally the next time the owner opens the Library map). The plan's "arrival area" spirals out from
"the last arrival point, or the viewport center" (§4.9), which only means something while the
Library map itself is visible; there's no such point to reuse for the Library-only half of a board
drop, so it simply spirals out from world origin instead — a deliberate simplification, logged here
rather than building "last arrival point" tracking for a case the owner never actually looks at
during the drop itself.

### M4-10: The suggestions tray
"More like this" re-runs a board's saved `sourceFilter` — a `lib/search.ts` `Filter`, the exact
object the search bar itself produces — against the *whole* library, via the same
`buildSearchIndex`/`search` pair `useSearchResults` already uses for the search bar and the canvas
Dim/Hide binding. Filtering out what's already on the board needed no new plumbing at all: the
board is the space that's currently open while its own tray is visible, so `libraryStore.placements`
already holds exactly its rows (the same "current space" architecture M4-3 established, and the
same one M4-9 had to work around for the *other* board). A board created from an ad hoc selection
(no `sourceFilter`, `createBoardFromItemsCommand(platform, ids, name, null)`) or one created empty
simply never has anything to suggest — the tray renders nothing rather than showing an empty strip.

Drag-to-add reuses M4-8's exact mechanism: a suggestion tile sets the same
`LIST_ITEM_DRAG_MIME`/`createAddToBoardCommand` pair the List panel's "Library" mode tiles use, so
`useListDragToBoard`'s drop handler (already mounted once in `Shell.tsx`) needed no changes to
also serve the tray — it doesn't know or care which UI the drag started from.

Dismissal is the first real use of `boards.settings` (the JSON column §5.2 already earmarked for
"background, connection criteria, dismissed suggestions" — none of those existed yet). A new
`createDismissSuggestionCommand` merges the item id into
`settings.dismissedSuggestions`, undoable like every other command; a dismissed suggestion "doesn't
come back for that item" (§2.13's AI-suggestion rule, reused verbatim even though this tray
predates AI) simply because the tray's own filter excludes anything in that set. The tray's
collapsed/expanded state is a plain UI-state store instead (`suggestionsUiStore`), not persisted —
only the per-item dismissals need to survive a reload.

### M4 wrap-up
Every checklist item shipped: Spike S4, Boards (space switcher, gallery, create from a selection/
search results/empty), the whole board canvas (remove-from-board, the List's [This board |
Library] switch with drag-to-add, search within the board, media dropped on a board also landing
on the Library map), Notes, Swatches + Extract palette, Frames on any space, the suggestions tray,
and Export (PNG/PDF). Nothing was descoped or left as "(if time allows)" this time.

The milestone's real throughline turned out to be one architectural decision made all the way back
in M4-3: `libraryStore` splits the library-wide item catalog from the *current space's* placements,
swapped wholesale on switch. Nearly every later M4 sub-task either leaned on that split directly
(the suggestions tray's "what's already on the board" check is a bare `placements.has(id)`, no
query needed) or had to explicitly work around its one sharp edge — the live `placements` map only
ever reflects whichever space is open right now, so anything that needs *another* space's rows
(M4-9's Library-map half of a board drop) needs its own DB fetch, since they're never both loaded
at once. That's a deliberate memory/simplicity trade-off worth keeping in mind for M5+: a feature
that wants to read a second board's placements without switching to it will hit the same thing.

A second recurring pattern: several sub-tasks reused the exact same primitive across features
rather than each inventing its own — `findFreeSpot`/`isOccupied` (packing) powers fresh imports,
drag-to-board, and both halves of a board-drop's placement; the single `LIST_ITEM_DRAG_MIME` drag
contract serves both the List panel's Library-mode tiles and the suggestions tray's tiles, so
`useListDragToBoard`'s one drop handler, written for M4-8, needed zero changes to also serve M4-10.

Two real deviations from the plan's own sketch, both logged where they happened and worth
repeating here: Export renders via PixiJS's built-in `renderer.extract.canvas({ frame, resolution
})` rather than the plan's manual `RenderTexture`-tiling loop (§4.9's approach the exact right
answer only past a GPU's real texture-size ceiling — no board this app produces gets there), and
it upgrades exported images to `t512` rather than the plan's `t1600` (this app's ingest worker has
never generated a `t1600` tier — building one was out of scope for an already large milestone item,
flagged as a gap worth revisiting once/if the owner finds 512px insufficient for print).

Verification for the whole milestone (not just the last sub-task): `tsc -b --noEmit`, `eslint .`,
`prettier --check .`, `vitest run` (276 tests), `vite build`, `cargo fmt --check`, `cargo clippy
--workspace --all-targets -- -D warnings`, and `cargo test --workspace` are all clean; the full
Playwright suite (36 specs, including seven new M4 ones) passes end to end against the real browser
build. No tag for M4 — same as M3, the plan only calls for tagging at the end of M2 (`v0.1.0`).

**Owner check:** make a real moodboard for a current project — filter or select from the Library,
create a board, drag a few more things in from the suggestions tray or the List's Library mode,
add a note and a swatch, arrange a frame or two, and export it as both PNG (try 2× and the plain-
plum background) and PDF. Does the export actually look like the board you built?

## M5: More content

### Spikes S5 (video codecs) and S6 (font metadata)

**S5 — video codecs.** This cloud session's Chromium is a stock open-source build (no Google/
Microsoft proprietary codec licensing bundled in), so it's a useful but incomplete stand-in for
the real target, WebView2 on Windows. Checked `HTMLVideoElement.canPlayType()` for the plan's
candidate formats:

| Container/codec | This sandbox's Chromium |
|---|---|
| WebM (VP8/VP9/AV1) | `probably` — plays |
| MP4 (H.264/AVC) | *(empty)* — no proprietary decoder in this build |
| MP4 (HEVC) | *(empty)* |
| MP4 (AV1) | `probably` |
| QuickTime (`.mov`) | *(empty)* — container itself unrecognized |

The MP4/H.264 result is expected and not representative: WebView2 uses the Windows Media
Foundation stack, which ships H.264/AAC decoding out of the box on every supported Windows version
(unlike a bare open-source Chromium build) — so real verification of MP4 and `.mov` playback has
to happen on the owner's actual Windows install, per CLAUDE.md's cloud-session guidance. What *is*
decided here, and doesn't need Windows to verify: rather than hardcoding a codec-support table,
videos import as their given file and playability is discovered at runtime (`canPlayType`/the
`<video>` element's own `error` event) — the one design that's correct on both platforms and
naturally drives the plan's "fallback for unsupported codecs" UI, which this sandbox can build and
test end-to-end right now (every MP4 dropped in here *is* the unsupported case).

**S6 — font metadata (WOFF2 name tables).** Compared `fontkit` and `opentype.js`:

- `opentype.js` has zero dependencies and a small footprint, but **doesn't decompress WOFF2 at
  all** — its own docs recommend loading a separate ~1.4MB Brotli decoder (`wawoff2`) via a
  `<script>` tag from a CDN. That's flatly incompatible with this app's strict CSP (no
  `unsafe-eval`, no background network in the webview) and the "everything ships in the
  installer" requirement — a local static import of `wawoff2` would work around the CDN part, but
  still means carrying two libraries for one job.
- `fontkit` bundles WOFF2 (Brotli) decompression natively and ships a dedicated browser build
  (`dist/browser-module.mjs`, picked up automatically by Vite/esbuild's default `browser` field
  resolution). Verified directly: real-world WOFF2 fixtures (`@fontsource/unbounded`'s own files,
  already vendored for this app's UI font) parse correctly via `create(bytes)`, the compiled
  browser bundle contains zero references to Node's `Buffer` and zero `eval`/`new Function` calls
  (grepped the output), and it typechecks and bundles cleanly through this project's actual
  `tsc -b`/esbuild toolchain. `@types/fontkit`'s `create()` signature is typed against fontkit's
  Node API (`Buffer`), which the browser build doesn't actually need — M5-4 casts a `Uint8Array`
  through `unknown` rather than pulling in a `buffer` polyfill just to satisfy that stale type.

**Decision:** `fontkit` (already added — `package.json`), not `opentype.js`.

### M5-2: Videos
Import, duration/cover-frame metadata, the duration badge, the hover preview, the Focus player
and the unsupported-codec fallback all shipped. **"Chosen" cover frame is the one deferred piece**
— the "Set cover frame" scrubber (§2.4's per-kind Extras column) needs its own small Focus-view UI
(a timeline + a command that re-draws/re-uploads both thumbnail sizes at the new timestamp and
updates `poster_ms`); left as a clearly scoped follow-up rather than widening this already-large
sub-task, and the plan checkbox stays unticked for it specifically.

**Ingest architecture.** Image ingest (M1) runs in a Worker pool because `createImageBitmap`
works on a `Blob` with no DOM. Extracting a video's cover frame needs a real `<video>` element to
seek to a timestamp and decode it — Workers have no DOM, and the only off-thread alternative
(WebCodecs + a manual container demuxer) is a lot of machinery for one frame per import. So
`extractVideoDerivatives` (`lib/videoFrame.ts`) runs on the *main thread*, and `VideoIngestQueue`
(`workers/videoIngestQueue.ts`, not actually a Worker despite the directory — kept there for
proximity to `IngestQueue`) processes one video at a time rather than pooled, to bound how much
main-thread time a big batch can claim at once. It reuses the same palette-extraction math
(`extractPalette`/`weightedColorFamilies` from `lib/color.ts`) as images, sampled from the poster
frame, so a video is just as searchable/connectable by color as an image — computed once here
rather than needing a separate code path anywhere else. `importItems.ts`'s `createRow` now takes a
`kind` instead of hardcoding `'image'`, and routes to whichever queue matches.

**Unsupported codecs → `status: 'unsupported'`, not a retry loop.** A `<video>` that can't decode
the file rejects `extractVideoDerivatives`'s promise; `VideoIngestQueue` catches that and marks the
item `unsupported` (a status this app already had, `ItemStatus`'s fourth value, previously unused)
rather than leaving it `pending` — `resumePendingVideoIngest`'s `WHERE` clause only re-queues
`pending` items, so a genuinely unsupported file is never retried, matching the acceptance
criterion "without error loops." The canvas card reuses the note/swatch label's Text-overlay
machinery (`Engine.syncNoteLabel`, widened to also fire for a video card with `noteText` set) to
show "Can't play this video" instead of an indefinite loading-look placeholder; Focus view shows
the same message instead of a broken `<video>` element.

**Hover preview.** `ItemCard` gained a `videoUrl` (the *original* file's URL, computed by
`itemCards.ts` the same way Focus view's `<img src>` already was, unlike `thumbUrl128/512`, which
are cached derivatives) and a `durationMs`. `Engine.updateVideoPreview` swaps the sprite's texture
to a live, muted, looping `Assets.load` video texture when the hovered card is a video and
`camera.zoom >= 0.6` (the plan's own threshold), reverting to the cached poster thumbnail
(`requestLod`, called again — its "already has this texture" guard is naturally false once the
sprite is showing the video texture, so no new code was needed there) on hover-out. Checked on
every hover change *and* every camera change, so zooming past the threshold mid-hover reacts too.
"One video at a time" falls out for free: `updateVideoPreview` always stops whatever's currently
playing before starting a new one.

**S5's spike finding, confirmed in practice:** this sandbox's Chromium can't play the demo scene's
proprietary-codec formats at all (§ the M5-1 entry above), so end-to-end testing here uses a real
WebM fixture (`tests/e2e/fixtures/sample.webm`, a 1-second VP8+Vorbis clip generated with
`ffmpeg`, `apt`-installed in this sandbox for exactly this) rather than an MP4 — MP4/H.264 and
`.mov` playback still needs the owner's real Windows/WebView2 verification per CLAUDE.md.

### M5-3: PDFs
Import, page-count metadata, the "PDF · N p" corner badge, "Set as cover", the Focus viewer
(page-by-page canvas nav) and "Split into pages" all shipped. **The Focus viewer has no
pan/zoom/fit-vs-1:1 toggle** (each page is rendered fit-to-width at a fixed long side) and there's
no separate thumbnail-strip cover-page picker — "Set as cover" is a single button in the Focus
viewer acting on whichever page is currently shown, per the scope trim decided before writing any
code. The plan's checkbox is ticked for the full line ("PDFs: import, the cover-page picker, split
into pages (pdf-lib), the Focus viewer") since every named deliverable landed; the pan/zoom
simplification is the same kind of "basic Focus viewer" trim M1's image Focus view already took
(logged there), not a missing item.

**Ingest architecture mirrors M5-2's video pattern almost exactly.** Rasterizing a PDF page to a
canvas needs the DOM (`page.render({canvasContext, viewport})`), so — like video's cover-frame
extraction — it can't run in a Worker; `lib/pdfRender.ts`'s `extractPdfDerivatives` runs on the
main thread, and `PdfIngestQueue` (`workers/pdfIngestQueue.ts`) processes one document at a time,
same shape as `VideoIngestQueue`. pdf.js already parses PDF structure off-thread via its own
internal Worker (`pdf.worker.mjs`, pointed at via `GlobalWorkerOptions.workerSrc` using
`import.meta.url` so Vite bundles it as its own asset) — that doesn't cover page rendering, which
is what actually needs the main thread here. The cover page's rendered canvas is reused for the
palette sample (`squareSample`, matching `videoFrame.ts`'s `drawSquareSample`/the image worker's
`sampleRgba`), so PDFs are searchable/connectable by color exactly like images and videos.
`page_count`/`cover_page` DB columns already existed in `001_init.sql` from M0 and only needed
TS/`rowMapping` wiring, same as `duration_ms`/`poster_ms` did for M5-2.

**A real pdf.js bug, found and worked around (not a codec-support gap this time).** The default
`pdfjs-dist` entry point (`pdfjs-dist` / `build/pdf.mjs`) calls
`Map.prototype.getOrInsertComputed(...)` internally (`getOptionalContentConfig`, hit on every
page render) — a JS engine built-in that, verified empirically, is `undefined` in *both* this
sandbox's Chromium 141 and Node 22 (`typeof Map.prototype.getOrInsertComputed === 'undefined'` in
both). Rendering any page threw `TypeError: ... getOrInsertComputed is not a function` and the
item landed `status: 'unsupported'` for every single PDF, including trivially valid ones. Fixed by
importing from pdfjs-dist's `legacy` build instead (`pdfjs-dist/legacy/build/pdf.mjs` and its
matching `pdf.worker.mjs`), which ships its own polyfill for exactly this gap for environments
lacking newer engine built-ins — same import swap needed for the worker URL. Unlike S5's video-
codec finding, this isn't a "sandbox is unrepresentative" situation: the built-in genuinely isn't
shipped anywhere yet, so the `legacy` build is the correct long-term choice here, not a sandbox-
only workaround — re-verify on the owner's Windows/WebView2 build regardless, per CLAUDE.md, since
WebView2's underlying Chromium version differs from both environments checked here.

**"Set as cover" and "Split into pages" reuse existing machinery rather than inventing new UI.**
"Set as cover" (`setPdfCoverPage`, `workers/pdfIngestQueue.ts`) factors the import path's
derive-and-persist logic into a shared function so re-rendering a chosen page for the thumbnail is
one call, not a duplicated pipeline; it's deliberately *not* wrapped in an undo command — like
Swatches' "Extract palette," refreshing derived metadata isn't a content edit the owner would
expect Ctrl+Z to walk back. "Split into pages" (`features/focus/splitPdfIntoPages.ts`) uses
`pdf-lib` (already a dependency, per the plan) to write each page out as its own single-page PDF
`File`, then hands the whole batch to the existing `importFiles` pipeline — full dedupe, placement
and ingest for free, the same way pasting several files at once already works, rather than a
bespoke import path.

**e2e fixture.** `tests/e2e/fixtures/sample.pdf` is a 3-page, ~1.4KB PDF generated with `pdf-lib`
directly (solid-colored pages with a page-number label) — no external tool needed, unlike the video
fixture's `ffmpeg` dependency.

### M5-4: Fonts
Import, metadata (family, subfamily, full name, designer, foundry, license, glyph count, variable
axes), the dark specimen card, and the Focus type tester (editable sample text, size waterfall
12–96, a glyph grid, variable-axis sliders, and the metadata panel) all shipped.

**Ingest reuses the video/PDF main-thread pattern, but with no palette/color extraction.** Parsing
(`fontkit.create`) needs no DOM and could run in a Worker, but rendering the specimen card does
(`FontFace` + canvas `fillText`), so `lib/fontRender.ts`'s `extractFontDerivatives` runs on the
main thread and `FontIngestQueue` (`workers/fontIngestQueue.ts`) processes one font at a time —
same shape as `VideoIngestQueue`/`PdfIngestQueue`. Unlike every other kind, a font's card is a
*fixed* dark design ("large 'Aa' in the font, the family name, one sample line," §2.4's table), not
a derived photo — so there's no palette/color-family step, and `itemCards.ts`'s existing
`FALLBACK_COLOR` (`0x33203d`) already equals `colors.surface2`, the card's permanent tint, with no
special-casing needed. `font_meta` (a JSON column already in `001_init.sql` from M0) stores the
parsed metadata; `page_count`/`cover_page`-style dedicated columns weren't needed since nothing
else in the schema needs to query into font metadata individually.

**A single square placeholder, like every other imported kind — a deliberate, logged deviation
from §2.4's "320 × 200" font card size.** Checked first: no imported kind's placement rect is ever
resized after ingest reports real metadata (images, videos and PDFs all keep whatever square
`PLACEHOLDER_SIZE` (320×320) `importItems.ts` placed them at, regardless of their real aspect
ratio — an existing M1-era simplification, not something M5 introduced). Giving fonts a
kind-specific 320×200 placeholder at import time would mean threading per-kind sizes through
`planBatchPlacements`/`placeBatch`'s batch-layout math, which today assumes one uniform size for
the whole batch (mixed-kind batches already work fine since layout only needs a placeholder size,
not caring what that size means) — not worth the complexity for a card whose specimen render
degrades gracefully inside a slightly-too-tall square anyway. Fonts use the same 320×320 square as
everything else; noted here rather than silently diverging from the plan's own table.

**Registered `FontFace` names are always the item id, never the font's own family name** — both in
`lib/fontRender.ts`'s temporary registration (torn down right after the specimen renders) and in
`FontFocusViewer`'s registration for the interactive type tester (torn down on unmount) — so two
different fonts that happen to share a family name (or the same font imported twice) never collide
in `document.fonts`. The Focus viewer's "editable text, size waterfall, glyph grid, variable-axis
sliders" all reference this same registered family via inline `fontFamily`/`fontVariationSettings`
CSS rather than canvas rendering — DOM text is simpler, sharper at any size, and selectable, so
canvas is only used where §2.4 actually calls for a rendered image (the specimen thumbnail).

**Glyph grid** samples the font's own `characterSet` (fontkit re-parses the already-fetched bytes
client-side in `FontFocusViewer`, capped at 200 code points to keep the grid responsive for large
CJK/icon fonts) rather than a fixed Latin/ASCII range, so a genuinely non-Latin font's Focus view
still shows glyphs that exist in it.

**e2e fixture.** `tests/e2e/fixtures/sample.woff2` is a real, already-vendored WOFF2 file
(`@fontsource/unbounded`'s own latin-400 file, the same one S6's spike verified parses correctly
with fontkit) copied in directly — no synthetic font generation needed, and it exercises the real
WOFF2 decompression path end-to-end (import → specimen thumbnail → Focus type tester showing the
font's actual name-table family, "Unbounded").

### M5-5: Links
Paste or drop a URL (also the Add menu's "Link…", Ctrl+L), metadata + cover fetch through new Rust
commands, image-URL detection (a pasted/dropped URL that itself answers with an image becomes an
Image item, not a Link), "Open in browser", and Offline mode all shipped.

**New Rust surface: `net_link_meta`/`net_download_image` (`src-tauri/src/net.rs`).** The webview
never reaches the internet (strict CSP); these are the only two places this app's Rust process
does, gated by an explicit owner action (adding a link) and Offline mode (checked in TS before
ever invoking either command — `useSettingsStore`, backed by `meta.settings` JSON, the same key
the plan's §7 names for "vocabulary order, default criteria, Offline mode" — only `offlineMode` is
wired up so far). Added `reqwest` (rustls, not native-tls/OpenSSL — one less system dependency for
the Windows installer), `scraper` (a real HTML parser for `og:*`/`<title>`/`<link rel="icon">`
tags — far more robust than regexing meta tags by hand against real-world malformed HTML) and
`url` (relative→absolute resolution for `og:image`/favicon URLs against the final, redirect-
resolved page URL). Limits match the plan's §4.4 table exactly: http(s) only, ≤5 redirects, 20s
timeout, HTML capped at 5MB, images at 50MB — enforced by streaming the response body and erroring
(not silently truncating) once the cap is crossed, checking `Content-Length` first as a fast path.

**A real bug found via testing, not just written to spec:** the naive "take the last path segment
after the last dot" extension guesser initially returned `"cover"` (the whole filename) for a URL
with no extension at all, because `str::rsplit('.').next()` returns the *whole string* when there's
no `.` to split on — Rust's `rsplit` doesn't signal "not found" the way a language with an
`indexOf`-based approach might suggest. Caught by a unit test that intentionally covered the
no-extension case, not by manual reasoning about the code; fixed with `rsplit_once('.')`, which
returns `None` cleanly instead.

**Real network I/O tested against a local loopback server, not just pure-function unit tests.**
`net.rs`'s HTML-parsing helpers (`parse_link_meta`, `guess_image_extension`) are tested as pure
functions, but the actual `reqwest` fetch/redirect/byte-cap machinery needed a real HTTP round
trip to mean anything — added `httpmock` (dev-dependency only) to spin up a real local server per
test (`127.0.0.1`, not proxied — this sandbox's `NO_PROXY` already exempts loopback, matching how
a real installed app has no such proxy at all) and verified redirects, content-type rejection, and
a real fetch end-to-end, not just mocked at the function-call boundary. This sandbox has no route
to the public internet (verified: only npm/crates.io/a short allowlist are reachable), so this was
the only way to exercise the real fetch path at all — a pure-mock test would have missed the
`rsplit`/`rsplit_once` bug above, since a mocked `reqwest::Response` was never actually involved.

**A pre-existing bug fixed in passing:** `media.rs`'s `SUPPORTED_EXTENSIONS` (Folder import's own
Rust-side allowlist, separate from `lib/fileKinds.ts`'s) still only listed image extensions, with
a doc comment claiming "no ingest worker exists for video/PDF/font yet" — stale since M5-2/M5-3/
M5-4 landed those ingest queues. Folder-importing a directory containing a video/PDF/font file on
the actual Tauri build would have silently skipped it as "unsupported" despite Designspace being
able to ingest it via drag-and-drop or Files…. Fixed by widening the list to match; caught while
touching this file to expose `import_bytes`/`with_library` to the new `net` module, not something
this sub-task set out to look for.

**Cover-image ingest reuses the existing image Worker pool rather than a new "LinkIngestQueue."**
Once `net_download_image` returns a downloaded cover, it's just an image at that point — handing
its `{itemId, relPath, mime}` straight to `getIngestQueue` (the same pool image imports use)
derives thumbnails/palette and flips `status` to `'ok'` for free, with zero new ingest-pipeline
code. `cover_path` (not `file_path`) holds that relative path — a link's "original" is the
webpage, not a local file, so `file_path` stays null for links (nothing to reveal in Explorer or
send to the Recycle Bin, matching every other kind's convention that `file_path` is the sacred,
purge-able original).

**A failed fetch is `status: 'ok'` with a domain-only card, never `'unsupported'`/`'error'`** —
per §2.3's own wording ("If it fails (offline, blocked site), the card stays a clean domain
card"). Nothing about the *link itself* is broken when `net_link_meta` fails; unlike an
unparseable video/PDF/font file, there's no reasonable "fallback tile" state other than exactly
what the card already looks like before metadata arrives. `enrichLink` is idempotent (a retry just
overwrites the same fields), so `resumePendingLinkIngest` doesn't need to distinguish "metadata
never fetched" from "metadata fetched, cover ingest interrupted" — it just re-runs the whole thing
for anything still `pending` after a crash/force-quit.

**Placement size: the same 320×320 square every other kind uses, not §2.4's literal 320×240** —
the identical, already-logged (M5-4) deviation: no imported kind's placement rect is ever resized
after the real aspect ratio is known, so a link-specific size would need threading a per-kind size
through the shared batch-placement math for no real benefit.

**Scope trim, logged rather than silently dropped — and why the plan's checkbox for this row
stays unticked:** no favicon glyph in the canvas card (§2.4's "footer: favicon · domain · 2-line
title") — the domain-only fallback card reuses the existing plain-text Text-overlay machinery
(domain + title, two lines) rather than adding icon-rendering to the canvas engine for one small
glyph; the favicon URL is still fetched and stored in `link_meta` for a future Focus-view/List
use. More significantly: **"custom cover" (§2.4's Link Extras column — replacing a link's cover by
pasting/dropping an image onto its existing card) was not built.** Following the same rule M5-2's
"chosen cover frame" checkbox followed (a named deliverable that's genuinely missing keeps the
whole line unchecked rather than being counted as done), the plan's Links checklist line stays
`[ ]` even though everything else it names shipped — a clearly scoped follow-up, not a silent gap.

### M5-6: Kind filter and Kind grouping everywhere
The Kind facet filter (Search's Filters menu) and Kind grouping (List panel's "Group by") were
both already built generically back in M2-6/M2-8, before every kind existed — `SearchBar.tsx`'s
`KINDS` array and `listGrouping.ts`'s `kind` branch already covered `video`/`pdf`/`font`/`link`,
so nothing was structurally missing. What this pass actually found and fixed:

**Every kind rendered as its raw lowercase DB value, everywhere.** The Kind filter chips/buttons
showed "pdf", "font", the List panel's group headers showed "pdf" as a section title, and the
Details panel's Info row showed `item.kind` unformatted. Added `en.kind` (a display-name map,
`pdf` → "PDF", etc. — kept in `i18n/en.ts` per CLAUDE.md's "strings in one place") and used it in
all three places (`SearchBar.tsx`, `listGrouping.ts`, `DetailsPanel.tsx`).

**Triage's preview only ever worked for images — a real, not cosmetic, gap.** `TriageView.tsx`
rendered `<img src={platform.media.originalUrl(item.filePath)}>` unconditionally: fine for an
image, but a browser can't display a video or PDF file through `<img>`, and a link has no
`filePath` at all (its "original" is a webpage, not a local file — see M5-5's decision on why),
so three of the seven kinds that can land in the Inbox would show a broken image icon or nothing.
Since every media kind now has a cached `t128`/`t512` thumbnail once ingest finishes (images,
video posters, PDF cover pages, font specimens, and a link's downloaded cover all go through that
same cache), switched Triage's preview to `platform.cache.url('t512/…')` gated on `status ===
'ok'` — the exact same pattern the List panel's gallery tiles already use — rather than the
original file. The stale doc comment claiming this was deferred "until [video/PDF/link]
importers land in later milestones" was itself the tell: those milestones had already landed.

**Added `duration`/`pages` to the Details panel's Info row** (§2.4's spec table: "Kind, date
added, dimensions, file size, duration, pages, file location") — these existed on the `Item` type
since M5-2/M5-3 but were never surfaced there. Extracted `formatDuration` out of `Engine.ts` (it
already had one, for the canvas duration badge) into `lib/formatDuration.ts` so the canvas badge
and the Details panel format a clip's length identically rather than drifting.

### M5 wrap-up
Every checklist item shipped except the two individually-logged, deliberate exceptions: Videos'
"chosen" cover frame (the scrubber UI, M5-2) and Links' "custom cover" (replacing a cover after
the fact, M5-5) — both named deliverables that didn't land, so both checklist lines stay unticked
rather than counted as done, following the same rule this project has used since M3's "(If time
allows) Arrange by…". Every other line, including both spikes, all four new kinds' full ingest→
canvas→Focus pipelines, and the Kind filter/grouping sweep, is checked and real.

**The milestone's throughline: one ingest architecture, reused four times.** M5-2 (Videos)
established the pattern every later kind followed almost unchanged: parsing/rendering that needs
the DOM (a `<video>` element, a PDF page canvas, a registered `FontFace`, a downloaded cover
image) can't run in a Worker, so it runs on the main thread, one main-thread `*IngestQueue` class
processes items sequentially rather than pooled (bounding how much main-thread time a big batch
claims at once), a failure marks `status: 'unsupported'` rather than retrying forever, and the
same `t128`/`t512` cache + palette-extraction math derived for images gives every new kind a
consistent thumbnail and searchable color for free. M5-3 (PDFs) and M5-4 (Fonts) both reused this
shape directly; M5-5 (Links) reused it differently but just as directly — a link's downloaded
cover is *literally just an image* at that point, so its ingest is the existing `IngestQueue`
(the image one), not a fifth queue class.

**Two real, load-bearing bugs found through testing, not code review — both logged where they
happened, worth repeating here because of what they say about verification depth.** pdf.js 6.3's
default build calls a JS engine built-in (`Map.prototype.getOrInsertComputed`) that, checked
empirically, isn't shipped in *any* browser yet — every single PDF import would have silently
landed as `status: 'unsupported'` had the M5-3 e2e test not actually exercised a real PDF end to
end rather than stopping at unit tests of the parsing logic. Rust's naive file-extension guesser
(M5-5) returned the whole filename instead of `None` for a URL with no extension, because
`str::rsplit` doesn't signal "not found" — caught by a unit test written specifically to cover
that edge, and only findable that way, not by reading the code. Both fixes ended up nontrivial
(switching pdf.js's import entrypoint; `httpmock` for real local HTTP round-trips) precisely
because the bugs were real integration failures, not typos — the kind pure-mock tests structurally
cannot catch.

**Two real, pre-existing bugs fixed in passing, both predating M5 and unrelated to what each
sub-task set out to build.** `media.rs`'s Rust-side `SUPPORTED_EXTENSIONS` (Folder import's own
allowlist) still only listed images long after M5-2/M5-3/M5-4 gave Designspace real video/PDF/
font ingest — Folder-importing a directory with any of those file types on the actual Tauri build
would have silently skipped them. `TriageView.tsx`'s preview only ever worked for images, with a
doc comment explicitly (and, by M5, wrongly) claiming that was still deferred. Both were caught by
auditing "does this surface actually support every kind" rather than by symptom reports, which is
the same lens M5-6 applied everywhere else.

Verification for the whole milestone (not just the last sub-task): `tsc -b --noEmit`, `eslint .`,
`prettier --check .`, `vitest run` (316 tests across 49 files), `vite build`, `cargo fmt --check`,
`cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace` (40 tests)
are all clean; the full Playwright suite (40 specs, including four new M5 ones) passes end to end
against the real browser build. No tag for M5 — same as M3/M4, the plan only calls for tagging at
the end of M2 (`v0.1.0`).

**Owner checks:**
- Import a real video, PDF and font (or the ones this session generated: `tests/e2e/fixtures/
  sample.webm`/`sample.pdf`/`sample.woff2`) on your actual Windows/WebView2 install — this sandbox
  can't play MP4/H.264 or `.mov` at all (S5's finding), so that's real verification this session
  couldn't do itself. Does the video actually play? Does the PDF page render correctly? Does the
  font specimen look right?
- Paste or drop a real URL (a news article, a product page) with Offline mode off. Does the
  preview card sharpen with a real title and cover image within a few seconds? Turn Offline mode
  on in Settings → Content & network and try again — does it land as a clean domain card with no
  network attempt at all?
- Open the List panel, group by Kind, and confirm every kind you've added shows up with a real
  label (not a raw lowercase word) and its own thumbnail.

---

## M6-1: model bundling, ONNX WASM, local-only `env`

`scripts/fetch-models.mjs` delegates entirely to `@huggingface/transformers`'s own
`.from_pretrained()` dependency resolution rather than hand-maintaining a file manifest for CLIP
ViT-B/32 (`Xenova/clip-vit-base-patch32`) — verified correct by reading the library's own
Node file-system cache key logic (`buildResourcePaths` in `utils/hub.js`): for the default "main"
revision it's exactly `{modelId}/{filename}`, the same relative shape the runtime's
`env.localModelPath` convention expects (`{localModelPath}/{modelId}/{filename}`). Pointing
`env.cacheDir` at `src-tauri/resources/models` at fetch time therefore lands every file exactly
where the bundled app will read it from later via `media://models/…` — no separate "flatten the
cache into place" step. huggingface.co is blocked in this sandbox (per CLAUDE.md), so the script is
only verified structurally here: it fails at the expected network call (`config.json`), not
earlier, proving the env config and import resolution are both correct up to that boundary. The
real download only happens with real internet — a local run, or `windows-build.yml`'s new
model-caching step (`actions/cache`, keyed by `fetch-models.mjs`'s own hash, so a script change
invalidates the cache but a routine rebuild reuses it).

`scripts/copy-ort-wasm.mjs` bundles only the `.asyncify` ONNX Runtime WASM variant (~25.6 MB),
not the full ~136 MB `onnxruntime-web` `dist/` — confirmed by reading `backends/onnx.js`'s own
default-path-selection logic that `.asyncify` is used everywhere except Safari < 26 without
WebGPU, and WebView2 is always Chromium. Resolving the package's on-disk location took three
attempts: `onnxruntime-web/dist/…` isn't a direct dependency of this app so `require.resolve`
can't reach it from here; `onnxruntime-web/package.json` resolved via `{paths: […]}` but isn't in
that package's `exports` map (`ERR_PACKAGE_PATH_NOT_EXPORTED`); resolving the `onnxruntime-web/
webgpu` entry point instead — one transformers.js itself imports, so guaranteed present in
`exports` — and taking its `path.dirname()` finally worked.

`src/lib/ai/env.ts` splits the env configuration in two: `computeAiEnvConfig` (main-thread only,
since `convertFileSrc` needs the Tauri API that a plain Worker can't reach) resolves the actual
`media://models/` URL, and `configureTransformersEnv` (a pure function taking a narrow
`TransformersEnvLike` shape, not the real `@huggingface/transformers` `env` object, so it doesn't
need that ~expensive import just to be unit-tested) applies it — the AI worker (M6-2) will receive
the computed config over `postMessage` at startup and call the latter itself. In the browser dev
build, `localModelPath` is `null` (no models are bundled there); the AI worker is expected to fall
back to `FakeEmbeddingProvider` whenever it's null, never attempting a real model load.

**Owner checks:** none yet — this sub-task is pure infrastructure with no visible surface. The
next sub-task (the AI worker) is where suggestions start actually appearing.

## M6-2: the AI worker, embeddings storage, background analysis

**`embeddings_put`/`embeddings_load`: base64-over-JSON, not raw binary IPC.** The plan calls for
"binary IPC, so vectors never go through JSON" — a full library's worth of vectors (10,000 × 512
floats ≈ 20 MB) as a JSON array of numbers would run several times that in transit and be slow to
parse. Tauri 2 does have a raw-request-body IPC path that would avoid even the base64 overhead,
but its exact JS-side surface (a raw `ArrayBuffer` body alongside the `model`/`itemIds` metadata
this command also needs) isn't something this sandbox can exercise against a real WebView2 host to
be sure it's wired correctly, and getting it subtly wrong would only surface once the owner tries
it on Windows. Base64-over-JSON is the documented middle ground instead: a single string field,
~33% bigger than raw bytes rather than the 4-8x a JSON number array would cost, built entirely from
APIs this app already exercises elsewhere (`invoke` with plain JSON args, matching `cache_put`'s
existing `Array.from(bytes)` precedent — except here the payload is base64'd instead of turned
into a JSON array, since embeddings are the one payload in this app large enough for that
difference to matter). `src/lib/base64.ts` chunks the encode/decode (`String.fromCharCode` blows
the call stack past ~100K elements passed as spread arguments) — tested with a 200,000-byte buffer.
Rust-side, `put`/`load` are thin command wrappers around pure functions (`put_embeddings`/
`load_embeddings`, taking a `&Connection` directly) tested against an in-memory SQLite DB, mirroring
`media.rs`'s existing pattern of testing the pure logic rather than the `#[tauri::command]`
wrapper (constructing a real `State<'_, AppState>` in a unit test isn't practical outside a running
app).

**`quantized: true` was already wrong in M6-1's `fetch-models.mjs`, caught only once `tsc` had a
real call site to check against.** `@huggingface/transformers` 4.x renamed the old `@xenova/
transformers` `quantized` boolean to a `dtype` string (`'fp32' | 'fp16' | 'q8' | ...`); passing
`quantized: true` is silently ignored by the new API rather than erroring, so M6-1's fetch script
would have downloaded full fp32 weights (~4x the intended size) without complaint. Caught only when
`clipEmbeddingProvider.ts` used the same option and `tsc` flagged it — JS scripts aren't
typechecked, so the pre-existing bug in `fetch-models.mjs` needed a manual audit once the same
mistake surfaced in typed code, not a compiler error of its own. Fixed by removing the option
entirely: reading `utils/dtypes.js`'s own `DEVICE_DTYPE_MAPPING`, the `wasm` device (the only
device this app ever runs on) already defaults to `q8` — exactly what `quantized: true` used to
request — so there's nothing to pass.

**The embedding provider takes raw image bytes, not an `ImageBitmap`** (`EmbeddingProvider.
embedImage(bytes, mime)`), matching `ingest.worker.ts`'s existing convention — `ImageBitmap` isn't
constructible in a fake/test context without a real browser, while an `ArrayBuffer` is exactly
what a `fetch()` of the cached `t512` derivative already returns, and it transfers to a worker with
zero copy. `FakeEmbeddingProvider` decodes those bytes as UTF-8 text to get a seed: meaningless for
real image bytes (production never routes real images through the fake provider), but it means
tests can pass plain descriptive strings as "image bytes" and get controllable similarity — a bag-
of-tokens hash embedding where shared words add constructively (verified: "a golden retriever
puppy in a park" scores higher against "a golden retriever puppy running outside" than against "a
stack of blueprints on a desk"), which is what the plan's "deterministic vectors with controllable
similarity" asks for without needing a real model.

**`ai.worker.ts` degrades to the fake provider automatically, not just in tests.** `computeAiEnvConfig`
returns `localModelPath: null` in the browser dev build (no models are ever bundled there — hugging
face.co is blocked in cloud sessions per CLAUDE.md), and the worker's `loadProvider` treats a null
path as "no model available" rather than a caller error, falling back to `FakeEmbeddingProvider`
transparently. This means the whole AI pipeline (background analysis, embeddings storage,
suggestions once M6-3 lands) is exercisable end-to-end in the browser dev build and in Vitest/
Playwright without ever touching the real model — only Spike S7's actual load-time/memory/ms-per-
image numbers require a real Windows build, exactly as the plan anticipates.

**`AiQueue.getAiQueue` fails soft, not loud, if a `Worker` can't be constructed.** Wiring
`queueAiAnalysis` into every ingest queue's persist step (image/video/PDF/font — links reuse the
image queue for their downloaded cover, so no separate wiring was needed there) means it now runs
inside `ingestQueue.test.ts`'s existing `persist()` unit test, which calls a plain `Connection`-less
fake `Platform` with no real `Worker` global (jsdom doesn't implement one). Rather than special-case
the test environment, `getAiQueue` catches a failed `new Worker(...)` and logs + returns `null`:
ingest must never fail because AI analysis couldn't start, in a test runner or (defensively) in any
real environment that somehow lacks `Worker`. Every real target this app ships to (WebView2,
Playwright's Chromium, the browser dev build) has `Worker`, so this never triggers outside tests.

Verification for this sub-task: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run`
(333 tests across 53 files, up from 316/49 at the end of M5), `vite build` (confirms the CLIP/
transformers.js import graph — 586 KB minified — lands in `ai.worker`'s own chunk via the worker's
dynamic `import()`, not inflating the main bundle, and that the ~26 MB ONNX WASM binary lands in
`dist/assets` via the `prebuild` hook), `cargo fmt --check`, `cargo clippy --workspace
--all-targets -- -D warnings`, and `cargo test --workspace` (45 tests, up from 40 — 5 new for
`embeddings.rs`) are all clean.

**Owner checks:** none surfacing yet — Details/Triage suggestions, Find similar, and Settings → AI
land in the next few sub-tasks. What is verifiable now, on your Windows build once you've run
`node scripts/fetch-models.mjs` with real internet: import a few images and confirm (via a debugger
or a temporary log) that `embeddings` rows appear for them within a few seconds without any visible
UI change yet.

---

## CI fix: `src-tauri/resources/models/` must exist even without a fetched model

M6-1's `tauri.conf.json` change (`bundle.resources: {"resources/models": "models"}`) turned out to
break `cargo build`/`clippy`/`test` outright in CI: `tauri-build`'s resource-copy step runs on
*every* build, not just `tauri build` packaging, and CI never runs `fetch-models.mjs` (only
`windows-build.yml` does — see its own new caching step, M6-1). A fresh checkout therefore had no
`src-tauri/resources/models/` directory at all, and the build failed with `resource path
"resources/models" doesn't exist` before a single test ran. This sandbox's own local checkout had
silently avoided the bug only because an earlier manual `mkdir` for local testing happened to leave
the directory in place — a difference between "works in this session" and "works on a clean
checkout" that only surfaced once CI ran the real diff. Fixed by force-adding a tracked `.gitkeep`
inside the (otherwise still fully gitignored) directory, so it exists on every checkout without
ever committing real model bytes.

## M6-3: Suggestions (zero-shot + personal blend)

`src/lib/ai/suggestions.ts` implements §4.10's formulas exactly as specified — `zeroShotScores`
(softmax over `100·cos`), `personalScores` (similarity-weighted neighbor voting), `blendAlpha`
(`max(0.25, 1 − labeled/150)`) — as pure functions over already-computed `Float32Array`s, so the
whole scoring engine (14 tests) is verifiable without a model, a worker, or a database. One
interpretation call the plan leaves implicit: the zero-shot softmax is computed over *every* value
in the field (not just eligible ones), matching the plan's literal "softmax over the field's
values"; exclusion (assigned/dismissed) is applied afterward, to the final ranked list — softmax
would otherwise redistribute probability mass onto excluded values, which reads as more "the plan's
formula, filtered" than "a different formula."

**`AiQueue` gained a second request lane (`embedText`) that bypasses the background-analysis
queue entirely.** Value/prompt embeddings (Appendix B) and, later, search-by-meaning queries are
interactive and small — routing them through the same one-item-at-a-time image queue would make a
Details panel selection wait behind whatever background analysis happens to be mid-flight.
`embedText` posts straight to the shared worker (reusing its already-loaded model rather than
spinning up a second one) and resolves via a `pendingText` map keyed by request id, decoupled from
the queue's `busy`/`pump` bookkeeping.

**Value embeddings cache in memory only, not in `embeddings` (the table is item-keyed, not
term-keyed) or a new migration.** The plan calls them "cached and recomputed when a vocabulary
changes" without specifying persistence; given the vocabulary is small (dozens of terms) and
recomputing costs a few `embedText` calls, an in-memory `Map<termId, Float32Array>`
(`valueEmbeddings.ts`) that the vocabulary commands (rename, hint edit, merge, delete) explicitly
invalidate is simpler than a schema migration for what's essentially a derived cache — and avoids
a stale-vocabulary-embedding class of bug a persisted cache would need its own invalidation
tracking for anyway.

**`computeSuggestions` (`src/features/ai/`) is the one orchestrator both Details and Triage call
through `useSuggestions`, a shared hook** — accept/dismiss/Accept all behave identically in both
surfaces, and Triage's `A` key (a documented no-op since M2-5, waiting for exactly this) now calls
the same `acceptAll` the Details panel's button does. Each surface owns its own `useSuggestions`
call (Triage's also drives the `A` key directly) rather than sharing one instance across both,
since they're never mounted at once. "Labeled in field" for `blendAlpha` counts classified
neighbors *among items with an embedding so far* (background analysis may still be catching up on
a large library) rather than a separate DB query — a documented undercount that only softens the
zero-shot/personal blend, not a correctness bug.

**Dismissing a suggestion (`ai_dismissed`) is not a `Command`.** Same reasoning already applied to
"Set as cover" and "Extract palette": it's a standing preference ("don't suggest this again for
this item"), not a content edit an owner would expect Ctrl+Z to walk back.

Accepting a suggestion reuses the existing `createSetItemTypeCommand`/`createAddItemTermCommand`
(passing `{id: termId}` for an existing term) rather than a new command type — both now take an
optional `via: TermVia` parameter (default `'user'`, matching every pre-existing manual-selection
call site unchanged) so `useSuggestions.accept` can pass `'ai'` through to the `item_terms` row it
writes, satisfying the plan's M6 acceptance line ("Accepted values are saved with `via = 'ai'`")
without duplicating either command.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (360 tests across
56 files, up from 333/53 at the end of M6-2 — 27 new: `suggestions.ts` 14, `valueEmbeddings.ts` 6,
`computeSuggestions.ts` 5, `aiQueue.ts`'s two new `embedText` cases), `vite build`, `cargo fmt
--check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace`
are all clean.

**Owner checks:** on your Windows build with real embeddings — open Details on a classified image
similar to others you've already tagged, and check that at least one dashed "suggested" chip shows
up with a plausible value. Click it to accept (it should look exactly like adding the value
yourself), and the ✕ next to another to dismiss it (re-opening the item shouldn't bring it back).
In Triage, press `A` on an item with suggestions showing and confirm every chip gets accepted at
once.

---

## CI fix: `aiSuggestions.dismiss` collided with the board tray's `suggestions.dismiss`

M6-3's Details/Triage dismiss button reused the exact string "Dismiss suggestion" the M4-10 board
suggestions tray already used for its own, unrelated dismiss button. Harmless until both render on
screen at once (a board with classified items that also have AI suggestions showing) — caught by
CI, not locally, because `tests/e2e/smoke-m4-suggestions-tray.spec.ts` uses `getByRole('button',
{ name: 'Dismiss suggestion' })`, and the real fixture data in that test happens to produce both.
Renamed to "Dismiss AI suggestion" — the two features stay conceptually separate (one dismisses an
unadded board match, the other dismisses an AI classification suggestion) and now read distinctly
in the accessibility tree too.

## M6-4: Find similar, the Similar look criterion, search by meaning, board similarity

**"Similar look" reuses the existing `ConnectionIndex`/`scoreCandidates` machinery from M3 rather
than a parallel code path** — the type (`Criterion`), the popover entry, and even the color token
were already scaffolded in M3 with a comment saying exactly this: "needs the AI pipeline from M6
... kept in the type so the popover and the color/line-style tokens don't need to change shape
later." `buildConnectionIndex` gained an optional `embeddings` param that's passed straight through
to a new `ConnectionIndex.embeddings` field rather than folded into the inverted index
(`itemsByValue`) every other criterion uses — cosine similarity has no discrete "value" two items
either share or don't, so `scoreCandidates` special-cases `'similar'` exactly the way it already
special-cased `'manual'` (a criterion whose "value" is also not a shared attribute). One real
correctness fix during this: the first pass scored `similar` matches with the raw cosine
(e.g. 0.87), which `scoreCandidates`' `minStrength` filter (default 1, meaning "at least one
qualifying criterion") then silently dropped, since 0.87 < 1 — every `similar`-only hover produced
zero candidates despite matching. Fixed by scoring a qualifying match as a flat `+1` (like
`manual`), matching `minStrength`'s "count of criteria" semantics; the actual cosine still goes
into `shared` for the hover tooltip ("Similar look: 87%"). Caught by a test that asserts a
same-item-embedding pair (cosine ≈ 1) actually appears in `scoreCandidates`' output — it didn't,
until this fix.

**`useEmbeddingsStore` is the main-thread mirror of the `embeddings` table**, loaded once at
startup (`loadEmbeddings`, alongside `loadSettings`) and kept live by `AiQueue.handleResult`
pushing each newly-persisted vector into it as background analysis progresses — so "Similar look"
connections, Constellations, and Find similar never need their own async round trip mid-
interaction, the same reasoning `termStore`/`libraryStore` already apply to everything else. Wiring
it into `layout.worker.ts` needed a genuine circular-import fix: `AiQueue` (writes) and
`embeddingsStore.ts` (reads) both needed `CLIP_MODEL`, and importing it from `aiQueue.ts` into
`embeddingsStore.ts` while `aiQueue.ts` also needs to import `embeddingsStore.ts` (to push live
updates) would create an import cycle; moved the constant to a new one-line `src/lib/ai/model.ts`
both import from instead.

**Constellations' `similar` re-settle trigger uses `embeddings.size`, not a full per-item
signature.** `useConstellationsBinding`'s existing `itemsSignature` optimization (a string built
from just the fields that could actually move a layout, to avoid restarting the 800ms morph on
every quiet ingest write) has no natural way to represent "did any embedding change" cheaply — a
full per-item embedding signature would be the exact expensive computation the optimization exists
to avoid. The vector count is a rough but cheap proxy: it changes once per completed background-
analysis batch, not per vector, so `similar`-driven Constellations settles increasingly less often
as the library finishes analysis, which is the right direction even if not perfectly precise.

**Find similar and board similarity are pure, synchronous functions** (`findSimilar.ts`,
`boardSimilarSuggestions.ts`) over the same `useEmbeddingsStore` map "Similar look" reads — no new
async plumbing needed since the embeddings are already in memory. Find similar sits on the Details
panel next to the thumbnail (only rendered once the item actually has an embedding) and calls the
same `Engine.setSelection`/`zoomToIds` "Frame results" already uses, so it behaves identically to
every other "select these items and fly to them" action in the app. The board suggestions tray
(M4-10) now fills any slots the source-filter matches leave empty with the centroid-based
similarity result, and — unlike before — now also produces suggestions for a board with placed
items but no source filter at all (an empty/manually-built board), which the tray previously always
returned nothing for.

**Search by meaning is additive to the existing text/facet result set, not a separate results
section**, despite §2.10's wording suggesting a distinct "section." Building a second, parallel
results UI (with its own List-panel-equivalent, its own Dim/Hide semantics, its own "Frame these
too") would have roughly doubled this sub-task's scope for a UI difference the owner may not even
prefer; unioning `searchByMeaning`'s matches into the same `Set<string>` every other feature
(Dim/Hide, the List panel, Frame results, "Create board from results") already consumes means a
semantic match behaves exactly like a text match everywhere in the app for free, gated behind the
explicit "Include visual matches" toggle so it's opt-in per search. `useSearchResults` gained a
required `platform` parameter (it needs to reach the AI worker for `embedText`) — propagated to
its five call sites (`useSearchBinding`, `useConnectionsBinding`, `useConstellationsBinding`,
`SearchBar`, `ListPanel`), all of which already had `platform` available.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (377 tests across
59 files, up from 360/56 at the end of M6-3 — 17 new across `findSimilar.ts`,
`searchByMeaning.ts`, `boardSimilarSuggestions.ts`, and four new `'similar'`-criterion cases in
`connections.test.ts`), `vite build`, `cargo fmt --check`, `cargo clippy --workspace
--all-targets -- -D warnings`, and `cargo test --workspace` are all clean.

**Owner checks:** on your Windows build with real embeddings — open the Connections popover,
enable "Similar look" alone, and hover a classified item: do the highlighted lines actually go to
visually similar items? Try Constellations by Similar look on a real library and see if the
clusters look sensible. Open Details on an image with visual neighbors and click "Find similar" —
does the canvas select and fly to a plausible set? Turn on "Include visual matches" in the search
bar and type a description ("a red sports car") with no matching text/tags in the library — do
visually matching items show up in the results count? On a board with placed items, check that the
suggestions tray now offers visually-similar library items even without (or in addition to) a
source filter.

---

## M6-5: Settings → AI

Fills in the placeholder M4/M5 already left in `SettingsDialog.tsx` ("AI is a placeholder naming
the milestone that fills it in"). Three pieces: the on/off switch (already existed as
`settingsStore.aiEnabled` since M6-2 — this sub-task is the first thing that actually surfaces it
in the UI), whether a real model is bundled in *this* build (`computeAiEnvConfig(platform.kind)
.localModelPath !== null` — `null` in the browser dev build, where CLAUDE.md's "use the fake
embedding provider" applies, so the page says so plainly rather than showing a progress bar that
would never move), and live background-analysis progress (`AiQueue.onProgress`, the same
subscription mechanism M6-2 built for exactly this) with pause/resume.

`AiQueue` gained a public `isPaused` getter and `pause()`/`resume()` now call `notify()` — before
this sub-task nothing outside `AiQueue` itself needed to know its paused state (the background
queue simply stopped dispatching), but Settings → AI needs to render the Pause/Resume button's
current label correctly without polling.

Turning AI off doesn't touch existing `embeddings` rows or `ai_dismissed` entries — the plan's
"never applied automatically" spirit for suggestions extends here too: it's a preference toggle,
not a delete. Re-enabling picks up exactly where background analysis left off, via M6-2's existing
`resumePendingAiAnalysis`.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (378 tests across
59 files — one new `AiQueue.isPaused` case, folded into the existing pause/resume test rather than
a separate one), `vite build`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D
warnings`, and `cargo test --workspace` are all clean.

**Owner checks:** open Settings → AI. With AI on and a real model bundled, does it say so, and do
the Analyzed/Remaining counts move as you import? Pause analysis mid-run, confirm the count stops
moving and the button now says "Resume analysis," then resume and confirm it picks back up. Turn
AI off, confirm every AI-surfacing feature (Details suggestions, Find similar, Similar look,
Include visual matches) disappears or stops functioning, then turn it back on and confirm
suggestions come back without re-analyzing from scratch.

---

## M6-6: zero-network audit, and M6 wrap-up

**The "zero network requests" check is a code-review audit, not a live DevTools capture** — this
sandbox has no real browser DevTools attached to a running WebView2 app, and Spike S7 (a Windows
build measuring CLIP's actual load time/throughput/memory) is explicitly out of scope here for the
same reason (per CLAUDE.md and the plan's own §4.10 accommodation). What's verifiable from the code
instead, and was verified:
- `tauri.conf.json`'s CSP `connect-src` is `'self' ipc: http://ipc.localhost media:
  http://media.localhost` — no external host, no wildcard. This is enforced by the WebView2 engine
  itself, independent of any application-level mistake; even a bug in the AI code couldn't reach an
  external host through the webview.
- No file under `src/lib/ai/`, `src/workers/ai.worker.ts`, or `src/workers/aiQueue.ts` contains a
  literal `http://`/`https://` URL (grepped) — the AI pipeline never constructs a remote address
  of its own.
- Read `@huggingface/transformers`'s own `utils/hub.js`: when `env.allowRemoteModels = false`
  (which `configureTransformersEnv` always sets before any real model load — see M6-2) and a local
  file isn't found, it throws (`` `env.allowRemoteModels=false`, but attempted to load a remote
  file from: ...` ``) rather than falling back to `env.fetch`. There is no code path in the library
  itself that reaches the network once that flag is false, independent of our own CSP belt-and-
  suspenders.
- The browser dev build never even reaches this code: `computeAiEnvConfig('browser')` returns
  `localModelPath: null`, and `ai.worker.ts`'s `loadProvider` treats that as "no model available,"
  using `FakeEmbeddingProvider` instead of importing `@huggingface/transformers` at all.

Real confirmation (DevTools Network tab showing literally nothing on a running Windows build, with
AI enabled and background analysis active) is the owner's to do — noted in the owner checks below.

**M6 close-out.** Every planned sub-task is done except Spike S7 itself, which needs real Windows
hardware this sandbox doesn't have; §8's three other M6 acceptance lines are all met:
"suggestions within about 2 s" (queued the moment `t512` lands, §4.7 step 3, not on a timer),
"no visible jank" (structural — one item at a time, low priority, pausable, same pattern as image
ingest that already meets this bar), and "accepted values saved with `via = 'ai'`" (this sub-task's
own fix, see above).

Verification for the whole milestone (not just the last sub-task): `tsc -b --noEmit`, `eslint .`,
`prettier --check .`, `vitest run` (378 tests across 59 files, up from 316/49 at the end of M5),
`vite build`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and
`cargo test --workspace` (45 tests, up from 40 at the end of M5) are all clean. The Playwright
suite wasn't re-run end-to-end as part of this close-out (M6 added no new e2e specs — AI features
depend on a real model this sandbox can't fetch, so they're covered by unit/integration tests using
`FakeEmbeddingProvider` instead, per the plan's own "huggingface.co is blocked in cloud sessions"
accommodation); the existing 40-spec suite's pass/fail status is tracked via this PR's CI, not
re-run locally for this entry. No tag for M6 — same as M3–M5, the plan only calls for tagging at
the end of M2 (`v0.1.0`).

**Owner checks:**
- Run `node scripts/fetch-models.mjs` with real internet, then build and open the Windows
  installer. Confirm the model actually downloaded into `src-tauri/resources/models/` and the
  installer includes it.
- Open DevTools' Network tab, enable AI, import a batch of new images, and watch background
  analysis complete. Confirm literally zero requests appear — not even a failed/blocked one.
- Run Spike S7: load time, ms/image with threads, memory, and (if available) MobileCLIP vs
  ViT-B/32. Update `docs/IMPLEMENTATION_PLAN.md`'s S7 checkbox and this file with the numbers.
- Work through the M6-1 through M6-5 owner checks above if you haven't already — they cover the
  actual features (suggestions, Find similar, Similar look, search by meaning, Settings → AI) this
  entry doesn't re-list.

---

## M7: Safety & polish → v1.0.0

**M7-1a: Backups extra destination.** §5.4's "optional extra destination (e.g. a OneDrive folder)
receives a copy" of every backup. Added `backupExtraDestination: string | null` to the library
settings JSON (same `meta.settings` blob and "no separate Save step" convention as Offline mode
and the AI toggle), a folder picker in Settings → Library, and `copy_to_extra_destination` in
`src-tauri/src/backups.rs`, called from `backup_now` after the primary `VACUUM INTO` copy already
succeeded. The copy is best-effort by design: a missing, blank or unwritable extra destination
never fails the backup itself, since the primary copy (what Restore reads from) is unaffected
either way — silently skipped rather than surfaced as an error, since a blank/misconfigured folder
is at least as likely to mean "not set up yet" as "broken."

**M7-1b: Library export (JSON/ZIP).** §5.4's "a JSON file with all metadata (items, terms, boards,
placements, frames, connections, filters), optionally zipped with the media," in Settings →
Library next to Backups. Split the work at the natural seam:
- **Plain JSON** needed no new Rust surface at all — `src/features/export/exportLibrary.ts` builds
  the manifest client-side from ordinary `platform.db.select()` queries (one per table:
  `items`, `terms`, `item_terms`, `boards`, `placements`, `frames`, `manual_connections`,
  `saved_filters`, plus `schema_version`) and hands the bytes to the existing generic
  `platform.dialogs.saveFile()` — the same "Save As…" path used for PNG/PDF board exports (M4-7)
  and Focus's other outputs. Works on both platforms.
- **ZIP with media** needed one new command, `export_library_zip` (`src-tauri/src/export.rs`):
  only Rust has direct filesystem access to stream the `media/` directory (potentially gigabytes)
  into an archive without routing those bytes through IPC as base64 or a JSON array. It opens its
  own "Save As…" dialog (mirroring `dialog_save_file`'s pattern) and writes the frontend-built
  JSON manifest plus every file under `media/` into a single zip, using the new `zip` crate
  (v8.6.0, `deflate` feature only — no encryption/bzip2/lzma, which this app has no use for).
  Tauri-only, matching every other filesystem-touching command; `BrowserPlatform.libraryExport.zip`
  throws `notSupported`, same convention as `media.listFolder` etc.

Soft-deleted rows (Trash) are exported as-is — `deleted_at` is part of the metadata, not a reason
to drop a row, since this is meant as a portable archive/backup of the library, not a "clean"
snapshot a fresh import would produce.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (378/378, unchanged
— no new unit tests added for the export module itself since it's a thin composition of already-
tested `db.select`/`dialogs.saveFile`; the ZIP-walking logic is what actually has a bug surface,
and that's covered on the Rust side), `vite build`, `cargo fmt --check`,
`cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace` (31 tests in
`designspace_lib`, up from 30, for `export::tests::zips_json_manifest_and_media_directory`) are all
clean. `export_library_zip` was added to `src-tauri/build.rs`'s `APP_COMMANDS` and
`capabilities/default.json`'s `allow-export-library-zip`, per this repo's existing "every own
command needs an ACL entry" convention (see `build.rs`'s own comment) — confirmed by a full
`cargo build` after the change.

**M7-1c: Trash polish.** The existing Trash view (M1-8) already covered soft delete, restore,
delete forever, empty now, and an auto-purge note — close to the plan's ask already. The one
genuine gap: an owner deciding whether to restore something had no way to tell how much time was
left before it purged automatically. Added `daysUntilPurge(deletedAt)` to `trashActions.ts` (pure,
unit-tested, reusing the exact same 30-day cutoff math as `purgeExpiredTrash` so the displayed
countdown and the actual purge can never disagree) and a "Deleted <date> · Purges in N days" /
"Purges today" / "Purges tomorrow" line per item in `TrashSection.tsx`. Deleted boards already have
their own restore UI in the Boards gallery (M4-1) — the plan's §2.14 Trash section is scoped to
items, so this wasn't duplicated here.

M7-1 is now closed out. Verification (whole sub-task): `tsc -b --noEmit`, `eslint .`,
`prettier --check .`, `vitest run` (381/381, up from 378), `vite build`, `cargo fmt --check`,
`cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace` (31 tests)
are all clean.

**Owner checks:**
- Settings → Library → back up now, then confirm the extra destination folder (if set) received a
  copy too.
- Settings → Library → Export as JSON, then Export as ZIP; open the ZIP and confirm it has
  `designspace-export.json` plus every file under `media/`.
- Trash a few items, confirm the "Purges in N days" line looks right, then restore one and delete
  another forever.

## M7-2: Complete Settings, onboarding, empty states, wording pass

Audited every Settings section, the onboarding flow and the four §2.14 empty states against the
plan; several i18n strings already existed for pieces that were never actually wired up (a good
sign they were planned, a bad sign they'd been missed) — this sub-task closes those gaps rather
than writing new copy from scratch.

**Settings → About.** Added item counts per kind and disk usage (`src/features/settings/
libraryStats.ts`: one grouped `SELECT ... GROUP BY kind` over non-deleted items — disk usage is
the sum of `file_size`, i.e. originals only, not thumbnails/cache/backups) and a working "Open
logs folder" button. The Rust commands (`app_paths`, `open_logs`) and their ACL entries already
existed from earlier milestones but had no `Platform.app` surface calling them — added one
(`app.paths`/`app.openLogs`, Tauri-only, `notSupported` in the browser dev build).

**Onboarding.** Step 3 ("Bring in existing inspiration? Pick folders, or Skip") and the
cloud-sync warning were both scaffolded (the i18n strings existed) but never implemented — the
flow went straight from library creation to `onReady`. Added a `bringIn` step after library
creation (Tauri only — folder picking needs `dialogs.openFolder`/`media.listFolder`, neither
available in the browser dev build) that lets the owner pick one or more folders, previews the
combined item count, and imports everything via the same `importPaths` used by the Add menu's
Folder… entry point before landing on the map; Skip goes straight there. The cloud-sync check
(`src/features/onboarding/cloudSync.ts`) is a coarse substring match for "onedrive", "dropbox" and
"google drive" in the chosen path — good enough for a warning, not a guarantee, and kept in its
own module (not inline in the component) so it's unit-testable without React.

**Empty states (§2.14).** Two of the four were dead code — defined in `en.ts`, never referenced:
- `emptyStates.board` ("Pull inspiration in…"): the Library-map-empty overlay in `Shell.tsx` used
  to key off `items.size` (library-wide, never changes on board switch), so it only ever fired for
  a *totally* empty library and never distinguished "viewing an empty board while the library has
  other items" — a real gap, since "+ New board" from the switcher can produce exactly that state.
  Switched the trigger to `placements.size` (current space) and branch on the current board's
  `kind` to show the right copy and action (the "+ Add" button only makes sense on the Library map).
- `emptyStates.noResults` ("Nothing matches. Try fewer filters."): the List panel already showed
  an empty message when filtered to zero results, but always the generic `list.empty` ("Nothing
  here yet.") — never the filter-specific one. Fixed by checking whether `useSearchResults`'s
  `matches` is non-null (an active filter) rather than just whether the list is empty.

The other two were already correct: "Inbox zero ✦" (Triage, M2-5) fulfills the plan's "Inbox done"
requirement under slightly different wording (not a gap — a legitimate copy choice, already
shipped); the Library map's own empty state was already wired, just needed the `placements.size`
fix above to also work correctly for boards.

**Wording pass.** Removed `panel.listComingSoon` ("The List panel lands with search and
classification in M2.") — a stale M0-era placeholder string, unreferenced anywhere, left over from
before the List panel existed.

**Known pre-existing issue, not from this sub-task:** `smoke-m4-suggestions-tray.spec.ts` fails
consistently on this branch's base commit (confirmed via `git stash` + re-run before and after
this sub-task's changes) — the suggestion count badge ("1") never appears after removing an item
from a filtered board. Not touched by anything in M7-2; left for a future AI/suggestions pass to
diagnose.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (387/387, up from
384), `vite build`, and the Playwright suite (39/40 passing — the one pre-existing failure above)
are all clean.

**Owner checks:**
- Settings → About: confirm the item counts and disk usage look right, and "Open logs folder"
  opens the real folder.
- Run through onboarding with a fresh library: try a cloud-synced folder (OneDrive/Dropbox) and
  confirm the warning shows; try "Bring in existing inspiration?" with a folder of images and
  confirm they land on the map after Continue.
- Create an empty board and confirm its empty-state text differs from the Library map's; type a
  search that matches nothing and confirm the List panel says "Nothing matches."

## M7-3: Accessibility pass (contrast, focus order, reduced motion)

**Contrast audit.** Computed WCAG 2.1 relative-luminance contrast ratios for every text/background
combination the palette actually produces (`--text-1/2/3`, the criterion/family colors, `danger`)
against every surface (`--canvas`, `--surface-1/2/3`). Everything actually used for text clears
4.5:1 (the AA threshold for normal-size text); the one pair that doesn't — `--text-3` on
`--surface-3`, 4.14:1 — only occurs in the codebase as a non-text background (a placeholder
thumbnail box, a round button), never paired with `--text-3` as actual text, so it's not a real
violation. No token or usage changes needed; recorded here so a future palette change has a
baseline to check against.

**Focus order — the real gap.** `Dialog.tsx` (the shared component behind all 7 of the app's
dialogs — Settings, Export, Link, Frame rename, Connection label, Folder confirm, and the
shortcut list) had `role="dialog" aria-modal="true"` and Escape-to-close, but no actual focus
management: opening one didn't move focus into it, Tab could still reach the dimmed page behind
the overlay (no trap), and closing didn't return focus to whatever triggered it. Fixed by (1)
focusing the dialog container itself on mount (`tabIndex={-1}` on `.ds-dialog`, so screen readers
land inside it and Tab starts there) and restoring focus to the previously-focused element on
unmount, and (2) trapping Tab/Shift+Tab within the dialog's own focusable elements — the standard
WAI-ARIA modal dialog pattern, implemented by hand (no new dependency) since it's about 25 lines.
`Popover.tsx` (the lighter-weight menu/dropdown wrapper — Add menu, context menu, filter
dropdowns) was deliberately left alone: it's non-modal by design, already closes on outside
click, and its many different call sites make a blanket focus trap riskier than valuable there.

**Reduced motion — closing an M0-era gap.** `useUiStore`'s comment for `wheelMode`/`minimapOpen`/
`dotGridDensity`/`reduceMotion` said "Settings persistence lands with M2/M7; for M0 this just
holds in-memory defaults" — true for all four, never revisited. For `reduceMotion` specifically
this was a real accessibility regression risk: an owner who explicitly sets Settings → Canvas →
Reduce motion to "On" (or "Off", overriding an OS-level "reduce" preference) had it silently reset
to "System" on every restart. Also found: the CSS side of reduced motion was split across a
`@media (prefers-reduced-motion: reduce)` block and a separate `[data-reduce-motion='true']`
attribute selector that nothing ever set — so the in-app override only ever worked for
JS-triggered animations (camera fly-to, Constellations morph, which already call
`prefersReducedMotion()` directly), never for CSS-only transitions (hover, panel open/close,
overlay fade). Fixed both:
- Added `platform.machineSettings` (`src-tauri/src/machine_settings.rs`: a `read`/`write` pair
  for a JSON blob at `<app_local_data_dir>/settings.json`, mirroring `db.select`'s "thin bridge,
  frontend owns the shape" pattern; BrowserPlatform uses IndexedDB, same as its other
  approximated Tauri-only surfaces) and `src/state/loadMachineSettings.ts` (load once at startup,
  persist via a `useUiStore.subscribe` on the four machine-local fields). Scoped to all four
  fields together, not just `reduceMotion` — they share one store and one JSON blob, so persisting
  only one would leave the plumbing half-built for the other three.
- Removed the `@media` block from `tokens.css` and made `useReducedMotionSync` (`src/lib/`) the
  single source of truth: it resolves the effective boolean (System/On/Off, already folding in the
  OS query) and mirrors it onto `<html data-reduce-motion>` on mount and whenever the setting or
  the live OS preference changes. One decision point instead of two.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (387/387),
`vite build`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
`cargo test --workspace`, and the Playwright suite are all clean (the dialog-heavy specs —
Settings, Export, Frame rename, Link — were re-run explicitly against the focus-trap change).

**Owner checks:**
- Tab through a Settings dialog end to end and confirm focus never lands on anything behind the
  dimmed overlay, and that closing it (Esc or the backdrop) returns focus to the gear icon.
- Settings → Canvas → Reduce motion → On, quit and reopen the app, confirm it's still On.
- With reduced motion On, confirm hover/panel-open transitions are instant, not just camera
  flights and the Constellations morph.

**Real bug found and fixed along the way: `FakeEmbeddingProvider.embedImage` was systematically
biased, not "meaningless."** `smoke-m4-suggestions-tray.spec.ts` (M4-10) had been failing
consistently in CI since M6 added the AI-similarity half of the suggestions tray — not a flake, a
genuine defect, root-caused and fixed here rather than just documented. `embedImage` decoded
whatever bytes it was given as UTF-8 to build a "bag of tokens" seed; for a text fixture
(`new TextEncoder().encode('some words').buffer`, exactly what the unit tests pass) that's the
intended, tested behavior. But `AiQueue` also feeds it every item's *real* WebP-encoded thumbnail
bytes in the browser dev build (no real CLIP model there — huggingface.co is blocked in cloud
sessions, CLAUDE.md), and decoding *those* as UTF-8 isn't meaningless at all: every WebP file
starts with the same "RIFF"/"WEBP"/"VP8 " header bytes, which survive the decode as shared ASCII
tokens on literally every image, while the actual compressed pixel data mostly collapses to the
replacement character and drops out of the token match. The result: every real image's fake
embedding ended up dominated by those few shared header tokens, so `boardSimilarSuggestions`
(§4.10) saw the entire demo library as one mutually-"similar" cluster — sometimes padding the
tray with extra false-positive matches, sometimes (this is what the intermittent
`toBeHidden()` failures at a *different* line were) showing the tray when it should've stayed
hidden. Fixed by teaching `embedImage` to tell the two cases apart
(`looksLikePlainTextFixture` — printable-ASCII-only bytes, which real encoded images fail on
their very first few bytes) and, only for real binary content, seeding the vector from a hash of
the raw bytes instead of decoded text — still deterministic (same bytes → same vector, so genuine
exact-duplicate images still read as similar, correctly), but no longer positively correlated
with every other image through a shared container-format header. Added two unit tests
(`fakeEmbeddingProvider.test.ts`): unrelated binary blobs now score low similarity, and identical
binary blobs remain deterministic.

The e2e spec itself also got one fix: it predates M6 and was written to check only the
deterministic source-filter half of the tray, so it now turns AI off in Settings first — even
with the embedding fix, a demo library full of visually-similar procedurally-generated shapes can
legitimately produce AI matches, which was never what this particular test meant to exercise.

Verified via `vitest run` (389/389) and the full Playwright suite (40/40, including 5 repeated
runs of the previously-flaky spec alone) all green — the previous entries' verification numbers
above (387, 39/40) predate this fix; these are the corrected, final ones for M7-3 as a whole.

## M7-4: Performance pass against §4.13 budgets

The plan checkbox for this sub-task stays unticked — same call as Spike S7 in M6 — since the
budgets themselves are unverifiable from this sandbox; ticking it would claim a measurement that
never happened. §4.13 is explicit that this sandbox can't do the real work here: "Measured on a mid-range Windows
laptop with integrated graphics... CI has no GPU, so it checks behavior, not performance. Check
performance with the bench page and on the owner's PC at the end of M0, M1 and M7." There's no
GPU, no Windows, and no real library of thousands of items available here — every number in the
budget table (frame time, cold start, memory, import throughput) needs the owner's actual
hardware, which is why they're listed as owner checks below rather than something this session
claims to have verified.

What this session *could* do, and did: implement the one budget-adjacent feature that was still
missing outright rather than just "unmeasured" — §4.13's "soft limit... at 9,500 [items] the app
shows a friendly note, but nothing blocks" had no code behind it at all (no toast, no threshold
constant, nothing in `en.ts`). Added `useSoftLimitNotice` (`src/app/`): a one-time-per-session
toast the moment the library's item count first reaches 9,500, watching `libraryStore.items.size`
(not `placements.size` — this is about the whole library's size, not the current space, unlike
the empty-state fix in M7-2). Deliberately a toast, not a persistent banner: the note has nothing
the owner needs to act on, and `ToastHost` has no manual-dismiss control, so a `duration: 0`
("never auto-dismiss") toast would get stuck on screen forever — used 8000ms instead, long enough
to actually read.

Also confirmed structurally (code review, not measurement) that the earlier milestones already
built toward these budgets rather than leaving them to be bolted on later: hover-connections
scoring and the search-keystroke path were both built as synchronous, non-network pure functions
from M2/M3 onward (nothing to await, so nothing budget-relevant to optimize further without real
profiling data); the canvas engine's LOD/culling (verified behaviorally via `?bench=10000` in
`app-shell.spec.ts`, still passing) is the M1 spike this budget was written against in the first
place.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (392/392, up from
387 — 3 new tests for `useSoftLimitNotice`), `vite build`, and the `app-shell`/`smoke-m1` e2e
specs (covering `?bench=10000` and Settings) are clean. No Rust changes this sub-task.

**Owner checks — all of §4.13's table needs your actual PC, not this sandbox:**
- `?bench=10000`: cold start to interactive, and pan/zoom frame time (watch for any frame > 33ms).
- Import ~50 real ~3MB JPEGs and time it — expect ≥5 items/s with the UI still responsive.
- A library with several thousand real classified items: hover-connections feel (no visible lag),
  Constellations toggle time, and Task Manager's memory figure while browsing.
- Import until the library crosses 9,500 items and confirm the new toast appears once.
- Run Spike S7's AI throughput check if you haven't already (noted as owner-only since M6).
- If anything misses budget, note the actual numbers here in DECISIONS.md so future milestones
  have a real baseline instead of the plan's estimates.

## M7-5: Friendly error messages, logs, "Open logs folder"

"Open logs folder" itself was already wired in M7-2. The other two-thirds of this sub-task were
still gaps:

**Logs — `logger.ts` never actually wrote to a log file.** Its own comment said as much: "M0
keeps it local" (console only), deferring the real wiring "to later." `@tauri-apps/plugin-log`
(the JS side) was already an installed dependency, and the Rust plugin was already registered
with `tauri_plugin_log::Builder::default().build()` in `lib.rs` — which does default to writing a
file in the app's log directory — but nothing on either side ever called it: zero `log::*!` calls
anywhere in `src-tauri`, and `logger.ts` only ever called `console.*`. So "Open logs folder"
opened a folder that would have been empty. Fixed by routing every `logger.*` call through
`@tauri-apps/plugin-log`'s matching function under Tauri (lazily imported — the browser dev build
never pulls this package in at all, same convention as every other Tauri-only import in this
codebase), in addition to the existing `console.*` call for local dev visibility. Deliberately did
*not* add new Rust-side `log::*!` calls in this pass — every current Rust error already flows back
to the frontend as an `AppError` and gets logged there via the existing `logger.error(...)` call
sites, so the JS-side fix alone closes the gap without duplicating log lines.

**Friendly error messages — two real user-facing raw-exception surfaces, both now wrapped.**
`App.tsx`'s startup-failure screen and Onboarding's two failure paths (library creation, bringing
in a folder) all rendered `err.message` directly — for an `AppError` from Rust, that's a string
like `[io_error] No such file or directory (os error 2)`, plainly not what CLAUDE.md's "Short,
warm and concrete" wording standard asks for. Fixed by giving each failure a plain-language
headline (`en.errors.*`) with the raw detail kept underneath in smaller, muted text — still
visible (useful for the owner to self-report a bug, and it's in the logs now too per the fix
above) but no longer the primary thing the owner reads first. The rest of the app's error
surfaces already followed this pattern or something equivalent (toasts with a plain-language
message, `logger.error` for the raw detail) from earlier milestones — these two call sites were
the only genuinely raw ones a grep for `err.message` in UI-facing code turned up.

Verification: `tsc -b --noEmit`, `eslint .`, `prettier --check .`, `vitest run` (394/394, up from
392 — 2 new `logger.test.ts` tests), `vite build`, and `app-shell.spec.ts` (Settings → About →
Diagnostics still opens correctly with the logger changes in place) are all clean.

**Owner checks:**
- Force a failure (e.g. point the library at a folder without write permission) and confirm the
  message reads like a person wrote it, not a stack trace, with the technical detail still visible
  underneath for a bug report.
- After using the app for a while, open Settings → About → "Open logs folder" and confirm the log
  file actually has entries in it — this is the one thing that genuinely can't be verified from
  this sandbox (no real Tauri runtime to open a real log file against).

---

*(Later milestones append below this line.)*

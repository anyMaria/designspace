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

*(Later milestones append below this line.)*

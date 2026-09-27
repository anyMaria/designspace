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

---

*(Later milestones append below this line.)*

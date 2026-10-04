# Designspace: Patch 2 plan

> The owner tested the v0.8.0 Windows build (end of Patch 1) and sent a new list of notes. This
> document turns them into precise, ordered work for a coding agent: first the bugs (connections
> that never show, pictures that disappear after reopening, the AI, PDFs, Settings, Trash), then
> simplifying (Constellations and Frames go), then everyday comfort, the word fields, the Color
> studio, font families with type collections, and choosing PDF pages.

| | |
|---|---|
| Owner | @anyMaria |
| Written | 2026-10-04, from the owner's review of the v0.8.0 Windows build and a follow-up discussion |
| Based on | `main` at `c7b3b8c` (v0.8.0) |
| Status | Planned. Nothing built yet |
| Pictures | `docs/patch-2/` (mockups: `mockups.html` and one PNG per section) |

## How to use this document

**Owner (you)**
1. Read §0 (what was wrong) and §1 (what we decided). Change anything you don't like before a phase starts.
2. Open a new Claude Code conversation on `anyMaria/designspace` and paste the kick-off prompt for Phase A from §12.
3. One phase per conversation. At the end of each phase the agent gives you **Owner checks** to try on your PC.

**Coding agent**
- Read `CLAUDE.md`, then **§2 of this document in full** (rules, commands, gotchas, code map), then your phase.
  `docs/IMPLEMENTATION_PLAN.md` is still the overall spec and `docs/PATCH_1_PLAN.md` describes the last
  round; this plan changes them where it says so. You don't need to read either in full.
- Everything in this plan was checked against the code at `c7b3b8c`. Line numbers are hints: if a line
  moved, search for the quoted name. **You should not need to research anything**: names, files,
  strings, SQL and the tricky algorithms are given. If something here is wrong, take the simplest
  alternative that keeps the UX principles, write it in `docs/DECISIONS.md` under "Patch 2 · Phase X",
  and continue.
- Do the tasks of your phase **in order, one commit per task**. Run the checks in §2.2 after every task.
- Tick each task's checkbox in this file when it lands, and commit this file with the code.

## Contents
0. [What the owner reported and what is actually wrong](#0-what-the-owner-reported-and-what-is-actually-wrong)
1. [Decisions](#1-decisions)
2. [Rules, commands and gotchas for the coding agent](#2-rules-commands-and-gotchas-for-the-coding-agent)
3. [Phase A: fix what's broken](#3-phase-a-fix-whats-broken) · v0.9.0
4. [Phase B: simplify (Constellations and Frames go)](#4-phase-b-simplify) · v0.10.0
5. [Phase C: everyday comfort](#5-phase-c-everyday-comfort) · v0.11.0
6. [Phase D: word fields](#6-phase-d-word-fields) · v0.12.0
7. [Phase E: the Color studio](#7-phase-e-the-color-studio) · v0.13.0
8. [Phase F: font families and type collections](#8-phase-f-font-families-and-type-collections) · v0.14.0
9. [Phase G: choosing PDF pages](#9-phase-g-choosing-pdf-pages) · v0.15.0
10. [Finishing a phase](#10-finishing-a-phase)
11. [Later (not in Patch 2)](#11-later-not-in-patch-2)
12. [Kick-off prompts](#12-kick-off-prompts)
- Appendices: [A. reference code](#appendix-a-reference-code) · [B. new strings](#appendix-b-new-strings) · [C. migrations](#appendix-c-migrations)

---

## 0. What the owner reported and what is actually wrong

Each line was checked in the code and, where possible, reproduced in the browser build.

| # | Owner's note | What is actually wrong | Task |
|---|---|---|---|
| 1 | "On the main screen, even with the connections preview on, nothing shows up." | Lines are clipped to card edges (Patch 1 B4), so side-by-side cards (how imports land) leave a stub of a few pixels, hidden under the connect handle; other lines are thin and faint. And when nothing shares a Vibe or Tag (the defaults), nothing explains why. | A1 |
| 2 | "The first time it worked perfectly; the next time the images weren't loading." | Every launch gives the library a **new ID** by mistake. `ensure_library_id` (`src-tauri/src/library.rs:91-110`) mints a ULID when `meta.library_id` is missing, expecting the frontend to store it; the frontend never does. The thumbnail cache folder is `…\cache\<library id>\`, so each launch looks in a new, empty folder: every `t128`/`t512` is a 404 and cards keep their placeholder colour. Originals (library folder) still load. Nothing re-makes the thumbnails, because the items are still marked `ok`. The Rust test that should have caught it inserts the row by hand. | A2, A3 |
| 3 | "The AI is failing." | Two bugs. (a) `scripts/fetch-models.mjs` runs in Node, where transformers.js defaults to full-size fp32 files; the app's worker asks for the quantized `*_quantized.onnx` files, which aren't in the installer → every load fails. (b) Even with the right files, the tokenizer never finds `tokenizer_config.json` because the model folder is an `http://` URL (transformers.js skips local lookups for URLs), so suggestions and search by meaning would still fail. Settings → AI says "A local model is loaded" without checking anything, and a failed load is cached until restart. | A5, A6 |
| 4 | "PDF preview only works once I hit next or previous." | `PdfFocusViewer.tsx:51-75` renders before the document has loaded (`handleRef` is null) and nothing re-renders afterwards. | A7 |
| 5 | "When I delete stuff the minimap doesn't update." | The minimap draws placements without skipping trashed items (`Minimap.tsx:78-103`). Also, trashed items stay selected (Details says "63 items" after deleting everything). | A8 |
| 6 | "I can't see About in Settings, the menu got too long and we cannot scroll." | `.ds-dialog` has no `max-height` or `overflow`. On Windows, Settings → Library lists every backup (up to 22 rows) and the Trash, so the dialog becomes taller than the window and its top and bottom are cut off. | A9 |
| 7 | "I cannot access the trash through the app." | The Trash only exists at the bottom of Settings → Library, the part that couldn't be scrolled to. | A9, C5 |
| 8 | "What you put in Movement is supposed to be in Vibe." | Every word field shares one `<datalist id="chip-input-suggestions">` (`ChipInput.tsx:51,57`), so the Movement field suggested the Vibe list. Leaving a field also silently creates whatever was typed. | A10, D1–D3 |
| 9 | "The library options menu is all messed up." | The top-left menu is a menu inside a popover (two borders, two shadows), doesn't show the current space, makes "+ New board" look like a board, and doesn't close on outside clicks (its backdrop is trapped in a `zIndex: 1` stacking context, `Shell.tsx:203-212`). The right-click menu runs off the bottom of the window. | A11, C4 |
| 10 | (found) | Copy hex, Copy image and Paste image are refused on Windows: `capabilities/default.json` grants only `clipboard-manager:default`, which allows nothing. | A4 |
| 11 | Exit full screen with Esc | Esc has about 15 separate listeners with no order; none leaves full screen. | C1 |
| 12 | Resize from all sides | Only four corner handles; every kind keeps its aspect (notes too). | C2, C3 |
| 13 | No previews in the List for fonts and palettes | Tiles only show `t128`; notes, swatches and palettes have none, and the font specimen is cropped. | C7 |
| 14 | Favourites should show | Nothing draws the star on the map or in the List. | C6 |
| 15 | Minimap/Overview: connections too far apart to see clusters | The minimap must show real positions (it's for navigation). The Overview's Clusters view uses loose force constants. | B2 |
| 16 | Constellations: "rework or remove" | It does the same computation as the Overview's Clusters, on the real map, where nothing can be dragged. → removed. | B1 |
| 17 | Frames: "what is the utility?" | Frames never held anything (nothing ever sets `placement.frame_id`); their only use is exporting one frame. → removed, replaced by "Export selection". | B3 |
| 18 | Better dropdowns, see similar words while typing | Native datalist, substring only, seeded order. | D1, D2 |
| 19 | Movements are Art Nouveau, Swiss design… | Five starter Movement values read as moods. | D3 |
| 20 | Colour tools like Adobe Color, eyedroppers on a photo, random colours with locks and hearts, contrast checker, colour wheel; a palette from a photo's sampled colours using the same steps | → the Color studio. | Phase E |
| 21 | Fonts: choose the weight and size shown on the card ("sometimes it picks the littlest one") | Every font **file** is a separate card; the specimen draws whatever file it is (Thin stays Thin) and the sample line is about 10 px. | F1–F4 |
| 22 | Group font families "a bit like palettes", but each family can still be linked | → type collections. | F5 |
| 23 | PDF: choose the pages when adding, keep their proportions | No picker; "Split into pages" always splits everything and drops the pages at the map's origin. | Phase G |

---

## 1. Decisions

Confirmed by the owner in the discussion (2026-10-04):

| # | Decision |
|---|---|
| D1 | **Constellations is removed** as a mode. The Overview (minimap → expand, or O) becomes *the* clusters view, tighter, with a Spacing slider. The minimap keeps real positions. |
| D2 | **Frames are removed.** Export gets "Selection" next to "Whole board". Existing frame rows stay in the database (never delete data in a migration) but are no longer loaded or drawn. |
| D3 | **One card per font family**, and the owner chooses what the card shows (style or weight, text size, text). |
| D4 | **Type collections**: a card grouping several families (like a palette groups colours); every family inside stays its own item that can be classified, opened and connected, and lines attach to its row. |
| D5 | **Movement → Vibe:** Psychedelic, Grunge, Punk, Y2K and Vaporwave move to Vibe; Contemporary is removed (only if no item uses it). Settings → Vocabularies gets "Move to Vibe / Movement / Tags". |
| D6 | **Liked colours are kept** (per library, until removed). The Color studio has a **colour-blind preview**. |
| D7 | **Resize:** corners keep proportions, sides change them. Pictures are never stretched: changing their proportions crops them, and the crop can be adjusted or reset. **Alt** resizes from the centre (like Adobe apps). |
| D8 | **Order:** fixes first, with "connections don't show" as the very first task, then the order of this document. |

Chosen by the planner (the owner can change them):

| # | Default | Alternative |
|---|---|---|
| P1 | Shift + corner = free proportions (Photoshop). Shift + side does nothing special. | Shift keeps proportions on sides too |
| P2 | Repairing missing thumbnails is a **self-check at every launch** (items marked ready whose `t128` is missing are re-made), not a one-off bump. It also covers a restored backup or a cleared cache. | Bump `CURRENT_DERIVED_V` once |
| P3 | Font card text size Small / Medium / Large changes the **text size on the card**, not the card. The "Aa" stays (smaller). | Card sizes |
| P4 | A type collection can't be classified itself (like a palette); its families can. | Classifiable collections |
| P5 | The Color studio adds at most **10** colours (a palette that already has more keeps them). | 12 |
| P6 | Leaving a word field **never** creates a word; only Enter or a click on "Create" does. | Keep creating on blur |
| P7 | "Arrange my map like this" (applying clusters to the real map) is **not** in Patch 2. | — |
| P8 | The PDF picker shows for Files…, drag and drop and paste, not for Folder… or onboarding (bulk imports). | Always |

---

## 2. Rules, commands and gotchas for the coding agent

### 2.1 Rules (in addition to `CLAUDE.md`)
- **Order matters.** Phases in order; inside a phase, tasks in order. Don't start a phase before the previous one is merged.
- **Small, boring changes.** Change only what the task names. Don't rename existing exports, reformat untouched code or "clean up" other modules.
- **No new dependencies.** Everything needed is installed: culori 4.0.2 (colour maths, WCAG contrast, colour-blind filters), fontkit, pdf-lib, pdfjs-dist, d3-force, @testing-library/react, jsdom.
- **Migrations:** Patch 2 adds exactly three, in this order: `003_crop.sql` (C3), `004_vocabulary.sql` (D3), `005_fonts.sql` (F1). Full SQL in Appendix C. Never edit `001`/`002`. **Never rebuild a table**: foreign keys are on (`PRAGMA foreign_keys = ON` in `sqljsDb.ts` and `library.rs`) and migrations run in one transaction, so `DROP TABLE items` would cascade-delete the library. Only `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN`, `UPDATE`, `INSERT`, `DELETE`.
- **Strings** go in `src/i18n/en.ts` (Appendix B lists every new one, with its key). **Colours, radii, sizes, durations** go in `src/design/tokens.ts` and `tokens.css` (keep the two in sync by hand).
- **Undo:** every user-visible data change is a Command in `src/commands/` (`do`/`undo`, one `db.batch`). Derived data (thumbnails, specimen re-renders, the font-family repair in F2, the missing-thumbnail self-check in A2) is not a Command; say so in a comment.
- **Engine.ts is ~2,600 lines.** New drawing code goes in new modules under `src/canvas/` (named per task); `Engine.ts` only creates, positions, hides and destroys display objects and routes pointer events.
- **No `any`, no `// @ts-ignore`, no `eslint-disable`** except the existing `react-hooks/exhaustive-deps` pattern with a reason.
- **Windows-only behaviour** (media protocol, cache folder, clipboard permissions, full screen, AI model files, Recycle Bin) can't be checked in the cloud. Unit-test the pure parts and list the rest as Owner checks.
- **Mockups** in `docs/patch-2/` are the visual reference for new UI. Build with the existing components (`src/design/components`), not by copying mockup HTML.

### 2.2 Checks after every task
```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
# when Rust changed:
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
# the specs the task names, then the full suite before the phase ends:
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e tests/e2e/<spec>.spec.ts
```
- One unit file: `pnpm test src/lib/termMatch.test.ts`. One e2e spec: as above. Full e2e: about **4 minutes** locally (49 specs), 9–15 minutes on CI.
- `pnpm e2e` builds and starts the preview server itself; if one is already running on port 4173 it is reused (`reuseExistingServer`). **After changing code, stop a running preview server** or you test the old build.
- `cargo test -p designspace-core` works without anything else. Anything in `src-tauri` needs the Tauri Linux prerequisites first (once per container):
  `sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (the same list as `.github/workflows/ci.yml`).
- `pnpm install` prints "Ignored build scripts: core-js, onnxruntime-node, protobufjs". That is expected; don't run `pnpm approve-builds`.

### 2.3 Looking at the app (cloud session)
- `pnpm build && pnpm preview --port 4173`, then drive `http://localhost:4173/?seed=demo` with Playwright. `/` alone is an empty library; `?seed=demo` re-seeds a fresh demo library **on every load** (so don't use it to test persistence).
- Chromium: never run `playwright install`. Launch with `executablePath: '/opt/pw-browsers/chromium'` (or the env var above).
- The demo makes its thumbnails in 10–30 s without a GPU. Poll for them (`tests/e2e/helpers/pixels.ts`: `pixelAt`, `near`, `waitForPixel`), never sleep blindly.
- **huggingface.co is blocked**: the browser build always uses the fake AI provider. Real AI is only checked on Windows.
- Screenshot every visual change and compare with `docs/patch-2/*.png`.

### 2.4 Gotchas (each of these has already cost a CI run)
- **Persisting in e2e:** the browser database is written to IndexedDB with a debounce. Before `page.reload()`, wait ~2.5 s after the last write (`patch1-description.spec.ts` does this).
- **Toasts cover buttons** at the bottom right: wait for a toast to disappear before clicking under it.
- **Never use `waitForLoadState('networkidle')`**; never leave a `page.screenshot` in a spec.
- **pdf.js empties the buffer you give it** (it transfers it to its worker): always pass `bytes.slice(0)` to pdf.js and keep the original for pdf-lib.
- **Canvas 2D can't set font variation axes.** To draw a variable font at weight 650, register the face with a weight range descriptor (`{ weight: '100 900' }`) and draw with `ctx.font = '650 …'`.
- **Space pans the map** (`useCanvasShortcuts`): any overlay that uses Space (the Color studio) must stop canvas shortcuts while open (C1's Esc stack and the existing `isTypingTarget` checks don't cover Space; see E2).
- **`createAddConnectionCommand` does not normalise pair order**: when merging or re-pointing connections, check both directions.
- **The placements key is (space, item)**: one item has at most one placement per space.
- **Inline closures as effect deps re-run every render** (e.g. `Dialog`'s `[onClose]`): when registering global handlers, keep the handler in a ref.
- **Five copies of `isTypingTarget`** exist (`useGlobalShortcuts.ts:10`, `AddMenu.tsx:190`, `useCanvasShortcuts.ts:25`, `canvas/input.ts:12`, `useUndoRedoShortcuts.ts:4`). C1 merges them into `src/lib/isTypingTarget.ts`; until then use the one in the file you're in.

### 2.5 Code map (what you'll touch most)
| Area | Files |
|---|---|
| App shell, boot | `src/app/App.tsx` (boot, `resumeAllIngest`), `src/app/Shell.tsx` (layout, overlays, z-indexes), `src/app/fullscreen.ts`, `src/platform/bootstrap.ts` (`ensureLibraryReady`) |
| Platform | `src/platform/types.ts` (the `Platform` interface), `tauri/TauriPlatform.ts`, `browser/BrowserPlatform.ts`, `browser/idbStore.ts` |
| Rust | `src-tauri/src/{library,media,media_protocol,backups,app_info,lib}.rs`, `src-tauri/build.rs` (`APP_COMMANDS`), `src-tauri/capabilities/default.json`, `crates/designspace-core` |
| Data | `src/db/migrations/*.sql`, `src/db/migrator.ts`, `src/db/rowMapping.ts`, `src/state/*Store.ts`, `src/state/loadSettings.ts` (library settings JSON in `meta.settings`) |
| Commands | `src/commands/*.ts` (+ tests), `src/commands/history.ts` (`useHistoryStore.getState().execute(cmd)`) |
| Canvas | `src/canvas/Engine.ts`, `itemCards.ts` (Item → `ItemCard`), `selection.ts`, `contextMenuItems.ts`, `ContextMenu.tsx`, `Minimap.tsx`, `decor/*` (self-drawn cards), `useCanvasShortcuts.ts` |
| Features | `src/features/<name>/` (details, list, boards, trash, settings, overview, palettes, focus, import, connections…) |
| Design | `src/design/tokens.ts` + `tokens.css`, `src/design/components/*` (+ `components.css`) |
| Strings | `src/i18n/en.ts` (groups: `settings`, `trash`, `palettes`, `font`, `pdf`, `connections`, `fullscreen`, …) |

---

## 3. Phase A: fix what's broken

**Goal:** on Windows, connection lines show, pictures survive closing and reopening the app, the AI
really runs (and says when it can't), PDFs show their first page, the minimap forgets deleted things,
Settings fits the window, copying colours works, and menus behave. Size: M. Version at the end: **0.9.0**.
This phase ships on its own so the owner can confirm the fixes before anything new.

### A1 · Connection lines are visible, and the app says when nothing connects `[x]`
**Why (diagnosis).** Reproduced in the browser build (three imported pictures, two sharing the Vibe "Dreamy"):
- The connection logic works: hovering one card dims the unrelated one, and Show all puts a "Dreamy" star between them.
- **But the lines are almost invisible.** Since Patch 1 B4, a line is clipped to each card's edge with a 6 px gap. Cards
  that sit side by side (new imports always land in a tight row, 16 world units apart) leave a stub of a few pixels, which
  the connect handle's dot then covers; zoomed out, nothing is left. Show all's star sits in the same gap, its lines of
  length ~0. Lines that do show are 1.5 px at 70 % opacity (hub lines 35 %), easy to miss on a photo.
- **And when nothing shares a value, nothing says so.** Default criteria are Vibe, Tags and My connections. Items that are
  unclassified, or classified only with Type or Movement (the owner's Movement field was offering Vibe words, §0 #8),
  connect to nothing, and the popover gives no hint. Both explain "nothing shows up". No Windows-only cause was found
  (connections run on the main thread, no worker, no `media://` fetch).

**Files:** `src/design/tokens.ts`, `src/canvas/Engine.ts`, new `src/canvas/relatedOutline.ts`, `src/lib/connections.ts`
(+ test), `src/features/connections/ConnectionsPopover.tsx`, `src/canvas/CanvasHoverOverlay.tsx`, `en.ts`.

**Do**
1. Tokens: new `connectionLineStyle = { width: 2, opacity: 0.9, hubWidth: 2, hubOpacity: 0.55, haloWidth: 5, haloAlpha: 0.35, minVisiblePx: 12 }`
   in `tokens.ts`. In `Engine.ts`, `LINE_WIDTH_PX`, `LINE_OPACITY`, `HUB_LINE_WIDTH_PX`, `HUB_LINE_OPACITY` read from it
   (keep `LINE_WIDTH_HOVERED_PX` = width + 1).
2. Every connection and hub line is first stroked as a dark halo (`haloWidth`, black, `haloAlpha`), then in its colour, so
   it reads on light photos. A clipped segment shorter than `minVisiblePx` on screen is not drawn at all (no stubs).
3. `relatedOutline.ts` (drawing only, called from the engine): while hover or selection connections are shown, every
   **related** card gets a 2 px outline (screen px) in the colour of its first shared criterion (`criterionColor.ts`),
   drawn in the same layer as the selection outline and cleared with the lines. This makes the relationship visible even
   when two cards touch.
4. `connections.ts`: pure `connectionSummary(visibleIds, activeCriteria, index): { connectedItems: number; groups: number; byInactive: Partial<Record<Criterion, number>> }`
   using `computeHubs`: how many visible items share at least one value under the active criteria, in how many groups, and,
   for each criterion that is **off** (type, movement, color), how many items it would connect.
5. `ConnectionsPopover.tsx`: under the criteria toggles, one line: `summary(items, groups)` ("12 items share something
   (5 groups)"), or when `connectedItems` is 0, `empty` ("Nothing shares a Vibe or Tag yet.") followed by one button per
   inactive criterion with a count > 0 (`turnOn(name, count)`: "Turn on Movement (6 items)"), which turns it on (respect the
   3-criteria limit message that already exists). If every count is 0: `emptyHint` ("Give a few items the same Vibe or Tag
   to see them connect.").
6. `CanvasHoverOverlay.tsx`: when Display is On hover, connections are not Off, and the hovered card has **no** candidate
   after the 300 ms delay, the hover name pill gets a second, dimmer line `noneForItem` ("No shared Vibe or Tag").
   (Phrase it from the active criteria: `noneForItem(labels)` joins their names.)

**Tests:** `connections.test.ts`: `connectionSummary` with two items sharing a vibe (1 group, 2 items); items sharing only
a movement while movement is off (`byInactive.movement === 2`). e2e (`smoke-m3-connections-hover`, extend): import two
pictures, give both the Vibe "Dreamy", **drag one 400 px away**, hover the other: a pixel on the midpoint between them
differs from the background (line drawn). New e2e `patch2-connections-empty.spec.ts`: empty library + one picture → open
Connections → the popover shows "Nothing shares a Vibe or Tag yet."
**Owner checks:** hover a photo that shares a Vibe with another: a clear line (or, if they touch, both get a coloured
outline). Open Connections with nothing classified: it tells you why and offers to turn on Movement or Type.

### A2 · The library keeps its ID; missing thumbnails are re-made `[x]`
**Why:** a new library ID at every launch means a new, empty thumbnail folder (§0 #2).

**Files:** `src-tauri/src/library.rs`, `src/platform/bootstrap.ts`, new `src/workers/missingThumbnails.ts` (+ test),
`src/app/App.tsx`, `src/workers/pdfIngestQueue.ts`, `src-tauri/src/media.rs`, `src-tauri/src/lib.rs`,
`src-tauri/build.rs`, `src-tauri/capabilities/default.json`, `src/platform/types.ts`, both platforms.

**Do**
1. `library.rs`: replace `ensure_library_id` (lines 89-110) with the version in Appendix A.1. Rust must
   **never create** the `meta` table (the frontend migrator's `001` does; creating it early would make
   `001` fail).
2. `bootstrap.ts`, in `ensureLibraryReady`, right after `runMigrations` (after the `if (to !== from) logger.info(…)` line):
   store `platform.library.current()?.id` with
   `INSERT INTO meta (key, value) VALUES ('library_id', ?) ON CONFLICT(key) DO NOTHING` (code in A.1).
   This covers a brand-new library, where `meta` only exists after migrating.
3. New `src/workers/missingThumbnails.ts` with `requeueMissingThumbnails(platform): Promise<number>` (Appendix A.1):
   items with `status = 'ok'` whose `t128/<id>` is missing from the cache (`platform.cache.has`, 500 keys at a
   time) get `derived_v = 0`, so the existing resume functions re-make them. Derived data: not a Command.
4. `App.tsx` → `resumeAllIngest`: call `await requeueMissingThumbnails(platform)` as the first line inside its
   `try`. The existing "Refreshing previews for N items…" toast then shows the count.
5. `pdfIngestQueue.ts`: a re-made PDF must keep its "Set as cover" page. Add `coverPage?: number` to
   `PdfQueueItem`; `resumePendingPdfIngest` selects `cover_page` and passes `coverPage: r.cover_page ?? undefined`;
   the worker call becomes `deriveAndPersist(this.platform, item.itemId, item.relPath, item.coverPage)`.
6. Orphan cache folders (one per past launch on the owner's PC): in `media.rs` next to `cache_dir`, add the pure
   `orphan_cache_dirs(root, keep)` and the command `cache_prune_orphans` (Appendix A.1). Add
   `pub fn recent_library_ids(app) -> AppResult<HashSet<String>>` in `library.rs` (the ids in the recent-libraries
   list it already keeps). Register the command in `lib.rs`, `build.rs` `APP_COMMANDS`, and
   `capabilities/default.json` (`allow-cache-prune-orphans`, same pattern as the other app commands).
7. `types.ts`: `cache.pruneOrphans(): Promise<number>`. Tauri invokes `cache_prune_orphans`; the browser returns `0`.
   `App.tsx`, Tauri branch: `void platform.cache.pruneOrphans()` after `ensureLibraryReady`.

**Tests**
- Rust: replace `opening_a_library_twice_reuses_the_same_id` with the test in A.1 (it no longer inserts the row
  by hand); add "a database without `meta` gets an id and still has no `meta` table"; `orphan_cache_dirs` with a
  tempdir: a non-ULID folder is kept, a file is kept, the kept id is kept, another ULID folder is returned.
- `missingThumbnails.test.ts` with a fake platform: only items whose `has` is false are updated; batches of 500.

**Done when:** all Rust tests pass (with the Tauri prerequisites installed); unit tests green.

### A3 · Pictures survive a reload in the browser build; a texture that failed is retried once `[x]`
**Why:** the browser build loses every thumbnail URL on reload, so no test can catch "works once, not twice".
And one failed texture load sticks until the app restarts.

**Files:** `src/platform/browser/idbStore.ts`, `src/platform/browser/BrowserPlatform.ts`, `src/canvas/Engine.ts`,
new `tests/e2e/patch2-reopen.spec.ts`.

**Do**
1. `idbStore.ts`: add `idbEntries<T>(store)` (Appendix A.2).
2. `BrowserPlatform.ts`: add `hydrateObjectUrls()` (A.2) and make `await this.hydrateObjectUrls()` the first line of
   `library.open`. It recreates the blob URLs kept in `objectUrls` from IndexedDB, so `cache.url` stays synchronous.
3. `Engine.ts` → `requestLod`: retry a failed texture key once after 5 s, then give up until its URL changes (a new
   `thumb_v` makes a new key anyway). Code and exact places in A.2 (`texFailures`, `texRetryTimer`,
   `TEXTURE_RETRY_MS = 5000`, `MAX_TEXTURE_ATTEMPTS = 2`). Clear the map in `clearItems`, the timer in `destroy`.
4. New e2e `patch2-reopen.spec.ts`, full code in A.2: import `wide-circle.png`, wait for its orange circle pixel,
   wait 2.5 s, `page.reload()`, wait for the same pixel again.

**Done when:** the new spec passes (it fails on `c7b3b8c`); `patch1-thumbnails` and `patch1-description` still pass.

### A4 · Copying and pasting colours and images works on Windows `[x]`
**Why:** `clipboard-manager:default` grants nothing, so Copy hex, Copy image and Paste image are refused (§0 #10).

**Files:** `src-tauri/capabilities/default.json`.

**Do:** replace `"clipboard-manager:default"` with `"clipboard-manager:allow-read-text"`,
`"clipboard-manager:allow-write-text"`, `"clipboard-manager:allow-read-image"`, `"clipboard-manager:allow-write-image"`.

**Done when:** `cargo build -p designspace` (or `cargo clippy --workspace`) accepts the capability file.
**Owner checks:** click a swatch, paste into Notepad: you get the hex. Right-click a photo → Copy image, paste in Paint.

### A5 · Ship the right AI model files and let the model find them `[x]`
**Why:** §0 #3 (wrong precision in the installer; tokenizer can't see local files behind an `http://` URL).

**Files:** `scripts/fetch-models.mjs`, `src/lib/ai/clipEmbeddingProvider.ts`, `src/lib/ai/env.ts` (+ `env.test.ts`),
`.github/workflows/windows-build.yml`.

**Do**
1. `fetch-models.mjs`:
   - before the downloads: `fs.rmSync(path.join(MODELS_DIR, MODEL_ID), { recursive: true, force: true });` so no old
     full-size file can ever be bundled (import `fs`/`path` if not yet imported);
   - both model calls get `{ dtype: 'q8', progress_callback: progress }`. **Do not** pass `device`: in Node only
     `cpu`/`dml`/`webgpu` exist and `'wasm'` throws. `cpu` + `q8` downloads the `*_quantized.onnx` files;
   - fix the wrong comment above them ("No explicit dtype…").
2. `clipEmbeddingProvider.ts`: `CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'q8' })`
   and the same for `CLIPTextModelWithProjection`. The processor and tokenizer calls stay as they are (they take no
   dtype). Fix the comment.
3. `env.ts`: give transformers.js a plain path and translate it in its `fetch` (Appendix A.3): `env.localModelPath =
   '/bundled-models'` and `env.fetch` rewrites `/bundled-models/…` to the real `http://media.localhost/models/…`
   base. Add `fetch` to the `TransformersEnvLike` type.
4. `env.test.ts`: `localModelPath` is now `/bundled-models`; new test: `env.fetch('/bundled-models/X/config.json')`
   calls the real fetch with `<base>/X/config.json`. Add `fetch: vi.fn()` to `fakeEnv()`.
5. `windows-build.yml`: cache key `ai-models-v2-${{ hashFiles('scripts/fetch-models.mjs') }}`, and the
   "Check the bundled AI model files" step from Appendix A.3 between "Fetch the bundled AI model" and "Build the
   installer". It fails the build if a quantized file is missing or a full-size one is present.

**Done when:** unit tests green. CI can't run the model; the Windows build log shows the check step listing only
`*_quantized.onnx` files. The installer shrinks from 337 MB (expect roughly half).

### A6 · Settings → AI tells the truth `[x]`
**Why:** "A local model is loaded" is shown without checking; a failed load is never retried; a crashed worker leaves
the queue stuck.

**Files:** `src/workers/ai.worker.ts`, `src/lib/ai/embeddingProvider.ts`, `src/lib/ai/clipEmbeddingProvider.ts`,
`src/workers/aiQueue.ts` (+ test), new `src/state/aiStatusStore.ts`, `src/features/settings/AiSection.tsx`, `en.ts`.

**Do**
1. `aiStatusStore.ts` (zustand, same shape as `importStore.ts`):
   `{ status: 'off' | 'loading' | 'ready' | 'error'; error: string | null; provider: 'clip' | 'fake' | null; set(patch) }`.
2. `embeddingProvider.ts`: optional `warmUp?(): Promise<void>`. In `ClipEmbeddingProvider`: load both the vision and
   the text side (`ensureVision`, `ensureText`).
3. `ai.worker.ts`:
   - new request `{ type: 'load' }` and two replies `{ type: 'ready', provider }`, `{ type: 'error', message }`;
   - on `load`: `const p = await loadProvider(envConfig); await p.warmUp?.();` then post `ready`; on failure post `error`;
   - `loadProvider` forgets a failed promise: `.catch((e) => { providerPromise = null; throw e; })`, so Retry works.
4. `aiQueue.ts`:
   - `WorkerLike` gains `onmessageerror`; after `configure`, post `{ type: 'load' }` and set status `loading`;
   - `retry()` does the same again (public);
   - in the message handler: `ready` → status `ready`, then `pump()`; `error` → status `error` with the message, reject
     pending text requests, keep the queue (items are not marked failed);
   - `pump()` returns early unless status is `ready`; `embedText` rejects at once when status is `error`;
   - `worker.onerror = (e) => { e.preventDefault(); fail(e.message || en.settings.ai.workerStopped); }` and the same for
     `onmessageerror` (`fail` sets status `error`, `busy = false`, rejects pending text requests).
5. `AiSection.tsx`: replace the "model bundled" effect and paragraph with a status line driven by the store:
   `loading` → `statusLoading`; `ready` → `statusAnalyzing(done, total)` while items are pending (total = done + pending),
   else `statusReady`; `error` → `statusError(reason)` plus a **Try again** button calling `getAiQueue(platform)?.retry()`.
   When the error text contains `was not found locally`, show `modelMissing` as the reason. With the `fake` provider,
   keep today's browser-build note.
6. Strings: Appendix B (`settings.ai.*`).

**Tests** (`aiQueue.test.ts`; the `FakeWorker` gains `onmessageerror`): `load` is posted after `configure`; no
`embedImage` is posted before `ready`; `error` sets the store, keeps the queue, rejects `embedText`; `retry()` posts
`load` again; `onerror` sets status `error`.
**Owner checks:** Settings → AI says "Ready" (or "Analyzing 12 of 140"), and the AI suggestion chips appear in Details.

### A7 · A PDF shows its first page when opened `[x]`
**Files:** `src/features/focus/PdfFocusViewer.tsx`, `tests/e2e/smoke-m5-pdf.spec.ts`.

**Do**
1. Remove `handleRef`; add `const [doc, setDoc] = useState<OpenPdfHandle['doc'] | null>(null);`.
2. Replace the open effect with the one in Appendix A.4: it calls `setDoc(opened.doc)` once loaded (a state change, so
   the render effect runs) and destroys the document on unmount.
3. The render effect starts with `if (!doc) return;`, renders `doc`, and depends on `[doc, page]`.
4. Add `data-testid="pdf-page-canvas"` to the page `<canvas>`.
5. e2e: after the "Page 1 of 3" assertion, add the `expect.poll` on the canvas width from A.4 (stays 300 today).

**Done when:** `smoke-m5-pdf` passes with the new assertion.

### A8 · The minimap forgets deleted things; deleted things leave the selection `[x]`
**Files:** `src/canvas/Minimap.tsx`, `src/commands/itemCommands.ts` (+ test).

**Do**
1. `Minimap.tsx`: build `rects` only from placements whose item exists and has no `deletedAt`; `centre(id)` returns
   `null` for a trashed item (so My connections and hover lines to it disappear). Read `items` from the store as the
   file already does.
2. `createTrashCommand` → `do`: after marking items deleted, remove those ids from the selection:
   `const sel = useLibraryStore.getState().selection; useLibraryStore.getState().setSelection([...sel].filter((id) => !ids.includes(id)));`
   `undo` doesn't restore the selection (nothing else does either).

**Tests:** `itemCommands.test.ts`: trashing a selected item removes it from `selection`.
**Done when:** after deleting everything, the minimap is empty and Details shows nothing selected.

### A9 · Settings always fits the window `[x]`
**Files:** `src/design/components/Dialog.tsx`, `components.css`, `src/features/settings/SettingsDialog.tsx`,
`src/features/settings/LibrarySection.tsx`, `en.ts`. Mockup: `docs/patch-2/settings.png`.

**Do**
1. `Dialog.tsx`: optional `className?: string` added to `.ds-dialog`.
2. `components.css` → `.ds-dialog`: `max-height: calc(100vh - 2 * var(--space-6)); display: flex; flex-direction: column; overflow-y: auto;`.
3. `SettingsDialog.tsx`: pass `className="ds-dialog--settings"` (CSS: `width: min(760px, calc(100vw - 2 * var(--space-6))); max-width: none; overflow: hidden;`).
   The row under the title: `flex: 1; min-height: 0`. The `<nav>`: `flex: none; overflow-y: auto`. The content
   column: `flex: 1; min-height: 0; overflow-y: auto; padding-right: var(--space-2)`. Settings opens on **Canvas**
   instead of About (first item of the nav).
4. `LibrarySection.tsx` backups list: show only the newest backup in one line
   (`backupsSummary(dateText, count)`), plus a "Show all (n)" / "Show fewer" toggle (local `useState`) that reveals today's list.
5. The Trash stays in Settings for now; C5 moves it out.

**Tests:** `smoke-m1-settings-empty` still passes. New check in that spec: set the viewport to 1280×600, open Settings,
click **About** in the nav, and expect the About heading to be visible (`toBeInViewport()`).

### A10 · Word fields suggest their own words and never create a word on leave `[x]`
**Why:** the shared datalist (§0 #8). The full combobox comes in Phase D; this is the one-line fix for 0.9.0.

**Files:** `src/design/components/ChipInput.tsx`.

**Do:** `const listId = useId();` (React) and use it for both `list={…}` and `<datalist id={…}>`. Remove
`onBlur={commit}` (P6): leaving the field clears the draft instead (`onBlur={() => setDraft('')}`).

**Tests:** `smoke-m2-details`: type in Movement and check the input's `list` attribute points to a datalist
containing "Art Nouveau" and not "Dreamy" (`page.locator('#' + listId + ' option[value="Art Nouveau"]')`).
Update any spec that relied on blur creating a value (search `blur()` near chip inputs in `tests/e2e`; press Enter instead).

### A11 · Menus close on outside clicks and stay inside the window `[x]`
**Files:** new `src/lib/placeMenu.ts` (+ test), `src/canvas/ContextMenu.tsx`, `src/app/Shell.tsx`,
`src/features/boards/SpaceSwitcher.tsx`, `src/design/components/components.css`.

**Do**
1. `placeMenu.ts`: copy `docs/patch-2/reference/placeMenu.ts.txt` (+ its test, 5 cases): `placeMenu(anchor, size, viewport, margin = 8): { x, y }`. Flip up when it would pass
   the bottom, flip left when it would pass the right edge, then clamp inside `[margin, viewport − size − margin]`.
2. `ContextMenu.tsx`: measure the menu in a `useLayoutEffect` (ref → `getBoundingClientRect()`), render it with
   `visibility: hidden` until measured, then position it with `placeMenu`. Add `max-height: calc(100vh - 16px); overflow-y: auto`.
3. Double frame: in `components.css` add
   `.ds-popover:has(> .ds-menu) { padding: 0; border: 0; box-shadow: none; background: transparent; }`
   (fixes the context menu, the space switcher, the zoom menu and the + menu at once).
4. Space switcher outside clicks: in `Shell.tsx`, the top-left wrapper's `zIndex` becomes
   `switcherOpen ? 6 : 1` (read `useBoardUiStore` for the open state), so its backdrop covers the dock and panels.
   (C4 rebuilds the menu itself.)

**Tests:** `placeMenu.test.ts`: fits as is; flips up; flips left; clamps a menu taller than the window to the top margin.
e2e (`smoke-m1-canvas-ui`): right-click near the bottom of the canvas; the menu's bounding box ends inside the viewport.

### A12 · "Copy a problem report" `[x]`
**Why:** every bug in this round only happened on Windows. One click gives the next conversation what the owner's PC sees.

**Files:** `src-tauri/src/app_info.rs`, `lib.rs`, `build.rs`, `capabilities/default.json`, `src/platform/types.ts` + both
platforms, `src/features/diagnostics/MediaCheck.tsx`, new `src/features/diagnostics/problemReport.ts` (+ test),
`src/features/settings/SettingsDialog.tsx` (About), `en.ts`.

**Do**
1. Rust command `problem_report_info` in `app_info.rs` (camelCase JSON): `appVersion` (`package_info().version`),
   `os` and `arch` (`std::env::consts`), `webviewVersion` (`tauri::webview_version()`), `libraryId` (current handle),
   `storedLibraryId` (`meta.library_id`, or null), `cacheFolderCount` (folders under the cache root),
   `cacheFileCount` (files in `cache/<id>`), `models: [{ name, present, bytes }]` for
   `<resource_dir>/models/Xenova/clip-vit-base-patch32/onnx/{vision,text}_model_quantized.onnx`, and `logTail`
   (last 200 lines of the newest `*.log` in the app log dir, read lossily). Register it like A2's command.
2. `types.ts`: `app.problemReportInfo(): Promise<ProblemReportInfo>`; the browser returns a stub with `os: 'browser'`.
3. `MediaCheck.tsx`: move `probe` and its loop into an exported `runMediaCheck(platform): Promise<string[]>` (one line per
   result) that probes `thumbUrl(platform, item, 128)` (with `thumb_v`, like the canvas). The component uses it.
4. `problemReport.ts`: `buildProblemReport(platform): Promise<string>`, plain text: the info above, item counts
   (`SELECT kind, status, COUNT(*) FROM items GROUP BY kind, status`), the AI status from `aiStatusStore`,
   `runMediaCheck` lines, then the log tail. **No item titles or file names** except what the log itself contains.
5. Settings → About: a "Copy a problem report" button → `platform.clipboard.writeText(report)` → toast `problemReportCopied`;
   a line of help text under it (`problemReportHelp`, says log lines may contain file paths).

**Tests:** `problemReport.test.ts` with a fake platform: the report contains the version, the counts and the log tail,
and no item title.

**Phase A Owner checks (plain language)**
- Install the new version and open your library. Wait a minute: every card turns back into its picture ("Refreshing
  previews…"). **Close the app and open it again: the pictures are still there.**
- Hover a photo that shares a Vibe or Tag with another: lines appear. Open Connections: it says why when nothing can connect.
- Settings → AI says "Ready" or "Analyzing…". After a while, AI suggestions appear in Details.
- Double-click a PDF: the first page shows straight away.
- Delete a few things: the minimap updates and nothing stays selected.
- Settings fits the window; About is reachable; backups show one line.
- Click a swatch and paste into Notepad: you get the hex.
- Right-click near the bottom of the screen: the menu stays on screen. Click outside the Library menu: it closes.
- Settings → About → Copy a problem report: paste it into our next conversation if anything looks wrong.

---

## 4. Phase B: simplify

**Goal:** remove Constellations and Frames (D1, D2), and make the Overview the place where clusters are easy to see.
Doing this before the comfort work means nothing gets polished that is about to go. Size: M. Version at the end: **0.10.0**.

**How to remove safely:** delete in small steps and run `pnpm typecheck` often; it lists every remaining use. Then
`grep -rn -i "constellation" src tests` (B1) or `grep -rnE "useFrameStore|frameCommands|FrameRename|selectedFrame|frameMove|onePagePerFrame" src tests` (B3)
must find only what the task says to keep.

### B1 · Remove Constellations from the map `[x]`
**Files to delete:** `src/canvas/useConstellationsBinding.ts`, `tests/e2e/smoke-m3-constellations.spec.ts`.
**Files to edit:** `src/canvas/Engine.ts` (`enterConstellations` / exit, arranged positions and the morph, hub dragging,
the "Back to my layout" event), `src/app/Shell.tsx` (the binding and the "Back to my layout" pill),
`src/app/useGlobalShortcuts.ts` (Shift+C), `src/features/connections/ConnectionsPopover.tsx` (the ✦ switch),
`src/state/connectionsUiStore.ts` (+ test: the constellations flag), `src/canvas/DotGrid.tsx` (the 50 % fade),
`src/features/shortcuts/ShortcutListOverlay.tsx` (Shift+C row), `src/i18n/en.ts` (constellation strings),
`src/design/tokens.ts` + `tokens.css` + `src/lib/motion.ts` + `src/lib/useReducedMotionSync.ts` (`--duration-constellations`
and its JS twin), `tests/e2e/smoke-m3-connections-popover.spec.ts` and `smoke-m3-connections-showall.spec.ts` (any step
that toggles the switch).
**Keep:** `src/lib/constellations.ts` (+ tests), `src/workers/layout.worker.ts`, `src/workers/runConstellationLayout.ts`
(+ test): the Overview's Clusters view uses them. Comments elsewhere that mention Constellations can stay or be reworded.

**Done when:** typecheck, unit and e2e green; Shift+C does nothing; the Connections popover has no ✦ switch.
DECISIONS: "Constellations removed (owner, Patch 2 D1); the layout code lives on in the Overview."

### B2 · The Overview opens on clusters that you can actually see `[x]`
**Why:** measured on synthetic libraries with today's constants, items sit about 185 px (screen) from their star and stars
are about 32 px apart: clusters overlap into one cloud (separation ratio 0.17). The constants were tuned for full-size
cards on the map (long side 160), not for the Overview's small thumbnails.

**Files:** `src/lib/constellations.ts` (+ tests), `src/workers/layout.worker.ts`, `src/workers/runConstellationLayout.ts`,
`src/features/overview/{overviewStore.ts, useOverviewData.ts, OverviewCanvas.tsx, OverviewOverlay.tsx}`,
`src/design/tokens.ts`, `en.ts`, `tests/e2e/patch1-overview.spec.ts`.

**Do**
1. `computeConstellationLayout(…, options?: { spacing?: number })`. New constants (all distances are multiplied by
   `spacing`, default 1):
   | Constant | Today | New |
   |---|---|---|
   | `HUB_LINK_BASE_DISTANCE` / `MIN` / `PER_WEIGHT` | 220 / 60 / 15 | 160 / 50 / 10 |
   | `HUB_COLLIDE_K` | 18 | 26 |
   | `ITEM_COLLIDE_RADIUS` | 88 | 20 |
   | single-hub target | a ring of radius 224 | a **disk**: radius `26 + 40 · √random()` (fills the space around the star instead of a hollow ring) |
   | `MULTI_HUB_JITTER_RADIUS` | 89.6 | 22 |
   | `UNCLASSIFIED_RING_PADDING` | 320 | 80 |
   | `ITEM_TARGET_PULL_STRENGTH` | 0.12 | 0.3 |
   | `ITEM_TICKS` | 120 | 200 |
   `ITEM_CARD_LONG_SIDE` is no longer used for distances (remove it if nothing else uses it). The `random()` calls must stay
   in the same order per item so the layout stays deterministic.
   Measured with these values (synthetic, seeded): 150 items with Vibe + Tags: separation 0.17 → 0.62, member-to-star
   distance 185 → 154 px, time 211 → 80 ms; 150 items, Vibe only: separation 0.53 → 4.0 (fully distinct clusters);
   600 items: no overlapping nodes (was 19 %), ~460 ms in the worker.
2. The worker message and `runConstellationLayout` pass `spacing` through. `useOverviewData` caches per (criteria, spacing).
3. `overviewStore`: `layout` defaults to `'clusters'`; add `spacing: number` (default 1, range 0.7–2) with `setSpacing`.
   The layout toggle reads **Clusters | My layout** (clusters first).
4. `OverviewOverlay.tsx`: a "Spacing" slider (`Slider` component, 0.7–2, step 0.1) next to the Thumbnails/Dots toggle,
   applied on release (re-runs the layout).
5. `OverviewCanvas.tsx`:
   - node size: world long side 32, drawn at `clamp(32 × zoom, 12, 64)` px (today a fixed 16 px); hover still enlarges to 40;
   - **settling**: when a new layout arrives, nodes tween from their previous position (or from their My layout position
     when first opened) to the new one over 600 ms, ease-out (`motion` token `overviewSettle: 600`, instant with reduced
     motion), so you see the groups pull together;
   - **click a star**: its members stay at full opacity, everything else fades to 15 %, and its label stays shown; click
     empty space or Esc clears it.
6. Strings: `overview.spacing`, `overview.layoutClusters` / `layoutMine` (reuse existing keys if present).

**Tests:** `constellations.test.ts`: update distance expectations to the new constants; add "with spacing 2 the mean
member-to-hub distance is larger than with spacing 1"; determinism test still passes. `patch1-overview`: opening shows
Clusters selected; moving the Spacing slider keeps the Overview open and redraws.
**Owner checks:** open the Overview: groups of related items gather around their stars and move into place; the Spacing
slider makes them tighter or looser; click a star to see its group.

### B3 · Remove Frames; export a selection instead `[x]`
**Files to delete:** `src/features/frames/FrameRenameDialog.tsx`, `src/state/frameRenameStore.ts`, `src/state/frameStore.ts`,
`src/commands/frameCommands.ts` (+ test), `src/canvas/useFrameCanvasBinding.ts`, `tests/e2e/smoke-m4-frames.spec.ts`.
**Files to edit:** `src/canvas/Engine.ts` (the frames map, drawing, hit-testing, handles, `selectedFrameId`, the
`frameMove` event; `getExportRect`), `src/features/import/AddMenu.tsx` (the Frame entry), `src/canvas/useCanvasShortcuts.ts`
(F key; Delete on a selected frame; Esc's `setSelectedFrameId`), `src/canvas/useContextMenu.ts`, `src/app/Shell.tsx`,
`src/state/loadLibrary.ts` and `src/features/boards/switchSpace.ts` (stop loading frames), `src/commands/boardCommands.ts`
(duplicating a board no longer copies frames), `src/features/export/{ExportDialog.tsx, exportSpace.ts}`,
`src/lib/exportGeometry.ts`, `src/features/shortcuts/ShortcutListOverlay.tsx`, `src/i18n/en.ts` (`frames` group, export
frame strings), `tests/e2e/app-shell.spec.ts` and any spec that opens the + menu expecting "Frame".
(Careful: "frame" also means video frames, animation frames and `requestAnimationFrame`; don't touch those.)
**Keep:** the `frames` table, `placements.frame_id`, the `Frame` row type if `exportLibrary.ts` still exports frame rows
(the library export is a backup: keep exporting them), and `Placement.frameId` in `rowMapping.ts` (data only).

**Do (export)**
1. `engine.getExportRect(ids: string[] | null)`: `null` → every card (today's behaviour); otherwise the bounds of those cards.
2. `ExportDialog.tsx`: "Area" becomes a segmented control **Whole board | Selection (n)**; Selection is disabled when nothing is
   selected and selected by default when something is. Remove the frame list and "one page per frame". PDF is one page.
3. `exportSpace.ts`: options `{ area: 'all' | 'selection'; ids: string[] }` instead of `frameId` / `onePagePerFrame`; the file
   title is the space name, plus " (selection)" for a selection.

**Tests:** `exportGeometry` / `exportSpace` unit tests use ids instead of frames; `smoke-m4-export`: select two items,
export PNG with "Selection", the download succeeds.
DECISIONS: "Frames removed (owner, Patch 2 D2). Existing frame rows stay in the database, unused."

**Phase B Owner checks (plain language)**
- Shift+C and the ✦ switch are gone. Open the Overview (minimap's expand button or O): it starts on Clusters.
- The + menu no longer has Frame. Old frames are gone from the map (your items are untouched).
- Select a few items → Export → Selection: you get just those.

---

## 5. Phase C: everyday comfort

**Goal:** one Esc rule (and Esc leaves full screen), resizing from every side with crops instead of stretching, a clean
Library menu, a real Trash screen, visible favourites, and List tiles for every kind. Size: L. Version at the end:
**0.11.0**. Mockups: `docs/patch-2/canvas.png`, `library-trash.png`.

### C1 · One rule for Esc; Esc leaves full screen `[ ]`
**Why:** 13 separate Esc listeners run in no particular order (closing Settings also clears the selection), five overlays
ignore Esc, and nothing leaves full screen.

**Files:** new `src/app/escapeStack.ts` (+ test), new `src/app/useEscape.ts`, new `src/lib/isTypingTarget.ts` (+ test),
`src/app/App.tsx`, `src/app/fullscreen.ts` (+ test), `src/platform/types.ts` + both platforms, `src/canvas/Engine.ts`
(`isPicking()`), and every file in the table below, `en.ts`.

**Do**
1. `escapeStack.ts`: copy `docs/patch-2/reference/escapeStack.ts.txt` as is (`createEscapeStack`, `escapeStack`, `installEscapeListener`; its test has 7 cases).
   Rules it encodes: Esc goes to the **last opened layer**; a layer returns `true` when it did something. While focus is in
   a text field, only the top layer can take Esc and only if it was pushed with `allowWhileTyping`; otherwise the field
   keeps Esc. With no layer open, the **base handlers** run in priority order.
2. `isTypingTarget.ts`: one shared version: `<input>` of a text-like type (text, search, url, email, number, password, or no
   type), `<textarea>`, `<select>`, or `isContentEditable`. Not ranges, checkboxes, buttons. Replace the five copies
   (§2.4) with imports of it.
3. `useEscape.ts`: `useEscape(active: boolean, onEscape: () => void, opts?: { allowWhileTyping?: boolean })`. Keep
   `onEscape` in a ref; push **once** when `active` turns true, remove when it turns false or on unmount (never re-push on
   re-render: `Dialog` gets inline closures). The pushed handler calls the ref and returns `true`.
4. `App.tsx`: `installEscapeListener(window, isTypingTarget)` once. Base handlers, registered where their state lives:
   - priority 10, `useCanvasShortcuts`: if `engine.isPicking()` (connect pick or point pick) cancel it; else if a connection
     line is selected, deselect it; return whether it did something. Add `isPicking(): boolean` to the engine.
   - priority 20, `useCanvasShortcuts`: if the selection isn't empty, clear it and return true.
   - priority 30, `App.tsx`: if `uiStore.fullscreen`, `setFullscreen(platform, false)` and return true.
5. Migrate these to `useEscape` (and delete their own Esc code; keep their other keys):
   | Where | Today | `allowWhileTyping` |
   |---|---|---|
   | `Dialog.tsx` | capture listener, `onClose` (keep its Tab focus trap) | yes |
   | `OverviewOverlay.tsx` | capture, `hide()` | yes |
   | `FocusView.tsx` | bubble, `close()` (keep arrows) | yes (`smoke-m5-font` presses Esc in its text field) |
   | `DescriptionPanel.tsx` | capture, `close()` | yes |
   | `NoteEditor.tsx` | capture, `close()` | yes |
   | `SearchBar.tsx` | bubble, `closeOrClearText()` | yes |
   | `ConnectionsPopover.tsx` | capture, `close()` | yes (its slider) |
   | `SpaceSwitcher.tsx` | capture, `closeSwitcher()` | yes |
   | `PaletteEditor.tsx` | pick mode only, `cancelPointPick()` | no |
   | `TriageView.tsx` | `close()` | no |
   | `useCanvasShortcuts.ts` | the canvas Esc | becomes the base handlers above |
   New layers for things that ignore Esc today: `ContextMenu`, `ZoomMenu`, the + menu popover, `BoardsGallery`, the expanded
   List overlay (all `allowWhileTyping: true` except `BoardsGallery`, whose rename field keeps Esc).
   Leave `ChipInput`'s and `BoardsGallery`'s rename input's own Esc handlers alone (they are field-level).
6. Full screen:
   - `types.ts` → `window.onFullscreenChange(cb: (on: boolean) => void): () => void`. Browser: `document`
     `fullscreenchange`. Tauri: `getCurrentWindow().onResized(async () => cb(await isFullscreen()))`.
   - `App.tsx` subscribes and keeps `uiStore.fullscreen` in sync (the browser's own Esc leaves full screen too).
   - `en.fullscreen.hint` becomes "Full screen · press Esc or F11 to leave". `ShortcutListOverlay`: the Esc row reads
     `en.shortcuts.escapeLadder` ("Close, deselect, then leave full screen").

**Tests:** `escapeStack.test.ts` (from the reference); `isTypingTarget.test.ts`; `fullscreen.test.ts`: the change callback updates
the store. e2e: `smoke-m1-canvas-ui` — select an item, open Settings, press Esc: Settings closes and the item is **still
selected**; press Esc again: the selection clears. Every spec in the "Esc behaviour" list still passes:
`smoke-m2-triage`, `patch1-description`, `smoke-m5-font`, `smoke-m2-search`, `smoke-m3-connections-popover`,
`patch1-overview`, `smoke-m2-list`.
**Owner checks:** in full screen with nothing open and nothing selected, Esc leaves full screen.

### C2 · Resize from every side `[ ]`
**Why:** D7. Today: four corner handles, every kind keeps its proportions, no resize cursor.

**Files:** new `src/canvas/resizeMath.ts` (+ test), `src/canvas/selection.ts`, `src/canvas/Engine.ts`,
`src/design/tokens.ts`. Mockup: `canvas.png` (left).

**Do**
1. `resizeMath.ts`: copy `docs/patch-2/reference/resizeMath.ts.txt` as is (`ResizeHandle` with 8 values, `handleDirection`, `cursorForHandle`,
   `resizePolicyFor(kind)`, `resizeHandleAt`, `resizeRect`; 22 test cases). Use the app's own `Rect` and `ItemKind` types.
   Policy: pictures (image, video, pdf, link) and notes get all 8 handles; a **font** card only its 4 corners, always
   keeping proportions (it's a picture of laid-out text); swatches/palettes and (F5) type collections and their rows none.
2. Handles (tokens `resizeHandles = { corner: 10, sideLong: 20, sideShort: 6, hitTolerance: 6 }`, screen px): corners are
   white squares with a 1.5 px accent border (as today); sides are small white pills centred on each edge. Hit-testing uses
   `resizeHandleAt(bounds, worldPoint, { tolerance: hitTolerance / zoom, handles: policy.handles })`, so the **whole edge**
   (±6 px) can be grabbed, not only the pill. Replace the handle code in `selection.ts` and the engine's hit-test
   (`Engine.ts` ~1425-1437) and drawing (~1839-1855).
3. Cursor: while the pointer is over a handle (and during the drag), set the canvas container's `style.cursor` to
   `cursorForHandle(handle)`; reset it when leaving.
4. Drag: keep the rect **at press time**; on every move call
   `resizeRect(startRect, handle, pointerNow − pointerAtPress, { keepAspect: isCorner && (policy.alwaysKeepAspect || !e.shiftKey), fromCenter: e.altKey, minSize: 40 })`.
   Modifiers are read on every move (pressing Alt mid-drag works). On release, one `createResizeItemCommand` as today.
5. The connect handle (today on the right edge's midpoint, ~`Engine.ts:1264`) moves **22 px outside** the right edge
   (screen px), so it never sits on the east side handle.
6. Alt-drag must not trigger the browser's or the app's Alt behaviours: `preventDefault()` on the pointer events of a resize.

**Tests:** `resizeMath.test.ts` (from the reference). e2e `patch2-resize.spec.ts`: import `wide-circle.png`, select it, drag the
right side handle 100 px right → the card is wider and the same height; drag a corner → proportions kept; hold Shift on a
corner → proportions change; hold Alt on the right side → both left and right edges moved. Measure positions from the
canvas bounding box (no hard-coded coordinates).

### C3 · Pictures crop instead of stretching `[ ]`
**Why:** D7: a side handle changes the proportions; a photo must never be squashed.

**Files:** new `src/db/migrations/003_crop.sql`, `src/db/migrator.ts`, `src/state/types.ts`, `src/db/rowMapping.ts`
(+ test), new `src/canvas/coverCrop.ts` (+ test), `src/canvas/Engine.ts`, `src/canvas/itemCards.ts`,
`src/commands/itemCommands.ts` (+ test), `src/features/import/fitPlacements.ts`, `src/canvas/contextMenuItems.ts`
(+ test), `src/canvas/ContextMenu.tsx`, `en.ts`.

**Model:** a placement may carry a crop focus `crop_x`, `crop_y` (0–1, the meaning of CSS `object-position` under
`object-fit: cover`; `NULL` = not cropped by the owner). A picture is always drawn **cover** (never stretched): when the
card's proportions differ from the picture's, only part of it shows, positioned by the focus (0.5 when null).

**Do**
1. `003_crop.sql`: Appendix C.1 (`ALTER TABLE placements ADD COLUMN crop_x REAL` and `crop_y REAL`). Register version 3.
   `Placement` gains `cropX: number | null`, `cropY: number | null`; `ItemCard` gains them too (`itemCards.ts`).
2. `coverCrop.ts`: copy `docs/patch-2/reference/coverCrop.ts.txt` as is (16 test cases: `visibleFraction`, `coverFrame`, `isWholeTexture`, `dragCropFocus`,
   `isCropped`, `resetCropRect`, `cardUvToImageUv`).
3. Engine drawing (the three places that set `sprite.width/height`, ~522, ~1118, ~1550): after choosing a texture for a
   picture card, compute `coverFrame(tex.width, tex.height, card.w, card.h, card.cropX, card.cropY)`. If
   `isWholeTexture(frame, …)`, use the shared texture; otherwise give the sprite
   `new Texture({ source: tex.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) })` (shares the GPU source,
   cheap; no masks, which are slow). Keep the crop texture per card, destroy it (`destroy(false)`, never the source) when it
   is replaced, when the card goes, and when its base texture is evicted. Recompute on every texture swap (t128 → t512),
   resize and focus change. Videos playing their hover preview use the same frame maths.
4. Resizing a picture card from a **side** (proportions change) writes `crop_x = crop_y = 0.5` if they were null, in the
   same `createResizeItemCommand` (extend its update with optional `cropX`/`cropY`; undo restores them). This marks the
   placement as cropped by the owner.
5. `fitPlacementsToAspect`: skip placements whose `crop_x` is not null (an owner's crop must survive a re-derive, e.g.
   A2's self-check).
6. Right-click on a picture card (single selection):
   - **Adjust crop** (only when `isCropped`): enters a crop mode: the whole picture shows at 32 % opacity around the card
     and the card's part at full opacity with a 2 px white outline; dragging inside moves the picture
     (`dragCropFocus`); a hint pill under the card says `en.crop.hint`. Enter, Esc (an Esc layer) or a click outside
     finishes; the change is one command `createSetCropCommand(platform, boardId, itemId, { cropX, cropY })` (undoable).
   - **Reset crop** (only when `isCropped`): `resetCropRect` → one command setting the rect and `crop_x/crop_y = NULL`.
7. "Pick from a photo" (palette editor, later the Color studio) on a cropped card maps the clicked point with
   `cardUvToImageUv` before sampling.
8. Export renders through the engine, so crops export as shown. The minimap draws colour rects (unchanged); List tiles
   already centre-crop.

**Tests:** `coverCrop.test.ts` (from the reference); `itemCommands.test.ts`: side resize sets the focus, undo clears it;
`createSetCropCommand` do/undo; `rowMapping` maps the new columns; `contextMenuItems.test.ts`: Adjust/Reset crop appear only
for a cropped picture. e2e (`patch2-resize.spec.ts`, extend): after the side drag, the pixel at the card's centre is still
the circle's orange (cropped, not stretched: a stretched circle would still be orange, so also check a pixel 30 px inside
the right edge is the blue-green background, not orange).

### C4 · The Library menu `[ ]`
**Files:** `src/features/boards/SpaceSwitcher.tsx`, new `src/features/boards/boardSummaries.ts` (+ test),
`src/design/components/Menu.tsx`, `components.css`, `src/app/Shell.tsx`, `en.ts`. Mockup: `library-trash.png` (top).

**Do**
1. `boardSummaries.ts`: `loadBoardSummaries(platform): Promise<Map<string, { count: number; coverIds: string[] }>>` with
   `SELECT p.board_id, p.item_id FROM placements p JOIN items i ON i.id = p.item_id WHERE i.deleted_at IS NULL ORDER BY p.board_id, p.added_at DESC`;
   `coverIds` = the first four items that are pictures with `status = 'ok'`. Reload when the menu opens.
2. Rebuild the menu as **one panel** (no `Popover` around the `Menu`), width 300:
   - "Library" row (map icon, item count on the right, a check when it's the current space);
   - a small "Boards" header, then the **5 most recently edited** boards: a 36 px 2×2 cover (`thumbUrl(…, 128)` of
     `coverIds`), the name, a second line "<n> items · edited <relative date>", a check on the current one;
   - **New board** as a full-width secondary button; clicking it turns into a name field (Enter creates and opens the board
     with `createCreateBoardCommand` + `switchSpace`; Esc cancels). No more "Untitled board" duplicates;
   - "All boards…" (grid icon, count) opens the gallery;
   - a separator, then **Trash** (trash icon, count of trashed items) opens the Trash view (C5).
3. `Menu.tsx`: `MenuItem` gains optional `checked`, `secondary` (second line), `trailing` (right-aligned text) and a
   `{ kind: 'separator' }` / `{ kind: 'header', label }` entry type, used here.
4. Render the menu and its backdrop in a portal (`createPortal(…, document.body)`) at z-index 6, so outside clicks close it
   (replaces A11's z-index workaround: remove that).
5. Strings: `spaceSwitcher.*` (Appendix B).

**Tests:** `boardSummaries.test.ts` (mocked `db.select`, like `trashActions.test.ts`): counts and at most four covers,
pictures only. e2e (`smoke-m4-boards-gallery`, extend): open the menu → the current space has a check; New board → type
"Moodboard" → Enter → the space switcher shows "Moodboard"; click the dock while the menu is open → the menu closes.

### C5 · The Trash screen `[ ]`
**Files:** new `src/features/trash/TrashView.tsx`, `src/state/boardUiStore.ts` (or a new `trashUiStore.ts`),
`src/features/trash/trashActions.ts` (+ test), delete `src/features/trash/TrashSection.tsx`,
`src/features/settings/LibrarySection.tsx`, `src/state/toastStore.ts`, `src/design/components/Toast.tsx`,
`src/features/toasts/ToastHost.tsx`, new `src/features/trash/trashToast.ts`, `src/canvas/useCanvasShortcuts.ts`,
`src/canvas/ContextMenu.tsx`, `src/features/details/BulkDetailsPanel.tsx`, `src/app/Shell.tsx`, `en.ts`.
Mockup: `library-trash.png` (bottom).

**Do**
1. `TrashView.tsx`: a full-window overlay built like `BoardsGallery` (fixed, inset 0, z-index 20, `--canvas` background,
   padding `--space-6`, scrolls), with an Esc layer (C1). Contents:
   - header: "Trash", "<n> items · <m> boards", **Empty trash…** (danger; confirm with `window.confirm`, as today), close;
   - help line `trash.help` (things stay until deleted; Delete forever moves the files to the Windows Recycle Bin; items are
     removed automatically after 30 days — `AUTO_PURGE_DAYS`, say so);
   - a toolbar: select-all checkbox, "<k> selected", **Restore**, **Delete forever**, and a Newest/Oldest toggle;
   - a grid of tiles (148 px): thumbnail (same per-kind tile as C7), title, "deleted <relative date>"; click toggles
     selection (checkbox top-left); hover shows Restore and Delete forever on the tile;
   - trashed boards in their own row below (move the trashed-boards block from `BoardsGallery` here; the gallery keeps only
     live boards).
   Restore uses `createRestoreItemCommand` (undoable), Delete forever and Empty use `deleteForever` (not undoable). Fix on
   the way: `createRestoreItemCommand` must upsert the placement **of the current space** (`WHERE item_id = ? AND board_id = ?`),
   not the first one found.
2. Open it from the Library menu (C4) and from the trash toast: `useToastStore.show` gains an optional second action
   (`secondaryLabel`, `onSecondary`), rendered after Undo with the same style. `trashToast.ts` has one helper
   `showTrashToast(count, undo)` used by the three places that build the message today
   (`useCanvasShortcuts.ts` ~179, `ContextMenu.tsx` ~219, `BulkDetailsPanel.tsx` ~126): "Moved <n> items to Trash · Undo · Open Trash".
3. Remove `TrashSection` from Settings → Library.
4. Strings: `trash.*` (Appendix B).

**Tests:** update `smoke-m1-trash-focus` and `smoke-m1-settings-empty` (they go through Settings → Library → Trash today):
delete an item → toast "Open Trash" → the Trash shows it → Restore → it is back on the map. `trashActions.test.ts`: restore
picks the current space's placement.

### C6 · Favourites show `[ ]`
**Files:** `src/canvas/Engine.ts`, new `src/canvas/favoriteBadge.ts`, `src/canvas/itemCards.ts` (+ test),
`src/canvas/contextMenuItems.ts` (+ test), `src/canvas/ContextMenu.tsx`, `src/features/list/ListPanel.tsx`,
`src/features/search/SearchBar.tsx` (or the dock), `src/design/tokens.ts`, `en.ts`.

**Do**
1. `ItemCard.favorite: boolean` (the four card literals in `itemCards.ts`).
2. `favoriteBadge.ts` draws the badge: a 24-world-unit dark disc (`colors.canvas` at 72 %) with a 14-unit amber star
   (`colors.accent`, `Graphics.star()`), **top-left**, 8 units in (the thought bubble is top-right, duration/page badges
   bottom-right). Hidden below 25 % zoom. Manage it like the corner badge (`syncCornerBadge`, `Engine.ts` ~699-735): a
   `favBadges` map with the same lifecycle (create on `setLibraryItems`, fade with the card in `forEachCardVisual`, cull in
   `cullItems`, include in `forceVisibleForExport`, destroy with the card).
3. Context menu: **Add to favorites** / **Remove from favorites** for one or more media items
   (`createSetItemFieldCommand` / `createBulkSetItemFieldCommand` with `'favorite'`).
4. List tile: a 20 px star disc in the top-left corner of favourite tiles.
5. A one-click **★ Favorites** toggle next to the search field (calls `useSearchStore.toggleFavorite()`; active style
   `background: var(--accent); color: var(--on-accent)`), also visible while the search bar is closed as a small dock
   toggle next to Search.

**Tests:** `itemCards.test.ts` (favorite mapped); `contextMenuItems.test.ts` (exact list updated); e2e
`smoke-m2-details`: toggle Favorite → right-click shows "Remove from favorites"; the List tile has the star.

### C7 · Every kind has a List tile `[ ]`
**Files:** `src/features/list/ListPanel.tsx` (split the tile into new `src/features/list/ListTile.tsx`),
`src/lib/color.ts` (move `readableTextColor` from `Engine.ts`), `src/lib/search.ts` (export `sourceDomain`), `components.css`.
Mockup: `canvas.png` (bottom row).

**Do** — `ListTile` picks by kind (the tile is a square of 56/88/132 px):
| Kind | Tile |
|---|---|
| image, video, pdf | today's `t128` image, `object-fit: cover` |
| swatch / palette | `swatchColorsOf(item)`: one colour fills the tile; more make a 2-column grid of cells (2 px gap, radius 4, 6 px padding) on `--surface-2` |
| note | the note's paper colour (`noteColors`), its text colour (`noteStyles`), the first 3 lines of `bodyText` (11 px, line-clamp 3, 8 px padding) |
| font family | the `t128` specimen with `object-fit: contain` on the card colour (never cropped) |
| link | the cover when `status === 'ok' && coverPath`; otherwise the site (`sourceDomain(url)`, `--text-3`) and the title (2 lines) on `--surface-2` |
| type collection (F5) | added in F5 |
Plus the favourite star (C6). Never render an `<img>` without a `src` (that's the broken-image icon today).

**Tests:** e2e `smoke-m2-list`: with the demo seed, every tile has either an `<img>` that loaded (`naturalWidth > 0`) or no
`<img>`; a palette tile shows coloured cells.

**Phase C Owner checks (plain language)**
- Esc closes things in order; with nothing open, it leaves full screen.
- Select a photo: drag a side to make it a different shape (it crops, never squashes); corners keep the shape, Shift
  frees them; Alt resizes from the centre. Right-click → Adjust crop to move the picture inside; Reset crop.
- The Library menu shows where you are, board covers, a New board button that asks for a name, and the Trash.
- Delete something → "Open Trash" → restore it.
- Star a photo: a small star shows on the map and in the List; ★ Favorites filters.
- Every List tile shows something: palettes their colours, fonts their "Aa", notes their text.

---

## 6. Phase D: word fields

**Goal:** one combobox for Vibe, Movement and Tags everywhere. Existing words come first (most used first),
typos are forgiven, a new word is only made on purpose, and Movement holds only movements.
Size: M. Version at the end: **0.12.0**. Mockup: `docs/patch-2/combobox.png`.

### D1 · Matching and the combobox component `[ ]`
**Files:** new `src/lib/termMatch.ts` (+ test), new `src/design/components/TermCombobox.tsx`, `components.css`,
`src/design/components/index.ts`, new `src/features/details/useTermOptions.ts`, `en.ts`.

**Do**
1. `termMatch.ts`: copy `docs/patch-2/reference/termMatch.ts.txt` **as is** (`TermOption`, `TermMatchResult`, `editDistance`, `allowedTypos`,
   `matchTerms`), and its test file (11 tests, all passing at the time of writing).
2. `useTermOptions(facet: 'vibe' | 'movement' | 'tag'): TermOption[]`: every term of that facet from `useTermStore`,
   with `count` = number of items linked to it (count over `itemTerms`, like `DetailsPanel`'s `usageCounts`). Memoise on
   `terms` and `itemTerms`.
3. `TermCombobox.tsx`, props:
   ```ts
   export interface TermComboboxProps {
     label: string;                 // aria-label of the input, e.g. en.vocabulary.facets.vibe
     values: string[];              // the item's current words (chips)
     options: TermOption[];         // from useTermOptions
     onAdd: (name: string) => void; // an existing name (exact spelling) or a new one
     onRemove: (name: string) => void;
     placeholder?: string;
     dotColor: string;              // 'var(--criterion-vibe)' | 'var(--criterion-movement)' | 'var(--criterion-tags)'
     newWordLabel: string;          // shown on the Create row: en.combobox.newVibe / newMovement / newTag
   }
   ```
   Behaviour (exactly):
   - The chips and the text input look like today's `ChipInput` (reuse `.ds-chip-input`, `.ds-chip-input__field`, `Chip`).
   - **Focus or click** opens the list. The list is **in the flow** under the field (not floating), styled like
     `.ds-menu`, so no panel can clip it. Rows come from `matchTerms(query, options, values)`.
   - Rows: a dot (`dotColor`), the name, the count on the right (`.count` style, `--text-3`). The row equal to
     `didYouMean` shows "Did you mean?" (accent, 12 px) after the name. Then, when `canCreate`, a separator and the
     **Create row**: plus icon, `en.combobox.create(query)`, `newWordLabel` on the right. With an empty query, a small
     header "Most used" sits above the rows.
   - **Highlight**: the first match when there is one; otherwise the Create row. ↓/↑ move through the matches and the
     Create row (no wrap). Hover moves the highlight.
   - **Enter**: adds the highlighted row (a match → `onAdd(match.name)`; Create → `onAdd(query.trim())`), clears the
     query, keeps focus and keeps the list open. Enter with nothing highlighted does nothing.
   - **Click a row**: same as Enter on it. The list's `onMouseDown` calls `preventDefault()` so the input keeps focus.
   - **Esc**: when the list is open, close it; otherwise blur the input. In both cases call `e.preventDefault()` so the
     global Esc handler (C1) leaves the panel alone.
   - **Backspace** on an empty query removes the last chip (as today). **Tab** closes the list.
   - **Blur** closes the list and clears the query. It never creates a word (P6).
   - ARIA: input `role="combobox"`, `aria-expanded`, `aria-controls` (listbox id from `useId()`),
     `aria-activedescendant`; list `role="listbox"`; rows `role="option"`, `aria-selected` on the highlighted one.
   - At most 8 match rows (the limit in `matchTerms`).
4. Export it from `components/index.ts`. Strings: `combobox.*` (Appendix B).

**Tests:** `termMatch.test.ts` (from the reference). A component test `TermCombobox.test.tsx` with `@testing-library/react`
(jsdom is the default test environment): typing "dremy" with an option "Dreamy" then Enter calls `onAdd('Dreamy')`;
typing "grain" then Enter calls `onAdd('grain')`; ↓ from a match to Create then Enter calls `onAdd('dremy')`; blur
calls nothing; Esc with the list open closes it and the event is `defaultPrevented`.

### D2 · Use the combobox in Details, Triage and bulk editing `[ ]`
**Files:** `src/features/details/DetailsPanel.tsx`, `src/features/triage/TriageView.tsx`,
`src/features/details/BulkDetailsPanel.tsx`, `src/features/design/DesignPage.tsx` (or wherever `DesignPage.tsx` lives:
`grep -rn "ChipInput" src`), delete `src/design/components/ChipInput.tsx` and its export.

**Do**
1. Details: the three `ChipInput`s (Vibe, Movement, Tags) become `TermCombobox` with `useTermOptions(facet)`,
   `dotColor` and `newWordLabel` per facet. `addTerm` already reuses an existing term by name.
2. Triage: same three fields. Keep the V / M / T shortcuts: they focus `container.querySelector('input')`, which still works.
3. Bulk: `BulkChipField`'s free-text input becomes a `TermCombobox` whose `values` are the words **every** selected item has;
   the partial chips ("Dreamy 5/8") stay above it as today.
4. `DesignPage.tsx`: swap its `ChipInput` example for a `TermCombobox` with three fake options.
5. Delete `ChipInput.tsx` and its line in `components/index.ts`. **Keep** the `.ds-chip-input*` CSS: the title, artist,
   source and "why" inputs use `.ds-chip-input__field`.

**Tests:** update `smoke-m2-details`, `smoke-m2-triage`, `smoke-m2-bulk-details` where they type a value: type, then press
Enter (the first match or Create is highlighted). New assertion in `smoke-m2-details`: focus the Vibe field, the list shows
"Dreamy"; type "dremy", the first row shows "Did you mean?".

### D3 · Movement holds movements; words can move between fields `[ ]`
**Files:** new `src/db/migrations/004_vocabulary.sql`, `src/db/migrator.ts` (+ test), `src/lib/vocabulary.ts`,
`src/commands/vocabularyCommands.ts` (+ test), `src/features/settings/VocabularySection.tsx`, `en.ts`.

**Do**
1. `004_vocabulary.sql`: Appendix C.2. Moves Psychedelic, Grunge, Punk, Y2K and Vaporwave from Movement to Vibe (keeping
   their links to items and their AI hints) unless a Vibe with the same name already exists; deletes Contemporary only
   if no item uses it. Register it in `migrator.ts` as `{ version: 4, name: 'vocabulary', sql: migration004 }`
   (C3 registered version 3).
2. `vocabulary.ts` (new libraries): remove those six from `STARTER_MOVEMENTS`; append to `STARTER_VIBES`: Psychedelic,
   Grunge, Punk, `{ name: 'Y2K', aiHint: 'Y2K aesthetic, chrome, early 2000s' }`, Vaporwave.
3. `createMoveTermCommand(platform, termId, toFacet: 'vibe' | 'movement' | 'tag'): Command` in
   `vocabularyCommands.ts`:
   - if the target facet already has a term with the same `name_norm`, delegate to `createMergeTermsCommand(platform,
     termId, existing.id)` (its undo already restores everything);
   - otherwise `UPDATE terms SET facet = ?, sort = ? WHERE id = ?` with `sort` = (highest sort in the target facet) + 1,
     and update `useTermStore` (`upsertTerm`). Undo restores the old facet and sort.
   - Type terms can't be moved (an item has one Type): the UI never offers it.
4. `VocabularySection.tsx`: for Vibe, Movement and Tags rows, a small `<select>` "Move to…" listing the two other facets
   (`en.vocabulary.moveTo`, `en.vocabulary.facets.*`); choosing one runs the command and resets the select.

**Tests:** `migrator.test.ts`: versions still contiguous. A real-SQL test needs a helper that doesn't exist yet;
create `src/test/migratedDb.ts` (it is reused in F1/F2):
```ts
// Real SQLite (sql.js) in memory, with the app's migrations applied up to `upTo`.
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { migrations, splitStatements } from '@/db/migrator';
export async function migratedDb(upTo = Infinity): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), 'node_modules/sql.js/dist', f) });
  const db = new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON');
  for (const m of migrations.filter((x) => x.version <= upTo))
    for (const stmt of splitStatements(m.sql)) db.run(stmt);
  return db;
}
```
Start the test file with `// @vitest-environment node`. Test: migrate to 3, insert a "Grunge" movement term linked to an
item and an unused "Contemporary" movement, run `004`'s statements, then check Grunge is a vibe still linked to the item
and Contemporary is gone; a second case where Contemporary is used keeps it. `vocabularyCommands.test.ts`: move,
undo; move onto an existing name merges.
**Owner checks:** Movement only suggests movements; Grunge, Punk, Y2K, Vaporwave and Psychedelic are Vibes; Settings →
Vocabularies → "Move to…" moves a word with its items.

**Phase D Owner checks (plain language)**
- Click Vibe in Details: your vibes appear, most used first, with counts. Type "dremy": Dreamy is first, marked "Did you
  mean?", and Enter adds Dreamy. Type a new word: "Create …" is the only line, and Enter creates it.
- Click somewhere else while typing: nothing is created.
- Same behaviour in Triage and when several items are selected.

---

## 7. Phase E: the Color studio

**Goal:** one full-window workspace for every colour task, inspired by Adobe Color (wheel and harmonies, colours from an
image with draggable eyedroppers, contrast checker, colour-blind preview) and by the "lock and press Space" generators,
with a Liked shelf that is kept. It replaces the small palette editor in Details. Size: L. Version at the end: **0.13.0**.
Mockups: `docs/patch-2/studio-generate.png` (shell + Generate) and `studio-tabs.png` (Wheel, From an image, Contrast).

**Words used below:** a **spot** is one colour of the palette being built (the columns at the bottom). The **selected spot**
is the one the tabs edit. A **locked** spot never changes. **Liked** colours live on the shelf on the right.

### E1 · Colour maths `[ ]`
**Files:** new `src/lib/colorStudio.ts` (+ `colorStudio.test.ts`).

**Do:** copy `docs/patch-2/reference/colorStudio.ts.txt` **as is** (24 test cases, all passing at the time of writing; culori 4.0.2 only). It exports:
`Hsv`, `HarmonyRule` (`analogous`, `monochromatic`, `triad`, `complementary`, `splitComplementary`, `square`, `compound`,
`shades`, `custom`), `harmony(base, rule, count, wheel = 'ryb')` (index 0 is always the base; offsets are measured on the
artist's RYB wheel like Adobe Color, so red's complement is green), `rybToHue`/`hueToRyb`, `Slot`, `seededRng`,
`generatePalette(slots, rng, 'harmonious' | 'random')` (locked slots come back unchanged), `contrastInfo(fg, bg)`,
`nearestPassing(fg, bg, target)` (same hue and chroma, lightness only; `null` when impossible), `CvdType`,
`simulateCvd(hex, type)`, `Mood`, `moodPick(pixels, width, height, mood, count)` and `locateColors(pixels, width, height, hexes)`
(both return colours **with the pixel they came from**, so eyedroppers can be placed).
Note in `contrastInfo`: never round the ratio before comparing; display it rounded **down** to 2 decimals.

### E2 · The studio shell, the palette strip and saving `[ ]`
**Files:** new `src/features/colorStudio/{colorStudioStore.ts (+ test), ColorStudio.tsx, PaletteStrip.tsx, LikedShelf.tsx, studioKeys.ts}`,
new `src/app/overlayGate.ts` (+ test), `src/canvas/input.ts`, `src/canvas/useCanvasShortcuts.ts`, `src/app/useGlobalShortcuts.ts`,
new `src/commands/composite.ts` (+ test), `src/state/loadSettings.ts`, `src/state/settingsStore.ts`, `src/app/Shell.tsx`,
`src/design/tokens.ts`, `en.ts`.

**Do**
1. `overlayGate.ts`: `openBlockingOverlay(name): () => void` and `isBlockingOverlayOpen(): boolean` (a counted set).
   `canvas/input.ts` (Space-to-pan), `useCanvasShortcuts` and `useGlobalShortcuts` return early when it's open. The studio
   opens it on mount (this is how Space can mean "generate" without panning the map underneath).
2. `composite.ts`: `createCompositeCommand(label, commands: Command[]): Command` — `do` runs them in order, `undo` in reverse.
3. Liked colours (D6): library setting `likedColors: string[]` (uppercase `#RRGGBB`, newest first, at most 60, no duplicates)
   with `setLikedColors(platform, hexes)` in `loadSettings.ts`, the same pattern as `setFontPreviewText` (a preference, not a
   Command; note it in DECISIONS).
4. `colorStudioStore.ts` (zustand):
   ```ts
   type StudioSource = { kind: 'new' } | { kind: 'edit'; itemId: string } | { kind: 'fromPhoto'; itemId: string };
   type StudioTab = 'wheel' | 'image' | 'generate' | 'contrast';
   interface StudioSpot { id: string; hex: string; locked: boolean }
   interface ColorStudioState {
     open: boolean; source: StudioSource; tab: StudioTab; name: string;
     spots: StudioSpot[]; selected: number | null; dirty: boolean;
     history: string[][]; historyIndex: number;      // Generate proposals (E5), at most 50
     likedSelected: string | null;                   // the liked colour picked for comparison
     openStudio(source: StudioSource, init: { name: string; hexes: string[]; tab?: StudioTab }): void;
     close(): void; setTab(t: StudioTab): void; setName(n: string): void;
     select(i: number | null): void; setHex(i: number, hex: string): void; setHexes(hexes: string[]): void; // keeps locked spots
     toggleLock(i: number): void; add(hex?: string): void; remove(i: number): void; move(from: number, to: number): void;
   }
   ```
   `MAX_SPOTS = 10` (P5): `add` does nothing at 10 (a palette that already has more keeps them, `+` is disabled).
   `remove` never removes the last spot. Every change sets `dirty`.
5. `ColorStudio.tsx`: a full-window overlay (fixed, inset 0, z-index 20, `--canvas` background), grid as in the mockup:
   top bar 64 px (title, the name field, the four tabs centred, **Cancel** and **Save palette** on the right); the middle
   shows the current tab; the **palette strip** (228 px) at the bottom; the **Liked shelf** (256 px wide) on the right.
   Esc layer (C1): if `dirty`, `window.confirm(en.colorStudio.discardConfirm)`; then close.
6. `PaletteStrip.tsx`: one column per spot (flex 1, radius 16, `--shadow-card`), the hex in 20 px bold at the bottom
   (**always visible**), text colour by contrast (`readableTextColor` from C7); tools at the top: a grip (HTML5 drag to
   reorder, like `PaletteEditor` does today), lock, heart, copy, remove. Locked and liked spots always show their icon on a
   solid disc; the other tools show on hover or when selected. Click selects (3 px `--text-1` outline, 3 px offset). A
   dashed **+** column (56 px) adds a spot (the selected colour lightened, or a mid grey). Heart adds the hex to Liked
   (or removes it if already liked). Copy writes the hex to the clipboard with a toast.
7. `LikedShelf.tsx`: heading with the count, help line, a 2-column grid of liked colours (56 px blocks, hex under each);
   click selects one for comparison (`likedSelected`); the **Compare** block shows the selected spot and the liked colour
   side by side (96 px, labelled); **Choose** puts the liked colour into the selected spot (or adds a spot when none is
   selected); **Remove from Liked**.
8. Saving (**Save palette**):
   - `new` and `fromPhoto`: `createCreatePaletteCommand(platform, boardId, isLibraryBoard, cx, cy, colors, name)` where the
     centre is to the right of the source photo (`p.x + p.w + 48 + w/2`, `p.y + h/2`, with `w`/`h` from `paletteCardSize`)
     for `fromPhoto`, else the viewport centre. Select the new palette.
   - `edit`: `createCompositeCommand('Edit palette', [createSetSwatchColorsCommand(…), createSetItemFieldCommand(…, 'title', name)])`
     (the title command only when the name changed). One undo step.
   - Then close. Default name: `en.colorStudio.untitled`.
9. Keys while the studio is open (`studioKeys.ts`, a window keydown listener; ignore when typing): Space = generate (E5,
   switches to the Generate tab if needed), ← / → = previous / next proposal, L = lock the selected spot, H = like it,
   C = copy it, Delete = remove it, 1–9 and 0 = select spot 1–10.

**Tests:** `colorStudioStore.test.ts` (setHexes keeps locked spots; add stops at 10; remove keeps one; move; dirty);
`composite.test.ts` (order of do/undo); `overlayGate.test.ts`. e2e comes in E7 once there are ways in.

### E3 · The Wheel tab `[ ]`
**Files:** new `src/features/colorStudio/WheelTab.tsx`, `src/features/palettes/ColorWheel.tsx` (reuse), `colorWheelMath.ts`.

**Do**
- Left: the existing HSV `ColorWheel` (300 px) with one marker per spot (the **base** marker larger, 26 px with a 3 px white
  ring; others 18 px), thin lines from the centre to each marker, and a Brightness slider under it. The base is the selected
  spot (spot 1 when none is selected).
- Middle: the 9 harmony rules as a vertical list (mockup). Choosing a rule (other than Custom) immediately sets every
  **unlocked** spot from `harmony(baseHsv, rule, spots.length)`, keeping the base where it is.
- Dragging the base marker re-runs the rule live (local state while dragging, store update on release). In **Custom**,
  every marker moves on its own and edits its own spot.
- Right: the selected spot: a 248 × 96 colour block, **HEX** (one field), **RGB** (three numeric fields) and **HSB** (three:
  degrees and percents). Typing a valid value updates the spot on Enter or blur; an invalid one gets a red outline and is
  ignored. Use `normalizeHex` from `lib/palette.ts`.
**Tests:** a pure helper `applyRule(spots, baseIndex, rule)` (in the store file) unit-tested: locked spots untouched, base
unchanged.

### E4 · The From an image tab `[ ]`
**Files:** new `src/features/colorStudio/ImageTab.tsx`, new `src/features/colorStudio/imagePixels.ts` (+ test),
`src-tauri/src/media.rs`, `lib.rs`, `build.rs`, `capabilities/default.json`, `src/platform/types.ts` + both platforms.

**Do**
1. Sources (left column, mockup): **Open an image…** (Tauri: `dialogs.openFiles` with an images filter, then a new Rust
   command `media_read_image(path)`: only jpg/jpeg/png/webp/gif/avif/bmp, at most 64 MB, raw bytes via
   `tauri::ipc::Response`; browser: a hidden `<input type="file" accept="image/*">`); **Paste**
   (`platform.clipboard.readImage()`); **From my library** (a small picker listing the current space's pictures as
   `t128` tiles); and **drag and drop** of an image file onto the tab. In `fromPhoto` mode the photo is already loaded.
2. `imagePixels.ts`: `loadPixels(blob: Blob, maxSide = 512): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; bitmap: ImageBitmap }>`
   (`createImageBitmap`, draw into an `OffscreenCanvas` scaled so the long side ≤ 512, `getImageData`). Library items are
   read with `fetch(thumbUrl(platform, item, 512))` → `blob()` (fetching avoids canvas tainting on `media://`).
3. On load: `moodPick(pixels, w, h, mood, unlockedCount)` fills the **unlocked** spots and returns each colour's pixel; in
   `fromPhoto` mode use `locateColors(pixels, w, h, photoPaletteHexes)` instead so the droppers start on the colours the
   app already sampled. Mood list (Colorful, Bright, Muted, Deep, Dark) re-runs `moodPick`.
4. The image is drawn fitted in the middle (radius 12). Each unlocked spot has a numbered **dropper** (30 px circle, 3 px
   white ring, filled with its colour). Dragging a dropper samples the pixel under it live (from the ≤ 512 px pixels) and
   updates its spot; while dragging, a **loupe** (104 px circle) above the dropper shows the surrounding pixels enlarged
   (draw 9 × 9 source pixels with `imageSmoothingEnabled = false`) with the centre pixel outlined.
5. The checkbox **Also add this image to my library** (off by default). Only when ticked and the image didn't come from the
   library, saving also imports it (`importFiles` with a `File` made from the blob) next to the palette. Otherwise the
   image is never stored (D6 discussion: "sometimes I just want its colours").
**Tests:** `imagePixels.test.ts` for the pure scale maths (`fitWithin(w, h, 512)`); the Rust command's extension check
(unit test on a pure `is_allowed_image(path)` helper).

### E5 · The Generate tab `[ ]`
**Files:** new `src/features/colorStudio/GenerateTab.tsx`, `colorStudioStore.ts`.

**Do**
- A segmented control **Goes with my colors** (`'harmonious'`) | **Surprise me** (`'random'`).
- **Space** (or the button "New colors") calls `generatePalette(spots, seededRng(Date.now() >>> 0), mode)`, applies the
  result to the unlocked spots, and pushes it onto `history` (dropping any "forward" entries; at most 50).
- ← / → (and the two arrow buttons with "Proposal x of n") move through `history` and apply that proposal's colours to
  the unlocked spots (locked spots stay as they are now).
- The middle shows the key hints (Space, ←/→, L, H) and the last 6 proposals as mini rows (44 × 28 chips); the current one
  is highlighted with "Now"; clicking a row goes to it.
**Tests:** store tests: generate keeps locked spots; history caps at 50; going back then generating drops the forward entries.

### E6 · The Contrast tab and the colour-blind preview `[ ]`
**Files:** new `src/features/colorStudio/ContrastTab.tsx`.

**Do**
- Two pickers, **Text** and **Background**, each a row of the palette's spots as 26 px dots (default: the darkest and the
  lightest spot); a swap button between them.
- A preview card (440 px, radius 16) in the background colour: "Aa" 54 px bold, "A sample heading" 22 px bold, one line of
  15 px body text, all in the text colour.
- On the right: the ratio ("3.52 : 1", 40 px bold, rounded **down**), then four rows with a Passes/Fails pill:
  AA normal (4.5), AA large (3), AAA normal (7), AAA large (4.5).
- **Find a text color that passes AA** (or AAA when AA already passes): `nearestPassing(text, bg, target)`; show the
  suggestion (swatch, hex, its ratio, "same hue, darker/lighter") and **Use this** (puts it into the text spot, unless
  locked: then the button reads "Unlock it first", disabled). When `null`: `en.colorStudio.noPassing`.
- Below: **How the palette looks to people who see color differently**: five rows (Typical vision, Red-blind
  (protanopia), Green-blind (deuteranopia), Blue-blind (tritanopia), No color (achromatopsia)) with the whole palette passed
  through `simulateCvd`. Under a row, a small ⚠ "hard to tell apart" appears between two adjacent simulated colours whose
  OKLab distance is under 0.04 (`differenceEuclidean('oklab')` from culori).
**Tests:** a pure `hardToTellApart(hexes, threshold)` helper (in `colorStudio.ts` or next to the tab) with two near-identical
greys → flagged.

### E7 · Ways in, and retiring the old editor `[ ]`
**Files:** `src/features/import/AddMenu.tsx`, `src/canvas/useFocusViewBinding.ts` (double-click), `src/canvas/contextMenuItems.ts`
(+ test), `src/canvas/ContextMenu.tsx`, `src/features/details/DetailsPanel.tsx`, `src/features/palettes/PaletteEditor.tsx`,
`src/app/Shell.tsx`, `en.ts`, new e2e `tests/e2e/patch2-color-studio.spec.ts`, `tests/e2e/patch1-palette.spec.ts`.

**Do**
1. **+ Add → Palette…** (replaces "Swatch"): opens the studio, source `new`, five spots from
   `harmony(random base, 'analogous', 5)`, tab Generate.
2. **Double-click a palette or swatch** on the map: opens the studio, source `edit`, its colours, tab Wheel.
3. **Right-click a photo → Make a palette** (replaces "Extract palette"): source `fromPhoto`, the photo's sampled palette
   (`item.palette` hexes), tab From an image.
4. **Details of a photo**: under Colors, a **Make a palette** button (same as 3).
5. **Details of a palette/swatch**: `PaletteEditor` becomes a compact view: the name, the colour cells (click copies),
   **Open in Color studio** (primary), Copy all. Delete the wheel, sliders, hex field and pick-from-photo code from it
   (the studio has them). Keep the Combine / Copy all context-menu entries.
6. Remove `createExtractPaletteCommand` if nothing else uses it (and its strings).

**Tests:** `contextMenuItems.test.ts` (Make a palette for photos; no Extract palette). e2e `patch2-color-studio.spec.ts`:
- + → Palette… → the studio opens; press Space → the unlocked spots change and "Proposal 2 of 2" shows; lock spot 1 (L),
  press Space → spot 1's hex is unchanged; heart spot 2 (H) → Liked shows 1; Save → a palette card appears and Undo removes it;
- reopen the studio → Liked still shows the colour (kept); reload the page (wait 2.5 s first) → still there;
- Contrast tab with black and white spots → "21 : 1" and four Passes;
- double-click the new palette → the studio opens in edit mode with its colours.
Update `patch1-palette.spec.ts` to the new entry points (it used the Details editor).

**Phase E Owner checks (plain language)**
- + → Palette…: the Color studio opens. Press Space for new colours, lock the ones you like (L or the lock), heart the
  maybes, compare them on the right and Choose. Save: the palette lands on the map.
- From an image: open or paste any picture (it isn't added to your library unless you tick the box); drag the numbered
  droppers, try the moods.
- Wheel: pick a harmony and drag the big ring. Contrast: check text on background, try "Find a text color that passes",
  and look at the colour-blind rows.
- Right-click a photo → Make a palette: the droppers start on the colours the app sampled.
- Your liked colours are still there next time.

---

## 8. Phase F: font families and type collections

**Goal:** one card per font family; the owner chooses the style, weight, text size and text on the card; type
collections group families like a palette groups colours, and each family in it can still be connected.
Size: L. Version at the end: **0.14.0**. Mockup: `docs/patch-2/fonts.png`.

**Model (read before starting).** A family stays an ordinary `kind = 'font'` item. Its files move to a new
`font_files` table (one row per file: style name, weight, italic, axes). `items.file_path`/`file_hash` keep pointing
at the family's **main file**, so "Show in Explorer", Details → Location and the media check keep working. A type
collection is also a `kind = 'font'` item, with `file_path = NULL` and `font_collection = {"ids":[…]}` (no new kind:
the `kind` CHECK can't change without a table rebuild, see §2.1). Its families keep their own placements; on a space
where they belong to a collection, their placement has `parent_id = <collection id>` and their rect is computed from the
collection's. `placements.frame_id` can't be reused (it references `frames`).

### F1 · Richer font metadata and the `font_files` table `[ ]`
**Files:** `src/lib/fontRender.ts` (+ tests), new `src/db/migrations/005_fonts.sql`, `src/db/migrator.ts`,
`src/state/types.ts`, `src/db/rowMapping.ts` (+ test), new `src/state/fontFilesStore.ts`, the library loader
(`src/state/loadLibrary.ts`), new `src/lib/fontFamily.ts` (+ test).

**Do**
1. `fontRender.ts` → `readMeta` / `FontMeta` gain: `family` = `font.getName('preferredFamily', 'en') || font.familyName`;
   `styleName` = `getName('preferredSubfamily', 'en') || font.subfamilyName`; `weight` = `font['OS/2']?.usWeightClass ?? 400`
   (guard a missing OS/2 table); `italic` = `fsSelection.italic || italicAngle !== 0 || /italic|oblique/i.test(styleName)`
   (Urbanist Italic has `italicAngle` 0, so the name test matters); `instances` = `namedVariations` (missing from
   `@types/fontkit`: read it as `unknown` and narrow to `Record<string, Record<string, number>>`); `vendorId` =
   `OS/2.achVendID` with `\0` and spaces stripped (`null` when empty). Keep `subfamily` for compatibility.
2. `005_fonts.sql`: Appendix C.3 (the `font_files` table, `items.font_family_key`, `items.font_card`,
   `items.font_collection`, `placements.parent_id`, indexes, and an `INSERT … SELECT` that gives every existing font item
   one `font_files` row). Register `{ version: 5, name: 'fonts', sql: migration005 }`.
3. Types: `FontFile { id; itemId; filePath; fileName; fileHash; fileSize; mime; styleName; weight; italic: boolean;
   axes: FontVariationAxis[] | null; instances: Record<string, Record<string, number>> | null; sort; status; createdAt; deletedAt }`;
   `FontCardOptions { fileId: string | null; wght: number | null; size: 's' | 'm' | 'l'; text: string | null }`;
   `Item` gains `fontFamilyKey: string | null`, `fontCard: FontCardOptions | null`, `fontCollection: { ids: string[] } | null`;
   `Placement` gains `parentId: string | null`. Map them in `rowMapping.ts` (JSON columns with the existing `asJson`).
4. `fontFilesStore.ts` (zustand): `files: Map<string /*itemId*/, FontFile[]>` sorted by `sort`, with `loadAll`, `upsert`,
   `remove`. Load `SELECT * FROM font_files WHERE deleted_at IS NULL` wherever the library loads its items.
5. `fontFamily.ts` (pure): `familyKey(meta): string` = `normalize(meta.family)`; `isFontCollection(item)` =
   `item.kind === 'font' && item.fontCollection !== null`; `pickDefaultStyle(files): { fileId; wght: number | null }`
   = non-italic first, then the weight closest to 400 (ties → lower); for a variable file whose wght axis spans 400, `wght = 400`,
   else the axis value closest to 400. `fontCardOf(item, files)` returns the stored options or the defaults
   (`size: 'm'`, `text: null`).
6. `lib/itemKinds.ts` and `contextMenuItems.ts` treat a collection as **not** media (it has no file).

**Tests:** `fontRender` meta tests with `src/design/fonts/urbanist/*.ttf` (regular: weight 100–900 variable, not italic;
italic file: italic by name); `fontFamily.test.ts` (`pickDefaultStyle` cases: Thin+Regular+Bold → Regular; only Italics →
the one closest to 400; variable 100–900 → 400; variable 500–900 → 500); `migrator` and `rowMapping` tests; a
`migratedDb(5)` test (helper from D3) that an existing font item gets one `font_files` row.

### F2 · Existing libraries: merge files of the same family `[ ]`
**Why:** the owner's library already has one item per file. This one-off repair turns them into family items. It is
derived (like a re-render), not a Command; the pre-migration backup from `ensureLibraryReady` is the safety net.

**Files:** new `src/db/repairs/mergeFontFamilies.ts` (+ pure `planFontMerge` and tests), `src/app/App.tsx`.

**Do**
1. `mergeFontFamilies(platform)`: runs once, guarded by `meta` key `font_families_v = '1'` (write it at the end). Called in
   `App.tsx` right after `ensureLibraryReady` and before the library items load, in both the Tauri and the browser branch.
2. For every `font_files` row whose item isn't trashed and isn't `unsupported`: fetch `platform.media.originalUrl(filePath)`,
   parse with fontkit (`readMeta` from F1), update the row's `style_name`, `weight`, `italic`, `axes`, `instances`, `meta`,
   and the item's `font_family_key`. A file that fails to parse keeps its own item (log it).
3. Pure `planFontMerge(rows)` groups items by `font_family_key` (don't merge two items whose `vendorId`s are both set and
   differ) and picks the **kept** item: the oldest `created_at`. Returns `{ keptId, mergedIds }[]` for groups of 2+.
4. Per group, one `db.batch` (a crash halfway leaves whole groups done):
   - `UPDATE font_files SET item_id = kept WHERE item_id IN (merged)`;
   - terms: `INSERT OR IGNORE INTO item_terms (item_id, term_id, via, added_at) SELECT ?, term_id, via, added_at FROM item_terms WHERE item_id = ?` per merged item; same for `ai_dismissed`;
   - My connections: re-point `from_id`/`to_id` of merged items to the kept item; delete a connection that would join the
     family to itself; delete one that would duplicate an existing pair **in either direction**;
   - placements per space: if the kept item has no placement on that space, move the merged item's
     (`UPDATE placements SET item_id = kept WHERE item_id = merged AND board_id = ?`), else delete it;
   - fields on the kept item: `favorite` = any; `why`, `description`, `description_text`, `artist` = the kept item's, else the
     first non-empty; `sorted_at` = earliest non-null; `viewed_at` = latest; `title` = the family name **only if** the title
     still equals the kept file's name without extension;
   - delete the merged items' `embeddings`, then **delete the merged items' rows** (not trash: a trashed row would later
     send the family's file to the Recycle Bin). No file on disk is touched.
5. After all groups: delete the merged items' cache keys (`t128/`, `t512/`) and set `derived_v = 0` on kept items so their
   specimen is re-made with the new card (F4 makes the specimen family-aware; until F4 lands, the old renderer is fine).

**Tests:** `planFontMerge` (pure): two "Urbanist" + one "Inter" → one group; different real vendor ids → no merge; oldest
kept. A `migratedDb(5)` integration test of the batch statements: terms unioned, connection re-pointed without a duplicate
(either direction), placement moved or dropped per space, merged rows gone, `font_files` all on the kept item.

### F3 · Importing fonts groups them into families `[ ]`
**Files:** `src/features/import/importItems.ts`, new `src/features/import/groupFontImports.ts` (+ test),
new `src/commands/fontCommands.ts` (+ test), `src-tauri/src/media.rs` (`find_duplicate` + its test fixture),
`src/features/trash/trashActions.ts` (+ test), `src/workers/fontIngestQueue.ts`.

**Do**
1. Pure `groupFontImports(entries: { index: number; key: string; vendorId: string | null }[], existing: Map<string /*key*/, string /*itemId*/>)`
   returns, per entry, `{ kind: 'existing', itemId } | { kind: 'new', groupIndex }`. Entries with the same key in one
   batch share a group; the first entry of a group is its main file.
2. `importFiles` (browser, bytes already in memory): before planning placements, parse every font file with
   `readMeta`; group; only **new families** (and non-font files) get a placement rect. A new family item gets
   `title` = family name, `font_family_key`, and one `font_files` row per file. Fonts added to an **existing** family go
   through a new command `createAddFontFilesCommand(platform, itemId, files)` (inserts `font_files` rows; undo sets their
   `deleted_at`, so the copied files are cleaned up by the Trash purge) and re-queue that family's specimen.
3. `importPaths` (Tauri): Rust copies the files first (`media.importPaths`), then fetch each copied font through
   `media.originalUrl`, parse, group, and create rows as above. Plan placements after grouping.
4. Duplicates: Rust `find_duplicate` also looks in `font_files`
   (`… UNION SELECT item_id, file_path FROM font_files WHERE file_hash = ?1 AND deleted_at IS NULL`); add `font_files` to
   the test fixture schema. TS `findByHash` does the same.
5. `trashActions.ts` `deleteForever`: purge every `font_files.file_path` of the items too (and their `trow/` cache key,
   used from F5). `fontIngestQueue.ts`: `FontQueueItem` becomes `{ itemId }`; the worker reads the family's files from the
   database; `resumePendingFontIngest` and `rerenderFontSpecimens` skip collections (`file_path IS NOT NULL` already does).
6. Add a font-only `FONT_DERIVED_V = 1` next to `CURRENT_DERIVED_V` (don't bump the shared one: it would re-make every
   picture).

**Tests:** `groupFontImports` (same family in one batch; a family that already exists; two families); the command's do/undo;
Rust `find_duplicate` finds a hash stored only in `font_files`; `trashActions.test.ts` purges every file of a family.
e2e: copy `src/design/fonts/urbanist/Urbanist-VariableFont_wght.ttf` and `Urbanist-Italic-VariableFont_wght.ttf` into
`tests/e2e/fixtures/`; importing both creates **one** card titled "Urbanist". `smoke-m5-font` (expects "Unbounded") still passes.

### F4 · Choose what the card shows `[ ]`
**Files:** `src/lib/fontRender.ts` (`drawSpecimen`, `extractFontDerivatives`, `registerFontFace`), `src/workers/fontIngestQueue.ts`,
`src/commands/fontCommands.ts`, `src/features/details/DetailsPanel.tsx` (new `FontCardSection.tsx`, `FontStylesSection.tsx`),
`src/features/focus/FontFocusViewer.tsx`, `src/design/tokens.ts`, `en.ts`.

**Do**
1. `registerFontFace(bytes, family, descriptors?: FontFaceDescriptors)`. For a variable file pass `{ weight: '<min> <max>' }`
   from its wght axis, so `ctx.font = '650 …'` picks the real instance (Canvas 2D can't set axes, §2.4). Static files:
   no descriptors, draw with `normal normal`.
2. New specimen layout (tokens `fontSpecimen` in `tokens.ts`; world units on a 320 × 200 card, the 512 × 320 canvas is
   × 1.6): padding 20; "Aa" 56 in the chosen style; family name 20 in the chosen style; the text in the chosen style at
   **S 14 / M 19 / L 26**, at most two lines then "…" (`wrapLines`), in the **main** text colour (not the dim one); top-right
   in the UI font 11, `--text-3`: "<Style name> · <n> styles" (`en.font.cardStyleLine`). Text = `fontCard.text` or the
   library's preview text.
3. The queue renders with `fontCardOf(item, files)`: loads the chosen file's bytes, registers it with descriptors, draws,
   bumps `thumb_v` (existing behaviour).
4. `createSetFontCardCommand(platform, itemId, next: FontCardOptions)`: writes `items.font_card`; after `do` and `undo`,
   re-queue the specimen (derived).
5. Details for a font family (not a collection): an **On the card** section (mockup): Style (a select of the family's
   files, named by `styleName`), Weight slider (only when the chosen file is variable; range from its axis; commits on
   release), Text size (segmented Small / Medium / Large), Text (input; empty = "Your preview text"). Each change runs the
   command. Below it, a **Styles (n)** list: each file's style name written in that style (register a FontFace per file,
   family `${itemId}-${sort}`), its weight on the right, "on the card" on the chosen one.
6. Type tester: a style select at the top (same files); switching loads that file; the wght slider shows for variable
   files; a button **Show on the card** sets `fileId`/`wght` through the command. Register one face per file as above (never
   several files under one family name).

**Tests:** `fontCommands.test.ts` (set card, undo); `wrapLines` still passes; a unit test that the specimen layout function
(make the layout maths a pure `specimenLayout(size)` returning the font sizes and y positions) gives the numbers above.
**Owner checks:** pick Semibold and Large on a family: the card redraws with big, readable text.

### F5 · Type collections `[ ]`
**Files:** new `src/lib/fontCollection.ts` (+ test), `src/design/tokens.ts`, new `src/canvas/decor/fontCollectionDecor.ts`,
`src/canvas/Engine.ts`, `src/canvas/itemCards.ts`, new `src/commands/fontCollectionCommands.ts` (+ test),
`src/commands/itemCommands.ts`, `src/commands/boardCommands.ts`, `src/canvas/contextMenuItems.ts` (+ test),
`src/canvas/ContextMenu.tsx`, new `src/features/details/FontCollectionDetails.tsx`, `src/app/Shell.tsx`,
`src/workers/fontIngestQueue.ts`, `src/features/list/ListPanel.tsx`, `src/features/overview/useOverviewData.ts`, `en.ts`.

**Behaviour**
- Select two or more font families → right-click → **Make a type collection**. A collection card appears where the first
  selected family was, titled "Type collection" (rename in Details), with one row per family in selection order. The
  families leave their own spots and become rows.
- Select a collection and one or more families → right-click → **Add to "<name>"**. Right-click a row → **Remove from
  collection** (the family gets its own 320 × 200 card just below the collection).
- Dragging the header **or any row** moves the whole collection. Reorder and rename in Details (list with drag handles, like
  the palette editor). Double-click a row opens that family's type tester; double-click the header opens Details.
- Each row is the family's own card: it can be selected (Details shows the family), classified, hovered (its connection
  lines start at the row's edge), searched (non-matching rows dim).
- A collection is not in the Inbox and can't be classified (P4). Trashing a collection frees its families (laid out in a
  column under it) in the same undo step; its families are never trashed with it.
- The mockup's "drag a row to reorder / out" is **replaced** by the above (simpler and safer).

**Do**
1. `fontCollection.ts` (pure) with tokens `fontCollectionGeometry = { width: 360, header: 48, row: 56, padBottom: 8 }`:
   `fontCollectionSize(n)` → `{ w: 360, h: 48 + 56 n + 8 }`; `fontCollectionRows(n, cardRect)` → the member rects
   `{ x: card.x, y: card.y + 48 + i·56, w: 360, h: 56 }`.
2. Row strip: the font queue also renders `trow/<id>` for every family (720 × 112, transparent: the family name in its card
   style at 52 px from x = 32, vertically centred; "<n> styles" right-aligned in the UI font 24 px `--text-3`).
3. `itemCards.ts`: when `placement.parentId` is set, the card uses the `trow` URL for both texture sizes and gets
   `parentId`. `ItemCard` gains `parentId: string | null` and `collectionName: string | null`.
4. Engine:
   - the collection card is self-drawn (`isSelfDrawn` / `syncDecor` like palettes) via `fontCollectionDecor.ts`: card
     background (`surface-1`, radius `--card-radius-world`), header with a type icon, the name (UI 16 bold) and
     "<n> families" (UI 12, `--text-3`), hairline separators between rows;
   - member z = parent z + 0.5, so hit-testing picks the row; members never lift on hover; collections and members have
     no resize handles;
   - pressing a member or the collection starts a move of the collection **plus all its members**; pointer-up emits the
     moved ids for all of them; bring forward / send backward move members with their parent.
5. Commands (`fontCollectionCommands.ts`): `createMakeFontCollectionCommand(platform, spaceId, familyIds, at)`,
   `createAddToFontCollectionCommand`, `createRemoveFromFontCollectionCommand`, `createReorderFontCollectionCommand`,
   `createRenameFontCollectionCommand`. Each writes `items.font_collection.ids` and the member placements (`parent_id` and
   rects from `fontCollectionRows`) in one batch, and resizes the collection (`fontCollectionSize`).
   `createMoveItemsCommand` expands a collection to its members; `createTidyUpCommand` skips members; `createTrashCommand`
   frees members of a trashed collection (and undo re-attaches them). Board commands that add, copy or remove placements
   (`boardCommands.ts`: add to board, duplicate board, remove from board) carry members along and copy `parent_id`.
6. Context menu ids: `make-type-collection` (2+ families, no collection), `add-to-type-collection` (one collection + 1+
   families not in it), `remove-from-type-collection` (one member).
7. Details: a collection shows `FontCollectionDetails` (name field, reorderable family list with remove buttons). Shell
   routes it like palettes. The double-click binding opens Details for a collection.
8. List tile: a collection shows "<n> families" and its first three family names (UI font, mockup 8). Overview: no thumbnail
   for collections (they have no file). Search: the collection's `title` is searchable; members are searched as families.

**Tests:** `fontCollection.test.ts` (sizes, rows); `fontCollectionCommands.test.ts` (make → members have `parent_id` and row
rects, undo restores their old rects; add; remove; reorder; trash a collection frees members, undo re-attaches);
`contextMenuItems.test.ts` (the three new ids appear only when they should). e2e `patch2-type-collection.spec.ts`: import
the two Urbanist files and `sample.woff2`, select both family cards, right-click → Make a type collection; the List shows a
collection tile with "2 families"; hovering a row (after giving it a Vibe shared with a photo) draws a line.

**Phase F Owner checks (plain language)**
- Your fonts: files of the same family became one card (a backup was made first). Double-click it: the type tester lists
  every style.
- In Details → On the card, choose a style, a weight and Large: the card redraws, readable.
- Select a few families → right-click → Make a type collection. Move it, rename it, reorder it in Details. Give one family
  a Vibe shared with a photo and hover its row: the line starts at that row.

---

## 9. Phase G: choosing PDF pages

**Goal:** when adding a PDF with several pages, choose which pages to add, as one PDF or as separate pages that keep
their own proportions; the PDF viewer's "Split into pages…" uses the same window. Size: M. Version at the end:
**0.15.0**. Mockup: `docs/patch-2/pdf-picker.png`.

### G1 · Page ranges, single-page files and layout by proportions (pure parts) `[ ]`
**Files:** new `src/lib/pageRange.ts` (+ test), `src/features/focus/splitPdfIntoPages.ts` (+ test),
`src/features/import/importItems.ts` (+ test).

**Do**
1. `parsePageRange(text: string, pageCount: number): number[] | null`: 0-based, sorted, de-duplicated indices.
   `"1-3, 7"` → `[0,1,2,6]`; `"5-3"` → `[2,3,4]`; spaces allowed; empty text → `[]`; anything out of range or not a
   number/range → `null`. `formatPageRange(indices)` does the reverse (`[0,1,2,6]` → `"1-3, 7"`), used to keep the field
   in sync with clicks.
2. `splitPdfIntoPages.ts` → `buildSinglePagePdfs(bytes: ArrayBuffer, baseName: string, pageIndices: number[]): Promise<File[]>`
   (keeps today's `"<name> p<n>.pdf"` naming, n 1-based). Create each with `PDFDocument.create({ updateMetadata: false })`
   so splitting the same page twice gives identical bytes (duplicate detection then works).
3. `importItems.ts`: `planBatchPlacements(platform, dropPoint, count, opts?: { aspects?: number[]; rowHeight?: number; anchor?: 'centre' | 'topLeft' })`
   and `placeBatch` use `justifiedRows(ids.map((id, i) => ({ id, aspect: opts?.aspects?.[i] ?? 1 })), …, { rowHeight: opts?.rowHeight ?? 320 })`
   so pages land in reading order at their real proportions. For `topLeft`, aim `findFreeSpot` at `dropPoint + bounds / 2`
   (it treats its target as a centre). `importFiles(…, opts?)` passes `opts` through; index `aspects` after filtering to
   supported files. (`fitPlacementsToAspect` only touches 320 × 320 placeholders, so these rects stay.)

**Tests:** `pageRange.test.ts` (the cases above + round trip); `buildSinglePagePdfs` on `tests/e2e/fixtures/sample.pdf`
(3 pages): indices `[0,2]` → two one-page files named `sample p1.pdf`, `sample p3.pdf`; building page 1 twice gives equal
bytes; `planBatchPlacements` with aspects `[0.707, 1.414]` gives rects of those proportions, left to right.

### G2 · The page picker `[ ]`
**Files:** `src-tauri/src/media.rs`, `lib.rs`, `build.rs`, `capabilities/default.json`, `src/platform/types.ts` + both
platforms, new `src/state/pdfPickerStore.ts` (+ test), new `src/features/pdfPages/PdfPagePicker.tsx`, `src/app/Shell.tsx`, `en.ts`.

**Do**
1. Rust `media_read_pdf(path)` (Appendix A.5): only `.pdf`, at most 512 MB, returns the raw bytes
   (`tauri::ipc::Response`, arrives as `ArrayBuffer`). Register it like other commands. Platform: `media.readPdf(path):
   Promise<ArrayBuffer>` (browser: throws; it never has paths).
2. `pdfPickerStore.ts`: `requestPdfPages({ name, bytes, mode: 'import' | 'split' }): Promise<PdfChoice | null>` with
   `PdfChoice = { kind: 'whole' } | { kind: 'pages'; pageIndices: number[]; aspects: number[] }` and `null` = cancel.
   Requests queue: several PDFs dropped at once are asked one after the other.
3. `PdfPagePicker.tsx`, mounted in `Shell.tsx` next to `<FocusView>`, built on `Dialog` (wide: `className` with
   `width: min(960px, calc(100vw - 48px))`):
   - title `pickTitle(name)` and "<n> pages";
   - toolbar: Select all, None, the range field (`rangePlaceholder`; invalid text gets a red outline and changes nothing),
     and "<k> of <n> selected" on the right;
   - a grid of page tiles (6 columns, each page drawn at its own proportions inside a 130 × 130 box, number underneath);
     click toggles; selected tiles get an accent outline and a check badge; the range field updates (`formatPageRange`);
   - thumbnails: `openPdfDocument(bytes.slice(0))` once, `renderPdfPage(doc, n, 160)` lazily for tiles that scroll into
     view (`IntersectionObserver`); grey until drawn; destroy the document when the picker closes;
   - footer: Cancel; in `import` mode **Add as one PDF** and **Add these <k> pages separately** (disabled at 0); in
     `split` mode only **Add <k> pages**. On confirm, read each chosen page's aspect from
     `(await doc.getPage(n + 1)).getViewport({ scale: 1 })` (width / height; this accounts for rotation).
   - Esc and Cancel resolve `null`.

**Tests:** `pdfPickerStore.test.ts` (two requests are answered in order; cancel resolves null). Component behaviour is
covered by G3's e2e.

### G3 · Wire the picker into adding and splitting `[ ]`
**Files:** `src/features/import/useDropAndPaste.ts`, `src/features/import/AddMenu.tsx` (or wherever Files… lives),
`src/features/import/importItems.ts`, `src/features/focus/PdfFocusViewer.tsx`, `src/features/focus/FocusView.tsx`, `src/app/Shell.tsx`.

**Do**
1. `importFilesWithPdfChoice(platform, files, dropPoint)` (drop, paste, browser Files…): split the files into PDFs and
   the rest; for each PDF, count pages with pdf-lib (`PDFDocument.load(bytes, { updateMetadata: false })` →
   `getPageCount()`); if more than one, ask the picker. `whole` → joins the normal batch; `pages` →
   `buildSinglePagePdfs` → `importFiles(pageFiles, dropPoint, { aspects, anchor: 'centre' })` as its own batch;
   `null` → skip that file. Only the chosen pages are added (the multi-page original is not).
2. `importPathsWithPdfChoice(platform, paths, dropPoint)` (Tauri Files…): same, reading PDFs with `media.readPdf(path)`;
   paths answered `pages` or `null` are removed from the `importPaths` list.
3. Folder… and onboarding keep calling `importPaths`/`importFiles` directly (no picker, P8).
4. PDF viewer: "Split into pages" becomes **Split into pages…**: it opens the picker in `split` mode with the PDF's bytes;
   the original stays; the pages land with `anchor: 'topLeft'` at `{ x: p.x + p.w + 48, y: p.y }` where `p` is the PDF's
   placement on the current space (fallback: `engine.viewportCenter()`). Pass `engine` from `Shell.tsx` into `FocusView`
   and `PdfFocusViewer` for this. This replaces the hard-coded `{ x: 0, y: 0 }`.
5. Each batch is one undo step (existing `finishBatch` / `createAddItemsCommand`).

**Tests:** e2e `patch2-pdf-pages.spec.ts` (browser): drop `sample.pdf` (3 pages) via the hidden file input → the picker
shows 3 tiles; type "1, 3" → "2 of 3 selected"; "Add these 2 pages separately" → two new PDF cards side by side, the
second to the right of the first; Undo removes both. Second test: open a PDF in the viewer → Split into pages… → choose
page 2 → one new card appears to the right of the original, which is still there.

**Phase G Owner checks (plain language)**
- Drag a multi-page PDF onto the map: a window shows its pages. Pick a few (or type "2-4, 7"), "Add these pages
  separately": each page lands as its own card, landscape pages landscape. "Add as one PDF" still adds the whole document.
- Open a PDF, "Split into pages…": the chosen pages appear next to it.

---

## 10. Finishing a phase
- Every task ticked here; `docs/DECISIONS.md` has a "Patch 2 · Phase X" entry: what changed, deviations from this plan, and
  what couldn't be verified without Windows.
- Bump the version in **three** places: `package.json`, `src-tauri/tauri.conf.json`, root `Cargo.toml` (`[workspace.package]`).
- All checks of §2.2 and the full e2e suite green; screenshots compared with `docs/patch-2/`.
- `pnpm format:check` covers Markdown and HTML too: run `pnpm format` before the last commit.
- Push the phase branch and open a PR. CI must be green. The Windows installer is built by `windows-build` on `main` (after
  the owner merges) or by running that workflow manually on the branch (`workflow_dispatch`).
- Send the owner the phase's Owner checks (at the end of each phase section above) in plain language, with where to
  download the installer, and remind them of Settings → About → **Copy a problem report** (from Phase A on).

## 11. Later (not in Patch 2)
"Arrange my map like this" (apply the Overview's clusters to the real map, P7); dragging rows within or out of a type
collection; resizing several items at once; an Artist field with autocomplete; Type as a combobox; saved filters; a custom
title bar; "Always show names"; ticking #actions off; video "Set cover frame"; HEIC/TIFF import.

## 12. Kick-off prompts
Phase A (first conversation):
```text
Continue Designspace with Patch 2, Phase A, from docs/PATCH_2_PLAN.md.
Read CLAUDE.md, then §0–§2 of docs/PATCH_2_PLAN.md and the whole Phase A section, before writing code.
Do the Phase A tasks in order, one commit per task, running the checks in §2.2 after each.
Everything you need (names, files, strings, SQL, reference code in docs/patch-2/reference/) is in the plan:
don't research what it already answers. Log deviations in docs/DECISIONS.md under "Patch 2 · Phase A".
When the phase is done: tick its tasks in the plan, make sure CI is green, push, open a PR, and send me the
Phase A Owner checks in plain language.
```
Later phases (one new conversation each, after the previous phase is merged):
```text
Continue Designspace with Patch 2, Phase <X>, from docs/PATCH_2_PLAN.md.
Read CLAUDE.md, §0–§2 of docs/PATCH_2_PLAN.md, the Phase <X> section, and the latest "Patch 2" entries in
docs/DECISIONS.md first. Same rules as before.
```

---

## Appendix A: reference code

Files in `docs/patch-2/reference/` are **tested** reference implementations (run with Vitest against this repository's
`node_modules` while the plan was written; strict TypeScript, no `any`). They end in `.txt` so the app's lint, typecheck
and format checks ignore them. To use one: copy it to the path named below, drop the `.txt`, and adjust only the imports
the file's own header comment mentions.

| Reference file | Copy to | Task | Tests |
|---|---|---|---|
| `placeMenu.ts.txt` (+ `.test`) | `src/lib/placeMenu.ts` | A11 | 5 |
| `termMatch.ts.txt` (+ `.test`) | `src/lib/termMatch.ts` | D1 | 11 |
| `escapeStack.ts.txt` (+ `.test`) | `src/app/escapeStack.ts` | C1 | 7 |
| `resizeMath.ts.txt` (+ `.test`) | `src/canvas/resizeMath.ts` | C2 | 22 |
| `coverCrop.ts.txt` (+ `.test`) | `src/canvas/coverCrop.ts` | C3 | 16 |
| `colorStudio.ts.txt` (+ `.test`) | `src/lib/colorStudio.ts` | E1 | 24 |

Test files start with `import … from 'vitest'`; `escapeStack.test` needs jsdom (the default environment).

### A.1 Library ID (A2)
`src-tauri/src/library.rs`, replacing `ensure_library_id`:
```rust
/// Reads `meta.library_id`, storing a new one if it's missing. A brand-new database has no `meta`
/// yet (the frontend migrator creates it), so the id is only minted here and `ensureLibraryReady`
/// stores it right after migrating. The cache folder is named after this id.
fn ensure_library_id(conn: &Connection) -> rusqlite::Result<String> {
    let has_meta: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
        [],
        |row| row.get::<_, i64>(0),
    )? > 0;
    if !has_meta {
        return Ok(ulid::Ulid::generate().to_string());
    }
    conn.execute(
        "INSERT OR IGNORE INTO meta (key, value) VALUES ('library_id', ?1)",
        [ulid::Ulid::generate().to_string()],
    )?;
    conn.query_row("SELECT value FROM meta WHERE key = 'library_id'", [], |row| row.get(0))
}
```
The test that replaces `opening_a_library_twice_reuses_the_same_id`:
```rust
#[test]
fn opening_a_migrated_library_twice_reuses_the_same_id() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Library");
    bootstrap_folder(&root).unwrap();
    // What the frontend migrator leaves: `meta` with only schema_version.
    open_connection(&root)
        .unwrap()
        .execute_batch(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO meta (key, value) VALUES ('schema_version', '2');",
        )
        .unwrap();
    let id1 = ensure_library_id(&open_connection(&root).unwrap()).unwrap();
    let id2 = ensure_library_id(&open_connection(&root).unwrap()).unwrap();
    assert_eq!(id1, id2);
}
```
`src/platform/bootstrap.ts`, in `ensureLibraryReady` right after migrating:
```ts
// The cache folder is named after this id (media.rs `cache_dir`). On a brand-new library `meta`
// only exists now, so store the id Rust minted. Never overwrites.
const libraryId = platform.library.current()?.id;
if (libraryId) {
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('library_id', ?) ON CONFLICT(key) DO NOTHING",
    [libraryId],
  );
}
```
`src/workers/missingThumbnails.ts`:
```ts
import type { DbRow, Platform } from '@/platform/types';

/** Items marked ready whose t128 is missing from the cache get derived_v = 0, so the resume
 * functions re-make them (Patch 2 · A2). Derived data: not a Command. */
export async function requeueMissingThumbnails(platform: Platform): Promise<number> {
  const rows = await platform.db.select<DbRow>(
    `SELECT id FROM items WHERE deleted_at IS NULL AND status = 'ok'
       AND (kind IN ('image','video','pdf','font') OR (kind = 'link' AND cover_path IS NOT NULL))`,
  );
  const missing: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map((r) => String(r.id));
    const has = await platform.cache.has(ids.map((id) => `t128/${id}`));
    missing.push(...ids.filter((_, j) => !has[j]));
  }
  if (missing.length > 0) {
    await platform.db.batch(
      missing.map((id) => ({ sql: 'UPDATE items SET derived_v = 0 WHERE id = ?', params: [id] })),
    );
  }
  return missing.length;
}
```
(Check the name of the row type exported by `platform/types.ts`; it is used the same way in `loadSettings.ts`.)
After F1, font collections have no file: add `AND file_path IS NOT NULL` for fonts if the self-check lands after F1 (it
doesn't in this order, but keep it in mind).

`src-tauri/src/media.rs`, next to `cache_dir` and `current_library_id`:
```rust
/// Pure, unit-tested: ULID-named direct children of `root` not in `keep`.
fn orphan_cache_dirs(root: &Path, keep: &HashSet<String>) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else { return vec![] };
    entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)) // no symlinks/junctions
        .filter(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            ulid::Ulid::from_string(&n).is_ok() && !keep.contains(&n)
        })
        .map(|e| e.path())
        .collect()
}

#[tauri::command]
pub fn cache_prune_orphans(app: AppHandle, state: State<'_, AppState>) -> AppResult<u32> {
    let mut keep: HashSet<String> = crate::library::recent_library_ids(&app)?;
    keep.insert(current_library_id(&state)?);
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::new("path_error", e.to_string()))?
        .join("cache");
    Ok(orphan_cache_dirs(&root, &keep)
        .iter()
        .filter(|p| fs::remove_dir_all(p).is_ok())
        .count() as u32)
}
```

### A.2 Reload-proof browser build and texture retry (A3)
`src/platform/browser/idbStore.ts`:
```ts
export async function idbEntries<T>(store: string): Promise<[string, T][]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const keysReq = os.getAllKeys();
    const valuesReq = os.getAll();
    tx.oncomplete = () =>
      resolve(keysReq.result.map((k, i): [string, T] => [String(k), valuesReq.result[i] as T]));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}
```
`BrowserPlatform.ts` (`private hydrated: Promise<void> | null = null;`, and `await this.hydrateObjectUrls()` first in `library.open`):
```ts
private hydrateObjectUrls(): Promise<void> {
  this.hydrated ??= (async () => {
    for (const store of [STORE_MEDIA, STORE_CACHE])
      for (const [key, value] of await idbEntries<unknown>(store))
        if (value instanceof Blob && !this.objectUrls.has(`${store}:${key}`))
          this.cacheObjectUrl(store, key, value);
  })();
  return this.hydrated;
}
```
`Engine.ts`: fields `private texFailures = new Map<string, { attempts: number; at: number }>();` and
`private texRetryTimer: number | null = null;`, constants `TEXTURE_RETRY_MS = 5000`, `MAX_TEXTURE_ATTEMPTS = 2`.
In `requestLod`, right after the "already showing this key" check:
```ts
const failed = this.texFailures.get(want.key);
if (failed && (failed.attempts >= MAX_TEXTURE_ATTEMPTS || performance.now() - failed.at < TEXTURE_RETRY_MS)) return;
```
In its `.then`, before the "superseded" check:
```ts
if (!texture) {
  this.texFailures.set(want.key, { attempts: (failed?.attempts ?? 0) + 1, at: performance.now() });
  if (this.appliedTexKey.get(card.id) === want.key) this.appliedTexKey.delete(card.id);
  this.texRetryTimer ??= window.setTimeout(() => {
    this.texRetryTimer = null;
    this.scheduleFrame();
  }, TEXTURE_RETRY_MS);
  return;
}
```
On success `this.texFailures.delete(want.key)`. (Use the engine's real "request a frame" method name if it isn't
`scheduleFrame`.)

`tests/e2e/patch2-reopen.spec.ts`:
```ts
import { test, type Page } from '@playwright/test';
import { near, waitForPixel } from './helpers/pixels';

// Patch 2: pictures still show after reopening. In the browser build a reload is the reopen.
// wide-circle.png is 800×400 with a (240,180,60) circle in the middle.
const CIRCLE: [number, number, number] = [240, 180, 60];

async function canvasCentre(page: Page): Promise<[number, number]> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return [box.x + box.width / 2, box.y + box.height / 2];
}

test('an imported picture still shows after reopening the app', async ({ page }) => {
  await page.goto('/');
  const [cx, cy] = await canvasCentre(page);
  await page.locator('input[type=file]').first().setInputFiles('tests/e2e/fixtures/wide-circle.png');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);
  await waitForPixel(page, cx, cy, (c) => near(c, CIRCLE, 40), 30_000);

  // The browser database is saved to IndexedDB, debounced, once writes pause.
  await page.waitForTimeout(2500);

  await page.reload();
  await page.locator('canvas').first().waitFor();
  const [cx2, cy2] = await canvasCentre(page);
  await page.mouse.move(5, 5);
  await waitForPixel(page, cx2, cy2, (c) => near(c, CIRCLE, 40), 30_000);
});
```

### A.3 AI model files (A5)
`src/lib/ai/env.ts`, replacing `env.localModelPath = config.localModelPath ?? ''` (and add
`fetch: (input: string | URL, init?: RequestInit) => Promise<Response>` to `TransformersEnvLike`):
```ts
export const BUNDLED_MODELS_PREFIX = '/bundled-models';

if (config.localModelPath) {
  // transformers.js skips its local-file lookups when localModelPath is an http:// URL (the
  // tokenizer then finds no files). Give it a plain path and translate it here.
  const base = config.localModelPath.replace(/\/$/, '');
  const realFetch = globalThis.fetch.bind(globalThis);
  env.localModelPath = BUNDLED_MODELS_PREFIX;
  env.fetch = (input, init) =>
    realFetch(String(input).replace(/^\/bundled-models(?=\/)/, base), init);
} else {
  env.localModelPath = '';
}
```
`.github/workflows/windows-build.yml`, between "Fetch the bundled AI model" and "Build the installer":
```yaml
      - name: Check the bundled AI model files
        shell: pwsh
        run: |
          $dir = 'src-tauri/resources/models/Xenova/clip-vit-base-patch32'
          $required = 'config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json',
                      'onnx/vision_model_quantized.onnx','onnx/text_model_quantized.onnx'
          $missing = $required | Where-Object { -not (Test-Path (Join-Path $dir $_)) }
          if ($missing) { Write-Error "Missing model files: $($missing -join ', ')"; exit 1 }
          $extra = Get-ChildItem "$dir/onnx" -Filter *.onnx | Where-Object { $_.Name -notlike '*_quantized.onnx' }
          if ($extra) { Write-Error "Unexpected full-size model files: $($extra.Name -join ', ')"; exit 1 }
          Get-ChildItem -Recurse $dir | Select-Object FullName, Length | Format-Table -AutoSize
```
(Check that `$dir` matches `MODELS_DIR` in `scripts/fetch-models.mjs`; adjust the path if it differs.)

### A.4 PDF first render (A7)
```ts
useEffect(() => {
  let cancelled = false;
  let handle: OpenPdfHandle | null = null;
  void (async () => {
    try {
      if (!item.filePath) return;
      const res = await fetch(platform.media.originalUrl(item.filePath));
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
      const opened = await openPdfDocument(await res.arrayBuffer());
      if (cancelled) {
        void opened.destroy();
        return;
      }
      handle = opened;
      setPageCount(opened.doc.numPages);
      setDoc(opened.doc); // a state change, so the render effect runs
    } catch (err) {
      if (!cancelled) logger.warn('Opening a PDF failed', err);
    }
  })();
  return () => {
    cancelled = true;
    void handle?.destroy();
  };
}, []);
```
e2e, after the "Page 1 of 3" assertion in `smoke-m5-pdf.spec.ts`:
```ts
const pdfCanvas = page.getByTestId('pdf-page-canvas');
await expect
  .poll(() => pdfCanvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 5000 })
  .not.toBe(300);
```

### A.5 Reading a PDF chosen by path (G2)
```rust
#[tauri::command]
pub fn media_read_pdf(path: String) -> AppResult<tauri::ipc::Response> {
    let p = Path::new(&path);
    if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return Err(AppError::new("not_pdf", "Only PDF files can be read this way."));
    }
    if fs::metadata(p)?.len() > 512 * 1024 * 1024 {
        return Err(AppError::new("too_large", "This PDF is larger than 512 MB."));
    }
    Ok(tauri::ipc::Response::new(fs::read(p)?)) // raw binary IPC: arrives as an ArrayBuffer
}
```
E4's `media_read_image` is the same with the image extensions (jpg, jpeg, png, webp, gif, avif, bmp) and 64 MB; put the
extension check in a pure `is_allowed_image(path)` and unit-test it.

---

## Appendix B: new strings

Add to `src/i18n/en.ts` in the named groups (create a group if it doesn't exist). Function strings take the values shown.

| Key | Text |
|---|---|
| `connections.summary(items, groups)` | `${items} items share something (${groups} groups)` |
| `connections.empty` | `Nothing shares a Vibe or Tag yet.` (build it from the active criteria names: `Nothing shares a ${names} yet.`) |
| `connections.turnOn(name, count)` | `Turn on ${name} (${count} items)` |
| `connections.emptyHint` | `Give a few items the same Vibe or Tag to see them connect.` |
| `connections.noneForItem(names)` | `No shared ${names}` |
| `settings.library.backupsSummary(date, count)` | `Last backup ${date} · ${count} kept` |
| `settings.library.showAllBackups(n)` / `showFewerBackups` | `Show all (${n})` / `Show fewer` |
| `settings.ai.statusLoading` | `Loading the local model…` |
| `settings.ai.statusReady` | `Ready` |
| `settings.ai.statusAnalyzing(done, total)` | `Analyzing ${done} of ${total}` |
| `settings.ai.statusError(reason)` | `Not working: ${reason}` |
| `settings.ai.retry` | `Try again` |
| `settings.ai.workerStopped` | `The AI helper stopped unexpectedly.` |
| `settings.ai.modelMissing` | `The AI model files are missing from this installation.` |
| `settings.about.problemReport` | `Copy a problem report` |
| `settings.about.problemReportHelp` | `Copies details about the app and your PC (no pictures or names) to paste into a conversation. The recent log lines it includes may contain file paths.` |
| `settings.about.problemReportCopied` | `Problem report copied` |
| `fullscreen.hint` | `Full screen · press Esc or F11 to leave` |
| `shortcuts.escapeLadder` | `Close, deselect, then leave full screen` |
| `overview.spacing` | `Spacing` |
| `overview.layoutClusters` / `layoutMine` | `Clusters` / `My layout` |
| `export.areaAll` / `export.areaSelection(n)` | `Whole board` / `Selection (${n})` |
| `crop.adjust` / `crop.reset` | `Adjust crop` / `Reset crop` |
| `crop.hint` | `Drag to move the picture · Enter or click outside to finish` |
| `spaceSwitcher.boards` | `Boards` |
| `spaceSwitcher.itemsEdited(n, when)` | `${n} items · edited ${when}` |
| `spaceSwitcher.newBoard` / `newBoardPlaceholder` | `New board` / `Name your board` |
| `spaceSwitcher.newBoardHint` | `Enter creates it · Esc cancels` |
| `spaceSwitcher.allBoards` / `trash` | `All boards…` / `Trash` |
| `trash.title` / `trash.counts(items, boards)` | `Trash` / `${items} items · ${boards} boards` |
| `trash.help` | `Things stay here for 30 days, then they're deleted. "Delete forever" moves the original files to the Windows Recycle Bin.` |
| `trash.selected(n)` / `restore` / `deleteForever` / `emptyTrash` | `${n} selected` / `Restore` / `Delete forever` / `Empty trash…` |
| `trash.deletedWhen(when)` | `deleted ${when}` |
| `trash.newestFirst` / `oldestFirst` | `Newest first` / `Oldest first` |
| `trash.boardsHeading` | `Boards in the Trash` |
| `toasts.movedToTrash(n)` | `Moved ${n} items to Trash` (1 → `Moved to Trash`) |
| `toasts.openTrash` | `Open Trash` |
| `contextMenu.addFavorite` / `removeFavorite` | `Add to favorites` / `Remove from favorites` |
| `search.favoritesToggle` | `Favorites` |
| `combobox.mostUsed` | `Most used` |
| `combobox.didYouMean` | `Did you mean?` |
| `combobox.create(text)` | `Create "${text}"` |
| `combobox.newVibe` / `newMovement` / `newTag` | `new vibe` / `new movement` / `new tag` |
| `vocabulary.moveTo` | `Move to…` |
| `colorStudio.title` / `untitled` | `Color studio` / `Untitled palette` |
| `colorStudio.tabWheel` / `tabImage` / `tabGenerate` / `tabContrast` | `Wheel` / `From an image` / `Generate` / `Contrast` |
| `colorStudio.save` / `cancel` / `discardConfirm` | `Save palette` / `Cancel` / `Discard the changes to this palette?` |
| `colorStudio.lock` / `unlock` / `like` / `unlike` / `copy` / `remove` / `add` | `Lock` / `Unlock` / `Like` / `Remove from Liked` / `Copy` / `Remove` / `Add a color` |
| `colorStudio.copied(hex)` | `Copied ${hex}` |
| `colorStudio.liked` / `likedHelp` | `Liked` / `Colors you hearted. They stay here until you remove them.` |
| `colorStudio.compare` / `choose` / `spotN(n)` | `Compare with the selected spot` / `Choose` / `Spot ${n}` |
| `colorStudio.rules.*` | `Analogous`, `Monochromatic`, `Triad`, `Complementary`, `Split complementary`, `Square`, `Compound`, `Shades`, `Custom` |
| `colorStudio.harmony` / `brightness` / `selectedSpot` | `Harmony` / `Brightness` / `Selected spot` |
| `colorStudio.openImage` / `paste` / `fromLibrary` / `mood` | `Open an image…` / `Paste` / `From my library` / `Mood` |
| `colorStudio.moods.*` | `Colorful`, `Bright`, `Muted`, `Deep`, `Dark` |
| `colorStudio.alsoAddImage` | `Also add this image to my library` |
| `colorStudio.dropImage` | `Drop an image here, paste one, or open one` |
| `colorStudio.modeHarmonious` / `modeRandom` | `Goes with my colors` / `Surprise me` |
| `colorStudio.newColors` / `proposal(i, n)` / `now` | `New colors` / `Proposal ${i} of ${n}` / `Now` |
| `colorStudio.keysHint` | `Space new colors · ← → previous / next · L lock · H like` |
| `colorStudio.text` / `background` / `swap` | `Text` / `Background` / `Swap` |
| `colorStudio.sampleHeading` / `sampleBody` | `A sample heading` / `Body text at 15 px, the size you read every day.` |
| `colorStudio.passes` / `fails` | `Passes` / `Fails` |
| `colorStudio.aaNormal` / `aaLarge` / `aaaNormal` / `aaaLarge` | `AA · normal text (needs 4.5)` / `AA · large text (needs 3)` / `AAA · normal text (needs 7)` / `AAA · large text (needs 4.5)` |
| `colorStudio.findPassing(level)` | `Find a text color that passes ${level}` |
| `colorStudio.useThis` / `unlockFirst` / `noPassing` | `Use this` / `Unlock it first` / `No color with this hue can pass here. Try another background.` |
| `colorStudio.cvdHeading` | `How the palette looks to people who see color differently` |
| `colorStudio.cvd.*` | `Typical vision`, `Red-blind (protanopia)`, `Green-blind (deuteranopia)`, `Blue-blind (tritanopia)`, `No color (achromatopsia)` |
| `colorStudio.hardToTell` | `hard to tell apart` |
| `colorStudio.openInStudio` / `makePalette` | `Open in Color studio` / `Make a palette` |
| `addMenu.palette` | `Palette…` |
| `font.onTheCard` / `style` / `weight(n)` / `textSize` / `sizes.s/m/l` / `textPlaceholder` | `On the card` / `Style` / `Weight · ${n}` / `Text size` / `Small`, `Medium`, `Large` / `Your preview text` |
| `font.styles(n)` / `onCard` / `showOnCard` | `Styles (${n})` / `on the card` / `Show on the card` |
| `font.cardStyleLine(style, n)` | `${style} · ${n} styles` (1 → `${style}`) |
| `font.collection.default` / `families(n)` | `Type collection` / `${n} families` |
| `contextMenu.makeTypeCollection` / `addToTypeCollection(name)` / `removeFromTypeCollection` | `Make a type collection` / `Add to "${name}"` / `Remove from collection` |
| `pdf.pickTitle(name)` / `pageCount(n)` | `Add "${name}"` / `${n} pages` |
| `pdf.selectAll` / `selectNone` / `rangePlaceholder` / `selectedCount(k, n)` | `Select all` / `None` / `e.g. 1-3, 7` / `${k} of ${n} selected` |
| `pdf.addWhole` / `addSeparately(k)` / `addPages(k)` / `splitPages` | `Add as one PDF` / `Add these ${k} pages separately` / `Add ${k} pages` / `Split into pages…` |

---

## Appendix C: migrations

### C.1 `src/db/migrations/003_crop.sql` (C3)
```sql
-- 003_crop.sql — Patch 2 (docs/PATCH_2_PLAN.md, C3): a crop focus per placement.
-- Never edit this file after it ships; add 006_… instead (§5.3).
ALTER TABLE placements ADD COLUMN crop_x REAL; -- 0..1 like CSS object-position under object-fit: cover; NULL = not cropped by the owner
ALTER TABLE placements ADD COLUMN crop_y REAL;
```

### C.2 `src/db/migrations/004_vocabulary.sql` (D3)
```sql
-- 004_vocabulary.sql — Patch 2 (D3): five starter Movement values that read as moods become Vibes
-- (keeping their items and AI hints); "Contemporary" goes when nothing uses it.
-- Never edit this file after it ships.
UPDATE terms SET facet = 'vibe', sort = sort + 1000
  WHERE facet = 'movement'
    AND name_norm IN ('psychedelic', 'grunge', 'punk', 'y2k', 'vaporwave')
    AND NOT EXISTS (SELECT 1 FROM terms v WHERE v.facet = 'vibe' AND v.name_norm = terms.name_norm);
DELETE FROM terms
  WHERE facet = 'movement' AND name_norm = 'contemporary'
    AND NOT EXISTS (SELECT 1 FROM item_terms it WHERE it.term_id = terms.id);
```

### C.3 `src/db/migrations/005_fonts.sql` (F1)
```sql
-- 005_fonts.sql — Patch 2 (F1): font families (one item, several files), card options, type
-- collections. Never edit this file after it ships.
CREATE TABLE font_files (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_hash   TEXT NOT NULL,
  file_size   INTEGER,
  mime        TEXT,
  style_name  TEXT NOT NULL DEFAULT '',
  weight      INTEGER NOT NULL DEFAULT 400,
  italic      INTEGER NOT NULL DEFAULT 0,
  axes        TEXT,                       -- JSON FontVariationAxis[]
  instances   TEXT,                       -- JSON { "Bold": { "wght": 700 }, … }
  meta        TEXT,                       -- JSON FontMeta of this file
  sort        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX font_files_item ON font_files(item_id);
CREATE INDEX font_files_hash ON font_files(file_hash);
ALTER TABLE items ADD COLUMN font_family_key TEXT;  -- normalized family name, to find a family on import
ALTER TABLE items ADD COLUMN font_card TEXT;        -- JSON {"fileId":…,"wght":…,"size":"s"|"m"|"l","text":…}
ALTER TABLE items ADD COLUMN font_collection TEXT;  -- JSON {"ids":[…]}: this font item is a type collection
ALTER TABLE placements ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE SET NULL;
CREATE INDEX items_font_family ON items(font_family_key);
INSERT INTO font_files (id, item_id, file_path, file_name, file_hash, file_size, mime, style_name, axes, meta, created_at, deleted_at)
  SELECT id, id, file_path, COALESCE(file_name, ''), COALESCE(file_hash, ''), file_size, mime,
         COALESCE(json_extract(font_meta, '$.subfamily'), ''), json_extract(font_meta, '$.variableAxes'),
         font_meta, created_at, NULL
  FROM items WHERE kind = 'font' AND file_path IS NOT NULL;
```
Notes: `ALTER TABLE … ADD COLUMN … REFERENCES` is allowed because the default is NULL. `json_extract` works in both
SQLite builds (sql.js 1.14.2 ships SQLite 3.49; rusqlite is `bundled`). The migrator splits on `;` outside quotes and
strips `--` comments, so keep comments on their own line or after the statement as above.

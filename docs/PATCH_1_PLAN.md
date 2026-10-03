# Designspace: Patch 1 plan

> The owner installed the Windows build (v0.1.0) and reviewed it. This document turns that review into
> precise, ordered work: first the bugs that keep the map from showing anything, then the feel of the
> app, then the new features (palettes, notebook notes with #actions, long descriptions behind a
> thought bubble, font previews, a minimap with connections and a full Overview).

| | |
|---|---|
| Owner | @anyMaria |
| Written | 2026-10-03, from the owner's review of the v0.1.0 Windows build |
| Based on | `main` at `a4d1e38` |
| Status | Ready to build, starting with Phase A |
| Pictures | `docs/patch-1/` (bug screenshots, mockups, type and icon previews) |

## How to use this document

**Owner (you)**
1. Read §0 (what was wrong) and §1 (choices to confirm). Change any default you don't like before starting.
2. Open a new Claude Code conversation on `anyMaria/designspace` and paste the kick-off prompt for Phase A from §12.
3. One phase per conversation. At the end of each phase the agent gives you **Owner checks** to try on your PC.

**Coding agent**
- Read `CLAUDE.md`, then this whole document, then `docs/DECISIONS.md` (skim; read the M5 and M7 entries).
  `docs/IMPLEMENTATION_PLAN.md` is still the overall spec; this plan changes it where it says so.
- Do the tasks of your phase **in order**, one commit per task. After every task run the checks in §2.2.
- Follow the steps exactly. Where a step turns out to be wrong or impossible, take the simplest alternative
  that keeps the UX principles (plan §1.3), write it in `docs/DECISIONS.md` under "Patch 1", and continue.
- Tick each task's checkbox in this file when it lands, and commit this file with the code.

## Contents
0. [What the owner reported and what is actually wrong](#0-what-the-owner-reported-and-what-is-actually-wrong)
1. [Choices to confirm](#1-choices-to-confirm)
2. [Rules and tools for the coding agent](#2-rules-and-tools-for-the-coding-agent)
3. [Phase A: make your things show up (bugs)](#3-phase-a-make-your-things-show-up)
4. [Phase B: feel and clarity](#4-phase-b-feel-and-clarity)
5. [Phase C: palettes](#5-phase-c-palettes)
6. [Phase D: notebook notes and #actions](#6-phase-d-notebook-notes-and-actions)
7. [Phase E: descriptions and the thought bubble](#7-phase-e-descriptions-and-the-thought-bubble)
8. [Phase F: fonts on the map](#8-phase-f-fonts-on-the-map)
9. [Phase G: minimap with connections and the Overview](#9-phase-g-minimap-with-connections-and-the-overview)
10. [Finishing a phase](#10-finishing-a-phase)
11. [Later (not in Patch 1)](#11-later-not-in-patch-1)
12. [Kick-off prompts](#12-kick-off-prompts)
- Appendix: [A. reference code](#appendix-a-reference-code) · [B. new strings](#appendix-b-new-strings)

---

## 0. What the owner reported and what is actually wrong

Everything below was checked in the code and, where possible, reproduced in the browser build with
Playwright (screenshots in `docs/patch-1/`).

| # | Owner's note | Diagnosis | Fix |
|---|---|---|---|
| 1 | "Photos, links, nothing appears, only a light purple square." | **Three bugs stacked.** (a) Tauri's `convertFileSrc` runs `encodeURIComponent` on the whole path, so `original/media/2026/10/x.jpg` reaches Rust as `original%2Fmedia%2F…`; `media_protocol.rs` splits on a literal `/` without decoding, so **every** `media://` request is a 404 on Windows (Tauri's own protocols decode: `tauri-2.12.0/src/protocol/asset.rs:40`). (b) `cache_put` stores `t128/<id>` as the flat file `t128_<id>`, but the protocol looks for a nested `t128/<id>`, so thumbnails would still 404 after (a). (c) The canvas only requests a picture when a card first scrolls into view; a thumbnail that finishes while the card is already on screen is never fetched (reproduced in the browser: `bug-stale-texture-before.png` / `-after-pan.png`). The same flaw means zooming in never upgrades a small thumbnail to the sharp one. | A1, A3, A5, A6 |
| 1b | (not reported yet, would appear right after 1 is fixed) | Every import is placed as a 320×320 square and never reshaped when the real size is known, so **every non-square photo is squashed** (`bug-squashed.png`). | A4 |
| 2 | "Fonts say can't read that font." | Same 404 as 1a: font ingest fetched an error page instead of the font file. | A1, A5 |
| 3 | "Opacity drops all of a sudden, illegible." | Selecting or hovering any item dims every other item to 35 % **even when nothing is connected** (new imports are auto-selected and unclassified, so this happens after every import). Only the card is dimmed, not its text, so a faded note keeps dark text on a dark card (`bug-dimming.png`). Two ways the dim can also get stuck: List-panel group headers and hub stars set a 12 % highlight on mouse-enter and rely on a mouse-leave that never fires when the element disappears. | A8 |
| 4 | "Pinch on the trackpad doesn't zoom." | `zoomHotkeysEnabled: false` makes wry turn off **both** WebView2 zoom keys and WebView2 pinch (`wry-0.57.0/src/webview2/mod.rs:639,660`), and with pinch off WebView2 never passes touchpad pinches to the page. | A9 |
| 5 | "Files… only shows images." | The Windows file dialog pre-selects the first filter, which is "Images". | A7 |
| 6 | "The share icon isn't intuitive." | Connections (dock) **and** Rediscover (top-left) both use the `Share2` "share" icon. | B2 |
| 7 | Immersive full screen | Not implemented. | B1 |
| 8 | Show names on hover | Not implemented. | B3 |
| 9 | Lines should attach to the sides | Lines go centre to centre, on top of the pictures. | B4 |
| 10 | Urbanist typography | Fonts committed in `src/design/fonts/urbanist/`. Urbanist has no tabular figures and a smaller x-height than Manrope (0.50 vs 0.54 em). | B5 |
| 11 | Palettes (from a photo, HSV wheel, hex, reorder, rounded squares, 2 columns) | Swatches are single-colour items; "Extract palette" makes 5–8 separate cards. | Phase C |
| 12 | Notes look different (ruled lines), `#` actions with a preview menu, no Details for notes | Notes are flat rectangles with Arial text on the canvas. | Phase D |
| 13 | Longer description behind a "thought bubble" next to the top-right corner | Not implemented ("Why I saved this" is short). | Phase E |
| 14 | Fonts: show writing in the font, write it, adjust it | Works once 2 is fixed (the card shows "Aa" + name + a sample line, and double-click opens the type tester). Patch 1 adds a preview text you choose for all font cards. | Phase F |
| 15 | Minimap with coloured connection lines, a big "global" map like Obsidian's graph | Minimap is grey dots only. | Phase G |

Other things found during the review, fixed along the way: links whose cover failed are never retried
(A5); link cards show nothing while their cover loads (A6); icon buttons use the slow native tooltip
with no shortcut (B2); the right-click menu shows "Copy image" on notes and other irrelevant items (B6);
items added from the + menu pile up at the screen centre (B7); canvas text uses Arial instead of the UI
font (B5); the migrator never backs up before migrating, although `CLAUDE.md` requires it (C0); bulk
edits apply tags and types to notes and swatches (D4); a re-rendered thumbnail (PDF "Set as cover")
keeps showing the old picture because thumbnail URLs never change (F1).

---

## 1. Choices to confirm

Defaults in **bold** are what this plan builds. The owner can change any of them before (or during) a phase;
the agent then updates this section and the affected tasks.

| # | Question | Default | Alternatives |
|---|---|---|---|
| Q1 | Icon for Connections (`docs/patch-1/icons.png`) | **Waypoints** (dots joined by lines) | Link2 (a chain: literally "links", but the app also has web-link items) · Workflow |
| Q2 | Icon for Rediscover | **Shuffle** | Dices · Compass · Sparkles |
| Q3 | Full screen | **The app opens in full screen; F11 and a button toggle it; Settings → Canvas → "Open in full screen" can turn it off** | Remember the last state instead |
| Q4 | Default note colour | **Cream** (with white ruled lines) | **Ink** (dark plum, new) |
| Q5 | Where #actions are listed | **A third tab "Actions" in the right panel** | A dock button with a popover |
| Q6 | Ticking actions off as done | **Not in Patch 1** | A checkbox per action |
| Q7 | Where you edit a palette | **In the right panel (Details) when the palette is selected; double-click opens it** | A floating editor next to the card |
| Q8 | What the opened thought bubble shows | **The long description (editable) plus a summary of the details (type, vibes, movement, tags)** | Description only |
| Q9 | Lines | **Stop at the edge of each picture, on the side facing the other item** (`mock-lines.png`) | Always start from the middle of a side (tidier, but lines bunch up) |
| Q10 | Typography | **Urbanist everywhere** (UI 15 px Medium, titles Bold); Unbounded and Manrope removed | Keep Unbounded for big titles only |
| Q11 | Names | **Show on hover**, can be turned off in Settings | Also an "Always show names" mode (later) |
| Q12 | Font preview text | **"Sphinx of black quartz, judge my vow"**, changeable in Settings and the type tester | Any text you like |
| Q13 | Overview opens with | **Double-click the minimap, its expand button, or O; shows your own layout with tiny thumbnails** | Start in "Clusters" (Constellations-style) layout |

---

## 2. Rules and tools for the coding agent

### 2.1 Rules (in addition to `CLAUDE.md`)
- **Order matters.** Phase A first. Inside a phase, tasks in order. Don't start a phase before the previous one is merged.
- **Small, boring changes.** Change only what the task names. Don't rename existing exports, reformat untouched code, or "clean up" other modules.
- **No new dependencies** except the ones named in a task (`percent-encoding` in A1, `@tiptap/pm` in D2), at the exact versions given.
- **Migrations:** only task C0 adds a migration (`002_patch1.sql`). Never edit `001_init.sql`.
- **Strings** go in `src/i18n/en.ts` (Appendix B lists them). **Colours, radii, sizes, durations** go in `src/design/tokens.ts` and `tokens.css`. The only exception is the colour wheel's rainbow in C4.
- **Undo:** every user-visible data change is a Command in `src/commands/` (`do`/`undo`, one `db.batch`). Things the app derives by itself (thumbnails, fitting a card to its picture's shape) are not commands; say so in a comment.
- **Engine.ts is already 2,200 lines.** New drawing code goes in new modules under `src/canvas/` (named per task); `Engine.ts` only creates, positions, hides and destroys the display objects.
- **No `any`, no `// @ts-ignore`, no `eslint-disable` except the existing `react-hooks/exhaustive-deps` pattern with a reason.**
- **Windows-only behaviour** (protocol, pinch, full screen, file dialog, WebView2) can't be checked in the cloud. Unit-test the pure parts and list the rest as Owner checks.

### 2.2 Checks after every task
```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace   # when Rust changed
pnpm e2e   # at least the specs the task names; the full suite before the phase ends
```
`cargo` for `src-tauri` needs the Tauri Linux prerequisites (plan §7.1); `cargo test -p designspace-core` works without them.

### 2.3 Looking at the app (cloud session)
- `pnpm build && pnpm preview --port 4173`, then drive `http://localhost:4173/?seed=demo` with Playwright.
- Chromium: if Playwright says the browser is missing, launch with `executablePath: '/opt/pw-browsers/chromium'` (never run `playwright install`).
- The seeded demo takes 10–30 s to make its thumbnails in a GPU-less container. Wait for them (poll, don't sleep blindly).
- Use `tests/e2e/helpers/pixels.ts` (created in A3, code in Appendix A.1) to read a screen pixel in e2e tests.
- Take a screenshot of every visual change and compare it with the mockups in `docs/patch-1/` (`mockups.html` holds the exact CSS values).

---

## 3. Phase A: make your things show up

**Goal:** on Windows, every photo, video, PDF, font and link shows its real picture, in its real shape; nothing
dims unexpectedly; pinch zooms the map; Files… shows every supported file. Size: M. Version at the end: **0.2.0**.

### A1 · Fix the `media://` protocol (decode the path, find cached thumbnails) `[x]`
**Why:** this one bug hides every image, thumbnail, font, PDF and video on Windows.

**Files:** `crates/designspace-core/Cargo.toml`, `crates/designspace-core/src/lib.rs`,
new `crates/designspace-core/src/media_url.rs`, `src-tauri/src/media_protocol.rs`, `src-tauri/src/media.rs`.

**Do**
1. Add `percent-encoding = "2.3.2"` to `[dependencies]` of `crates/designspace-core/Cargo.toml` (already in `Cargo.lock`, no download).
2. Create `media_url.rs` with exactly this public surface (full code in Appendix A.2):
   - `pub enum MediaRoot { Original, Cache, Models }`
   - `pub struct MediaRequest { pub root: MediaRoot, pub rel: String }`
   - `pub enum MediaUrlError { InvalidUtf8, BadPath, UnknownRoot }` (with `thiserror`)
   - `pub fn parse_media_path(raw_path: &str) -> Result<MediaRequest, MediaUrlError>`: percent-decode **first**, then strip leading `/`, then split once on `/`.
   - `pub fn cache_file_name(key: &str) -> String`: moved unchanged from `src-tauri/src/media.rs` (`key.replace(['/', '\\'], "_").replace("..", "_")`).
3. `lib.rs`: add `pub mod media_url;`.
4. `media.rs`: delete its private `cache_file_name` and `use designspace_core::media_url::cache_file_name;` instead. Behaviour must not change.
5. `media_protocol.rs` → `try_handle`: replace the manual `split_once` with `parse_media_path(request.uri().path())` (any error → `StatusCode::NOT_FOUND`). For `MediaRoot::Cache`, resolve `cache_file_name(&rel)` instead of `rel`. Pass the result to `resolve_existing` exactly as today (decoding happens **before** the `..` check, so an encoded `%2E%2E` is still rejected).
6. In `register`, when `try_handle` returns an error status, `log::warn!("media:// {} for {}", status, request.uri().path())`. This makes the next problem of this kind visible in the logs (Settings → About → Open logs folder).

**Tests** (in `media_url.rs`): the eight cases in Appendix A.2 (encoded slashes for original and cache, unencoded path still works, accents and spaces, unknown root, empty rel, encoded `..` survives decoding so `resolve_existing` can reject it, `cache_file_name`). No change to `path_safety.rs`: it already rejects `..`, and the decoded `rel` goes through it.

**Done when:** `cargo test -p designspace-core` passes with the new tests; clippy clean.

### A2 · Never treat an error page as a file `[x]`
**Why:** today a 404 is read as an empty file, which hid bug A1 for weeks.

**Files:** `src/workers/ingestQueue.ts`, `fontIngestQueue.ts`, `pdfIngestQueue.ts`, `src/lib/videoFrame.ts` (if it fetches), `src/canvas/Engine.ts` (TextureManager `decode`), `src/features/focus/FontFocusViewer.tsx`, new `src/features/diagnostics/MediaCheck.tsx`, `src/features/settings/SettingsDialog.tsx` (About → Diagnostics).

**Do**
1. Every `fetch(url)` of a media/cache URL: right after it, `if (!res.ok) throw new Error(\`HTTP ${res.status} for ${url}\`);`. Find them with `grep -rn "await fetch(" src`.
2. `IngestQueue.dispatch` catch block: also mark the item failed so it doesn't stay "pending" forever: `await this.persist({ id: 'read-failed', itemId: item.itemId, ok: false, error: String(err) })` (`IngestFailure` needs all four fields; that path already writes `status = 'error'`), then free the worker and pump as today.
3. Diagnostics: add a "Check media loading" button to the existing Diagnostics page. It takes up to three items with `status = 'ok'` and a `filePath`, fetches `platform.media.originalUrl(filePath)` and `platform.cache.url('t128/<id>')`, and lists each result as "Original · OK (1.2 MB)" or "Thumbnail · Failed (HTTP 404)". Strings in `en.diagnostics` (Appendix B).

**Done when:** unit tests for the queues still pass (update the fakes so `fetch` returns `{ ok: true, … }`); add one test per queue where `fetch` returns `ok: false` and the item ends `error`/`unsupported`.

### A3 · The canvas refreshes pictures that arrive later, and sharpens on zoom `[x]`
**Why:** a card on screen when its thumbnail finishes stays a purple square until you pan away and back; zooming in never loads the sharper picture.

**Files:** `src/canvas/Engine.ts`, `src/canvas/TextureManager.ts` (+ its test), new `tests/e2e/helpers/pixels.ts`, new `tests/e2e/patch1-thumbnails.spec.ts`, fixture `tests/e2e/fixtures/wide-circle.png` (already committed: 800×400, a (240,180,60) circle of radius 150 in the middle on a blue-green gradient).

**Do**
1. `TextureManager`:
   - Keep LRU order in a `Map<string, true>` instead of an array (`touch` = `delete` + `set`, eviction = first key). Make `touch(key)` public; it does nothing for a key that isn't cached (still loading or never loaded).
   - Change the option to `destroyItem: (item: T, key: string) => void`.
   - Raise the default `maxCachedItems` to `1500` (small `t128` textures are 64 KB each; see DECISIONS).
2. `Engine`:
   - Add `private appliedTexKey = new Map<string, string>()` (card id → texture key currently shown or being loaded).
   - Replace `requestLod` with the version in Appendix A.3. The texture **key includes the URL** (`t128:<id>:<url>`), so a new URL (a re-made thumbnail) is a new key.
   - In `cullItems`, call `requestLod(card, sprite)` for **every** visible, non-hidden card on every pass (not only for newly visible ones). When the card already shows the right texture, `requestLod` just `touch`es it, so on-screen textures are never the least recently used.
   - In the `TextureManager` options, `destroyItem(tex, key)` destroys the texture **and** resets any sprite still showing it: parse the id from the key (`key.split(':')[1]`), and if `appliedTexKey.get(id) === key` set `sprite.texture = Texture.WHITE`, `sprite.tint = card.dominantColor`, and `appliedTexKey.delete(id)` (the next cull reloads it).
   - `startVideoPreview`: `appliedTexKey.delete(id)` before swapping in the video texture, so `stopVideoPreview` → `requestLod` puts the poster back.
   - `upgradeTexturesForExport`: use the same key format.
3. Create `tests/e2e/helpers/pixels.ts` from Appendix A.1.
4. New e2e `patch1-thumbnails.spec.ts` (Playwright's default viewport is 1280×720; never hard-code screen coordinates, measure them):
   - open `/` (an empty library); `const box = await page.locator('canvas').first().boundingBox()`; `cx = box.x + box.width / 2`, `cy = box.y + box.height / 2` (a single import lands centred on the viewport centre);
   - import `wide-circle.png` through the hidden file input (`page.locator('input[type=file]').first().setInputFiles(...)`), press Escape, move the mouse to (5, 5);
   - **without panning**, `waitForPixel(page, cx, cy, (c) => near(c, [240, 180, 60], 40), 30_000)`. Fails today, passes after this task.

**Done when:** the new spec passes; all existing e2e specs pass; TextureManager unit tests updated (LRU order, `touch`, destroy callback receives the key).

### A4 · Cards take the real shape of their picture `[x]`
**Why:** imports are 320×320 squares forever, so photos are squashed.

**Files:** new `src/features/import/fitPlacements.ts` (+ test), `src/features/import/importItems.ts`, `src/features/import/importLink.ts`, the four ingest queues, `src/lib/fontRender.ts`.

**Do**
1. Move `PLACEHOLDER_SIZE` (320) from `importItems.ts` to `fitPlacements.ts` and export it; import it back in `importItems.ts`/`importLink.ts`.
2. In `fitPlacements.ts` (code in Appendix A.4):
   - `export function fitRect(aspect: number, size = PLACEHOLDER_SIZE): { w; h; dx; dy }`: long side stays `size`, the other side shrinks, `dx/dy` re-centre it inside the old square.
   - `export async function fitPlacementsToAspect(platform, itemId, aspect)`: for every placement (any board) of that item that is **still exactly 320×320**, update `x,y,w,h` in one `db.batch`, and update the in-memory placement if it is on the current board. Not a command (derived data, like thumbnails): write that in a comment and in DECISIONS.
3. Call it after a successful ingest:
   - `IngestQueue.persist` (images **and** link covers): `aspect = result.width / result.height`.
   - `VideoIngestQueue`: frame `width / height`. `PdfIngestQueue`: rendered page `width / height`.
   - `FontIngestQueue`: export `SPECIMEN_ASPECT = 512 / 320` from `fontRender.ts` and use it (font cards become 320×200, as the plan always said).
4. Never call it with a non-finite or ≤ 0 aspect (return early).

**Tests:** `fitRect` (landscape 2:1 → 320×160, dy 80; portrait 1:2 → 160×320, dx 80; square → unchanged); `fitPlacementsToAspect` with a mocked platform (pattern: `src/commands/itemCommands.test.ts`): only 320×320 rows change; a resized placement is left alone. Extend `patch1-thumbnails.spec.ts`: after the circle colour appears, `pixelAt(page, cx, cy + 128)` (128 px below the centre: inside a squashed 320×320 card, outside a correct 320×160 one) must be dark (every channel < 70).

### A5 · Repair the existing library on the first launch after the update `[x]`
**Why:** on the owner's PC everything was stored as failed; it must all be re-made once.

**Files:** `src/workers/ingestQueue.ts`, `src/app/App.tsx`.

**Do**
1. `CURRENT_DERIVED_V = 2`, with the comment: "Patch 1: re-derive everything once. Thumbnails never loaded on Windows before the media:// fix (A1) and placements need their real shape (A4)." Every queue's resume query already re-queues `derived_v < CURRENT_DERIVED_V`.
2. `resumePendingIngest`: also pick up links that have a cover (their cover goes through the image worker):
   ```sql
   SELECT id, COALESCE(file_path, cover_path) AS file_path, mime FROM items
   WHERE deleted_at IS NULL
     AND ((kind = 'image' AND file_path IS NOT NULL) OR (kind = 'link' AND cover_path IS NOT NULL))
     AND (status = 'pending' OR derived_v < ?)
   ```
3. Nice to have: make the five `resumePending*` functions return the number they queued; in `App.tsx`, if the total is over 20, show the toast `en.patch1.refreshingPreviews(n)` ("Refreshing previews for 340 items…").

**Done when:** a unit test shows a `link` row with `cover_path` and `status = 'error'` is re-queued with its cover path.

### A6 · Link cards show the site and title until the picture is there `[x]`
**Files:** `src/canvas/itemCards.ts`. **Do:** in the link branch, `noteText: thumbReady ? null : [safeDomain(item.url), item.title || null].filter(Boolean).join('\n')` (today it hides the text as soon as a cover path exists, even while the cover is still loading or failed). **Test:** extend or add a unit test for `itemToCard` (link with `coverPath` and `status: 'pending'` → has `noteText`).

### A7 · Files… shows every supported file `[x]`
**Files:** `src/lib/fileKinds.ts`, `src/features/import/AddMenu.tsx`, `src/i18n/en.ts`.
**Do**
1. `fileKinds.ts`: export the four extension lists as arrays (`IMAGE_EXTENSIONS`, `VIDEO_EXTENSIONS`, `PDF_EXTENSIONS`, `FONT_EXTENSIONS`) and `ALL_SUPPORTED_EXTENSIONS`; keep the existing Sets built from them.
2. `AddMenu.tsx`: `MEDIA_FILTERS` = `[{ name: en.addMenu.filterAll, extensions: ALL_SUPPORTED_EXTENSIONS }, …images, videos, PDFs, fonts]` with names from `en.addMenu` (today they are hard-coded English). **"All supported files" must be first**: Windows pre-selects the first filter.
3. The browser `<input accept>` stays as is.
**Owner check:** Files… on Windows shows images, videos, PDFs and fonts together.

### A8 · Dimming only when it means something, and never stuck `[x]`
**Why:** the "opacity drops all of a sudden, illegible" bug.

**Files:** new `src/canvas/cardAlpha.ts` (+ test), `src/canvas/Engine.ts`, `src/features/list/ListPanel.tsx`, `src/state/connectionsUiStore.ts`, `src/canvas/useConnectionsBinding.ts`, `src/features/connections/ConnectionsPopover.tsx`, `src/i18n/en.ts`.

**Do**
1. `cardAlpha.ts` (pure, code in Appendix A.5):
   - `connectionRelatedSet(sources)`: the set of ids to keep bright, or **`null` when no source has any candidate** (then nothing dims).
   - `cardAlpha(id, inputs, related)`: group/hub highlight 1 or `0.12`; else, if `related` and not `suppressConnectionDim`, 1 or `0.35`; else search dim `0.12` (`hide` mode stays 1, it's culled elsewhere). Use the existing `canvasGeometry.dimSearch` / `dimConnections` tokens.
2. `Engine.refreshAlpha()`: compute `related` **once**, then set the same alpha on **every display object of the card**: the sprite, its note label, its corner badge, and (from Phases C/D) its decor. Add `private forEachCardVisual(id, fn)` and use it everywhere alpha is set (also in `pulseItem`).
3. No dimming while dragging: add `private dragging = false`; set it `true` when a `move` or `resize` drag passes the drag threshold, `false` on pointer-up; call `refreshAlpha()` both times; pass it as `suppressConnectionDim`.
4. Highlights can't get stuck:
   - `setHoverHighlight(ids, source: 'panel' | 'hub' = 'panel')` and keep `private hoverHighlightSource` (`null` when nothing is highlighted). The Show all and Constellations star handlers pass `'hub'` (`pointerover` → `setHoverHighlight(memberSet, 'hub')`, `pointerout` → `setHoverHighlight(null, 'hub')`); the List and Actions panels use the default `'panel'`.
   - Keep `private lastPointer: { x: number; y: number } | null` (screen, relative to the container) updated in the idle `pointermove`; on the container's `pointerleave`, set it to `null`, clear any `'hub'` highlight and the hovered connection line (emit `connectionLineHover(null)`), and clear the hovered item (`hoveredId = null`, emit `hover(null)`, redraw the connect handle). Overlays drawn above the map (the hover name, the thought bubble in E2) count as "leaving the map"; E2's grace period handles that.
   - In the idle `pointermove`: if `hoverHighlightSource === 'panel'`, clear it (the pointer is on the map, so it can't be on a List row).
   - At the end of `drawHubs()` and `drawConstellationOverlay()`: if the source is `'hub'` and no star is within its hit radius of `lastPointer`, clear it. Stars are re-created every frame, so their `pointerout` never fires; this re-check replaces it. Do the same for `hoveredConnectionLine` in `drawConnectionLines()` (clear it if `lastPointer` is more than 6 px from that pair's new segment; Appendix A.6 has `distanceToSegment`).
   - `ListPanel`: clear the highlight on unmount (`useEffect(() => () => engine?.setHoverHighlight(null), [engine])`) and on scroll of the list container.
5. Connections popover: add a third Display option **"Off"** (`ConnectionsMode = 'hover' | 'showAll' | 'off'`). In `useConnectionsBinding`, `'off'` clears lines and hubs and never dims. Default stays `'hover'`.

**Tests:** `cardAlpha.test.ts`: no candidates → everything 1; candidates → unrelated 0.35, related 1; dragging → 1; hub highlight → 0.12/1; search dim 0.12; hide → 1. New e2e `patch1-no-dim.spec.ts` on `/?seed=demo`. At start the camera puts world (0, 0) at the canvas centre `(cx, cy)` at 100 %. Demo item 0 ("BAUHAUS 1", world 0,0–320,400) has an amber circle around card point (160, 173); item 1 (world 400,0–720,400) has a sage rectangle around card point (160, 160).
   - Press `L` to close the right panel (item 1 is under it otherwise).
   - `p0 = (cx + 160, cy + 173)`, `p1 = (cx + 560, cy + 160)`; `waitForPixel` until `p0` is near (233, 168, 69) and `p1` near (147, 184, 157) (±40, 60 s each; the demo makes its thumbnails slowly).
   - Read `c1 = pixelAt(p1)`; click `p0` (selects the unclassified item 0); wait 500 ms; `pixelAt(p1)` must be `near(c1, 10)`. Before this task it drops to about a third of its brightness.
   Existing `smoke-m3-*` specs must pass.

### A9 · Pinch to zoom on the trackpad `[x]`
**Files:** `src-tauri/tauri.conf.json`, new `src/app/pageZoomGuard.ts` (+ test), `src/app/main.tsx`, `src/design/global.css`, `src/canvas/CanvasView.tsx`.

**Do**
1. `tauri.conf.json` → main window: `"zoomHotkeysEnabled": true`. (wry maps this one flag to both `IsZoomControlEnabled` and `IsPinchZoomEnabled`; with it off, WebView2 never delivers touchpad pinch to the page. Log the deviation from plan §2.2 in DECISIONS.)
2. `pageZoomGuard.ts` (code in Appendix A.7): `installPageZoomGuard(target: Window = window): () => void` adds, **in the capture phase**,
   - a `wheel` listener with `{ passive: false, capture: true }` that calls `preventDefault()` when `e.ctrlKey` (blocks WebView2 page zoom for Ctrl+wheel and pinch; the canvas's own wheel handler still runs and zooms the map). `passive: false` is required: Chromium makes window-level wheel listeners passive by default.
   - a `keydown` listener that calls `preventDefault()` for Ctrl/⌘ with `=`, `+`, `-`, `_`, `0` (also `e.code` `Equal`, `Minus`, `NumpadAdd`, `NumpadSubtract`, `Digit0`, `Numpad0`). **Do not** call `stopPropagation`: the app's own Ctrl+= / Ctrl+− map zoom (`useCanvasShortcuts`) must still run.
3. `main.tsx`: call `installPageZoomGuard()` before `createRoot(...)`.
4. CSS: `html, body { touch-action: pan-x pan-y; }` in `global.css`; the canvas container in `CanvasView` gets `touchAction: 'none'`.
5. The canvas wheel handler already treats `ctrlKey` as pinch (`exp(-deltaY * 0.01)`). Don't change it.
6. DECISIONS caveat for a future macOS/Linux build: there, `zoomHotkeysEnabled` injects Tauri's own Ctrl/⌘ +/− zoom script, which needs the `core:webview:allow-set-webview-zoom` permission; check that it respects `defaultPrevented` before shipping on those platforms.

**Tests:** `pageZoomGuard.test.ts` (jsdom): Ctrl+wheel → `defaultPrevented`; plain wheel → not; Ctrl+`=` → prevented; plain `=` → not; a second listener added after the guard still receives the event.
**Owner checks:** pinch zooms the map around your fingers; Ctrl+wheel and Ctrl+= zoom the map; the panels and dock never grow.

**Phase A Owner checks (plain language)**
- Install the new build and open your library. Leave it a minute: every card should turn into its real picture (it re-makes all previews once). Photos keep their real shape.
- Fonts show "Aa", their name and a sample line. Double-click one: the type tester opens.
- Paste a link: the card shows the site and title, then the preview image.
- Click a photo you haven't tagged: nothing else fades. Hover a tagged photo for a moment: related items stay bright, the rest fades a little, and labels fade with their cards.
- Pinch on the trackpad: the map zooms. Files… shows all your file types.
- Settings → About → Diagnostics → Check media loading says OK.

---

## 4. Phase B: feel and clarity

Size: M. Version at the end: **0.3.0**.

### B1 · Immersive full screen `[x]`
**Files:** `src/platform/types.ts`, `TauriPlatform.ts`, `BrowserPlatform.ts`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`, `src/state/uiStore.ts`, `src/state/loadMachineSettings.ts`, `src/app/useGlobalShortcuts.ts`, `src/app/App.tsx`, `src/app/Shell.tsx`, `src/features/settings/CanvasSection.tsx`, `src/features/shortcuts/ShortcutListOverlay.tsx`, `src/i18n/en.ts`.

**Do**
1. `Platform` gets `window: { isFullscreen(): Promise<boolean>; setFullscreen(on: boolean): Promise<void> }`.
   - Tauri: `getCurrentWindow()` from `@tauri-apps/api/window` → `isFullscreen()` / `setFullscreen(on)`.
   - Browser: the Fullscreen API on `document.documentElement` (`requestFullscreen` / `exitFullscreen`; it only works from a click or key press).
2. Capability: add `"core:window:allow-set-fullscreen"` (reading is already in `core:default`).
3. `lib.rs`: build the window-state plugin with
   `.with_state_flags(tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::FULLSCREEN)`
   so the setting below, not the last session, decides full screen.
4. Machine setting `startFullscreen: boolean` (default `true`) in `uiStore` + `loadMachineSettings` (same pattern as `minimapOpen`).
5. Tauri boot (`App.tsx`, after the library is ready): if `startFullscreen`, `await platform.window.setFullscreen(true)` (catch and log errors).
6. `F11` anywhere (even in a text field): `preventDefault()` and toggle. A button at the left of the top-right cluster: icon `Fullscreen` (enter) / `Minimize` (exit), label "Full screen (F11)" / "Exit full screen (F11)". On entering, show the toast `en.fullscreen.hint` once per session ("Full screen · press F11 to leave").
7. Settings → Canvas: toggle "Open in full screen". Shortcut list: add F11.
**Owner checks:** the app opens in full screen; F11 and the button leave and enter it; the setting turns it off.

### B2 · Clearer icons, tooltips with shortcuts `[x]`
**Files:** `src/app/Shell.tsx`, `src/design/components/IconButton.tsx`, `Tooltip.tsx`, `DesignPage.tsx`.
**Do**
1. Dock Connections: `Waypoints` (Q1). Top-left Rediscover: `Shuffle` (Q2). Both from `lucide-react` (already installed, checked present in 1.48.0).
2. `Tooltip`: add `placement?: 'top' | 'bottom'` (default `'top'`) and `shortcut?: string` (rendered with the existing `<Kbd>` after the label).
3. `IconButton`: add `shortcut?: string` and `tooltipPlacement?: 'top' | 'bottom'`; wrap the button in `<Tooltip>`; **remove the native `title`** (keep `aria-label`).
4. Shortcuts on the existing buttons: Search `Ctrl+K`, Connections `C`, Select `V`, Hand `H`, Rediscover `R`, Settings `Ctrl+,`, Panel `L`, Full screen `F11`. The top-left and top-right clusters use `tooltipPlacement="bottom"` (a tooltip above them would leave the screen).
**Done when:** hovering any icon button for 0.5 s shows the styled tooltip with its shortcut; `/design` shows an example.

### B3 · Names on hover `[ ]`
**Files:** new `src/canvas/CanvasHoverOverlay.tsx`, `src/app/Shell.tsx`, `src/state/uiStore.ts` + `loadMachineSettings.ts` (`showNamesOnHover`, default `true`), `src/features/settings/CanvasSection.tsx`, `src/design/tokens.*`.
**Do**
1. `CanvasHoverOverlay` (mounted once in `Shell`, after `CanvasView`) listens to `engine.on('hover', id)` and to camera changes (`useCameraState(engine)`).
2. 350 ms after the hover starts on the same id, show a pill **8 px under the card** (`engine.getScreenRect(id)`), centred; if it would leave the bottom of the window, put it 8 px above the card instead. Hide it at once when the hover ends, on any `pointerdown` on the canvas, and while the camera moves (show again 350 ms after it stops, if still hovering).
3. Text: `item.title.trim() || item.fileName || en.kind[item.kind]`. No pill for notes; for swatches/palettes only when they have a name.
4. Style (tokens): background `surface-1` at 92 %, hairline border, `text-1`, 13 px semibold, padding 5×12, radius pill, `max-width: 280px`, ellipsis, `pointer-events: none`, `z-index` above the canvas and below panels. Match `docs/patch-1/mock-bubble.png` (left).
5. `data-testid="hover-name"`. Setting: Settings → Canvas → "Show names on hover".
**Test:** e2e `patch1-hover-name.spec.ts`: on `/?seed=demo`, hover `(cx + 160, cy + 173)` (demo item 0, see A8) for 600 ms → `getByTestId('hover-name')` shows "BAUHAUS 1"; move the mouse to (5, 5) → it disappears.

### B4 · Lines stop at the edges of the pictures `[ ]`
**Files:** new `src/lib/lineAnchors.ts` (+ test), `src/canvas/Engine.ts`.
**Do**
1. `lineAnchors.ts` (code in Appendix A.6): `edgePoint(box, toward, gap)` and `clipSegmentToBoxes(a, b, gap)` (returns `null` when the boxes overlap so much that the clipped segment would point backwards), `distanceToSegment(p, a, b)`.
2. `drawConnectionLines()`: build each card's **screen** box (`worldToScreen` of its top-left, `w * zoom`, `h * zoom`), call `clipSegmentToBoxes(fromBox, toBox, LINE_GAP_PX = 6)`, skip the pair if `null`, then apply the existing parallel offsets to both clipped ends.
3. `drawHubs()`: the item end of each edge is `edgePoint(memberBox, hubPos, 6)`; the hub end stops at the star: `hubPos - unit(dir) * (HUB_STAR_RADIUS_PX + 2)`.
4. Lines stay in the overlay layer (above cards); clipping is what keeps them off the pictures.
**Tests:** side by side → right edge to left edge; above/below → bottom to top; diagonal; overlapping → `null`; a zero-size box (a hub) → its centre plus the gap. Screenshot and compare with `docs/patch-1/mock-lines.png`.

### B5 · Urbanist typography `[ ]`
**Files:** new `src/design/fonts.css`; `src/design/global.css`, `tokens.css`, `tokens.ts`; `src/canvas/Engine.ts`, `src/canvas/CanvasView.tsx`; `src/lib/fontRender.ts`; `src/canvas/ZoomMenu.tsx`, `src/features/import/ImportProgressCard.tsx`, `src/features/search/SearchBar.tsx`; `package.json`/`pnpm-lock.yaml`; `README.md`; `docs/IMPLEMENTATION_PLAN.md` §3.2.

The font files are already in the repo: `src/design/fonts/urbanist/Urbanist-VariableFont_wght.ttf`,
`Urbanist-Italic-VariableFont_wght.ttf` and `OFL.txt` (SIL Open Font License; keep it next to the fonts).

**Do**
1. `fonts.css`: two `@font-face` rules, family `'Urbanist'`, `font-weight: 100 900`, `font-display: block`, `src: url('./fonts/urbanist/…ttf') format('truetype')`, one `normal`, one `italic`.
2. `global.css`: replace the four `@fontsource…` imports with `@import './fonts.css';`. `body { font-weight: 500; }`. Headings / `.font-display`: `font-weight: 700; letter-spacing: -0.01em`. Remove `font-feature-settings: 'tnum' 1` (Urbanist has no tabular figures; checked with fontkit).
3. `tokens.css`: `--font-ui` and `--font-display` = `'Urbanist', system-ui, sans-serif`. Sizes: `--text-xs: 13px; --text-sm: 14px; --text-md: 15px; --text-lg: 17px; --text-xl: 21px; --text-2xl: 30px` (Urbanist's x-height is ~7 % smaller than Manrope's; this was checked in screenshots, `docs/patch-1/type-urbanist.png`).
4. `tokens.ts`: `export const fonts = { ui: 'Urbanist' } as const;`. In `Engine.ts` add one helper `uiTextStyle(overrides)` returning `{ fontFamily: fonts.ui, fontWeight: '500', ...overrides }` and use it for **every** `new Text(` (note label, corner badge, frame title, hub labels, Unclassified label). `grep -n "new Text(" src/canvas` must show no style without it.
5. `CanvasView`: before `engine.mount`, `await Promise.all(['500','600','700'].map((w) => document.fonts.load(\`${w} 16px Urbanist\`)))` inside try/catch. Pixi rasterises text once; if the font isn't loaded yet it keeps the fallback.
6. `fontRender.ts`: the family-name line of the specimen uses `600 ${size}px Urbanist` instead of `sans-serif`.
7. Numbers that change while you watch (zoom %, "Adding 37 of 120", "124 of 3,210") get `min-width` in `ch` and `text-align: center` so they don't jiggle without tabular figures.
8. `pnpm remove @fontsource-variable/manrope @fontsource/unbounded`; `grep -rn "Manrope\|Unbounded\|fontsource" src` must then find nothing. Leave `tests/e2e/fixtures/sample.woff2` and `smoke-m5-font.spec.ts` alone: that test font happens to be Unbounded and the test expects its name.
9. Update plan §3.2 Typography, the README credits (Urbanist, OFL), and DECISIONS.
**Done when:** screenshots of the map, Details, Settings and `/design` all use Urbanist; canvas labels too.

### B6 · A right-click menu that fits what you clicked `[ ]`
**Files:** new `src/canvas/contextMenuItems.ts` (+ test), `src/canvas/ContextMenu.tsx`.
**Do:** `contextMenuItemIds(items: Item[], ctx: { onBoard: boolean; platformKind })` returns the ids to show, in today's order:
copy-image only for exactly one image; show-in-explorer only when every item has a `filePath`; tidy-up only for 2+; connect-to only for exactly 1; back-to-inbox only when all are media kinds (image/video/pdf/font/link); extract-palette only when at least one item has a `palette`; create-board, remove-from-board (on a board) and move-to-trash always. Later phases add their own ids here. `ContextMenu.tsx` maps ids to the existing actions.
**Tests:** one case per rule.

### B7 · New notes, swatches and frames land in free space `[ ]`
**Files:** `src/features/import/importItems.ts` (export `makeIsOccupied` and `currentPlacementSnapshot`), `src/features/import/AddMenu.tsx`.
**Do:** in `handleAddNote/Swatch/Frame`, compute `findFreeSpot(viewportCentre, size, makeIsOccupied(currentPlacementSnapshot()))` (from `src/lib/packing.ts`) and create the item centred on that spot. Sizes: note 280×212 (D1's new default), swatch 160×160, frame = its current default. Double-click on empty canvas still creates the note exactly where you clicked.

**Phase B Owner checks:** full screen and F11; the new icons and tooltips (hover them); names under items on hover;
connection lines stop at the edges; everything in Urbanist; right-click a note (no "Copy image");
add three notes in a row from the + menu (they don't stack).

---

## 5. Phase C: palettes

Look: `docs/patch-1/mock-palettes.png`. Size: L. Version at the end: **0.4.0**.

**Model in one sentence:** a palette is the existing `swatch` item with a list of colours. One colour is drawn as a swatch; two or more are drawn as a palette card with two columns of rounded squares that move together.

### C0 · Migration 002 and a backup before migrating `[ ]`
**Files:** new `src/db/migrations/002_patch1.sql`, `src/db/migrator.ts` (+ test), `src/platform/bootstrap.ts`, `src/db/rowMapping.ts` (+ test), `src/state/types.ts`.
**Do**
1. `002_patch1.sql` (exactly):
   ```sql
   -- 002_patch1.sql — Patch 1 (docs/PATCH_1_PLAN.md): palettes, long descriptions, thumbnail versions.
   -- Never edit this file after it ships; add 003_… instead (§5.3).
   ALTER TABLE items ADD COLUMN swatch_colors TEXT;                -- swatch/palette: JSON [{"hex":"#RRGGBB","name":"…"}]
   ALTER TABLE items ADD COLUMN description TEXT;                  -- TipTap JSON (same format as a note's body)
   ALTER TABLE items ADD COLUMN description_text TEXT;             -- plain text of `description`, for search
   ALTER TABLE items ADD COLUMN thumb_v INTEGER NOT NULL DEFAULT 0; -- +1 every time t128/t512 are rewritten (F1)
   ```
2. `migrator.ts`: import it (`?raw`), add `{ version: 2, name: 'patch1', sql: migration002 }`; export `readSchemaVersion(db)` (today's private `currentVersion`) and `LATEST_SCHEMA_VERSION`.
3. `bootstrap.ts` → `ensureLibraryReady`: before `runMigrations`, if `platform.kind === 'tauri'` and `0 < from < LATEST_SCHEMA_VERSION`, call `platform.backups.now()`. If the backup fails, log an error and continue (this migration only adds columns). Comment why, and say a future destructive migration must stop instead.
4. Types and mapping: `Item` gets optional `swatchColors?: SwatchColor[] | null`, `description?: unknown`, `descriptionText?: string | null`, `thumbV?: number`; `rowToItem` maps `swatch_colors` (JSON), `description` (JSON), `description_text`, `thumb_v` (number, default 0).
**Tests:** migrations stay ordered with no gaps; `splitStatements(002)` gives 4 statements; `rowToItem` maps the new columns.

### C1 · Palette maths (pure) `[ ]`
**File:** new `src/lib/palette.ts` (+ test). Constants in `tokens.ts` → `paletteGeometry = { cell: 96, gap: 8, pad: 8, cellRadius: 12, cardRadius: 20, singleSize: 160, singleRadius: 16, labelMinCellPx: 72 }`.
- `SwatchColor = { hex: string; name?: string }`.
- `normalizeHex(input)`: accepts `#abc`, `abc`, `#aabbcc`, `AABBCC` → `#AABBCC`, else `null`.
- `swatchColorsOf(item)`: `item.swatchColors` if non-empty, else `[{ hex: item.color }]` if `item.color`, else `[{ hex: '#8C8C8C' }]` (old swatches keep working).
- `paletteCardSize(n)`: n ≤ 1 → 160×160; else `w = pad*2 + cell*2 + gap` (216), `h = pad*2 + rows*cell + (rows-1)*gap`, `rows = ceil(n/2)`.
- `paletteCells(n, card)`: world rects, row-major, 2 columns (a single colour fills the card).
- `paletteCellAt(n, card, point)`: index or `null`.
- `paletteEntriesOf(colors)`: `[{ hex, weight: 1/n }]`; `colorFamiliesOf(colors)`: unique `colorFamily(hex)` from `src/lib/color.ts`. These make palettes join the Color filter and the Color connection criterion.
- `hexToHsv(hex)` / `hsvToHex(h, s, v)` with culori (`converter('hsv')`, `formatHex({ mode: 'hsv', h, s, v })`; culori leaves `h` undefined for greys: use 0). `h` in degrees 0–360, `s`, `v` in 0–1.
**Tests:** every function, including round trips (`hsvToHex(hexToHsv(x)) === x` within 1 step per channel) and odd counts.

### C2 · Palette commands `[ ]`
**File:** new `src/commands/paletteCommands.ts` (+ test); `src/commands/swatchCommands.ts`.
- `createSetSwatchColorsCommand(platform, itemId, next: SwatchColor[])`: do/undo between previous and next colours. Each apply updates, in the store and in one `db.batch`: `swatch_colors` (JSON), `color` (first hex), `palette` (`paletteEntriesOf`), `color_families`, and **every placement's** `w,h` = `paletteCardSize(n)` (`UPDATE placements SET w = ?, h = ? WHERE item_id = ?`; also the current-board placement in the store). Keep `x,y`.
- `createCreatePaletteCommand(platform, boardId, isLibraryBoard, centreX, centreY, colors, name)`: generalises today's swatch creation (same insert, plus the new column and the right size). Keep `createCreateSwatchCommand` as a wrapper (one `#8C8C8C` colour).
- `createCombineIntoPaletteCommand(platform, itemIds)`: colours of the selected swatches in reading order (sort by `y`, rows within 40 world units, then `x`); one new palette at the selection's top-left; the old swatches go to the Trash; one undo step.
- `createExtractPaletteCommand`: now creates **one** palette (5–8 colours, unchanged ranking), named `en.palettes.fromItems(n)`, placed 48 units right of the selection's bounds.
**Tests:** do → undo restores the exact previous state for each command (pattern: `swatchCommands.test.ts`).

### C3 · Palette cards on the map `[ ]`
**Files:** new `src/canvas/decor/paletteDecor.ts`, `src/canvas/Engine.ts`, `src/canvas/itemCards.ts`, `src/canvas/useEngineBindings.ts`.
**Do**
1. `ItemCard` gets `swatchColors: string[] | null` (hex list, swatches only) and `swatchName: string | null`.
2. Engine: `private decor = new Map<string, Container>()` for kinds that draw themselves (`swatch` now, `note` in D1). For those kinds the sprite is never shown (`visible = renderable = false` always, including in `cullItems`); the decor follows the card: same `zIndex`, culled with it, alpha via `forEachCardVisual`, redrawn on create/move/resize/colour change/tween and when zoom crosses `labelMinCellPx`.
3. `paletteDecor.ts` → `drawPalette(container, card, zoom)`:
   - one colour: `roundRect(x, y, 160, 160, 16)` filled with the colour; hex label bottom-left inside (Urbanist 700, 14 world units, `readableTextColor`).
   - several: container `roundRect(x, y, w, h, 20)` fill white α 0.04, stroke white α 0.08 width `1/zoom`; each cell `roundRect(…, 12)` filled; hex labels bottom-left inside each cell (Urbanist 700, 12 world units), only when `cell * zoom ≥ 72`.
   - the name (when set) above the card: Urbanist 600, 16 world units, `text-1`, 22 units above.
4. No resize handles for swatch cards (they size themselves). Remove swatches from `syncNoteLabel`.
   Export: `forceVisibleForExport` must show the **decor** of these cards and keep their sprites hidden, or every exported palette (and, after D1, note) gets a flat rectangle drawn under it.
5. Copy one colour: when a **selected** palette is clicked on a cell (pointer-up without moving), emit `swatchCellClick(id, index)`; `useEngineBindings` copies that hex and shows `en.swatches.copied(hex)`. Selecting a single swatch still copies its hex, as today.
**Done when:** screenshot matches `mock-palettes.png` (left and middle).

### C4 · The palette editor `[ ]`
**Files:** new `src/features/palettes/PaletteEditor.tsx`, `ColorWheel.tsx`, `colorWheelMath.ts` (+ test), `src/features/details/DetailsPanel.tsx`, `src/canvas/useFocusViewBinding.ts` (or a new small binding), `src/i18n/en.ts`.
Lives in the right panel's Details tab when one swatch/palette is selected (Q7). For swatches, Details shows **only** the editor (no Type/Vibe/Movement/Tags/Artist/Source/Why).
1. Name field (= the item title, `createSetItemFieldCommand(..., 'title', …)`).
2. Colour grid: 2 columns, cells 52 px high, radius 12, hex label; click selects (cream outline); **drag to reorder** with HTML5 drag and drop (`draggable`, `onDragStart` stores the index, `onDragOver` `preventDefault`, `onDrop` commits the reordered list with `createSetSwatchColorsCommand`). A dashed "+ Add color" cell appends a copy of the selected colour and selects it.
3. `ColorWheel` (120 px): a `<canvas>` painted pixel by pixel in exact HSV with `paintWheel` from `colorWheelMath.ts` (Appendix A.8, which also has `hsvToRgb`, `wheelPoint` and `wheelHueSat`; unit-test them: primaries, a grey, and point→(h,s) round trips): angle = hue (0° at 3 o'clock, counter-clockwise), distance from the centre = saturation, at the current value. A white knob shows the selection. Pointer drag with capture changes hue+saturation **live in local state**; commit one command on pointer-up.
4. A vertical Value slider next to it, then three rows H (0–360), S (0–100), V (0–100) with the existing `<Slider>` and the numbers. Same live-then-commit rule.
5. Hex field: commit on Enter/blur through `normalizeHex`; invalid input turns the field's outline `danger` and doesn't commit.
6. Buttons: **"Pick from a photo"**: the canvas enters pick mode (crosshair, `Esc` cancels; add `engine.startPointPick(cb)` modelled on `startConnectPick`); the next click on an image/video/PDF/link card returns the card id and the click position inside it (`u, v` in 0–1); load that card's `t512` thumbnail (`fetch` → `createImageBitmap` → `OffscreenCanvas` → `getImageData`) and add the colour at `(u, v)` to the palette. **"Eyedropper"**: only shown when `'EyeDropper' in window`; `new EyeDropper().open()` → `sRGBHex`. **"Remove"** (disabled with one colour). **"Copy all"** copies the hex codes, one per line.
7. Double-click a swatch/palette on the map: open the right panel if closed and switch it to Details (don't open Focus view).
8. Add menu: keep "Swatch" (Q: "it could still be in the menu swatches"); a new swatch is selected right away so the editor shows.
**Done when:** screenshot matches `mock-palettes.png` (right, adapted to the 288 px panel width); every change is one undo step.

### C5 · Combining swatches, and menus `[ ]`
**Files:** `src/canvas/contextMenuItems.ts`, `ContextMenu.tsx`, `src/i18n/en.ts`.
- Right-click with 2+ swatches/palettes selected: "Combine into palette" (C2). With one: "Edit palette" (opens Details) and "Copy all colors".
- "Extract palette" on photos creates one palette (C2).
- Optional (only if everything else is done): dragging a single swatch onto a palette and releasing adds its colour to that palette and trashes the swatch (one undo step); highlight the target palette while hovering it during the drag.

**Phase C Owner checks:** + → Swatch, then build a palette with the wheel, the hex field and "Pick from a photo";
drag colours to reorder; move the palette (it moves as one card); right-click a photo → Extract palette;
select three old swatches → Combine into palette; Ctrl+Z after each step.

---

## 6. Phase D: notebook notes and #actions

Look: `docs/patch-1/mock-notes.png`. Size: M. Version at the end: **0.5.0**.

### D1 · Notes look like ruled paper on the map `[ ]`
**Files:** new `src/canvas/decor/noteDecor.ts`, new `src/lib/noteTagged.ts` (+ test), `src/design/tokens.ts`/`.css`, `src/canvas/Engine.ts`, `src/canvas/itemCards.ts`, `src/commands/noteCommands.ts`.
**Do**
1. Tokens: `noteGeometry = { pad: 16, fontSize: 18, lineHeight: 30, radius: 10, fold: 22, defaultW: 280, defaultH: 212 }` (212 = 2×16 + 6 lines of 30). New default note size 280×212 in `noteCommands.ts` (existing notes keep their size).
2. Note colours: add **`ink: #3A2546`** (dark) to `noteColors` (+ CSS var). Per colour, in tokens: text colour (`ink` → `text-1`, others → `canvas`), rule colour + alpha (cream white 0.95; blush, sky, lavender white 0.6; sage white 0.55; ink white 0.16), fold colour (a darker tint of the paper) and hashtag colour (every light paper `#4B2580`, ink `#F2C27A`: at least 5.1:1 contrast on each paper, checked). Default colour: Q4.
3. `noteDecor.ts` → `drawNotePaper(g, card, color)`: the paper with the **top-right corner cut** (path in Appendix A.9), the fold triangle in the fold colour, then ruled lines every 30 units from `y + pad + 30` down to `y + h - pad/2`, from `x + pad` to `x + w - pad`, width 1 world unit.
4. The text: Pixi `Text` with `uiTextStyle({ fontSize: 18, lineHeight: 30, fill: textColor, wordWrap: true, wordWrapWidth: w - 2*pad, breakWords: true, tagStyles: { b: { fontWeight: '700' }, i: { fontStyle: 'italic' }, dshash: { fill: hashtagColour, fontWeight: '700' } } })` at `(x + pad, y + pad)`, **masked** by a rect the size of the paper so long text never spills out. Keep the text in `noteLabels` (zIndex `card.z + 0.5`, above the paper); put the paper Graphics **and** the mask Graphics in the note's decor container (zIndex `card.z`), and set `label.mask = maskGraphics`.
5. `noteTagged.ts` → `noteBodyToTaggedText(body)`: TipTap JSON → text with `<b>`/`<i>` around bold/italic marks, headings as `<b>…</b>` lines, bullet items prefixed `• `, numbered items `1. `, `2. `, … in order, and every hashtag (regex in Appendix A.10) wrapped in `<dshash>…</dshash>`. `ItemCard.noteText` for notes becomes this tagged text. (Pixi only parses tags that exist in `tagStyles`; anything else stays literal.)
6. Text sharpness when zoomed in: on camera change (debounced 150 ms) set `resolution = devicePixelRatio × step` on every world-space `Text` (step 1 at zoom ≤ 1, 2 up to 2, else 4).
**Tests:** `noteBodyToTaggedText` (paragraphs, heading, bold, italic, lists, hashtags, empty body, malformed body → `''`).

### D2 · The note editor matches the paper exactly `[ ]`
**Files:** `src/features/notes/NoteEditor.tsx`, `src/design/components/components.css` (or a new `notes.css`), new `src/lib/tiptap/hashtagDecorations.ts`, `src/lib/noteText.ts`, `package.json`.
**Do**
1. `pnpm add @tiptap/pm@3.31.3` (same version as `@tiptap/core`; it is installed but not importable under pnpm without this).
2. Editor box laid out in **world units** and scaled: `left/top` = the card's screen rect, `width/height` = the card's world size, `transform: scale(zoom)`, `transform-origin: 0 0`. Padding 16, font `500 18px/30px Urbanist`, colours from the note colour; ruled lines with the CSS in `docs/patch-1/mockups.html` (`.note`, two background layers, `background-attachment: local`); folded corner with `::before`. Paragraph margins 0; headings 18px/30px bold; lists `padding-left: 22px`, no margins. Result: opening a note doesn't move a single letter.
3. The colour dots move **outside** the paper: a small floating pill 8 px above the note's top edge (not scaled).
4. `hashtagDecorations.ts`: a TipTap `Extension` with a ProseMirror plugin (`@tiptap/pm/state` `Plugin`, `@tiptap/pm/view` `Decoration`, `DecorationSet`) that adds `Decoration.inline(from, to, { class: 'ds-hashtag' })` for every hashtag in text nodes (same regex). `.ds-hashtag` = bold + the hashtag colour, **no** background or padding (so it matches the canvas). Add it to `noteExtensions`.
5. When the editor closes, grow the note if the text needs more room: `needed = ceil((contentScrollHeight - 2*pad) / 30) * 30 + 2*pad`; if `needed > h`, the save command also sets the placement height (undo restores it). Never shrink automatically.

### D3 · Notes are not "media": no classification `[ ]`
**Files:** `src/app/Shell.tsx`, new `src/features/notes/NoteDetails.tsx`, `src/features/details/DetailsPanel.tsx`, `BulkDetailsPanel.tsx`, `src/canvas/contextMenuItems.ts`.
- Selecting only notes no longer switches the panel to Details (the selection effect checks `[...selection].some(id => kind !== 'note')` using `getState()`).
- If the Details tab is open on one note, show `NoteDetails`: the colour dots, an "Edit note" button, and the note's #actions as chips. No Type/Vibe/Movement/Tags/Artist/Source/Why.
- Bulk edits (Type, Vibe, Movement, Tags, Artist) apply only to media kinds (image, video, pdf, font, link); show "2 notes and 1 palette aren't classified" when the selection has others.
- Right-click on a note: "Edit note", note colours, Bring to front / Send to back, Move to Trash.

### D4 · #actions `[ ]`
**Files:** new `src/lib/hashtags.ts` (+ test), new `src/features/actions/useActions.ts`, `ActionsPanel.tsx`, `src/app/Shell.tsx`, `src/state/uiStore.ts` (`panelTab` gains `'actions'`), `src/i18n/en.ts`.
**Do**
1. `hashtags.ts`: `HASHTAG_RE` (Appendix A.10), `extractHashtags(text): string[]` (lower-cased, unique, in order of appearance) and `hashtagLines(text): { tag: string; line: string }[]` (the line of text each hashtag sits in, trimmed, max 160 chars).
2. `useActions()`: from the library store, for every non-deleted note (`bodyText`) and, from Phase E, every item with `descriptionText`, collect `{ tag, itemId, line, kind }`; memoised on `items`. Group by tag (most recent item first inside a group; groups A–Z).
3. Right panel: a third tab **"Actions"** with a count (Q5). Each group: `#tag (3)`, collapsible; each row: the line (2-line clamp) and where it lives ("Note" or the item title, and the board name if it's not the current space). Click a row: switch space if needed (`switchSpace`), select the item and fly to it. Hover a row: highlight the item on the map (`setHoverHighlight(new Set([id]))`, cleared on leave; the A8 rules prevent it sticking).
4. Empty state: `en.actions.empty` ("Write #something in a note, like #dig-into, and it shows up here.").
5. Search: notes are already searched by their text. Check that typing `dig-into` finds them; if MiniSearch drops `#`, nothing else to do.
**Tests:** `hashtags.test.ts`: `#dig-into`, `#rêve` (accents), `#to_do`, `#2026`, start of line, after `(`; **not** inside URLs (`site.com/#top`), not `##`, not a lone `#`; duplicates collapse; case-insensitive.

**Phase D Owner checks:** notes look like ruled paper with a folded corner; editing a note doesn't jump;
write `#dig-into` in two notes and open the Actions tab; click an action to fly to its note; selecting a
note no longer opens Details; try the dark Ink colour.

---

## 7. Phase E: descriptions and the thought bubble

Look: `docs/patch-1/mock-bubble.png`. Size: M. Version at the end: **0.6.0**.

### E1 · A long description on every media item `[ ]`
**Files:** new `src/commands/descriptionCommands.ts` (+ test), `src/lib/search.ts` (+ test).
- `createSetDescriptionCommand(platform, itemId, json, text)`: do/undo; writes `description` (JSON) and `description_text` in one `db.execute` and the store.
- Search: add a `description` field to the MiniSearch index (`fields`, the document mapping from `item.descriptionText ?? ''`, boost 1). Update the search tests (an item found by a word that is only in its description).

### E2 · The thought bubble on hover `[ ]`
**Files:** new `src/design/icons/ThoughtBubble.tsx`, `src/canvas/CanvasHoverOverlay.tsx` (from B3), new `src/state/descriptionStore.ts`.
**Do**
1. `ThoughtBubble` icon: 24×24, stroke 1.75, round caps, like Lucide. Paths from the mockup: a cloud `M8.5 15.5h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.4 7.1 4.25 4.25 0 0 0 8.5 15.5Z`, two trailing circles `(5.2, 18.6, r 1.5)` and `(2.6, 21.6, r 0.9)` toward the bottom-left (toward the photo's corner); prop `filled` adds three dots (r 0.5, filled) at `(10.6, 11.6)`, `(13.4, 11.6)`, `(16.2, 11.6)` = "has a description".
2. In `CanvasHoverOverlay`, for image/video/pdf/font/link cards whose screen rect is at least 48×48: a round 34 px button (surface-1, float shadow) with the icon, **6 px right of the card's right edge and 26 px above its top** ("a little space next to the top-right corner"); if that would leave the window, put it inside the card's top-right corner (6 px in). `aria-label` = `en.description.open`.
3. It shows while the card is hovered, while the bubble itself is hovered, for 400 ms after leaving either (so you can travel from the photo to the bubble), and always while that item's description panel is open (then with an accent ring).
4. Click → `descriptionStore.open(itemId)`; clicking again closes it.
5. Test hooks: the bubble has `data-testid="thought-bubble"` and `data-has-description="true|false"`; the panel has `data-testid="description-panel"`.

### E3 · The description panel `[ ]`
**Files:** new `src/features/description/DescriptionPanel.tsx`, `src/app/Shell.tsx`.
- Anchored to the item: `left = right edge + 12`, `top = card top`, **height = the card's on-screen height** clamped to 240 … (window height − 32), width `fit-content` with `min-width: 320px; max-width: 480px` (Q: "a minimum width so everything shows similarly"). If there's no room on the right, open on the left. Re-position every frame while open (like `NoteEditor`); hide (not close) while the item is off screen.
- Content: the item title (bold 17), the description editor (TipTap with `noteExtensions` incl. hashtag decorations, placeholder `en.description.placeholder` "What do you see? Why does it matter?"), scrolling inside; under a hairline, read-only chips for Type, Vibes, Movement, Tags (criterion colour dots), and an "Edit details" button that selects the item and opens Details.
- Saves one `createSetDescriptionCommand` per editing session (on close or blur). Closes on Esc, the × button, a click outside (not on the bubble), or the bubble.
- Style: surface-1, radius 20, float shadow, padding 18 (mockup).
**Test:** e2e `patch1-description.spec.ts`: hover demo item 0 (`cx + 160, cy + 173`, see A8), click `getByTestId('thought-bubble')`, type text, press Esc; hover again: `data-has-description` is `"true"`; reload; the text is still there; searching a word from it finds the item.

### E4 · Description in Details and the menus `[ ]`
- Details panel (media kinds): a "Description" field showing the first 4 lines (or "Add a description…") and an "Open" button (flies to the item if needed, then opens the panel).
- Right-click on a media item: "Add description" / "Edit description".
- Hashtags in descriptions appear in the Actions tab (D4 step 2).

**Phase E Owner checks:** hover a photo, click the bubble, write a few lines with a #tag; close and reopen;
find the photo by a word from the description; see the #tag in Actions.

---

## 8. Phase F: fonts on the map

Size: S. Version at the end: **0.7.0**.

### F1 · Thumbnails get a version (no more stale pictures) `[ ]`
**Files:** `src/platform/types.ts`, `TauriPlatform.ts`, `BrowserPlatform.ts`, new `src/lib/thumbs.ts`, the ten `cache.url(` call sites (`grep -rn "cache.url(" src`), the four ingest queues (and PDF "Set as cover").
- `cache.url(key, version = 0)`: Tauri appends `?v=<version>` when `version > 0` (the Rust protocol ignores the query); the browser ignores it (its blob URLs are replaced on every `put`).
- `thumbUrl(platform, item, 128 | 512)` = `platform.cache.url(\`t${size}/${item.id}\`, item.thumbV ?? 0)`; use it everywhere a thumbnail URL is built (not in `aiQueue.ts`).
- Every write of `t128`/`t512` for an item also runs `thumb_v = thumb_v + 1` in the same `UPDATE` and bumps `thumbV` in the store.
- Because A3's texture keys contain the URL, the canvas reloads changed thumbnails by itself.

### F2 · A preview text for all font cards `[ ]`
**Files:** `src/state/settingsStore.ts`, `src/state/loadSettings.ts`, `src/lib/fontRender.ts` (+ test for the wrapping helper), `src/workers/fontIngestQueue.ts`, `src/features/focus/FontFocusViewer.tsx`, `src/features/settings/CanvasSection.tsx`.
- Library setting `fontPreviewText` (in `meta.settings`, default `en.fonts.defaultPreview` = "Sphinx of black quartz, judge my vow", Q12).
- `drawSpecimen(…, previewText)`: the sample wraps onto at most 2 lines with an ellipsis (`wrapLines(measure, text, maxWidth, maxLines)`, unit-tested with a fake `measure`), instead of being squeezed by `fillText`'s `maxWidth`.
- `rerenderFontSpecimens(platform)`: queues every font item again; each one bumps `thumb_v` (F1), so cards update one by one.
- Edit it in Settings → Canvas ("Font preview text", commit on Enter/blur) and in the type tester: its sample field starts with the preview text, and a button "Show this text on all font cards" saves it and re-renders.

**Phase F Owner checks:** type your brand name as the font preview text; every font card shows it in its own font; the type tester still lets you change size, weight axes and text.

---

## 9. Phase G: minimap with connections and the Overview

Look: `docs/patch-1/mock-maps.png`. Size: L. Version at the end: **0.8.0**.

### G1 · A minimap that shows connections `[ ]`
**Files:** `src/canvas/Minimap.tsx`, new `src/canvas/minimapDraw.ts` (+ test for the maths), `src/canvas/Engine.ts` (a `connectionsChanged` event emitted from `setConnections`), `src/design/tokens.*`.
- Replace the `<div>` dots (one DOM node per item) with one DPR-aware `<canvas>`, 240×160.
- Draw, coalesced to one `requestAnimationFrame` per change: every placement as a rect with its real shape and its card colour (min 2 px), My connections (white, α 0.9), the current hover/selection lines (criterion colours, from the new engine event), then the viewport rectangle (accent).
- Keep click/drag to navigate. New: an expand button (`Maximize2`, 28 px, top-right corner) and **double-click** → open the Overview.

### G2 · The Overview `[ ]`
**Files:** new `src/features/overview/` (`overviewStore.ts`, `overviewModel.ts` + test, `overviewCamera.ts` + test, `OverviewCanvas.tsx`, `OverviewOverlay.tsx`), `src/app/Shell.tsx`, `src/app/useGlobalShortcuts.ts` (`O`), shortcut list.
- A full-window layer (above the map, below dialogs), dark background (`canvas-edge`), with: a segmented control at the top (**My layout** | Clusters) · (**Thumbnails** | Dots); a close button (top-right); a legend of the active criteria (bottom-left); a hint "Double-click an item to go to it · Esc to close" (bottom-right).
- `overviewModel.ts` (pure): nodes = the current space's placements (centres) and the items' colours/thumb URLs; edges = hubs from `computeHubs(visibleIds, activeCriteria, index)` for term and colour criteria (capped at 5,000 like Show all; above it, draw only My connections and show `en.overview.tooLong`), plus direct item-to-item lines for My connections and Similar look.
- Layout "My layout" uses real positions. "Clusters" reuses the Constellations worker (`runConstellationLayout`) with the active criteria (show "Arranging…" while it runs; cache the result until items or criteria change).
- `OverviewCanvas` (canvas 2D, its own camera: fit on open, wheel/pinch zoom, drag to pan): edges first (α 0.35, criterion colours; manual white α 0.9), then nodes at a **fixed screen size** (thumbnails: long side 16 px from `t128`, loaded lazily into an `ImageBitmap` cache of at most 2,000; until loaded, a rounded rect in the card colour; dots: radius 4), then hubs (star + uppercase label). Hover (nearest node within 10 px): that node grows to 40 px, shows its name, its edges go to α 0.9, other nodes to α 0.25.
- **Double-click a node** → close the Overview, select the item, fly the real camera to it. Esc or × → close, camera untouched.
- Open with: the minimap's expand button or double-click, or `O`.
**Tests:** `overviewModel` (node/edge building, the cap, and a pure `nodeAt(screenNodes, x, y, radius = 10)` that picks the nearest node, used for hover and double-click), `overviewCamera` (fit, zoom at a point, screen↔world). e2e `patch1-overview.spec.ts` on `/?seed=demo`: `O` opens the overlay (`data-testid="overview"`), the pixel at its centre region is not the plain background (nodes are drawn), Esc closes it.

**Phase G Owner checks:** hover a tagged photo and watch its lines on the minimap; double-click the minimap;
look at your whole library in the Overview, switch to Clusters, double-click a thumbnail to jump to it.

---

## 10. Finishing a phase
- Every task ticked here; `docs/DECISIONS.md` has a "Patch 1 · Phase X" entry (what changed, deviations, what couldn't be verified without Windows).
- Bump the version in **three** places: `package.json`, `src-tauri/tauri.conf.json`, root `Cargo.toml` (`[workspace.package]`).
- All checks of §2.2 and the full e2e suite green; screenshots compared with `docs/patch-1/`.
- Push the phase branch and open a PR. CI must be green. The Windows installer is built by `windows-build` on `main` (after the owner merges) or by running that workflow manually on the branch (`workflow_dispatch`).
- Send the owner the phase's Owner checks in plain language, with where to download the installer.

## 11. Later (not in Patch 1)
Rounded corners and the soft card shadow for photos on the map (plan §3.4; needs a performance spike),
"Always show names", ticking actions off, a `#` autocomplete menu in notes, link cards with a title footer,
the floating selection toolbar from plan §2.1, video "Set cover frame", saved filters.

---

## 12. Kick-off prompts
Phase A (first conversation):
```text
Continue Designspace with Patch 1, Phase A, from docs/PATCH_1_PLAN.md.
Read CLAUDE.md, then docs/PATCH_1_PLAN.md in full, then docs/DECISIONS.md, before writing code.
Do the Phase A tasks in order, one commit per task, running the checks in §2.2 after each.
Log deviations in docs/DECISIONS.md. When the phase is done: tick its tasks in the plan, make sure
CI is green, push, open a PR, and send me the Phase A Owner checks in plain language.
```
Later phases (one new conversation each, after the previous phase is merged):
```text
Continue Designspace with Patch 1, Phase <X>, from docs/PATCH_1_PLAN.md.
Read CLAUDE.md, docs/PATCH_1_PLAN.md and the latest Patch 1 entries in docs/DECISIONS.md first.
Same rules as before.
```

---

## Appendix A: reference code
These are reference implementations for the tricky parts. Copy them, keep the names, adapt imports.

### A.1 `tests/e2e/helpers/pixels.ts`
```ts
import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/** Reads one screen pixel (CSS px) by screenshotting a 1×1 clip and decoding that PNG. For a
 * single pixel every PNG row filter predicts 0, so the inflated bytes are [filter, r, g, b, a]. */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

export function near(a: [number, number, number], b: [number, number, number], tol: number): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

export async function waitForPixel(
  page: Page,
  x: number,
  y: number,
  test: (rgb: [number, number, number]) => boolean,
  timeoutMs = 30_000,
): Promise<[number, number, number]> {
  const start = Date.now();
  let last = await pixelAt(page, x, y);
  while (!test(last)) {
    if (Date.now() - start > timeoutMs) throw new Error(`pixel at ${x},${y} stayed ${last}`);
    await page.waitForTimeout(500);
    last = await pixelAt(page, x, y);
  }
  return last;
}
```

### A.2 `crates/designspace-core/src/media_url.rs`
```rust
//! Parses `media://` request paths (§4.4). Tauri's `convertFileSrc` runs `encodeURIComponent` over
//! the whole argument, so on Windows `original/media/2026/10/x.jpg` arrives as
//! `/original%2Fmedia%2F2026%2F10%2Fx.jpg`: decode first, then split. Path safety (`..`, absolute
//! paths, symlinks) stays in `path_safety::resolve_existing`, which must run on the decoded `rel`.

use percent_encoding::percent_decode_str;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaRoot {
    Original,
    Cache,
    Models,
}

#[derive(Debug, PartialEq, Eq)]
pub struct MediaRequest {
    pub root: MediaRoot,
    pub rel: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MediaUrlError {
    #[error("the path is not valid UTF-8 once decoded")]
    InvalidUtf8,
    #[error("the path has no root/relative part")]
    BadPath,
    #[error("unknown media root")]
    UnknownRoot,
}

pub fn parse_media_path(raw_path: &str) -> Result<MediaRequest, MediaUrlError> {
    let decoded = percent_decode_str(raw_path)
        .decode_utf8()
        .map_err(|_| MediaUrlError::InvalidUtf8)?;
    let trimmed = decoded.trim_start_matches('/');
    let (root, rel) = trimmed.split_once('/').ok_or(MediaUrlError::BadPath)?;
    if rel.is_empty() {
        return Err(MediaUrlError::BadPath);
    }
    let root = match root {
        "original" => MediaRoot::Original,
        "cache" => MediaRoot::Cache,
        "models" => MediaRoot::Models,
        _ => return Err(MediaUrlError::UnknownRoot),
    };
    Ok(MediaRequest {
        root,
        rel: rel.to_string(),
    })
}

/// Cache keys are opaque strings (often containing `/`, e.g. `t128/<itemId>`); they're stored as a
/// single flat file name. `cache_put`/`cache_has`/`cache_delete` and the `media://cache/` handler
/// must all use this same function.
pub fn cache_file_name(key: &str) -> String {
    key.replace(['/', '\\'], "_").replace("..", "_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_encoded_slashes_for_originals() {
        let r = parse_media_path("/original%2Fmedia%2F2026%2F10%2Fposter-abc123.jpg").unwrap();
        assert_eq!(r.root, MediaRoot::Original);
        assert_eq!(r.rel, "media/2026/10/poster-abc123.jpg");
    }

    #[test]
    fn decodes_encoded_slashes_for_cache_keys() {
        let r = parse_media_path("/cache%2Ft128%2F01M41C21BPKAHJE5SESAWJQV80").unwrap();
        assert_eq!(r.root, MediaRoot::Cache);
        assert_eq!(cache_file_name(&r.rel), "t128_01M41C21BPKAHJE5SESAWJQV80");
    }

    #[test]
    fn still_accepts_unencoded_paths() {
        let r = parse_media_path("/models/Xenova/clip/config.json").unwrap();
        assert_eq!(r.root, MediaRoot::Models);
        assert_eq!(r.rel, "Xenova/clip/config.json");
    }

    #[test]
    fn decodes_accents_and_spaces() {
        let r = parse_media_path("/original%2Fmedia%2Fr%C3%AAve%20bleu.jpg").unwrap();
        assert_eq!(r.rel, "media/rêve bleu.jpg");
    }

    #[test]
    fn rejects_unknown_roots_and_empty_paths() {
        assert_eq!(
            parse_media_path("/secret%2Fx").unwrap_err(),
            MediaUrlError::UnknownRoot
        );
        assert_eq!(
            parse_media_path("/original").unwrap_err(),
            MediaUrlError::BadPath
        );
        assert_eq!(
            parse_media_path("/original/").unwrap_err(),
            MediaUrlError::BadPath
        );
    }

    #[test]
    fn encoded_parent_dirs_survive_decoding_so_path_safety_can_reject_them() {
        let r = parse_media_path("/original%2F..%2F..%2Fsecret.txt").unwrap();
        assert_eq!(r.rel, "../../secret.txt");
    }

    #[test]
    fn rejects_invalid_utf8() {
        assert_eq!(
            parse_media_path("/original%2F%FF").unwrap_err(),
            MediaUrlError::InvalidUtf8
        );
    }

    #[test]
    fn cache_file_name_flattens_and_neutralises_dots() {
        assert_eq!(cache_file_name("t512/abc"), "t512_abc");
        assert_eq!(cache_file_name("../x"), "__x");
    }
}
```

### A.3 `Engine.requestLod` (A3)
```ts
/** Which texture a card should show right now, or null to keep whatever it shows (far zoom draws
 * the flat colour; no thumbnail yet means the placeholder tint stays). The key contains the URL, so
 * a re-made thumbnail (new URL, see F1) is a new key and gets loaded. */
private desiredTexture(card: ItemCard): { key: string; url: string } | null {
  const longSideScreen = Math.max(card.w, card.h) * this.camera.zoom;
  if (longSideScreen < canvasGeometry.farZoomThresholdPx) return null;
  const wantsT512 = longSideScreen > canvasGeometry.lod.t128Max;
  const url = wantsT512 ? (card.thumbUrl512 ?? card.thumbUrl128) : (card.thumbUrl128 ?? card.thumbUrl512);
  if (!url) return null;
  return { key: `${wantsT512 ? 't512' : 't128'}:${card.id}:${url}`, url };
}

private requestLod(card: ItemCard, sprite: Sprite): void {
  if (!this.textureManager) return;
  const want = this.desiredTexture(card);
  if (!want) return;
  if (this.appliedTexKey.get(card.id) === want.key) {
    this.textureManager.touch(want.key); // keep on-screen textures out of LRU eviction
    return;
  }
  this.appliedTexKey.set(card.id, want.key); // also marks "in flight": no duplicate requests
  void this.textureManager.request(want.key, want.url).then((texture) => {
    if (sprite.destroyed || this.appliedTexKey.get(card.id) !== want.key) return; // superseded
    if (!texture) return; // failed: keep the placeholder; a new URL (re-ingest) retries
    sprite.texture = texture;
    sprite.tint = 0xffffff;
  });
}
```

### A.4 `src/features/import/fitPlacements.ts`
```ts
export const PLACEHOLDER_SIZE = 320; // every import starts as a square until ingest knows its shape

export function fitRect(
  aspect: number,
  size = PLACEHOLDER_SIZE,
): { w: number; h: number; dx: number; dy: number } {
  const w = aspect >= 1 ? size : Math.round(size * aspect);
  const h = aspect >= 1 ? Math.round(size / aspect) : size;
  return { w, h, dx: (size - w) / 2, dy: (size - h) / 2 };
}

/** Derived data, not a command: reshapes every placement of `itemId` that still has the untouched
 * 320×320 import placeholder, keeping it centred where it was. A placement the owner already
 * resized is left alone. */
export async function fitPlacementsToAspect(
  platform: Platform,
  itemId: string,
  aspect: number,
): Promise<void> {
  if (!Number.isFinite(aspect) || aspect <= 0) return;
  const { w, h, dx, dy } = fitRect(aspect);
  if (w === PLACEHOLDER_SIZE && h === PLACEHOLDER_SIZE) return;
  const rows = await platform.db.select<DbRow>(
    'SELECT board_id FROM placements WHERE item_id = ? AND w = ? AND h = ?',
    [itemId, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE],
  );
  if (rows.length === 0) return;
  await platform.db.batch(
    rows.map((r) => ({
      sql: 'UPDATE placements SET x = x + ?, y = y + ?, w = ?, h = ? WHERE board_id = ? AND item_id = ?',
      params: [dx, dy, w, h, r.board_id, itemId],
    })),
  );
  const p = useLibraryStore.getState().placements.get(itemId);
  if (p && p.w === PLACEHOLDER_SIZE && p.h === PLACEHOLDER_SIZE) {
    useLibraryStore.getState().upsertPlacement({ ...p, x: p.x + dx, y: p.y + dy, w, h });
  }
}
```

### A.5 `src/canvas/cardAlpha.ts`
```ts
import { canvasGeometry } from '@/design/tokens';

export interface AlphaInputs {
  hoverHighlight: ReadonlySet<string> | null;
  searchMatches: ReadonlySet<string> | null;
  searchMode: 'dim' | 'hide';
  suppressConnectionDim: boolean;
}

/** The ids to keep bright while connections show, or null when no source has a single candidate:
 * then nothing should dim at all (selecting an unclassified item must not fade the whole map). */
export function connectionRelatedSet(
  sources: readonly { fromId: string; candidates: readonly { id: string }[] }[],
): Set<string> | null {
  if (!sources.some((s) => s.candidates.length > 0)) return null;
  const related = new Set<string>();
  for (const { fromId, candidates } of sources) {
    related.add(fromId);
    for (const c of candidates) related.add(c.id);
  }
  return related;
}

export function cardAlpha(id: string, inputs: AlphaInputs, related: Set<string> | null): number {
  if (inputs.hoverHighlight) return inputs.hoverHighlight.has(id) ? 1 : canvasGeometry.dimSearch;
  if (related && !inputs.suppressConnectionDim)
    return related.has(id) ? 1 : canvasGeometry.dimConnections;
  const isMatch = !inputs.searchMatches || inputs.searchMatches.has(id);
  return isMatch || inputs.searchMode === 'hide' ? 1 : canvasGeometry.dimSearch;
}
```

### A.6 `src/lib/lineAnchors.ts`
```ts
export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where the ray from the box's centre toward `toward` leaves the box, pushed `gap` px further. */
export function edgePoint(box: Box, toward: Point, gap: number): Point {
  const c = centre(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return c;
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  const edge = Number.isFinite(s) ? { x: c.x + dx * s, y: c.y + dy * s } : c;
  return { x: edge.x + (dx / len) * gap, y: edge.y + (dy / len) * gap };
}

/** The visible part of the centre-to-centre segment, or null when the boxes are so close or
 * overlapping that the clipped segment would point backwards (draw nothing then). */
export function clipSegmentToBoxes(a: Box, b: Box, gap: number): { from: Point; to: Point } | null {
  const ca = centre(a);
  const cb = centre(b);
  const from = edgePoint(a, cb, gap);
  const to = edgePoint(b, ca, gap);
  const dot = (to.x - from.x) * (cb.x - ca.x) + (to.y - from.y) * (cb.y - ca.y);
  return dot > 0 ? { from, to } : null;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
```

### A.7 `src/app/pageZoomGuard.ts`
```ts
const ZOOM_KEYS = new Set(['=', '+', '-', '_', '0']);
const ZOOM_CODES = new Set(['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0']);

/** WebView2 page zoom must never happen (only the map zooms). Tauri's zoomHotkeysEnabled is on so
 * touchpad pinch reaches the page (A9); this cancels the browser's own handling of Ctrl+wheel,
 * pinch and Ctrl +/−/0 without stopping the app's listeners. */
export function installPageZoomGuard(target: Window = window): () => void {
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (ZOOM_KEYS.has(e.key) || ZOOM_CODES.has(e.code)))
      e.preventDefault();
  };
  target.addEventListener('wheel', onWheel, { passive: false, capture: true });
  target.addEventListener('keydown', onKeyDown, { capture: true });
  return () => {
    target.removeEventListener('wheel', onWheel, { capture: true });
    target.removeEventListener('keydown', onKeyDown, { capture: true });
  };
}
```

### A.8 `src/features/palettes/colorWheelMath.ts` (C4)
```ts
/** h in degrees (any value, wrapped), s and v in 0–1 → [r, g, b] in 0–255. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] =
    hh < 1
      ? [c, x, 0]
      : hh < 2
        ? [x, c, 0]
        : hh < 3
          ? [0, c, x]
          : hh < 4
            ? [0, x, c]
            : hh < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = v - c;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Exact HSV disc: angle = hue (0° at 3 o'clock, counter-clockwise), radius = saturation. */
export function paintWheel(ctx: CanvasRenderingContext2D, size: number, value: number): void {
  const img = ctx.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (d > r) {
        img.data[i + 3] = 0;
        continue;
      }
      const hue = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
      const [red, green, blue] = hsvToRgb(hue, d / r, value);
      img.data[i] = red;
      img.data[i + 1] = green;
      img.data[i + 2] = blue;
      img.data[i + 3] = d > r - 1 ? Math.round(255 * (r - d)) : 255; // soft edge
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Knob position for (h, s) on a wheel of `size` px. */
export function wheelPoint(h: number, s: number, size: number): { x: number; y: number } {
  const r = size / 2;
  const rad = (h * Math.PI) / 180;
  return { x: r + Math.cos(rad) * s * r, y: r - Math.sin(rad) * s * r };
}

/** Pointer position on the wheel → (h, s). */
export function wheelHueSat(px: number, py: number, size: number): { h: number; s: number } {
  const r = size / 2;
  const h = ((Math.atan2(-(py - r), px - r) * 180) / Math.PI + 360) % 360;
  return { h, s: Math.min(1, Math.hypot(px - r, py - r) / r) };
}
```

### A.9 The note paper with a cut corner (D1)
```ts
const { radius: r, fold: f } = noteGeometry;
g.moveTo(x + r, y)
  .lineTo(x + w - f, y)
  .lineTo(x + w, y + f)
  .lineTo(x + w, y + h - r)
  .arcTo(x + w, y + h, x + w - r, y + h, r)
  .lineTo(x + r, y + h)
  .arcTo(x, y + h, x, y + h - r, r)
  .lineTo(x, y + r)
  .arcTo(x, y, x + r, y, r)
  .closePath()
  .fill(paperColour);
g.poly([x + w - f, y, x + w - f, y + f, x + w, y + f]).fill(foldColour);
```

### A.10 Hashtags
```ts
// A hashtag starts at the start of the text, after whitespace or "(", is "#" + a letter or digit,
// then letters, digits, "_" or "-". `u` flag: accents count as letters (#rêve).
export const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
```

## Appendix B: new strings
Add to `src/i18n/en.ts` (group names as shown; reuse existing groups where they exist):
- `addMenu.filterAll` "All supported files", `filterImages` "Images", `filterVideos` "Videos", `filterPdfs` "PDFs", `filterFonts` "Fonts"
- `diagnostics.mediaCheck` "Check media loading", `mediaOk(kind, size)`, `mediaFailed(kind, status)`
- `patch1.refreshingPreviews(n)` "Refreshing previews for {n} items…"
- `connections.displayOff` "Off"
- `fullscreen.enter` "Full screen", `exit` "Exit full screen", `hint` "Full screen · press F11 to leave", `setting` "Open in full screen"
- `canvasSettings.showNames` "Show names on hover", `fontPreview` "Font preview text"
- `palettes.add` "Add color", `remove` "Remove", `pickFromPhoto` "Pick from a photo", `eyedropper` "Eyedropper", `copyAll` "Copy all", `combine` "Combine into palette", `edit` "Edit palette", `fromItems(n)` "Palette from {n} items", `name` "Palette name", `pickHint` "Click a photo to pick a color · Esc to cancel"
- `notes.edit` "Edit note", `notes.notClassified(notes, palettes)`, color names incl. "Ink"
- `actions.tab` "Actions", `actions.empty` "Write #something in a note, like #dig-into, and it shows up here."
- `description.open` "Description", `placeholder` "What do you see? Why does it matter?", `add` "Add description", `edit` "Edit description", `editDetails` "Edit details", `field` "Description", `empty` "Add a description…"
- `fonts.defaultPreview` "Sphinx of black quartz, judge my vow", `fonts.useEverywhere` "Show this text on all font cards"
- `overview.title` "Overview", `myLayout` "My layout", `clusters` "Clusters", `thumbnails` "Thumbnails", `dots` "Dots", `hint` "Double-click an item to go to it · Esc to close", `tooLong` "Too many links to draw — showing My connections only", `expand` "Open the Overview (O)"
- Shortcut list: F11, O.

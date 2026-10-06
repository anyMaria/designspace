# Designspace: Patch 3 plan

> The owner used v0.15.1 on Windows and sent a new list of notes. This plan turns them into ordered
> work: first what's broken (pasting links, Esc in full screen, previews, the Color studio's image
> tab, buttons on two lines) and removing the AI, then everyday comfort (type icons, writing a
> description in place, a picture for every link), then arranging the map (snapping and alignment),
> and last the Overview as a live graph you can drag, like Obsidian's.

| | |
|---|---|
| Owner | @anyMaria |
| Written | 2026-10-05, from the owner's notes on v0.15.1 and a review of the code |
| Based on | `main` at `8eecdbe` (v0.15.1) |
| Status | Planned. Nothing built yet |

## How to use this document

**Owner:** read §0 and §1 and change anything you don't like. Then start one Claude Code conversation per phase with the
kick-off prompt in §9. At the end of each phase you get **Owner checks** to try on your PC.

**Coding agent:** read `CLAUDE.md`, then §0–§2 here, then your phase. `docs/PATCH_2_PLAN.md` §2.2–§2.5 (commands,
looking at the app, gotchas, code map) still apply word for word; don't re-read the rest of it. Line numbers are hints:
search for the quoted name if a line moved. Do the tasks in order, **one commit per task**, run the checks after each,
tick the task's checkbox here, and log deviations in `docs/DECISIONS.md` under "Patch 3 · Phase X".

## Contents
0. [What the owner reported and what is actually wrong](#0-what-the-owner-reported-and-what-is-actually-wrong)
1. [Decisions](#1-decisions)
2. [Rules](#2-rules)
3. [Phase A: fix what's broken, remove the AI](#3-phase-a-fix-whats-broken-remove-the-ai) · v0.16.0
4. [Phase B: everyday comfort](#4-phase-b-everyday-comfort) · v0.17.0
5. [Phase C: snapping and alignment](#5-phase-c-snapping-and-alignment) · v0.18.0
6. [Phase D: the Overview as a live graph](#6-phase-d-the-overview-as-a-live-graph) · v0.19.0
7. [Finishing a phase](#7-finishing-a-phase)
8. [Later (not in Patch 3)](#8-later-not-in-patch-3)
9. [Kick-off prompts](#9-kick-off-prompts)
- [Appendix: new strings](#appendix-new-strings)

---

## 0. What the owner reported and what is actually wrong

Checked in the code at `8eecdbe`; ✔ = reproduced in the browser build.

| # | Owner's note | What is actually wrong | Task |
|---|---|---|---|
| 1 | "Ctrl+V should paste my link." | Pasting already tries to make a link, but it reads the clipboard text **after** an `await` (`useDropAndPaste.ts` `onPaste`: `await platform.clipboard.readImage()` comes first). By then the browser has emptied `e.clipboardData`, so links and text are silently dropped. ✔ | A1 |
| 2 | "Full screen: Esc does nothing." | Esc goes through a ladder: close what's open, cancel a mode, **clear the selection**, and only then leave full screen. On the map something is almost always selected, so the first Esc seems to do nothing. If a text field has focus (Title, a word field), Esc never reaches the ladder at all. On Windows the app also keeps its own "full screen" flag, refreshed by resize events and never checked again. Nothing on screen says how to leave. | A2 |
| 3 | "After restarting, links and some videos have no thumbnail; the List has no previews." (Later: "after 4 restarts it loads.") | Two things. The map loads pictures through a queue (6 at a time, retried once); the List, the Library menu covers, Details, Triage and the studio's library picker use plain `<img src="http://media.localhost/…">`, so at startup hundreds of requests hit the `media://` handler at once, with no limit and no retry. A failed one stays blank. Also, the start-up self-check re-makes missing thumbnails in the background, so a few restarts later everything is there. Links without a picture are a separate cause (row 9). The List also overflows sideways on Windows: it counts columns from the panel width, scrollbar included (screenshot 5). | A3 |
| 4 | "Importing an image in the Color studio isn't working at all; the layout is broken." | Dropping a picture on the studio **also imports it into the library**, and Ctrl+V in the studio pastes onto the map behind it. The window-wide drop and paste handlers ignore the studio. The tab is laid out with fixed sizes: a 200 px column holding 300 px buttons, the Mood switch overflowing its pill, a 640×400 box with no visible drop area. | A4 |
| 5 | "The two-row buttons, everywhere." | `.ds-tabs__tab` allows wrapping, so "My layout" and "From an image" break onto two lines, and the Mood switch spills out of its pill. | A5 |
| 6 | "Remove the AI model." | CLIP (`@huggingface/transformers`, a ~150 MB model in the installer) powers suggestions, search by meaning, Find similar, the "Similar look" criterion and the board tray's "similar" fill. | A6 |
| 7 | "An icon showing if it's a video, image, palette…" | Tiles show only the picture. | B1 |
| 8 | "Let me click Add description and type." | Details shows the text read-only plus a "Description" button that zooms the map to the card and opens a floating editor. | B2 |
| 9 | "A thumbnail for every link, or tell me and I'll add one." | The fetcher only reads `og:image`/`twitter:image` (`src-tauri/src/net.rs`), with a `Designspace/0.15.1` user agent that many sites block. A failed fetch becomes a plain text card forever, with no retry and no way to add a picture. | B3 |
| 10 | "Magnetism when moving, like Figma; alignment options; also when resizing." | Not built. Only "Tidy up" exists (`createTidyUpCommand`). | C1–C4 |
| 11 | "Drag the points in the map like Obsidian." | The Overview is a still picture: dragging pans, nothing moves. | D1, D2 |
| 12 | "The Spacing slider does nothing." | Spacing scales the **whole** layout, then the Overview re-fits the camera to it (`OverviewCanvas.tsx` refits on every new layout), and dots are clamped to 12 px. Twice the spacing, zoomed out twice as far, looks identical. The screenshot also shows "Arranging…" stuck: if the layout worker fails, the error is only logged and the label never goes away. | D1, D3 |

**Also found during the review** (each is a task below): the List's grey Windows scrollbars aren't themed (A3); in a
text field, Esc does nothing at all if no panel is open (A2); a pasted item lands in the middle of the screen, not where
the pointer is (A1).

---

## 1. Decisions

The planner chose these defaults. The owner can change any of them before its phase starts.

| # | Default | Alternative |
|---|---|---|
| P1 | **In full screen, Esc leaves full screen** once nothing is open, **even if something is selected** (clicking empty space still deselects). Out of full screen, Esc still clears the selection. | Keep "deselect first, then leave" |
| P2 | Esc in a text field with nothing open **leaves the field** (the next Esc continues down the ladder). | Field keeps Esc |
| P3 | Pasting **puts the item under the pointer** if the pointer is over the map, otherwise in the middle of the screen. A copied link becomes a Link even if the clipboard also holds a picture of it. | Always the middle |
| P4 | Snapping is **on by default**; hold **Ctrl** while dragging to move freely (as in Figma); a switch in Settings → Canvas turns it off. | Off by default |
| P5 | Snapping uses only the cards **visible on screen** (as Figma does), within **6 screen px**. | Whole board |
| P6 | Removing the AI keeps the stored data (the `embeddings` table and files stay; never delete data in a migration). Only the code, the model and the settings go. | Delete the data too |
| P7 | Links: at start-up the app **asks once** ("12 links have no picture. Look for pictures?") rather than fetching on its own. Fetching only ever follows an owner action (CLAUDE.md). | Re-fetch silently |
| P8 | The Overview graph keeps moving gently for 2–3 s after a drag, then settles (Obsidian feel). "Reduce motion" makes it jump to the final positions. | Instant |
| P9 | Dragging a dot in the Overview **does not move the card on the real map**. The Overview is a way to look, not to arrange. | Write back |

---

## 2. Rules
- Everything in `CLAUDE.md` and `docs/PATCH_2_PLAN.md` §2.1 still holds (small changes, tokens, strings in `en.ts`,
  Commands for data changes, no `any`, Engine.ts only routes: new canvas code goes in new modules).
- **No new dependencies.** d3-force, culori, lucide-react, @tiptap/* are installed. Phase A *removes* one
  (`@huggingface/transformers`).
- **No migrations in Patch 3.** Nothing here changes the schema. If a task seems to need one, stop and write it in
  `DECISIONS.md` first.
- Checks after every task: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test`, plus the Rust checks when
  `src-tauri` or `crates` changed, plus the e2e specs the task names. Full e2e suite before the phase ends.
- Windows-only behaviour (full screen focus, `media://` under load, real link fetching) can't be checked in the cloud.
  Unit-test the pure parts and list the rest as Owner checks.

---

## 3. Phase A: fix what's broken, remove the AI

**Goal:** Ctrl+V pastes links, Esc always gets you out of full screen, previews always appear, the studio's image tab
works and looks right, no button text wraps, and the app ships without the AI. Size: M. Version **0.16.0**.

### A1 · Ctrl+V pastes links, text and pictures `[x]`
**Files:** new `src/features/import/pasteKind.ts` (+ test), `src/features/import/useDropAndPaste.ts`,
`src/canvas/Engine.ts` (`pointerWorld()`), `en.ts`.

**Do**
1. `pasteKind.ts`: `classifyPaste({ fileCount, text, html }): 'files' | 'link' | 'maybe-image' | 'note' | 'nothing'`.
   Order: files → `parseHttpUrl(text)` is a URL → `link` → no text → `maybe-image` → text → `note`. (When a browser
   copies a picture, `text/plain` is empty and the picture is on the clipboard.)
2. `onPaste`: read `files`, `text/plain` and `text/html` **synchronously, before any `await`**, then `classifyPaste`.
   Call `e.preventDefault()` when the app handles the paste. Only `maybe-image` calls `platform.clipboard.readImage()`.
   On Tauri, if `text` is empty, also try `platform.clipboard.readText()` before giving up.
3. Drop point (P3): add `Engine.pointerWorld(): {x,y} | null`, the world point under the last pointer position if the
   pointer is inside the canvas, otherwise null. Use it, else `viewportCenter()`.
4. After pasting, select the new item (as drop does) and show `en.paste.linkAdded(domain)` for links.

**Tests:** `pasteKind.test.ts` (URL, URL with spaces around it, `www.` without a scheme stays a note, empty text with
files, text with HTML). e2e `patch3-paste.spec.ts`: dispatch a `ClipboardEvent('paste')` built with a `DataTransfer`
holding `text/plain` = a URL, and a Link tile appears in the List; the same with "hello" makes a note.
**Owner checks:** copy a link from Chrome's address bar, click the map, press Ctrl+V: a link card appears under the
pointer.

### A2 · Esc always gets you out of full screen `[x]`
**Files:** `src/app/App.tsx`, `src/app/escapeStack.ts` (+ test), `src/app/fullscreen.ts` (+ test),
`src/canvas/useCanvasShortcuts.ts`, `src/platform/tauri/TauriPlatform.ts`, `src/platform/browser/BrowserPlatform.ts`,
`src-tauri/capabilities/default.json`, new `src/app/FullscreenExitPill.tsx`, `src/app/Shell.tsx`, `en.ts`.

**Do**
1. Ladder (P1): move the full-screen base handler to **priority 15** (after "cancel a mode", before "clear the
   selection"). Update the `ShortcutListOverlay` Esc row to `en.shortcuts.escapeLadder` (Appendix).
2. Typing (P2): in `escapeStack.handle(typing)`, when typing and the top layer doesn't take Esc (or there's no layer),
   return a new `'blur'` result. `installEscapeListener` then calls `(document.activeElement as HTMLElement).blur()`
   and prevents the default. Fields that have their own Esc (combobox list open, the rename field) still get it first
   because they `stopPropagation` in their own handlers. Check `TermCombobox` and `BoardsGallery` and add it if missing.
3. Don't trust the flag alone: `setFullscreen` re-reads `platform.window.isFullscreen()` 300 ms after the change and
   stores that value. `watchFullscreen` on Tauri also listens to `onFocusChanged`.
4. Keyboard focus on Windows: after `setFullscreen` on Tauri, call `getCurrentWindow().setFocus()` and add
   `core:window:allow-set-focus` to the capabilities. A window style change can leave WebView2 without keyboard focus.
5. `FullscreenExitPill`: in full screen, a small pill at the top centre, "Exit full screen · Esc", shown for 3 s on
   entering and whenever the pointer touches the top 6 px. Clicking it leaves full screen. Fades with the token
   durations; respects Reduce motion.
6. Log each Esc decision at debug level (`logger.debug('esc', which)`), so a problem report shows what happened.
7. For e2e only: `?fakeFullscreen` makes `BrowserPlatform.window` keep the state in memory (the browser's own Esc never
   interferes).

**Tests:** `escapeStack.test.ts`: typing with no layer → `'blur'`; full screen beats the selection. e2e
`patch3-fullscreen.spec.ts` with `?seed=demo&fakeFullscreen`: enter full screen, select a card, focus Title, press Esc
twice → no longer full screen and the card is still selected.
**Owner checks:** enter full screen, click a picture, press Esc once: you're out. In full screen, move the mouse to the
top edge: the "Exit full screen" pill appears.

### A3 · Previews always appear `[x]`
**Files:** new `src/lib/thumbLoader.ts` (+ test), new `src/design/components/Thumb.tsx`, new
`src/lib/kindIcon.tsx`, `ListTile.tsx`, `ListPanel.tsx`, `SpaceSwitcher.tsx`, `DetailsPanel.tsx`,
`BulkDetailsPanel.tsx`, `TriageView.tsx`, `SuggestionsTray.tsx`, `ImageTab.tsx`, `problemReport.ts`,
`src/design/tokens.ts` + `tokens.css`, `src/design/components/components.css`.

**Do**
1. `thumbLoader.ts`: `loadThumb(url, signal?): Promise<string>` returns an object URL. A queue with **6 at a time**,
   **3 retries** (after 0.5 s, 2 s, 5 s), shared requests for the same URL, an LRU of 600 object URLs
   (`URL.revokeObjectURL` on eviction), and `failedCount()` for the problem report. A `blob:` URL (browser build) is
   returned as is.
2. `kindIcon.tsx`: `KIND_ICONS` maps a kind to a lucide icon and a label: image `Image`, video `Film`, pdf `FileText`,
   link `Link2`, font `Type`, font collection `Library`, note `StickyNote`, swatch with one colour `Pipette`, palette
   `Palette`. Phase B reuses it.
3. `<Thumb platform item size fit>`: while loading or after failing, shows the kind icon centred on `--surface-2`.
   When loaded, the picture fades in. Reloads when `item.thumbV` changes. Replace every `<img src={thumbUrl(…)}>` in
   the files above with it.
4. List width: measure the **scroll area's `clientWidth`** (scrollbar excluded), not the outer panel. Tiles stretch to
   fill the row: `tile = (width − GAP·(cols−1)) / cols`. No horizontal scrollbar, ever.
5. Themed scrollbars: tokens `scrollbarThumb`, `scrollbarThumbHover`. In `components.css`: `* { scrollbar-width: thin;
   scrollbar-color: var(--scrollbar-thumb) transparent; }`.
6. Problem report: add "Previews that failed to load this session: N".
7. `media_protocol.rs`: the cache response says "content-addressed, immutable", but keys are per item. Change it to
   `Cache-Control: no-cache` (the `?v=` already busts), so a re-made thumbnail is never shown stale.

**Tests:** `thumbLoader.test.ts` (fake `fetch`: no more than 6 at once, retries then succeeds, gives up after 3, shared
request, LRU revokes). e2e `smoke-m2-list` still passes. New check in it: no horizontal scroll
(`scrollWidth <= clientWidth`).
**Owner checks:** close and reopen the app: every List tile shows its picture or, for a moment, an icon. Never a blank
square. No sideways scrollbar in the List.

### A4 · The Color studio's "From an image" works `[x]`
**Files:** `src/features/import/useDropAndPaste.ts`, `src/app/overlayGate.ts`,
`src/features/colorStudio/ImageTab.tsx`, `src/features/colorStudio/studioKeys.ts`, `en.ts`.

**Do**
1. While a blocking overlay is open (`isBlockingOverlayOpen()`), the window-wide drop and paste handlers do nothing,
   and the "Drop to add" overlay doesn't show.
2. In the studio, Ctrl+V pastes a picture into the image tab (switching to it), via `studioKeys`.
3. Layout:
   - Left rail, 240 px: full-width buttons (Open an image…, Paste, From my library), then **Mood** as a vertical list of
     five rows (no tabs), then "Also add this picture to my library".
   - Right: a **drop zone that fills the space** (dashed `--hairline` border (2 px), `--radius-panel`, centred icon and
     `en.colorStudio.dropImage`), highlighted while a file is dragged over it.
   - Once loaded, the picture fits that space (ResizeObserver instead of `BOX_W`/`BOX_H`), with a "Change image" button
     in its corner.
   - The library picker becomes a dialog-sized grid of `<Thumb>` with a search field.
4. Errors show inline under the buttons, as today. A picture that can't be read says so
   (`en.colorStudio.imageFailed`).

**Tests:** e2e `patch2-color-studio` (or the studio spec in use) still passes. New: drop a PNG on the studio → the
droppers appear **and** the library item count is unchanged.
**Owner checks:** open the Color studio → From an image. Drag a photo from Explorer onto it: colours appear, and the
photo is *not* added to your map unless you tick the box. Ctrl+V a copied picture works too.

### A5 · Button labels stay on one line `[x]`
**Files:** `src/design/components/components.css`, `src/features/overview/OverviewOverlay.tsx`,
`src/features/colorStudio/ColorStudio.tsx`.

**Do:** `.ds-tabs__tab { white-space: nowrap; flex: none; }`, `.ds-tabs { max-width: 100%; }`. Same `nowrap` on
`.ds-button`. Check every `Tabs` use (30) at 1280×720 and 1920×1080; where a bar is too tight, give it room. The
Overview's top bar wraps as a whole instead of squeezing labels.
**Tests:** Playwright screenshot pass over the Overview, Color studio, Details, List and Settings at 1280×720 (by hand,
not in a spec).
**Owner checks:** "My layout" and "From an image" are on one line.

### A6 · Remove the AI `[x]`
**Files (delete):** `src/lib/ai/*`, `src/features/ai/*`, `src/workers/ai.worker.ts`, `src/workers/aiQueue.ts` (+ tests),
`src/state/embeddingsStore.ts`, `src/features/settings/AiSection.tsx`, `src/features/search/useMeaningMatches.ts`,
`scripts/fetch-models.mjs`, `scripts/copy-ort-wasm.mjs` (if only the AI uses it).
**Files (edit):** `App.tsx` (`resumePendingAiAnalysis`, `loadEmbeddings`), `connections.ts` (drop the `similar`
criterion), `ConnectionsPopover.tsx`, `useConnectionIndex.ts`, `useConnectionsBinding.ts`, `useOverviewData.ts`,
`layout.worker.ts`, `DetailsPanel.tsx` (Find similar), `TriageView.tsx` (suggestions), `SuggestionsTray.tsx` (keep the
search-filter matches, drop the "similar" fill), the ingest queues (no `aiQueue` hand-off), `platform/types.ts` + both
platforms (`embeddings`), `loadSettings.ts`, `en.ts`, `package.json` (`models:fetch`, `@huggingface/transformers`),
`src-tauri/tauri.conf.json` (`resources/models`), `src-tauri/src/embeddings.rs` + `lib.rs` + `build.rs` `APP_COMMANDS`
+ capabilities, `.github/workflows/windows-build.yml` (model cache and fetch steps), the `media://` `Models` root.

**Do**
1. Remove the code paths above. A saved setting that still names `similar` is ignored, never an error.
2. Keep the `embeddings` table and its rows (P6). No migration.
3. `DECISIONS.md`: what was removed, that the data stays, and that putting the AI back means reverting this commit.
4. Settings: the AI section is gone; the About section no longer mentions a model.
5. Check that the installer is smaller (CI artifact size before and after, in the PR description).

**Tests:** delete the AI tests; `pnpm test`, `typecheck` and the full e2e suite pass (remove the AI steps from
`smoke-m6-*` specs if any).
**Owner checks:** the installer is much smaller; Settings has no AI section; nothing else changed.

---

## 4. Phase B: everyday comfort

**Goal:** you can tell kinds apart at a glance, write a description where you read it, and every link has a picture or
says it needs one. Size: M. Version **0.17.0**.

### B1 · A small icon for each kind `[x]`
**Files:** `ListTile.tsx`, `src/canvas/CanvasHoverOverlay.tsx`, `DetailsPanel.tsx`, `src/lib/kindIcon.tsx` (from A3),
`tokens.ts`.

**Do:** a 20 px badge at the **bottom left** of every List and Trash tile (dark circle like the favourite star at the
top left, white 12 px icon, `title` = the kind's label). The hover name on the map starts with the same icon. The
Details header shows icon + label ("Video", "Palette"…). Size S tiles keep the badge (it's the most useful there).
**Tests:** `ListTile` test: each kind renders its icon's `aria-label`.
**Owner checks:** in the List, videos, PDFs, links, fonts, palettes and notes each have their own little icon.

### B2 · Write the description right in Details `[x]`
**Files:** new `src/features/details/InlineDescription.tsx`, `DetailsPanel.tsx`, `DescriptionPanel.tsx`, `en.ts`.

**Do**
1. `InlineDescription`: a TipTap editor with the same `noteExtensions` as the description panel, styled as a field
   (placeholder `en.description.empty`, grows to 12 lines, then scrolls). **One click puts the cursor in it.** No zoom,
   no panel.
2. Save as today: one `createSetDescriptionCommand` per editing session, on blur, when switching items and on unmount.
   Reuse the `saveRef` pattern from `DescriptionPanel`.
3. The old "Description" button becomes a small icon button ("Open beside the card", `Maximize2`) next to the field
   label. It opens the existing panel **without** zooming the map.
4. Esc in the field leaves it (A2's blur) and saves.

**Tests:** e2e `patch1-description` updated: click the placeholder, type, click elsewhere, reload (wait 2.5 s for
persistence), and the text is there; Ctrl+Z undoes it.
**Owner checks:** select a picture, click "Add a description…" in Details and type. Nothing zooms.

### B3 · A picture for every link `[x]`
**Files:** `src-tauri/src/net.rs` (+ tests), new `src/features/import/linkCover.ts` (+ test),
`src/features/import/importLink.ts`, new `src/commands/linkCoverCommands.ts` (+ test), `DetailsPanel.tsx`,
`src/canvas/contextMenuItems.ts` (+ test), `src/canvas/decor/*` (the link card), `ListTile.tsx`, `App.tsx`, `en.ts`.

**Do**
1. Rust fetch, better at finding a picture:
   - Browser-like headers: a current Edge/Chrome `User-Agent`, `Accept: text/html,…`, `Accept-Language: en,fr`.
   - Picture candidates, in order: `og:image:secure_url`, `og:image`, `og:image:url` (as `property` **or** `name`),
     `twitter:image`, `twitter:image:src`, `link[rel=image_src]`, `meta[itemprop=image]`, JSON-LD `image`, then the
     largest `apple-touch-icon` (≥ 120 px). Resolve relative and `//` URLs; decode `&amp;`.
   - Known sites without fetching the page: YouTube (`youtube.com/watch?v=`, `youtu.be/`, `/shorts/`) →
     `https://i.ytimg.com/vi/<id>/hqdefault.jpg`; Vimeo → its oEmbed JSON `thumbnail_url`.
   - `LinkMeta` gains `imageCandidates: string[]`. The frontend tries them in order until one downloads as an image.
2. A link with no picture keeps `cover_path = NULL` and gets `link_meta.noPicture = true`. Its card on the map and its
   List tile show the domain, the title and a clear hint, `en.link.noPicture` ("No picture found"), with an image
   icon. Not a bare text card.
3. Add or replace a link's picture (all undoable through `createSetLinkCoverCommand(platform, id, newCoverRelPath)`;
   undo restores the old `cover_path` and `thumb_v`. The imported file is never deleted by undo, per "originals are
   sacred"):
   - Details for a link: a picture box with "Choose a picture…", "Paste a picture" and "Try again". You can also drop
     an image file on the box.
   - Right-click a link → "Change picture…".
   - The new cover goes through the image ingest (thumbnails, palette) like any cover.
4. Old links (P7): at start-up, if not offline and some links have no picture and were fetched by the old fetcher
   (`link_meta` without `fetcherV ≥ 2`), show once per launch a toast with an action: `en.link.findPictures(n)` →
   "Look for pictures". It re-runs `enrichLink` for them, 3 at a time.
5. "Try again" also works for one link from the context menu.

**Tests:** Rust: candidates from `name="og:image"`, JSON-LD, apple-touch-icon; YouTube and youtu.be ids; Vimeo URL
recognised. TS: `linkCover.test.ts` (tries candidates in order, stops at the first image). Command test: do/undo.
e2e: a link in the browser build (no network) shows "No picture found"; set a picture from a file → the tile shows it;
Ctrl+Z → back to "No picture found".
**Owner checks:** paste a YouTube link: its thumbnail appears. Paste a site with no picture: the card says so; open
Details → "Choose a picture…" and pick one. Reopen the app with old links: accept "Look for pictures".

---

## 5. Phase C: snapping and alignment

**Goal:** moving and resizing snap to neighbours like Figma (edges, centres, equal gaps, equal sizes), with pink guide
lines, and a small bar aligns or spaces a selection evenly. Size: L. Version **0.18.0**.

### C1 · Snapping maths (pure) `[x]`
**Files:** new `src/canvas/snapping.ts` (+ test).

**Do**
```ts
export interface SnapGuide { axis: 'x' | 'y'; at: number; from: number; to: number }        // a line, world units
export interface GapGuide { axis: 'x' | 'y'; gaps: { start: number; end: number; cross: number }[] } // equal gaps
export interface SnapResult { dx: number; dy: number; guides: SnapGuide[]; gaps: GapGuide[] }

/** Moving: snaps the moving bounds' left/centre/right to the others' left/centre/right (same for y), and
 * to equal spacing: the gap to the nearest neighbour on each side equals the gap between two other
 * neighbours in the same row (or column), or the moving rect sits exactly between two neighbours. */
export function snapMove(moving: Rect, others: Rect[], threshold: number): SnapResult;

/** Resizing: snaps the edges the handle moves to the others' edges and centres, and the width/height
 * to a neighbour's width/height (equal size); keeps the aspect when `keepAspect`. */
export function snapResize(
  start: Rect, proposed: Rect, handle: ResizeHandle, others: Rect[], threshold: number,
  opts: { keepAspect: boolean; fromCenter: boolean },
): { rect: Rect; guides: SnapGuide[]; sizeMatch: ('w' | 'h')[] };
```
- x and y snap **independently**; on each axis the smallest correction within `threshold` wins; ties prefer edges over
  centres over gaps.
- "Same row" = overlapping on the other axis. Only the nearest neighbour on each side counts.
- Pure, no Pixi, no stores. Fast: 200 rects in under 1 ms (test it).

**Tests (≥ 16):** edge to edge, centre to centre, nothing within threshold, x and y at once, equal gap to the right of
a pair, centred between two, column version, resize right edge to a neighbour's edge, resize matching a neighbour's
width, resize with aspect kept snaps the dominant axis only, from-centre resize, 200 rects timing.

### C2 · Snap while moving `[x]`
**Files:** new `src/canvas/snapGuides.ts` (drawing), `src/canvas/Engine.ts` (move branch of `onPointerMove`, ~1238),
`src/canvas/spatialIndex.ts` (query of the visible rect), `src/state/settingsStore.ts` + `src/features/settings/CanvasSection.tsx`,
`tokens.ts` (`snap = { thresholdPx: 6, guide: <accent pink>, guideWidthPx: 1 }`), `en.ts`.

**Do**
1. At drag start, collect the **visible** cards that aren't being moved (P5) from the spatial index, at most 300
   nearest to the selection.
2. On every move: proposed bounds of the whole selection → `snapMove(bounds, others, thresholdPx / zoom)` → apply
   `dx, dy` to every moved card. Skip when Ctrl is held or snapping is off (P4).
3. `snapGuides.ts` draws thin lines in world space (constant 1 screen px) spanning the aligned cards, and for equal gaps
   short bars with the gap in px (`12`). Cleared on release.
4. Arrow keys nudging (if present) don't snap.

**Tests:** e2e `patch3-snap.spec.ts`: two cards side by side; drag the second so its top is 4 px below the first's →
after release the tops are equal. With Ctrl held → not equal.
**Owner checks:** drag a picture near another: it clicks into line, and a pink line shows what it aligned to. Hold Ctrl
to place it freely.

### C3 · Snap while resizing `[x]`
**Files:** `src/canvas/Engine.ts` (resize branch, ~1265), `snapGuides.ts`.

**Do:** after `resizeRect(…)` compute `snapResize(startRect, next, handle, others, thresholdPx / zoom, …)` and use its
rect. While a size matches a neighbour, show a small "=" marker on the matching sides. Ctrl frees it, as when moving.
**Tests:** e2e: resize a card's right edge to within 4 px of a neighbour's width → equal widths.
**Owner checks:** resizing a picture next to another stops at the same height, and an "=" shows it.

### C4 · Align and distribute `[x]`
**Files:** new `src/canvas/alignMath.ts` (+ test), new `src/canvas/AlignBar.tsx`, `src/commands/itemCommands.ts`
(+ test), `src/canvas/contextMenuItems.ts` (+ test), `src/app/useGlobalShortcuts.ts`,
`src/features/shortcuts/ShortcutListOverlay.tsx`, `en.ts`.

**Do**
1. `alignMath.ts`: `align(rects, 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom')`,
   `distribute(rects, 'x'|'y')` (equal gaps, first and last stay), `matchSize(rects, 'w'|'h', ref = first selected)`
   (pictures keep their crop rule from Patch 2 C3), `tidy(rects, gap)` (reuse what `createTidyUpCommand` does).
2. Commands: aligning and distributing use `createMoveItemsCommand`; matching sizes uses a new
   `createResizeItemsCommand(platform, updates[])` (one transaction, undo restores every rect).
3. `AlignBar`: when **2 or more** cards are selected and not dragging, a compact floating bar above the selection
   (Dock style, icon buttons with tooltips): align left / centre / right, top / middle / bottom, distribute
   horizontally / vertically, same width, same height, tidy up. Hidden while moving or resizing.
4. Shortcuts (Figma's): Alt+A left, Alt+H horizontal centre, Alt+D right, Alt+W top, Alt+V vertical middle, Alt+S
   bottom, Alt+Shift+H / Alt+Shift+V distribute. Listed in the shortcut overlay.
5. The same actions in the right-click menu under "Align".

**Tests:** `alignMath.test.ts` (each mode, distribute with unequal sizes, matchSize keeps aspect for fonts), command
undo test. e2e: select three cards, Align top → same y; Ctrl+Z → back.
**Owner checks:** select a few pictures, use the bar to line them up and space them evenly; Ctrl+Z undoes it.

---

## 6. Phase D: the Overview as a live graph

**Goal:** the Overview behaves like Obsidian's graph: dots and stars can be dragged, the rest follows on springs, and
Spacing visibly loosens or tightens the clusters. Size: M. Version **0.19.0**.

### D1 · A live simulation in a worker `[x]`
**Files:** new `src/workers/graphSim.worker.ts`, new `src/features/overview/graphSim.ts` (main-thread client, + test with
a fake worker), `src/lib/constellations.ts` (export the force set-up), `useOverviewData.ts`, `OverviewCanvas.tsx`,
`OverviewOverlay.tsx`, delete `runConstellationLayout.ts` if nothing else uses it, `en.ts`.

**Do**
1. One d3-force simulation for **items and hubs together** (hubs are nodes; an item is linked to each of its hubs;
   manual connections are item–item links), seeded from the current Clusters layout. It runs in the worker (CLAUDE.md:
   layout in workers).
2. Messages: `init { nodes, links, spacing }`, `drag { id, x, y }` (sets `fx/fy`), `release { id }` (clears them;
   P8), `spacing { value }`, `stop`. The worker posts a `Float32Array` of positions (transferred) at most once per
   animation frame while the simulation's `alpha > alphaMin`, then `settled`.
3. The canvas draws from the latest positions; the camera **fits once** when the Overview opens (and when switching
   Clusters ↔ My layout), never after a drag or a Spacing change.
4. Errors: if the worker fails or takes over 5 s to post anything, show `en.overview.layoutFailed` with a "Try again"
   button instead of "Arranging…" forever. Remove the stuck "Arranging…" label; the movement itself shows the work.
5. "My layout" stays still (real positions, no simulation, no dragging).
6. Reduce motion (P8): the worker runs to the end and posts once.

**Tests:** `graphSim.test.ts`: sends `init`, applies posted frames, sends `drag`/`release`, shows the error after a
timeout. e2e `patch1-overview` updated (no "Arranging…" wait; poll for `settled`).

### D2 · Drag dots and stars `[x]`
**Files:** `OverviewCanvas.tsx`.

**Do:** pressing on a dot or a star and dragging moves it (`drag` messages, world coordinates). The neighbours follow
and the graph re-settles when you let go. Pressing on empty space still pans. Hover highlights a node's links (dim
the rest to 30 %, as Obsidian does). Click and double-click keep their meaning (focus a star; go to an item). Dragging
never changes the real map (P9).
**Owner checks:** in the Overview (Clusters), drag a star: its pictures follow like on elastic bands, then settle.

### D3 · Spacing that works `[x]`
**Files:** `graphSim.worker.ts`, `OverviewOverlay.tsx`, `overviewStore.ts`.

**Do:** Spacing changes the **forces**, not a global scale: link distance × spacing, charge × spacing, while dot size
and collision radius stay the same. Send `spacing` **live while the slider moves** (no "commit on release"); the
simulation re-heats (`alpha(0.3)`) and the clusters visibly loosen or tighten in place. The range stays
`OVERVIEW_SPACING_MIN..MAX`.
**Tests:** worker unit test: with spacing 2, the mean hub–item distance is larger than with 0.5 while node radius is the
same.
**Owner checks:** move the Spacing slider: groups spread apart or pull together as you slide.

---

## 7. Finishing a phase
Same as `docs/PATCH_2_PLAN.md` §10: every task ticked here; a "Patch 3 · Phase X" entry in `DECISIONS.md`; version
bumped in `package.json`, `src-tauri/tauri.conf.json` and the root `Cargo.toml`; all checks and the full e2e suite
green; `pnpm format` before the last commit; push, open a PR, CI green; send the owner the phase's Owner checks in
plain language, with where to download the installer.

## 8. Later (not in Patch 3)
Snapping to a grid; "Arrange my map like this" (apply the Overview's clusters to the real map); dragging a picture onto
a link card to set its picture; page screenshots for links (needs a hidden browser window); smart guides between
boards.

## 9. Kick-off prompts
Phase A:
```text
Continue Designspace with Patch 3, Phase A, from docs/PATCH_3_PLAN.md.
Read CLAUDE.md, §0–§2 of docs/PATCH_3_PLAN.md (and §2.2–§2.5 of docs/PATCH_2_PLAN.md it points to),
and the whole Phase A section before writing code. Do the tasks in order, one commit per task, with the
checks after each. Log deviations in docs/DECISIONS.md under "Patch 3 · Phase A". When done: tick the
tasks, make CI green, push, open a PR, and send me the Phase A Owner checks in plain language.
```
Later phases (one new conversation each, after the previous phase is merged):
```text
Continue Designspace with Patch 3, Phase <X>, from docs/PATCH_3_PLAN.md. Read CLAUDE.md, §0–§2 of the
plan, the Phase <X> section and the latest "Patch 3" entries in docs/DECISIONS.md first. Same rules.
```

---

## Appendix: new strings
Add to `src/i18n/en.ts` (group in brackets). Remove the AI strings in A6.

| Key | Text | Task |
|---|---|---|
| `paste.linkAdded(domain)` | "Link added · {domain}" | A1 |
| `shortcuts.escapeLadder` | "Close what's open, leave full screen, then deselect" | A2 |
| `fullscreen.exitPill` | "Exit full screen · Esc" | A2 |
| `diagnostics.failedPreviews(n)` | "Previews that failed to load this session: {n}" | A3 |
| `colorStudio.changeImage` | "Change image" | A4 |
| `colorStudio.searchLibrary` | "Search my library" | A4 |
| `kinds.image` … `kinds.palette` | "Image", "Video", "PDF", "Link", "Font", "Type collection", "Note", "Color", "Palette" | A3, B1 |
| `description.openBeside` | "Open beside the card" | B2 |
| `link.noPicture` | "No picture found" | B3 |
| `link.choosePicture` | "Choose a picture…" | B3 |
| `link.pastePicture` | "Paste a picture" | B3 |
| `link.tryAgain` | "Try again" | B3 |
| `link.changePicture` | "Change picture…" | B3 |
| `link.findPictures(n)` | "{n} links have no picture." · action "Look for pictures" | B3 |
| `settings.snapping` | "Snap while moving and resizing" · hint "Hold Ctrl to move freely" | C2 |
| `align.*` | "Align left", "Align center", "Align right", "Align top", "Align middle", "Align bottom", "Distribute horizontally", "Distribute vertically", "Same width", "Same height", "Tidy up", menu "Align" | C4 |
| `overview.layoutFailed` | "The map couldn't be arranged." · action "Try again" | D1 |

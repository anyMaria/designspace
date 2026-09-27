# Designspace: Implementation Plan

> A private, local-first desktop app for visual inspiration.
> Collect images, videos, PDFs, fonts, links and notes on one infinite map, classify them in seconds, see how they connect, and turn filtered selections into project moodboards. Nothing leaves your computer.

| | |
|---|---|
| Owner | @anyMaria (single user) |
| Platform | Windows 10/11 desktop (macOS/Linux possible later from the same code) |
| Written | 2026-09-27, from the product discussion in Claude Code |
| Status | Ready to build, starting with Milestone 0 |

## How to use this document

**Owner (you)**
1. Open a new Claude Code conversation on the `anyMaria/designspace` repository.
2. Paste the kick-off prompt from [§11](#11-kick-off-prompt) and attach your original sketch and the soft-UI reference image.
3. Work one milestone per conversation. At the end of each one, the agent pushes the code, ticks the checklist in §8, and gives you a short list of things to try on your PC ("Owner checks").
4. Install each build on Windows as described in §7.5.

**Coding agent**
- This document is the source of truth. Read all of it before writing code. `CLAUDE.md` has the working rules.
- Build milestones in order (§8). Tick checkboxes as items land and commit the updated plan with the code.
- Library versions named here were current on 2026-09-27. Check current stable versions and APIs in official docs before scaffolding or adding a dependency.
- If something here is wrong or impossible, take the simplest alternative that respects the principles in §1.3, log it in `docs/DECISIONS.md`, and tell the owner.
- Ask the owner only about product decisions this plan doesn't cover. Explain things in plain language: the owner is a designer, not a developer.

## Contents
0. [Decisions at a glance](#0-decisions-at-a-glance)
1. [Product](#1-product)
2. [UX specification](#2-ux-specification)
3. [Visual design system](#3-visual-design-system)
4. [Architecture](#4-architecture)
5. [Data](#5-data)
6. [Repository layout](#6-repository-layout)
7. [Development, testing & CI](#7-development-testing--ci)
8. [Milestones](#8-milestones)
9. [Risks](#9-risks)
10. [Open questions](#10-open-questions)
11. [Kick-off prompt](#11-kick-off-prompt)
- Appendices: A (starter vocabularies), B (AI prompt templates), C (glossary)

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Format | Standalone desktop app (not an Obsidian plugin). Personal use: no accounts, no code signing. |
| Shell | Tauri 2 (Rust) on WebView2 |
| UI | React + TypeScript (strict) + Vite |
| Canvas | PixiJS 8 (WebGL), with a DOM overlay for editing and video |
| Storage | A library folder the owner chooses: original files + one SQLite database (the source of truth) + automatic backups |
| Scale | Up to 10,000 items. Performance budgets are set for 10,000. |
| Content | Images, videos, PDFs, fonts, links, notes, color swatches; frames to group items |
| Classification | Type (one), Vibe (several), Movement (several), Tags (several), automatic colors, plus Artist, Source, "Why I saved this" and Favorite |
| Spaces | One Library map + project Boards. Each has search, a List/Details panel and Connections. |
| Connections | Up to 3 criteria at once, shown on hover by default. "Show all" uses hubs. Constellations is an automatic arrangement mode. Manual connections too. |
| Moodboards | Boards reference library items (no copies). Create them from a filter or a selection. Suggestions tray. PNG/PDF export. |
| AI | Offline only: CLIP through Transformers.js in a Web Worker. Models ship inside the installer. Suggestions are never applied automatically. |
| Network | The UI (webview) can't reach the internet (strict CSP). Rust fetches only when the owner adds a link or an image URL, and Offline mode turns that off. |
| Look | "Soft UI" on a deep plum canvas with a bullet-journal dot grid; accents from the stones in the reference image |
| Dev loop | Cloud sessions build and test a browser version (sql.js backend). GitHub Actions builds the Windows installer. |

---

## 1. Product

### 1.1 Vision
Designspace is a quiet, private place for visual inspiration. Saving something takes one gesture. Classifying it takes seconds, with offline AI suggestions. Finding it again is instant. Over time the collection shows its own structure (clusters by vibe, style lineages, recurring colors), and that structure feeds straight into moodboards for real projects.

### 1.2 Core use cases
| # | As the owner, I want to… | So that… |
|---|---|---|
| U1 | drag an image from a website (or paste a screenshot) onto the map and have it land where I drop it, with its source kept | capturing never interrupts browsing |
| U2 | sort new items in a fast, keyboard-driven Inbox, helped by suggestions | the collection stays classified without effort |
| U3 | wander the map, zoom anywhere, and hover an item to see what it relates to | I make associations and rediscover things |
| U4 | search "bauhaus poster", filter by vibe or color, and see matches light up while the rest fades | I find anything in seconds |
| U5 | switch to Constellations by Vibe + Movement | I see the clusters and bridges in my taste |
| U6 | filter, pick the best, create a Board, add notes and swatches, and export PNG/PDF | inspiration turns into a project moodboard |
| U7 | press Rediscover and fly to something I saved months ago | saved items don't sink into a graveyard |

### 1.3 UX principles (use these to settle any doubt)
1. **The map is home.** Everything else is a panel or an overlay on top of it. You never "leave" the canvas.
2. **Capture first, classify later.** Adding never asks questions. New items go to the Inbox.
3. **Never move the owner's items without consent.** Filters dim instead of reflowing. Automatic arrangement (Constellations) is a separate mode. Tidy and Arrange are explicit and undoable.
4. **Connections on demand.** Lines appear on hover or selection, never as a permanent tangle.
5. **Everything is undoable and nothing is lost.** Deleting goes to a Trash, and purging goes to the Windows Recycle Bin.
6. **Images are the stars.** The interface stays quiet and soft (but text always stays readable).
7. **Mouse-first, keyboard-fast.** Everything works with the mouse, and frequent actions have shortcuts.
8. **Local and private.** No account, no telemetry, no background network.

### 1.4 Scope
- **v1 (Milestones 0–7):** everything in §2.
- **Later (backlog):** phone capture by QR code over local Wi-Fi, browser extension, OCR (search text inside images), light "Stone" theme, auto-updater, HEIC/TIFF import, multilingual semantic search, WebGPU acceleration, snapping and alignment guides, board templates, macOS build.
- **Non-goals:** cloud sync, accounts, collaboration, mobile app, image editing beyond choosing covers, web publishing.

---

## 2. UX specification

### 2.1 Main window
```text
+----------------------------------------------------------------------------+
| [Library v]  [Inbox 12]  [Rediscover]                  [Settings]  [Panel] |
|                                                                            |
|  .    .    .    .    .    .    .    .    .    .    +--------------------+  |
|  .  +--------+   .   +-------+   .    .    .       | List  |  Details   |  |
|  .  | image  |   .   | video |   .  +-------+      | Group by: Vibe v   |  |
|  .  +--------+   .   +-------+   .  |  PDF  |      | o Dreamy (12)      |  |
|  .    .    .  +--------+   .    .   +-------+      | [] [] [] []        |  |
|  .    .    .  |  note  |   .    .    .    .        | o Bold (8)         |  |
|  .    .    .  +--------+   .    .    .    .        | [] [] []           |  |
|  .    .    .    .    .    .    .    .    .    .    | o No vibe (31)     |  |
|  .    .    .    .    .    .    .    .    .    .    | [] [] [] []        |  |
|                                                    +--------------------+  |
| +------+                                                                   |
| | mini |    ( + Add )   ( Search )   ( Connections )   | V | H | 42% v |   |
| +------+                                                                   |
+----------------------------------------------------------------------------+
```

| Region | Contents |
|---|---|
| Canvas | Full window. Deep plum with a dot grid. Shows the current **space**: the Library map or a Board. |
| Top-left | **Space switcher** (Library, recent boards, All boards…, + New board), **Inbox chip** with the number of unsorted items (hidden at 0), and **Rediscover**. |
| Top-right | **Settings** and the **Panel** toggle (L). |
| Bottom-center dock | **+ Add** (primary, amber), **Search**, **Connections**, then the tool toggle (**V** select / **H** hand) and the zoom menu (percentage → Zoom to fit, Zoom to selection, 100 %, Zoom in, Zoom out). |
| Bottom-left | **Minimap** (M): every item as a dot plus the viewport rectangle; click or drag to navigate. |
| Right panel | Resizable (300–520 px), collapsible, remembers its state. Two tabs: **List** and **Details**. Selecting something switches to Details, and clearing the selection switches back to List. Clicking a tab overrides this until the selection changes. |
| Selection toolbar | Floats above the selection: **Tag**, **Add to board ▾**, **New board**, **Similar** (from M6), **⋯**. |

The window uses native Windows decorations with the dark title-bar theme. The title is "Designspace — ‹library name›". A custom title bar is a later polish item.

### 2.2 Moving around the canvas
- **Mouse wheel:** zooms around the cursor, like a map. The "Wheel pans" setting switches to Figma-style (then Ctrl+wheel zooms).
- **Precision touchpad:** two-finger scroll pans and pinch zooms (Chromium sends a pinch as wheel events with `ctrlKey`). Detect a touchpad from pixel-mode, fractional or horizontal deltas; the setting can force a mode. Listen to `wheel` with `{ passive: false }` and call `preventDefault()` so WebView2 never zooms the page itself; keep Tauri's `zoomHotkeysEnabled` off.
- **Pan:** Hand tool (H) + drag, hold Space + drag with any tool, or drag with the middle mouse button.
- **Select tool (V):** click selects; Shift+click adds or removes; dragging on empty canvas draws a marquee; Ctrl+A selects everything visible (only the matches while a filter is on); Esc clears.
- **Double-click:** on an item → Focus view (notes: edit in place); on empty canvas → a new note at that spot (from M4).
- **Move:** drag; the arrow keys nudge 1 screen pixel (Shift = 10).
- **Resize:** corner handles. Media keep their aspect ratio; notes and frames resize freely.
- **Stacking:** dragged and new items come to the top. `]` / `[` bring forward or backward; Ctrl+] / Ctrl+[ bring to the front or back.
- **Zoom range:** 2 %–800 %. Shift+1 fits everything, Shift+2 fits the selection, Shift+0 goes to 100 %, and Ctrl+= / Ctrl+− zoom in and out.
- **Fly-to:** a 500 ms ease-in-out camera move (instant with reduced motion).
- **Right-click:** our own context menu (§2.4). Suppress the WebView's default menu and browser shortcuts that make no sense in an app (Ctrl+P, Ctrl+F, F5 in production).
- **Delete / Backspace:** on the Library map, moves the items to the Trash (toast "Moved 3 items to Trash · Undo"). On a Board, removes them from the board only (toast "Removed from board · Undo"); Shift+Delete moves them to the Trash.

### 2.3 Adding content
**Entry points**
- **+ Add** menu: Files… (Ctrl+O; opens the Pictures folder by default), Folder…, Paste, Link… (Ctrl+L, a small URL field), Note (N), Swatch. Items appear in the menu as their milestone lands.
- **Drag and drop** onto the canvas from File Explorer or a web browser. A soft overlay says "Drop to add", and items land at the drop point.
- **Ctrl+V anywhere:** image data (screenshots, "Copy image"), files copied in Explorer, URLs (→ Link, or an image if the URL points to one) and plain text (→ Note, from M4). Items land at the cursor, or at the viewport center if the cursor is outside the window.

**Supported files (v1)**
| Kind | Extensions |
|---|---|
| Image | jpg, jpeg, png, webp, gif, avif, bmp, svg |
| Video | mp4, webm, m4v, mov (plays when the codec is H.264, VP9 or AV1; otherwise a fallback tile) |
| PDF | pdf |
| Font | ttf, otf, woff, woff2 |

Anything else shows the toast "Designspace can't add .xyz files yet." HEIC and TIFF are in the backlog, and the message suggests exporting as JPG.

**Rules**
- Several items land as a compact grid of justified rows starting at the drop point.
- Folder import is recursive and asks first: "Add 342 files? (12 unsupported files will be skipped)". Above 200 files, the import runs as a background job.
- A progress card (bottom-right) shows "Adding 37 of 120…" with Cancel. Items appear at once as placeholders tinted with their dominant color, then sharpen.
- **Exact duplicates** (same SHA-256) aren't added again: the toast "Already in your library · Show" flies to the existing item. If that item is in the Trash, offer "Restore".
- **Near duplicates** (perceptual-hash distance ≤ 6 of 64 bits) are added with a ⚠ badge. Clicking it opens a side-by-side comparison with "Keep both" / "Move new one to Trash".
- **Source:** for an image dragged from a browser, store its URL as `source_url` (from `text/uri-list`, or the `<img src>` inside `text/html`). If the drag also carries the page URL, prefer that.
- **Links:** a non-image URL creates a Link item. Rust fetches the title, description, site name, favicon and preview image. Until that finishes, the card shows the domain. If it fails (offline, blocked site), the card stays a clean domain card, and the owner can set a cover by pasting or dropping an image onto it.
- **Image URLs:** if a pasted or dropped URL answers with `image/*`, download it and import it as an image, with `source_url` set to that URL.
- New media items go to the **Inbox**. Notes and swatches never do.
- After adding, the new items are **selected**, so the owner can tag them straight from the selection toolbar.
- When the current space is a Board, new media land on the Board at the drop point **and** on the Library map, in its arrival area (§4.9).

### 2.4 Item kinds and cards
| Kind | Card on the canvas | Default size (world units) | Focus view | Extras |
|---|---|---|---|---|
| Image | The image, radius 10, soft shadow | long side 320 | Zoom and pan, fit / 1:1, "Show original" | — |
| Video | Cover frame + ▶ badge + duration. Hovering (zoom ≥ 60 %) plays a muted looping preview, one video at a time. | long side 320 | Player with controls, loop, mute | "Set cover frame" scrubber |
| PDF | The chosen page + a "PDF · 24 p" badge | long side 320 | Scrolling page viewer with page navigation and zoom | Cover-page picker (thumbnail strip); "Split into pages" makes one item per page (new single-page PDFs) |
| Font | Dark card: large "Aa" in the font, the family name, one sample line | 320 × 200 | Type tester: editable text, size waterfall 12–96, glyph grid, sliders for variable axes, metadata (designer, foundry, license) | — |
| Link | Preview image (or custom cover) + footer: favicon · domain · 2-line title | 320 × 240 | Large cover, title, description, URL, "Open in browser" | Custom cover by paste or drop |
| Note | Colored card with rich text | 280 × auto | Edited in place (no Focus view) | Colors: cream (default), sage, blush, amber, lavender, plum (dark) |
| Swatch | Color block with its HEX and an optional name | 160 × 160 | — | Click copies the HEX |
| Frame | Translucent titled rectangle; items inside move with it | drawn by the owner | — | Frame tool (F) |

- **Badges:** ★ favorite, ⚠ possible duplicate.
- **Hover:** a slight lift.
- **Context menu:** Open, Add to board ›, Find similar (from M6), Connect to…, Copy image, Copy palette, Set cover (video/PDF), Show in Explorer, Back to Inbox, Bring to front / Send to back, Move to Trash.

### 2.5 Classification
| Field | Values | Notes |
|---|---|---|
| Type | one | What the item **is**: poster, photography, packaging… Starter list in Appendix A. |
| Vibe | several | How it **feels**: dreamy, bold, melancholic… |
| Movement | several (usually one) | A style label, historical or contemporary: Bauhaus, Art Deco, Swiss Style, Memphis, Y2K… |
| Tags | several | Everything else: subject, technique, project, keywords. Starts empty. |
| Colors | automatic | A 5-color palette with weights + color families (12: red, orange, yellow, green, teal, blue, purple, pink, brown, black, grey, white). Read-only, can be regenerated. |
| Artist / author | text | Autocompletes from existing values. |
| Source | URL | Filled automatically when possible; editable. |
| Why I saved this | text | Short, multi-line. |
| Favorite | on/off | |
| Title | text | Defaults to a cleaned-up file name or the link title. |
| Info | read-only | Kind, date added, dimensions, file size, duration, pages, file location. |

"Keywords" are simply Tags. Free-text search covers titles, notes and everything else.

**Vocabulary rules**
- Type, Vibe and Movement start with editable lists (Appendix A). Tags start empty.
- Names are unique per field, ignoring case and accents ("Rêveur" = "reveur"). Typing a new name and pressing Enter offers "Create 'x'".
- Autocomplete shows the most-used values first, then the rest alphabetically, and tolerates typos.
- **Vocabulary manager** (Settings → Vocabularies): rename, merge (items move to the target value), delete (asks first, undoable), reorder (this sets the number keys in Triage), and an optional **AI hint** per value: an English description the AI uses, e.g. "Rêveur" → "dreamy" (§2.13).

**Inbox rule:** a media item stays in the Inbox until it's sorted. Setting a Type or a Vibe marks it sorted, and so does "Done" in Triage. AI suggestions don't count until accepted. "Back to Inbox" (context menu) reverses it.

### 2.6 Details panel
**One item selected**
1. Preview (click → Focus view) and actions for the kind (Set cover, Split PDF, Open in browser…).
2. Title (inline editing).
3. Type: chips for the 8 most-used types + "More…" (single choice).
4. Vibe, Movement, Tags: chip inputs with autocomplete.
5. AI suggestions (from M6): dashed "✦" ghost chips under each field. Click to accept, × to dismiss, or "Accept all".
6. Colors: 5 swatches (click copies the HEX) and "Search this color".
7. Artist, Source (with an open icon), Why I saved this.
8. Favorite, the Boards containing the item (click to open), My connections with their labels, and "Find similar" (from M6).
9. Info and "Show in Explorer".

**Several items selected**
- An "N items" header and a mini collage.
- Type: set for all ("Mixed" when they differ).
- Vibe, Movement and Tags show the union with counts ("Dreamy 5/8"). Clicking a partial chip applies it to all; × removes it from all.
- Artist and Favorite: set for all.
- Actions: Add to board, New board from selection, Tidy up, Move to Trash.

Every change saves immediately and can be undone. A bulk action is one undo step.

### 2.7 Inbox and Triage
- The **Inbox chip** opens **Triage**, a full-screen overlay. The left 60 % shows a large preview: videos play muted, PDFs show the cover with its page picker, links show the cover and title. The right 40 % holds the classification fields and AI suggestions.
- **Keys** (when not typing in a field): 1–9 set the Type (the numbers show on the chips); V / M / T focus Vibe / Movement / Tags; A accepts all suggestions; S toggles favorite; Enter = Done and next; → = Skip; ← = Previous; Esc = exit. While typing, Enter adds the value and Esc leaves the field.
- The header shows progress ("12 of 48") and the order (oldest first by default, with a toggle for newest first).
- At the end: "Inbox zero ✦" and a "Back to map" button.

### 2.8 Search and filters
- **Open** with Ctrl+K, "/" or the Search button. A floating search bar appears at the top center, with the active filter chips underneath.
- **Free text** matches the title, type/vibe/movement/tag names, artist, source domain, "why", note text, font family, link title and description, and file name. It ignores case and accents, treats the last word as a prefix, and tolerates one typo in words of 5+ letters.
- **Filters** (chips from the "Filters" menu, or quick suggestions while typing, e.g. "Vibe: Dreamy"): Kind, Type, Vibe, Movement, Tags, Color family, Artist, Board (on a given board / on no board), Favorite, Inbox, Date added (today, 7 days, 30 days, this year, custom).
- **Logic:** AND between different fields, OR within a field (Vibe: Dreamy **or** Nostalgic). Alt+click a value to **exclude** it (shown as a struck-through chip).
- **"By meaning" results** (from M6): a section with visually matching items for the query (CLIP), with the toggle "Include visual matches".
- **On the canvas:** matches stay normal and everything else **dims to 12 %** and can't be clicked (Dim, the default) or disappears (Hide). The bar shows "124 of 3,210". "Frame results" zooms to fit the matches. The List panel shows only the matches.
- **Saved filters:** ★ saves the current search as a named filter. Saved filters appear in the search dropdown and at the top of the List panel.
- A filter stays active in its space until cleared, and the Search button shows a dot while one is on. Esc clears the text first, then closes the bar.
- **"Create board from results"** (from M4) takes up to 200 items. Beyond that, it asks to narrow the search or take the 200 most recent.

### 2.9 List panel
- **Header:** Group by (None, Type, Vibe, Movement, Tags, Color, Kind, Artist, Board, Month added), Sort (Newest, Oldest, Title A–Z), tile size (S/M/L = 56/88/132 px), and "Expand" for a full-window gallery.
- **Groups:** a header with the criterion's color dot, name, count and a collapse chevron. Items with several values appear in each of their groups. A "No vibe" (etc.) group comes last. Empty groups are hidden.
- **Hovering a group header** makes its items glow on the canvas while the rest dims. A "select" icon on the header selects the group's items on the canvas.
- **Tiles:** square thumbnails (center crop) with the title as a tooltip. Click → select on the canvas and fly to it (the panel switches to Details; the List tab keeps its scroll position). Double-click → Focus view.
- **On a Board:** a [This board | Library] switch. Dragging a Library tile onto the board adds that item at the drop point.
- **Saved filters** sit at the top (collapsible). Clicking one applies it.
- The list is virtualized (groups flattened into header rows and tile rows), so 10,000 items scroll smoothly.

### 2.10 Connections and Constellations
**Criteria:** Tags, Vibe, Type, Movement, Color, Similar look (AI, from M6) and My connections (manual). Up to **3** can be active at once; turning on a 4th shows "Up to 3 at a time. Turn one off first." Each criterion has a fixed color and line style (§3.2). Defaults: Vibe, Tags and My connections. The choice is remembered per space.

**Connections popover** (dock → Connections, or C):
- criteria toggles with their color legend;
- Display: **On hover** (default) or **Show all**;
- Strength: "Link items that share at least 1 / 2 / 3 things";
- the **✦ Constellations** switch.

**On hover (and on selection)**
- After hovering an item for 300 ms, lines go to up to 40 related items, ranked by the number of shared values (ties → newest).
- Each shared criterion gets its own thin line (up to 3 parallel, slightly offset lines).
- Unrelated items dim to 35 %.
- Hovering a line shows what the two items share, e.g. "Shared · Vibe: Dreamy · Tags: serif, grain".
- With several items selected, only the connections among them show.

**Show all**
- Each value shared by 2 or more visible items becomes a **hub**: a small labeled star at the center of its items.
- Each item gets faint lines to its hubs (n lines instead of n²). Hovering a hub makes its items glow.
- At most 5,000 lines are drawn. Beyond that, the popover says "Too many links. Filter first or use Constellations."

**Constellations** (Shift+C) is a second arrangement of the same items in the current space. It respects the active filter.
- The map morphs over 800 ms into clusters around hubs (§4.9), and "Back to my layout" morphs back. Constellation positions are never saved into My layout.
- Items show at a uniform size (long side 160) for readability. Hubs are glowing, labeled stars, and the dot grid fades to 50 % for a night-sky feel.
- Items can't be dragged here, but hubs can (the layout re-settles around them). Selecting, tagging, Focus view and the panels all still work, and changing an item's values re-settles it smoothly.
- Items with no value for the active criteria gather in a loose outer ring labeled "Unclassified".
- The same inputs always give the same layout (seeded).

**My connections (manual)**
- To create one, hover an item to reveal a small connect handle on its right edge and drag it to another item. Or use the context menu → Connect to… and click the target.
- Double-click a line to add a label ("same typography").
- Connections are stored globally, so they show wherever both items are.
- To delete one, select the line and press Delete.

**Tidy up** (selection toolbar and context menu, M1) arranges the selection in justified rows at its top-left corner, in the current sort order. It's undoable.

**Arrange by…** (M3, if time allows) permanently places the selection into labeled clusters by a field (e.g. by Vibe) on My layout. It's undoable and asks first above 50 items.

### 2.11 Boards (moodboards)
- A **Board** is its own infinite canvas holding **placements** of library items (never copies), plus the frames, notes and swatches created on it.
- The **Library map** is a special board that contains every media item. Notes and swatches belong to the space where they were created: a note made on a Board appears on that Board only, and is searchable there.

**Creating a board**
1. From a selection: selection toolbar → **New board** → name. The board opens with the items in justified rows. If a filter is active, it's saved as the board's *source filter*.
2. From search results: "Create board from results".
3. Empty: Space switcher → **+ New board**.

**Finding boards:** the Space switcher lists the Library, recent boards (with small covers) and "All boards…". That opens a gallery of board cards (a 4-item cover collage, name, item count, last edited) with rename, duplicate and delete. Deleting a board keeps its items in the library.

**On a board** you get the same canvas, tools, search (within the board), connections and List (with the [This board | Library] switch), plus:
- **Frame tool (F):** draw a frame, title it, move or resize it. Items inside move with it. Frames work on the Library map too.
- **Note (N)**, **Swatch**, and **Extract palette**, which turns the selection or the whole board into 5–8 swatch items.
- **Suggestions tray:** a collapsible strip above the dock. "More like this" shows library items that match the board's source filter (and, from M6, visually similar ones) and aren't on the board yet. Drag one in to add it; × dismisses it (remembered per board).
- **Remove from board** (Delete), which leaves the item in the library.
- **Export…:**
  - PNG: the whole board or one frame, at 1× or 2×, on plum with dots, plain plum or white.
  - PDF: the whole board fitted on one A4/A3 landscape page, or one page per frame.

**Deleting a board** moves it to the Trash, together with its board-only notes and swatches. It can be restored.

### 2.12 Focus view
Opens with a double-click or Enter: a full-window overlay with a dark scrim, the media centered, and a collapsible right column with the Details fields.
- ← / → go through the items in the current order: list order when opened from the List, otherwise the current results, newest first.
- Each kind has its own view (§2.4).
- Esc closes it and restores the camera.
- An item's `viewed_at` is updated when it's opened here or stays selected for 2 seconds (writes are batched). Rediscover uses it.

### 2.13 AI assistance (offline)
- **Where it appears:** ghost-chip suggestions in Details and Triage, **Find similar**, the **Similar look** criterion, the **By meaning** search section, and board suggestions.
- **Never automatic:** suggestions must be clicked. A dismissed suggestion doesn't come back for that item. Accepted values are stored with `via = 'ai'`.
- **Learns from you:** suggestions blend zero-shot CLIP (useful for a new library) with the nearest items you've already classified. The more you classify, the more they follow your taste (§4.10).
- **What's suggested:** Type (top 1), Vibe (up to 3), Movement (up to 2), Tags (up to 5, only tags you've used before).
- **Language:** CLIP understands English. Values in other languages work through their AI hint (the starter values ship with hints). Search by meaning works best with English queries.
- **Settings → AI:** on/off, "Analyze library" progress ("1,240 of 3,210 · Pause"), and suggestion amount (Fewer / Balanced / More).
- **Privacy:** the model runs inside the app. No image, text or statistic ever leaves the computer.

### 2.14 First run, settings and empty states
**First run**
1. Welcome: "Designspace, your private inspiration space. Everything stays on this computer."
2. "Where should your library live?" The default is `Documents\Designspace Library` (Browse… to change it). If the folder is inside OneDrive, Dropbox or Google Drive, warn: "Cloud-synced folders can damage the library database. Keep the library on this computer; you can send backups to the cloud instead (Settings → Library)."
3. "Bring in existing inspiration?" Pick folders, or Skip.
4. Land on the empty map.

**Empty states**
- Library map: a soft centered card: "Drop images anywhere, paste with Ctrl+V, or press + Add."
- Board: "Pull inspiration in: search your library (Ctrl+K) or drag from the List panel."
- Inbox done: "All sorted ✦".
- No search results: "Nothing matches. Try fewer filters." (plus "Search by meaning" from M6).

**Settings** (Ctrl+, opens a modal with a side menu)
- *Library:* location; open or create another library; recent libraries; backups (folder, extra destination, how many to keep, Back up now, Restore); Trash (empty automatically after 30 days, Empty now).
- *Canvas:* mouse wheel (Zoom / Pan), dot grid (Fine / Normal / Wide), minimap on/off, reduce motion (System / On / Off).
- *Content & network:* fetch link previews (on/off), download images from URLs (on/off), and **Offline mode**, which turns both off.
- *Vocabularies:* the vocabulary manager (§2.5).
- *AI:* see §2.13.
- *About:* version, item counts per kind, disk usage, "Open logs folder", and a **Diagnostics** page (the Drop inspector from spike S2 and future checks). Diagnostics is available in production builds too.

### 2.15 Keyboard shortcuts
Single-key shortcuts only work when the focus isn't in a text field. "?" shows this list in the app.

| Action | Keys |
|---|---|
| Search | Ctrl+K, / |
| Add files · Add link · New note | Ctrl+O · Ctrl+L · N |
| Paste | Ctrl+V |
| Select tool · Hand tool | V · H (hold Space = temporary hand) |
| Frame tool | F |
| Undo · Redo | Ctrl+Z · Ctrl+Shift+Z or Ctrl+Y |
| Move to Trash (Library) · Remove from board (Board) | Delete, Backspace |
| Move to Trash from a board | Shift+Delete |
| Select all | Ctrl+A |
| Focus view | Enter, double-click |
| Close · clear search · deselect | Esc |
| Zoom to fit · to selection · 100 % | Shift+1 · Shift+2 · Shift+0 |
| Zoom in · out | Ctrl+= · Ctrl+− (or Ctrl+wheel) |
| Connections popover · Constellations | C · Shift+C |
| List/Details panel · Minimap | L · M |
| Favorite | S |
| Rediscover · Inbox triage | R · I |
| Bring forward · backward · to front · to back | ] · [ · Ctrl+] · Ctrl+[ |
| Nudge | Arrow keys (Shift = ×10) |
| Settings · Shortcut list | Ctrl+, · ? |

### 2.16 Words and tone
- Short, warm and concrete. Buttons are verbs: "Add", "Create board", "Move to Trash".
- Every destructive action shows a toast with **Undo**.
- The same words everywhere: Library map, Board, Inbox, Details, Focus view, Connections, Constellations, My connections, Rediscover, Trash.
- The UI is in English. All strings live in `src/i18n/en.ts`, so a French version means translating one file.

---

## 3. Visual design system

### 3.1 Direction: soft UI on a night sky
The canvas is a deep plum with a bullet-journal dot grid, as in the owner's sketch. The interface floats above it as soft, rounded, gently raised surfaces, inspired by neumorphism and the "Dallo" reference: floating rounded panels, a pill-shaped search field, round icon buttons, calm spacing and wide display lettering. The pastel stones in the reference become the accent palette: sage, amber, blush and cream.

Two things deliberately differ from strict neumorphism, because it tends to be low-contrast and makes buttons hard to read:
- text and icons always meet contrast targets (§3.5);
- interactive states never rely on shadows alone: color, fill or outline always changes too.

Images are the brightest, most saturated things on screen.

### 3.2 Tokens
Define every token once in `src/design/tokens.css` (CSS custom properties) and mirror it in `src/design/tokens.ts` for Pixi. No hard-coded values anywhere else.

**Colors**
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#1E1024` | Canvas background (deep plum) |
| `--canvas-edge` | `#170B1C` | Subtle radial vignette at the edges |
| `--dot` | `rgba(236,222,245,0.16)` | Dot grid |
| `--surface-1` | `#2A1832` | Panels, dock |
| `--surface-2` | `#33203D` | Raised controls, inputs, chips |
| `--surface-3` | `#3D2847` | Hover |
| `--hairline` | `rgba(255,255,255,0.08)` | Dividers, panel edges |
| `--text-1` | `#F4EEF6` | Primary text |
| `--text-2` | `#C9BCD0` | Secondary text |
| `--text-3` | `#9A8BA3` | Muted text (≥ 4.5:1 on surface-1) |
| `--accent` | `#E9A845` | Amber: the primary action (Add), active states, the Inbox dot |
| `--on-accent` | `#2A1832` | Text on amber |
| `--sage` | `#93B89D` | Stone accent |
| `--blush` | `#F0B7B3` | Stone accent |
| `--cream` | `#EFE6D6` | Stone accent, selection outline, focus ring |
| `--lavender` | `#B7A6E8` | Extra accent |
| `--sky` | `#8CC6E6` | Extra accent |
| `--danger` | `#EE8A7C` | Destructive actions |

**Criterion colors** (lines, chips and list dots, always paired with a label)
| Criterion | Color | Line |
|---|---|---|
| Tags | sage | solid |
| Vibe | blush | solid |
| Type | amber | solid |
| Movement | cream | solid |
| Color | lavender | dotted |
| Similar look | sky | dashed |
| My connections | white at 90 % | solid, 2 px, optional label |

Lines are 1.5 px on screen at every zoom level, with opacity 0.7 on hover and 0.35 in Show all. A hovered line goes to 2.5 px.

**Color-family swatches** (for the Color filter and Color hubs): red `#E05A5A`, orange `#EE8E3A`, yellow `#EFD05A`, green `#6DBE6A`, teal `#4FB7A8`, blue `#5A8FE0`, purple `#9A6BE0`, pink `#E07AB8`, brown `#9A6B4B`, black `#1A1A1A`, grey `#8C8C8C`, white `#F2F2F2`.

**Shadows (soft UI on a dark background)**
| Token | Value |
|---|---|
| `--shadow-raised` | `-4px -4px 10px rgba(255,255,255,0.035), 6px 8px 18px rgba(8,2,12,0.55)` |
| `--shadow-float` | `0 12px 32px rgba(8,2,12,0.55), 0 2px 6px rgba(8,2,12,0.4)` |
| `--shadow-inset` | `inset 3px 3px 6px rgba(8,2,12,0.5), inset -2px -2px 5px rgba(255,255,255,0.04)` |
| `--shadow-card` | `0 6px 18px rgba(6,1,10,0.5)` (items on the canvas) |

**Typography**
- **UI: Manrope** (variable, 400–700), bundled through Fontsource. Sizes 12 / 13 / 14 (body) / 16 / 20 / 28; line-height 1.4; tabular figures for counts.
- **Display: Unbounded** (300–500), bundled through Fontsource. Used for the wordmark, board names in the switcher and gallery, and empty-state headings.
- **Hub labels:** Manrope 12, semibold, uppercase, letter-spacing 0.06em.
- Both are swappable tokens (`--font-ui`, `--font-display`). No font is ever loaded from the internet.

**Shape, spacing, icons, motion**
- Radius: 8 (small controls), 14 (inputs), 20 (panels, dock), 28 (overlays), 999 (pills, chips, round buttons). Canvas cards use 10 world units (never below 2 px on screen).
- Spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Icons: Lucide (`lucide-react`), 20 px, stroke 1.75.
- Motion: 120 ms for hover, 200 ms for panels, 320 ms for overlays, 500 ms for fly-to, 800 ms for the Constellations morph. Easing `cubic-bezier(0.2,0.8,0.2,1)` for entering and `cubic-bezier(0.4,0,0.2,1)` otherwise. With reduced motion (from the system or the setting), changes are instant or cross-fade.

### 3.3 Components
Build these in `src/design/components/` and show them together on a dev-only `/design` page:
Button (primary amber · secondary · ghost), IconButton (round, raised), Dock, Panel, Tabs/Segmented, Chip (field value with its criterion dot · removable filter · dashed ✦ suggestion · struck-through exclusion), ChipInput (autocomplete), SearchField (inset), Menu/Dropdown, Popover, Tooltip (500 ms delay), Toast (with Undo), Dialog, Slider, Toggle, ProgressBar, Kbd, Swatch, EmptyState.

Every interactive component has distinct states:
- **hover:** lighter surface;
- **pressed:** inset shadow;
- **focus-visible:** 2 px cream ring with a 2 px offset;
- **selected:** cream outline or amber fill;
- **disabled:** 40 % opacity.

The minimum hit target is 32 px.

### 3.4 Canvas visuals
- **Dot grid:** 1.6 px dots on a 24-unit world grid, drawn in CSS on the container behind a transparent Pixi canvas (background size and position follow the camera).
  - When dots get closer than 12 px on screen, show every 4th dot (cross-fade); when they're more than 96 px apart, subdivide.
  - The density setting multiplies the base spacing, and a subtle radial vignette darkens the edges.
- **Items:** radius 10 and the card shadow. At far zoom (item smaller than 24 px on screen), no shadow and no radius.
- **Selection:** a 2 px cream outline (constant on screen) with corner handles, and a dashed bounding box around multiple items.
- **Hover:** a slight lift (stronger shadow, scale 1.01), skipped at far zoom.
- **Dimmed:** 12 % (search) and 35 % (connection focus).
- **Hubs:** a 10 px star with a soft glow (pre-rendered texture) and a label pill (surface-2, text-1) underneath. Size grows with √(item count).
- **Frames:** fill `rgba(255,255,255,0.03)`, hairline border, title above the top-left corner (Manrope 13 semibold).
- **Notes:** a cream card with dark text by default; the other colors are light tints of sage, blush, amber and lavender, plus a dark plum note with light text.

### 3.5 Accessibility
- Text contrast ≥ 4.5:1; large text and icons ≥ 3:1.
- Every panel and dialog works with the keyboard, with a visible focus ring and a logical focus order.
- Colors are always paired with a label or legend, and each criterion has its own line style.
- Reduced motion is respected.

---

## 4. Architecture

### 4.1 Overview
```text
+------------------------------- Tauri window (WebView2) --------------------------------+
| React UI: dock, panels, dialogs             Canvas engine: PixiJS (imperative)         |
|        |       ^                                   ^              |                    |
|        v       | subscribe                  render |              | input events       |
| +------- Zustand stores: library, space, selection, filters, connections, ui --------+ |
|        |                        |                               |                      |
|        | commands (undoable)    | queries                       | jobs                 |
|        v                        v                               v                      |
| Repositories (SQL)        Search index (MiniSearch)      Workers: ingest, layout, AI   |
|        |                                                                               |
| Platform:  TauriPlatform (desktop)   |   BrowserPlatform (dev & tests, sql.js)         |
+----------------------------------------------------------------------------------------+
          | IPC (invoke, binary payloads)  +  media:// protocol (files, thumbnails, models)
          v
+----------------------------------------------------------------------------------------+
| Rust (thin): SQLite bridge (rusqlite) | import, hash, purge | media:// server          |
| (Range, CORS, CORP) | link metadata + image download (reqwest, explicit only)          |
| backups (VACUUM INTO) | dialogs, opener, clipboard, window state, logs                 |
+----------------------------------------------------------------------------------------+
   Library folder: designspace.db, media/, backups/     App data: cache/, logs/, settings
```

**Example flow: dropping an image from a browser onto a Board**
1. The canvas container receives an HTML5 `drop` event (Tauri's native drop handling is turned off, §4.4). The handler reads `DataTransfer`: a `File` if there is one, otherwise the image URL from `text/uri-list` or `text/html`.
2. The `addItems` command runs `platform.media.importFile(file)`, which streams the file to Rust in 8 MB chunks (or `platform.media.importUrl(url)`). Rust copies it into `media/2026/09/…`, hashes it, and reports any duplicate.
3. In one transaction, the command inserts the `items` row, a placement on the Board at the drop point and one in the Library map's arrival area, then updates the stores. The engine shows a tinted placeholder.
4. The ingest worker generates the thumbnails, palette, color families and pHash, writes the thumbnails to the cache and updates the item. The engine swaps the placeholder for the texture.
5. With AI on, the AI worker computes the embedding and the Details panel shows suggestions.
6. Ctrl+Z undoes steps 2–3: the item goes to the Trash and its placements are removed. Redo restores them.

### 4.2 Tech stack
Versions were current on 2026-09-27; confirm them before scaffolding.

| Layer | Choice |
|---|---|
| Desktop shell | **Tauri 2** (2.11.x) + official plugins: dialog, opener, clipboard-manager, single-instance, window-state, log. App identifier: `com.anymaria.designspace`. |
| Rust | Stable (1.94+): `rusqlite` (feature `bundled`), `sha2`, `infer`, `reqwest` (rustls), `scraper`, `serde`/`serde_json`, `thiserror`, `walkdir`, `trash` (Recycle Bin) |
| UI | **React**, **TypeScript** (strict), **Vite**, **Zustand** (latest stable versions) |
| Canvas | **PixiJS 8** (8.19+). Its official agent skills ship in `node_modules/pixi.js/skills/`; read them before writing canvas code. |
| Layout & geometry | `d3-force` (Constellations), `rbush` (spatial index) |
| Search | `minisearch` |
| List virtualization | `@tanstack/react-virtual` |
| Notes | **TipTap** (StarterKit) + `dompurify` |
| PDF | `pdfjs-dist` (rendering), `pdf-lib` (splitting pages) |
| Fonts | `fontkit` or `opentype.js` for metadata (decided in spike S6: WOFF2 name tables); the `FontFace` API for rendering |
| Color | `culori` (OKLab/OKLCH, ΔE) |
| Export | `jspdf` |
| Icons & type | `lucide-react`; Fontsource packages for Manrope and Unbounded (bundled) |
| AI | **`@huggingface/transformers` 4.x** (CLIP, WASM backend; WebGPU later). Hugging Face publishes a transformers.js agent skill in `github.com/huggingface/skills`. |
| IDs | `ulid` |
| Browser dev backend | `sql.js` + IndexedDB |
| Tooling | pnpm, ESLint (typescript-eslint), Prettier, Vitest, Testing Library, Playwright, `cargo fmt`, `clippy` |

**Rejected:** Electron (≈ 100 MB installs, heavier), React Flow (DOM nodes don't scale to 10,000 images), tldraw (license terms, and more than we need), an Obsidian plugin (see §0).

### 4.3 Frontend modules (`src/`)
| Folder | Responsibility |
|---|---|
| `app/` | Bootstrapping, providers, top-level layout, space routing, global shortcuts |
| `design/` | Tokens, global CSS, components, the `/design` page |
| `platform/` | The `Platform` interface; `tauri/` and `browser/` implementations; `seed/` demo and bench data |
| `db/` | Migrations (`migrations/NNN_name.sql`), the migrator, repositories (items, terms, boards, placements, frames, connections, filters, embeddings, settings) |
| `state/` | Zustand stores: `library` (items, terms, indexes), `space` (current board, placements, camera), `selection`, `filters`, `connections`, `ui`, `jobs` |
| `commands/` | Undoable commands and the history |
| `canvas/` | The engine (§4.6): camera, input, scene layers, LOD and texture manager, spatial index, DOM overlay, background, export |
| `features/` | add, ingest (UI), search, list, details, triage, focus, connections, constellations, boards, notes, vocab, ai, settings, trash, onboarding, rediscover, diagnostics |
| `workers/` | `ingest.worker.ts`, `layout.worker.ts`, `ai.worker.ts` |
| `lib/` | ids, normalize (case + accents), color (palette k-means, families, ΔE), geometry, packing (justified rows, free-space search), phash, queues, logger |
| `i18n/` | `en.ts` |

### 4.4 Rust side (`src-tauri/` and `crates/designspace-core/`)
Keep Rust thin. Pure logic (path safety, slugs, hashing, HTML meta parsing, backup rotation) lives in `crates/designspace-core`, which doesn't depend on Tauri and has unit tests. `src-tauri` wires up the commands, plugins and protocol.

**Window configuration**
- `dragDropEnabled: false`. Tauri's native handler would otherwise swallow the HTML5 drag-and-drop events that browser and Explorer drops depend on.
- Dark theme, `zoomHotkeysEnabled: false`, window-state restore, single instance.

**Commands.** All return `Result<T, AppError>`, serialized as `{ code, message }`.

| Group | Commands |
|---|---|
| Library | `library_create(path)`, `library_open(path)`, `library_close()`, `library_info()`, `recent_libraries()`. Creating a library makes `media/`, `backups/`, the DB and `README.txt`. Keep one open connection. |
| DB bridge | `db_select(sql, params) → rows`, `db_execute(sql, params) → { changes }`, `db_batch(statements) → ()` (one transaction). Connection settings: WAL, `foreign_keys=ON`, `busy_timeout=5000`. |
| Embeddings | `embeddings_put(model, packed_bytes)`, `embeddings_load(model) → packed_bytes`. Binary IPC, so vectors never go through JSON. |
| Media | `media_import_paths(paths)`, `media_import_begin(name, size) → token`, `media_import_chunk(token, bytes)`, `media_import_finish(token)` and `media_import_bytes(name, bytes)` all return `{ relPath, hash, size, mime, duplicateOf? }`. Also `media_reveal(relPath)` and `media_purge(relPaths)` (→ Recycle Bin). |
| Cache | `cache_put(key, bytes)`, `cache_has(keys) → bool[]`, `cache_delete(prefix)`. The root is `cache/<libraryId>/` inside the app's local data folder (§5.1). |
| Network | `net_link_meta(url) → { finalUrl, title, description, siteName, imageUrl, faviconUrl }` and `net_download_image(url)` (returns an import result). Limits: http(s) only, ≤ 5 redirects, 20 s timeout, images ≤ 50 MB, HTML ≤ 5 MB, user agent `Designspace/‹version›`. Refused when Offline mode is on. |
| Backups | `backup_now()` (`VACUUM INTO`), `backup_list()`, `backup_restore(id)` (saves the current DB as `pre-restore-…` first). Rotation keeps 14 daily + 8 weekly; optional extra destination. |
| App | `app_paths()`, `open_logs()` |

**The `media://` protocol.** Register it with `register_asynchronous_uri_scheme_protocol`. The frontend builds URLs with `convertFileSrc(path, 'media')`, which becomes `http://media.localhost/…` on Windows.
- `media://original/‹relPath›` serves library files, with HTTP **Range** support (video seeking, PDF streaming).
- `media://cache/‹key›` serves thumbnails and posters.
- `media://models/‹path›` serves the bundled AI model files (from the resource folder).
- Every response sets `Content-Type`, `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`. Cache keys are content-addressed, so they also get `Cache-Control: max-age=31536000, immutable`.
- Path safety: canonicalize every path and reject anything that escapes its root.
- Why not the built-in asset protocol: `fetch()` and WebGL textures from it hit CORS problems, and we need headers compatible with COEP (§4.12).

### 4.5 Platform abstraction
```ts
interface Platform {
  kind: 'tauri' | 'browser';
  db: {
    select<T>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
    batch(statements: { sql: string; params?: unknown[] }[]): Promise<void>;
  };
  library: {
    current(): LibraryInfo | null;
    create(path?: string): Promise<LibraryInfo>;
    open(path?: string): Promise<LibraryInfo>;
    recent(): Promise<LibraryInfo[]>;
  };
  media: {
    importPaths(paths: string[]): Promise<ImportResult[]>;
    importFile(file: File, onProgress?: (p: number) => void): Promise<ImportResult>; // chunked
    importBytes(name: string, bytes: Uint8Array): Promise<ImportResult>;
    importUrl(url: string): Promise<ImportResult>;
    originalUrl(relPath: string): string;
    reveal(relPath: string): Promise<void>;
    purge(relPaths: string[]): Promise<void>;
  };
  cache: {
    put(key: string, bytes: Uint8Array): Promise<void>;
    has(keys: string[]): Promise<boolean[]>;
    url(key: string): string;
  };
  net: { linkMeta(url: string): Promise<LinkMeta>; enabled(): boolean };
  embeddings: {
    put(model: string, entries: [itemId: string, vector: Float32Array][]): Promise<void>;
    load(model: string): Promise<Map<string, Float32Array>>;
  };
  backups: { now(): Promise<BackupInfo>; list(): Promise<BackupInfo[]>; restore(id: string): Promise<void> };
  dialogs: {
    openFiles(filters?: FileFilter[]): Promise<string[]>;
    openFolder(): Promise<string | null>;
    saveFile(defaultName: string, bytes: Uint8Array): Promise<boolean>;
  };
  shell: { openExternal(url: string): Promise<void> };
  clipboard: { readImage(): Promise<Uint8Array | null>; readText(): Promise<string | null> };
}
```
- **TauriPlatform** uses `invoke` and the `media://` protocol.
- **BrowserPlatform** is for development and tests only:
  - sql.js runs the same SQL and migrations, persisted to IndexedDB (debounced);
  - media and cache blobs live in IndexedDB and are served as object URLs;
  - `net.linkMeta` returns a stub, and `importPaths` is unsupported (the file picker uses `<input type=file>`).
- **URL flags** (BrowserPlatform):
  - `?seed=demo` loads about 60 generated demo items (procedural posters, gradients, shapes and typography drawn on a canvas, no external assets);
  - `?bench=10000` creates 10,000 synthetic items for performance work.
- The platform is chosen at startup by checking `'__TAURI_INTERNALS__' in window`.

### 4.6 Canvas engine (`src/canvas/`)
The engine is a framework-agnostic, imperative module. React mounts it in `<CanvasView>` and connects stores and engine through subscriptions, so nothing re-renders in React per frame.

- **Pixi setup:** an `Application` sized to its container, with `antialias`, `autoDensity`, `resolution = devicePixelRatio`, a transparent background (the dot grid is CSS behind it) and a WebGL preference.
- **Layers:** a world container transformed by the camera holds, bottom to top, lines → items → hubs and labels → selection. A screen-space layer holds UI such as the marquee.
- **Camera:** a small custom camera: zoom at a point, pan, optional inertia, `flyTo(rect)`, world↔screen transforms, events. `pixi-viewport` is an acceptable alternative.
- **Culling:** an `rbush` index of item bounds. On every camera change (throttled to animation frames), query the viewport plus a 20 % margin and toggle `visible`/`renderable`. Only visible items request textures.
- **Level of detail and texture budget:**

  | Item's long side on screen | Drawn as |
  |---|---|
  | < 24 px | A flat rectangle in the item's dominant color (no texture) |
  | 24–160 px | The `t128` thumbnail |
  | 160–600 px | The `t512` thumbnail |
  | > 600 px | `t1600`, generated on demand (at most about 12 visible at once) |

  A texture manager decodes through `fetch → blob → createImageBitmap`, with at most 6 decodes in flight, visible items first and nearby items next. It keeps an LRU cache under a GPU budget (384 MB by default) and destroys evicted textures. Spike S1 decides whether `t128` needs atlases.
- **Text:** font cards, link footers and hub labels use Pixi `Text` (canvas text; fonts come from `FontFace`). Re-rasterize them at resolution steps of 1×/2×/4× as the zoom changes, debounced by 150 ms. Notes use `HTMLText` by default; spike S4 compares it with the `pixi.js/html-source` subpath and a custom canvas layout.
- **Interaction:** Pixi's federated events hit-test items (lines only while hovered). Marquee, multi-item drag, resize handles, the connect handle and hub dragging are custom. Wheel and gestures are handled on the DOM container.
- **DOM overlay:** a positioned layer above the canvas for the TipTap note editor, the hover video element, the connect handle and the selection toolbar anchor. It is re-positioned on each camera change.
- **Engine API (sketch):**
  - methods: `setScene`, `patch(diff)`, `setDim(ids | null, mode)`, `setLines(lines)`, `setHubs(hubs)`, `setSelection(ids)`, `animatePositions(map, ms)`, `flyTo(rect)`, `exportImage(rect, scale)`;
  - events: `select`, `move`, `resize`, `dblclick`, `contextmenu`, `hover`, `camera`, `drop`.
- **Export:** render the target rectangle into `RenderTexture` tiles of at most 4096 px at the chosen scale and stitch them together. The result becomes a PNG, or goes into a PDF through jsPDF. Load `t1600` (or the originals) for the exported items first.

### 4.7 Ingest pipeline
1. Rust stores the original (§4.4). The command creates the `items` row with `status = 'pending'`, plus its placements.
2. A pool of 2–3 `ingest.worker`s processes one job per item:
   - **Image:**
     1. `createImageBitmap` (SVG is first rasterized through an `Image` at 1024 px on the main thread); GIFs use their first frame.
     2. Record the dimensions, then downscale in high quality to `t128` and `t512` (WebP, quality 0.82, with `OffscreenCanvas.convertToBlob`).
     3. Compute the palette (k-means in OKLab on a 64 × 64 sample, k = 5, with weights), the color families (OKLCH rules, §3.2) and a 64-bit DCT pHash.
     4. `cache.put` the thumbnails and update the row (`status = 'ok'`, `derived_v`).
   - **Video:**
     - A main-thread helper loads the `<video>` metadata (duration, size) and seeks to `poster_ms` (default: 10 % of the duration).
     - It draws that frame to a bitmap and hands it to a worker.
     - If the codec is unsupported: `status = 'unsupported'`, a fallback tile, and "Open in default player".
   - **PDF:** pdf.js reads the page count and renders the cover page at 1600 px wide, then the bitmap goes to a worker. "Split into pages" uses pdf-lib to make one single-page PDF per page, each a new item.
   - **Font:** parse the metadata (family, subfamily, full name, designer, manufacturer, license, glyph count, variable axes), register a `FontFace`, and render a specimen thumbnail for far zoom and list tiles.
   - **Link:** `net_link_meta`, then download the `og:image` as the cover (`cover_path`) and make thumbnails from it.
3. With AI on, queue an embedding from the `t512` bitmap (§4.10).
4. **Resumable:** at startup, re-queue items with `status = 'pending'` or `derived_v < CURRENT_DERIVED_V`. Bump `CURRENT_DERIVED_V` to regenerate derivatives after an algorithm change.
5. `t1600` is generated on demand (Focus view, deep zoom, export) and cached.

### 4.8 Search engine
- **Text index:** MiniSearch over the item fields title, termNames, artist, sourceDomain, why, bodyText, fontFamily, linkTitle, linkDescription and fileName, with termNames boosted ×3 and title ×2.
  - Tokens are normalized (lowercase, NFD with diacritics stripped).
  - The last token is matched as a prefix, and tokens of 5+ characters get fuzzy 0.2.
- **Facet filters** use prebuilt sets: `termId → Set<itemId>`, `kind → Set`, `colorFamily → Set`, `boardId → Set`, favorite, inbox and date buckets.
  - Evaluation: union within a field, intersection across fields, then subtract the exclusions.
  - If there's text, intersect with the text results.
- Facet counts are computed on the current results, for the Filters menu.
- Updates are incremental on item changes (MiniSearch `replace`/`discard` plus set updates).
- Budget: ≤ 30 ms per keystroke at 10,000 items (a benchmark test).

```ts
type Facet = 'type' | 'vibe' | 'movement' | 'tag';
type Filter = {
  text?: string;
  kinds?: Kind[];
  include?: Partial<Record<Facet, string[]>>; // term ids: OR within a facet, AND across facets
  exclude?: Partial<Record<Facet, string[]>>;
  colors?: ColorFamily[];                     // OR
  artists?: string[];
  boards?: { in?: string[]; none?: boolean };
  favorite?: boolean;
  inbox?: boolean;
  added?: { from?: string; to?: string };     // ISO dates
  visualMatches?: boolean;                    // include AI "by meaning" results (M6)
};
```

### 4.9 Connection and layout algorithms
For the active criteria C (at most 3), each item *i* has a value set V_c(i) per criterion:
- **Tags, Vibe, Type, Movement:** term ids.
- **Color:** color families with weight ≥ 15 %.
- **Similar look:** the top-8 neighbors with cosine ≥ τ_sim (default 0.85).
- **My connections:** its manual connections.

**Hover**
- Candidates are every item sharing a value with *i* (from the inverted index), plus its manual and similar neighbors.
- `score(j) = Σ_c |V_c(i) ∩ V_c(j)|`, +1 per manual connection, + the cosine for similar neighbors.
- Keep candidates with `score ≥ minStrength` and take the top 40 (ties → newest), with one line per shared criterion.
- It must compute in under 16 ms.

**Show all:** hubs are the values with 2 or more visible items, placed at the centroid of their items. Edges go from items to hubs, capped at 5,000.

**Constellations** runs in `layout.worker` with a seeded PRNG, so results are deterministic. The seed is a hash of the criteria and item ids, passed to d3-force's `randomSource`.
1. Build the hubs for the active criteria. A value with only one item doesn't create a hub.
2. Lay out the hub graph with d3-force on hubs only, 300 ticks:
   - weight(h1, h2) = the number of items sharing both hubs;
   - charge ∝ −√size, link distance decreasing with weight, collide radius ∝ √size.
3. Place each item at the weighted average of its hubs, plus seeded jitter:
   - single-hub items sit on rings around their hub;
   - multi-hub items land in between;
   - items without a hub go to an outer ring.
4. Relax with the hubs fixed: collide (uniform card size, long side 160) plus a weak x/y pull toward the targets, 120 ticks.
5. Return the positions, and the engine tweens to them (800 ms). Similar look adds item-to-item link forces instead of hubs.

Budget: ≤ 1.5 s for 3,000 items and ≤ 5 s for 10,000. Show a subtle "Arranging…" and keep the old view until the new one is ready.

**Justified rows** (Tidy up, new boards, multi-item drops): target row height 240, gaps of 16, aspect ratios preserved.

**Arrival area** (free-space search): spiral outward from a target point, test candidate rectangles against the rbush index, and place the item at the first free spot. On the Library map, the target is the last arrival point, or the viewport center if that point is off-screen.

### 4.10 AI pipeline (M6)
**Model and bundling**
- **Model:** CLIP ViT-B/32 in ONNX, quantized, e.g. `Xenova/clip-vit-base-patch32` (vision + text encoders, about 150 MB; verify). Spike S7 also evaluates MobileCLIP variants (smaller and faster) if transformers.js supports them.
- **Bundled, never downloaded at runtime:**
  - `scripts/fetch-models.mjs` downloads the model files at build time into `src-tauri/resources/models/` (gitignored, cached in CI), and they ship via `bundle.resources`.
  - ONNX Runtime's WASM files are copied into `public/ort/`.
  - At runtime: `env.allowRemoteModels = false`, `env.allowLocalModels = true`, `env.localModelPath` = the `media://models/` URL from `convertFileSrc` (`http://media.localhost/models/` on Windows), and `env.backends.onnx.wasm.wasmPaths = '/ort/'`.
- **Threads:** COOP/COEP (§4.12) enable `SharedArrayBuffer`, so use `numThreads = min(4, hardwareConcurrency / 2)`; without cross-origin isolation, use 1 thread.

**Worker and embeddings**
- **Worker:** `ai.worker.ts` lazily loads `CLIPVisionModelWithProjection` + `AutoProcessor` for images and `CLIPTextModelWithProjection` + `AutoTokenizer` for text, on device `wasm` (WebGPU later).
- **Embeddings:** one L2-normalized `Float32Array(512)` per item, stored in `embeddings` and loaded into one contiguous matrix in the worker. 10,000 × 512 floats is about 20 MB, and a brute-force cosine search takes under 50 ms.
- **Background analysis:** one image at a time, at low priority. It pauses while the owner drags or pans, resumes where it left off, and reports progress in Settings → AI.
- **Value embeddings:** for each value, fill its field's prompt templates (Appendix B) with its AI hint (or its name), then average and normalize. They're cached and recomputed when a vocabulary changes.

**Suggestions for item *i* in field *f***
- Zero-shot: `s_z(t) = softmax_t(100 · cos(e_i, e_t))` over the field's values.
- Personal: `s_k(t) = Σ_{j ∈ N, t ∈ terms(j)} cos(e_i, e_j) / Σ_{j ∈ N} cos(e_i, e_j)`, where N is the 15 nearest classified items.
- Blend: `s = α·s_z + (1 − α)·s_k`, with `α = max(0.25, 1 − labeled_in_field / 150)`.
- Balanced thresholds:
  - Type: top 1 if s ≥ 0.35;
  - Vibe: top 3 with s ≥ 0.20;
  - Movement: top 2 with s ≥ 0.25;
  - Tags: personal score only, top 5 with s_k ≥ 0.30.
- Fewer/More shift the thresholds by ±0.1. Values already assigned or dismissed are excluded.

**Other features and tests**
- **Find similar:** the top 30 by cosine (≥ 0.75, to tune).
- **Search by meaning:** embed the query text, then return the top 50 items with cosine ≥ 0.22 (CLIP scale, to tune).
- **Tests:** a `FakeEmbeddingProvider` (deterministic vectors with controllable similarity) for unit and e2e tests. huggingface.co is blocked in cloud sessions, so the real models are only exercised in Windows builds.

### 4.11 State, undo and persistence
- The in-memory stores are the working truth. Every change is a **Command** `{ label, do(), undo() }`. It updates the stores optimistically and persists through the repositories in one `db.batch` transaction. If persisting fails, revert the stores and show an error toast.
- The history keeps 200 steps.
  - Drags and resizes only update the engine while moving and commit one command on pointer-up.
  - Text fields commit on blur or Enter.
  - A bulk edit is one command.
- Deletes are soft (`deleted_at`) and undoable. The Trash view restores items or deletes them forever. After 30 days, auto-purge deletes the rows and sends the files to the Windows Recycle Bin.
- Each space's camera is saved with a 1 s debounce. The last space and camera are restored at startup.
- **Startup:** load non-deleted items, terms, item_terms, the current space's placements and frames, connections and saved filters. Then build the indexes and render. Target: ≤ 2 s at 10,000 items.

### 4.12 Security and offline guarantees
- **CSP** (`app.security.csp`, written as a single line in `tauri.conf.json`). With this, the webview has no route to the internet:
  ```
  default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: media: http://media.localhost;
  media-src 'self' blob: media: http://media.localhost; font-src 'self' blob: data: media: http://media.localhost;
  connect-src 'self' ipc: http://ipc.localhost media: http://media.localhost;
  object-src 'none'; frame-src 'none'; base-uri 'none'
  ```
  Check the exact custom-protocol origins on Windows in spike S3.
- **Headers** (`app.security.headers`, mirrored in Vite's `server.headers`): `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. This is why `media://` responses carry `Cross-Origin-Resource-Policy: cross-origin`.
- **Capabilities (ACL):** only our commands and the plugins listed in §4.2. No generic fs, shell or http plugin is exposed to the webview.
- **Network** exists only in Rust `net_*` commands, triggered by explicit owner actions and turned off by Offline mode.
- **Files:** every command and protocol request checks paths, and originals are never modified.
- **Content:** note HTML is sanitized with DOMPurify, and SVGs are only rendered as images, never inlined.
- **No telemetry and no crash uploads.** Logs stay local (tauri-plugin-log, rotated).

### 4.13 Performance budgets
Measured on a mid-range Windows laptop with integrated graphics, using `?bench=10000` or a real library.

| Metric | Budget |
|---|---|
| Cold start to interactive, 10,000 items | ≤ 2.0 s |
| Pan/zoom frame time p95, 10,000 items on screen | ≤ 16.7 ms (never > 33 ms) |
| Search keystroke → canvas updated | ≤ 50 ms |
| Importing ~3 MB JPEGs | ≥ 5 items/s, with the UI at ≥ 50 fps |
| Hover connections compute | < 16 ms |
| Constellations | ≤ 1.5 s (3,000 items) · ≤ 5 s (10,000) |
| Memory while browsing 10,000 items | ≤ 1.2 GB |
| AI background analysis | ≥ 2 images/s (verify in S7) |

CI has no GPU, so it checks behavior, not performance. Check performance with the bench page and on the owner's PC at the end of M0, M1 and M7. The soft limit is 10,000 items: at 9,500 the app shows a friendly note, but nothing blocks.

---

## 5. Data

### 5.1 Library folder
```
Designspace Library\             chosen by the owner (default: Documents\Designspace Library)
  designspace.db                 all metadata: SQLite in WAL mode, the source of truth
  designspace.db-wal, -shm       SQLite working files (leave them alone while the app runs)
  media\
    2026\09\bauhaus-poster-3f9k2a.jpg      originals, never modified
    2026\09\reel-inspiration-8d1c0e.mp4
    covers\                      link preview images
  backups\
    designspace-2026-09-27-1830.db
  README.txt                     "This folder is a Designspace library…"
```
- **File names** are `‹slug of the original name›-‹6 characters of the id›.‹ext›`, in year/month folders.
- **Per-machine data** (can be regenerated) lives in the app's local data folder (Tauri `app_local_data_dir`, e.g. `%LOCALAPPDATA%\com.anymaria.designspace\`):
  - `cache\‹libraryId›\`: thumbnails, posters, PDF renders, specimens;
  - `logs\`;
  - `settings.json`: recent libraries, window, machine preferences.
- **AI models** are inside the installed app's resources.

### 5.2 Schema (migration `001_init.sql`)
```sql
PRAGMA foreign_keys = ON;

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- schema_version, library_id, created_at, settings (JSON)
);

CREATE TABLE boards (
  id            TEXT PRIMARY KEY,                 -- ULID
  kind          TEXT NOT NULL CHECK (kind IN ('library','board')),  -- exactly one 'library' row
  name          TEXT NOT NULL,
  source_filter TEXT,                             -- JSON Filter used to create the board
  settings      TEXT,                             -- JSON: background, connection criteria, dismissed suggestions
  camera        TEXT,                             -- JSON { x, y, zoom }
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

CREATE TABLE items (
  id              TEXT PRIMARY KEY,               -- ULID (sorts by creation time)
  kind            TEXT NOT NULL CHECK (kind IN ('image','video','pdf','font','link','note','swatch')),
  title           TEXT NOT NULL DEFAULT '',
  file_path       TEXT,                           -- relative to the library root
  file_name       TEXT,                           -- original file name
  file_hash       TEXT,                           -- SHA-256 hex of the original
  file_size       INTEGER,
  mime            TEXT,
  width           INTEGER,
  height          INTEGER,
  duration_ms     INTEGER,                        -- video
  poster_ms       INTEGER,                        -- video cover frame
  page_count      INTEGER,                        -- pdf
  cover_page      INTEGER,                        -- pdf, 1-based
  cover_path      TEXT,                           -- link preview image (relative)
  url             TEXT,                           -- link URL
  source_url      TEXT,                           -- where the media came from
  artist          TEXT,
  why             TEXT,                           -- "Why I saved this"
  body            TEXT,                           -- note: TipTap JSON
  body_text       TEXT,                           -- note: plain text for search
  color           TEXT,                           -- swatch HEX or note color token
  font_meta       TEXT,                           -- JSON
  link_meta       TEXT,                           -- JSON
  palette         TEXT,                           -- JSON [{ hex, weight }]
  color_families  TEXT,                           -- JSON ["blue", …]
  phash           TEXT,                           -- 16 hex characters
  favorite        INTEGER NOT NULL DEFAULT 0,
  sorted_at       TEXT,                           -- NULL = in the Inbox (media kinds only)
  viewed_at       TEXT,                           -- last Focus view or long selection (Rediscover)
  origin_board_id TEXT REFERENCES boards(id),     -- board-only notes/swatches; NULL = library
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','unsupported','error')),
  derived_v       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX items_kind    ON items(kind);
CREATE INDEX items_created ON items(created_at);
CREATE INDEX items_hash    ON items(file_hash);

CREATE TABLE terms (
  id         TEXT PRIMARY KEY,
  facet      TEXT NOT NULL CHECK (facet IN ('type','vibe','movement','tag')),
  name       TEXT NOT NULL,
  name_norm  TEXT NOT NULL,                       -- lowercase, accents stripped
  ai_hint    TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (facet, name_norm)
);

CREATE TABLE item_terms (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  term_id  TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  via      TEXT NOT NULL DEFAULT 'user' CHECK (via IN ('user','ai')),
  added_at TEXT NOT NULL,
  PRIMARY KEY (item_id, term_id)
);
CREATE INDEX item_terms_term ON item_terms(term_id);

CREATE TABLE frames (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  z          INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE placements (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  z        INTEGER NOT NULL DEFAULT 0,
  frame_id TEXT REFERENCES frames(id) ON DELETE SET NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (board_id, item_id)
);
CREATE INDEX placements_item ON placements(item_id);

CREATE TABLE manual_connections (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label      TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (from_id, to_id)
);

CREATE TABLE saved_filters (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  filter     TEXT NOT NULL,                       -- JSON Filter
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE embeddings (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  vector     BLOB NOT NULL,                       -- Float32 little-endian, L2-normalized
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, model)
);

CREATE TABLE ai_dismissed (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, term_id)
);
```
Notes:
- Soft-deleted items keep their placements and terms, so undo and restore are exact. Queries filter on `deleted_at IS NULL`.
- The duplicate check looks for the `file_hash` among non-deleted items, and offers Restore when the match is in the Trash.
- `journal_mode = WAL`, `foreign_keys = ON` and `busy_timeout` are set when the connection opens, not in the migration.
- Split PDF pages are independent items with their own single-page files.

### 5.3 Migrations
- Migrations are files named `src/db/migrations/NNN_name.sql`, applied in order by the TypeScript migrator (the same code runs on Tauri and sql.js). Each one runs in a transaction and bumps `meta.schema_version`.
- Back up automatically before migrating an existing library.
- Never edit a migration that has shipped; add a new one.

### 5.4 Backups, Trash and export
- **Automatic backups:**
  - they run at startup if the last one is older than 24 h, and at quit if anything changed, using `VACUUM INTO backups/designspace-YYYY-MM-DD-HHmm.db`;
  - the 14 most recent daily backups and 8 weekly ones are kept;
  - an optional extra destination (e.g. a OneDrive folder) receives a copy.
- **Originals aren't copied into backups:** they're never modified, and purging sends them to the Recycle Bin.
- **Restore:** Settings → Library → Backups → Restore. The current DB is first saved as `pre-restore-…db`.
- **Trash:** soft delete, restore, delete forever, automatic purge after 30 days.
- **Export** (M7): a JSON file with all metadata (items, terms, boards, placements, frames, connections, filters), optionally zipped with the media.

### 5.5 Settings
- **Library settings** (vocabulary order, default criteria, Offline mode) live in `meta.settings` (JSON).
- **Machine settings** (recent libraries, window, wheel mode, reduce motion, AI on/off) live in `settings.json` in the app's local data folder.

---

## 6. Repository layout
```
designspace/
├─ CLAUDE.md                      rules for coding agents (read first)
├─ README.md
├─ docs/
│  ├─ IMPLEMENTATION_PLAN.md      this document; keep its checklists current
│  └─ DECISIONS.md                decisions and deviations (created in M0)
├─ package.json, pnpm-lock.yaml, tsconfig.json, vite.config.ts, eslint.config.js, .prettierrc
├─ index.html
├─ public/                        static files (ONNX Runtime WASM copied here at build)
├─ src/                           app/ design/ platform/ db/ state/ commands/ canvas/
│                                 features/ workers/ lib/ i18n/
├─ crates/designspace-core/       pure Rust logic + tests
├─ src-tauri/                     Tauri app: Cargo.toml, tauri.conf.json, capabilities/, icons/, src/
├─ scripts/                       fetch-models.mjs, copy-ort-wasm.mjs, generate-fixtures.mjs
├─ tests/e2e/                     Playwright specs (browser platform)
├─ tests/fixtures/                generated sample files (images, a short webm, a PDF, an OFL font)
├─ .github/workflows/             ci.yml, windows-build.yml
└─ .claude/settings.json          SessionStart hook for cloud sessions (M0)
```
`.gitignore` covers `node_modules/`, `dist/`, `target/`, `src-tauri/target/`, `src-tauri/resources/models/`, `public/ort/` and every `*.db`.

---

## 7. Development, testing & CI

### 7.1 Two environments
| | Cloud sessions (Claude Code on the web) | The owner's Windows PC |
|---|---|---|
| Purpose | Where the agent writes code | Where the app runs |
| What runs | The browser build (`pnpm dev` with BrowserPlatform), unit tests, Playwright e2e with screenshots, `cargo test` | Installers built by GitHub Actions |
| Available (checked 2026-09-27) | Node 22, pnpm 10, Rust 1.94, and Chromium for Playwright (preinstalled: don't run `playwright install`; if the versions differ, launch with `executablePath: '/opt/pw-browsers/chromium'`). npm and crates.io are reachable. Ubuntu packages install with apt, including the Tauri Linux prerequisites (`libwebkit2gtk-4.1-dev`, `build-essential`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`) needed to compile the app crate. | Windows 10/11 with WebView2 (preinstalled on Windows 11; the installer adds it if missing) |
| Limits | huggingface.co is blocked, so use the fake embedding provider. No GPU, so no real performance numbers. No Windows. | — |

A local Windows development setup (Node, pnpm, Rust, VS Build Tools, `pnpm tauri dev`) is optional and not needed.

### 7.2 Scripts
| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with BrowserPlatform → `http://localhost:5173/?seed=demo` |
| `pnpm tauri dev` | The desktop app in dev mode (needs the platform's Tauri prerequisites) |
| `pnpm build` · `pnpm tauri build` | Web build · desktop installer |
| `pnpm test` · `pnpm e2e` | Vitest · Playwright (browser platform) |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | ESLint · tsc · Prettier |
| `cargo test --workspace` | Rust tests (`-p designspace-core` works without system packages) |
| `pnpm bench` | Opens the 10,000-item bench page |
| `node scripts/fetch-models.mjs` | Downloads the AI models (CI and Windows only) |

### 7.3 Testing strategy
- **Unit (Vitest):**
  - lib: normalize, color families, palette determinism, pHash distance, justified rows, free-space search;
  - search and facets: accents, OR/AND/exclude;
  - connections: hover scoring, hubs; Constellations: determinism, no NaN, time budget;
  - commands: do → undo returns the exact prior state, including over random command sequences;
  - migrations on sql.js, and the AI blending with fake embeddings.
- **Components (Testing Library):** chip input, facet menu, Details bulk edit.
- **E2E (Playwright on the seeded browser build):**
  - flows: paste (synthetic `ClipboardEvent`), drop (synthetic `DataTransfer`), classify in Details, triage by keyboard, search dim/hide and counts, list grouping and hover highlight, hover connections, the Constellations toggle, a board from a selection, PNG export (non-empty file), undo/redo, Trash and restore;
  - screenshot snapshots (2 % tolerance) of the empty state, a populated map, Details, Triage and Constellations.
- **Rust:** core unit tests, plus command tests on a temporary library: import, dedupe, purge, backups, link-meta parsing from fixture HTML, and rejecting path traversal.
- **Owner checks** on Windows at the end of each milestone.

### 7.4 CI (GitHub Actions)
- **`ci.yml`** runs on every push and PR, on `ubuntu-latest`:
  1. pnpm install (cached), then lint, typecheck, Vitest and build;
  2. Playwright (`playwright install --with-deps chromium`);
  3. install the Tauri Linux prerequisites, then `cargo fmt --check`, `cargo clippy -- -D warnings` and `cargo test --workspace`.
- **`windows-build.yml`** runs on pushes to `main`, `v*` tags, and manually, on `windows-latest`:
  1. pnpm install, then fetch the models (cached with `actions/cache`, keyed by model id);
  2. `tauri-apps/tauri-action`, which uploads the NSIS installer as a workflow artifact;
  3. on a tag, create a GitHub Release with the installer attached.
- **Versions:** semver, kept in sync in `package.json` and `tauri.conf.json`. Tag `v0.1.0` at the end of M2 (the start of real use), then one tag per milestone, and `v1.0.0` after M7.
- The repository is public, which keeps GitHub Actions free. The library itself never goes into the repository.

### 7.5 Installing on Windows
1. On GitHub, go to **designspace → Releases** and download `Designspace_‹version›_x64-setup.exe`. Between releases, use **Actions** → the latest "windows-build" run → Artifacts.
2. Run it. The app isn't code-signed (fine for personal use), so Windows SmartScreen may say "Windows protected your PC". Click **More info** → **Run anyway**.
3. To update, install the new version over the old one. The library folder isn't touched.

---

## 8. Milestones
Relative sizes: S ≈ 1 conversation, M ≈ 1–2, L ≈ 2–3. Real daily use starts at v0.1.0, at the end of M2.

| # | Milestone | Size | Result |
|---|---|---|---|
| M0 | Foundations & spikes | M | The installer opens a pannable dot-grid map; the main technical risks are checked |
| M1 | Library & map (images) | L | Add, arrange, undo, Trash, backups |
| M2 | Classify, search, list, Inbox | L | **v0.1.0**: daily use begins |
| M3 | Connections & Constellations | M | Hover links, hubs, manual connections, Constellations |
| M4 | Moodboards | L | Boards, notes, swatches, frames, export |
| M5 | More content | M | Videos, PDFs, fonts, links |
| M6 | Offline AI | M | Suggestions, Find similar, search by meaning |
| M7 | Safety & polish | M | **v1.0.0** |

Every milestone ends with:
- all checkboxes ticked (or moved to a later milestone, with a note);
- CI green and the Windows installer built;
- this plan and `DECISIONS.md` updated;
- a plain-language **Owner checks** list sent to the owner.

Spikes listed in a milestone come first in that milestone; record the findings in `DECISIONS.md`.

**Definition of done for a feature:**
- it matches this spec and works by mouse and keyboard;
- it's undoable if it changes data, and it's persisted;
- non-trivial logic is covered by tests;
- it uses tokens and i18n strings, and leaves no console errors.

### M0: Foundations & spikes
- [x] Scaffold: pnpm, Vite, React, TypeScript strict, the Tauri 2 app in `src-tauri/`, and a Cargo workspace with `crates/designspace-core`; ESLint, Prettier, Vitest, Playwright.
- [x] The `Platform` interface; BrowserPlatform (sql.js + IndexedDB, `?seed=demo`, `?bench=10000`); a TauriPlatform skeleton.
- [x] The migrator and `001_init.sql` (§5.2), running on both platforms.
- [x] Rust: library create/open, the DB bridge, and the `media://` protocol (Range, CORS, CORP, path safety), with tests.
- [x] CSP and COOP/COEP headers (§4.12) from day one, in Tauri and in the Vite dev server (dev-server deviation logged in `docs/DECISIONS.md`).
- [x] Design tokens, base components and the `/design` page.
- [x] Canvas skeleton:
  - [x] Pixi app and camera (wheel/touchpad heuristics; Space, middle-button and hand panning);
  - [x] CSS dot grid synced to the camera;
  - [x] 10,000 colored rectangles at 60 fps with culling (frame-time number itself is an Owner check — no GPU in the cloud session, §4.13).
- [x] App shell: the empty map, the dock (placeholders for Add, Search and Connections), a space switcher placeholder, the panel toggle, the dark title bar.
- [x] First run: create or choose the library folder (Tauri); an automatic library (browser).
- [x] Settings shell with About → Diagnostics.
- [x] CI: `ci.yml`, and `windows-build.yml` producing an installer.
- [x] `.claude/settings.json` SessionStart hook for cloud sessions (use the `session-start-hook` skill): `pnpm install` and, when needed, the Tauri Linux prerequisites.
- [x] `docs/DECISIONS.md`, with the spike results.

Spikes (see `docs/DECISIONS.md` for the write-up of each):
- [x] **S1 Canvas scale:** the culling/LOD skeleton is built and exercised at `?bench=10000`; real frame-time measurement needs a GPU (Owner check).
- [x] **S2 Drag and drop into WebView2** with `dragDropEnabled: false`. The Diagnostics "Drop inspector" is built; exercising real Chrome/Edge/Firefox/Explorer drags needs Windows (Owner check).
- [x] **S3 Local media under COEP:** the `media://` protocol, CSP and COOP/COEP headers are implemented as specified; confirming the exact custom-protocol origin resolves on Windows WebView2 is an Owner check. (Images-as-textures, video Range-seeking, pdf.js and `FontFace` loading from `media://` aren't exercised yet — nothing imports real media until M1/M5.)

**Acceptance:** the Windows installer installs and opens the app, creates a library, and shows the dot-grid map with smooth pan and zoom; CI is green.
**Owner checks:**
- Install the app and create a library.
- Pan and zoom with the mouse and the touchpad. Does it feel right?
- Open Settings → About → Diagnostics → Drop inspector, drag an image from your browser onto it, and send a screenshot.

### M1: Library & map (images)
- [ ] Adding:
  - [x] Files… / Folder… (paths → Rust copies);
  - [ ] drag and drop (files, browser images, URLs);
  - [ ] paste (image data, files, URLs; text → note arrives in M4).
- [x] The import progress card with Cancel, messages for unsupported types, confirmation for folder imports.
- [ ] Duplicates: exact (hash) with "Show"/"Restore", and near (pHash) with the badge and the comparison.
- [x] Ingest workers for images (thumbnails, palette, color families, pHash), resumable.
- [ ] Canvas:
  - [x] item sprites with LOD and the texture manager;
  - [x] selecting (click, Shift, marquee, Ctrl+A), moving, resizing, stacking, hover;
  - [x] the context menu, minimap, zoom menu and fly-to.
- [ ] Placement: drop point, cursor, free-space search, justified rows for several items; Tidy up.
- [ ] Commands and undo/redo for all of the above; the Trash (soft delete, Trash view, restore, purge to the Recycle Bin, automatic purge after 30 days).
- [ ] Focus view for images.
- [ ] Automatic backups with rotation.
- [ ] The empty state; toasts with Undo; the Library and Canvas sections of Settings.

**Acceptance:**
- Importing 500 mixed images (one of them a duplicate) gives the correct counts without freezing the UI.
- After a restart, everything is exactly where it was.
- 20 mixed actions undo and redo correctly.
- `?bench=10000` has a p95 frame time ≤ 16.7 ms on the owner's PC.

**Owner checks:**
- Drag images from your browser and from Explorer, and paste a screenshot.
- Import a real folder, then move and resize things.
- Close and reopen the app, and look at the backups folder.

### M2: Classify, search, list, Inbox → v0.1.0
- [ ] Vocabularies seeded from Appendix A (with AI hints), and the vocabulary manager (rename, merge, delete, reorder, hints).
- [ ] The Details panel: single and bulk edit, every field of §2.5, copying palette colors, Show in Explorer.
- [ ] The Inbox rule, the Inbox chip, and Triage with the full keyboard flow.
- [ ] The search bar:
  - [ ] text, field chips (include/exclude), colors, dates, favorites, Inbox;
  - [ ] Dim/Hide, counts, Frame results;
  - [ ] saved filters ("Create board from results" is switched on in M4).
- [ ] The List panel: grouping, sorting, sizes, collapsing, hover highlight, click to fly, gallery mode, virtualization, saved filters.
- [ ] Rediscover (R): fly to a random item not viewed for 30+ days (favoring older ones) and make it pulse.
- [ ] The shortcut list (?).
- [ ] Tag `v0.1.0`.

**Acceptance:**
- ≤ 50 ms per keystroke at 10,000 items.
- The filter logic is covered by tests.
- 20 items can be triaged with the keyboard only.
- A bulk edit on 100 items is one undo step.

**Owner checks:**
- Classify about 30 real items with Triage.
- Try the searches you'd really do.
- Group the list by Vibe and hover the groups.

### M3: Connections & Constellations
- [ ] The criteria model and popover (at most 3, colors and line styles, strength, On hover / Show all), remembered per space.
- [ ] Hover and selection connections: parallel lines, dimming, line tooltips.
- [ ] Show all with hubs, the line cap and the hint.
- [ ] My connections: the connect handle, "Connect to…", labels, deleting, and the list in Details.
- [ ] Constellations:
  - [ ] the layout worker (§4.9) and the morph;
  - [ ] star hubs, the Unclassified ring, hub dragging;
  - [ ] deterministic layouts that respect filters.
- [ ] (If time allows) Arrange by….

**Acceptance:**
- Hover links appear with no visible delay (< 16 ms compute).
- Constellations of 3,000 items take ≤ 1.5 s, and identical inputs give identical layouts.
- The morph runs at ≥ 50 fps.

**Owner checks:** try Constellations by Vibe + Movement on your real library. Do the clusters make sense? Are the lines readable?

### M4: Moodboards
- [ ] Spike **S4 Notes on the canvas:** `HTMLText` vs `pixi.js/html-source` vs a canvas layout (crispness, speed, handing off to the editor).
- [ ] Boards: the space switcher, the Boards gallery with covers, rename, duplicate, delete/restore.
- [ ] Create a board from a selection, from search results, or empty; justified-row layout; save the source filter.
- [ ] The board canvas:
  - [ ] remove from board vs move to Trash;
  - [ ] the List's [This board | Library] switch with drag-to-add;
  - [ ] search within the board;
  - [ ] media dropped on a board also land on the Library map.
- [ ] Notes: TipTap editing in place (DOM overlay), colors, sanitized rendering, searchable; double-click the empty canvas; pasted text becomes a note.
- [ ] Swatches and Extract palette.
- [ ] Frames on any space.
- [ ] The suggestions tray (from the source filter; similarity is added in M6).
- [ ] Export: PNG (board or frame, 1×/2×, choice of background) and PDF (fitted, or one page per frame).

**Acceptance:**
- Filter → select → new board takes ≤ 3 actions.
- A 60-item board exports at 2× in under 10 s.
- Notes are found by search.

**Owner checks:** make a real moodboard for a current project, export it as PNG and PDF, and check the quality.

### M5: More content
- [ ] Spikes **S5 Video codecs** (mp4/webm/mov samples in WebView2: which ones play) and **S6 Font metadata** (WOFF2 name tables with fontkit vs opentype.js).
- [ ] Videos: import, automatic and chosen cover frame, duration badge, hover preview (one at a time), the Focus player, and the fallback for unsupported codecs.
- [ ] PDFs: import, the cover-page picker, split into pages (pdf-lib), the Focus viewer.
- [ ] Fonts: import TTF/OTF/WOFF/WOFF2, metadata, the specimen card (live text at mid and near zoom), the Focus type tester.
- [ ] Links: paste or drop URLs, metadata and cover through Rust, custom cover, Open in browser, image-URL detection, Offline mode.
- [ ] The Kind filter and Kind grouping everywhere.

**Acceptance:**
- Every kind survives a restart intact.
- An unsupported video shows the fallback, without error loops.

**Owner checks:** add real videos, a PDF catalogue, fonts you like, and links (including YouTube).

### M6: Offline AI
- [ ] Spike **S7 CLIP in WebView2:** a Windows build with bundled models. Measure the load time, milliseconds per image with threads, and memory. Compare ViT-B/32 with MobileCLIP if it's available.
- [ ] `fetch-models.mjs`, CI caching and bundling as resources; ONNX Runtime WASM bundled; the local-only `env`.
- [ ] The AI worker: image and text embeddings, background analysis (pause, resume, progress), and the fake provider for tests.
- [ ] Suggestions (zero-shot + personal blend) in Details and Triage: accept, dismiss, Accept all.
- [ ] Find similar, the Similar look criterion, search by meaning, and similarity in board suggestions.
- [ ] Settings → AI.
- [ ] Check that there are zero network requests at runtime (DevTools network panel on Windows, with the CSP in place).

**Acceptance:**
- A new image gets suggestions within about 2 s.
- Analyzing 1,000 images in the background causes no visible jank.
- Accepted values are saved with `via = 'ai'`.

**Owner checks:**
- After classifying about 50 items, are the suggestions useful?
- Try Find similar, and a search by description in English.

### M7: Safety & polish → v1.0.0
- [ ] The backups UI (list, restore, extra destination), JSON/ZIP export, a more polished Trash.
- [ ] Complete Settings, onboarding, every empty state, and a pass on the wording.
- [ ] An accessibility pass (contrast audit, focus order, reduced motion).
- [ ] A performance pass against §4.13 on the owner's PC.
- [ ] Friendly error messages, logs, "Open logs folder".
- [ ] A README for daily use (where the data is, how backups work, how to update).
- [ ] Tag `v1.0.0`.

**Acceptance:**
- The budgets are met, or deviations are documented.
- There are no known data-loss bugs.
- Restoring from a backup has been verified end to end.

### Backlog (after v1)
- Phone capture by QR code on local Wi-Fi.
- A "Save to Designspace" browser extension.
- OCR (tesseract.js, English + French).
- A light "Stone" theme.
- An auto-updater (tauri-plugin-updater with a signing key).
- HEIC/TIFF through Windows imaging in Rust.
- Multilingual semantic search, and WebGPU for the AI.
- Snapping and alignment guides, board templates, a custom title bar.
- A macOS build.

---

## 9. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Canvas performance at 10,000 items | A janky map | Pixi + culling + LOD + a texture budget; spike S1; the bench page |
| Drag and drop from browsers into WebView2 | The main way to capture | `dragDropEnabled: false`; spike S2; fallbacks: Copy image + Ctrl+V, or paste the URL |
| CORS/COEP with local media | Broken images, no AI threads | The custom `media://` protocol with CORS + CORP; spike S3 |
| AI speed in WASM | Slow suggestions | A quantized model, a worker, a background queue, threads; later WebGPU or native ONNX Runtime in Rust behind the same interface; spike S7 |
| huggingface.co blocked in cloud sessions | AI can't be tested in the cloud | The fake provider; real checks on Windows builds |
| Video codecs (HEVC, ProRes) | Some videos won't preview | A fallback tile + "Open in default player"; spike S5 |
| Database damage | Data loss | WAL, transactions, automatic backups, untouched originals, purging via the Recycle Bin, a warning about cloud-synced folders |
| Scope creep | Never finishing | Milestones with acceptance criteria; a backlog |
| Cloud vs Windows differences | Bugs that only appear on Windows | The browser platform for speed + a Windows build every milestone + Owner checks |

---

## 10. Open questions
The defaults in bold are assumed; the owner can change them anytime.
1. UI language: **English**, or French?
2. Classification fields (§2.5) and starter lists (Appendix A): rename or trim anything?
3. Look: **soft UI on deep plum with stone accents**.
4. Manual connections (My connections): **included**.
5. Mouse wheel: **zoom**, or pan?
6. Default library location: **Documents\Designspace Library**.
7. App name: **Designspace** (from the repository name).

---

## 11. Kick-off prompt
Paste this as the first message of the new conversation on `anyMaria/designspace`, with the sketch and the soft-UI reference image attached:

```text
You're building Designspace, my personal desktop app for visual inspiration.
Read CLAUDE.md, then docs/IMPLEMENTATION_PLAN.md in full, before writing any code.
The attached images are my original sketch and the soft-UI reference for the look.

Build Milestone 0. Follow the plan and CLAUDE.md; log any deviation in docs/DECISIONS.md.
When the milestone is done: tick its checklist in the plan, make sure CI is green and the
Windows installer builds, push, and send me the milestone's "Owner checks" in plain language.
Only ask me about product decisions the plan doesn't cover.
```

For each later milestone, start a fresh conversation:

```text
Continue Designspace with Milestone <N> from docs/IMPLEMENTATION_PLAN.md.
Read CLAUDE.md and docs/DECISIONS.md first. Same rules as before.
```

---

## Appendix A: Starter vocabularies
Everything here is editable. Each value's AI hint is its English name unless another hint is given.

**Type** (one per item): Poster · Illustration · Photography · Typography · Logo & branding · Packaging · Editorial & book · UI & web · Motion · Painting · Drawing & sketch · Sculpture & 3D · Architecture · Interior · Fashion · Textile & pattern · Product & object · Film still · Collage · Signage & wayfinding · Other

**Vibe** (several): Dreamy · Bold · Playful · Calm · Melancholic · Nostalgic · Futuristic · Mysterious · Eerie · Romantic · Energetic · Minimal · Chaotic · Cozy · Elegant · Raw · Whimsical · Dramatic · Ethereal · Gritty · Sensual · Cheerful · Dark · Serene

**Movement** (several, usually one): Arts and Crafts · Art Nouveau · Art Deco · Bauhaus · Constructivism · De Stijl · Futurism · Dada · Surrealism · Expressionism · Cubism · Impressionism · Swiss Style *(hint: "Swiss International Typographic Style, grid layout, sans-serif")* · Mid-century Modern · Pop Art · Op Art · Psychedelic · Minimalism · Brutalism · Postmodernism · Memphis *(hint: "Memphis Group design, 1980s, bold geometric patterns")* · Punk · Grunge · Y2K *(hint: "Y2K aesthetic, chrome, early 2000s")* · Vaporwave · Ukiyo-e · Japonisme · Baroque · Renaissance · Street art · Contemporary

## Appendix B: AI prompt templates
Each value's text embedding is the normalized average over its field's templates, where `{x}` is the AI hint (or the name):
- **Type:** "a {x}", "an example of {x}", "a {x} design"
- **Vibe:** "a {x} image", "an image with a {x} mood", "something that feels {x}"
- **Movement:** "{x} style", "an artwork in the {x} style", "a design inspired by {x}"

Tags don't use zero-shot suggestions; they come from personal neighbors only.

## Appendix C: Glossary
Use these names in both the code and the UI.

| Term | Meaning |
|---|---|
| Library | The folder and database that hold everything |
| Library map | The main canvas, showing every media item (`boards.kind = 'library'`) |
| Board | A project moodboard canvas (`boards.kind = 'board'`) |
| Space | Whichever canvas is showing: the Library map or a Board |
| Item | Anything in the library. Its **Kind** is image, video, pdf, font, link, note or swatch. |
| Placement | An item's position and size on a space |
| Frame | A titled rectangle that groups items on a space |
| Facet / Term | A classification field (type, vibe, movement, tag) / one of its values |
| Inbox / Triage | Media not sorted yet / the fast sorting mode |
| Criteria | The fields currently used to draw connections |
| Hub | A value drawn as a star that its items connect to |
| Constellations | The automatic arrangement by shared values |
| My connections | Manual connections between items (`manual_connections`) |
| Details / Focus view | The side panel for the selection / the full-window view of one item |
| Rediscover | Flying to a random item you haven't seen in a long time |

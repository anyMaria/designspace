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

*(Later milestones append below this line.)*

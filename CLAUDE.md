# CLAUDE.md: Designspace

Designspace is a personal, local-first **Windows desktop app** for collecting visual inspiration (images, videos, PDFs, fonts, links, notes) on an infinite map, classifying it, exploring how items connect, and building project moodboards. It has one user, the owner (@anyMaria), who is a designer rather than a developer. Everything stays on their computer.

## Read first
1. `docs/IMPLEMENTATION_PLAN.md`: the full spec, architecture, data model and milestones. **It is the source of truth.**
2. `docs/DECISIONS.md`: decisions and deviations made during the build. Append to it (it's created in Milestone 0).
3. `docs/PATCH_3_PLAN.md`: the current work (Patch 3, after the owner's review of v0.15.1). When a conversation is about Patch 3, follow it task by task. Earlier rounds: `docs/PATCH_1_PLAN.md`, `docs/PATCH_2_PLAN.md`.

## Stack
Tauri 2 (Rust, WebView2) · React + TypeScript (strict) + Vite · Zustand · PixiJS 8 canvas · SQLite (rusqlite in Rust, sql.js in the browser dev build) · MiniSearch · d3-force · Transformers.js (CLIP, offline) · Vitest · Playwright.

## How to work
- Build milestone by milestone (plan §8). Tick checkboxes in the plan as items land, and commit the plan with the code.
- Before scaffolding or adding a dependency, check current stable versions and APIs in the official docs. The plan was written on 2026-09-27.
- Before writing PixiJS code, read the relevant skills in `node_modules/pixi.js/skills/`.
- Follow the plan. Where it's wrong or impossible, take the simplest alternative that respects the UX principles (plan §1.3), log it in `docs/DECISIONS.md`, and tell the owner.
- Ask the owner only about product decisions the plan doesn't cover, and talk to them in plain language.
- End every milestone with:
  - CI green and the Windows installer built by CI;
  - the plan and `DECISIONS.md` updated;
  - the milestone's **Owner checks**, in plain language.

## Non-negotiables
- **Local and private.**
  - No accounts, no telemetry, no background network. The webview never reaches the internet (strict CSP).
  - Network access happens only in the Rust `net_*` commands, after an explicit owner action, and never in Offline mode.
- **Originals are sacred.** Import copies files in. Never modify them. Purging sends them to the Recycle Bin.
- **Undoable by design.** Every data change is a Command in `src/commands/` with `do`/`undo`, persisted in one DB transaction.
- **Migrations only.** Schema changes are new files in `src/db/migrations/`. Never edit a migration that has shipped, and back up before migrating.
- **Tokens only.** Colors, radii, shadows, fonts and durations come from `src/design/tokens.*`.
- **Strings in one place.** All UI text lives in `src/i18n/en.ts`.
- **Keep the main thread free.** Ingest, layout and AI run in workers.
- **Budgets are requirements.** Meet plan §4.13, and measure with `?bench=10000`.
- **Code style.** TypeScript strict, no `any` (use `unknown` and narrow it), small modules, and unit tests for non-trivial logic.

## Commands (created in M0)
| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Browser build with the dev backend → `http://localhost:5173/?seed=demo` |
| `pnpm test` · `pnpm e2e` | Vitest · Playwright |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Code quality |
| `pnpm tauri dev` · `pnpm tauri build` | Desktop app · installer |
| `cargo test --workspace` | Rust tests |

## Cloud sessions (Claude Code on the web)
- Develop and check the UI in the browser build (BrowserPlatform), and use Playwright screenshots to verify the visuals.
- Chromium is preinstalled for Playwright. Don't run `playwright install`. If the versions differ, launch with `executablePath: '/opt/pw-browsers/chromium'`.
- npm and crates.io are reachable. **huggingface.co is blocked**, so use the fake embedding provider; real AI is verified in Windows builds.
- Tauri's Linux prerequisites install with apt if you need to compile `src-tauri` (see plan §7.1).
- The owner tests on Windows with the installers GitHub Actions builds (plan §7.5).

## Map of the code
- `src/app` (shell) · `src/design` (tokens, components) · `src/platform` (Tauri and browser backends) · `src/db` (migrations, repositories)
- `src/state` (stores) · `src/commands` (undoable actions) · `src/canvas` (PixiJS engine) · `src/features/*` · `src/workers` · `src/lib` · `src/i18n`
- `crates/designspace-core` (pure Rust) · `src-tauri` (commands, `media://` protocol, plugins)

## Never commit
AI model files, library data (`*.db`, media), `node_modules/`, build outputs, secrets.

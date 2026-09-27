# Designspace

A private, local-first desktop app for visual inspiration.

Drop in images, videos, PDFs, fonts, links and notes, and see everything on one infinite map. Classify each item by type, vibe, movement and tags, explore how items connect, and turn filtered selections into project moodboards. Everything stays on your computer, and the AI suggestions run offline.

**Status:** Milestone 0 (foundations) is built — the installer opens a pannable dot-grid map and creates a library. Milestone 1 (adding and arranging images) comes next; see [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Install (Windows)
The installer is available from Milestone 0 onwards:
1. Download the latest `Designspace_<version>_x64-setup.exe` from **Releases** (or from the latest "windows-build" run under **Actions**).
2. Run it. The app isn't code-signed, so Windows SmartScreen may warn you: click **More info → Run anyway**.

## Where your data lives
Your library is a normal folder that you choose (by default `Documents\Designspace Library`). It holds:
- your original files;
- one database;
- automatic backups.

Nothing is uploaded anywhere.

## Development
See [CLAUDE.md](CLAUDE.md) and section 7 of the plan.

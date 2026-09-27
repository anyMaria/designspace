#!/bin/bash
# Installs everything a cloud session needs to build/lint/test Designspace — see CLAUDE.md
# ("Cloud sessions") and docs/IMPLEMENTATION_PLAN.md §7.1.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# JS/TS toolchain (pnpm, Vite, React, Vitest, Playwright, eslint...).
pnpm install

# Tauri's Linux build prerequisites, needed to compile src-tauri and crates/designspace-core.
# Skipped when already present so a cached container doesn't re-run apt every session.
if ! dpkg -s libwebkit2gtk-4.1-dev >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    libwebkit2gtk-4.1-dev \
    build-essential \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
fi

# Chromium for Playwright is preinstalled in cloud sessions (CLAUDE.md: don't run
# `playwright install`); nothing to do here beyond making sure the package is on disk.

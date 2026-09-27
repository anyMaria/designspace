import type { Platform } from './types';
import { runMigrations } from '@/db/migrator';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';

export interface BootstrapResult {
  platform: Platform;
  libraryBoardId: string;
}

/** Runs migrations and makes sure the one `boards.kind = 'library'` row exists (§5.2). Call
 * this once a library is open (immediately for BrowserPlatform; after first-run for Tauri). */
export async function ensureLibraryReady(platform: Platform): Promise<string> {
  const { from, to } = await runMigrations(platform.db);
  if (to !== from) logger.info(`Migrated the library database from schema v${from} to v${to}`);

  const rows = await platform.db.select<{ id: string }>(
    "SELECT id FROM boards WHERE kind = 'library' LIMIT 1",
  );
  if (rows.length > 0) return rows[0].id;

  const id = newId();
  const now = new Date().toISOString();
  await platform.db.execute(
    "INSERT INTO boards (id, kind, name, created_at, updated_at) VALUES (?, 'library', 'Library', ?, ?)",
    [id, now, now],
  );
  return id;
}

/** Applies `?seed=demo` and reports whether `?bench=N` was requested (the canvas layer reads
 * the rect count itself — see src/platform/seed/bench.ts — since it never touches the DB). */
export function readDevUrlFlags(): { seedDemo: boolean; bench: number | null } {
  const params = new URLSearchParams(window.location.search);
  const bench = params.get('bench');
  return {
    seedDemo: params.get('seed') === 'demo',
    bench: bench ? Number.parseInt(bench, 10) : null,
  };
}

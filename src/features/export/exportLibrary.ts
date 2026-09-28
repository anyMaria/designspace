import type { DbRow, Platform } from '@/platform';

/** §5.4's library export (M7): "a JSON file with all metadata (items, terms, boards,
 * placements, frames, connections, filters), optionally zipped with the media." Soft-deleted
 * rows (Trash) are included as-is — `deleted_at` is part of the metadata, not a reason to drop
 * a row — since this is meant as a portable archive of the library, not a "clean" snapshot. */
interface LibraryExport {
  exportedAt: string;
  schemaVersion: number;
  items: DbRow[];
  terms: DbRow[];
  itemTerms: DbRow[];
  boards: DbRow[];
  placements: DbRow[];
  frames: DbRow[];
  manualConnections: DbRow[];
  savedFilters: DbRow[];
}

async function buildExport(platform: Platform): Promise<LibraryExport> {
  const [
    items,
    terms,
    itemTerms,
    boards,
    placements,
    frames,
    manualConnections,
    savedFilters,
    metaRows,
  ] = await Promise.all([
    platform.db.select('SELECT * FROM items'),
    platform.db.select('SELECT * FROM terms'),
    platform.db.select('SELECT * FROM item_terms'),
    platform.db.select('SELECT * FROM boards'),
    platform.db.select('SELECT * FROM placements'),
    platform.db.select('SELECT * FROM frames'),
    platform.db.select('SELECT * FROM manual_connections'),
    platform.db.select('SELECT * FROM saved_filters'),
    platform.db.select<DbRow>("SELECT value FROM meta WHERE key = 'schema_version'"),
  ]);
  const schemaVersion = Number(metaRows[0]?.value ?? 0);
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion,
    items,
    terms,
    itemTerms,
    boards,
    placements,
    frames,
    manualConnections,
    savedFilters,
  };
}

/** Plain JSON export — works on both platforms via the generic `dialogs.saveFile`. Returns
 * `false` if the owner cancels the Save dialog. */
export async function exportLibraryJson(platform: Platform): Promise<boolean> {
  const data = await buildExport(platform);
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
  return platform.dialogs.saveFile('designspace-export.json', bytes);
}

/** JSON + the `media/` folder, zipped — Tauri only (§4.5: `libraryExport.zip` isn't available
 * in the browser dev build). */
export async function exportLibraryZip(platform: Platform): Promise<boolean> {
  const data = await buildExport(platform);
  const json = JSON.stringify(data, null, 2);
  return platform.libraryExport.zip(json, 'designspace-export.zip');
}

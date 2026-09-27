import type { DbRow, Platform } from '@/platform/types';
import type { Item, Placement } from '@/state/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useImportStore } from '@/state/importStore';
import { useToastStore } from '@/state/toastStore';
import { useHistoryStore } from '@/commands/history';
import { createAddItemsCommand, createRestoreItemCommand } from '@/commands/itemCommands';
import { getIngestQueue } from '@/workers/ingestQueue';
import { findFreeSpot, justifiedRows } from '@/lib/packing';
import { rectsIntersect, unionRects, type Rect } from '@/lib/geometry';
import { extensionOf, isSupportedImage } from '@/lib/fileKinds';
import { newId } from '@/lib/ids';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';

/** Import entry points (§2.3): Files…/Folder… (Tauri paths), drag-and-drop and paste (File
 * objects on both platforms). Both converge here: dedupe, copy the bytes in, write the item +
 * placement rows, enqueue ingest, and land the batch as one selected, one-undo-step addition. */

const PLACEHOLDER_SIZE = 320; // square, until ingest reports the real aspect ratio (§2.4)
const LIBRARY_BOARD_KIND = 'library';

export interface DropPoint {
  x: number;
  y: number;
}

export type FlyTo = (rect: Rect) => void;

function isOccupied(rect: Rect): boolean {
  for (const p of useLibraryStore.getState().placements.values()) {
    if (rectsIntersect(rect, { x: p.x, y: p.y, w: p.w, h: p.h })) return true;
  }
  return false;
}

function nextZ(): number {
  let max = -1;
  for (const p of useLibraryStore.getState().placements.values()) max = Math.max(max, p.z);
  return max + 1;
}

/** Placement rects for a batch, in input order — a single item lands where dropped (or the
 * nearest free spot); several land as a justified-row grid anchored near the drop point (§2.3). */
function placeBatch(dropPoint: DropPoint, count: number): Rect[] {
  if (count === 0) return [];
  if (count === 1) {
    const pos = findFreeSpot(dropPoint, { w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE }, isOccupied);
    return [{ x: pos.x, y: pos.y, w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE }];
  }
  const ids = Array.from({ length: count }, (_, i) => String(i));
  const rows = justifiedRows(
    ids.map((id) => ({ id, aspect: 1 })),
    { x: 0, y: 0 },
  );
  const bounds = unionRects(rows) ?? { x: 0, y: 0, w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE };
  const anchor = findFreeSpot(dropPoint, { w: bounds.w, h: bounds.h }, isOccupied);
  const dx = anchor.x - bounds.x;
  const dy = anchor.y - bounds.y;
  return rows.map((r) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }));
}

async function findByHash(
  platform: Platform,
  hash: string,
): Promise<{ id: string; deletedAt: string | null } | null> {
  const rows = await platform.db.select<DbRow>(
    `SELECT id, deleted_at FROM items WHERE file_hash = ?
     ORDER BY deleted_at IS NULL DESC, created_at DESC LIMIT 1`,
    [hash],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id as string, deletedAt: row.deleted_at as string | null };
}

function announceDuplicate(
  platform: Platform,
  id: string,
  deletedAt: string | null,
  flyTo?: FlyTo,
): void {
  if (deletedAt) {
    useToastStore.getState().show(en.toasts.alreadyInLibrary, {
      actionLabel: en.toasts.restore,
      onAction: () =>
        void useHistoryStore.getState().execute(createRestoreItemCommand(platform, id)),
    });
    return;
  }
  useToastStore.getState().show(en.toasts.alreadyInLibrary, {
    actionLabel: en.toasts.show,
    onAction: () => {
      useLibraryStore.getState().setSelection([id]);
      const p = useLibraryStore.getState().placements.get(id);
      if (p) flyTo?.({ x: p.x, y: p.y, w: p.w, h: p.h });
    },
  });
}

async function findLibraryBoardId(platform: Platform): Promise<string> {
  const existing = useLibraryStore.getState().libraryBoardId;
  if (existing) return existing;
  const [row] = await platform.db.select<DbRow>('SELECT id FROM boards WHERE kind = ? LIMIT 1', [
    LIBRARY_BOARD_KIND,
  ]);
  return row.id as string;
}

interface NewRow {
  relPath: string;
  fileName: string;
  hash: string;
  size: number;
  mime: string;
}

async function createRow(
  platform: Platform,
  boardId: string,
  row: NewRow,
  rect: Rect,
  z: number,
): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  const title = row.fileName.replace(/\.[^.]+$/, '');

  await platform.db.batch([
    {
      sql: `INSERT INTO items
        (id, kind, title, file_path, file_name, file_hash, file_size, mime, status, derived_v, created_at, updated_at)
        VALUES (?, 'image', ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      params: [id, title, row.relPath, row.fileName, row.hash, row.size, row.mime, now, now],
    },
    {
      sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [boardId, id, rect.x, rect.y, rect.w, rect.h, z, now],
    },
  ]);

  const item: Item = {
    id,
    kind: 'image',
    title,
    filePath: row.relPath,
    fileName: row.fileName,
    fileHash: row.hash,
    fileSize: row.size,
    mime: row.mime,
    width: null,
    height: null,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: null,
    viewedAt: null,
    status: 'pending',
    derivedV: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const placement: Placement = {
    boardId,
    itemId: id,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    z,
    frameId: null,
    addedAt: now,
  };
  useLibraryStore.getState().upsertItem(item);
  useLibraryStore.getState().upsertPlacement(placement);
  getIngestQueue(platform).enqueue([{ itemId: id, relPath: row.relPath, mime: row.mime }]);
  return id;
}

async function finishBatch(platform: Platform, addedIds: string[]): Promise<void> {
  useImportStore.getState().finish();
  if (addedIds.length === 0) return;
  useLibraryStore.getState().setSelection(addedIds);
  await useHistoryStore.getState().execute(createAddItemsCommand(platform, addedIds));
  useToastStore
    .getState()
    .show(addedIds.length > 1 ? en.toasts.addedMany(addedIds.length) : en.toasts.addedOne);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Drag-and-drop, paste, and the browser dev build's Files…/Folder… (no native path dialogs —
 * `<input type="file">` gives File objects, not paths). Hashes client-side first so a known
 * duplicate never gets copied at all, on either platform. */
export async function importFiles(
  platform: Platform,
  files: File[],
  dropPoint: DropPoint,
  flyTo?: FlyTo,
): Promise<void> {
  const supported = files.filter((f) => isSupportedImage(f.name));
  for (const f of files) {
    if (!isSupportedImage(f.name)) {
      useToastStore.getState().show(en.toasts.unsupportedFile(extensionOf(f.name)));
    }
  }
  if (supported.length === 0) return;

  const boardId = await findLibraryBoardId(platform);
  const store = useImportStore.getState();
  store.begin(supported.length);

  const rects = placeBatch(dropPoint, supported.length);
  let z = nextZ();
  const addedIds: string[] = [];

  for (let i = 0; i < supported.length; i++) {
    if (useImportStore.getState().cancelRequested) break;
    const file = supported[i];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const dup = await findByHash(platform, hash);
      if (dup) {
        announceDuplicate(platform, dup.id, dup.deletedAt, flyTo);
      } else {
        const result = await platform.media.importFile(file);
        const id = await createRow(
          platform,
          boardId,
          {
            relPath: result.relPath,
            fileName: file.name,
            hash: result.hash,
            size: result.size,
            mime: result.mime,
          },
          rects[i],
          z++,
        );
        addedIds.push(id);
      }
    } catch (err) {
      logger.error(`Import failed for ${file.name}`, err);
    }
    useImportStore.getState().progress(i + 1);
  }

  await finishBatch(platform, addedIds);
}

/** Files…/Folder… on Tauri: the native dialog only returns paths, and Rust already hashes,
 * dedupes and copies in one round trip (`media_import_paths`). */
export async function importPaths(
  platform: Platform,
  paths: string[],
  dropPoint: DropPoint,
  flyTo?: FlyTo,
): Promise<void> {
  if (paths.length === 0) return;

  const boardId = await findLibraryBoardId(platform);
  useImportStore.getState().begin(paths.length);

  const rects = placeBatch(dropPoint, paths.length);
  let z = nextZ();
  const addedIds: string[] = [];

  try {
    const results = await platform.media.importPaths(paths);
    for (let i = 0; i < results.length; i++) {
      if (useImportStore.getState().cancelRequested) break;
      const result = results[i];
      const fileName = paths[i].split(/[/\\]/).pop() ?? paths[i];
      if (result.duplicateOf) {
        const dup = await findByHash(platform, result.hash);
        announceDuplicate(platform, result.duplicateOf, dup?.deletedAt ?? null, flyTo);
      } else {
        const id = await createRow(
          platform,
          boardId,
          {
            relPath: result.relPath,
            fileName,
            hash: result.hash,
            size: result.size,
            mime: result.mime,
          },
          rects[i],
          z++,
        );
        addedIds.push(id);
      }
      useImportStore.getState().progress(i + 1);
    }
  } catch (err) {
    logger.error('Folder/Files import failed', err);
  }

  await finishBatch(platform, addedIds);
}

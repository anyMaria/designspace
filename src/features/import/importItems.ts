import type { DbRow, DbStatement, Platform } from '@/platform/types';
import type { Item, Placement } from '@/state/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import { useImportStore } from '@/state/importStore';
import { useToastStore } from '@/state/toastStore';
import { useHistoryStore } from '@/commands/history';
import { createAddItemsCommand, createRestoreItemCommand } from '@/commands/itemCommands';
import { getIngestQueue } from '@/workers/ingestQueue';
import { getVideoIngestQueue } from '@/workers/videoIngestQueue';
import { getPdfIngestQueue } from '@/workers/pdfIngestQueue';
import { findFreeSpot, justifiedRows } from '@/lib/packing';
import { rectsIntersect, unionRects, type Rect } from '@/lib/geometry';
import { extensionOf, detectMediaKind } from '@/lib/fileKinds';
import { newId } from '@/lib/ids';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';

/** Import entry points (§2.3): Files…/Folder… (Tauri paths), drag-and-drop and paste (File
 * objects on both platforms). Both converge here: dedupe, copy the bytes in, write the item +
 * placement rows, enqueue ingest, and land the batch as one selected, one-undo-step addition.
 *
 * §2.3 "When the current space is a Board, new media land on the Board at the drop point *and*
 * on the Library map, in its arrival area": while a board (not the Library map) is open, each
 * imported item gets *two* placement rows — the visible one at the drop point on the current
 * board, and a second, DB-only one on the Library board. The second one can't reuse the live
 * `libraryStore.placements` for collision-avoidance (that map is always scoped to whichever space
 * is currently open, so it holds the *board's* rows here, not the Library's) — `placeBatch`
 * and `nextZ` below take an explicit occupied-rects list instead, and the Library's own is
 * fetched with one extra query (`fetchPlacementSnapshot`) only when it's actually needed. */

const PLACEHOLDER_SIZE = 320; // square, until ingest reports the real aspect ratio (§2.4)
const LIBRARY_BOARD_KIND = 'library';
// The plan's "arrival area" spirals out from "the last arrival point, or the viewport center if
// that point is off-screen" (§4.9) — meaningful only while the Library map itself is the visible
// space. There's no such point to reuse while a board is open instead, so the Library-only half
// of a board drop simply spirals out from world origin.
const LIBRARY_ARRIVAL_ORIGIN: DropPoint = { x: 0, y: 0 };

export interface DropPoint {
  x: number;
  y: number;
}

export type FlyTo = (rect: Rect) => void;

function makeIsOccupied(existing: Rect[]): (rect: Rect) => boolean {
  return (rect) => existing.some((p) => rectsIntersect(rect, p));
}

function currentPlacementSnapshot(): { x: number; y: number; w: number; h: number; z: number }[] {
  return [...useLibraryStore.getState().placements.values()].map((p) => ({
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    z: p.z,
  }));
}

function nextZ(existing: { z: number }[]): number {
  let max = -1;
  for (const p of existing) max = Math.max(max, p.z);
  return max + 1;
}

/** One-off fetch of a board's placement rows, bypassing the live store — needed for the Library
 * board's occupancy/z-order while a different board is the one currently loaded into it. */
async function fetchPlacementSnapshot(
  platform: Platform,
  boardId: string,
): Promise<{ x: number; y: number; w: number; h: number; z: number }[]> {
  const rows = await platform.db.select<DbRow>(
    'SELECT x, y, w, h, z FROM placements WHERE board_id = ?',
    [boardId],
  );
  return rows.map((r) => ({
    x: r.x as number,
    y: r.y as number,
    w: r.w as number,
    h: r.h as number,
    z: r.z as number,
  }));
}

interface BatchPlacementPlan {
  primaryBoardId: string;
  primaryRects: Rect[];
  primaryZStart: number;
  /** Set only while a board other than the Library is currently open — the Library-map half of
   * "media dropped on a board also lands on the Library map" (§2.3). */
  extraBoardId: string | null;
  extraRects: Rect[];
  extraZStart: number;
}

/** Resolves where a batch of `count` new items lands: always on whichever space is currently
 * open (`primary*`), and, only when that's an actual board rather than the Library map, also on
 * the Library map itself (`extra*`) — see the module doc comment above. */
async function planBatchPlacements(
  platform: Platform,
  dropPoint: DropPoint,
  count: number,
): Promise<BatchPlacementPlan> {
  const libraryBoardId = await findLibraryBoardId(platform);
  const currentBoardId = useBoardStore.getState().currentBoardId;
  const primaryBoardId =
    currentBoardId && currentBoardId !== libraryBoardId ? currentBoardId : libraryBoardId;

  const currentSnapshot = currentPlacementSnapshot();
  const primaryRects = placeBatch(dropPoint, count, currentSnapshot);
  const primaryZStart = nextZ(currentSnapshot);

  if (primaryBoardId === libraryBoardId) {
    return {
      primaryBoardId,
      primaryRects,
      primaryZStart,
      extraBoardId: null,
      extraRects: [],
      extraZStart: 0,
    };
  }

  const librarySnapshot = await fetchPlacementSnapshot(platform, libraryBoardId);
  return {
    primaryBoardId,
    primaryRects,
    primaryZStart,
    extraBoardId: libraryBoardId,
    extraRects: placeBatch(LIBRARY_ARRIVAL_ORIGIN, count, librarySnapshot),
    extraZStart: nextZ(librarySnapshot),
  };
}

/** Placement rects for a batch, in input order — a single item lands where dropped (or the
 * nearest free spot); several land as a justified-row grid anchored near the drop point (§2.3). */
function placeBatch(dropPoint: DropPoint, count: number, occupied: Rect[]): Rect[] {
  if (count === 0) return [];
  const isOccupied = makeIsOccupied(occupied);
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
  kind: 'image' | 'video' | 'pdf';
  relPath: string;
  fileName: string;
  hash: string;
  size: number;
  mime: string;
}

interface PlacementTarget {
  boardId: string;
  rect: Rect;
  z: number;
}

async function createRow(
  platform: Platform,
  primary: PlacementTarget,
  row: NewRow,
  extra?: PlacementTarget,
): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  const title = row.fileName.replace(/\.[^.]+$/, '');

  const statements: DbStatement[] = [
    {
      sql: `INSERT INTO items
        (id, kind, title, file_path, file_name, file_hash, file_size, mime, status, derived_v, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      params: [
        id,
        row.kind,
        title,
        row.relPath,
        row.fileName,
        row.hash,
        row.size,
        row.mime,
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        primary.boardId,
        id,
        primary.rect.x,
        primary.rect.y,
        primary.rect.w,
        primary.rect.h,
        primary.z,
        now,
      ],
    },
  ];
  if (extra) {
    statements.push({
      sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        extra.boardId,
        id,
        extra.rect.x,
        extra.rect.y,
        extra.rect.w,
        extra.rect.h,
        extra.z,
        now,
      ],
    });
  }
  await platform.db.batch(statements);

  const item: Item = {
    id,
    kind: row.kind,
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
  // Only `primary`'s placement goes into the live store — it's the one matching whatever space
  // is actually open right now. `extra` (the Library-map half of a board drop) is DB-only: it'll
  // load normally the next time the owner switches to the Library map.
  const placement: Placement = {
    boardId: primary.boardId,
    itemId: id,
    x: primary.rect.x,
    y: primary.rect.y,
    w: primary.rect.w,
    h: primary.rect.h,
    z: primary.z,
    frameId: null,
    addedAt: now,
  };
  useLibraryStore.getState().upsertItem(item);
  useLibraryStore.getState().upsertPlacement(placement);
  if (row.kind === 'video') {
    getVideoIngestQueue(platform).enqueue([{ itemId: id, relPath: row.relPath, mime: row.mime }]);
  } else if (row.kind === 'pdf') {
    getPdfIngestQueue(platform).enqueue([{ itemId: id, relPath: row.relPath }]);
  } else {
    getIngestQueue(platform).enqueue([{ itemId: id, relPath: row.relPath, mime: row.mime }]);
  }
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
  const supported = files.filter((f) => detectMediaKind(f.name) !== null);
  for (const f of files) {
    if (detectMediaKind(f.name) === null) {
      useToastStore.getState().show(en.toasts.unsupportedFile(extensionOf(f.name)));
    }
  }
  if (supported.length === 0) return;

  const plan = await planBatchPlacements(platform, dropPoint, supported.length);
  const store = useImportStore.getState();
  store.begin(supported.length);

  let z = plan.primaryZStart;
  let extraZ = plan.extraZStart;
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
          { boardId: plan.primaryBoardId, rect: plan.primaryRects[i], z: z++ },
          {
            kind: detectMediaKind(file.name) ?? 'image',
            relPath: result.relPath,
            fileName: file.name,
            hash: result.hash,
            size: result.size,
            mime: result.mime,
          },
          plan.extraBoardId
            ? { boardId: plan.extraBoardId, rect: plan.extraRects[i], z: extraZ++ }
            : undefined,
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

  const plan = await planBatchPlacements(platform, dropPoint, paths.length);
  useImportStore.getState().begin(paths.length);

  let z = plan.primaryZStart;
  let extraZ = plan.extraZStart;
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
          { boardId: plan.primaryBoardId, rect: plan.primaryRects[i], z: z++ },
          {
            kind: detectMediaKind(fileName) ?? 'image',
            relPath: result.relPath,
            fileName,
            hash: result.hash,
            size: result.size,
            mime: result.mime,
          },
          plan.extraBoardId
            ? { boardId: plan.extraBoardId, rect: plan.extraRects[i], z: extraZ++ }
            : undefined,
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

import type { Platform } from '@/platform/types';
import type { DbStatement } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { newId } from '@/lib/ids';
import { justifiedRows, findFreeSpot } from '@/lib/packing';
import { rectsIntersect, type Rect } from '@/lib/geometry';
import type { Command } from './types';
import type { Board, Placement } from '@/state/types';

/** §2.11 Boards gallery commands — create/rename/duplicate/delete/restore. Delete is soft (sets
 * `deleted_at`, like items' own Trash) so it's undoable and the gallery can offer Restore;
 * boards aren't purged from here (no board-purge UX exists yet, unlike items' Recycle Bin). */

/** Returns the `Board` alongside its `Command` — callers (the switcher's "+ New board", the
 * gallery's empty-state action) need the new id right away, to select it as the current space,
 * before `history.execute` has even resolved. */
export function createCreateBoardCommand(
  platform: Platform,
  name: string,
): { command: Command; board: Board } {
  const board: Board = {
    id: newId(),
    kind: 'board',
    name,
    sourceFilter: null,
    settings: null,
    camera: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const command: Command = {
    label: 'Create board',
    do: async () => {
      useBoardStore.getState().upsertBoard(board);
      await platform.db.execute(
        "INSERT INTO boards (id, kind, name, created_at, updated_at) VALUES (?, 'board', ?, ?, ?)",
        [board.id, board.name, board.createdAt, board.updatedAt],
      );
    },
    undo: async () => {
      useBoardStore.getState().removeBoard(board.id);
      await platform.db.execute('DELETE FROM boards WHERE id = ?', [board.id]);
    },
  };

  return { command, board };
}

/** "Create a board from a selection, from search results, or empty" (§2.11) — the selection/
 * search-results paths. Lays the given items out in justified rows (§4.9, the same algorithm
 * "Tidy up" uses) starting at world origin (0,0) — the board canvas's own camera, once it exists,
 * frames the board on open rather than this needing to know where "empty space" is. `sourceFilter`
 * is saved on the board row so a later "sync with source filter"/suggestions-tray feature can
 * re-run it; it's `null` for an ad hoc selection (nothing to re-run). */
export function createBoardFromItemsCommand(
  platform: Platform,
  itemIds: string[],
  name: string,
  sourceFilter: unknown,
): { command: Command; board: Board } {
  const board: Board = {
    id: newId(),
    kind: 'board',
    name,
    sourceFilter: sourceFilter ?? null,
    settings: null,
    camera: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const command: Command = {
    label: 'Create board',
    do: async () => {
      useBoardStore.getState().upsertBoard(board);
      const statements: DbStatement[] = [
        {
          sql: "INSERT INTO boards (id, kind, name, source_filter, created_at, updated_at) VALUES (?, 'board', ?, ?, ?, ?)",
          params: [
            board.id,
            board.name,
            board.sourceFilter !== null ? JSON.stringify(board.sourceFilter) : null,
            board.createdAt,
            board.updatedAt,
          ],
        },
      ];

      const items = useLibraryStore.getState().items;
      const layoutInputs = itemIds.map((id) => {
        const item = items.get(id);
        const aspect = item?.width && item?.height ? item.width / item.height : 1;
        return { id, aspect };
      });
      const rects = justifiedRows(layoutInputs, { x: 0, y: 0 });
      const addedAt = new Date().toISOString();
      for (const rect of rects) {
        statements.push({
          sql: 'INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
          params: [board.id, rect.id, rect.x, rect.y, rect.w, rect.h, addedAt],
        });
      }

      await platform.db.batch(statements);
    },
    undo: async () => {
      useBoardStore.getState().removeBoard(board.id);
      await platform.db.execute('DELETE FROM boards WHERE id = ?', [board.id]);
    },
  };

  return { command, board };
}

export function createRenameBoardCommand(
  platform: Platform,
  boardId: string,
  name: string,
): Command {
  const previous = useBoardStore.getState().boards.get(boardId) ?? null;
  const now = new Date().toISOString();

  async function apply(value: string, updatedAt: string): Promise<void> {
    const current = useBoardStore.getState().boards.get(boardId);
    if (!current) return;
    useBoardStore.getState().upsertBoard({ ...current, name: value, updatedAt });
    await platform.db.execute('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?', [
      value,
      updatedAt,
      boardId,
    ]);
  }

  return {
    label: 'Rename board',
    do: () => apply(name, now),
    undo: () => apply(previous?.name ?? name, previous?.updatedAt ?? now),
  };
}

/** Deep-copies the board row plus its placements (frames are no longer a feature, Patch 2 · D2:
 * old frame rows stay in the database, unused, and are not copied). Board-scoped notes/swatches are `items` rows of their own
 * (`origin_board_id`) — M4's later Notes sub-task should extend this to clone those items too;
 * until then a duplicated board carries over any image/video/etc. placements but not board-only
 * notes, logged in DECISIONS.md so it isn't mistaken for an oversight later. */
export function createDuplicateBoardCommand(
  platform: Platform,
  boardId: string,
  copyName: string,
): { command: Command; board: Board } {
  const source = useBoardStore.getState().boards.get(boardId);
  const copy: Board = {
    id: newId(),
    kind: 'board',
    name: copyName,
    sourceFilter: source?.sourceFilter ?? null,
    settings: source?.settings ?? null,
    camera: source?.camera ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const command: Command = {
    label: 'Duplicate board',
    do: async () => {
      useBoardStore.getState().upsertBoard(copy);
      await platform.db.execute(
        "INSERT INTO boards (id, kind, name, source_filter, settings, camera, created_at, updated_at) VALUES (?, 'board', ?, ?, ?, ?, ?, ?)",
        [
          copy.id,
          copy.name,
          copy.sourceFilter ? JSON.stringify(copy.sourceFilter) : null,
          copy.settings ? JSON.stringify(copy.settings) : null,
          copy.camera ? JSON.stringify(copy.camera) : null,
          copy.createdAt,
          copy.updatedAt,
        ],
      );

      const statements: DbStatement[] = [];
      const now = new Date().toISOString();
      const placementRows = await platform.db.select<{
        item_id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        z: number;
      }>('SELECT item_id, x, y, w, h, z FROM placements WHERE board_id = ?', [boardId]);
      for (const p of placementRows) {
        statements.push({
          sql: 'INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [copy.id, p.item_id, p.x, p.y, p.w, p.h, p.z, now],
        });
      }

      if (statements.length > 0) await platform.db.batch(statements);
    },
    undo: async () => {
      useBoardStore.getState().removeBoard(copy.id);
      await platform.db.execute('DELETE FROM boards WHERE id = ?', [copy.id]);
    },
  };

  return { command, board: copy };
}

export function createDeleteBoardCommand(platform: Platform, boardId: string): Command {
  const previous = useBoardStore.getState().boards.get(boardId) ?? null;

  async function apply(deletedAt: string | null): Promise<void> {
    const current = useBoardStore.getState().boards.get(boardId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useBoardStore.getState().upsertBoard({ ...current, deletedAt, updatedAt });
    await platform.db.execute('UPDATE boards SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      deletedAt,
      updatedAt,
      boardId,
    ]);
  }

  return {
    label: 'Delete board',
    do: () => apply(new Date().toISOString()),
    undo: () => apply(previous?.deletedAt ?? null),
  };
}

/** "Remove from board" (§2.11's board canvas, distinct from Move to Trash — the item stays in
 * the Library and any other board, only this board's placement row goes away). Snapshots each
 * removed placement so undo re-inserts it exactly where it was. */
export function createRemoveFromBoardCommand(
  platform: Platform,
  boardId: string,
  itemIds: string[],
): Command {
  const removed = itemIds
    .map((id) => useLibraryStore.getState().placements.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.boardId === boardId);

  return {
    label: removed.length > 1 ? `Remove ${removed.length} items from board` : 'Remove from board',
    do: async () => {
      useLibraryStore.getState().removePlacements(removed.map((p) => p.itemId));
      const statements: DbStatement[] = removed.map((p) => ({
        sql: 'DELETE FROM placements WHERE board_id = ? AND item_id = ?',
        params: [p.boardId, p.itemId],
      }));
      if (statements.length > 0) await platform.db.batch(statements);
    },
    undo: async () => {
      for (const p of removed) useLibraryStore.getState().upsertPlacement(p);
      const statements: DbStatement[] = removed.map((p) => ({
        sql: 'INSERT INTO placements (board_id, item_id, x, y, w, h, z, frame_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [p.boardId, p.itemId, p.x, p.y, p.w, p.h, p.z, p.frameId, p.addedAt],
      }));
      if (statements.length > 0) await platform.db.batch(statements);
    },
  };
}

const PLACEHOLDER_SIZE = 320; // matches importItems.ts's own placeholder square

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

/** The List panel's [This board | Library] drag-to-add (§2.11): dropping a Library-wide item
 * (browsed while "Library" mode shows the full catalog) onto the board canvas adds it as a new
 * placement there, sized from its own aspect ratio (like `createBoardFromItemsCommand`'s layout)
 * and placed at the nearest free spot to the drop point — the same `findFreeSpot` logic
 * `importItems.ts` uses for a fresh import. Callers should skip calling this at all when the item
 * already has a placement on this board (`useLibraryStore.getState().placements.has(itemId)`),
 * since `placements` is always scoped to the current space. */
export function createAddToBoardCommand(
  platform: Platform,
  boardId: string,
  itemId: string,
  dropPoint: { x: number; y: number },
): Command {
  const item = useLibraryStore.getState().items.get(itemId);
  const aspect = item?.width && item?.height ? item.width / item.height : 1;
  const size =
    aspect >= 1
      ? { w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE / aspect }
      : { w: PLACEHOLDER_SIZE * aspect, h: PLACEHOLDER_SIZE };
  const pos = findFreeSpot(dropPoint, size, isOccupied);
  const placement: Placement = {
    boardId,
    itemId,
    x: pos.x,
    y: pos.y,
    w: size.w,
    h: size.h,
    z: nextZ(),
    frameId: null,
    cropX: null,
    cropY: null,
    parentId: null,
    addedAt: new Date().toISOString(),
  };

  return {
    label: 'Add to board',
    do: async () => {
      useLibraryStore.getState().upsertPlacement(placement);
      await platform.db.execute(
        'INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          placement.boardId,
          placement.itemId,
          placement.x,
          placement.y,
          placement.w,
          placement.h,
          placement.z,
          placement.addedAt,
        ],
      );
    },
    undo: async () => {
      useLibraryStore.getState().removePlacements([itemId]);
      await platform.db.execute('DELETE FROM placements WHERE board_id = ? AND item_id = ?', [
        boardId,
        itemId,
      ]);
    },
  };
}

export function createRestoreBoardCommand(platform: Platform, boardId: string): Command {
  const previous = useBoardStore.getState().boards.get(boardId) ?? null;

  async function apply(deletedAt: string | null): Promise<void> {
    const current = useBoardStore.getState().boards.get(boardId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useBoardStore.getState().upsertBoard({ ...current, deletedAt, updatedAt });
    await platform.db.execute('UPDATE boards SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      deletedAt,
      updatedAt,
      boardId,
    ]);
  }

  return {
    label: 'Restore board',
    do: () => apply(null),
    undo: () => apply(previous?.deletedAt ?? new Date().toISOString()),
  };
}

/** The suggestions tray's "×" (§2.11) — remembered per board in `boards.settings.dismissedSuggestions`
 * (the JSON column §5.2 already earmarks for exactly this). A dismissed suggestion never comes
 * back for that item on this board, matching the plan's AI-suggestion dismissal rule (§2.13) even
 * though this tray predates AI (M6) — it's the same "click × once, stays gone" contract. */
export function createDismissSuggestionCommand(
  platform: Platform,
  boardId: string,
  itemId: string,
): Command {
  const previous = useBoardStore.getState().boards.get(boardId)?.settings ?? null;
  const previousDismissed = (previous?.dismissedSuggestions as string[] | undefined) ?? [];
  const next: Record<string, unknown> = {
    ...previous,
    dismissedSuggestions: [...new Set([...previousDismissed, itemId])],
  };

  async function apply(settings: Record<string, unknown> | null): Promise<void> {
    const current = useBoardStore.getState().boards.get(boardId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useBoardStore.getState().upsertBoard({ ...current, settings, updatedAt });
    await platform.db.execute('UPDATE boards SET settings = ?, updated_at = ? WHERE id = ?', [
      settings ? JSON.stringify(settings) : null,
      updatedAt,
      boardId,
    ]);
  }

  return {
    label: 'Dismiss suggestion',
    do: () => apply(next),
    undo: () => apply(previous),
  };
}

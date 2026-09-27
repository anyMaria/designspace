import type { Platform } from '@/platform/types';
import type { DbStatement } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { newId } from '@/lib/ids';
import type { Command } from './types';
import type { Board } from '@/state/types';

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

/** Deep-copies the board row plus its frames and placements (new ids throughout, frame ids in
 * placements remapped to the copies). Board-scoped notes/swatches are `items` rows of their own
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

      const frameRows = await platform.db.select<{
        id: string;
        title: string;
        x: number;
        y: number;
        w: number;
        h: number;
        z: number;
      }>('SELECT id, title, x, y, w, h, z FROM frames WHERE board_id = ?', [boardId]);
      const frameIdMap = new Map<string, string>();
      const statements: DbStatement[] = [];
      const now = new Date().toISOString();
      for (const frame of frameRows) {
        const newFrameId = newId();
        frameIdMap.set(frame.id, newFrameId);
        statements.push({
          sql: 'INSERT INTO frames (id, board_id, title, x, y, w, h, z, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            newFrameId,
            copy.id,
            frame.title,
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            frame.z,
            now,
            now,
          ],
        });
      }

      const placementRows = await platform.db.select<{
        item_id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        z: number;
        frame_id: string | null;
      }>('SELECT item_id, x, y, w, h, z, frame_id FROM placements WHERE board_id = ?', [boardId]);
      for (const p of placementRows) {
        statements.push({
          sql: 'INSERT INTO placements (board_id, item_id, x, y, w, h, z, frame_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            copy.id,
            p.item_id,
            p.x,
            p.y,
            p.w,
            p.h,
            p.z,
            p.frame_id ? (frameIdMap.get(p.frame_id) ?? null) : null,
            now,
          ],
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

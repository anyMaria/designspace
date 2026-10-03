import type { Platform } from '@/platform/types';
import type { DbStatement } from '@/platform/types';
import { useFrameStore } from '@/state/frameStore';
import { useLibraryStore } from '@/state/libraryStore';
import { newId } from '@/lib/ids';
import type { Command } from './types';
import type { Frame } from '@/state/types';

export const DEFAULT_FRAME_SIZE = { w: 480, h: 360 };

/** §2.11 "Frames on any space" — a labeled grouping rectangle. Created via the Add menu, default-
 * sized and centered on the drop point, titled "Frame" (renamed in place afterward — see
 * `Engine`'s frame-title double-click handling). */
export function createCreateFrameCommand(
  platform: Platform,
  boardId: string,
  worldX: number,
  worldY: number,
): { command: Command; frame: Frame } {
  const now = new Date().toISOString();
  const frame: Frame = {
    id: newId(),
    boardId,
    title: 'Frame',
    x: worldX - DEFAULT_FRAME_SIZE.w / 2,
    y: worldY - DEFAULT_FRAME_SIZE.h / 2,
    w: DEFAULT_FRAME_SIZE.w,
    h: DEFAULT_FRAME_SIZE.h,
    z: 0,
    createdAt: now,
    updatedAt: now,
  };

  const command: Command = {
    label: 'Create frame',
    do: async () => {
      useFrameStore.getState().upsertFrame(frame);
      await platform.db.execute(
        'INSERT INTO frames (id, board_id, title, x, y, w, h, z, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          frame.id,
          frame.boardId,
          frame.title,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          frame.z,
          frame.createdAt,
          frame.updatedAt,
        ],
      );
    },
    undo: async () => {
      useFrameStore.getState().removeFrame(frame.id);
      await platform.db.execute('DELETE FROM frames WHERE id = ?', [frame.id]);
    },
  };

  return { command, frame };
}

export function createRenameFrameCommand(
  platform: Platform,
  frameId: string,
  title: string,
): Command {
  const previous = useFrameStore.getState().frames.get(frameId);
  const previousTitle = previous?.title ?? '';

  async function apply(value: string): Promise<void> {
    const current = useFrameStore.getState().frames.get(frameId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useFrameStore.getState().upsertFrame({ ...current, title: value, updatedAt });
    await platform.db.execute('UPDATE frames SET title = ?, updated_at = ? WHERE id = ?', [
      value,
      updatedAt,
      frameId,
    ]);
  }

  return {
    label: 'Rename frame',
    do: () => apply(title),
    undo: () => apply(previousTitle),
  };
}

/** Dragging a frame by its title moves it *and* every placement whose `frameId` points at it, by
 * the same delta (§4.9) — one command, one undo step for the whole group. */
export function createMoveFrameCommand(
  platform: Platform,
  frameId: string,
  dx: number,
  dy: number,
): Command {
  const memberIds = [...useLibraryStore.getState().placements.values()]
    .filter((p) => p.frameId === frameId)
    .map((p) => p.itemId);

  async function applyDelta(ddx: number, ddy: number): Promise<void> {
    const frame = useFrameStore.getState().frames.get(frameId);
    if (!frame) return;
    const updatedAt = new Date().toISOString();
    const nextFrame = { ...frame, x: frame.x + ddx, y: frame.y + ddy, updatedAt };
    useFrameStore.getState().upsertFrame(nextFrame);
    const statements: DbStatement[] = [
      {
        sql: 'UPDATE frames SET x = ?, y = ?, updated_at = ? WHERE id = ?',
        params: [nextFrame.x, nextFrame.y, updatedAt, frameId],
      },
    ];
    for (const itemId of memberIds) {
      const placement = useLibraryStore.getState().placements.get(itemId);
      if (!placement) continue;
      const next = { ...placement, x: placement.x + ddx, y: placement.y + ddy };
      useLibraryStore.getState().upsertPlacement(next);
      statements.push({
        sql: 'UPDATE placements SET x = ?, y = ? WHERE board_id = ? AND item_id = ?',
        params: [next.x, next.y, next.boardId, next.itemId],
      });
    }
    await platform.db.batch(statements);
  }

  return {
    label: 'Move frame',
    do: () => applyDelta(dx, dy),
    undo: () => applyDelta(-dx, -dy),
  };
}

/** A free resize (no aspect lock — frames aren't images) of the frame rect only; contents keep
 * their own placements, so resizing doesn't move or rescale what's inside. */
export function createResizeFrameCommand(
  platform: Platform,
  frameId: string,
  next: { x: number; y: number; w: number; h: number },
): Command {
  const previous = useFrameStore.getState().frames.get(frameId);

  async function apply(
    rect: { x: number; y: number; w: number; h: number } | undefined,
  ): Promise<void> {
    if (!rect) return;
    const current = useFrameStore.getState().frames.get(frameId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useFrameStore.getState().upsertFrame({ ...current, ...rect, updatedAt });
    await platform.db.execute(
      'UPDATE frames SET x = ?, y = ?, w = ?, h = ?, updated_at = ? WHERE id = ?',
      [rect.x, rect.y, rect.w, rect.h, updatedAt, frameId],
    );
  }

  return {
    label: 'Resize frame',
    do: () => apply(next),
    undo: () => apply(previous),
  };
}

/** Deletes the frame; its member items are un-parented (`frame_id` set to `null`) rather than
 * deleted or removed from the board — "Frames on any space" groups items, it doesn't own them. */
export function createDeleteFrameCommand(platform: Platform, frameId: string): Command {
  const frame = useFrameStore.getState().frames.get(frameId);
  const memberIds = [...useLibraryStore.getState().placements.values()]
    .filter((p) => p.frameId === frameId)
    .map((p) => p.itemId);

  const command: Command = {
    label: 'Delete frame',
    do: async () => {
      useFrameStore.getState().removeFrame(frameId);
      const statements: DbStatement[] = [
        { sql: 'DELETE FROM frames WHERE id = ?', params: [frameId] },
      ];
      for (const itemId of memberIds) {
        const placement = useLibraryStore.getState().placements.get(itemId);
        if (!placement) continue;
        useLibraryStore.getState().upsertPlacement({ ...placement, frameId: null });
        // Scoped by board_id too — an item can be placed on more than one board, and only *this*
        // board's placement should lose its frame_id.
        statements.push({
          sql: 'UPDATE placements SET frame_id = NULL WHERE board_id = ? AND item_id = ?',
          params: [placement.boardId, itemId],
        });
      }
      await platform.db.batch(statements);
    },
    undo: async () => {
      if (!frame) return;
      useFrameStore.getState().upsertFrame(frame);
      const statements: DbStatement[] = [
        {
          sql: 'INSERT INTO frames (id, board_id, title, x, y, w, h, z, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            frame.id,
            frame.boardId,
            frame.title,
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            frame.z,
            frame.createdAt,
            frame.updatedAt,
          ],
        },
      ];
      for (const itemId of memberIds) {
        const placement = useLibraryStore.getState().placements.get(itemId);
        if (!placement) continue;
        useLibraryStore.getState().upsertPlacement({ ...placement, frameId });
        statements.push({
          sql: 'UPDATE placements SET frame_id = ? WHERE board_id = ? AND item_id = ?',
          params: [frameId, placement.boardId, itemId],
        });
      }
      await platform.db.batch(statements);
    },
  };

  return command;
}

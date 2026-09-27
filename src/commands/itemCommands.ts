import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import type { Command } from './types';

/** Drags and resizes only update the engine while moving and commit one command on pointer-up
 * — §4.11. All three commands below follow the same do/undo shape: snapshot the previous
 * placement values, apply new ones to the store + one `db.batch`, and replay the snapshot on
 * undo. */

interface PositionUpdate {
  id: string;
  x: number;
  y: number;
}

function applyPositions(platform: Platform, updates: PositionUpdate[]): Promise<void> {
  const statements = [];
  for (const u of updates) {
    const placement = useLibraryStore.getState().placements.get(u.id);
    if (!placement) continue;
    useLibraryStore.getState().upsertPlacement({ ...placement, x: u.x, y: u.y });
    statements.push({
      sql: 'UPDATE placements SET x = ?, y = ? WHERE board_id = ? AND item_id = ?',
      params: [u.x, u.y, placement.boardId, u.id],
    });
  }
  return platform.db.batch(statements);
}

export function createMoveItemsCommand(platform: Platform, updates: PositionUpdate[]): Command {
  const previous: PositionUpdate[] = updates.map((u) => {
    const p = useLibraryStore.getState().placements.get(u.id);
    return { id: u.id, x: p?.x ?? u.x, y: p?.y ?? u.y };
  });
  return {
    label: updates.length > 1 ? `Move ${updates.length} items` : 'Move',
    do: () => applyPositions(platform, updates),
    undo: () => applyPositions(platform, previous),
  };
}

interface ResizeUpdate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function applyResize(platform: Platform, update: ResizeUpdate): Promise<void> {
  const placement = useLibraryStore.getState().placements.get(update.id);
  if (!placement) return;
  useLibraryStore.getState().upsertPlacement({ ...placement, ...update });
  await platform.db.execute('UPDATE placements SET x = ?, y = ?, w = ?, h = ? WHERE board_id = ? AND item_id = ?', [
    update.x,
    update.y,
    update.w,
    update.h,
    placement.boardId,
    update.id,
  ]);
}

export function createResizeItemCommand(platform: Platform, update: ResizeUpdate): Command {
  const existing = useLibraryStore.getState().placements.get(update.id);
  const previous: ResizeUpdate = existing
    ? { id: update.id, x: existing.x, y: existing.y, w: existing.w, h: existing.h }
    : update;
  return {
    label: 'Resize',
    do: () => applyResize(platform, update),
    undo: () => applyResize(platform, previous),
  };
}

interface ZUpdate {
  id: string;
  z: number;
}

async function applyZ(platform: Platform, updates: ZUpdate[]): Promise<void> {
  const statements = [];
  for (const u of updates) {
    const placement = useLibraryStore.getState().placements.get(u.id);
    if (!placement) continue;
    useLibraryStore.getState().upsertPlacement({ ...placement, z: u.z });
    statements.push({
      sql: 'UPDATE placements SET z = ? WHERE board_id = ? AND item_id = ?',
      params: [u.z, placement.boardId, u.id],
    });
  }
  await platform.db.batch(statements);
}

/** `]`/`[`/Ctrl+]/Ctrl+[ — §2.2. `updates` is the engine's already-computed new z per item. */
export function createStackOrderCommand(platform: Platform, label: string, updates: ZUpdate[]): Command {
  const previous: ZUpdate[] = updates.map((u) => {
    const p = useLibraryStore.getState().placements.get(u.id);
    return { id: u.id, z: p?.z ?? u.z };
  });
  return {
    label,
    do: () => applyZ(platform, updates),
    undo: () => applyZ(platform, previous),
  };
}

/** Soft delete (§5.2): only `items.deleted_at` changes, so placements and terms survive exactly
 * as they were and undo/restore is exact. On the Library map, Delete/Backspace always trashes
 * (§2.2) — "Remove from board" without trashing is a Board-only distinction that lands in M4. */
export function createTrashCommand(platform: Platform, ids: string[]): Command {
  async function setDeleted(deletedAt: string | null): Promise<void> {
    const statements = [];
    for (const id of ids) {
      const item = useLibraryStore.getState().items.get(id);
      if (!item) continue;
      useLibraryStore.getState().upsertItem({ ...item, deletedAt });
      statements.push({ sql: 'UPDATE items SET deleted_at = ? WHERE id = ?', params: [deletedAt, id] });
    }
    await platform.db.batch(statements);
  }

  return {
    label: ids.length > 1 ? `Move ${ids.length} items to Trash` : 'Move to Trash',
    do: () => setDeleted(new Date().toISOString()),
    undo: () => setDeleted(null),
  };
}

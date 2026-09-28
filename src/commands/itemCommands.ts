import type { DbRow, Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { rowToItem, rowToPlacement } from '@/db/rowMapping';
import { justifiedRows } from '@/lib/packing';
import { unionRects } from '@/lib/geometry';
import type { Command } from './types';
import type { Item } from '@/state/types';

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
  await platform.db.execute(
    'UPDATE placements SET x = ?, y = ?, w = ?, h = ? WHERE board_id = ? AND item_id = ?',
    [update.x, update.y, update.w, update.h, placement.boardId, update.id],
  );
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

async function applyRects(platform: Platform, updates: ResizeUpdate[]): Promise<void> {
  const statements = [];
  for (const u of updates) {
    const placement = useLibraryStore.getState().placements.get(u.id);
    if (!placement) continue;
    useLibraryStore.getState().upsertPlacement({ ...placement, x: u.x, y: u.y, w: u.w, h: u.h });
    statements.push({
      sql: 'UPDATE placements SET x = ?, y = ?, w = ?, h = ? WHERE board_id = ? AND item_id = ?',
      params: [u.x, u.y, u.w, u.h, placement.boardId, u.id],
    });
  }
  await platform.db.batch(statements);
}

/** Tidy up (§2.10, §4.9): re-lays the given items out as justified rows (target row height 240,
 * 16px gaps, aspect ratios preserved) at the selection's own top-left corner, in whatever order
 * the caller passes (the List panel's current sort, typically). One undo step regardless of
 * selection size. */
export function createTidyUpCommand(platform: Platform, orderedItemIds: string[]): Command {
  const previous: ResizeUpdate[] = orderedItemIds.map((id) => {
    const p = useLibraryStore.getState().placements.get(id);
    return { id, x: p?.x ?? 0, y: p?.y ?? 0, w: p?.w ?? 0, h: p?.h ?? 0 };
  });

  const bounds = unionRects(previous.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })));
  const origin = bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 };
  const packInput = previous.map((p) => ({ id: p.id, aspect: p.h > 0 ? p.w / p.h : 1 }));
  const next: ResizeUpdate[] = justifiedRows(packInput, origin).map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
  }));

  return {
    label: 'Tidy up',
    do: () => applyRects(platform, next),
    undo: () => applyRects(platform, previous),
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
export function createStackOrderCommand(
  platform: Platform,
  label: string,
  updates: ZUpdate[],
): Command {
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
      statements.push({
        sql: 'UPDATE items SET deleted_at = ? WHERE id = ?',
        params: [deletedAt, id],
      });
    }
    await platform.db.batch(statements);
  }

  return {
    label: ids.length > 1 ? `Move ${ids.length} items to Trash` : 'Move to Trash',
    do: () => setDeleted(new Date().toISOString()),
    undo: () => setDeleted(null),
  };
}

/** Restores a single trashed item that isn't necessarily loaded into the store (§2.3's "Already
 * in your library · Restore" toast for a duplicate found in the Trash). Re-reads the row from the
 * DB rather than the store — unlike `createTrashCommand`, which only ever acts on items the owner
 * already has selected, and so already loaded. */
export function createRestoreItemCommand(platform: Platform, id: string): Command {
  async function setDeleted(deletedAt: string | null): Promise<void> {
    await platform.db.execute('UPDATE items SET deleted_at = ? WHERE id = ?', [deletedAt, id]);
    if (deletedAt === null) {
      const [itemRow] = await platform.db.select<DbRow>('SELECT * FROM items WHERE id = ?', [id]);
      const [placementRow] = await platform.db.select<DbRow>(
        'SELECT * FROM placements WHERE item_id = ?',
        [id],
      );
      if (itemRow) useLibraryStore.getState().upsertItem(rowToItem(itemRow));
      if (placementRow) useLibraryStore.getState().upsertPlacement(rowToPlacement(placementRow));
    } else {
      useLibraryStore.getState().removeItems([id]);
    }
  }

  return {
    label: 'Restore item',
    do: () => setDeleted(null),
    undo: () => setDeleted(new Date().toISOString()),
  };
}

/** The simple text/boolean fields on the Details panel (§2.6): title, artist, source, "why I
 * saved this", favorite. Each save is immediate and undoable (§2.6 "every change saves
 * immediately and can be undone"). */
const FIELD_COLUMNS = {
  title: 'title',
  artist: 'artist',
  sourceUrl: 'source_url',
  why: 'why',
  favorite: 'favorite',
  color: 'color',
} as const;

type ItemFieldKey = keyof typeof FIELD_COLUMNS;
type ItemFieldValue<K extends ItemFieldKey> = K extends 'favorite' ? boolean : string | null;

export function createSetItemFieldCommand<K extends ItemFieldKey>(
  platform: Platform,
  itemId: string,
  field: K,
  value: ItemFieldValue<K>,
): Command {
  const item = useLibraryStore.getState().items.get(itemId);
  const previousValue = item ? (item[field as keyof Item] as ItemFieldValue<K>) : value;

  async function apply(next: ItemFieldValue<K>): Promise<void> {
    const current = useLibraryStore.getState().items.get(itemId);
    if (!current) return;
    useLibraryStore.getState().upsertItem({ ...current, [field]: next });
    const dbValue = field === 'favorite' ? (next ? 1 : 0) : next;
    await platform.db.execute(`UPDATE items SET ${FIELD_COLUMNS[field]} = ? WHERE id = ?`, [
      dbValue,
      itemId,
    ]);
  }

  return {
    label: `Set ${field}`,
    do: () => apply(value),
    undo: () => apply(previousValue),
  };
}

/** The bulk Details panel's "set for all" fields (§2.6: Artist and Favorite) — one undo step for
 * every selected item, each restoring its own previous value on undo. */
export function createBulkSetItemFieldCommand<K extends ItemFieldKey>(
  platform: Platform,
  itemIds: string[],
  field: K,
  value: ItemFieldValue<K>,
): Command {
  const previous = itemIds.map((id) => {
    const item = useLibraryStore.getState().items.get(id);
    return { id, value: item ? (item[field as keyof Item] as ItemFieldValue<K>) : value };
  });

  async function apply(values: { id: string; value: ItemFieldValue<K> }[]): Promise<void> {
    const statements = [];
    for (const v of values) {
      const current = useLibraryStore.getState().items.get(v.id);
      if (!current) continue;
      useLibraryStore.getState().upsertItem({ ...current, [field]: v.value });
      const dbValue = field === 'favorite' ? (v.value ? 1 : 0) : v.value;
      statements.push({
        sql: `UPDATE items SET ${FIELD_COLUMNS[field]} = ? WHERE id = ?`,
        params: [dbValue, v.id],
      });
    }
    await platform.db.batch(statements);
  }

  return {
    label: `Set ${field} (${itemIds.length})`,
    do: () => apply(itemIds.map((id) => ({ id, value }))),
    undo: () => apply(previous),
  };
}

/** One undo step for a whole import batch (§2.3, §4.11). The rows already exist by the time this
 * is pushed onto the history stack (import writes them as it goes, for the progress card); `do`
 * just confirms they're not deleted (a no-op the first time, a restore on redo) and `undo` trashes
 * them — the same soft-delete `createTrashCommand` already uses, just run in the other order. */
export function createAddItemsCommand(platform: Platform, ids: string[]): Command {
  const trash = createTrashCommand(platform, ids);
  return {
    label: ids.length > 1 ? `Add ${ids.length} items` : 'Add item',
    do: () => trash.undo(),
    undo: () => trash.do(),
  };
}

import type { DbRow, Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';

export const PLACEHOLDER_SIZE = 320; // every import starts as a square until ingest knows its shape

export function fitRect(
  aspect: number,
  size = PLACEHOLDER_SIZE,
): { w: number; h: number; dx: number; dy: number } {
  const w = aspect >= 1 ? size : Math.round(size * aspect);
  const h = aspect >= 1 ? Math.round(size / aspect) : size;
  return { w, h, dx: (size - w) / 2, dy: (size - h) / 2 };
}

/** Derived data, not a command: reshapes every placement of `itemId` that still has the untouched
 * 320×320 import placeholder, keeping it centred where it was. A placement the owner already
 * resized is left alone. */
export async function fitPlacementsToAspect(
  platform: Platform,
  itemId: string,
  aspect: number,
): Promise<void> {
  if (!Number.isFinite(aspect) || aspect <= 0) return;
  const { w, h, dx, dy } = fitRect(aspect);
  if (w === PLACEHOLDER_SIZE && h === PLACEHOLDER_SIZE) return;
  const rows = await platform.db.select<DbRow>(
    'SELECT board_id FROM placements WHERE item_id = ? AND w = ? AND h = ?',
    [itemId, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE],
  );
  if (rows.length === 0) return;
  await platform.db.batch(
    rows.map((r) => ({
      sql: 'UPDATE placements SET x = x + ?, y = y + ?, w = ?, h = ? WHERE board_id = ? AND item_id = ?',
      params: [dx, dy, w, h, r.board_id, itemId],
    })),
  );
  const p = useLibraryStore.getState().placements.get(itemId);
  if (p && p.w === PLACEHOLDER_SIZE && p.h === PLACEHOLDER_SIZE) {
    useLibraryStore.getState().upsertPlacement({ ...p, x: p.x + dx, y: p.y + dy, w, h });
  }
}

import type { Item, Placement } from '@/state/types';
import { isMediaItem } from './itemKinds';

/** The order Shift+Space / Ctrl+Space walk through the pictures (and videos, PDFs, fonts, links) of the
 * current space: reading order, row by row (items whose tops are within half a row of each other
 * share a row), left to right. Trashed items, notes, palettes and type collections are skipped. */
export function browseOrder(
  items: Map<string, Item>,
  placements: Map<string, Placement>,
): string[] {
  const list = [...placements.values()]
    .filter((p) => {
      const item = items.get(p.itemId);
      return !!item && !item.deletedAt && isMediaItem(item) && !p.parentId;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Placement[][] = [];
  for (const p of list) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(p.y - row[0].y) < Math.max(row[0].h, p.h) / 2) row.push(p);
    else rows.push([p]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x).map((p) => p.itemId));
}

/** The next (`1`) or previous (`-1`) id after `current`, wrapping around. With no current item (or
 * one that is not in the list) the first item, or the last when going back. */
export function neighbourId(order: string[], current: string | null, dir: 1 | -1): string | null {
  if (order.length === 0) return null;
  const i = current ? order.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? order[0] : order[order.length - 1];
  return order[(i + dir + order.length) % order.length];
}

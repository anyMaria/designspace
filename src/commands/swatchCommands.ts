import type { Platform } from '@/platform/types';
import type { DbStatement } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { newId } from '@/lib/ids';
import { justifiedRows } from '@/lib/packing';
import { colorFamily } from '@/lib/color';
import type { Command } from './types';
import type { Item, Placement } from '@/state/types';

export const SWATCH_SIZE = 160; // world units — §2.11's spec table: "160 × 160"
const DEFAULT_SWATCH_COLOR = '#8c8c8c';
const MIN_EXTRACTED = 5;
const MAX_EXTRACTED = 8;

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function makeSwatchItem(hex: string, name: string, originBoardId: string | null): Item {
  const now = new Date().toISOString();
  return {
    id: newId(),
    kind: 'swatch',
    title: name,
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width: null,
    height: null,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: now, // swatches never go through Inbox triage, same as notes
    viewedAt: null,
    status: 'ok',
    derivedV: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    color: hex,
    originBoardId,
  };
}

function insertStatements(item: Item, placement: Placement): DbStatement[] {
  return [
    {
      sql: `INSERT INTO items
        (id, kind, title, status, derived_v, sorted_at, created_at, updated_at, color, origin_board_id)
        VALUES (?, 'swatch', ?, 'ok', 0, ?, ?, ?, ?, ?)`,
      params: [
        item.id,
        item.title,
        item.sortedAt,
        item.createdAt,
        item.updatedAt,
        item.color,
        item.originBoardId ?? null,
      ],
    },
    {
      sql: 'INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        placement.boardId,
        placement.itemId,
        placement.x,
        placement.y,
        placement.w,
        placement.h,
        placement.z,
        placement.addedAt,
      ],
    },
  ];
}

/** The Add menu's "Swatch" (§2.3, N-adjacent) — a single new swatch, default grey, centered on
 * the drop point; the owner picks a real color and optional name afterward via the Details
 * panel (M4-5 doesn't add a bespoke color-picker overlay — swatches are simple enough that the
 * existing text-field editing pattern, extended with a `color` field, covers them). */
export function createCreateSwatchCommand(
  platform: Platform,
  boardId: string,
  isLibraryBoard: boolean,
  worldX: number,
  worldY: number,
): { command: Command; item: Item } {
  const item = makeSwatchItem(DEFAULT_SWATCH_COLOR, '', isLibraryBoard ? null : boardId);
  const placement: Placement = {
    boardId,
    itemId: item.id,
    x: worldX - SWATCH_SIZE / 2,
    y: worldY - SWATCH_SIZE / 2,
    w: SWATCH_SIZE,
    h: SWATCH_SIZE,
    z: 0,
    frameId: null,
    addedAt: item.createdAt,
  };

  const command: Command = {
    label: 'Create swatch',
    do: async () => {
      useLibraryStore.getState().upsertItem(item);
      useLibraryStore.getState().upsertPlacement(placement);
      await platform.db.batch(insertStatements(item, placement));
    },
    undo: async () => {
      useLibraryStore.getState().removeItems([item.id]);
      await platform.db.execute('DELETE FROM items WHERE id = ?', [item.id]);
    },
  };

  return { command, item };
}

/** "Extract palette" (§2.3, context menu on a selection, or the whole board when nothing's
 * selected) — "turns the selection or the whole board into 5–8 swatch items", pulled from the
 * dominant colors ingest already computed per item (`item.palette`, M1). Colors are merged by
 * hex across every source item (summing weight) so a set of similar photos doesn't just repeat
 * the same swatch 5 times, then the top 5–8 by combined weight are kept. Named from
 * `colorFamily()` rather than left blank, since a bare color block with no name is harder to
 * scan in the List panel later. */
export function createExtractPaletteCommand(
  platform: Platform,
  sourceItemIds: string[],
  boardId: string,
  isLibraryBoard: boolean,
  origin: { x: number; y: number },
): { command: Command; items: Item[] } {
  const items = useLibraryStore.getState().items;
  const weightByHex = new Map<string, number>();
  for (const id of sourceItemIds) {
    for (const entry of items.get(id)?.palette ?? []) {
      weightByHex.set(entry.hex, (weightByHex.get(entry.hex) ?? 0) + entry.weight);
    }
  }
  const ranked = [...weightByHex.entries()].sort((a, b) => b[1] - a[1]);
  const chosen = ranked.slice(0, Math.max(MIN_EXTRACTED, Math.min(MAX_EXTRACTED, ranked.length)));

  const originBoardId = isLibraryBoard ? null : boardId;
  const swatches = chosen.map(([hex]) =>
    makeSwatchItem(hex, titleCase(colorFamily(hex)), originBoardId),
  );
  const rects = justifiedRows(
    swatches.map((s) => ({ id: s.id, aspect: 1 })),
    { x: origin.x, y: origin.y },
  );
  const placements: Placement[] = rects.map((r) => ({
    boardId,
    itemId: r.id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    z: 0,
    frameId: null,
    addedAt: new Date().toISOString(),
  }));

  const command: Command = {
    label: swatches.length > 1 ? `Extract ${swatches.length} swatches` : 'Extract palette',
    do: async () => {
      const statements: DbStatement[] = [];
      for (let i = 0; i < swatches.length; i++) {
        useLibraryStore.getState().upsertItem(swatches[i]);
        useLibraryStore.getState().upsertPlacement(placements[i]);
        statements.push(...insertStatements(swatches[i], placements[i]));
      }
      if (statements.length > 0) await platform.db.batch(statements);
    },
    undo: async () => {
      const ids = swatches.map((s) => s.id);
      useLibraryStore.getState().removeItems(ids);
      if (ids.length > 0) {
        await platform.db.batch(
          ids.map((id) => ({ sql: 'DELETE FROM items WHERE id = ?', params: [id] })),
        );
      }
    },
  };

  return { command, items: swatches };
}

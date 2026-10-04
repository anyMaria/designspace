import type { DbStatement, Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import { newId } from '@/lib/ids';
import { unionRects } from '@/lib/geometry';
import {
  colorFamiliesOf,
  paletteCardSize,
  paletteEntriesOf,
  swatchColorsOf,
  type SwatchColor,
} from '@/lib/palette';
import { en } from '@/i18n/en';
import type { Command } from './types';
import type { Item, Placement } from '@/state/types';

const MIN_EXTRACTED = 5;
const MAX_EXTRACTED = 8;
const EXTRACT_GAP = 48; // world units between the source selection and its extracted palette
const ROW_TOLERANCE = 40; // swatches whose y differs by less than this share a "row" when combining

function colorColumns(colors: SwatchColor[]) {
  return {
    swatchColors: colors,
    color: colors[0]?.hex ?? null,
    palette: paletteEntriesOf(colors),
    colorFamilies: colorFamiliesOf(colors),
  };
}

function makePaletteItem(colors: SwatchColor[], name: string, originBoardId: string | null): Item {
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
    ...colorColumns(colors),
    phash: null,
    favorite: false,
    sortedAt: now, // swatches never go through Inbox triage, same as notes
    viewedAt: null,
    status: 'ok',
    derivedV: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    originBoardId,
  };
}

function insertStatements(item: Item, placement: Placement): DbStatement[] {
  return [
    {
      sql: `INSERT INTO items
        (id, kind, title, status, derived_v, sorted_at, created_at, updated_at, color, origin_board_id,
         swatch_colors, palette, color_families)
        VALUES (?, 'swatch', ?, 'ok', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        item.id,
        item.title,
        item.sortedAt,
        item.createdAt,
        item.updatedAt,
        item.color ?? null,
        item.originBoardId ?? null,
        JSON.stringify(item.swatchColors ?? []),
        JSON.stringify(item.palette ?? []),
        JSON.stringify(item.colorFamilies ?? []),
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

function placementFor(item: Item, boardId: string, x: number, y: number, n: number): Placement {
  const { w, h } = paletteCardSize(n);
  return {
    boardId,
    itemId: item.id,
    x,
    y,
    w,
    h,
    z: 0,
    frameId: null,
    cropX: null,
    cropY: null,
    addedAt: item.createdAt,
  };
}

function undoCreate(platform: Platform, ids: string[]): Promise<void> {
  useLibraryStore.getState().removeItems(ids);
  return platform.db.batch(
    ids.map((id) => ({ sql: 'DELETE FROM items WHERE id = ?', params: [id] })),
  );
}

/** Changes a swatch's/palette's colours (Patch 1 · C2). One undo step: it rewrites the colour
 * columns, the derived palette/families, and resizes every placement to fit `n` colours (keeping
 * x, y). Resizing here is not a separate command: the card size is a function of the colours. */
export function createSetSwatchColorsCommand(
  platform: Platform,
  itemId: string,
  next: SwatchColor[],
): Command {
  let previous: SwatchColor[] | null = null;

  async function apply(colors: SwatchColor[]): Promise<void> {
    const store = useLibraryStore.getState();
    const item = store.items.get(itemId);
    if (!item) return;
    const now = new Date().toISOString();
    const cols = colorColumns(colors);
    const { w, h } = paletteCardSize(colors.length);
    store.upsertItem({ ...item, ...cols, updatedAt: now });
    const placement = store.placements.get(itemId);
    if (placement) store.upsertPlacement({ ...placement, w, h });
    await platform.db.batch([
      {
        sql: `UPDATE items SET swatch_colors = ?, color = ?, palette = ?, color_families = ?,
              updated_at = ? WHERE id = ?`,
        params: [
          JSON.stringify(cols.swatchColors),
          cols.color,
          JSON.stringify(cols.palette),
          JSON.stringify(cols.colorFamilies),
          now,
          itemId,
        ],
      },
      { sql: 'UPDATE placements SET w = ?, h = ? WHERE item_id = ?', params: [w, h, itemId] },
    ]);
  }

  return {
    label: 'Change colors',
    do: async () => {
      const item = useLibraryStore.getState().items.get(itemId);
      previous ??= item ? swatchColorsOf(item) : [];
      await apply(next);
    },
    undo: () => apply(previous ?? []),
  };
}

/** A new palette (or, with one colour, a plain swatch) centred on a point. */
export function createCreatePaletteCommand(
  platform: Platform,
  boardId: string,
  isLibraryBoard: boolean,
  centreX: number,
  centreY: number,
  colors: SwatchColor[],
  name: string,
): { command: Command; item: Item } {
  const item = makePaletteItem(colors, name, isLibraryBoard ? null : boardId);
  const { w, h } = paletteCardSize(colors.length);
  const placement = placementFor(item, boardId, centreX - w / 2, centreY - h / 2, colors.length);

  const command: Command = {
    label: colors.length > 1 ? 'Create palette' : 'Create swatch',
    do: async () => {
      useLibraryStore.getState().upsertItem(item);
      useLibraryStore.getState().upsertPlacement(placement);
      await platform.db.batch(insertStatements(item, placement));
    },
    undo: () => undoCreate(platform, [item.id]),
  };
  return { command, item };
}

/** Reading order: rows of swatches within `ROW_TOLERANCE` world units of each other in y, then x. */
function readingOrder(ids: string[]): string[] {
  const placements = useLibraryStore.getState().placements;
  const pos = ids
    .map((id) => ({ id, p: placements.get(id) }))
    .filter((e): e is { id: string; p: Placement } => !!e.p)
    .sort((a, b) => a.p.y - b.p.y);
  const rows: { id: string; p: Placement }[][] = [];
  for (const e of pos) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(e.p.y - row[0].p.y) < ROW_TOLERANCE) row.push(e);
    else rows.push([e]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.p.x - b.p.x).map((e) => e.id));
}

/** "Combine into palette": the selected swatches' colours in reading order become one palette at
 * the selection's top-left; the old swatches go to the Trash. One undo step. */
export function createCombineIntoPaletteCommand(
  platform: Platform,
  itemIds: string[],
): { command: Command; item: Item } | null {
  const state = useLibraryStore.getState();
  const ordered = readingOrder(itemIds).filter((id) => state.items.get(id)?.kind === 'swatch');
  if (ordered.length < 2) return null;
  const colors = ordered.flatMap((id) => swatchColorsOf(state.items.get(id) as Item));
  const rects = ordered.map((id) => state.placements.get(id) as Placement);
  const bounds = unionRects(rects);
  const boardId = rects[0].boardId;
  const isLibrary = useBoardStore.getState().boards.get(boardId)?.kind === 'library';
  if (!bounds) return null;

  const item = makePaletteItem(colors, '', isLibrary ? null : boardId);
  const placement = placementFor(item, boardId, bounds.x, bounds.y, colors.length);

  async function setDeleted(deletedAt: string | null): Promise<void> {
    const statements: DbStatement[] = [];
    for (const id of ordered) {
      const old = useLibraryStore.getState().items.get(id);
      if (!old) continue;
      useLibraryStore.getState().upsertItem({ ...old, deletedAt });
      statements.push({
        sql: 'UPDATE items SET deleted_at = ? WHERE id = ?',
        params: [deletedAt, id],
      });
    }
    await platform.db.batch(statements);
  }

  const command: Command = {
    label: 'Combine into palette',
    do: async () => {
      useLibraryStore.getState().upsertItem(item);
      useLibraryStore.getState().upsertPlacement(placement);
      await platform.db.batch(insertStatements(item, placement));
      await setDeleted(new Date().toISOString());
    },
    undo: async () => {
      await setDeleted(null);
      await undoCreate(platform, [item.id]);
    },
  };
  return { command, item };
}

/** "Extract palette": the dominant colours ingest already computed per item (`item.palette`),
 * merged by hex across the sources (summing weight), top 5–8 by weight, become **one** palette
 * placed 48 units right of the selection's bounds. */
export function createExtractPaletteCommand(
  platform: Platform,
  sourceItemIds: string[],
  boardId: string,
  isLibraryBoard: boolean,
  origin: { x: number; y: number },
): { command: Command; items: Item[] } {
  const { items, placements } = useLibraryStore.getState();
  const weightByHex = new Map<string, number>();
  for (const id of sourceItemIds) {
    for (const entry of items.get(id)?.palette ?? []) {
      weightByHex.set(entry.hex, (weightByHex.get(entry.hex) ?? 0) + entry.weight);
    }
  }
  const ranked = [...weightByHex.entries()].sort((a, b) => b[1] - a[1]);
  const chosen = ranked.slice(0, Math.max(MIN_EXTRACTED, Math.min(MAX_EXTRACTED, ranked.length)));
  const colors: SwatchColor[] = chosen.map(([hex]) => ({ hex }));
  if (colors.length === 0)
    return { command: { label: 'Extract palette', do() {}, undo() {} }, items: [] };

  const bounds = unionRects(
    sourceItemIds.map((id) => placements.get(id)).filter((p): p is Placement => !!p),
  );
  const at = bounds ? { x: bounds.x + bounds.w + EXTRACT_GAP, y: bounds.y } : origin;

  const item = makePaletteItem(
    colors,
    en.palettes.fromItems(sourceItemIds.length),
    isLibraryBoard ? null : boardId,
  );
  const placement = placementFor(item, boardId, at.x, at.y, colors.length);

  const command: Command = {
    label: 'Extract palette',
    do: async () => {
      useLibraryStore.getState().upsertItem(item);
      useLibraryStore.getState().upsertPlacement(placement);
      await platform.db.batch(insertStatements(item, placement));
    },
    undo: () => undoCreate(platform, [item.id]),
  };
  return { command, items: [item] };
}

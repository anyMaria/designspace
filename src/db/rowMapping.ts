import type { DbRow } from '@/platform/types';
import type { Item, ItemKind, ItemStatus, PaletteEntry, Placement } from '@/state/types';

function asString(v: DbRow[string]): string {
  return v === null ? '' : String(v);
}
function asNullableString(v: DbRow[string]): string | null {
  return v === null || v === undefined ? null : String(v);
}
function asNullableNumber(v: DbRow[string]): number | null {
  return v === null || v === undefined ? null : Number(v);
}
function asJson<T>(v: DbRow[string]): T | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return null;
  }
}

/** Maps one row from `SELECT * FROM items` (or an equivalent column set) into an `Item`. */
export function rowToItem(row: DbRow): Item {
  return {
    id: asString(row.id),
    kind: asString(row.kind) as ItemKind,
    title: asString(row.title),
    filePath: asNullableString(row.file_path),
    fileName: asNullableString(row.file_name),
    fileHash: asNullableString(row.file_hash),
    fileSize: asNullableNumber(row.file_size),
    mime: asNullableString(row.mime),
    width: asNullableNumber(row.width),
    height: asNullableNumber(row.height),
    artist: asNullableString(row.artist),
    why: asNullableString(row.why),
    palette: asJson<PaletteEntry[]>(row.palette),
    colorFamilies: asJson<string[]>(row.color_families),
    phash: asNullableString(row.phash),
    favorite: Number(row.favorite) === 1,
    sortedAt: asNullableString(row.sorted_at),
    viewedAt: asNullableString(row.viewed_at),
    status: asString(row.status) as ItemStatus,
    derivedV: Number(row.derived_v ?? 0),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

/** Maps one row from `SELECT * FROM placements`. */
export function rowToPlacement(row: DbRow): Placement {
  return {
    boardId: asString(row.board_id),
    itemId: asString(row.item_id),
    x: Number(row.x),
    y: Number(row.y),
    w: Number(row.w),
    h: Number(row.h),
    z: Number(row.z ?? 0),
    frameId: asNullableString(row.frame_id),
    addedAt: asString(row.added_at),
  };
}

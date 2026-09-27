import type { DbRow } from '@/platform/types';
import type {
  Board,
  BoardCamera,
  BoardKind,
  Facet,
  Item,
  ItemKind,
  ItemStatus,
  ItemTerm,
  ManualConnection,
  PaletteEntry,
  Placement,
  Term,
  TermVia,
} from '@/state/types';

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
    sourceUrl: asNullableString(row.source_url),
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

/** Maps one row from `SELECT * FROM terms`. */
export function rowToTerm(row: DbRow): Term {
  return {
    id: asString(row.id),
    facet: asString(row.facet) as Facet,
    name: asString(row.name),
    nameNorm: asString(row.name_norm),
    aiHint: asNullableString(row.ai_hint),
    sort: Number(row.sort ?? 0),
    createdAt: asString(row.created_at),
  };
}

/** Maps one row from `SELECT * FROM item_terms`. */
export function rowToItemTerm(row: DbRow): ItemTerm {
  return {
    itemId: asString(row.item_id),
    termId: asString(row.term_id),
    via: asString(row.via) as TermVia,
    addedAt: asString(row.added_at),
  };
}

/** Maps one row from `SELECT * FROM boards`. */
export function rowToBoard(row: DbRow): Board {
  return {
    id: asString(row.id),
    kind: asString(row.kind) as BoardKind,
    name: asString(row.name),
    sourceFilter: asJson<unknown>(row.source_filter),
    settings: asJson<Record<string, unknown>>(row.settings),
    camera: asJson<BoardCamera>(row.camera),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

/** Maps one row from `SELECT * FROM manual_connections`. */
export function rowToManualConnection(row: DbRow): ManualConnection {
  return {
    id: asString(row.id),
    fromId: asString(row.from_id),
    toId: asString(row.to_id),
    label: asNullableString(row.label),
    createdAt: asString(row.created_at),
  };
}

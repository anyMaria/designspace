import type { DbRow, Platform } from '@/platform/types';

export interface BoardSummary {
  /** Items placed on the board that are not in the Trash. */
  count: number;
  /** Up to four ready pictures, newest first, for the menu's 2×2 cover. */
  coverIds: string[];
}

const MAX_COVERS = 4;
const COVER_KINDS = new Set(['image', 'video', 'pdf', 'link']);

/** Per board: how many items it holds and which four pictures make its cover (Patch 2 · C4).
 * Reload when the Library menu opens. */
export async function loadBoardSummaries(platform: Platform): Promise<Map<string, BoardSummary>> {
  const rows = await platform.db.select<DbRow>(
    `SELECT p.board_id, p.item_id, i.kind, i.status
       FROM placements p JOIN items i ON i.id = p.item_id
      WHERE i.deleted_at IS NULL
      ORDER BY p.board_id, p.added_at DESC`,
  );
  const out = new Map<string, BoardSummary>();
  for (const r of rows) {
    const boardId = String(r.board_id);
    let summary = out.get(boardId);
    if (!summary) out.set(boardId, (summary = { count: 0, coverIds: [] }));
    summary.count++;
    if (
      summary.coverIds.length < MAX_COVERS &&
      r.status === 'ok' &&
      COVER_KINDS.has(String(r.kind))
    ) {
      summary.coverIds.push(String(r.item_id));
    }
  }
  return out;
}

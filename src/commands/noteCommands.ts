import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { newId } from '@/lib/ids';
import { emptyNoteBody, noteBodyToPlainText } from '@/lib/noteText';
import { noteGeometry, type NoteColor } from '@/design/tokens';
import type { Command } from './types';
import type { Item, Placement } from '@/state/types';

// New notes use the ruled-paper size (Patch 1 · D1); existing notes keep their own size.

/** "Double-click the empty canvas" / "pasted text becomes a note" (§2.11). `boardId` is the
 * *current* space — a note created while on a board gets `origin_board_id` set to it (board-only,
 * doesn't show in the Library), while one created on the Library map is library-wide (`null`),
 * matching how `origin_board_id` already works for swatches per §5.2. Either way it also needs a
 * `placements` row on that same board — items and placements are always separate, even for a
 * board-only item. */
export function createCreateNoteCommand(
  platform: Platform,
  boardId: string,
  isLibraryBoard: boolean,
  worldX: number,
  worldY: number,
  initialText: string,
  color: NoteColor,
): { command: Command; item: Item } {
  const body = initialText
    ? {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: initialText }] }],
      }
    : emptyNoteBody();
  const bodyText = noteBodyToPlainText(body);
  const now = new Date().toISOString();

  const item: Item = {
    id: newId(),
    kind: 'note',
    title: '',
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
    sortedAt: now, // notes don't go through Inbox triage — they're "sorted" the moment they exist
    viewedAt: null,
    status: 'ok',
    derivedV: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    body,
    bodyText,
    color,
    originBoardId: isLibraryBoard ? null : boardId,
  };
  const placement: Placement = {
    boardId,
    itemId: item.id,
    x: worldX - noteGeometry.defaultW / 2,
    y: worldY - noteGeometry.defaultH / 2,
    w: noteGeometry.defaultW,
    h: noteGeometry.defaultH,
    z: 0,
    frameId: null,
    addedAt: now,
  };

  const command: Command = {
    label: 'Create note',
    do: async () => {
      useLibraryStore.getState().upsertItem(item);
      useLibraryStore.getState().upsertPlacement(placement);
      await platform.db.batch([
        {
          sql: `INSERT INTO items
            (id, kind, title, status, derived_v, sorted_at, created_at, updated_at, body, body_text, color, origin_board_id)
            VALUES (?, 'note', '', 'ok', 0, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            item.id,
            now,
            now,
            now,
            JSON.stringify(body),
            bodyText,
            color,
            item.originBoardId,
          ],
        },
        {
          sql: 'INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            boardId,
            item.id,
            placement.x,
            placement.y,
            placement.w,
            placement.h,
            placement.z,
            now,
          ],
        },
      ]);
    },
    undo: async () => {
      useLibraryStore.getState().removeItems([item.id]);
      await platform.db.execute('DELETE FROM items WHERE id = ?', [item.id]);
    },
  };

  return { command, item };
}

/** Saves a note's content — every edit is immediate and undoable, same as the Details panel's
 * text fields (§2.6). `plainText` is derived by the caller (the editor already has it from
 * TipTap's own `editor.getText()`) rather than recomputed here, so this stays a pure "write what
 * I was given" command. */
export function createSaveNoteBodyCommand(
  platform: Platform,
  itemId: string,
  body: unknown,
  plainText: string,
  /** Grow the note to this height (world units) in the same undo step; never used to shrink. */
  newHeight?: number,
): Command {
  const previous = useLibraryStore.getState().items.get(itemId);
  const previousHeight = useLibraryStore.getState().placements.get(itemId)?.h ?? null;
  const previousBody = previous?.body ?? null;
  const previousText = previous?.bodyText ?? null;

  async function apply(
    nextBody: unknown,
    nextText: string | null,
    height: number | null,
  ): Promise<void> {
    const current = useLibraryStore.getState().items.get(itemId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useLibraryStore
      .getState()
      .upsertItem({ ...current, body: nextBody, bodyText: nextText, updatedAt });
    const statements: { sql: string; params: unknown[] }[] = [
      {
        sql: 'UPDATE items SET body = ?, body_text = ?, updated_at = ? WHERE id = ?',
        params: [nextBody !== null ? JSON.stringify(nextBody) : null, nextText, updatedAt, itemId],
      },
    ];
    const placement = useLibraryStore.getState().placements.get(itemId);
    if (height !== null && placement && placement.h !== height) {
      useLibraryStore.getState().upsertPlacement({ ...placement, h: height });
      statements.push({
        sql: 'UPDATE placements SET h = ? WHERE item_id = ?',
        params: [height, itemId],
      });
    }
    await platform.db.batch(statements);
  }

  const grow = newHeight !== undefined && previousHeight !== null && newHeight > previousHeight;

  return {
    label: 'Edit note',
    do: () => apply(body, plainText, grow ? newHeight : null),
    undo: () => apply(previousBody, previousText, grow ? previousHeight : null),
  };
}

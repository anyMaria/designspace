import { useEffect } from 'react';
import type { Engine } from '@/canvas/Engine';
import type { Platform } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { createAddToBoardCommand } from '@/commands/boardCommands';
import { useToastStore } from '@/state/toastStore';
import { en } from '@/i18n/en';

/** The custom drag MIME the List panel's tiles use — distinct from `Files` (native OS drag,
 * handled by `useDropAndPaste`) so the two drop handlers never fire for the same gesture. */
export const LIST_ITEM_DRAG_MIME = 'application/x-designspace-item-id';

/** "Drag-from-Library-list-onto-canvas-to-add-a-placement" (§2.11) — the other half of the
 * List's [This board | Library] switch. Listens on `window` like `useDropAndPaste` does, for the
 * same reason: the dock/panels sit as siblings above the canvas element, and a drop over them
 * should still count. */
export function useListDragToBoard(engine: Engine | null, platform: Platform): void {
  useEffect(() => {
    function onDragOver(e: DragEvent): void {
      if (!e.dataTransfer?.types.includes(LIST_ITEM_DRAG_MIME)) return;
      e.preventDefault();
    }

    function onDrop(e: DragEvent): void {
      const itemId = e.dataTransfer?.getData(LIST_ITEM_DRAG_MIME);
      if (!itemId) return;
      e.preventDefault();

      const boardId = useBoardStore.getState().currentBoardId;
      const board = boardId ? useBoardStore.getState().boards.get(boardId) : null;
      if (!boardId || board?.kind !== 'board') return; // dropping onto the Library map is a no-op

      if (useLibraryStore.getState().placements.has(itemId)) {
        useToastStore.getState().show(en.list.alreadyOnBoard);
        return;
      }

      const point = engine?.screenToWorld(e.clientX, e.clientY) ??
        engine?.viewportCenter() ?? { x: 0, y: 0 };
      const command = createAddToBoardCommand(platform, boardId, itemId, point);
      void useHistoryStore.getState().execute(command);
    }

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [engine, platform]);
}

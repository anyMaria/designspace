import { useEffect } from 'react';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import { useNoteEditStore } from '@/state/noteEditStore';
import { useHistoryStore } from '@/commands/history';
import { createCreateNoteCommand } from '@/commands/noteCommands';

/** §2.11 "double-click the empty canvas" creates a note there and opens it for editing;
 * double-clicking an existing note opens it too (Focus view, wired separately in
 * `useFocusViewBinding`, only ever handles `kind: 'image'`, so the two never fight over the same
 * double-click). */
export function useNoteCanvasBinding(engine: Engine | null, platform: Platform): void {
  useEffect(() => {
    if (!engine) return;
    return engine.on('dblclick', (id, world) => {
      if (id) {
        const item = useLibraryStore.getState().items.get(id);
        if (item?.kind === 'note') useNoteEditStore.getState().open(id);
        return;
      }

      const boardId = useBoardStore.getState().currentBoardId;
      if (!boardId) return;
      const board = useBoardStore.getState().boards.get(boardId);
      const isLibraryBoard = board?.kind === 'library';
      const { command, item } = createCreateNoteCommand(
        platform,
        boardId,
        isLibraryBoard,
        world.x,
        world.y,
        '',
        'cream',
      );
      void useHistoryStore
        .getState()
        .execute(command)
        .then(() => useNoteEditStore.getState().open(item.id));
    });
  }, [engine, platform]);
}

import { Popover, Menu } from '@/design/components';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { useToastStore } from '@/state/toastStore';
import {
  createStackOrderCommand,
  createTidyUpCommand,
  createTrashCommand,
} from '@/commands/itemCommands';
import { createBackToInboxCommand } from '@/commands/itemTermCommands';
import {
  createBoardFromItemsCommand,
  createRemoveFromBoardCommand,
} from '@/commands/boardCommands';
import { useBoardStore } from '@/state/boardStore';
import { switchSpace } from '@/features/boards/switchSpace';
import { useListStore } from '@/state/listStore';
import { sortItems } from '@/features/list/listGrouping';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';
import type { ContextMenuState } from './useContextMenu';

/** Right-click menu for a canvas item — §2.4. "Create board from selection" (M4-2) and, while
 * viewing a board, "Remove from board" (M4-3 — deletes only this board's placement, unlike Move
 * to Trash which deletes the item everywhere) both now exist. The rest (Open, Add to an
 * *existing* board, Find similar, Copy palette, Set cover) still need drag-to-add or video/PDF
 * support from later milestones — deferred and logged in docs/DECISIONS.md rather than shown as
 * dead buttons. */
export function ContextMenu({
  state,
  engine,
  platform,
  onClose,
}: {
  state: ContextMenuState;
  engine: Engine | null;
  platform: Platform;
  onClose: () => void;
}) {
  const selection = [...useLibraryStore.getState().selection];
  const ids = selection.includes(state.itemId) ? selection : [state.itemId];
  const currentBoardId = useBoardStore.getState().currentBoardId;
  const currentBoard = currentBoardId ? useBoardStore.getState().boards.get(currentBoardId) : null;
  const onBoard = currentBoard?.kind === 'board';

  async function copyImage(): Promise<void> {
    onClose();
    const item = useLibraryStore.getState().items.get(state.itemId);
    if (!item?.filePath) return;
    try {
      const res = await fetch(platform.media.originalUrl(item.filePath));
      const bytes = new Uint8Array(await res.arrayBuffer());
      await platform.clipboard.writeImage(bytes, item.mime ?? 'image/png');
      useToastStore.getState().show(en.contextMenu.copyImageSucceeded);
    } catch (err) {
      logger.error('Copy image failed', err);
      useToastStore.getState().show(en.contextMenu.copyImageFailed);
    }
  }

  async function showInExplorer(): Promise<void> {
    onClose();
    const item = useLibraryStore.getState().items.get(state.itemId);
    if (!item?.filePath) return;
    try {
      await platform.media.reveal(item.filePath);
    } catch (err) {
      logger.error('Show in Explorer failed', err);
    }
  }

  function stack(toFront: boolean): void {
    onClose();
    if (!engine) return;
    const updates = engine.bringForward(ids, toFront);
    const label = toFront ? en.contextMenu.bringToFront : en.contextMenu.sendToBack;
    void useHistoryStore.getState().execute(createStackOrderCommand(platform, label, updates));
  }

  function tidyUp(): void {
    onClose();
    const sortBy = useListStore.getState().sortBy;
    const ordered = sortItems(ids, sortBy, useLibraryStore.getState().items);
    void useHistoryStore.getState().execute(createTidyUpCommand(platform, ordered));
  }

  function backToInbox(): void {
    onClose();
    void useHistoryStore.getState().execute(createBackToInboxCommand(platform, ids));
  }

  function connectTo(): void {
    onClose();
    if (!engine) return;
    engine.startConnectPick(state.itemId);
    useToastStore.getState().show(en.connections.pickTarget);
  }

  function createBoard(): void {
    onClose();
    const { command, board } = createBoardFromItemsCommand(platform, ids, en.boards.untitled, null);
    void useHistoryStore
      .getState()
      .execute(command)
      .then(() => switchSpace(platform, board.id))
      .then(() => {
        useToastStore.getState().show(en.boards.createdBoard(board.name));
      });
  }

  function removeFromBoard(): void {
    onClose();
    if (!currentBoard) return;
    void useHistoryStore
      .getState()
      .execute(createRemoveFromBoardCommand(platform, currentBoard.id, ids))
      .then(() => {
        useToastStore
          .getState()
          .show(ids.length > 1 ? `Removed ${ids.length} items from board` : 'Removed from board', {
            actionLabel: en.toasts.undo,
            onAction: () => void useHistoryStore.getState().undo(),
          });
      });
  }

  function moveToTrash(): void {
    onClose();
    void useHistoryStore
      .getState()
      .execute(createTrashCommand(platform, ids))
      .then(() => {
        useToastStore
          .getState()
          .show(ids.length > 1 ? `Moved ${ids.length} items to Trash` : 'Moved to Trash', {
            actionLabel: en.toasts.undo,
            onAction: () => void useHistoryStore.getState().undo(),
          });
      });
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 4 }}
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 5 }}>
        <Popover>
          <Menu
            aria-label="Item"
            items={[
              {
                id: 'copy-image',
                label: en.contextMenu.copyImage,
                onSelect: () => void copyImage(),
              },
              {
                id: 'show-in-explorer',
                label: en.contextMenu.showInExplorer,
                disabled: platform.kind !== 'tauri',
                onSelect: () => void showInExplorer(),
              },
              {
                id: 'bring-to-front',
                label: en.contextMenu.bringToFront,
                onSelect: () => stack(true),
              },
              {
                id: 'send-to-back',
                label: en.contextMenu.sendToBack,
                onSelect: () => stack(false),
              },
              {
                id: 'tidy-up',
                label: en.contextMenu.tidyUp,
                onSelect: tidyUp,
              },
              {
                id: 'connect-to',
                label: en.connections.connectTo,
                onSelect: connectTo,
              },
              {
                id: 'back-to-inbox',
                label: en.contextMenu.backToInbox,
                onSelect: backToInbox,
              },
              {
                id: 'create-board',
                label: en.boards.createFromSelection,
                onSelect: createBoard,
              },
              ...(onBoard
                ? [
                    {
                      id: 'remove-from-board',
                      label: en.boards.removeFromBoard,
                      onSelect: removeFromBoard,
                    },
                  ]
                : []),
              { id: 'move-to-trash', label: en.contextMenu.moveToTrash, onSelect: moveToTrash },
            ]}
          />
        </Popover>
      </div>
    </>
  );
}

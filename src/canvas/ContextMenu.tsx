import { Popover, Menu } from '@/design/components';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { useToastStore } from '@/state/toastStore';
import { noteColorNames, type NoteColor } from '@/design/tokens';
import { useNoteEditStore } from '@/state/noteEditStore';
import {
  createSetItemFieldCommand,
  createStackOrderCommand,
  createTidyUpCommand,
  createTrashCommand,
} from '@/commands/itemCommands';
import { createBackToInboxCommand } from '@/commands/itemTermCommands';
import {
  createBoardFromItemsCommand,
  createRemoveFromBoardCommand,
} from '@/commands/boardCommands';
import { createExtractPaletteCommand } from '@/commands/swatchCommands';
import { createCombineIntoPaletteCommand } from '@/commands/paletteCommands';
import { swatchColorsOf } from '@/lib/palette';
import { useUiStore } from '@/state/uiStore';
import { useBoardStore } from '@/state/boardStore';
import { switchSpace } from '@/features/boards/switchSpace';
import { useListStore } from '@/state/listStore';
import { sortItems } from '@/features/list/listGrouping';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';
import type { ContextMenuState } from './useContextMenu';
import { contextMenuItemIds, type ContextMenuItemId } from './contextMenuItems';
import type { Item } from '@/state/types';

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
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
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

  function extractPalette(): void {
    onClose();
    if (!currentBoardId) return;
    const isLibraryBoard = currentBoard?.kind === 'library';
    const origin = engine?.viewportCenter() ?? { x: 0, y: 0 };
    const { command, items } = createExtractPaletteCommand(
      platform,
      ids,
      currentBoardId,
      isLibraryBoard,
      origin,
    );
    void useHistoryStore
      .getState()
      .execute(command)
      .then(() => {
        const n = items[0]?.swatchColors?.length ?? 0;
        if (n > 0) useToastStore.getState().show(en.palettes.extracted(n));
      });
  }

  function combinePalette(): void {
    onClose();
    const result = createCombineIntoPaletteCommand(platform, ids);
    if (!result) return;
    const count = result.item.swatchColors?.length ?? 0;
    void useHistoryStore
      .getState()
      .execute(result.command)
      .then(() => {
        engine?.setSelection([result.item.id]);
        useLibraryStore.getState().setSelection([result.item.id]);
        useToastStore.getState().show(en.palettes.combined(count), {
          actionLabel: en.toasts.undo,
          onAction: () => void useHistoryStore.getState().undo(),
        });
      });
  }

  function editPalette(): void {
    onClose();
    useUiStore.setState({ panelOpen: true, panelTab: 'details' });
  }

  function copyColors(): void {
    onClose();
    const item = selectedItems[0];
    if (!item) return;
    void navigator.clipboard
      .writeText(
        swatchColorsOf(item)
          .map((c) => c.hex)
          .join('\n'),
      )
      .then(() => useToastStore.getState().show(en.palettes.copiedAll))
      .catch((err: unknown) => logger.warn('Copy all colors failed', err));
  }

  function editNote(): void {
    onClose();
    useNoteEditStore.getState().open(state.itemId);
  }

  function setNoteColor(color: NoteColor): void {
    onClose();
    for (const id of ids) {
      void useHistoryStore
        .getState()
        .execute(createSetItemFieldCommand(platform, id, 'color', color));
    }
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

  const selectedItems = ids
    .map((id) => useLibraryStore.getState().items.get(id))
    .filter((i): i is Item => !!i);

  type Entry = { id: string; label: string; disabled?: boolean; onSelect: () => void };
  const colorEntries = Object.fromEntries(
    noteColorNames.map((c) => [
      `note-color-${c}`,
      { id: `note-color-${c}`, label: en.notes.colorLabel(c), onSelect: () => setNoteColor(c) },
    ]),
  ) as Record<`note-color-${NoteColor}`, Entry>;
  const entries: Record<ContextMenuItemId, Entry> = {
    ...colorEntries,
    'edit-note': { id: 'edit-note', label: en.notes.edit, onSelect: editNote },
    'copy-image': {
      id: 'copy-image',
      label: en.contextMenu.copyImage,
      onSelect: () => void copyImage(),
    },
    'show-in-explorer': {
      id: 'show-in-explorer',
      label: en.contextMenu.showInExplorer,
      disabled: platform.kind !== 'tauri',
      onSelect: () => void showInExplorer(),
    },
    'bring-to-front': {
      id: 'bring-to-front',
      label: en.contextMenu.bringToFront,
      onSelect: () => stack(true),
    },
    'send-to-back': {
      id: 'send-to-back',
      label: en.contextMenu.sendToBack,
      onSelect: () => stack(false),
    },
    'tidy-up': { id: 'tidy-up', label: en.contextMenu.tidyUp, onSelect: tidyUp },
    'connect-to': { id: 'connect-to', label: en.connections.connectTo, onSelect: connectTo },
    'back-to-inbox': {
      id: 'back-to-inbox',
      label: en.contextMenu.backToInbox,
      onSelect: backToInbox,
    },
    'extract-palette': {
      id: 'extract-palette',
      label: en.swatches.extractPalette,
      onSelect: extractPalette,
    },
    'combine-palette': {
      id: 'combine-palette',
      label: en.palettes.combine,
      onSelect: combinePalette,
    },
    'edit-palette': { id: 'edit-palette', label: en.palettes.edit, onSelect: editPalette },
    'copy-colors': { id: 'copy-colors', label: en.palettes.copyAll, onSelect: copyColors },
    'create-board': {
      id: 'create-board',
      label: en.boards.createFromSelection,
      onSelect: createBoard,
    },
    'remove-from-board': {
      id: 'remove-from-board',
      label: en.boards.removeFromBoard,
      onSelect: removeFromBoard,
    },
    'move-to-trash': {
      id: 'move-to-trash',
      label: en.contextMenu.moveToTrash,
      onSelect: moveToTrash,
    },
  };

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
            items={contextMenuItemIds(selectedItems, { onBoard }).map((id) => entries[id])}
          />
        </Popover>
      </div>
    </>
  );
}

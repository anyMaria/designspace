import { Popover, Menu } from '@/design/components';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { useToastStore } from '@/state/toastStore';
import { createStackOrderCommand, createTrashCommand } from '@/commands/itemCommands';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';
import type { ContextMenuState } from './useContextMenu';

/** Right-click menu for a canvas item — §2.4. Only the actions M1 can actually back: the rest
 * (Open, Add to board, Connect to…, Find similar, Copy palette, Set cover, Back to Inbox) need
 * Focus view, Boards, Connections, the Details panel or video/PDF support that land in later
 * milestones — deferred and logged in docs/DECISIONS.md rather than shown as dead buttons. */
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
              { id: 'move-to-trash', label: en.contextMenu.moveToTrash, onSelect: moveToTrash },
            ]}
          />
        </Popover>
      </div>
    </>
  );
}

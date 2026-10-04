import { useEffect } from 'react';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { useToastStore } from '@/state/toastStore';
import {
  createMoveItemsCommand,
  createStackOrderCommand,
  createTrashCommand,
} from '@/commands/itemCommands';
import { createRemoveFromBoardCommand } from '@/commands/boardCommands';
import { useBoardStore } from '@/state/boardStore';
import { prefersReducedMotion } from '@/lib/motion';
import { zoomRange } from '@/design/tokens';
import { useFocusStore } from '@/state/focusStore';
import { useTriageStore } from '@/state/triageStore';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import { triggerRediscover } from '@/features/rediscover/triggerRediscover';
import { openInboxTriage } from '@/features/triage/openInboxTriage';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { createRemoveConnectionCommand } from '@/commands/connectionCommands';
import { isTypingTarget } from '@/lib/isTypingTarget';
import { showTrashToast } from '@/features/trash/trashToast';
import { escapeStack } from '@/app/escapeStack';

/** Selection/stacking/trash/nudge/Rediscover/Favorite/Inbox-triage shortcuts that need the
 * engine and the library store — §2.2, §2.15. Kept separate from `useGlobalShortcuts` (which
 * only touches UI state).
 *
 * Deviation from §2.2: `]`/`[` and `Ctrl+]`/`Ctrl+[` both bring the selection all the way to the
 * front/back rather than one step at a time — a relative one-step reorder needs a full z-order
 * list (not just "new z value per selected item") that the engine doesn't track yet. Logged in
 * docs/DECISIONS.md; cheap to add once stacking order is exercised for real. */
export function useCanvasShortcuts(engine: Engine | null, platform: Platform): void {
  // Esc, when nothing is open (Patch 2 · C1): first cancel a pending pick or deselect a line,
  // then clear the selection. Full screen is next in line (App.tsx, priority 30).
  useEffect(() => {
    if (!engine) return;
    const removePick = escapeStack.addBase(10, () => {
      if (engine.isPicking()) {
        engine.cancelConnectPick();
        engine.cancelPointPick();
        return true;
      }
      if (engine.getSelectedConnectionPair()) {
        engine.setSelectedConnectionPair(null);
        return true;
      }
      return false;
    });
    const removeSelection = escapeStack.addBase(20, () => {
      if (useLibraryStore.getState().selection.size === 0) return false;
      useLibraryStore.getState().clearSelection();
      return true;
    });
    return () => {
      removePick();
      removeSelection();
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const selection = [...useLibraryStore.getState().selection];
      const reduceMotion = prefersReducedMotion();

      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        engine!.zoomStep(zoomRange.step, reduceMotion);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        engine!.zoomStep(1 / zoomRange.step, reduceMotion);
        return;
      }
      if (e.shiftKey && e.code === 'Digit1') {
        e.preventDefault();
        engine!.zoomToFit(reduceMotion);
        return;
      }
      if (e.shiftKey && e.code === 'Digit2') {
        e.preventDefault();
        engine!.zoomToSelection(reduceMotion);
        return;
      }
      if (e.shiftKey && e.code === 'Digit0') {
        e.preventDefault();
        engine!.zoomTo100(reduceMotion);
        return;
      }

      // R / I / S (§2.15) don't make sense while Triage already owns the keyboard — Triage has
      // its own Favorite toggle, and reopening it mid-session would reset its progress snapshot.
      if (!useTriageStore.getState().isOpen) {
        if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          triggerRediscover(engine);
          return;
        }
        if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          openInboxTriage();
          return;
        }
        if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && selection.length > 0) {
          e.preventDefault();
          const anyUnfavorited = selection.some(
            (id) => !useLibraryStore.getState().items.get(id)?.favorite,
          );
          for (const id of selection) {
            void useHistoryStore
              .getState()
              .execute(createSetItemFieldCommand(platform, id, 'favorite', anyUnfavorited));
          }
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        // Not trashed items: their placements stay in the store while they sit in the Trash.
        const { placements, items } = useLibraryStore.getState();
        const visibleIds = [...placements.keys()].filter((id) => !items.get(id)?.deletedAt);
        useLibraryStore.getState().setSelection(visibleIds);
        return;
      }

      if (e.key === 'Enter' && selection.length === 1) {
        e.preventDefault();
        useFocusStore.getState().open(selection[0]);
        return;
      }

      // "select the line and press Delete" (§2.10) — takes priority over trashing the item
      // selection, since selecting a connection line doesn't touch item selection at all.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const pair = engine!.getSelectedConnectionPair();
        if (pair) {
          e.preventDefault();
          const connection = useManualConnectionsStore
            .getState()
            .connectionsFor(pair.fromId)
            .find((c) => c.fromId === pair.toId || c.toId === pair.toId);
          if (connection) {
            void useHistoryStore
              .getState()
              .execute(createRemoveConnectionCommand(platform, connection.id));
            engine!.setSelectedConnectionPair(null);
          }
          return;
        }
      }

      // §2.11 board canvas: Delete removes the placement from a board (the item stays in the
      // Library and any other board) rather than trashing it, mirroring the context menu's
      // "Remove from board" vs. "Move to Trash" split.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0) {
        e.preventDefault();
        const currentBoardId = useBoardStore.getState().currentBoardId;
        const currentBoard = currentBoardId
          ? useBoardStore.getState().boards.get(currentBoardId)
          : null;
        if (currentBoard?.kind === 'board') {
          void useHistoryStore
            .getState()
            .execute(createRemoveFromBoardCommand(platform, currentBoard.id, selection))
            .then(() => {
              useToastStore
                .getState()
                .show(
                  selection.length > 1
                    ? `Removed ${selection.length} items from board`
                    : 'Removed from board',
                  { onAction: () => void useHistoryStore.getState().undo() },
                );
            });
          return;
        }
        void useHistoryStore
          .getState()
          .execute(createTrashCommand(platform, selection))
          .then(() => {
            showTrashToast(selection.length, () => void useHistoryStore.getState().undo());
          });
        return;
      }

      if (selection.length > 0 && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const toFront = e.key === ']';
        const updates = engine!.bringForward(selection, toFront);
        const label = toFront ? 'Bring to front' : 'Send to back';
        void useHistoryStore.getState().execute(createStackOrderCommand(platform, label, updates));
        return;
      }

      const arrowDeltas: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const delta = arrowDeltas[e.key];
      if (delta && selection.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const updates = selection.map((id) => {
          const p = useLibraryStore.getState().placements.get(id);
          return { id, x: (p?.x ?? 0) + delta[0] * step, y: (p?.y ?? 0) + delta[1] * step };
        });
        void useHistoryStore.getState().execute(createMoveItemsCommand(platform, updates));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine, platform]);
}

import { useEffect } from 'react';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { useToastStore } from '@/state/toastStore';
import { createMoveItemsCommand, createStackOrderCommand, createTrashCommand } from '@/commands/itemCommands';
import { prefersReducedMotion } from '@/lib/motion';
import { zoomRange } from '@/design/tokens';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Selection/stacking/trash/nudge shortcuts that need the engine and the library store — §2.2,
 * §2.15. Kept separate from `useGlobalShortcuts` (which only touches UI state).
 *
 * Deviation from §2.2: `]`/`[` and `Ctrl+]`/`Ctrl+[` both bring the selection all the way to the
 * front/back rather than one step at a time — a relative one-step reorder needs a full z-order
 * list (not just "new z value per selected item") that the engine doesn't track yet. Logged in
 * docs/DECISIONS.md; cheap to add once stacking order is exercised for real. */
export function useCanvasShortcuts(engine: Engine | null, platform: Platform): void {
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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const visibleIds = [...useLibraryStore.getState().placements.keys()];
        useLibraryStore.getState().setSelection(visibleIds);
        return;
      }

      if (e.key === 'Escape') {
        useLibraryStore.getState().clearSelection();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0) {
        e.preventDefault();
        void useHistoryStore
          .getState()
          .execute(createTrashCommand(platform, selection))
          .then(() => {
            useToastStore.getState().show(
              selection.length > 1 ? `Moved ${selection.length} items to Trash` : 'Moved to Trash',
              { onAction: () => void useHistoryStore.getState().undo() },
            );
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

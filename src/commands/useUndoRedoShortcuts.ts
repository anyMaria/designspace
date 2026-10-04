import { useEffect } from 'react';
import { useHistoryStore } from './history';
import { isTypingTarget } from '@/lib/isTypingTarget';

/** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — §2.15. */
export function useUndoRedoShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) void useHistoryStore.getState().redo();
        else void useHistoryStore.getState().undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void useHistoryStore.getState().redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

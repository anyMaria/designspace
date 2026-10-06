import { isTypingTarget } from '@/lib/isTypingTarget';
import { useColorStudioStore } from './colorStudioStore';
import type { Platform } from '@/platform/types';
import { copyHex, toggleLiked } from './studioActions';

/** Keys while the studio is open (Patch 2 · E2): Space = new colors, ← / → = previous / next
 * proposal, L lock, H like, C copy, Delete remove, 1–9 and 0 select spot 1–10. Ignored while
 * typing. Returns the unsubscribe function. */
export function installStudioKeys(platform: Platform): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const store = useColorStudioStore.getState();
    const sel = store.selected;
    const spot = sel !== null ? store.spots[sel] : undefined;
    const key = e.key.toLowerCase();

    if (e.code === 'Space') {
      e.preventDefault();
      store.setTab('generate');
      store.generate(store.generateMode);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      store.goHistory(store.historyIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      store.goHistory(store.historyIndex + 1);
    } else if (key === 'l' && sel !== null) {
      store.toggleLock(sel);
    } else if (key === 'h' && spot) {
      toggleLiked(platform, spot.hex);
    } else if (key === 'c' && spot) {
      void copyHex(platform, spot.hex);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
      store.remove(sel);
    } else if (/^[0-9]$/.test(e.key)) {
      const index = e.key === '0' ? 9 : Number(e.key) - 1;
      if (index < store.spots.length) store.select(index);
    }
  };
  // Ctrl+V in the studio pastes a picture into the From an image tab (Patch 3 · A4). The window's
  // own paste handler stands down while the studio is open.
  const onPaste = (e: ClipboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    e.preventDefault();
    useColorStudioStore.getState().requestPaste(file ?? null);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('paste', onPaste);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('paste', onPaste);
  };
}

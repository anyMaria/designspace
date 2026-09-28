import { useEffect } from 'react';
import type { Engine } from './Engine';
import { useFocusStore } from '@/state/focusStore';
import { useLibraryStore } from '@/state/libraryStore';

/** Double-click on an image, video or PDF opens Focus view (§2.2, §2.12); double-click on empty
 * canvas creates a note (`useNoteCanvasBinding`, M4), and double-click on a note opens its own
 * in-place editor (also `useNoteCanvasBinding`) rather than Focus view. Every other kind (font,
 * link) gets its own Focus view with the milestone that adds it. */
export function useFocusViewBinding(engine: Engine | null): void {
  useEffect(() => {
    if (!engine) return;
    return engine.on('dblclick', (id) => {
      if (!id) return;
      const item = useLibraryStore.getState().items.get(id);
      if (item?.kind === 'image' || item?.kind === 'video' || item?.kind === 'pdf')
        useFocusStore.getState().open(id);
    });
  }, [engine]);
}

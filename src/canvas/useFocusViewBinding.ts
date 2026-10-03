import { useEffect } from 'react';
import type { Engine } from './Engine';
import { useFocusStore } from '@/state/focusStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useUiStore } from '@/state/uiStore';

/** Double-click on an image, video, PDF, font or link opens Focus view (§2.2, §2.12); double-click
 * on empty canvas creates a note (`useNoteCanvasBinding`, M4), and double-click on a note opens
 * its own in-place editor (also `useNoteCanvasBinding`) rather than Focus view. */
export function useFocusViewBinding(engine: Engine | null): void {
  useEffect(() => {
    if (!engine) return;
    return engine.on('dblclick', (id) => {
      if (!id) return;
      const item = useLibraryStore.getState().items.get(id);
      if (
        item?.kind === 'image' ||
        item?.kind === 'video' ||
        item?.kind === 'pdf' ||
        item?.kind === 'font' ||
        item?.kind === 'link'
      )
        useFocusStore.getState().open(id);
      // A swatch or palette has no Focus view: its editor lives in the Details panel (C4).
      else if (item?.kind === 'swatch')
        useUiStore.setState({ panelOpen: true, panelTab: 'details' });
    });
  }, [engine]);
}

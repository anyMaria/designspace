import { useEffect } from 'react';
import type { Engine } from './Engine';
import { useFocusStore } from '@/state/focusStore';

/** Double-click on an item opens Focus view (§2.2, §2.12); double-click on empty canvas is a
 * no-op in M1 (that's "new note at that spot", which lands in M4). */
export function useFocusViewBinding(engine: Engine | null): void {
  useEffect(() => {
    if (!engine) return;
    return engine.on('dblclick', (id) => {
      if (id) useFocusStore.getState().open(id);
    });
  }, [engine]);
}

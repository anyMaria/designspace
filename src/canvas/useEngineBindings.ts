import { swatchColorsOf } from '@/lib/palette';
import { useEffect } from 'react';
import type { Engine } from './Engine';
import { itemToCard } from './itemCards';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { createMoveItemsCommand, createResizeItemCommand } from '@/commands/itemCommands';
import { useToastStore } from '@/state/toastStore';
import { en } from '@/i18n/en';

/** Clipboard access can be denied (permissions, non-secure context — this is expected and not
 * actionable by the owner, e.g. it's denied by default in a headless CI browser) — silently
 * ignored, matching `design/components/Swatch.tsx`'s own copy button exactly (no `logger.error`,
 * which would otherwise fail every e2e test's "no console errors" assertion in CI). The swatch
 * selection still shows the toast either way. */
async function copySwatchHex(platform: Platform, hex: string): Promise<void> {
  try {
    await platform.clipboard.writeText(hex);
  } catch {
    // Nothing to do — see doc comment above.
  }
}

/** Wires the engine to the library store and the undo/redo history — §4.6, §4.11. Selecting on
 * the canvas updates the store (and vice versa, e.g. Ctrl+A); drags and resizes commit exactly
 * one command on pointer-up. */
export function useEngineBindings(engine: Engine | null, platform: Platform): void {
  useEffect(() => {
    if (!engine) return;

    function syncCards() {
      const { items, placements } = useLibraryStore.getState();
      const cards = [];
      for (const [id, placement] of placements) {
        const item = items.get(id);
        if (item && !item.deletedAt) cards.push(itemToCard(item, placement, platform));
      }
      engine?.setLibraryItems(cards);
    }
    syncCards();
    const unsubscribeCards = useLibraryStore.subscribe(syncCards);

    engine.setSelection([...useLibraryStore.getState().selection]);
    const unsubscribeSelection = useLibraryStore.subscribe((state, prev) => {
      if (state.selection !== prev.selection) engine.setSelection([...state.selection]);
    });

    const offSelect = engine.on('select', (ids) => {
      useLibraryStore.getState().setSelection(ids);
      // "Click copies the HEX" (§2.11's Swatch spec) — only a single-swatch selection, so
      // marquee-selecting a swatch along with other items doesn't silently overwrite the
      // clipboard with just one of them.
      if (ids.length === 1) {
        const item = useLibraryStore.getState().items.get(ids[0]);
        // A palette (several colours) copies nothing on select: click a cell for that (below).
        if (item?.kind === 'swatch' && item.color && swatchColorsOf(item).length <= 1) {
          void copySwatchHex(platform, item.color);
          useToastStore.getState().show(en.swatches.copied(item.color));
        }
      }
    });
    const offCell = engine.on('swatchCellClick', (id, index) => {
      const item = useLibraryStore.getState().items.get(id);
      const hex = item ? swatchColorsOf(item)[index]?.hex : undefined;
      if (!hex) return;
      void copySwatchHex(platform, hex);
      useToastStore.getState().show(en.swatches.copied(hex));
    });
    const offMove = engine.on('move', (updates) => {
      void useHistoryStore.getState().execute(createMoveItemsCommand(platform, updates));
    });
    const offResize = engine.on('resize', (update) => {
      void useHistoryStore.getState().execute(createResizeItemCommand(platform, update));
    });

    return () => {
      unsubscribeCards();
      unsubscribeSelection();
      offSelect();
      offMove();
      offCell();
      offResize();
    };
  }, [engine, platform]);
}

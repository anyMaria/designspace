import { useEffect } from 'react';
import type { Engine } from './Engine';
import { itemToCard } from './itemCards';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { createMoveItemsCommand, createResizeItemCommand } from '@/commands/itemCommands';

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
      offResize();
    };
  }, [engine, platform]);
}

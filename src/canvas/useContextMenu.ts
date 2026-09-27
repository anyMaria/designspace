import { useEffect, useState } from 'react';
import type { Engine } from './Engine';

export interface ContextMenuState {
  itemId: string;
  x: number;
  y: number;
}

/** Bridges the engine's `contextmenu` event (right-click, already selects and suppresses the
 * WebView's own menu — Engine.ts) out to a React-rendered `<ContextMenu>` (§2.2, §2.4). Right-
 * clicking empty canvas has nothing to show yet in M1 (no board/frame actions built), so it's a
 * no-op there. */
export function useContextMenu(engine: Engine | null): {
  menu: ContextMenuState | null;
  close: () => void;
} {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!engine) return;
    return engine.on('contextmenu', (itemId, screen) => {
      setMenu(itemId ? { itemId, x: screen.x, y: screen.y } : null);
    });
  }, [engine]);

  return { menu, close: () => setMenu(null) };
}

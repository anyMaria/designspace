import { useEffect } from 'react';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useFrameStore } from '@/state/frameStore';
import { useHistoryStore } from '@/commands/history';
import { createMoveFrameCommand, createResizeFrameCommand } from '@/commands/frameCommands';
import { useFrameRenameStore } from '@/state/frameRenameStore';

/** Wires the engine to `frameStore` (§2.11) — mirrors `useEngineBindings`'s item wiring, just
 * for frames: syncs the current space's frames onto the canvas, and turns the engine's
 * drag/resize/double-click events into undoable commands. */
export function useFrameCanvasBinding(engine: Engine | null, platform: Platform): void {
  useEffect(() => {
    if (!engine) return;

    function syncFrames() {
      engine?.setFrames([...useFrameStore.getState().frames.values()]);
    }
    syncFrames();
    const unsubscribe = useFrameStore.subscribe(syncFrames);

    const offMove = engine.on('frameMove', (frameId, dx, dy) => {
      void useHistoryStore.getState().execute(createMoveFrameCommand(platform, frameId, dx, dy));
    });
    const offResize = engine.on('frameResize', (frameId, rect) => {
      void useHistoryStore.getState().execute(createResizeFrameCommand(platform, frameId, rect));
    });
    const offRename = engine.on('frameRenameRequest', (frameId) => {
      useFrameRenameStore.getState().open(frameId);
    });

    return () => {
      unsubscribe();
      offMove();
      offResize();
      offRename();
    };
  }, [engine, platform]);
}

import { useEffect } from 'react';
import type { Engine } from './Engine';
import type { Platform } from '@/platform/types';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useHistoryStore } from '@/commands/history';
import { createAddConnectionCommand } from '@/commands/connectionCommands';
import { useConnectionLabelDialogStore } from '@/state/connectionLabelDialogStore';
import { useToastStore } from '@/state/toastStore';
import { en } from '@/i18n/en';

/** §2.10 "My connections": wires the engine's `connectDrop` (drag handle or "Connect to…"'s
 * picked target) and `connectionLineDblClick` (label editing) events to commands/UI state.
 * Selecting a line and pressing Delete is handled in `useCanvasShortcuts` instead, since it
 * reads `engine.getSelectedConnectionPair()` synchronously alongside the rest of that hook's
 * keyboard handling rather than needing its own event round-trip. */
export function useManualConnectionsBinding(engine: Engine | null, platform: Platform): void {
  useEffect(() => {
    if (!engine) return;
    return engine.on('connectDrop', (fromId, toId) => {
      if (useManualConnectionsStore.getState().isConnected(fromId, toId)) {
        useToastStore.getState().show(en.connections.alreadyConnected);
        return;
      }
      void useHistoryStore
        .getState()
        .execute(createAddConnectionCommand(platform, fromId, toId))
        .then(() => useToastStore.getState().show(en.connections.connected));
    });
  }, [engine, platform]);

  useEffect(() => {
    if (!engine) return;
    return engine.on('connectionLineDblClick', ({ fromId, toId }) => {
      const connection = useManualConnectionsStore
        .getState()
        .connectionsFor(fromId)
        .find((c) => c.fromId === toId || c.toId === toId);
      if (connection) useConnectionLabelDialogStore.getState().open(connection.id);
    });
  }, [engine]);
}

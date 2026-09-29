import type { Platform } from '@/platform/types';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { newId } from '@/lib/ids';
import type { Command } from './types';
import type { ManualConnection } from '@/state/types';

/** "My connections" commands (§2.10) — the drag handle, the context menu's "Connect to…", the
 * line's label dialog, and Delete all funnel through these three. Callers are expected to check
 * `useManualConnectionsStore.getState().isConnected(a, b)` first (the drag/"Connect to…" UI does)
 * so a duplicate never reaches `UNIQUE (from_id, to_id)` in the first place — these commands don't
 * re-check it themselves, the same way `createAddItemTermCommand` trusts its caller. */

/** "To create one, hover an item... drag it to another. Or use the context menu → Connect to…". */
export function createAddConnectionCommand(
  platform: Platform,
  fromId: string,
  toId: string,
): Command {
  const connection: ManualConnection = {
    id: newId(),
    fromId,
    toId,
    label: null,
    createdAt: new Date().toISOString(),
  };

  return {
    label: 'Connect items',
    do: async () => {
      useManualConnectionsStore.getState().upsert(connection);
      await platform.db.execute(
        'INSERT INTO manual_connections (id, from_id, to_id, label, created_at) VALUES (?, ?, ?, ?, ?)',
        [connection.id, connection.fromId, connection.toId, connection.label, connection.createdAt],
      );
    },
    undo: async () => {
      useManualConnectionsStore.getState().remove(connection.id);
      await platform.db.execute('DELETE FROM manual_connections WHERE id = ?', [connection.id]);
    },
  };
}

/** "To delete one, select the line and press Delete" — also used by the Details panel's "My
 * connections" list. Snapshots the full row so undo re-creates it exactly, label included. */
export function createRemoveConnectionCommand(platform: Platform, connectionId: string): Command {
  const previous = useManualConnectionsStore.getState().connections.get(connectionId) ?? null;

  return {
    label: 'Remove connection',
    do: async () => {
      useManualConnectionsStore.getState().remove(connectionId);
      await platform.db.execute('DELETE FROM manual_connections WHERE id = ?', [connectionId]);
    },
    undo: async () => {
      if (!previous) return;
      useManualConnectionsStore.getState().upsert(previous);
      await platform.db.execute(
        'INSERT INTO manual_connections (id, from_id, to_id, label, created_at) VALUES (?, ?, ?, ?, ?)',
        [previous.id, previous.fromId, previous.toId, previous.label, previous.createdAt],
      );
    },
  };
}

/** "Double-click a line to add a label" ("same typography"). */
export function createLabelConnectionCommand(
  platform: Platform,
  connectionId: string,
  label: string | null,
): Command {
  const previous = useManualConnectionsStore.getState().connections.get(connectionId) ?? null;

  async function apply(value: string | null): Promise<void> {
    const current = useManualConnectionsStore.getState().connections.get(connectionId);
    if (!current) return;
    useManualConnectionsStore.getState().upsert({ ...current, label: value });
    await platform.db.execute('UPDATE manual_connections SET label = ? WHERE id = ?', [
      value,
      connectionId,
    ]);
  }

  return {
    label: 'Label connection',
    do: () => apply(label),
    undo: () => apply(previous?.label ?? null),
  };
}

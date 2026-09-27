import { create } from 'zustand';
import type { ManualConnection } from './types';

/**
 * "My connections" (§2.10, §4.3) — library-wide (not per-space, per the plan: "Connections are
 * stored globally, so they show wherever both items are"), so this is its own store rather than
 * folded into `libraryStore`. Mirrors `termStore`'s shape: a by-id map plus an itemId -> Set of
 * connection ids index for fast per-item lookups (Details panel's "My connections" list, hover
 * scoring).
 */
interface ManualConnectionsState {
  connections: Map<string, ManualConnection>; // by id
  byItem: Map<string, Set<string>>; // itemId -> Set<connectionId>, both endpoints indexed

  loadAll: (connections: ManualConnection[]) => void;
  upsert: (connection: ManualConnection) => void;
  remove: (id: string) => void;
  /** The other item's id, per connection, for everything touching `itemId`. */
  connectionsFor: (itemId: string) => ManualConnection[];
  /** Whether two items are already directly connected — used to stop a duplicate drag/"Connect
   * to…" from ever reaching the `UNIQUE (from_id, to_id)` constraint in the first place. */
  isConnected: (a: string, b: string) => boolean;
}

function indexByItem(connections: ManualConnection[]): Map<string, Set<string>> {
  const byItem = new Map<string, Set<string>>();
  function add(itemId: string, connectionId: string): void {
    const set = byItem.get(itemId) ?? new Set<string>();
    set.add(connectionId);
    byItem.set(itemId, set);
  }
  for (const c of connections) {
    add(c.fromId, c.id);
    add(c.toId, c.id);
  }
  return byItem;
}

export const useManualConnectionsStore = create<ManualConnectionsState>((set, get) => ({
  connections: new Map(),
  byItem: new Map(),

  loadAll: (connections) =>
    set({
      connections: new Map(connections.map((c) => [c.id, c])),
      byItem: indexByItem(connections),
    }),

  upsert: (connection) =>
    set((s) => {
      const connections = new Map(s.connections);
      connections.set(connection.id, connection);
      return { connections, byItem: indexByItem([...connections.values()]) };
    }),

  remove: (id) =>
    set((s) => {
      const connections = new Map(s.connections);
      connections.delete(id);
      return { connections, byItem: indexByItem([...connections.values()]) };
    }),

  connectionsFor: (itemId) => {
    const { connections, byItem } = get();
    const ids = byItem.get(itemId);
    if (!ids) return [];
    return [...ids].map((id) => connections.get(id)!).filter(Boolean);
  },

  isConnected: (a, b) => {
    const { connections, byItem } = get();
    const ids = byItem.get(a);
    if (!ids) return false;
    for (const id of ids) {
      const c = connections.get(id);
      if (c && (c.fromId === b || c.toId === b)) return true;
    }
    return false;
  },
}));

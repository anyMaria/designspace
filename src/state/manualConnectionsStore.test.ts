import { beforeEach, describe, expect, it } from 'vitest';
import { useManualConnectionsStore } from './manualConnectionsStore';
import type { ManualConnection } from './types';

function makeConnection(overrides: Partial<ManualConnection> = {}): ManualConnection {
  return {
    id: 'c1',
    fromId: 'a',
    toId: 'b',
    label: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  useManualConnectionsStore.setState({ connections: new Map(), byItem: new Map() });
});

describe('manualConnectionsStore', () => {
  it('loadAll indexes connections by both endpoints', () => {
    const connections = [
      makeConnection({ id: 'c1', fromId: 'a', toId: 'b' }),
      makeConnection({ id: 'c2', fromId: 'b', toId: 'c' }),
    ];
    useManualConnectionsStore.getState().loadAll(connections);

    expect(useManualConnectionsStore.getState().connections.size).toBe(2);
    expect(useManualConnectionsStore.getState().byItem.get('a')).toEqual(new Set(['c1']));
    expect(useManualConnectionsStore.getState().byItem.get('b')).toEqual(new Set(['c1', 'c2']));
    expect(useManualConnectionsStore.getState().byItem.get('c')).toEqual(new Set(['c2']));
  });

  it('connectionsFor returns every connection touching an item', () => {
    useManualConnectionsStore
      .getState()
      .loadAll([makeConnection({ id: 'c1', fromId: 'a', toId: 'b' })]);
    expect(useManualConnectionsStore.getState().connectionsFor('a')).toHaveLength(1);
    expect(useManualConnectionsStore.getState().connectionsFor('b')).toHaveLength(1);
    expect(useManualConnectionsStore.getState().connectionsFor('z')).toHaveLength(0);
  });

  it('isConnected checks both directions', () => {
    useManualConnectionsStore
      .getState()
      .loadAll([makeConnection({ id: 'c1', fromId: 'a', toId: 'b' })]);
    expect(useManualConnectionsStore.getState().isConnected('a', 'b')).toBe(true);
    expect(useManualConnectionsStore.getState().isConnected('b', 'a')).toBe(true);
    expect(useManualConnectionsStore.getState().isConnected('a', 'z')).toBe(false);
  });

  it('upsert adds a connection and re-indexes', () => {
    useManualConnectionsStore
      .getState()
      .upsert(makeConnection({ id: 'c1', fromId: 'a', toId: 'b' }));
    expect(useManualConnectionsStore.getState().isConnected('a', 'b')).toBe(true);
  });

  it('remove drops a connection and re-indexes', () => {
    useManualConnectionsStore.getState().loadAll([makeConnection({ id: 'c1' })]);
    useManualConnectionsStore.getState().remove('c1');
    expect(useManualConnectionsStore.getState().connections.size).toBe(0);
    expect(useManualConnectionsStore.getState().byItem.get('a')).toBeUndefined();
  });
});

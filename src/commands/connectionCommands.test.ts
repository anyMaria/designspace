import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAddConnectionCommand,
  createLabelConnectionCommand,
  createRemoveConnectionCommand,
} from './connectionCommands';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import type { Platform } from '@/platform/types';

function makePlatform(): Platform {
  return {
    db: {
      select: vi.fn<Platform['db']['select']>(),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
}

beforeEach(() => {
  useManualConnectionsStore.setState({ connections: new Map(), byItem: new Map() });
});

describe('createAddConnectionCommand', () => {
  it('links two items and unlinks both directions on undo', async () => {
    const platform = makePlatform();
    const command = createAddConnectionCommand(platform, 'a', 'b');

    await command.do();
    expect(useManualConnectionsStore.getState().isConnected('a', 'b')).toBe(true);
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manual_connections'),
      expect.arrayContaining(['a', 'b']),
    );

    await command.undo();
    expect(useManualConnectionsStore.getState().isConnected('a', 'b')).toBe(false);
  });
});

describe('createRemoveConnectionCommand', () => {
  it('removes a connection and restores it, label included, on undo', async () => {
    const platform = makePlatform();
    await createAddConnectionCommand(platform, 'a', 'b').do();
    const [connection] = useManualConnectionsStore.getState().connectionsFor('a');
    await createLabelConnectionCommand(platform, connection.id, 'same typography').do();

    const removeCommand = createRemoveConnectionCommand(platform, connection.id);
    await removeCommand.do();
    expect(useManualConnectionsStore.getState().connections.has(connection.id)).toBe(false);

    await removeCommand.undo();
    const restored = useManualConnectionsStore.getState().connections.get(connection.id);
    expect(restored?.label).toBe('same typography');
    expect(restored?.fromId).toBe('a');
    expect(restored?.toId).toBe('b');
  });

  it('is a no-op undo if the connection never existed', async () => {
    const platform = makePlatform();
    const command = createRemoveConnectionCommand(platform, 'missing');
    await command.do();
    await command.undo();
    expect(useManualConnectionsStore.getState().connections.size).toBe(0);
  });
});

describe('createLabelConnectionCommand', () => {
  it('sets a label and restores the previous one on undo', async () => {
    const platform = makePlatform();
    await createAddConnectionCommand(platform, 'a', 'b').do();
    const [connection] = useManualConnectionsStore.getState().connectionsFor('a');

    const command = createLabelConnectionCommand(platform, connection.id, 'same typography');
    await command.do();
    expect(useManualConnectionsStore.getState().connections.get(connection.id)?.label).toBe(
      'same typography',
    );

    await command.undo();
    expect(useManualConnectionsStore.getState().connections.get(connection.id)?.label).toBeNull();
  });
});

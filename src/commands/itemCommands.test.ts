import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBulkSetItemFieldCommand,
  createMoveItemsCommand,
  createResizeItemCommand,
  createSetItemFieldCommand,
  createStackOrderCommand,
  createTrashCommand,
} from './itemCommands';
import { useLibraryStore } from '@/state/libraryStore';
import type { Item, Placement } from '@/state/types';
import type { Platform } from '@/platform/types';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item1',
    kind: 'image',
    title: 'Test',
    filePath: 'media/2026/01/test.jpg',
    fileName: 'test.jpg',
    fileHash: 'abc',
    fileSize: 100,
    mime: 'image/jpeg',
    width: 320,
    height: 240,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: null,
    viewedAt: null,
    status: 'ok',
    derivedV: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makePlacement(overrides: Partial<Placement> = {}): Placement {
  return {
    boardId: 'lib',
    itemId: 'item1',
    x: 0,
    y: 0,
    w: 320,
    h: 240,
    z: 0,
    frameId: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
});

describe('createMoveItemsCommand', () => {
  it('do() updates the store and persists the new position', async () => {
    useLibraryStore.getState().upsertPlacement(makePlacement({ x: 0, y: 0 }));
    const platform = makePlatform();
    const command = createMoveItemsCommand(platform, [{ id: 'item1', x: 100, y: 50 }]);

    await command.do();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({ x: 100, y: 50 });
    const calls = vi.mocked(platform.db.batch).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual([
      {
        sql: expect.stringContaining('UPDATE placements') as string,
        params: [100, 50, 'lib', 'item1'],
      },
    ]);
  });

  it('undo() restores the original position', async () => {
    useLibraryStore.getState().upsertPlacement(makePlacement({ x: 10, y: 20 }));
    const platform = makePlatform();
    const command = createMoveItemsCommand(platform, [{ id: 'item1', x: 999, y: 999 }]);

    await command.do();
    await command.undo();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({ x: 10, y: 20 });
  });
});

describe('createResizeItemCommand', () => {
  it('do()/undo() round-trip the exact prior size and position', async () => {
    useLibraryStore.getState().upsertPlacement(makePlacement({ x: 0, y: 0, w: 320, h: 240 }));
    const platform = makePlatform();
    const command = createResizeItemCommand(platform, {
      id: 'item1',
      x: -10,
      y: -5,
      w: 400,
      h: 300,
    });

    await command.do();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({ w: 400, h: 300 });

    await command.undo();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({
      x: 0,
      y: 0,
      w: 320,
      h: 240,
    });
  });
});

describe('createStackOrderCommand', () => {
  it('applies and reverts z-order changes across multiple items', async () => {
    useLibraryStore.getState().upsertPlacement(makePlacement({ itemId: 'a', z: 0 }));
    useLibraryStore.getState().upsertPlacement(makePlacement({ itemId: 'b', z: 1 }));
    const platform = makePlatform();
    const command = createStackOrderCommand(platform, 'Bring to front', [
      { id: 'a', z: 5 },
      { id: 'b', z: 6 },
    ]);

    await command.do();
    expect(useLibraryStore.getState().placements.get('a')?.z).toBe(5);
    expect(useLibraryStore.getState().placements.get('b')?.z).toBe(6);

    await command.undo();
    expect(useLibraryStore.getState().placements.get('a')?.z).toBe(0);
    expect(useLibraryStore.getState().placements.get('b')?.z).toBe(1);
  });
});

describe('createTrashCommand', () => {
  it('do() sets deleted_at and undo() clears it, leaving the placement untouched', async () => {
    useLibraryStore.getState().upsertItem(makeItem());
    useLibraryStore.getState().upsertPlacement(makePlacement());
    const platform = makePlatform();
    const command = createTrashCommand(platform, ['item1']);

    await command.do();
    expect(useLibraryStore.getState().items.get('item1')?.deletedAt).not.toBeNull();
    expect(useLibraryStore.getState().placements.get('item1')).toBeDefined();

    await command.undo();
    expect(useLibraryStore.getState().items.get('item1')?.deletedAt).toBeNull();
    expect(useLibraryStore.getState().placements.get('item1')).toBeDefined();
  });

  it('labels a bulk trash as one undo step (§4.11)', () => {
    const platform = makePlatform();
    const command = createTrashCommand(platform, ['a', 'b', 'c']);
    expect(command.label).toBe('Move 3 items to Trash');
  });
});

describe('createSetItemFieldCommand', () => {
  it('do()/undo() round-trip a text field', async () => {
    useLibraryStore.getState().upsertItem(makeItem({ artist: 'Original' }));
    const platform = makePlatform();
    const command = createSetItemFieldCommand(platform, 'item1', 'artist', 'New Artist');

    await command.do();
    expect(useLibraryStore.getState().items.get('item1')?.artist).toBe('New Artist');
    const calls = vi.mocked(platform.db.execute).mock.calls;
    expect(calls[0][0]).toContain('UPDATE items SET artist');
    expect(calls[0][1]).toEqual(['New Artist', 'item1']);

    await command.undo();
    expect(useLibraryStore.getState().items.get('item1')?.artist).toBe('Original');
  });

  it('converts the favorite boolean to 0/1 for the DB', async () => {
    useLibraryStore.getState().upsertItem(makeItem({ favorite: false }));
    const platform = makePlatform();
    const command = createSetItemFieldCommand(platform, 'item1', 'favorite', true);

    await command.do();
    expect(useLibraryStore.getState().items.get('item1')?.favorite).toBe(true);
    const calls = vi.mocked(platform.db.execute).mock.calls;
    expect(calls[0][1]).toEqual([1, 'item1']);

    await command.undo();
    expect(useLibraryStore.getState().items.get('item1')?.favorite).toBe(false);
    expect(vi.mocked(platform.db.execute).mock.calls[1][1]).toEqual([0, 'item1']);
  });
});

describe('createBulkSetItemFieldCommand', () => {
  it('sets the same value on every item and undo restores each item its own previous value', async () => {
    useLibraryStore
      .getState()
      .upsertItems([makeItem({ id: 'a', artist: 'Alice' }), makeItem({ id: 'b', artist: 'Bob' })]);
    const platform = makePlatform();
    const command = createBulkSetItemFieldCommand(platform, ['a', 'b'], 'artist', 'Everyone');

    await command.do();
    expect(useLibraryStore.getState().items.get('a')?.artist).toBe('Everyone');
    expect(useLibraryStore.getState().items.get('b')?.artist).toBe('Everyone');

    await command.undo();
    expect(useLibraryStore.getState().items.get('a')?.artist).toBe('Alice');
    expect(useLibraryStore.getState().items.get('b')?.artist).toBe('Bob');
  });
});

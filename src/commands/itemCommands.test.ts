import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBulkSetItemFieldCommand,
  createMoveItemsCommand,
  createResizeItemCommand,
  createResizeItemsCommand,
  createRestoreItemCommand,
  createSetCropCommand,
  createSetItemFieldCommand,
  createStackOrderCommand,
  createTidyUpCommand,
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
    cropX: null,
    cropY: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    parentId: null,
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

describe('createResizeItemsCommand', () => {
  it('resizes several in one transaction and undo restores every rect and crop', async () => {
    useLibraryStore.getState().upsertPlacement(makePlacement({ itemId: 'a', w: 100, h: 100 }));
    useLibraryStore
      .getState()
      .upsertPlacement(makePlacement({ itemId: 'b', x: 200, w: 50, h: 50, cropX: null }));
    const platform = makePlatform();
    const command = createResizeItemsCommand(platform, [
      { id: 'a', x: 0, y: 0, w: 120, h: 100 },
      { id: 'b', x: 200, y: 0, w: 120, h: 50, cropX: 0.5, cropY: 0.5 },
    ]);
    await command.do();
    expect(useLibraryStore.getState().placements.get('b')).toMatchObject({ w: 120, cropX: 0.5 });
    await command.undo();
    expect(useLibraryStore.getState().placements.get('a')).toMatchObject({ w: 100 });
    expect(useLibraryStore.getState().placements.get('b')).toMatchObject({ w: 50, cropX: null });
  });
});

describe('crop (Patch 2 · C3)', () => {
  it('a resize that marks a crop sets the focus, and undo clears it', async () => {
    useLibraryStore.getState().upsertPlacement(makePlacement({ x: 0, y: 0, w: 320, h: 240 }));
    const platform = makePlatform();
    const command = createResizeItemCommand(platform, {
      id: 'item1',
      x: 0,
      y: 0,
      w: 400,
      h: 240,
      cropX: 0.5,
      cropY: 0.5,
    });
    await command.do();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({
      w: 400,
      cropX: 0.5,
      cropY: 0.5,
    });
    await command.undo();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({
      w: 320,
      cropX: null,
      cropY: null,
    });
  });

  it('createSetCropCommand sets the focus (and the rect on a reset) and undo restores them', async () => {
    useLibraryStore
      .getState()
      .upsertPlacement(makePlacement({ x: 0, y: 0, w: 400, h: 240, cropX: 0.2, cropY: 0.7 }));
    const platform = makePlatform();
    const command = createSetCropCommand(platform, 'item1', {
      cropX: null,
      cropY: null,
      rect: { x: 10, y: 20, w: 320, h: 240 },
    });
    await command.do();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({
      x: 10,
      y: 20,
      w: 320,
      cropX: null,
      cropY: null,
    });
    await command.undo();
    expect(useLibraryStore.getState().placements.get('item1')).toMatchObject({
      x: 0,
      y: 0,
      w: 400,
      cropX: 0.2,
      cropY: 0.7,
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

  it('removes trashed items from the selection', async () => {
    useLibraryStore.getState().upsertItem(makeItem({ id: 'a' }));
    useLibraryStore.getState().upsertItem(makeItem({ id: 'b' }));
    useLibraryStore.getState().setSelection(['a', 'b']);
    await createTrashCommand(makePlatform(), ['a']).do();
    expect([...useLibraryStore.getState().selection]).toEqual(['b']);
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

describe('createTidyUpCommand', () => {
  it('packs the given items into justified rows at their own top-left corner', async () => {
    useLibraryStore
      .getState()
      .upsertPlacement(makePlacement({ itemId: 'a', x: 50, y: 100, w: 320, h: 240 }));
    useLibraryStore
      .getState()
      .upsertPlacement(makePlacement({ itemId: 'b', x: 500, y: 300, w: 160, h: 240 }));
    const platform = makePlatform();

    const command = createTidyUpCommand(platform, ['a', 'b']);
    await command.do();

    const a = useLibraryStore.getState().placements.get('a')!;
    const b = useLibraryStore.getState().placements.get('b')!;
    // Origin is the selection's own bounding-box top-left (50,100), not the canvas origin.
    expect(a.x).toBe(50);
    expect(a.y).toBe(100);
    expect(a.h).toBe(240); // target row height, uncompressed single row
    expect(b.x).toBeCloseTo(a.x + a.w + 16); // 16px gap, second item right after the first
  });

  it('is one undo step that restores every item to its own previous rect', async () => {
    useLibraryStore
      .getState()
      .upsertPlacement(makePlacement({ itemId: 'a', x: 50, y: 100, w: 320, h: 240 }));
    useLibraryStore
      .getState()
      .upsertPlacement(makePlacement({ itemId: 'b', x: 500, y: 300, w: 160, h: 480 }));
    const platform = makePlatform();

    const command = createTidyUpCommand(platform, ['a', 'b']);
    await command.do();
    await command.undo();

    expect(useLibraryStore.getState().placements.get('a')).toMatchObject({
      x: 50,
      y: 100,
      w: 320,
      h: 240,
    });
    expect(useLibraryStore.getState().placements.get('b')).toMatchObject({
      x: 500,
      y: 300,
      w: 160,
      h: 480,
    });
  });
});

describe('createRestoreItemCommand', () => {
  it('restores the placement of the space that is open, not the first one found', async () => {
    const select = vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM items')) {
        return Promise.resolve([
          {
            id: 'item1',
            kind: 'image',
            title: 'T',
            status: 'ok',
            created_at: 'x',
            updated_at: 'x',
          },
        ]);
      }
      return Promise.resolve([
        {
          board_id: params?.[1] ?? 'first',
          item_id: 'item1',
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          z: 0,
          added_at: 'x',
        },
      ]);
    });
    const platform = {
      db: { select, execute: vi.fn().mockResolvedValue({ changes: 1 }) },
    } as unknown as Platform;
    await createRestoreItemCommand(platform, 'item1', 'board-b').do();
    expect(select).toHaveBeenCalledWith(expect.stringContaining('AND board_id = ?'), [
      'item1',
      'board-b',
    ]);
    expect(useLibraryStore.getState().placements.get('item1')?.boardId).toBe('board-b');
  });
});

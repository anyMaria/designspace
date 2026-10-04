import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCombineIntoPaletteCommand,
  createCreatePaletteCommand,
  createSetSwatchColorsCommand,
} from './paletteCommands';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import type { Platform } from '@/platform/types';
import type { Item, Placement } from '@/state/types';

function makePlatform() {
  const db = {
    select: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ changes: 1 }),
    batch: vi.fn().mockResolvedValue(undefined),
  };
  return { platform: { db } as unknown as Platform, db };
}

function swatch(id: string, hex: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    kind: 'swatch',
    title: '',
    color: hex,
    swatchColors: null,
    palette: null,
    colorFamilies: null,
    deletedAt: null,
    ...extra,
  } as Item;
}

function placement(id: string, x: number, y: number, w = 160, h = 160): Placement {
  return {
    boardId: 'lib',
    itemId: id,
    x,
    y,
    w,
    h,
    z: 0,
    frameId: null,
    cropX: null,
    cropY: null,
    parentId: null,
    addedAt: '',
  };
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  useBoardStore.setState({
    boards: new Map([['lib', { id: 'lib', kind: 'library', name: 'Library' } as never]]),
  });
});

describe('createSetSwatchColorsCommand', () => {
  it('rewrites colours, derived columns and the size, and undo restores them exactly', async () => {
    const { platform, db } = makePlatform();
    const before = swatch('s', '#112233');
    useLibraryStore.setState({
      items: new Map([['s', before]]),
      placements: new Map([['s', placement('s', 10, 20)]]),
    });
    const cmd = createSetSwatchColorsCommand(platform, 's', [
      { hex: '#FF0000' },
      { hex: '#00FF00' },
      { hex: '#0000FF' },
    ]);

    await cmd.do();
    const item = useLibraryStore.getState().items.get('s');
    expect(item?.swatchColors).toHaveLength(3);
    expect(item?.color).toBe('#FF0000');
    expect(item?.palette).toHaveLength(3);
    expect(useLibraryStore.getState().placements.get('s')).toMatchObject({
      x: 10,
      y: 20,
      w: 216,
      h: 16 + 2 * 96 + 8,
    });
    const statements = db.batch.mock.calls[0]?.[0] as { sql: string; params: unknown[] }[];
    expect(statements[1]).toMatchObject({
      sql: 'UPDATE placements SET w = ?, h = ? WHERE item_id = ?',
      params: [216, 16 + 2 * 96 + 8, 's'],
    });

    await cmd.undo();
    const restored = useLibraryStore.getState().items.get('s');
    expect(restored?.swatchColors).toEqual([{ hex: '#112233' }]);
    expect(restored?.color).toBe('#112233');
    expect(useLibraryStore.getState().placements.get('s')).toMatchObject({ w: 160, h: 160 });
  });
});

describe('createCreatePaletteCommand', () => {
  it('creates a sized palette centred on the point, and undo removes it', async () => {
    const { platform } = makePlatform();
    const { command, item } = createCreatePaletteCommand(
      platform,
      'lib',
      true,
      500,
      400,
      [{ hex: '#111111' }, { hex: '#222222' }],
      'Mood',
    );
    await command.do();
    expect(useLibraryStore.getState().items.get(item.id)?.title).toBe('Mood');
    expect(useLibraryStore.getState().placements.get(item.id)).toMatchObject({
      x: 500 - 108,
      y: 400 - 56,
      w: 216,
      h: 112,
    });
    await command.undo();
    expect(useLibraryStore.getState().items.has(item.id)).toBe(false);
  });
});

describe('createCombineIntoPaletteCommand', () => {
  function setup() {
    useLibraryStore.setState({
      items: new Map([
        ['a', swatch('a', '#AA0000')],
        ['b', swatch('b', '#00BB00')],
        ['c', swatch('c', '#0000CC')],
      ]),
      placements: new Map([
        ['a', placement('a', 300, 10)], // row 1, right
        ['b', placement('b', 100, 30)], // row 1, left (within the row tolerance)
        ['c', placement('c', 100, 400)], // row 2
      ]),
    });
  }

  it('orders colours by reading order, makes one palette at the top-left, trashes the originals', async () => {
    setup();
    const { platform } = makePlatform();
    const result = createCombineIntoPaletteCommand(platform, ['a', 'b', 'c']);
    if (!result) throw new Error('expected a command');
    await result.command.do();

    const palette = useLibraryStore.getState().items.get(result.item.id);
    expect(palette?.swatchColors?.map((c) => c.hex)).toEqual(['#00BB00', '#AA0000', '#0000CC']);
    expect(useLibraryStore.getState().placements.get(result.item.id)).toMatchObject({
      x: 100,
      y: 10,
    });
    for (const id of ['a', 'b', 'c']) {
      expect(useLibraryStore.getState().items.get(id)?.deletedAt).not.toBeNull();
    }

    await result.command.undo();
    for (const id of ['a', 'b', 'c']) {
      expect(useLibraryStore.getState().items.get(id)?.deletedAt).toBeNull();
    }
    expect(useLibraryStore.getState().items.has(result.item.id)).toBe(false);
  });

  it('needs at least two swatches', () => {
    setup();
    const { platform } = makePlatform();
    expect(createCombineIntoPaletteCommand(platform, ['a'])).toBeNull();
  });
});

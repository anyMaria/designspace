import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreateSwatchCommand, createExtractPaletteCommand } from './swatchCommands';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';

function makePlatform(): Platform {
  return {
    db: {
      select: vi.fn<Platform['db']['select']>().mockResolvedValue([]),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
}

function makeImageItem(id: string, palette: { hex: string; weight: number }[]): Item {
  return {
    id,
    kind: 'image',
    title: id,
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width: 100,
    height: 100,
    artist: null,
    sourceUrl: null,
    why: null,
    palette,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: null,
    viewedAt: null,
    status: 'ok',
    derivedV: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map() });
});

describe('createCreateSwatchCommand', () => {
  it('creates a swatch item + placement, and undo removes it', async () => {
    const platform = makePlatform();
    const { command, item } = createCreateSwatchCommand(platform, 'board-1', true, 400, 400);

    await command.do();
    const stored = useLibraryStore.getState().items.get(item.id);
    expect(stored?.kind).toBe('swatch');
    expect(stored?.color).toBe('#8c8c8c');
    expect(stored?.originBoardId).toBeNull();
    expect(useLibraryStore.getState().placements.get(item.id)?.boardId).toBe('board-1');

    await command.undo();
    expect(useLibraryStore.getState().items.has(item.id)).toBe(false);
  });

  it('sets originBoardId when created off the Library map', async () => {
    const platform = makePlatform();
    const { command, item } = createCreateSwatchCommand(platform, 'board-2', false, 0, 0);
    await command.do();
    expect(useLibraryStore.getState().items.get(item.id)?.originBoardId).toBe('board-2');
  });
});

describe('createExtractPaletteCommand', () => {
  it('merges palette weights across items and keeps the top colors', async () => {
    const platform = makePlatform();
    useLibraryStore.setState({
      items: new Map([
        [
          'a',
          makeImageItem('a', [
            { hex: '#e05a5a', weight: 0.6 },
            { hex: '#5a8fe0', weight: 0.4 },
          ]),
        ],
        [
          'b',
          makeImageItem('b', [
            { hex: '#e05a5a', weight: 0.5 }, // same red again — weights should merge
            { hex: '#efd05a', weight: 0.5 },
          ]),
        ],
      ]),
    });

    const { command, items } = createExtractPaletteCommand(platform, ['a', 'b'], 'board-1', true, {
      x: 0,
      y: 0,
    });
    await command.do();

    // One palette, not one swatch per colour. Only 3 distinct hexes fed in, so 3 colours come out
    // (the 5–8 target is a ceiling, not a floor); red had the highest combined weight.
    expect(items).toHaveLength(1);
    expect(items[0].swatchColors?.map((c) => c.hex)).toEqual(['#e05a5a', '#efd05a', '#5a8fe0']);
    expect(items[0].title).toBe('Palette from 2 items');
    expect(useLibraryStore.getState().items.get(items[0].id)?.kind).toBe('swatch');
    expect(useLibraryStore.getState().placements.get(items[0].id)).toMatchObject({ w: 216 });

    await command.undo();
    expect(useLibraryStore.getState().items.has(items[0].id)).toBe(false);
  });

  it('produces no swatches when the source items have no palette', () => {
    const platform = makePlatform();
    useLibraryStore.setState({ items: new Map([['a', makeImageItem('a', [])]]) });
    const { command, items } = createExtractPaletteCommand(platform, ['a'], 'board-1', true, {
      x: 0,
      y: 0,
    });
    expect(items).toHaveLength(0);
    expect(() => command.do()).not.toThrow();
  });
});

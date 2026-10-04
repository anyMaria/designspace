import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '@/platform/types';
import type { Item, Placement } from '@/state/types';
import { useLibraryStore } from '@/state/libraryStore';
import {
  createAddToFontCollectionCommand,
  createMakeFontCollectionCommand,
  createRemoveFromFontCollectionCommand,
  createReorderFontCollectionCommand,
} from './fontCollectionCommands';
import { createTrashCommand } from './itemCommands';

function platform(): Platform {
  return {
    db: {
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue({ changes: 1 }),
      batch: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
}

const item = (id: string): Item =>
  ({ id, kind: 'font', title: id, status: 'ok', fontCollection: null }) as unknown as Item;
const place = (id: string, x: number, y: number): Placement => ({
  boardId: 'lib',
  itemId: id,
  x,
  y,
  w: 320,
  h: 200,
  z: 1,
  frameId: null,
  cropX: null,
  cropY: null,
  parentId: null,
  addedAt: 'x',
});
const p = (id: string) => useLibraryStore.getState().placements.get(id);

beforeEach(() => {
  useLibraryStore.setState({
    items: new Map(['a', 'b', 'c'].map((id) => [id, item(id)])),
    placements: new Map([
      ['a', place('a', 100, 100)],
      ['b', place('b', 500, 100)],
      ['c', place('c', 900, 100)],
    ]),
    selection: new Set(),
  });
});

async function made() {
  const plat = platform();
  const result = createMakeFontCollectionCommand(plat, ['a', 'b']);
  if (!result) throw new Error('no command');
  await result.command.do();
  return { plat, id: result.id, command: result.command };
}

describe('type collection commands', () => {
  it('make: members get parent_id and row rects; undo restores their old rects', async () => {
    const { id, command } = await made();
    const col = p(id);
    expect(col).toMatchObject({ x: 100, y: 100, w: 360, h: 48 + 112 + 8 });
    expect(p('a')).toMatchObject({ parentId: id, x: 100, y: 148, w: 360, h: 56 });
    expect(p('b')).toMatchObject({ parentId: id, y: 204 });
    expect(useLibraryStore.getState().items.get(id)?.fontCollection?.ids).toEqual(['a', 'b']);

    await command.undo();
    expect(useLibraryStore.getState().items.has(id)).toBe(false);
    expect(p('a')).toMatchObject({ parentId: null, x: 100, y: 100, w: 320, h: 200 });
    expect(p('b')).toMatchObject({ parentId: null, x: 500 });
  });

  it('needs at least two families', () => {
    expect(createMakeFontCollectionCommand(platform(), ['a'])).toBeNull();
  });

  it('add appends a family and grows the collection', async () => {
    const { plat, id } = await made();
    const cmd = createAddToFontCollectionCommand(plat, id, ['c']);
    await cmd.do();
    expect(p(id)?.h).toBe(48 + 168 + 8);
    expect(p('c')).toMatchObject({ parentId: id, y: 260 });
    await cmd.undo();
    expect(p('c')).toMatchObject({ parentId: null, x: 900, h: 200 });
    expect(p(id)?.h).toBe(48 + 112 + 8);
  });

  it('remove frees the family below the collection; undo puts it back', async () => {
    const { plat, id } = await made();
    const cmd = createRemoveFromFontCollectionCommand(plat, id, 'a');
    await cmd.do();
    expect(p('a')).toMatchObject({ parentId: null, w: 320, h: 200 });
    expect(p('a')?.y).toBeGreaterThan((p(id)?.y ?? 0) + (p(id)?.h ?? 0));
    expect(p('b')).toMatchObject({ parentId: id, y: 148 });
    await cmd.undo();
    expect(p('a')).toMatchObject({ parentId: id, y: 148 });
  });

  it('reorder swaps the rows', async () => {
    const { plat, id } = await made();
    await createReorderFontCollectionCommand(plat, id, ['b', 'a']).do();
    expect(p('b')?.y).toBe(148);
    expect(p('a')?.y).toBe(204);
  });

  it('trashing a collection frees its families in the same step; undo re-attaches them', async () => {
    const { plat, id } = await made();
    const trash = createTrashCommand(plat, [id]);
    await trash.do();
    expect(p('a')?.parentId).toBeNull();
    expect(p('b')?.parentId).toBeNull();
    expect(useLibraryStore.getState().items.get('a')?.deletedAt ?? null).toBeNull();
    expect(useLibraryStore.getState().items.get(id)?.deletedAt).toBeTruthy();
    await trash.undo();
    expect(p('a')).toMatchObject({ parentId: id, y: 148 });
    expect(useLibraryStore.getState().items.get(id)?.deletedAt).toBeNull();
  });
});

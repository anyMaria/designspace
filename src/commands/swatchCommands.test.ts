import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreateSwatchCommand } from './swatchCommands';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';

function makePlatform(): Platform {
  return {
    db: {
      select: vi.fn<Platform['db']['select']>().mockResolvedValue([]),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
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

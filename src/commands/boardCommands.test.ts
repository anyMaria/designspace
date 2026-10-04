import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCreateBoardCommand,
  createRenameBoardCommand,
  createDuplicateBoardCommand,
  createDeleteBoardCommand,
  createRestoreBoardCommand,
  createBoardFromItemsCommand,
  createRemoveFromBoardCommand,
  createAddToBoardCommand,
  createDismissSuggestionCommand,
} from './boardCommands';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { rectsIntersect } from '@/lib/geometry';
import type { Platform } from '@/platform/types';
import type { Item, Placement } from '@/state/types';

function makePlacement(boardId: string, itemId: string): Placement {
  return {
    boardId,
    itemId,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 0,
    frameId: null,
    cropX: null,
    cropY: null,
    parentId: null,
    addedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeItem(id: string, width: number, height: number): Item {
  return {
    id,
    kind: 'image',
    title: id,
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width,
    height,
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
    derivedV: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

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
  useBoardStore.setState({ boards: new Map(), currentBoardId: null });
  useLibraryStore.setState({
    items: new Map([
      ['a', makeItem('a', 1600, 800)],
      ['b', makeItem('b', 800, 800)],
    ]),
    placements: new Map(),
  });
});

describe('createBoardFromItemsCommand', () => {
  it('lays out the given items in justified rows and saves the source filter', async () => {
    const platform = makePlatform();
    const filter = { text: 'autumn' };
    const { command, board } = createBoardFromItemsCommand(
      platform,
      ['a', 'b'],
      'From search',
      filter,
    );

    await command.do();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('From search');
    expect(platform.db.batch).toHaveBeenCalledTimes(1);
    const statements = (platform.db.batch as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      sql: string;
      params?: unknown[];
    }[];
    const boardInsert = statements[0];
    expect(boardInsert.sql).toContain('INSERT INTO boards');
    expect(boardInsert.params).toContain(JSON.stringify(filter));
    const placementInserts = statements.slice(1);
    expect(placementInserts).toHaveLength(2);
    for (const stmt of placementInserts) {
      expect(stmt.sql).toContain('INSERT INTO placements');
      expect(stmt.params?.[0]).toBe(board.id);
    }

    await command.undo();
    expect(useBoardStore.getState().boards.has(board.id)).toBe(false);
  });

  it('treats an item with no known dimensions as a square', async () => {
    const platform = makePlatform();
    useLibraryStore.setState({ items: new Map([['c', makeItem('c', 0, 0)]]) });
    const { command } = createBoardFromItemsCommand(platform, ['c'], 'Untitled board', null);

    await expect(command.do()).resolves.not.toThrow();
  });
});

describe('createCreateBoardCommand', () => {
  it('adds a board row and removes it on undo', async () => {
    const platform = makePlatform();
    const { command, board } = createCreateBoardCommand(platform, 'Moodboard 1');

    await command.do();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('Moodboard 1');
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO boards'),
      expect.arrayContaining([board.id, 'Moodboard 1']),
    );

    await command.undo();
    expect(useBoardStore.getState().boards.has(board.id)).toBe(false);
  });
});

describe('createRenameBoardCommand', () => {
  it('renames a board and restores the previous name on undo', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'Old name');
    await create.do();

    const rename = createRenameBoardCommand(platform, board.id, 'New name');
    await rename.do();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('New name');

    await rename.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('Old name');
  });
});

describe('createDuplicateBoardCommand', () => {
  it('creates a copy with its own id and removes it on undo', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'Original');
    await create.do();

    const { command, board: copy } = createDuplicateBoardCommand(
      platform,
      board.id,
      'Original copy',
    );
    await command.do();
    expect(copy.id).not.toBe(board.id);
    expect(useBoardStore.getState().boards.get(copy.id)?.name).toBe('Original copy');
    expect(platform.db.select).toHaveBeenCalledWith(expect.stringContaining('FROM placements'), [
      board.id,
    ]);

    await command.undo();
    expect(useBoardStore.getState().boards.has(copy.id)).toBe(false);
  });
});

describe('createRemoveFromBoardCommand', () => {
  it('deletes the placement (only), and undo re-inserts it exactly', async () => {
    const platform = makePlatform();
    useLibraryStore.setState({
      placements: new Map([
        ['a', makePlacement('board-1', 'a')],
        ['b', makePlacement('board-1', 'b')],
      ]),
    });

    const command = createRemoveFromBoardCommand(platform, 'board-1', ['a', 'b']);
    await command.do();
    expect(useLibraryStore.getState().placements.size).toBe(0);
    const statements = (platform.db.batch as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      sql: string;
      params?: unknown[];
    }[];
    expect(statements).toHaveLength(2);
    for (const stmt of statements) expect(stmt.sql).toContain('DELETE FROM placements');
    expect(statements.map((s) => s.params)).toEqual([
      ['board-1', 'a'],
      ['board-1', 'b'],
    ]);
    // The item itself is untouched — this isn't Trash.
    expect(useLibraryStore.getState().items.get('a')?.deletedAt).toBeNull();

    await command.undo();
    expect(useLibraryStore.getState().placements.get('a')?.boardId).toBe('board-1');
    expect(useLibraryStore.getState().placements.get('b')?.boardId).toBe('board-1');
  });

  it('ignores an id with no placement on this board', async () => {
    const platform = makePlatform();
    useLibraryStore.setState({ placements: new Map([['a', makePlacement('board-1', 'a')]]) });

    const command = createRemoveFromBoardCommand(platform, 'board-1', ['a', 'missing']);
    await expect(command.do()).resolves.not.toThrow();
    expect(useLibraryStore.getState().placements.size).toBe(0);
  });
});

describe('createAddToBoardCommand', () => {
  it('adds a placement sized from the item aspect ratio, and removes it on undo', async () => {
    const platform = makePlatform();
    const command = createAddToBoardCommand(platform, 'board-1', 'a', { x: 500, y: 500 });

    await command.do();
    const placement = useLibraryStore.getState().placements.get('a');
    expect(placement?.boardId).toBe('board-1');
    expect(placement?.w).toBe(320);
    expect(placement?.h).toBe(160); // item 'a' is 1600x800, aspect 2 → 320x160
    expect(platform.db.batch).toHaveBeenCalledWith([
      expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO placements') as string,
        params: expect.arrayContaining(['board-1', 'a']) as unknown[],
      }),
    ]);

    await command.undo();
    expect(useLibraryStore.getState().placements.has('a')).toBe(false);
    expect(platform.db.batch).toHaveBeenLastCalledWith([
      {
        sql: 'DELETE FROM placements WHERE board_id = ? AND item_id = ?',
        params: ['board-1', 'a'],
      },
    ]);
  });

  it('avoids landing on top of an already-occupied spot', async () => {
    const platform = makePlatform();
    useLibraryStore.setState({ placements: new Map([['b', makePlacement('board-1', 'b')]]) });

    const command = createAddToBoardCommand(platform, 'board-1', 'a', { x: 0, y: 0 });
    await command.do();
    const placement = useLibraryStore.getState().placements.get('a');
    expect(placement).toBeDefined();
    const occupied = useLibraryStore.getState().placements.get('b')!;
    expect(rectsIntersect(placement!, occupied)).toBe(false);
  });
});

describe('createDismissSuggestionCommand', () => {
  it('adds the item id to boards.settings.dismissedSuggestions, and undo removes it', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'Moodboard');
    await create.do();

    const dismiss = createDismissSuggestionCommand(platform, board.id, 'a');
    await dismiss.do();
    expect(useBoardStore.getState().boards.get(board.id)?.settings).toEqual({
      dismissedSuggestions: ['a'],
    });
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE boards SET settings'),
      expect.arrayContaining([JSON.stringify({ dismissedSuggestions: ['a'] }), board.id]),
    );

    await dismiss.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.settings).toBeNull();
  });

  it('preserves other settings and dedupes an already-dismissed id', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'Moodboard');
    await create.do();
    useBoardStore.setState((s) => {
      const current = s.boards.get(board.id)!;
      const boards = new Map(s.boards);
      boards.set(board.id, {
        ...current,
        settings: { background: 'dots', dismissedSuggestions: ['a'] },
      });
      return { boards };
    });

    const dismiss = createDismissSuggestionCommand(platform, board.id, 'a');
    await dismiss.do();
    expect(useBoardStore.getState().boards.get(board.id)?.settings).toEqual({
      background: 'dots',
      dismissedSuggestions: ['a'],
    });
  });
});

describe('createDeleteBoardCommand / createRestoreBoardCommand', () => {
  it('soft-deletes a board and undo brings it back', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'To trash');
    await create.do();

    const del = createDeleteBoardCommand(platform, board.id);
    await del.do();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).not.toBeNull();

    await del.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).toBeNull();
  });

  it('restore command clears deleted_at and undo re-deletes it', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'To trash');
    await create.do();
    await createDeleteBoardCommand(platform, board.id).do();

    const restore = createRestoreBoardCommand(platform, board.id);
    await restore.do();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).toBeNull();

    await restore.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).not.toBeNull();
  });
});
